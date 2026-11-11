'use strict'
const path = require('node:path')
const { createPersonaStore } = require('./persona-store')
const { validatePersona } = require('./persona-schema')
const clone = value => JSON.parse(JSON.stringify(value))
function fields(body, names) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(body))) return false
  const descriptors = Object.getOwnPropertyDescriptors(body)
  return Reflect.ownKeys(descriptors).length === names.length && Reflect.ownKeys(descriptors).every(key =>
    typeof key === 'string' && names.includes(key) && descriptors[key].enumerable && Object.hasOwn(descriptors[key], 'value'))
}
const revision = value => Number.isSafeInteger(value) && value >= 0
function createPersonaService({ root, legacy = {}, beforeChange = () => {}, store: suppliedStore } = {}) {
  let store, snapshot = null, locked = false
  const legacyWarnings = []
  const previous = Object.fromEntries(['chat', 'autonomy'].map(key => {
    const value = legacy?.[key]
    if (typeof value !== 'string') return [key, null]
    if (value.length > 20000) {
      legacyWarnings.push(key === 'chat'
        ? '旧聊天设定超过显示上限（20,000 个 UTF-16 单位），未加载；未截断或改写旧文件。'
        : '旧自主人设超过显示上限（20,000 个 UTF-16 单位），未加载；未截断或改写旧文件。')
      return [key, null]
    }
    return [key, value]
  }))
  try { store = suppliedStore || createPersonaStore(path.join(root, '_private', 'persona.json')); snapshot = store.read() }
  catch { locked = true }
  function getSnapshot() {
    if (locked || !snapshot) { const error = new Error('人设存储不可用，请检查本地存储后重试'); error.code = 'PERSONA_UNAVAILABLE'; throw error }
    return clone({ revision: snapshot.revision, persona: snapshot.persona })
  }
  function state() {
    return { ok: !locked && !!snapshot, revision: snapshot?.revision ?? null,
      persona: locked ? null : clone(snapshot?.persona ?? null), history: clone(snapshot?.history || []),
      persisted: snapshot?.exists === true, legacy: { ...previous }, legacyWarnings: [...legacyWarnings],
      ...(locked ? { status: 503, error: '人设存储不可用；不会使用默认值覆盖损坏内容' } : {}) }
  }
  function failure(status, error) { return { ...state(), ok: false, status, error } }
  function change(kind, body) {
    const allowed = kind === 'save' ? ['expectedRevision', 'persona'] : kind === 'rollback'
      ? ['expectedRevision', 'targetRevision'] : ['expectedRevision']
    if (!fields(body, allowed) || !revision(body.expectedRevision)
      || (kind === 'rollback' && !revision(body.targetRevision))) return failure(400, '人设请求格式无效')
    if (locked || !snapshot) return failure(503, '人设存储不可用；未执行写入')
    if (body.expectedRevision !== snapshot.revision) return failure(409, '人设版本已变化，请刷新后重试')
    let next
    try { if (kind === 'save') next = validatePersona(body.persona) }
    catch { return failure(400, '人设格式无效；未执行写入') }
    try {
      // Always cancel *both* manual and autonomous work before persistence. On
      // any subsequent write failure the prior snapshot survives, but stays stopped.
      beforeChange()
      const saved = kind === 'save' ? store.commit(next, body.expectedRevision)
        : kind === 'rollback' ? store.rollback(body.targetRevision, body.expectedRevision) : store.reset(body.expectedRevision)
      snapshot = saved
      return state()
    } catch (error) {
      if (error?.code === 'PERSONA_CONFLICT') {
        try { snapshot = store.read() } catch { locked = true }
        return failure(409, '人设版本已变化，请刷新后重试')
      }
      if (['PERSONA_CORRUPT', 'PERSONA_UNSAFE_PATH'].includes(error?.code)) locked = true
      if (error?.code === 'PERSONA_BUSY') return failure(409, '另一个保存正在进行，或上次异常退出留下锁；未改动现有版本')
      if (['PERSONA_INVALID', 'PERSONA_REVISION_NOT_FOUND'].includes(error?.code)) return failure(400, '人设或目标版本无效')
      return failure(locked ? 503 : 500, '人设保存未完成；未切换运行人设，运行保持停止')
    }
  }
  return { getSnapshot, state, clearLegacy() { previous.chat = previous.autonomy = null; legacyWarnings.length = 0; return state() }, save: body => change('save', body), reset: body => change('reset', body), rollback: body => change('rollback', body) }
}
module.exports = { createPersonaService }
