'use strict'
const path = require('node:path')
const crypto = require('node:crypto')
const { createVault } = require('./secret-vault')
const { endpoint, requestPlan } = require('./director-provider')
const contract = require('../renderer/director-contract')
const { createAutonomous } = require('./autonomous-director')
const { createPersonaService } = require('./persona-service')
const { createMemoryService } = require('./memory-service')
const { buildContext, allowsAppearance } = require('./context-builder')
const { createBudget } = require('./autonomy-budget')
const { createSharedPersona } = require('./shared-persona')
const { createManualScene } = require('./manual-scene')
const DEFAULTS = { enabled: false, baseURL: '', model: '', allowRemote: false, allowDiagnostics: false, tokenizerProfile: 'conservative', contextTokens: 32768 }
function createDirector({ root, config, saveConfig, getCapabilities, getDisplays, getWindow, getSettingsWindow, getSettingsUrl, send, ipcMain, sense, senseManual, autonomyClock, legacyPersona }) {
  const stored = config.director || {}
  config.director = { ...DEFAULTS }
  if (['conservative', 'deepseek-v4'].includes(stored.tokenizerProfile)) config.director.tokenizerProfile = stored.tokenizerProfile
  if (Number.isInteger(stored.contextTokens) && stored.contextTokens >= 4096 && stored.contextTokens <= 1048576) config.director.contextTokens = stored.contextTokens
  for (const key of ['enabled', 'allowRemote', 'allowDiagnostics']) config.director[key] = stored[key] === true
  if (typeof stored.model === 'string' && stored.model.length <= 128 && !/[\r\n]/.test(stored.model)) config.director.model = stored.model.trim()
  if (typeof stored.baseURL === 'string' && stored.baseURL.length <= 1000) { try { if (stored.baseURL) endpoint(stored.baseURL); config.director.baseURL = stored.baseURL.trim() } catch {} }
  const vault = createVault(path.join(root, '_private', 'secrets.json'))
  let running = null, pending = null, generation = 0, currentRequestId = null
  const waiters = new Map()
  function capabilities() {
    const c = getCapabilities()
    return contract.buildCapabilities({ characterId: c?.character?.id, characterRevision: c?.characterRevision, params: c?.params || [], motions: c?.motions || [], expressions: c?.expressions || [], displays: getDisplays() })
  }
  function state() {
    let hasKey = false, encryptionAvailable = false
    try { hasKey = vault.has('provider'); encryptionAvailable = vault.status().available } catch {}
    return { ok: true, config: { ...config.director }, hasKey, encryptionAvailable, keySource: hasKey ? 'encrypted-local' : 'none', capabilities: capabilities(), running: Boolean(running || pending) }
  }
  function receive(payload) {
    if (payload?.type !== 'director-status') return
    const result = payload.result
    if (!result || typeof result.requestId !== 'string' || result.requestId !== currentRequestId) return
    if (result.running) running = { requestId: result.requestId, state: result.state }
    else if (running?.requestId === result.requestId) { running = null; currentRequestId = null }
    const resolve = waiters.get(result.requestId)
    if (resolve && (result.state === 'frame-applied' || result.ok === false)) resolve({ ...result, status: result.status || 200, applied: result.state === 'frame-applied' })
  }
  async function performInternal(plan) {
    const caps = capabilities(), checked = contract.validatePlan(plan, caps)
    if (!checked.ok) return checked
    if (!getWindow() || getWindow().isDestroyed()) return { ok: false, status: 503, error: '模型窗口不可用' }
    const requestId = crypto.randomBytes(12).toString('hex')
    currentRequestId = requestId
    const promise = new Promise(resolve => {
      const timer = setTimeout(() => {
        waiters.delete(requestId)
        send({ type: 'director-cancel', requestId })
        if (running?.requestId === requestId) running = null
        if (currentRequestId === requestId) currentRequestId = null
        resolve({ ok: false, status: 504, error: '未收到模型逐帧执行确认', requestId })
      }, 4000)
      waiters.set(requestId, result => { clearTimeout(timer); waiters.delete(requestId); resolve({ ...result, requestId }) })
    })
    send({ type: 'director-plan', plan: checked.plan, caps, requestId })
    return promise
  }
  function cancelCurrent() {
    generation++; pending?.abort(); pending = null; running = null; currentRequestId = null
    for (const [requestId, resolve] of waiters) resolve({ ok: false, status: 409, state: 'cancelled', requestId })
    send({ type: 'director-cancel' })
    return { ok: true }
  }
  let autonomy = null, shared = null, scene = null
  function invalidateAll(reason = 'context-changed') {
    autonomy?.stop(reason)
    cancelCurrent()
    autonomy?.invalidateContext()
    shared?.revoke()
    scene?.invalidate()
  }
  const persona = createPersonaService({ root, legacy: legacyPersona, beforeChange: () => invalidateAll('persona-changed') })
  const memory = createMemoryService({ root, getDestination: () => config.director,
    beforeChange: () => invalidateAll('memory-changed'), ...(autonomyClock || {}) })
  shared = createSharedPersona({ getPersona: persona.getSnapshot, getCharacterRevision: () => capabilities().characterRevision, onRevoke: cancelCurrent, ...(autonomyClock || {}) })
  scene = createManualScene({ capture: senseManual, getDestination: () => config.director, ...(autonomyClock || {}) })
  autonomy = createAutonomous({ config, saveConfig, getCapabilities: capabilities, sense, getPersona: persona.getSnapshot,
    budget: createBudget(root, autonomyClock || {}),
    providerReady: () => {
      try { return config.director.enabled === true && config.director.allowRemote === true
        && !!config.director.model && !!config.director.baseURL && vault.has('provider') } catch { return false }
    },
    request: args => requestPlan({ ...args, config: config.director, key: vault.get('provider') }),
    perform: performInternal, cancelPerformance: cancelCurrent, ...(autonomyClock || {}) })
  function cancel() { invalidateAll('manual'); return { ok: true } }
  async function perform(plan, envelope) {
    if (envelope !== undefined && !shared.accepts(envelope)) return { ok: false, status: 409, error: '人设共享授权或版本已失效' }
    autonomy.stop('manual'); cancelCurrent(); const token = generation
    const result = await performInternal(plan)
    if (token !== generation || (envelope !== undefined && !shared.accepts(envelope))) {
      cancelCurrent(); return { ok: false, status: 409, error: '表演已停止或共享授权失效' }
    }
    return result
  }
  async function preview(body, { allowMemory = false, sceneReceipt = null } = {}) {
    if (!body || Object.keys(body).some(k => !['text', 'remote'].includes(k)) || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 4000 || typeof body.remote !== 'boolean') return { ok: false, status: 400, error: '请输入 1–4000 字的对话，并明确选择模式' }
    autonomy.stop('manual'); cancelCurrent()
    const caps = capabilities(), token = generation
    let snapshot
    try { snapshot = persona.getSnapshot() } catch { return { ok: false, status: 503, error: '人设存储不可用，请先检查人设设置' } }
    let plan, memorySnapshot = null
    try {
      if (body.remote) {
        if (config.director.enabled !== true || config.director.allowRemote !== true) return { ok: false, status: 403, error: '尚未授权远程模型请求' }
        if (sceneReceipt && !scene.valid(sceneReceipt)) return { ok: false, status: 409, error: '本次感知已失效，请重新采集' }
        if (allowMemory === true) memorySnapshot = memory.retrieve(body.text)
        if (token !== generation) return { ok: false, status: 409, error: '记忆已变化，请重新发送当前问题' }
        pending = new AbortController()
        plan = await requestPlan({ config: config.director, key: vault.get('provider'), prompt: buildContext({ capabilities: caps, snapshot,
          memory: memorySnapshot?.entries || [], ...(sceneReceipt ? { context: { scene: { capturedAt: new Date(sceneReceipt.capturedAt).toISOString(), expiresAt: new Date(sceneReceipt.expiresAt).toISOString(), front: sceneReceipt.front, permissions: sceneReceipt.permissions } } } : {}) }),
          text: body.text, ...(sceneReceipt?.imageDataUrl ? { imageDataUrl: sceneReceipt.imageDataUrl } : {}), signal: pending.signal })
        const outfitIds = new Set(['Clothes2', ...caps.outfits.flatMap(o => Object.keys(o.set))])
        const emotions = new Set(caps.emotions.map(e => e.id))
        const changesAppearance = Array.isArray(plan?.cues) && plan.cues.some(c => c.kind === 'outfit' || (c.kind === 'expression' && !emotions.has(c.name)) || (c.kind === 'parameters' && c.set && Object.keys(c.set).some(id => outfitIds.has(id))))
        if (changesAppearance && !allowsAppearance(body.text)) return { ok: false, status: 422, error: '已拦截未明确要求的外观修改指令' }
      } else {
        const local = contract.planDialogue(body.text, caps); if (!local.ok) return local; plan = local.plan
        const presentation = memory.takeLocalPresentation()
        if (typeof plan.speech === 'string') {
          if (presentation.maxSpeechCharacters) plan.speech = [...plan.speech].slice(0, presentation.maxSpeechCharacters).join('')
          if (presentation.questionFrequency === 'less') plan.speech = plan.speech.replace(/[^。！？.!?]*[？?]/g, '').trim() || '我在这里。'
        }
      }
      if (token !== generation) return { ok: false, status: 409, error: '请求已停止，不会播放迟到的结果' }
      if (persona.getSnapshot().revision !== snapshot.revision || capabilities().characterRevision !== caps.characterRevision) return { ok: false, status: 409, error: '人设或模型已变化，不会播放旧版本结果' }
      if (!memory.valid(memorySnapshot) || token !== generation) return { ok: false, status: 409, error: '记忆已变化或到期，不会播放旧版本结果' }
      if (sceneReceipt && !scene.valid(sceneReceipt)) return { ok: false, status: 409, error: '感知已过期，不会播放旧场景结果' }
      const result = await performInternal(plan)
      if (token !== generation || !memory.valid(memorySnapshot) || (sceneReceipt && !scene.valid(sceneReceipt))) { cancelCurrent(); return { ok: false, status: 409, error: '请求已停止或上下文已变化，不会返回旧版本结果' } }
      return { ...result, ...(result.ok ? { plan, mode: body.remote ? 'provider' : 'local-rules' } : {}) }
    } catch (error) {
      const budgetErrors = { CONTEXT_LIMIT: '整体输入超过上下文预算，未发送。请缩短输入，或在模型实际支持范围内提高总预算；截图还需保留图像额度。',
        IMAGE_PROFILE_UNSUPPORTED: '所选离线文字分词器不支持图像计量，未发送。请明确切换通用保守预算后重新采集。',
        TOKENIZER_UNAVAILABLE: '离线分词器校验或加载失败，未发送；请使用完整且校验通过的测试包。',
        BUDGET_INVALID: '上下文预算配置无效，未发送。' }
      if (Object.hasOwn(budgetErrors, error?.code)) return { ok: false, status: 422, code: error.code, error: budgetErrors[error.code] }
      return { ok: false, status: 502, error: '导演请求失败：请检查模型配置、授权或加密存储；服务响应内容未记录' }
    }
    finally { if (token === generation) pending = null }
  }
  const disabledConfig = source => ({ ...source, enabled: false, allowRemote: false, allowDiagnostics: false })
  function persistDirector(next, changeCredential = null) {
    // Never keep an old enabled destination paired with a newly written key.
    // The guard commit contains no credential and must precede every vault edit.
    const safe = disabledConfig(config.director)
    let guardPersisted = false
    invalidateAll('provider-changed')
    try {
      if (changeCredential) {
        config.director = safe
        saveConfig()
        guardPersisted = true
        changeCredential()
      }
      // saveConfig is synchronous and throws on failed atomic replacement.
      config.director = next
      saveConfig()
      return state()
    } catch {
      // Do not restore previously enabled permissions, even for a failed
      // revocation. No retry, plaintext key backup or rollback of the vault.
      config.director = safe
      return { ok: false, status: 503, code: 'DIRECTOR_SAVE_FAILED', permissionsDisabled: true,
        permissionShutdownPersisted: guardPersisted,
        error: guardPersisted
          ? '配置未完成；已持久关闭直连、远程与诊断权限。密钥可能已变更，请检查后重新配置；不会自动重试。'
          : '配置未能保存；本次运行已关闭直连、远程与诊断权限。重启可能读取旧授权，请先修复写入问题并重新保存关闭设置。' }
    }
  }
  function save(body) {
    if (!body || Object.keys(body).some(k => ![...Object.keys(DEFAULTS), 'apiKey'].includes(k))) return { ok: false, error: '不支持的配置字段' }
    const next = Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, config.director[key]]))
    if (body.tokenizerProfile !== undefined) { if (!['conservative', 'deepseek-v4'].includes(body.tokenizerProfile)) return { ok: false, error: '分词配置无效' }; next.tokenizerProfile = body.tokenizerProfile }
    if (body.contextTokens !== undefined) { if (!Number.isInteger(body.contextTokens) || body.contextTokens < 4096 || body.contextTokens > 1048576) return { ok: false, error: '上下文预算必须为 4096–1048576 的整数' }; next.contextTokens = body.contextTokens }
    for (const key of ['enabled', 'allowRemote', 'allowDiagnostics']) if (body[key] !== undefined) { if (typeof body[key] !== 'boolean') return { ok: false, error: '配置格式无效' }; next[key] = body[key] }
    for (const key of ['baseURL', 'model']) if (body[key] !== undefined) { if (typeof body[key] !== 'string' || body[key].length > (key === 'model' ? 128 : 1000)) return { ok: false, error: '配置格式无效' }; next[key] = body[key].trim() }
    // Changing destination/model must not inherit an earlier opt-in implicitly.
    if ((next.baseURL !== config.director.baseURL || next.model !== config.director.model) && body.allowRemote !== true) next.allowRemote = false
    try {
      if (next.baseURL) endpoint(next.baseURL)
      if (next.enabled && (!next.baseURL || !next.model)) return { ok: false, error: '启用直连前请填写服务地址和模型名称' }
      if (body.apiKey !== undefined && (typeof body.apiKey !== 'string' || !body.apiKey.trim() || body.apiKey.length > 8192 || /[\r\n]/.test(body.apiKey))) return { ok: false, error: '密钥格式无效' }
      const previousOrigin = config.director.baseURL ? new URL(config.director.baseURL).origin : null
      const nextOrigin = next.baseURL ? new URL(next.baseURL).origin : null
      // Permission to send persona is not permission to forward another service's key.
      const changeCredential = body.apiKey !== undefined ? () => vault.set('provider', body.apiKey.trim())
        : previousOrigin !== nextOrigin ? () => vault.remove('provider') : null
      return persistDirector(next, changeCredential)
    } catch { return { ok: false, error: '配置未完成：请检查地址格式或 Windows 加密存储；不会降级明文保存' } }
  }
  const handlers = {
    state: () => state(), save: save,
    'clear-key': () => persistDirector(disabledConfig(config.director), () => vault.remove('provider')),
    preview: body => preview(body, { allowMemory: true }), cancel,
  }
  function settingsHandler(handler) { return (event, body) => {
    const w = getSettingsWindow()
    const expected = getSettingsUrl?.()
    if (!w || w.isDestroyed() || event.sender !== w.webContents || event.senderFrame !== w.webContents.mainFrame
      || !expected || w.webContents.getURL() !== expected || event.senderFrame?.url !== expected) return { ok: false, status: 403, error: '只允许本机设置窗口执行此操作' }
    return handler(body)
  } }
  for (const [name, handler] of Object.entries(handlers)) ipcMain.handle('director:' + name, settingsHandler(handler))
  const noBody = handler => body => {
    if (body !== undefined && body !== null && (!body || Object.getPrototypeOf(body) !== Object.prototype || Reflect.ownKeys(body).length)) {
      return { ok: false, status: 400, error: '此操作不接受额外字段' }
    }
    return handler()
  }
  const autonomyHandlers = {
    state: noBody(() => autonomy.state()), save: body => autonomy.save(body),
    start: noBody(() => { cancelCurrent(); return autonomy.start() }),
    stop: noBody(() => { const result = autonomy.stop('user-stop'); cancelCurrent(); return result }),
    once: noBody(() => { cancelCurrent(); return autonomy.once() }),
  }
  for (const [name, handler] of Object.entries(autonomyHandlers)) ipcMain.handle('autonomy:' + name, settingsHandler(handler))
  const personaHandlers = { state: noBody(persona.state), save: persona.save, reset: persona.reset, rollback: persona.rollback }
  for (const [name, handler] of Object.entries(personaHandlers)) ipcMain.handle('persona:' + name, settingsHandler(handler))
  const memoryHandlers = { state: noBody(memory.state), save: memory.save, delete: memory.delete, clear: memory.clear, revoke: memory.revoke }
  Object.assign(memoryHandlers, { 'library-state': noBody(memory.libraryState), 'add-event': memory.addEvent,
    'preview-consolidation': memory.previewConsolidation, 'confirm-consolidation': memory.confirmConsolidation,
    'delete-source': memory.deleteSource, suggest: memory.suggest, 'resolve-suggestion': memory.resolveSuggestion,
    'set-library-authorization': memory.setLibraryAuthorization, 'revoke-library': memory.revokeLibrary })
  for (const [name, handler] of Object.entries(memoryHandlers)) ipcMain.handle('memory:' + name, settingsHandler(handler))
  for (const [name, handler] of Object.entries({ state: noBody(shared.state), preview: shared.preview, confirm: shared.confirm, revoke: noBody(shared.revoke) })) ipcMain.handle('share:' + name, settingsHandler(handler))
  ipcMain.handle('scene:collect', settingsHandler(body => { autonomy.stop('manual-scene'); cancelCurrent(); return scene.collect(body) }))
  ipcMain.handle('scene:clear', settingsHandler(noBody(() => { cancelCurrent(); return scene.invalidate() })))
  ipcMain.handle('scene:send', settingsHandler(body => {
    if (!body || Object.keys(body).length !== 4 || !['text', 'previewId', 'expectedDestinationId', 'confirm'].every(key => Object.hasOwn(body, key))) return { ok: false, status: 400, error: '感知发送格式无效' }
    try { const { text, ...confirmation } = body; const sceneReceipt = scene.consume(confirmation); return preview({ text, remote: true }, { sceneReceipt }) }
    catch { return { ok: false, status: 409, error: '感知已过期或目的地变化，请重新采集' } }
  }))
  function publicAutonomyState() {
    const { config: _privateConfig, providerReady: _providerReady, ...runtimeState } = autonomy.state()
    return runtimeState
  }
  return { state, capabilities, receive, perform, preview, cancel,
    personaSnapshot: persona.getSnapshot,
    clearLegacyPersona: () => persona.clearLegacy(),
    systemEvent: event => { autonomy.systemEvent(event); cancelCurrent(); shared.revoke(); scene.invalidate() },
    autonomyState: publicAutonomyState,
    autonomyStop: () => { autonomy.stop('user-stop'); cancelCurrent(); return publicAutonomyState() },
    interact: () => autonomy.interact(),
    shutdown: () => { memory.shutdown(); autonomy.shutdown(); shared.revoke(); scene.invalidate(); cancelCurrent() },
    diagnosticsAllowed: () => config.director.allowDiagnostics === true,
    hasKey: () => { try { return vault.has('provider') } catch { return false } },
    async http(route, body) {
      if (route === 'capabilities') return { ok: true, ...capabilities(), prompt: contract.buildPrompt(capabilities()) }
      if (route === 'state') return { ok: true, running: Boolean(running), performance: running, pending: Boolean(pending) }
      if (route === 'context') return shared.envelope()
      if (route === 'autonomy/state') return publicAutonomyState()
      if (route === 'autonomy/stop') { if (body && Object.keys(body).length) return { ok: false, status: 400, error: '停止指令不能携带其他字段' }; autonomy.stop('user-stop'); cancelCurrent(); return publicAutonomyState() }
      if (route === 'perform') { if (!body || !Object.hasOwn(body, 'plan') || Object.keys(body).some(key => !['plan', 'envelope'].includes(key))) return { ok: false, status: 400, error: '仅允许 plan 与可选 envelope' }; return perform(body.plan, body.envelope) }
      if (route === 'cancel') { if (body && Object.keys(body).length) return { ok: false, status: 400, error: '停止指令不能携带其他字段' }; return cancel() }
      return { ok: false, status: 404, error: '未知导演接口' }
    },
  }
}
module.exports = { createDirector }
