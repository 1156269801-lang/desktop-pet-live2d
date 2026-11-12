'use strict'

;(() => {
  const group = document.getElementById('autonomyControls')
  if (!group) return
  const api = window.settings
  const byId = id => document.getElementById(id)
  const defaults = {
    mode: 'rules', localLines: '', tone: 'caring', intervalSec: 90, minSilenceSec: 45,
    maxCallsPerHour: 12, maxCallsPerDay: 48, sessionMinutes: 30, allowAutonomous: false, allowWindowTitle: false,
    allowScreenshot: false, allowOutfit: false, quietHours: true, pauseFullscreen: true,
  }
  const limits = { intervalSec: [30, 1800], minSilenceSec: [20, 3600], maxCallsPerHour: [1, 120], maxCallsPerDay: [1, 240], sessionMinutes: [5, 480] }
  const fields = Object.fromEntries(Object.keys(defaults).map(key => [key, byId('autonomy' + key[0].toUpperCase() + key.slice(1))]))
  const buttons = Object.fromEntries(['save', 'once', 'start', 'stop', 'refresh'].map(key => [key, byId('autonomy' + key[0].toUpperCase() + key.slice(1))]))
  const supported = ['autonomyState', 'autonomySave', 'autonomyStart', 'autonomyStop', 'autonomyOnce'].every(name => typeof api?.[name] === 'function')
  let state = null, operation = '', stopping = false, loading = false, disposed = false
  let actionRevision = 0, stateRevision = 0, editRevision = 0, pollTimer = 0, clockTimer = 0
  let tabActive = document.body.dataset.settingsTab === 'director'
  let lastPhase = ''

  const phaseLabels = {
    stopped: '已停止', idle: '已停止', starting: '准备中', waiting: '等待下一轮', stabilizing: '等待环境稳定',
    pending: '模型请求中', requesting: '模型请求中', generating: '模型请求中', observing: '读取授权感知', sensing: '读取授权感知',
    running: '自主运行中', performing: '表演中', speaking: '表演中', cooldown: '安静等待', paused: '已暂停',
    quiet: '夜间降频', fullscreen: '全屏暂停', backoff: '退避等待', 'rate-limited': '等待调用额度', error: '本轮未完成', completed: '会话已结束',
  }
  const reasonLabels = {
    'no-event': '没有新事件，保持安静；条件检查不会调用模型。',
    'budget-unavailable': '调用次数账本无法核验，API 自主运行已停止；修复后仍需手动开始。',
    'system-lock': '系统已锁屏，自主会话与等待请求已停止；解锁后不会自动恢复。',
    'system-suspend': '系统进入睡眠，自主会话与等待请求已停止；唤醒后不会自动恢复。',
    'system-resume': '系统已唤醒，自主会话保持停止；请手动开始新会话。',
    'system-unlock': '系统已解锁，自主会话保持停止；请手动开始新会话。',
    'system-shutdown': '系统即将关闭，自主会话与等待请求已停止。',
    'persona-unavailable': '统一人设无法读取，未启动自主会话。',
    'persona-changed': '统一人设已更新，旧请求已取消；不会自动恢复。',
    started: '自主会话已开始，先等待环境稳定。', once: '仅安排本轮；完成后自动停止。',
    'user-stop': '已手动停止自主运行。', interaction: '检测到新的互动，重新等待安静与稳定条件。',
    'config-changed': '设定已更新，旧自主会话已停止。', 'session-ended': '本次会话已到时，需要手动重新开始。',
    'once-complete': '本轮已结束，没有开启长期循环。', 'circuit-open': '连续失败较多，本次自主运行已停止。',
    'not-authorized': '尚未保存自主运行授权。', 'provider-unavailable': 'API 未就绪，请检查下方配置、远程授权与密钥。',
    'capabilities-not-ready': '角色能力尚未就绪，暂不运行。', 'scene-changing': '环境正在变化，等待稳定后再尝试。',
    'quiet-hours': '00–06 点降低频率，仍可能调用 API 并产生费用。', 'min-silence': '还未达到最短安静时间。',
    'rate-limit': '已达到滚动 1 小时或 24 小时调用次数上限，等待额度窗口恢复。', repeated: '本轮与近期内容重复，已跳过。',
    'gesture-repeat': '近期已执行类似动作，本轮已跳过。', 'provider-failed': '本轮模型调用未完成。',
    'sense-failed': '本轮已授权感知未完成。', 'plan-invalid': '模型计划不符合安全协议，未执行。',
    'appearance-denied': '已拒绝未经授权的装扮变化。', 'apply-failed': '本轮表演未得到执行确认。',
    'character-changed': '角色发生变化，旧计划不会执行。', shutdown: '应用退出，自主运行已停止。',
    stopped: '已停止自主运行。', manual: '已手动停止。', user: '已手动停止。', manual_stop: '已手动停止。',
    session_ended: '本次会话已到时，需要手动重新开始。', session_complete: '本次会话已到时，需要手动重新开始。',
    session_expired: '本次会话已到时，需要手动重新开始。', quiet_hours: '00–06 点降低频率，仍可能调用 API 并产生费用。',
    fullscreen: '检测到全屏应用，暂不主动打扰。', min_silence: '还未达到最短安静时间。',
    rate_limit: '已达到本小时调用上限，等待额度窗口恢复。', hourly_limit: '已达到本小时调用上限，等待额度窗口恢复。',
    not_authorized: '尚未保存自主运行授权。', provider_not_ready: 'API 未就绪，请检查下方直连配置、远程授权与密钥。',
    stabilization: '先等待环境稳定，再尝试下一轮。', stable_window: '先等待环境稳定，再尝试下一轮。',
  }
  const eventLabels = { commentary: '搭子定时点评', 'session-start': '会话开始', 'scene-change': '稳定场景变化', interaction: '本机互动', 'routine-transition': '作息时段变化', 'manual-once': '手动单轮' }
  const routineLabels = { night: '夜间', morning: '上午', afternoon: '下午', evening: '晚间' }
  const budgetLabels = {
    BUDGET_LIMIT: '已到调用次数上限；不是金额或费用上限。',
    BUDGET_UNAVAILABLE: '调用账本不可用，API 自主调用已阻止。',
    BUDGET_CORRUPT: '调用账本未通过完整性检查，API 自主调用已阻止。',
    BUDGET_CLOCK: '检测到时钟异常，API 自主调用已阻止。',
    BUDGET_IO_ERROR: '调用账本无法持久保存，API 自主调用已阻止。',
    BUDGET_IO: '调用账本无法持久保存，API 自主调用已阻止。',
    BUDGET_ENCRYPTION_ERROR: '调用账本无法加密保存，API 自主调用已阻止。',
    BUDGET_ENCRYPTION: '调用账本无法加密保存，API 自主调用已阻止。',
    BUDGET_INVALID: '调用次数设定无效，API 自主调用已阻止。',
    BUDGET_BUSY: '调用账本正被占用，API 自主调用已阻止。',
    BUDGET_UNSAFE_PATH: '调用账本路径不安全，API 自主调用已阻止。',
  }

  function message(text, error = false) {
    const target = byId('autonomyStatus')
    target.textContent = text
    target.dataset.error = String(error)
  }

  function normalizeConfig(raw = {}) {
    const config = { ...defaults }
    for (const key of Object.keys(defaults)) {
      if (typeof defaults[key] === 'boolean') config[key] = typeof raw[key] === 'boolean' ? raw[key] : defaults[key]
      else if (limits[key]) {
        const value = raw[key], [min, max] = limits[key]
        if (Number.isInteger(value) && value >= min && value <= max) config[key] = value
      }
    }
    config.mode = raw.mode === 'api' ? 'api' : 'rules'
    config.tone = ['caring', 'tsundere', 'quiet', 'streamer'].includes(raw.tone) ? raw.tone : 'caring'
    config.localLines = typeof raw.localLines === 'string' ? raw.localLines.slice(0, 2000) : ''
    return config
  }

  function draft() {
    const result = {}
    for (const key of Object.keys(defaults)) result[key] = typeof defaults[key] === 'boolean' ? fields[key].checked
      : limits[key] ? Number(fields[key].value) : fields[key].value
    return result
  }

  function dirty() { return Boolean(state && JSON.stringify(draft()) !== JSON.stringify(state.config)) }
  function positive(value) { return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0 }
  function tally(value) { return Math.floor(positive(value)) }
  function callTally(value) { return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null }
  function lifeState(value) {
    if (value?.virtual !== true || !Object.hasOwn(routineLabels, value.routine)
      || ![value.energy, value.sleepy].every(number => typeof number === 'number' && Number.isFinite(number) && number >= 0 && number <= 1)
      || typeof value.pace !== 'number' || !Number.isFinite(value.pace) || value.pace < 1 || value.pace > 10) return null
    return { routine: value.routine, energy: value.energy, sleepy: value.sleepy, pace: value.pace }
  }

  function accept(result, updateForm = false) {
    if (!result?.ok || !result.config || typeof result.config !== 'object' || Array.isArray(result.config)) throw new Error('STATE_UNAVAILABLE')
    state = {
      config: normalizeConfig(result.config), running: result.running === true,
      phase: typeof result.phase === 'string' && Object.hasOwn(phaseLabels, result.phase) ? result.phase : '',
      reason: typeof result.reason === 'string' && Object.hasOwn(reasonLabels, result.reason) ? result.reason : '',
      hasError: Boolean(result.lastError), providerReady: result.providerReady === true,
      nextRunAt: positive(result.nextRunAt), sessionEndsAt: positive(result.sessionEndsAt),
      callsThisHour: callTally(result.callsThisHour), callsToday: callTally(result.callsToday), rounds: tally(result.rounds), spoken: tally(result.spoken),
      budgetReady: result.budget?.ok === true,
      budgetCode: Object.hasOwn(budgetLabels, result.budget?.code || '') ? result.budget.code : '',
      life: lifeState(result.life), lastEvent: Object.hasOwn(eventLabels, result.lastEvent || '') ? result.lastEvent : '',
    }
    if (updateForm) for (const key of Object.keys(defaults)) {
      if (typeof defaults[key] === 'boolean') fields[key].checked = state.config[key]
      else fields[key].value = String(state.config[key])
    }
    render()
    const phase = state.phase + ':' + state.reason + ':' + state.hasError
    if (!operation && !stopping && phase !== lastPhase) {
      if (state.reason === 'budget-unavailable') message(reasonLabels[state.reason], true)
      else if (state.hasError) message('上一轮未完成；请检查服务配置、授权或运行条件。不会显示服务商原始响应。', true)
      else if (state.reason) message(reasonLabels[state.reason])
      else message(state.running ? '自主会话进行中；可随时立即停止。' : '自主运行未启动。保存设定后，需要手动开始。')
    }
    lastPhase = phase
  }

  function timeLeft(timestamp) {
    const seconds = Math.max(0, Math.ceil((timestamp - Date.now()) / 1000))
    return Math.floor(seconds / 60) + '分 ' + String(seconds % 60).padStart(2, '0') + '秒'
  }

  function renderClock() {
    byId('autonomyNextRun').textContent = state?.running
      ? state.nextRunAt ? timeLeft(state.nextRunAt) : '等待运行条件' : operation === 'once' || operation === 'start' ? '等待后端确认' : '尚未启动'
    byId('autonomySessionRemaining').textContent = state?.running
      ? state.sessionEndsAt ? timeLeft(state.sessionEndsAt) : '等待会话时间' : '尚未启动'
  }

  function render() {
    const ready = supported && Boolean(state), busy = Boolean(operation) || stopping
    for (const field of Object.values(fields)) field.disabled = !ready || busy
    buttons.save.disabled = !ready || busy
    const canRun = ready && !busy && !dirty() && state.config.allowAutonomous
      && (state.config.mode !== 'api' || (state.providerReady && state.budgetReady)) && !state.running
    buttons.once.disabled = buttons.start.disabled = !canRun
    // Stop is independent of dirty state, saving, starting, and a pending model call.
    buttons.stop.disabled = !ready || stopping
    buttons.refresh.disabled = !supported || loading || stopping || operation === 'save'
    buttons.save.textContent = operation === 'save' ? '正在保存…' : '保存设定'
    buttons.once.textContent = operation === 'once' ? '本轮等待 / 执行中…' : '仅运行一轮'
    buttons.start.textContent = operation === 'start' ? '正在开始…' : '开始自主运行'
    buttons.stop.textContent = stopping ? '正在停止…' : '立即停止'
    group.setAttribute('aria-busy', String(loading || busy))
    const mode = fields.mode.value === 'api' ? 'api' : 'rules'
    byId('autonomyModeHelp').textContent = mode === 'rules'
      ? fields.allowWindowTitle.checked
        ? '离线按规则选语气与台词；已授权标题仅在本地判断场景，不理解人设、不联网。'
        : '离线按规则选语气与台词，不理解人设、不联网；标题默认不读。'
      : byId('autonomyTone').value === 'streamer'
        ? '直播搭子会按检查间隔定时请求 API 点评屏幕（需授权标题或截图），比其它语气调用更频繁、费用更高；仍受最短安静时间和次数上限约束。全屏游戏需关闭「全屏时暂停」。'
      : '只有符合条件的新事件才请求 API；请求会发送人设、当前会话短期上下文与已授权感知并可能计费。无事件不调用，不读取显式记忆库。'
    const phase = byId('autonomyPhase')
    phase.textContent = stopping ? '正在停止' : state ? phaseLabels[state.phase] || (state.running ? '等待运行条件' : '已停止') : '尚未读取'
    phase.dataset.running = String(Boolean(state?.running))
    byId('autonomyCallCount').textContent = (state?.callsThisHour ?? '未核验') + ' / ' + (state?.config.maxCallsPerHour || 12)
    byId('autonomyDailyCallCount').textContent = (state?.callsToday ?? '未核验') + ' / ' + (state?.config.maxCallsPerDay || 48)
    byId('autonomyLastEvent').textContent = eventLabels[state?.lastEvent] || '尚无已执行事件'
    byId('autonomyLifeState').textContent = state?.life
      ? routineLabels[state.life.routine] + ' · 能量 ' + Math.round(state.life.energy * 100) + '% · 困倦 ' + Math.round(state.life.sleepy * 100) + '%' : '尚未读取角色节奏'
    byId('autonomyPace').textContent = state?.life ? state.life.pace + ' × 检查间隔' : '尚未读取'
    byId('autonomyBudgetState').textContent = state?.budgetReady
      ? '调用次数按滚动窗口累计，重启不清零；不是费用预算。'
      : budgetLabels[state?.budgetCode] || '调用账本尚未核验；API 自主运行不会开启。离线规则不使用 API 次数。'
    byId('autonomyRoundCount').textContent = (state?.rounds || 0) + ' / ' + (state?.spoken || 0)
    const needs = []
    if (dirty()) needs.push('保存未提交的设定')
    if (state && !state.config.allowAutonomous) needs.push('勾选并保存自主授权')
    if (state?.config.mode === 'api' && !state.providerReady) needs.push('完成下方 API 配置、远程授权及密钥')
    if (state?.config.mode === 'api' && !state.budgetReady) needs.push('等待调用次数可用或检查账本状态')
    byId('autonomyDraftState').textContent = needs.length ? '开始前需要：' + needs.join('；') + '。'
      : state?.running ? '保存会停止当前会话；保存后不会自动重启。' : '已保存。保存不会联网；开始与仅运行一轮都需手动操作。'
    renderClock()
  }

  function schedule() {
    if (pollTimer) clearTimeout(pollTimer)
    if (clockTimer) clearTimeout(clockTimer)
    pollTimer = clockTimer = 0
    if (disposed || !supported || !tabActive) return
    // Local status reads only: no preview, screenshot, provider call, or autostart.
    pollTimer = window.setTimeout(() => { pollTimer = 0; void refresh(false) }, 2000)
    const tick = () => {
      clockTimer = 0
      if (disposed || !tabActive) return
      renderClock()
      clockTimer = window.setTimeout(tick, 1000)
    }
    clockTimer = window.setTimeout(tick, 1000)
  }

  async function refresh(announce = false) {
    if (!supported || disposed || operation === 'save' || stopping) return
    const revision = ++stateRevision, edit = editRevision
    loading = true; render()
    try {
      const result = await api.autonomyState()
      if (disposed || revision !== stateRevision) return
      const updateForm = !state || (!dirty() && edit === editRevision)
      accept(result, updateForm)
      if (announce) message('状态已刷新；没有启动、截图或调用模型。')
    } catch (_) {
      if (!disposed && revision === stateRevision) message('读取自主状态失败，请刷新重试。', true)
    } finally {
      if (!disposed && revision === stateRevision) { loading = false; render(); schedule() }
    }
  }

  function valid(config) {
    for (const [key, [min, max]] of Object.entries(limits)) if (!Number.isInteger(config[key]) || config[key] < min || config[key] > max) {
      message('请填写范围内的整数；频率与会话数值不能留空。', true)
      fields[key].focus({ preventScroll: true }); return false
    }
    if (!['rules', 'api'].includes(config.mode) || !['caring', 'tsundere', 'quiet', 'streamer'].includes(config.tone)
      || config.localLines.length > 2000) {
      message('设定格式无效；自定义台词最多 2000 字。', true); return false
    }
    return true
  }

  async function act(kind) {
    if (!supported || !state || operation || stopping) return
    const payload = draft()
    if (kind === 'save') { if (!valid(payload)) return }
    else if (dirty() || !state.config.allowAutonomous || state.running || (state.config.mode === 'api' && (!state.providerReady || !state.budgetReady))) { render(); return }
    const revision = ++actionRevision
    ++stateRevision; loading = false; operation = kind; render()
    message(kind === 'save' ? '正在保存；旧会话会停止，不会联网或自动重启。'
      : kind === 'once' ? '正在安排一轮；先等待环境稳定，可随时停止。' : '正在开始本次自主会话；可随时停止。')
    try {
      const result = kind === 'save' ? await api.autonomySave(payload)
        : kind === 'once' ? await api.autonomyOnce() : await api.autonomyStart()
      if (disposed || revision !== actionRevision) return
      ++stateRevision; loading = false
      if (result?.ok === false) {
        if (result.config) accept({ ...result, ok: true }, false)
        message(reasonLabels[result.error] || budgetLabels[result.code] || (kind === 'save' ? '保存未完成，旧会话不会自动恢复。' : '本次运行未开始，请检查授权、调用次数与运行条件。'), true)
        return
      }
      accept(result, kind === 'save')
      message(kind === 'save' ? '设定已保存；自主运行已停止，没有调用模型。'
        : kind === 'once' ? state.running ? '本轮已安排，等待条件满足或执行完成；不会开启长期循环。' : '本轮已结束；没有开启长期循环。'
          : state.running ? '自主会话已开始；下一轮时间与调用额度见上方。' : '尚未开始，请检查授权与运行条件。')
    } catch (_) {
      if (!disposed && revision === actionRevision) message(kind === 'save' ? '保存未完成，请检查设定后重试。'
        : '运行未完成；请检查已保存授权、API 就绪状态或运行条件。', true)
    } finally {
      if (!disposed && revision === actionRevision) { operation = ''; render(); schedule() }
    }
  }

  async function stop() {
    if (!supported || !state || stopping) return
    ++actionRevision; ++stateRevision; operation = ''; loading = false; stopping = true; render()
    message('正在停止自主会话与等待中的请求…')
    try {
      const result = await api.autonomyStop()
      if (disposed) return
      accept(result, false)
      message(state.running ? '后端仍报告会话运行中，尚未确认停止；请立即重试。'
        : '已停止自主运行。已发送的内容与已产生的费用无法撤回。', state.running)
    } catch (_) {
      if (!disposed) message('尚未确认停止，请立即重试；不会把请求失败当作已停止。', true)
    } finally { if (!disposed) { stopping = false; render(); schedule() } }
  }

  for (const field of Object.values(fields)) {
    const changed = () => { ++editRevision; render() }
    field.addEventListener('input', changed)
    field.addEventListener('change', changed)
  }
  for (const kind of ['save', 'once', 'start']) buttons[kind].addEventListener('click', () => { void act(kind) })
  buttons.stop.addEventListener('click', () => { void stop() })
  buttons.refresh.addEventListener('click', () => { void refresh(true) })
  window.addEventListener('director:config-updated', () => { void refresh(false) })
  document.addEventListener('persona:updated', () => { void refresh(false) })
  window.addEventListener('settings:tab-change', event => {
    tabActive = event.detail?.name === 'director'
    if (tabActive) void refresh(false)
    schedule()
  })
  window.addEventListener('pagehide', () => {
    disposed = true; ++actionRevision; ++stateRevision
    if (pollTimer) clearTimeout(pollTimer)
    if (clockTimer) clearTimeout(clockTimer)
  })
  render()
  if (supported) void refresh(false)
  else message('当前主进程未提供自主接口，请使用配套版本；没有启动任何运行。', true)
})()
