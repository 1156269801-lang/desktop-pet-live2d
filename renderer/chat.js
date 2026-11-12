'use strict'

/** 独立聊天窗：和主窗共用 window.pet.send，不依赖主窗 DOM。 */
const logEl = document.getElementById('log')
const inputEl = document.getElementById('input')
const sendEl = document.getElementById('send')
let busy = false

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

/** 独立聊天窗的语音：回复走主进程 GPT-SoVITS，播放完释放 */
let currentAudio = null
function sendLipSync(payload) {
  if (window.pet && typeof window.pet.lipSync === 'function') window.pet.lipSync(payload)
}
async function speak(text, lang) {
  const say = String(text || '').trim()
  if (!say || !window.pet || typeof window.pet.tts !== 'function') return
  try {
    const result = await window.pet.tts(say, lang)
    if (!result || !result.ok || !result.audio) return
    if (currentAudio) {
      try {
        currentAudio.pause()
        currentAudio.currentTime = 0
      } catch {
        /* ignore */
      }
      currentAudio = null
    }
    sendLipSync({ stop: true })
    const bytes = Uint8Array.from(atob(result.audio), (c) => c.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'audio/wav' })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    currentAudio = audio
    // 模型在主窗：这里只算口型包络，开始出声时交给主窗去动嘴
    let envelope = null
    try {
      envelope = window.PetLipSync ? window.PetLipSync.buildMouthEnvelope(bytes) : null
    } catch {
      envelope = null
    }
    const stop = () => {
      if (currentAudio === audio) sendLipSync({ stop: true })
    }
    if (envelope) {
      audio.addEventListener('playing', () => {
        if (currentAudio === audio) sendLipSync({ envelope: { stepMs: envelope.stepMs, values: envelope.values } })
      }, { once: true })
    }
    audio.addEventListener('ended', () => {
      URL.revokeObjectURL(url)
      stop()
      if (currentAudio === audio) currentAudio = null
    })
    audio.addEventListener('error', stop)
    audio.play().catch(stop)
  } catch {
    /* TTS 不可用不影响文字 */
  }
}

document.getElementById('composer').addEventListener('submit', async (event) => {
  event.preventDefault()
  const text = inputEl.value.trim()
  if (!text || busy) return
  inputEl.value = ''
  logMessage('user', text)
  busy = true
  sendEl.disabled = true
  try {
    const result = await window.pet.send(text)
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
    sendEl.disabled = false
    inputEl.focus()
  }
})

document.getElementById('btnClose').addEventListener('click', () => {
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
