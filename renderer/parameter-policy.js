(function (root, factory) {
  'use strict'
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.PetParameterPolicy = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  const VERSION = 1
  const CHARACTER = 'DeepSeek免费公皮'
  const ROLES = Object.freeze({
    headX: 'AngleX', headY: 'AngleY', headZ: 'AngleZ', bodyX: 'PositionX',
    eyeX: 'ParamEyeBallX', eyeY: 'ParamEyeBallY',
  })
  const DRIVER_MAP = Object.freeze({
    ParamAngleX: 'AngleX', ParamAngleY: 'AngleY', ParamAngleZ: 'AngleZ',
    ParamBodyAngleX: 'PositionX',
  })
  const APPROVED_MOTIONS = new Set(['张望', '打招呼', '伸懒腰'])
  const HEAD_MAP = Object.freeze({ ParamAngleX: 'AngleX', ParamAngleY: 'AngleY', ParamAngleZ: 'AngleZ' })
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  const finite = value => typeof value === 'number' && Number.isFinite(value)
  const parametersOf = catalog => Array.isArray(catalog) ? catalog
    : catalog && Array.isArray(catalog.params) ? catalog.params : []
  const idFrom = ref => ref && ref.Target === 'Parameter' && typeof ref.Id === 'string' ? ref.Id : null
  const validRange = p => p && finite(p.min) && finite(p.max) && finite(p.default)
    && p.min < p.max && p.default >= p.min && p.default <= p.max

  /** Build an inspectable, model-specific write policy from real moc ranges and physics3 JSON. */
  function buildCatalog(rawTable, physicsJson, options = {}) {
    const settings = physicsJson && Array.isArray(physicsJson.PhysicsSettings) ? physicsJson.PhysicsSettings : []
    const inputs = new Set()
    const outputs = new Set()
    const dependencies = new Map()
    for (const setting of settings) {
      const sources = (Array.isArray(setting.Input) ? setting.Input : []).map(i => idFrom(i.Source)).filter(Boolean)
      for (const id of sources) inputs.add(id)
      for (const output of (Array.isArray(setting.Output) ? setting.Output : [])) {
        const id = idFrom(output.Destination)
        if (!id) continue
        outputs.add(id)
        if (!dependencies.has(id)) dependencies.set(id, new Set())
        for (const source of sources) dependencies.get(id).add(source)
      }
    }
    const params = (Array.isArray(rawTable) ? rawTable : []).filter(p => p && typeof p.id === 'string').map(p => ({
      ...p,
      physicsInput: inputs.has(p.id),
      physicsOutput: outputs.has(p.id),
      // An input/output intersection is still physics-owned. A partial physics weight is not
      // permission for generic controls to compete with the solver.
      writable: !outputs.has(p.id),
      dependencies: [...(dependencies.get(p.id) || [])],
      suggestedDriver: null,
    }))
    const byId = new Map(params.map(p => [p.id, p]))
    const bindings = {}
    if (options.characterId === CHARACTER) {
      for (const [role, id] of Object.entries(ROLES)) {
        const parameter = byId.get(id)
        if (parameter && parameter.writable && validRange(parameter)) bindings[role] = id
      }
      for (const p of params) {
        const driver = DRIVER_MAP[p.id]
        const input = byId.get(driver)
        if (driver && p.physicsOutput && p.dependencies.includes(driver)
          && input && input.writable && validRange(input)) p.suggestedDriver = driver
      }
    }
    return {
      params, bindings,
      characterId: options.characterId || null,
      parameterPolicyVersion: VERSION,
      stats: {
        parameterCount: params.length,
        physicsSettingCount: settings.length,
        physicsInputCount: params.filter(p => p.physicsInput).length,
        physicsOutputCount: params.filter(p => p.physicsOutput).length,
        physicsBothCount: params.filter(p => p.physicsInput && p.physicsOutput).length,
        writableCount: params.filter(p => p.writable).length,
      },
    }
  }

  /** Strict, atomic validation. Null releases ownership, including physics-owned IDs. */
  function validateSet(set, catalogOrParams) {
    const fail = (status, errors) => ({ ok: false, status, errors, set: {} })
    if (!isRecord(set) || Object.keys(set).length === 0) {
      return fail(400, [{ id: null, code: 'invalid_set', message: 'set 必须是非空参数对象。' }])
    }
    const byId = new Map(parametersOf(catalogOrParams).map(p => [p.id, p]))
    const errors = []
    for (const [id, value] of Object.entries(set)) {
      const parameter = byId.get(id)
      if (!parameter) {
        errors.push({ id, code: 'unknown_parameter', message: '模型中不存在此参数。' })
      } else if (value === null) {
        // Release is intentionally valid for output parameters so legacy overrides can be removed.
      } else if (!finite(value)) {
        errors.push({ id, code: 'invalid_value', message: '参数值必须是有限数字，或用 null 释放控制。' })
      } else if (parameter.physicsOutput || parameter.writable === false) {
        errors.push({ id, code: 'physics_output', message: '此参数由物理系统计算，请控制建议的驱动参数。',
          suggestedDriver: parameter.suggestedDriver || null })
      } else if (!finite(parameter.min) || !finite(parameter.max) || value < parameter.min || value > parameter.max) {
        errors.push({ id, code: 'out_of_range', message: '参数值超出模型声明的范围。', min: parameter.min, max: parameter.max })
      }
    }
    if (errors.length) return fail(errors.some(error => error.code !== 'physics_output') ? 400 : 422, errors)
    return { ok: true, status: 200, errors: [], set: Object.fromEntries(Object.entries(set)) }
  }

  /** Return all VALUE slots of a Cubism motion segment array; never include time/type slots. */
  function segmentValueIndices(segments) {
    if (!Array.isArray(segments) || segments.length < 2 || !segments.every(finite)) return null
    const indices = [1]
    let cursor = 2
    while (cursor < segments.length) {
      const kind = segments[cursor]
      const length = kind === 1 ? 7 : (kind === 0 || kind === 2 || kind === 3 ? 3 : 0)
      if (!length || cursor + length > segments.length) return null
      for (let offset = 2; offset < length; offset += 2) indices.push(cursor + offset)
      cursor += length
    }
    return indices
  }

  // Preserve the neutral point and each side's actual moc range. Bezier control values are
  // intentionally not clamped: clamping their handles would change the exported curve shape.
  function mapValue(value, source, target) {
    if (value === source.default) return target.default
    const sourceSpan = value > source.default ? source.max - source.default : source.default - source.min
    const targetSpan = value > source.default ? target.max - target.default : target.default - target.min
    if (sourceSpan === 0) return target.default
    return target.default + ((value - source.default) / sourceSpan) * targetSpan
  }

  /** Adapt only approved head curves in memory; body Y/Z are deliberately left uncalibrated. */
  function adaptMotion(motionJson, catalog, options = {}) {
    const json = JSON.parse(JSON.stringify(motionJson))
    const changes = []
    const warnings = []
    const curves = json && Array.isArray(json.Curves) ? json.Curves : []
    const name = String(options.name || '').split(/[\\/]/).pop().replace(/\.motion3(?:\.json)?$/i, '')
    const byId = new Map(parametersOf(catalog).map(p => [p.id, p]))
    const parameterCurves = curves.filter(c => c.Target === 'Parameter')
    const counts = new Map()
    for (const curve of parameterCurves) counts.set(curve.Id, (counts.get(curve.Id) || 0) + 1)
    const approved = APPROVED_MOTIONS.has(name) && catalog && catalog.characterId === CHARACTER
    for (let curveIndex = 0; curveIndex < curves.length; curveIndex++) {
      const curve = curves[curveIndex]
      if (curve.Target !== 'Parameter') continue
      const from = curve.Id
      if (approved && (from === 'ParamBodyAngleY' || from === 'ParamBodyAngleZ')) {
        warnings.push({ code: 'uncalibrated_body_curve', curveIndex, from,
          message: '身体 Y/Z 为多输入物理通道，未标定；保留原曲线，物理系统可能覆盖其值。' })
      }
      const to = HEAD_MAP[from]
      if (!approved || !to) continue
      const source = byId.get(from)
      const target = byId.get(to)
      const warn = (code, message) => warnings.push({ code, curveIndex, from, to, message })
      if (counts.has(to) || counts.get(from) > 1) {
        warn('driver_collision', '已有目标驱动曲线或重复源曲线；不自动合并或覆盖。')
        continue
      }
      if (!source || !target || target.writable === false || target.physicsOutput
        || !source.physicsOutput || source.suggestedDriver !== to) {
        warn('unverified_driver', '模型未确认该物理输出到可写输入的绑定；保留原曲线。')
        continue
      }
      if (!validRange(source) || !validRange(target)) {
        warn('invalid_parameter_range', '源或目标的真实模型范围无效；保留原曲线。')
        continue
      }
      const valueIndices = segmentValueIndices(curve.Segments)
      if (!valueIndices) {
        warn('invalid_segments', '动作段结构无效或含非有限数值；保留原曲线。')
        continue
      }
      curve.Id = to
      for (const index of valueIndices) curve.Segments[index] = mapValue(curve.Segments[index], source, target)
      changes.push({ curveIndex, from, to })
    }
    return { json, changes, warnings,
      parameterIds: [...new Set(curves.filter(c => c.Target === 'Parameter').map(c => c.Id))] }
  }

  return Object.freeze({ parameterPolicyVersion: VERSION, buildCatalog, validateSet, adaptMotion })
})
