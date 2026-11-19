'use strict'

/** 独立聊天窗：和主窗共用 window.pet.send，不依赖主窗 DOM。 */
const logEl = document.getElementById('log')
const inputEl = document.getElementById('input')
const sendEl = document.getElementById('send')
let busy = false
let closed = false
let voice = null
let speech = null
const voiceEl = document.getElementById('voice')

const cancelVoiceEl = document.getElementById('cancelVoice')
const voiceStatusEl = document.getElementById('voiceStatus')
function updateControls() {
  const state = voice?.state || 'idle'
  const locked = state !== 'idle'
  sendEl.disabled = closed || busy || locked
  inputEl.disabled = closed || busy || locked
  voiceEl.disabled = closed || busy || ['stopping', 'transcribing', 'disposed'].includes(state)
  voiceEl.classList.toggle('recording', state === 'recording')
  voiceEl.textContent = state === 'recording' ? '■' : '🎙'
  const labels = { idle: '点击开始录音', requesting: '等待麦克风授权，点击取消', recording: '录音中，点击停止（最长60秒）', stopping: '正在结束录音…', transcribing: '正在转写…', disposed: '已关闭' }
  voiceEl.title = labels[state]
  voiceEl.setAttribute('aria-label', labels[state])
  voiceEl.setAttribute('aria-pressed', String(state === 'recording'))
  cancelVoiceEl.hidden = !locked || closed
  voiceStatusEl.textContent = state === 'idle' ? '' : labels[state]
}
voice = window.PetChatVoice.createRecorder({
  getUserMedia: (constraints) => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('当前窗口不支持麦克风录音')
    return navigator.mediaDevices.getUserMedia(constraints)
  },
  MediaRecorder: window.MediaRecorder,
  Blob, now: () => Date.now(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms), clearTimeout: (id) => window.clearTimeout(id),
  isBusy: () => busy || closed,
  stopSpeech: () => speech?.stop(),
  onState: updateControls,
  onError: (error) => logMessage('err', '语音输入失败：' + (error?.message || error)),
  transcribe: async (blob) => {
    const buffer = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (let offset = 0; offset < buffer.length; offset += 0x8000) binary += String.fromCharCode(...buffer.subarray(offset, offset + 0x8000))
    const result = await window.pet.asrTranscribe({ audio: btoa(binary), mime: blob.type })
    if (!result?.ok) throw new Error(result?.error || 'ASR 没有返回文字')
    return result.text
  },
  onText: (text) => sendText(text, true),
})
voiceEl.addEventListener('click', () => {
  if (voice.state === 'idle') voice.start()
  else if (voice.state === 'recording') voice.stop()
  else if (voice.state === 'requesting') voice.cancel()
})
cancelVoiceEl.addEventListener('click', () => voice.cancel())
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && voice.state !== 'idle') { event.preventDefault(); voice.cancel() }
})

function typeInto(node, text, speed = 22) {
  let i = 0
  node.textContent = ''
  const timer = window.setInterval(() => {
    i += 1
    node.textContent = text.slice(0, i)
    logEl.scrollTop = logEl.scrollHeight
    if (i >= text.length) window.clearInterval(timer)
  }, speed)
}

function logMessage(kind, text, options = {}) {
  const node = document.createElement('div')
  node.className = 'msg ' + kind
  const time = document.createElement('span')
  time.className = 'msg-time'
  const now = new Date()
  time.textContent = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
  node.appendChild(time)
  const body = document.createElement('span')
  body.className = 'msg-body'
  node.appendChild(body)
  logEl.appendChild(node)
  if (options.animate && kind !== 'err') typeInto(body, text)
  else body.textContent = text
  logEl.scrollTop = logEl.scrollHeight
}

/** 半双工语音：录音前停止聊天 TTS，并丢弃已过期的异步结果。 */
speech = window.PetChatVoice.createSpeechPlayer({
  tts: (text, lang) => window.pet.tts(text, lang),
  blocked: () => closed || ['requesting', 'recording', 'stopping'].includes(voice.state),
  lipSync: (payload) => window.pet?.lipSync?.(payload),
  decode: (audio) => Uint8Array.from(atob(audio), (c) => c.charCodeAt(0)),
  Blob, Audio, URL,
  envelope: (bytes) => {
    try {
      const value = window.PetLipSync?.buildMouthEnvelope(bytes)
      return value ? { stepMs: value.stepMs, values: value.values } : null
    } catch { return null }
  },
})
function speak(text, lang) { return speech.speak(text, lang) }

async function sendText(text, fromVoice = false) {
  const say = String(text || '').trim()
  if (!say || busy || closed || (voice.state !== 'idle' && !(fromVoice && voice.state === 'transcribing'))) return
  inputEl.value = ''
  logMessage('user', say)
  busy = true
  updateControls()
  try {
    const result = await window.pet.send(say)
    if (closed) return
    if (result && result.ok) {
      logMessage('pet', result.say, { animate: true })
      if (result.say_ja) speak(result.say_ja, 'ja')
      else speak(result.say, 'zh')
    } else {
      logMessage('err', (result && result.error) || '出错了')
    }
  } catch (error) {
    logMessage('err', '发送失败，请检查模型配置后重试。')
  } finally {
    busy = false
    updateControls()
    if (!closed) inputEl.focus()
  }
}

document.getElementById('composer').addEventListener('submit', async (event) => {
  event.preventDefault()
  await sendText(inputEl.value)
})

function cleanup() {
  if (closed) return
  closed = true
  voice.dispose()
  speech.stop()
}
window.addEventListener('beforeunload', cleanup)
window.addEventListener('pagehide', cleanup)
document.getElementById('btnClose').addEventListener('click', () => {
  cleanup()
  if (window.pet && typeof window.pet.closeChatWindow === 'function') window.pet.closeChatWindow()
})

// 加载历史
async function loadHistory() {
  try {
    if (!window.pet || typeof window.pet.chatHistory !== 'function') return
    const result = await window.pet.chatHistory()
    for (const entry of (result && result.chat) || []) {
      logMessage(entry.role === 'user' ? 'user' : 'pet', entry.text)
    }
  } catch {
    /* ignore */
  }
}

loadHistory()
inputEl.focus()
