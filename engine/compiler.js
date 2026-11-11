/**
 * 语义动作计划 → 参数轨道 IR（纯函数，主进程运行）。
 *
 * 只接收结构化 JSON，从不解析自然语言。校验规则对照 jingyu compiler.py：
 * 版本、动作数、时长、未知参数、物理输出只读、越界裁剪、同参数时间冲突。
 *
 * 参数约定（见 engine/model-profile.js）：
 * - 头部/身体动作写【物理输入侧】AngleX/Y/Z、PositionX/Y/Z；
 *   物理模拟再驱动输出侧 ParamAngle*、ParamBodyAngle*（那些是只读输出，直接写会被覆盖）。
 * - 眼珠 ParamEyeBallX/Y 不经物理，可直接写。
 * - 所有幅度都由模型参数范围（profile.allParameters 的 min/max）推导，不硬编码范围。
 */
'use strict'

const { bindArmTracks, ARM_JOINTS, ARM_KEYS, GESTURE_POSES } = require('./arm-binding')

const MAX_ACTIONS = 24
const MAX_DURATION = 60
const MAX_POSE_PARAMS = 8
const TAIL = 0.7
const CONFLICT_EPS = 0.015

class CompileError extends Error {
  constructor(message) {
    super(message)
    this.name = 'CompileError'
  }
}

const LOOK_DIRECTIONS = ['left', 'right', 'up', 'down', 'center']

/**
 * 每种 kind 的规格：
 * - param：主写入参数（输入侧）；look 的主参数是 ParamEyeBallX。
 * - ratio：幅度 = strength × ratio × 参数半幅（max(|min|,|max|)），最后仍被 min/max 裁剪。
 * - counted：是否支持 count（往返次数，整数 1..4，默认 2）。
 * - directions / defaultDirection：方向枚举。
 * 方向约定：left 取负值、right 取正值（AngleX 负=左、AngleZ 负=左，符号需在线上截图确认）。
 */
const KINDS = {
  look: {
    label: '看向',
    param: 'ParamEyeBallX',
    defaultDuration: 1.2,
    directions: LOOK_DIRECTIONS,
    defaultDirection: 'center',
    describe: '眼珠看向某方向并保持，结束后回到默认。参数：direction(left|right|up|down|center)，strength(0~1，默认0.8)',
  },
  nod: {
    label: '点头',
    param: 'AngleY',
    ratio: 0.35,
    defaultDuration: 2.5,
    minDuration: 0.6,
    maxDuration: 6,
    counted: true,
    defaultCount: 2,
    alternate: false,
    describe:
      '头部上下点头（AngleY 物理输入）。每次点头向下再回正。参数：count(1~4，默认2)，strength(0~1，默认0.8)，duration(0.6~6秒，默认2.5)',
  },
  shake_head: {
    label: '摇头',
    param: 'AngleX',
    ratio: 0.4,
    defaultDuration: 2.0,
    minDuration: 0.6,
    maxDuration: 6,
    counted: true,
    defaultCount: 2,
    alternate: true,
    describe:
      '头部左右摇头（AngleX 物理输入），每次往返先向左。参数：count(1~4，默认2)，strength(0~1，默认0.8)，duration(0.6~6秒，默认2.0)',
  },
  tilt: {
    label: '侧倾',
    param: 'AngleZ',
    ratio: 0.3,
    defaultDuration: 1.5,
    minDuration: 0.4,
    maxDuration: 6,
    directions: ['left', 'right'],
    defaultDirection: 'left',
    describe:
      '头部侧倾并保持后回正（AngleZ 物理输入）。参数：direction(left|right，默认left)，strength(0~1，默认0.8)，duration(0.4~6秒，默认1.5)',
  },
  pose: {
    label: '姿态',
    defaultDuration: 1.5,
    minDuration: 0.4,
    maxDuration: 6,
    describe:
      '保持一组绝对姿态后回到默认。参数：values({参数名: 数值}，最多8项，参数必须是下方列出的可写输入参数)，duration(0.4~6秒，默认1.5)，label(可选，中文短说明)',
  },
  gesture: {
    label: '手势',
    defaultDuration: 3,
    minDuration: 1.5,
    maxDuration: 6,
    gestures: ['index_finger', 'grass'],
    describe:
      '右臂手势：竖食指 index_finger 或 拿草 grass，入场→保持→收回。参数：gesture(index_finger|grass)，strength(0.3~1，默认1)，duration(1.5~6秒，默认3)。手势为合成轨道，不保证手掌精确到达某点。手臂联动（相对 rest 的修正）仅在 strength<1 时生效，默认 strength=1 时手臂按固定姿态输出，无联动修正',
  },
}

function finiteIn(value, name, low, high) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CompileError(`${name} 必须是有限数字`)
  }
  if (value < low || value > high) {
    throw new CompileError(`${name} 超出范围 ${low}..${high}`)
  }
  return value
}

const round = (value, digits) => Number(value.toFixed(digits))

function halfSpan(spec) {
  return Math.max(Math.abs(spec.min), Math.abs(spec.max))
}

function durationRange(spec) {
  return [spec.minDuration !== undefined ? spec.minDuration : 0.2, spec.maxDuration !== undefined ? spec.maxDuration : 6]
}

/** 可写输入参数：在模型参数表中、属于语义白名单、且不是物理输出。 */
function writableIds(profile) {
  const byId = new Set(profile.allParameters.map((p) => p.id))
  const physics = new Set(profile.physicsOutputIds || [])
  return (profile.primary || []).filter((id) => byId.has(id) && !physics.has(id))
}

/** 右臂手势可用：四条臂参数都可写，且 allParameters 给出了范围（缺失则不可用，不用默认范围）。 */
function armAvailable(profile) {
  const writable = new Set(writableIds(profile))
  const byId = new Map(profile.allParameters.map((p) => [p.id, p]))
  return ARM_KEYS.every((k) => writable.has(ARM_JOINTS[k]) && byId.has(ARM_JOINTS[k]))
}

/** 某个 kind 的主参数当前是否可写（pose 另按参数逐个校验，这里只看是否存在任何可写参数）。 */
function kindAvailable(kind, profile) {
  const spec = KINDS[kind]
  if (!spec) return false
  const writable = new Set(writableIds(profile))
  if (kind === 'pose') return writable.size > 0
  if (kind === 'gesture') return armAvailable(profile)
  return writable.has(spec.param)
}

function availableKinds(profile) {
  return Object.keys(KINDS).filter((kind) => kindAvailable(kind, profile))
}

/** 给规划器用：当前模型上可用动作的文字说明（带参数范围，范围来自模型参数表）。 */
function describeActions(profile) {
  const byId = new Map(profile.allParameters.map((p) => [p.id, p]))
  const range = (id) => {
    const p = byId.get(id)
    return `${id}∈[${p.min},${p.max}]`
  }
  const lines = []
  for (const kind of Object.keys(KINDS)) {
    if (!kindAvailable(kind, profile)) continue
    const spec = KINDS[kind]
    if (kind === 'pose') {
      const ids = writableIds(profile)
      lines.push(`- pose：${spec.describe}。可写参数：${ids.map(range).join('，')}`)
      continue
    }
    if (kind === 'gesture') {
      const arm = ARM_KEYS.map((k) => range(ARM_JOINTS[k])).join('，')
      lines.push(`- gesture：${spec.describe}。${arm}`)
      continue
    }
    const extra = kind === 'look' ? `，${range('ParamEyeBallY')}` : ''
    lines.push(`- ${kind}：${spec.describe}。${range(spec.param)}${extra}`)
  }
  return lines.join('\n')
}

/** 中间保持型：起点→目标→保持→回到基准，淡入淡出长度与 jingyu hold 一致。 */
function holdPoints(base, target, at, d) {
  const fade = Math.min(0.42, d * 0.28)
  return [
    [at, base],
    [at + fade, target],
    [at + d - fade, target],
    [at + d, base],
  ]
}

/** 往返型：每个周期 base → base+s·amp → base；alternate 时方向交替。 */
function oscillatePoints(base, amp, at, d, count, startSign, alternate) {
  const cycle = d / count
  const points = [[at, base]]
  for (let k = 0; k < count; k += 1) {
    const t0 = at + k * cycle
    const sign = alternate && k % 2 === 1 ? -startSign : startSign
    points.push([t0 + cycle * 0.5, base + sign * amp])
    points.push([t0 + cycle, base])
  }
  return points
}

/**
 * plan: {version:1, intent, summary, actions:[{kind, at, duration, strength, direction, count, values, label}]}
 * profile: model-profile.buildProfile() 的结果
 */
function compilePlan(plan, profile) {
  if (!plan || typeof plan !== 'object' || plan.version !== 1) {
    throw new CompileError('动作计划需要 version: 1')
  }
  const actions = plan.actions
  if (!Array.isArray(actions) || actions.length < 1 || actions.length > MAX_ACTIONS) {
    throw new CompileError(`actions 必须包含 1..${MAX_ACTIONS} 个动作`)
  }
  if (String(plan.intent || '').length > 2000 || String(plan.summary || '').length > 1000) {
    throw new CompileError('动作说明过长')
  }

  const byId = new Map(profile.allParameters.map((p) => [p.id, p]))
  const physics = new Set(profile.physicsOutputIds || [])
  const primary = new Set(profile.primary || [])
  const tracks = []
  const steps = []
  const warnings = new Set()

  function addTrack(pid, points, index, label) {
    if (!byId.has(pid)) throw new CompileError(`模型没有参数 ${pid}`)
    if (physics.has(pid)) throw new CompileError(`${pid} 归作者物理控制，不能直接驱动`)
    if (!primary.has(pid)) throw new CompileError(`${pid} 不是可写的语义参数`)
    const spec = byId.get(pid)
    const start = points[0][0]
    const end = points[points.length - 1][0]
    const clipped = points.map(([t, v]) => {
      const c = Math.max(spec.min, Math.min(spec.max, v))
      if (c !== v) warnings.add(`${pid} 已限制到模型范围`)
      return [round(t, 4), round(c, 6)]
    })
    for (const old of tracks) {
      if (old.id !== pid || old.action === index) continue
      const overlap = Math.min(old.start + old.duration, end) - Math.max(old.start, start)
      if (overlap > CONFLICT_EPS) {
        throw new CompileError(`动作 ${old.action + 1} 与 ${index + 1} 同时控制 ${pid}，请错开时间`)
      }
    }
    tracks.push({
      id: pid,
      start: round(start, 4),
      duration: round(end - start, 4),
      points: clipped,
      action: index,
      label,
      owner: 'semantic',
      stage: 'motion',
    })
  }

  actions.forEach((action, index) => {
    const n = index + 1
    if (!action || typeof action !== 'object') throw new CompileError(`动作 ${n} 不是对象`)
    const kind = action.kind
    const spec = Object.prototype.hasOwnProperty.call(KINDS, kind) ? KINDS[kind] : null
    if (!spec || !kindAvailable(kind, profile)) {
      throw new CompileError(`不支持动作 ${kind}；当前模型可用：${availableKinds(profile).join(' / ') || '无'}`)
    }
    const at = finiteIn(action.at === undefined ? 0 : action.at, `动作 ${n} at`, 0, MAX_DURATION)
    const [dMin, dMax] = durationRange(spec)
    const d = finiteIn(action.duration === undefined ? spec.defaultDuration : action.duration, `动作 ${n} duration`, dMin, dMax)
    const baseOf = (pid) => {
      const p = byId.get(pid)
      return p && Number.isFinite(p.default) ? p.default : 0
    }

    if (kind === 'pose') {
      const values = action.values
      if (!values || typeof values !== 'object' || Array.isArray(values)) {
        throw new CompileError(`动作 ${n} pose 需要 values 对象`)
      }
      const entries = Object.entries(values)
      if (entries.length < 1 || entries.length > MAX_POSE_PARAMS) {
        throw new CompileError(`动作 ${n} pose 的 values 需要 1..${MAX_POSE_PARAMS} 项`)
      }
      const label = typeof action.label === 'string' && action.label ? action.label.slice(0, 60) : spec.label
      for (const [pid, value] of entries) {
        const v = finiteIn(value, `动作 ${n} values.${pid}`, -Infinity, Infinity)
        addTrack(pid, holdPoints(baseOf(pid), v, at, d), index, label)
      }
      steps.push({ index, label, kind, start: round(at, 4), duration: round(d, 4) })
      return
    }

    if (kind === 'gesture') {
      // 右臂手势：入场 → 保持 → 收回，三段按 rest 值合成四条臂轨道。
      // 注意：jingyu 的 bind 作用于作者已有曲线；这里没有作者曲线，属于合成后的改编。
      const name = action.gesture
      if (!spec.gestures.includes(name)) {
        throw new CompileError(`动作 ${n} gesture 只能是 ${spec.gestures.join('/')}`)
      }
      const gStrength = finiteIn(action.strength === undefined ? 1 : action.strength, `动作 ${n} strength`, 0.3, 1)
      const rest = GESTURE_POSES[name]
      const limits = {}
      for (const k of ARM_KEYS) {
        const pid = ARM_JOINTS[k]
        const pspec = byId.get(pid)
        if (!pspec) throw new CompileError(`模型没有参数 ${pid}`)
        limits[pid] = { min: pspec.min, max: pspec.max }
      }
      // 保持段目标：rest 沿各关节按 strength 缩放偏离（相对 rest，不是绝对角度）。
      const fade = Math.min(0.5, d * 0.25)
      const series = {}
      for (const k of ARM_KEYS) {
        const pid = ARM_JOINTS[k]
        const b = baseOf(pid)
        const target = rest[k] * gStrength
        series[pid] = [
          [at, b],
          [at + fade, target],
          [at + d - fade, target],
          [at + d, b],
        ]
      }
      // 越界 warning：bindArmTracks 内部会先裁剪，若不在此记录，warning 会被吃掉（addTrack 只能看到已裁剪值）。
      for (const k of ARM_KEYS) {
        const pid = ARM_JOINTS[k]
        const { min, max } = limits[pid]
        if (series[pid].some(([, v]) => v < min || v > max)) warnings.add(`${pid} 已限制到模型范围`)
      }
      const joints = ARM_JOINTS
      const restByKey = {}
      for (const k of ARM_KEYS) restByKey[k] = rest[k]
      const arrTracks = ARM_KEYS.map((k) => ({ id: joints[k], points: series[joints[k]] }))
      // 保持段：[at+fade, at+d-fade]，交给 bindArmTracks 改写（它只改这一段）。
      bindArmTracks(arrTracks, joints, restByKey, at + fade, at + d - fade, limits)
      for (const k of ARM_KEYS) {
        addTrack(joints[k], arrTracks.find((x) => x.id === joints[k]).points, index, spec.label)
      }
      steps.push({ index, label: spec.label, kind, start: round(at, 4), duration: round(d, 4), gesture: name })
      return
    }

    const strength = finiteIn(action.strength === undefined ? 0.8 : action.strength, `动作 ${n} strength`, 0, 1)
    const direction = action.direction === undefined ? spec.defaultDirection : action.direction
    if (spec.directions && !spec.directions.includes(direction)) {
      throw new CompileError(`动作 ${n} direction 只能是 ${spec.directions.join('/')}`)
    }

    if (kind === 'look') {
      // look：只写眼珠。center 也要产生一条恒定轨道，保证 tracks 非空、时长可算。
      const vx = { left: -1, right: 1 }[direction] || 0
      const vy = { up: 1, down: -1 }[direction] || 0
      const target = (pid, offset) => {
        const b = baseOf(pid)
        return [
          [at, b],
          [at + 0.3 * d, b + offset],
          [at + 0.7 * d, b + offset],
          [at + d, b],
        ]
      }
      addTrack('ParamEyeBallX', target('ParamEyeBallX', vx * strength), index, spec.label)
      if (vy !== 0) addTrack('ParamEyeBallY', target('ParamEyeBallY', vy * strength), index, spec.label)
      else if (vx === 0) addTrack('ParamEyeBallY', target('ParamEyeBallY', 0), index, spec.label)
    } else {
      // 头部/身体：幅度 = strength × ratio × 参数半幅（来自模型参数表）
      const pspec = byId.get(spec.param)
      if (!pspec) throw new CompileError(`模型没有参数 ${spec.param}`)
      const amp = strength * spec.ratio * halfSpan(pspec)
      const base = baseOf(spec.param)
      if (kind === 'tilt') {
        const sign = direction === 'left' ? -1 : 1
        addTrack(spec.param, holdPoints(base, base + sign * amp, at, d), index, spec.label)
      } else {
        // nod / shake_head：count 次往返
        let count = spec.defaultCount
        if (action.count !== undefined) {
          count = finiteIn(action.count, `动作 ${n} count`, 1, 4)
          if (!Number.isInteger(count)) throw new CompileError(`动作 ${n} count 必须是整数`)
        }
        // 起手统一为负向：nod 为 AngleY 负（向下，待线上截图确认符号）；shake_head 为 AngleX 负（先向左）
        const START_SIGN = -1
        addTrack(
          spec.param,
          oscillatePoints(base, amp, at, d, count, START_SIGN, spec.alternate),
          index,
          spec.label,
        )
      }
    }

    steps.push({ index, label: spec.label, kind, start: round(at, 4), duration: round(d, 4) })
  })

  const end = Math.max(...tracks.map((t) => t.start + t.duration))
  const duration = round(end + TAIL, 4)
  if (duration > MAX_DURATION) throw new CompileError(`动作总长不可超过 ${MAX_DURATION} 秒`)

  return {
    version: 1,
    driverVersion: '1.0.0',
    intent: String(plan.intent || ''),
    summary: String(plan.summary || ''),
    duration,
    tracks,
    steps,
    warnings: [...warnings].sort(),
    policy: { returnToIdle: true, physics: 'author-controlled', easing: 'smoothstep' },
  }
}

module.exports = {
  compilePlan,
  describeActions,
  availableKinds,
  kindAvailable,
  CompileError,
  KINDS,
  MAX_ACTIONS,
  MAX_DURATION,
}
