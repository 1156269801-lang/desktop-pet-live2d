'use strict'
const path = require('node:path')
const crypto = require('node:crypto')
const { endpoint } = require('./director-provider')
const { validateEntry, isSensitiveText, MAX_ENTRIES } = require('./memory-schema')
const { createMemoryStore } = require('./memory-store')
const { queryKinds, selectMemories } = require('./memory-query')
const { createMemoryLibraryService } = require('./memory-library-service')

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const clone = value => JSON.parse(JSON.stringify(value))
const revision = value => Number.isSafeInteger(value) && value >= 0
const limits = Object.freeze({ maxEntries: 40, maxTextChars: 200, maxLifetimeIds: 256, maxWritableLifetimeIds: 216, maxImportance: 3 })
function exact(value, fields, required = fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false
  const properties = Object.getOwnPropertyDescriptors(value)
  return Reflect.ownKeys(properties).every(key => typeof key === 'string' && fields.includes(key)
    && properties[key].enumerable && Object.hasOwn(properties[key], 'value'))
    && required.every(key => Object.hasOwn(properties, key))
}
function destinationFor(config) {
  try {
    if (config?.enabled !== true || config?.allowRemote !== true || typeof config.model !== 'string'
      || !config.model.trim() || config.model.length > 128 || /[\r\n\u0000-\u001f]/.test(config.model)) throw Error()
    const normalized = endpoint(config.baseURL).replace(/\/chat\/completions$/, '')
    const origin = new URL(normalized).origin, model = config.model.trim()
    return { configured: true, label: origin + ' · ' + model,
      id: crypto.createHash('sha256').update(JSON.stringify({ baseURL: normalized, model })).digest('hex') }
  } catch { return { configured: false, label: '未配置已授权的模型服务', id: null } }
}

const MESSAGES = Object.freeze({
  MEMORY_INVALID: '记忆格式无效，请检查字段和长度。',
  MEMORY_SENSITIVE: '这条内容疑似包含敏感信息，不能保存为记忆。',
  MEMORY_CONFLICT: '记忆已变化，请刷新后重新确认。',
  MEMORY_CORRUPT: '记忆存储损坏或缺少删除账本，已停止使用；不会用空白覆盖。',
  MEMORY_UNSAFE_PATH: '记忆存储路径不安全，已停止使用。',
  MEMORY_IO_ERROR: '记忆保存失败，未报告成功；请检查本地存储。',
  MEMORY_ENCRYPTION_ERROR: '记忆加密失败，不会降级为明文保存。',
  MEMORY_BUSY: '另一个保存正在进行，或上次异常退出留下锁；未强行清除锁。',
  MEMORY_LIMIT: '记忆数量、大小或累计记录上限已达到。',
  MEMORY_CLEANUP_PENDING: '删除已经生效，但存储清理尚未完成；请刷新重试。',
  MEMORY_DESTINATION_UNAVAILABLE: '请先配置并明确授权模型服务，再允许此记忆用于聊天。',
  MEMORY_DESTINATION_CHANGED: '模型服务目的地已变化，请重新查看目的地后再次确认。',
  MEMORY_NOT_FOUND: '该记忆已不存在，请刷新后重试。',
  MEMORY_NAME_EXISTS: '已有一个称呼，请编辑原有称呼，不要同时保存两个称呼。',
})
const failure = code => Object.assign(Error(MESSAGES[code] || MESSAGES.MEMORY_IO_ERROR), { code })
function createMemoryService({ root, getDestination = () => ({}), beforeChange = () => {}, store: suppliedStore, libraryStore,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let store, snapshot = null, timer = null, stopped = false, lastCode = null
  const destination = () => destinationFor(getDestination())
  const library = createMemoryLibraryService({ root, store: libraryStore, getDestination: destination, beforeChange, now, setTimer, clearTimer })
  function schedule(retry = false) {
    if (timer !== null) clearTimer(timer)
    timer = null
    if (stopped) return
    const expiry = (snapshot?.entries || []).filter(e => e.expiresAt !== null).map(e => Date.parse(e.expiresAt))
    if (!retry && !expiry.length) return
    const delay = retry ? 60000 : Math.max(1, Math.min(2147483647, Math.min(...expiry) - now()))
    timer = setTimer(() => { timer = null; try { refresh() } catch {} }, delay)
    timer?.unref?.()
  }
  function refresh() {
    try {
      if (!store) throw failure(lastCode || 'MEMORY_IO_ERROR')
      snapshot = store.read()
      const active = snapshot.entries.filter(entry => entry.expiresAt === null || Date.parse(entry.expiresAt) > now())
      if (snapshot.cleanupPending || active.length !== snapshot.entries.length) {
        beforeChange()
        try { snapshot = store.commit(active, snapshot.revision) }
        catch (error) {
          if (error.code === 'MEMORY_CLEANUP_PENDING') snapshot = store.read()
          throw error
        }
      }
      lastCode = null; schedule(); return snapshot
    } catch (error) {
      lastCode = Object.hasOwn(MESSAGES, error?.code) ? error.code : 'MEMORY_IO_ERROR'
      schedule(lastCode === 'MEMORY_CLEANUP_PENDING' || (snapshot?.entries || []).some(e => e.expiresAt !== null && Date.parse(e.expiresAt) <= now()))
      throw failure(lastCode)
    }
  }
  function view(ok = true, code = null) {
    const publicCode = Object.hasOwn(MESSAGES, code) ? code : 'MEMORY_IO_ERROR'
    // Failed reads must never expose a stale pre-deletion snapshot.
    const entries = ok || code === 'MEMORY_CLEANUP_PENDING'
      ? (snapshot?.entries || []).filter(e => e.expiresAt === null || Date.parse(e.expiresAt) > now()) : []
    return { ok, revision: snapshot?.revision ?? null, entries: clone(entries), deletedCount: snapshot?.deletedCount || 0,
      cleanupPending: code === 'MEMORY_CLEANUP_PENDING' || snapshot?.cleanupPending === true,
      // Settings-only metadata: legacy entries stay manageable but are never recalled.
      blockedEntryIds: entries.filter(entry => isSensitiveText(entry.text)).map(entry => entry.id),
      destination: destination(), limits: { ...limits,
        availableConfirmations: Math.max(0, 216 - ((snapshot?.entries.length || 0) + (snapshot?.deletedCount || 0))) }, ...(ok ? {} : {
        status: ['MEMORY_CONFLICT', 'MEMORY_BUSY', 'MEMORY_CLEANUP_PENDING', 'MEMORY_DESTINATION_CHANGED'].includes(publicCode) ? 409
          : ['MEMORY_INVALID', 'MEMORY_SENSITIVE', 'MEMORY_LIMIT', 'MEMORY_DESTINATION_UNAVAILABLE', 'MEMORY_NOT_FOUND', 'MEMORY_NAME_EXISTS'].includes(publicCode) ? 400 : 503,
        code: publicCode, error: MESSAGES[publicCode] }) }
  }
  function state() { try { refresh(); return view() } catch { return view(false, lastCode) } }
  function write(entries, expectedRevision) {
    beforeChange()
    try { snapshot = store.commit(entries, expectedRevision); lastCode = null; schedule(); return view() }
    catch (error) {
      const code = Object.hasOwn(MESSAGES, error?.code) ? error.code : 'MEMORY_IO_ERROR'
      // A ledger-first failure may already have committed deletion and revision.
      try { snapshot = store.read() } catch { snapshot = null }
      lastCode = code; schedule(code === 'MEMORY_CLEANUP_PENDING')
      return view(false, code)
    }
  }
  function mutate(kind, body) {
    const fields = kind === 'save' ? ['expectedRevision', 'draft', 'replaceId', 'expectedDestinationId']
      : kind === 'delete' ? ['expectedRevision', 'id'] : ['expectedRevision']
    const required = kind === 'save' ? ['expectedRevision', 'draft'] : fields
    if (!exact(body, fields, required) || !revision(body.expectedRevision)
      || (kind === 'delete' && (typeof body.id !== 'string' || !UUID.test(body.id)))
      || (Object.hasOwn(body, 'replaceId') && (typeof body.replaceId !== 'string' || !UUID.test(body.replaceId)))) return view(false, 'MEMORY_INVALID')
    try { refresh() } catch { return view(false, lastCode) }
    if (body.expectedRevision !== snapshot.revision) return view(false, 'MEMORY_CONFLICT')
    let entries = clone(snapshot.entries)
    if (kind === 'clear') return write([], snapshot.revision)
    if (kind === 'delete') {
      if (!entries.some(e => e.id === body.id)) return view(false, 'MEMORY_NOT_FOUND')
      return write(entries.filter(e => e.id !== body.id), snapshot.revision)
    }
    const stamp = new Date(now()).toISOString()
    if (kind === 'revoke') {
      if (!entries.some(entry => entry.useInChat)) { beforeChange(); return view() }
      entries = entries.map(entry => entry.useInChat ? { ...entry, id: crypto.randomUUID(),
        source: { kind: 'user-confirmed-settings', id: crypto.randomUUID() },
        confirmedAt: new Date(Math.max(now(), Date.parse(entry.confirmedAt))).toISOString(),
        useInChat: false, destinationId: null, supersedesId: entry.id } : entry)
      return write(entries, snapshot.revision)
    }
    const draft = body.draft
    if (!exact(draft, ['kind', 'text', 'pinned', 'ttlDays', 'useInChat', 'importance'], ['kind', 'text', 'pinned', 'ttlDays', 'useInChat']) || !['name', 'preference', 'interest'].includes(draft.kind)
      || typeof draft.text !== 'string' || typeof draft.pinned !== 'boolean' || typeof draft.useInChat !== 'boolean'
      || ![1, 7, 30, 90].includes(draft.ttlDays) || (draft.importance !== undefined && (!Number.isInteger(draft.importance) || draft.importance < 0 || draft.importance > 3))) return view(false, 'MEMORY_INVALID')
    const target = destination()
    if (draft.useInChat ? (typeof body.expectedDestinationId !== 'string' || !/^[a-f0-9]{64}$/.test(body.expectedDestinationId))
      : (Object.hasOwn(body, 'expectedDestinationId') && body.expectedDestinationId !== null)) return view(false, 'MEMORY_INVALID')
    if (draft.useInChat && !target.configured) return view(false, 'MEMORY_DESTINATION_UNAVAILABLE')
    if (draft.useInChat && body.expectedDestinationId !== target.id) return view(false, 'MEMORY_DESTINATION_CHANGED')
    const old = Object.hasOwn(body, 'replaceId') ? entries.find(e => e.id === body.replaceId) : null
    if (Object.hasOwn(body, 'replaceId') && !old) return view(false, 'MEMORY_NOT_FOUND')
    if (draft.kind === 'name' && entries.some(entry => entry.kind === 'name' && entry.id !== old?.id)) return view(false, 'MEMORY_NAME_EXISTS')
    // Reserve forty IDs so withdrawal can retain every active entry at the cap.
    if (entries.length + snapshot.deletedCount >= 216) return view(false, 'MEMORY_LIMIT')
    if (!old && entries.length >= MAX_ENTRIES) return view(false, 'MEMORY_LIMIT')
    let entry
    try { entry = validateEntry({ schemaVersion: 2, id: crypto.randomUUID(), kind: draft.kind, text: draft.text, importance: draft.importance ?? 1,
      source: { kind: 'user-confirmed-settings', id: crypto.randomUUID() }, createdAt: stamp, confirmedAt: stamp,
      expiresAt: draft.pinned ? null : new Date(now() + draft.ttlDays * 86400000).toISOString(), pinned: draft.pinned,
      useInChat: draft.useInChat, destinationId: draft.useInChat ? target.id : null, supersedesId: old?.id || null }) }
    catch (error) { return view(false, error.code) }
    return write([...entries.filter(e => e.id !== old?.id), entry], snapshot.revision)
  }
  function retrieve(text) {
    if (!queryKinds(text).length) return null
    refresh()
    const eligible = snapshot.entries.filter(entry => !isSensitiveText(entry.text))
    const possibleLibrary = queryKinds(text).some(kind => kind !== 'name')
    const libraryResult = possibleLibrary ? library.retrieveNodes() : null
    const target = destination(), selected = selectMemories([...eligible, ...(libraryResult?.entries || [])], text, { destinationId: target.id, now: now() })
    return { revision: snapshot.revision, libraryRevision: libraryResult?.revision ?? null, destinationId: target.id,
      entries: selected.map(({ kind, text: fact }) => ({ kind, text: fact })),
      expiresAt: selected.reduce((next, e) => e.expiresAt === null ? next : Math.min(next, Date.parse(e.expiresAt)), Infinity) }
  }
  function valid(value) {
    if (value === null) return true
    try { refresh(); return snapshot.revision === value.revision && (value.libraryRevision == null || library.valid(value.libraryRevision)) && destination().id === value.destinationId
      && now() < value.expiresAt } catch { return false }
  }
  try { store = suppliedStore || createMemoryStore(path.join(root, '_private', 'memory.json')); refresh() }
  catch (error) { lastCode = Object.hasOwn(MESSAGES, error?.code) ? error.code : 'MEMORY_IO_ERROR' }
  return { state, save: body => mutate('save', body), delete: body => mutate('delete', body),
    clear: body => mutate('clear', body), revoke: body => mutate('revoke', body), retrieve, valid,
    libraryState: library.libraryState, addEvent: library.addEvent, previewConsolidation: library.previewConsolidation,
    confirmConsolidation: library.confirmConsolidation, deleteSource: library.deleteSource, suggest: library.suggest,
    resolveSuggestion: library.resolveSuggestion, setLibraryAuthorization: library.setLibraryAuthorization, revokeLibrary: library.revokeLibrary,
    takeLocalPresentation: library.takeLocalPresentation,
    shutdown() { stopped = true; library.shutdown(); if (timer !== null) clearTimer(timer); timer = null } }
}
module.exports = { createMemoryService, destinationFor }
