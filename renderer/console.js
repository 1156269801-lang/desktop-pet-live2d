'use strict'

// This window sends requests through the original preload bridge. IPC send is not a
// renderer completion receipt: local pressed states describe requests, never model pose.
const api = window.petConsole
const motionList = document.getElementById('motionList')
const expressList = document.getElementById('expressList')
const statusEl = document.getElementById('status')
const searchInput = document.getElementById('consoleSearch')
const clearSearchButton = document.getElementById('clearSearch')
const clearExpressionButton = document.getElementById('clearExpression')
const retryButton = document.getElementById('retryLoad')
const tabs = [document.getElementById('tabMotions'), document.getElementById('tabExpressions')]
const panels = [document.getElementById('motionPanel'), document.getElementById('expressionPanel')]

const MOTION_PAIRS = [
  { open: '默认手切举手', close: '举手切默认手', label: '举手' },
  { open: '竖手指切出来动画', close: '竖手指切回默认', label: '竖手指' },
  { open: '狗尾草切换出来', close: '狗尾草切回默认手', label: '狗尾巴草' },
]
const preferredNames = ['打招呼', '张望', '伸懒腰']
const pairState = new Map()
const flashTimers = new Map()
let sourceMotions = []
let sourceExpressions = []
let motionEntries = []
let activeTab = 0
let loaded = false
let stateSignature = ''
let loadTimeout = null
let retryTimeout = null
let unsubscribe = null

function setStatus(text, kind = '') {
  statusEl.textContent = text || ''
  statusEl.dataset.kind = kind
}

function available(method) { return Boolean(api && typeof api[method] === 'function') }
function normalized(text) { return String(text).normalize('NFKC').toLocaleLowerCase('zh-CN') }
function queryText() { return normalized(searchInput.value.trim()) }
function matches(text, query) { return !query || normalized(text).includes(query) }

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function clearFlashes() {
  for (const timer of flashTimers.values()) window.clearTimeout(timer)
  flashTimers.clear()
}

function flashRequest(button) {
  if (flashTimers.has(button)) window.clearTimeout(flashTimers.get(button))
  button.classList.add('is-requested')
  const timer = window.setTimeout(() => {
    button.classList.remove('is-requested')
    flashTimers.delete(button)
  }, 900)
  flashTimers.set(button, timer)
}

function sendRequest(method, args, onSent, message, button) {
  if (!available(method)) {
    setStatus('控制连接不可用，请关闭后重新打开动作控制台。', 'error')
    return
  }
  if (button) button.disabled = true
  const failed = () => {
    if (button) button.disabled = false
    setStatus('请求未能发送，请重新读取列表后再试。', 'error')
  }
  const sent = result => {
    if (result === false || (result && result.ok === false)) { failed(); return }
    if (button) button.disabled = false
    if (onSent) onSent()
    setStatus(message, 'ok')
  }
  try {
    const result = api[method](...args)
    if (result && typeof result.then === 'function') result.then(sent).catch(failed)
    else sent(result)
  } catch (_) { failed() }
}

function buildMotionEntries() {
  const byName = new Map(sourceMotions.map(item => [item.name, item]))
  const paired = new Set()
  const entries = []
  for (const pair of MOTION_PAIRS) {
    if (!byName.has(pair.open) || !byName.has(pair.close)) continue
    paired.add(pair.open)
    paired.add(pair.close)
    entries.push({ kind: 'pair', pair, label: pair.label, open: byName.get(pair.open), close: byName.get(pair.close),
      searchText: [pair.label, pair.open, pair.close].join(' ') })
  }
  for (const motion of sourceMotions) {
    if (!paired.has(motion.name)) entries.push({ kind: 'motion', motion, label: motion.name, searchText: motion.name })
  }
  // Sort only this derived display list; never change the model's source array or indices.
  const rank = entry => { const index = preferredNames.indexOf(entry.label); return index === -1 ? preferredNames.length : index }
  return entries.sort((a, b) => rank(a) - rank(b))
}

function pairButton(entry) {
  const button = element('button', 'console-action console-pair')
  button.type = 'button'
  button.dataset.pair = entry.label
  button.disabled = !loaded || !available('play')
  button.setAttribute('aria-describedby', 'motionNote')
  const label = element('span', 'console-action-label', entry.label)
  const badge = element('span', 'console-action-meta console-pair-state')
  const update = () => {
    const on = Boolean(pairState.get(entry.label))
    button.setAttribute('aria-pressed', String(on))
    button.setAttribute('aria-label', entry.label + '，本窗口记录为' + (on ? '开' : '关') + '，点击请求' + (on ? '关闭' : '打开'))
    badge.textContent = on ? '开' : '关'
    button.title = '点击发送' + (on ? '关闭' : '打开') + '请求；开关仅为本窗口记录'
  }
  update()
  button.append(label, badge)
  button.addEventListener('click', () => {
    const nextOn = !pairState.get(entry.label)
    const item = nextOn ? entry.open : entry.close
    sendRequest('play', [item.group, item.index, entry.label], () => {
      pairState.set(entry.label, nextOn)
      update()
    }, '已请求' + (nextOn ? '打开：' : '关闭：') + entry.label + '；以角色实际表现为准。', button)
  })
  return button
}

function motionButton(entry) {
  const item = entry.motion
  const button = element('button', 'console-action console-motion')
  button.type = 'button'
  button.dataset.motion = item.name
  button.disabled = !loaded || !available('play')
  button.title = '请求播放：' + item.name
  button.append(element('span', 'console-action-label', item.name),
    element('span', 'console-action-meta', item.duration > 0 ? item.duration.toFixed(1) + ' 秒' : '动作'))
  button.addEventListener('click', () => {
    sendRequest('play', [item.group, item.index, item.name], () => flashRequest(button),
      '已请求播放：' + item.name + '；收到请求不代表动作已结束。', button)
  })
  return button
}

function expressionButton(name) {
  const button = element('button', 'console-action console-expression')
  button.type = 'button'
  button.dataset.expression = name
  button.disabled = !loaded || !available('playExpression')
  button.append(element('span', 'console-action-label', name))
  button.addEventListener('click', () => {
    sendRequest('playExpression', [name], () => flashRequest(button), '已请求表情：' + name + '；以角色实际表现为准。', button)
  })
  return button
}

function renderLists(announce = false) {
  clearFlashes()
  const query = queryText()
  const motions = motionEntries.filter(entry => matches(entry.searchText, query))
  const expressions = sourceExpressions.filter(name => matches(name, query))
  motionList.replaceChildren(...motions.map(entry => entry.kind === 'pair' ? pairButton(entry) : motionButton(entry)))
  expressList.replaceChildren(...expressions.map(expressionButton))
  document.getElementById('motionCount').textContent = String(query ? motions.length : sourceMotions.length)
  document.getElementById('expressionCount').textContent = String(expressions.length)
  document.getElementById('motionResultCount').textContent = query ? motions.length + ' 项匹配' : motionEntries.length + ' 项操作'
  document.getElementById('expressionResultCount').textContent = query ? expressions.length + ' 项匹配' : expressions.length + ' 个表情'
  clearSearchButton.hidden = !searchInput.value
  document.getElementById('motionEmpty').hidden = motions.length > 0
  document.getElementById('expressionEmpty').hidden = expressions.length > 0
  document.getElementById('motionEmptyText').textContent = !loaded ? '正在等待角色的动作清单…'
    : query ? (expressions.length ? '没有匹配的动作，表情分类中有匹配项。' : '没有匹配的动作，试试更短的关键词或清空搜索。')
      : '当前角色没有可用动作，可以重新读取列表。'
  document.getElementById('expressionEmptyText').textContent = !loaded ? '正在等待角色的表情清单…'
    : query ? (motions.length ? '没有匹配的表情，动作分类中有匹配项。' : '没有匹配的表情，试试更短的关键词或清空搜索。')
      : '当前角色没有可用表情，可以重新读取列表。'
  clearExpressionButton.disabled = !loaded || !available('clearExpression')
  if (announce && loaded) {
    setStatus(query ? '搜索结果：' + motions.length + ' 项动作操作，' + expressions.length + ' 个表情。'
      : '已显示全部：' + sourceMotions.length + ' 个动作、' + sourceExpressions.length + ' 个表情。')
  }
}

function selectTab(index, focus = false) {
  activeTab = index
  tabs.forEach((tab, i) => {
    tab.setAttribute('aria-selected', String(i === index))
    tab.tabIndex = i === index ? 0 : -1
    panels[i].hidden = i !== index
  })
  document.getElementById('consoleContent').scrollTop = 0
  if (focus) tabs[index].focus()
}

function renderState(state) {
  if (!state || typeof state !== 'object') return
  const motions = Array.isArray(state.motions) ? state.motions : []
  const expressions = Array.isArray(state.expressions) ? state.expressions : []
  sourceMotions = motions.filter(item => item && typeof item.name === 'string' && item.name.trim()
    && typeof item.group === 'string' && Number.isInteger(item.index) && item.index >= 0).map(item => ({
      name: item.name, group: item.group, index: item.index,
      duration: typeof item.duration === 'number' && Number.isFinite(item.duration) && item.duration > 0 ? item.duration : 0,
    }))
  sourceExpressions = expressions.filter(name => typeof name === 'string' && name.trim())
  const signature = JSON.stringify([sourceMotions.map(item => [item.name, item.group, item.index]), sourceExpressions])
  if (stateSignature && signature !== stateSignature) pairState.clear()
  stateSignature = signature
  motionEntries = buildMotionEntries()
  loaded = true
  window.clearTimeout(loadTimeout)
  window.clearTimeout(retryTimeout)
  retryButton.hidden = sourceMotions.length > 0 || sourceExpressions.length > 0
  renderLists()
  setStatus('已读取 ' + sourceMotions.length + ' 个动作、' + sourceExpressions.length + ' 个表情。点击发送请求。')
}

function requestState() {
  if (!available('requestConsole')) {
    setStatus('控制连接不可用，请在桌宠中重新打开动作控制台。', 'error')
    retryButton.hidden = false
    return
  }
  loaded = false
  renderLists()
  retryButton.hidden = true
  window.clearTimeout(loadTimeout)
  window.clearTimeout(retryTimeout)
  setStatus('正在读取动作与表情…')
  try { api.requestConsole() } catch (_) {
    setStatus('读取请求未能发送，请重试。', 'error')
    retryButton.hidden = false
    return
  }
  retryTimeout = window.setTimeout(() => {
    if (!loaded) { try { api.requestConsole() } catch (_) { /* timeout below provides a recovery action */ } }
  }, 1200)
  loadTimeout = window.setTimeout(() => {
    if (!loaded) {
      setStatus('角色尚未返回列表。请确认模型已加载，再重新读取。', 'error')
      retryButton.hidden = false
    }
  }, 5000)
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(index))
  tab.addEventListener('keydown', event => {
    let next = activeTab
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = 1 - activeTab
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = 1
    else return
    event.preventDefault()
    selectTab(next, true)
  })
})
searchInput.addEventListener('input', () => renderLists(true))
clearSearchButton.addEventListener('click', () => { searchInput.value = ''; renderLists(true); searchInput.focus() })
clearExpressionButton.addEventListener('click', () => {
  sendRequest('clearExpression', [], null, '已请求清除表情；不会复位全部动作。', clearExpressionButton)
})
retryButton.addEventListener('click', requestState)
function closeWindow() {
  if (available('close')) api.close()
  else setStatus('关闭接口不可用，请通过桌宠重新打开此窗口。', 'error')
}
document.getElementById('btnClose').addEventListener('click', closeWindow)
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); closeWindow() }
})
window.addEventListener('beforeunload', () => {
  clearFlashes()
  window.clearTimeout(loadTimeout)
  window.clearTimeout(retryTimeout)
  if (typeof unsubscribe === 'function') unsubscribe()
})
if (available('onState')) {
  unsubscribe = api.onState(payload => {
    if (payload && payload.type === 'console-state') renderState(payload.state)
  })
}
renderLists()
requestState()
