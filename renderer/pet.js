'use strict'

/* 大肥鱼桌宠 — 渲染进程。
 *
 * 负责三件事：跑 Live2D 的帧循环、把 {say, emotion, motion} 变成表演、
 * 提供最小聊天界面。模型与运行时的加载路径和 DSH 里那份插件一致，
 * 只是这里由本机 HTTP 服务提供，不再需要改写 model3.json。
 */

const EMOTION_KEYS = {
  none: [],
  deadpan: ['key1'],   // 黑脸
  tears: ['key2'],     // 落泪
  spiral: ['key3'],    // 圈圈眼
  heart: ['key4'],     // 爱心眼
  squeeze: ['key5'],   // ＞＜
  smug: ['key6'],      // 屑屑眼
  blush: ['key7'],     // 脸红
  loading: ['key8'],   // 加载
  tooth: ['key9'],     // 大牙
  basin: ['key10'],    // 大钢盆
  glasses: ['key11'],  // 黑框眼镜
  monocle: ['key12'],  // 单片眼镜
  sweat: ['key13'],    // 流冷汗
}
const ALL_KEYS = Object.values(EMOTION_KEYS).flat()
const EYE_KEYS = ['key3', 'key4', 'key5', 'key6']
const MOTION_INDEX = { none: -1, wave: 0, raise: 1, drop: 2 }

/**
 * 这个模型有单个 drawable 用到 16 个遮罩，而 pixi 那套 Cubism 4.0 runtime 只有
 * 一个遮罩缓冲（最多 4 个遮罩），超出的部分被画成脸上那一小块黑方块。
 *
 * 试过用部件不透明度把它盖掉：写在 update 之前会被 model.update() 覆盖，
 * 写在 update 之后会破坏这一帧的部件层级（整个模型只剩后发）。所以这里保持
 * 空列表——干净的修法是把渲染层换成官方 Cubism framework（已随包放入
 * assets/sdk，见 renderer/live2d5.js 的进行中实现）。
 */
const HIDDEN_PARTS = []

const stage = document.getElementById('stage')
const barEl = document.getElementById('panel')
const barName = document.getElementById('panelCharacter')
const canvas = document.getElementById('view')
const bubble = document.getElementById('bubble')
const bubbleText = document.getElementById('bubbleText')
const menuButton = document.getElementById('menuButton')
const sceneBackground = document.getElementById('sceneBackground')
const APPEARANCE_KEY = 'pet-appearance-v1'
let appearance = window.PetAppearance.normalize()
try { appearance = window.PetAppearance.normalize(JSON.parse(localStorage.getItem(APPEARANCE_KEY) || '{}')) } catch (_) { /* restore defaults */ }
let appearanceStatus = ''
let appearanceGeneration = 0
let appearanceDraft = {...appearance}
const missingBackgrounds = new Set()
const statusEl = document.getElementById('status')
const dot = document.getElementById('dot')
const logEl = document.getElementById('log')
const chatEl = document.getElementById('chat')
const inputEl = document.getElementById('input')
const sendEl = document.getElementById('send')
const handleEl = document.getElementById('handle')
// Window sizing changes the viewport, never the character's reference height.
const MODEL_BASE_HEIGHT_KEY = 'pet-model-base-height-v1'
const INITIAL_MODEL_HEIGHT = (() => {
  let height = Math.max(320, Math.round(window.innerHeight * 0.42))
  try {
    const saved = Number(localStorage.getItem(MODEL_BASE_HEIGHT_KEY))
    if (Number.isFinite(saved) && saved >= 160 && saved <= 2000) height = saved
    localStorage.setItem(MODEL_BASE_HEIGHT_KEY, String(height))
  } catch (_) { /* storage unavailable */ }
  return height
})()

const activeKeys = new Set()
/** 调试/精细控制用的临时参数覆盖：{ [coreParameterId]: value } */
const overrides = new Map()
// Independent sources: an expiring click/blink can never delete an Agent or preset value.
const agentOverrides = new Map()
const presetOverrides = new Map()
const clickOverrides = new Map()
const pendingParamAcks = []
let characterRevision = ''
let headlessTest = false
/** 部件不透明度覆盖：{ [partId]: opacity } */
const partOverrides = new Map()
let model = null
let character = null
let scaleSaved = false
let app = null
let bubbleTimer = 0
let busy = false
let chatOpenEpoch = 0
let chatLogRevision = 0

function setDot(state) {
  dot.dataset.state = state
  const label = document.getElementById('quickStatus')
  if (label) { label.dataset.state = state; label.textContent = ({busy:'正在处理…',error:'操作未完成',ready:'可以互动'})[state] || '可以互动' }
  const chatState = document.getElementById('chatState')
  if (chatState) chatState.textContent = state === 'busy' ? '回复中…' : state === 'error' ? '请查看提示' : ''
}

function setStatus(text, isError) {
  statusEl.textContent = text || ''
  statusEl.dataset.error = isError ? 'true' : 'false'
}

/** 消息逐字出现的打字机效果（只用于刚到达的新消息，历史记录直接渲染） */
function typeInto(node, text, speed = 22) {
  let i = 0
  node.textContent = ''
  const timer = window.setInterval(() => {
    i += 1
    node.textContent = text.slice(0, i)
    if (logEl) logEl.scrollTop = logEl.scrollHeight
    if (i >= text.length) window.clearInterval(timer)
  }, speed)
}

function logMessage(kind, text, options = {}) {
  chatLogRevision += 1
  const node = document.createElement('div')
  node.className = 'msg ' + kind
  // 时间戳
  const time = document.createElement('span')
  time.className = 'msg-time'
  const now = new Date()
  time.textContent = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
  node.appendChild(time)
  const body = document.createElement('span')
  body.className = 'msg-body'
  node.appendChild(body)
  logEl.appendChild(node)
  const empty = document.getElementById('chatEmpty')
  if (empty) empty.hidden = true
  if (options.animate && kind !== 'err') typeInto(body, text)
  else body.textContent = text
  logEl.scrollTop = logEl.scrollHeight
  return node
}

/** 说话语言：ja=日语朗读（speech_ja），zh=中文朗读（speech） */
let ttsSayLanguage = 'ja'

/** 当前正在播放的语音（新语音先停旧的，避免叠音） */
let currentSpeechAudio = null

/**
 * 口型同步状态。两种来源：
 *   audio  主窗自己播放的语音，按 audio.currentTime 查包络
 *   remote 聊天窗播放的语音，包络经主进程转发过来，按本地时钟查
 */
const lipSync = {
  enabled: true,
  audio: null,
  envelope: null,
  remoteStartAt: 0,
  smoother: window.PetLipSync ? window.PetLipSync.createMouthSmoother() : null,
  lastAt: 0,
}
/** 嘴型略微提前于声音：平滑本身有几十毫秒滞后，且嘴先动比后动自然 */
const LIP_LEAD_SEC = 0.04
const LIP_GAIN = 0.95
const LIP_PARAM = 'ParamMouthOpenY'

function stopLipSync(audio) {
  if (audio && lipSync.audio !== audio) return
  lipSync.audio = null
  lipSync.envelope = null
  lipSync.remoteStartAt = 0
}

/** 聊天窗语音的口型：payload = { envelope } 开始，{ stop: true } 结束 */
function handleRemoteLipSync(payload) {
  if (!payload || payload.stop || !payload.envelope || !window.PetLipSync) {
    if (!lipSync.audio) stopLipSync()
    return
  }
  if (lipSync.audio) return
  lipSync.envelope = payload.envelope
  lipSync.remoteStartAt = performance.now()
}

/** 每帧：在表情/动作写完之后，把说话的张嘴幅度混进嘴参数 */
function applyLipSync(cubismModel, owned) {
  if (!lipSync.smoother || !model || !model.parameterById) return
  const now = performance.now()
  const dt = lipSync.lastAt ? (now - lipSync.lastAt) / 1000 : 0
  lipSync.lastAt = now
  let active = false
  let target = 0
  if (lipSync.envelope) {
    let time = -1
    if (lipSync.audio) {
      if (!lipSync.audio.paused && !lipSync.audio.ended) time = lipSync.audio.currentTime
    } else if (lipSync.remoteStartAt) {
      time = (now - lipSync.remoteStartAt) / 1000
      // 聊天窗没发来结束通知（比如窗口被关）时，按包络时长自行收尾
      if (time > lipSync.envelope.duration + 0.3) {
        stopLipSync()
        time = -1
      }
    }
    if (time >= 0) {
      active = true
      target = window.PetLipSync.sampleEnvelope(lipSync.envelope, time + LIP_LEAD_SEC)
    }
  }
  // 说话状态与音量也供生动层用（说话伴随动作），与口型开关无关
  lipSync.speaking = active
  lipSync.level = target
  const { level, weight } = lipSync.smoother.step(target, active && lipSync.enabled, dt)
  if (weight <= 0) return
  const p = model.parameterById.get(LIP_PARAM)
  // 编舞/模型自带动作正在驱动嘴时让位，不和它们抢
  if (!p || !p.writable || (owned && owned.has(LIP_PARAM)) || model.motionClaims.has(LIP_PARAM)) return
  const current = model.getParameterValue(LIP_PARAM)
  const base = Number.isFinite(current) ? current : p.default
  const open = p.default + (p.max - p.default) * level * LIP_GAIN
  model.setParameter(LIP_PARAM, Math.max(p.min, Math.min(p.max, base + (open - base) * weight)), cubismModel)
}

// ------------------------------------------------------------ 生动层 + 表演层
// 每帧最后执行，在当前值上叠加，所以不覆盖表情、视线和导演手势。
//   生动层  微动 + 说话伴随（liveliness.js）
//   表演层  意图级手势 + 持续情绪（acting.js）
const LIVELINESS_KEY = 'pet-liveliness'
let livelinessStrength = 1
try {
  const saved = Number(window.localStorage.getItem(LIVELINESS_KEY))
  if (window.localStorage.getItem(LIVELINESS_KEY) !== null && Number.isFinite(saved)) livelinessStrength = Math.max(0, Math.min(1.5, saved))
} catch (_) { /* storage may be unavailable */ }
const liveliness = window.PetLiveliness ? window.PetLiveliness.create() : null
const acting = window.PetActing ? window.PetActing.create() : null
let livelinessLastAt = 0
// 表演幅度：手势、情绪底姿和身体摆动的整体倍率
const ACTING_KEY = 'pet-acting-scale'
let actingScale = 1
try {
  const saved = Number(window.localStorage.getItem(ACTING_KEY))
  if (window.localStorage.getItem(ACTING_KEY) !== null && Number.isFinite(saved)) actingScale = Math.max(0, Math.min(2, saved))
} catch (_) { /* storage may be unavailable */ }
function setActingScale(value) {
  if (!Number.isFinite(value)) return
  actingScale = Math.max(0, Math.min(2, value))
  try { window.localStorage.setItem(ACTING_KEY, String(actingScale)) } catch (_) { /* ignore */ }
}
/** 表演层自己打开的模型表情；只关自己开的，不动用户在控制台里手动开的 */
const actingExpressions = new Set()
const actingDismissed = new Set()
function syncActingExpressions(names) {
  if (!model || !model.expressionParams) return
  const want = new Set(actingScale > 0 ? names : [])
  let changed = false
  for (const name of [...actingExpressions]) {
    // 被别处清掉了（清表情、点击反应）：忘掉它，并且在这次情绪/手势期间不再重开
    if (!expressionStack.includes(name)) { actingExpressions.delete(name); if (want.has(name)) actingDismissed.add(name); continue }
    if (want.has(name)) continue
    expressionStack.splice(expressionStack.indexOf(name), 1)
    actingExpressions.delete(name)
    changed = true
  }
  for (const name of [...actingDismissed]) if (!want.has(name)) actingDismissed.delete(name)
  for (const name of want) {
    if (actingExpressions.has(name) || actingDismissed.has(name) || expressionStack.includes(name)) continue
    if (!(model.expressionParams.get(name) || []).length) continue
    expressionStack.push(name)
    actingExpressions.add(name)
    changed = true
  }
  if (changed) applyExpressionStack()
}
/**
 * 通道 → 参数。bound 取角色专门绑定的输入参数；fallback 是 Cubism 标准参数名
 * （物理输出不可写，会被自动跳过）。degrees 的通道按 ±30 的量程换算。
 * boundSign / fallbackSign 把"画面方向"换成该参数的正负：本角色实测
 * AngleX 正=脸朝画面左、AngleY 正=低头；Cubism 标准 ParamAngleY 正=抬头。
 */
const ACTING_CHANNELS = {
  headX: { bound: 'headX', fallback: ['ParamAngleX'], degrees: true, boundSign: -1 },
  headY: { bound: 'headY', fallback: ['ParamAngleY'], degrees: true, fallbackSign: -1 },
  headZ: { bound: 'headZ', fallback: ['ParamAngleZ'], degrees: true },
  bodyX: { bound: 'bodyX', fallback: ['ParamBodyAngleX'], degrees: true },
  bodyY: { known: ['PositionY'], fallback: ['ParamBodyAngleY'], degrees: true },
  eyeX: { bound: 'eyeX', fallback: ['ParamEyeBallX'] },
  eyeY: { bound: 'eyeY', fallback: ['ParamEyeBallY'] },
  browL: { fallback: ['ParamBrowLY'] },
  browR: { fallback: ['ParamBrowRY'] },
  eyeOpen: { fallback: ['ParamEyeLOpen', 'ParamEyeROpen'] },
  mouthForm: { fallback: ['ParamMouthForm'] },
  eyeSmile: { known: ['EyeSmile'], fallback: ['ParamEyeLSmile', 'ParamEyeRSmile'] },
  // 上身前倾：本角色的 LeanInput 负值是向前俯身
  lean: { known: ['LeanInput'], fallback: ['ParamBodyAngleY'], degrees: true, boundSign: -1 },
  shock: { known: ['SHOCKEYE'], fallback: [] },
}

function setLiveliness(value) {
  if (!Number.isFinite(value)) return
  livelinessStrength = Math.max(0, Math.min(1.5, value))
  try { window.localStorage.setItem(LIVELINESS_KEY, String(livelinessStrength)) } catch (_) { /* ignore */ }
}

/** 做一个表演层手势；name 是 acting.js 里的 id */
function performGesture(name, options) {
  return Boolean(acting && acting.play(name, options || {}))
}

function setActingMood(name, intensity) {
  return Boolean(acting && acting.setMood(name, intensity))
}

function applyLiveliness(cubismModel, owned) {
  if (!model || !model.parameterById || (!liveliness && !acting)) return
  const now = performance.now()
  const dt = livelinessLastAt ? (now - livelinessLastAt) / 1000 : 0
  livelinessLastAt = now
  stepSpeechCues(now)
  const bindings = model.parameterCatalog?.bindings || {}
  const act = acting ? acting.step(dt) : { pose: {}, energy: 1, expressions: [] }
  syncActingExpressions(act.expressions || [])
  const live = liveliness && livelinessStrength > 0
    ? liveliness.step(now / 1000, dt, { speaking: Boolean(lipSync.speaking), level: lipSync.level || 0, nodSign: 1 })
    : null
  // 情绪改变微动和说话伴随的力度：开心更活泼，难过、犯困更沉
  const liveGain = livelinessStrength * act.energy
  for (const [role, channel] of Object.entries(ACTING_CHANNELS)) {
    const boundId = channel.bound && bindings[channel.bound]
    const knownIds = channel.known && channel.known.every((id) => model.parameterById.has(id)) ? channel.known : null
    const ids = boundId ? [boundId] : knownIds || channel.fallback
    const sign = boundId || knownIds ? channel.boundSign || 1 : channel.fallbackSign || 1
    const pose = (act.pose[role] || 0) * actingScale
    const micro = live ? (live.micro[role] || 0) * liveGain : 0
    const talk = live ? (live.speech[role] || 0) * liveGain : 0
    for (const id of ids) {
      const p = model.parameterById.get(id)
      if (!p || !p.writable || !(p.max > p.min)) continue
      // 编舞和模型自带动作是逐帧编排好的，不在上面加东西
      if ((owned && owned.has(id)) || model.motionClaims.has(id)) continue
      // 导演手势正在驱动的通道不叠说话伴随（避免两个点头相加）
      let delta = pose + micro + (directorRuntime.values.has(id) ? 0 : talk)
      if (!delta) continue
      delta *= sign * (channel.degrees ? (p.max - p.min) / 60 : 1)
      const current = model.getParameterValue(id)
      const base = Number.isFinite(current) ? current : p.default
      model.setParameter(id, Math.max(p.min, Math.min(p.max, base + delta)), cubismModel)
    }
  }
}

// ------------------------------------------------------------ 台词行内标记的时机
// 标记写在台词的某个字前面。有语音时按语音播放进度触发（动作落在那个字上）；
// 没有语音时按打字速度触发。
let ttsEnabled = false
let speechCueSet = null
/** 等语音合成的最长时间；超过就不等了，按打字速度走 */
const CUE_WAIT_MS = 9000
const CUE_CHAR_MS = 35

function scheduleSpeechCues(cues, length) {
  if (speechCueSet) for (const cue of speechCueSet.cues) if (!speechCueSet.fired.has(cue) && cue.type === 'mood') triggerDirectorCue(cue)
  speechCueSet = cues && cues.length
    ? { cues, length: Math.max(1, length), fired: new Set(), audio: null, startedAt: performance.now(), typingFrom: 0 }
    : null
  return speechCueSet
}

function stepSpeechCues(now) {
  const set = speechCueSet
  if (!set) return
  let progress = 0
  if (set.audio) {
    const duration = Number.isFinite(set.audio.duration) && set.audio.duration > 0 ? set.audio.duration : 0
    if (set.audio.ended || set.audio.error) progress = 1
    else if (duration) progress = (set.audio.currentTime + 0.12) / duration
  } else {
    if (!set.typingFrom && (!ttsEnabled || now - set.startedAt > CUE_WAIT_MS)) set.typingFrom = ttsEnabled ? now : set.startedAt
    if (set.typingFrom) progress = (now - set.typingFrom) / (set.length * CUE_CHAR_MS)
  }
  for (const cue of set.cues) {
    if (set.fired.has(cue) || cue.charIndex / set.length > progress) continue
    set.fired.add(cue)
    triggerDirectorCue(cue)
  }
  if (set.fired.size >= set.cues.length) speechCueSet = null
}

/** 说话：把台词交给主进程的 GPT-SoVITS 合成，拿回 wav 播放（失败不影响气泡） */
async function speak(text, lang) {
  const say = String(text || '').trim()
  if (!say) return
  if (!window.pet || typeof window.pet.tts !== 'function') return
  console.error('[speak]', lang, say.slice(0, 30))
  const cueSet = speechCueSet
  try {
    const result = await window.pet.tts(say, lang)
    if (!result || !result.ok || !result.audio) return
    if (currentSpeechAudio) {
      try {
        currentSpeechAudio.pause()
        currentSpeechAudio.currentTime = 0
      } catch {
        /* ignore */
      }
      currentSpeechAudio = null
    }
    stopLipSync()
    // 用 blob URL 播放，避免超长 data: 字符串把渲染进程压垮
    const bytes = Uint8Array.from(atob(result.audio), (c) => c.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'audio/wav' })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    currentSpeechAudio = audio
    if (cueSet && cueSet === speechCueSet && !cueSet.typingFrom) cueSet.audio = audio
    // 口型：播放前把整段音量包络算好（解析失败就只出声、不动嘴）
    let envelope = null
    try {
      envelope = window.PetLipSync ? window.PetLipSync.buildMouthEnvelope(bytes) : null
    } catch {
      envelope = null
    }
    if (envelope) {
      lipSync.audio = audio
      lipSync.envelope = envelope
      lipSync.remoteStartAt = 0
    }
    audio.addEventListener('ended', () => {
      URL.revokeObjectURL(url)
      if (currentSpeechAudio === audio) currentSpeechAudio = null
      stopLipSync(audio)
    })
    audio.addEventListener('error', () => stopLipSync(audio))
    audio.play().catch(() => stopLipSync(audio))
  } catch (error) {
    /* TTS 不可用时不打断气泡 */
  }
}

let bubbleTypeTimer = null

/** 触发导演标记：表情 / 动作 / 姿态 / 视线 / 清表情 */
function triggerDirectorCue(cue) {
  if (!cue) return
  if (cue.type === 'clearExpression') {
    clearExpressionNow()
    return
  }
  if (cue.type === 'perform') {
    performGesture(cue.name, { side: cue.side, intensity: cue.intensity })
    return
  }
  if (cue.type === 'mood') {
    setActingMood(cue.name, cue.intensity)
    return
  }
  if (cue.type === 'pose') {
    applyDirectorPose(cue.name)
    return
  }
  if (cue.type === 'gaze') {
    applyDirectorGaze(cue)
    return
  }
  if (cue.type === 'name') {
    if (playReaction(cue.name)) return
    if (playMotionByName(cue.name)) return
    applyExpressionAny(cue.name)
  }
}

function applyDirectorPose(name) {
  if (!model || !model.hasParameter) return
  const map = {
    tiltLeft: { AngleZ: 15 },
    tiltRight: { AngleZ: -15 },
    lookUp: { AngleY: -12 },
    lookDown: { AngleY: 12 },
    squint: { ParamEyeLOpen: 0.35, ParamEyeROpen: 0.35 },
    smile: { ParamMouthForm: 1 },
  }
  const set = map[name]
  if (!set) return
  for (const [id, value] of Object.entries(set)) {
    if (model.hasParameter(id)) fadeTo(id, value, 220)
  }
}

function applyDirectorGaze(cue) {
  if (!model || !model.hasParameter) return
  const x = Number(cue.x) || 0
  const y = Number(cue.y) || 0
  if (model.hasParameter('ParamEyeBallX')) fadeTo('ParamEyeBallX', x, 160)
  if (model.hasParameter('ParamEyeBallY')) fadeTo('ParamEyeBallY', -y, 160)
  if (model.hasParameter('AngleX')) fadeTo('AngleX', x * 8, 220)
  if (model.hasParameter('AngleY')) fadeTo('AngleY', -y * 8, 220)
}

/** 按名字模糊找 motion（"竖手指" → "竖手指切出来动画"） */
function playMotionByName(keyword) {
  if (!model || !Array.isArray(model.motionMeta) || !keyword) return false
  const item = model.motionMeta.find((m) => m.name === keyword)
    || model.motionMeta.find((m) => String(m.name || '').includes(keyword))
  if (!item) return false
  return model.playMotion(item.group, item.index)
}

function showBubble(text, ms = 6500, sayJa = '') {
  if (!text || !bubbleEnabled) return
  console.error('[showBubble]', String(text).slice(0, 30))
  const parsed = window.PetDirectorMarkup
    ? window.PetDirectorMarkup.parseMarkup(text)
    : { speech: String(text), cues: [] }
  const speech = parsed.speech || String(text)
  if (bubbleTypeTimer) {
    window.clearInterval(bubbleTypeTimer)
    bubbleTypeTimer = null
  }
  bubble.hidden = false
  scheduleSpeechCues(parsed.cues, speech.length)
  // 默认日语朗读；没有日语版时退回中文
  if (sayJa) speak(sayJa, 'ja')
  else speak(speech, 'zh')
  if (parsed.cues.length) {
    // 有标记：逐字显示；动作由 stepSpeechCues 按语音进度触发
    let i = 0
    if (bubbleText) bubbleText.textContent = ''
    else bubble.textContent = ''
    placeBubble()
    bubbleTypeTimer = window.setInterval(() => {
      i += 1
      if (bubbleText) bubbleText.textContent = speech.slice(0, i)
      else bubble.textContent = speech.slice(0, i)
      if (i >= speech.length) {
        window.clearInterval(bubbleTypeTimer)
        bubbleTypeTimer = null
      }
    }, 35)
    if (bubbleTimer) clearTimeout(bubbleTimer)
    bubbleTimer = window.setTimeout(() => {
      bubble.hidden = true
      if (bubbleTypeTimer) {
        window.clearInterval(bubbleTypeTimer)
        bubbleTypeTimer = null
      }
    }, Math.max(ms, speech.length * 35 + 2500))
    return
  }
  // 无标记：原样一次性显示
  if (bubbleText) bubbleText.textContent = speech
  else bubble.textContent = speech
  placeBubble()
  if (bubbleTimer) clearTimeout(bubbleTimer)
  bubbleTimer = window.setTimeout(() => {
    bubble.hidden = true
  }, ms)
}

function applyEmotion(name) {
  const keys = Object.hasOwn(EMOTION_KEYS, name) ? EMOTION_KEYS[name] : []
  const eyeRequested = keys.some((key) => EYE_KEYS.includes(key))
  if (eyeRequested) for (const key of EYE_KEYS) activeKeys.delete(key)
  for (const key of keys) activeKeys.add(key)
  // 非眼型的表情允许叠加，但换表情时先清掉上一次的非眼型开关。
  for (const key of [...activeKeys]) {
    if (!keys.includes(key) && !EYE_KEYS.includes(key)) activeKeys.delete(key)
  }
}

function playMotion(name) {
  const index = MOTION_INDEX[name]
  if (!model || index === undefined || index < 0) return
  try {
    model.playMotion('Wave', index)
  } catch (error) {
    console.error('[pet] 动作失败', error)
  }
}

function perform(payload) {
  if (!payload) return
  // 表情统一走 applyExpressionAny：优先真 exp3，回退 key 开关
  if (payload.emotion) applyExpressionAny(payload.emotion)
  if (payload.motion) playMotion(payload.motion)
  // 台词由 director-runtime 的 speech 回调显示（带日语朗读版），这里不再重复显示
}

// ------------------------------------------------------------------ engine

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const element = document.createElement('script')
    element.src = src
    element.onload = () => resolve()
    element.onerror = () => reject(new Error('加载失败: ' + src))
    document.head.appendChild(element)
  })
}

async function bootEngine() {
  setDot('busy')
  setStatus('加载形象…')
  await loadScript('/assets/vendor/live2dcubismcore.min.js')
  await loadScript('/assets/sdk/cubism5-framework.js')
  await loadScript('/live2d5.js')

  const width = Math.max(240, stage.clientWidth)
  const height = Math.max(280, stage.clientHeight)
  canvas.width = width
  canvas.height = height

  // 角色由主进程记账：characters/<id>/manifest.json，换角色只换这个 baseUrl
  const info = await window.pet.ready()
  headlessTest = Boolean(info.headless)
  if (info.tts && info.tts.sayLanguage) ttsSayLanguage = info.tts.sayLanguage
  if (info.tts) lipSync.enabled = info.tts.lipSync !== false
  if (info.tts) ttsEnabled = info.tts.enabled !== false
  character = info.character || {
    id: 'dafeiyu',
    name: '大肥鱼',
    speech: [],
    defaultScale: { x: 1, y: 1 },
    baseUrl: '/characters/dafeiyu/model3.json',
  }
  // loadScale 优先恢复上次实际大小，缺失时才使用保存的默认值，
  // 这里绝不能再拿 manifest 的 defaultScale 去覆盖，否则每次启动比例都会被拽回旧值。

  await loadCharacter(character)
  startLoop()

  setDot('ready')
  setStatus('')
  // Local animation preview does not require an API key; do not leave an error banner on the desktop.
  if (!info.hasKey) setStatus('')
  return info
}

/** 载入（或换掉）一个角色：销毁旧模型 → 新建 → 应用缩放与参数通道 */
async function loadCharacter(next) {
  directorRuntime.cancel('character-changed')
  directorRuntime.clearWardrobe()
  directorReleased.clear()
  window.pet.report({ type: 'model-loading' })
  showToken += 1
  showRunning = false
  clearPulses()
  fades.clear()
  overrides.clear()
  agentOverrides.clear()
  presetOverrides.clear()
  activeKeys.clear()
  partOverrides.clear()
  motionByFile = null
  lastExpressionKeys = null
  lastExpressionName = null
  resetGazeMotion()
  characterRevision = next.id + ':' + Date.now() + ':' + Math.random().toString(36).slice(2)
  character = next
  if (model) {
    try {
      model.release()
    } catch (error) {
      /* 旧模型已经释放过 */
    }
    model = null
  }
  const width = Math.max(240, stage.clientWidth)
  const height = Math.max(280, stage.clientHeight)
  canvas.width = width
  canvas.height = height
  model = new window.Cubism5Model(canvas, { baseModelHeight: baseModelHeight(), characterId: next.id })
  model.resize(width, height)
  await model.load(next.baseUrl)
  // 换角色时直接把渲染比例对齐目标值，不要播一段"从 1 缓动到目标"的动画
  renderScale.x = viewScale.x
  renderScale.y = viewScale.y
  if (model) {
    model.scaleX = renderScale.x
    model.scaleY = renderScale.y
  }
  applyScale(true)
  captureExpressionBase()
  // C3：模型就绪后启动待机导演
  if (!headlessTest) scheduleIdleDirector()
  // 模型就绪后主动推一次能力清单，capabilities 就不用等首次请求
  window.setTimeout(() => {
    if (model && window.pet && typeof window.pet.report === "function") {
      try {
        window.pet.report({ type: "capabilities", data: dumpCapabilities() })
      } catch (error) {
        /* ignore */
      }
    }
  }, 600)
  if (!modelPos) loadModelPos()
  applyModelPos(false)
  placeBubble()
  // 自带 ParamBreath 的模型，程序化起伏压到 35%（参数呼吸 + 物理已经够了）；
  // 没有的就用满力度，保证"总有一口气在"。
  model.breathStrength = baseBreathStrength() * breathFactor
  model.onBeforePhysics = (cubismModel) => {
    // director 运行期间暂停待机 motion，避免手势和待机各驱动一半手部参数叠加
    model.suspendIdle = directorRuntime.running
    for (const [id, value] of directorReleased) model.setParameter(id, value, cubismModel)
    directorReleased.clear()
    // 手部贴图兜底：没有动作驱动时固定成"默认手"（Param56=1, Param57=0）
    if (!model.motionClaims.has('Param56')) model.setParameter('Param56', 1, cubismModel)
    if (!model.motionClaims.has('Param57')) model.setParameter('Param57', 0, cubismModel)
    const owned = choreoOwned()
    applyIdleLife(cubismModel, owned)
    applyGaze(cubismModel, owned)
    const motionOwns = (id) => model.motionClaims.has(id)
    const put = (id, value) => {
      const p = model.parameterById.get(id)
      if (p && p.writable) model.setParameter(id, Math.max(p.min, Math.min(p.max, value)), cubismModel)
    }
    for (const [id, value] of blinkValues) {
      if (!motionOwns(id) && !clickOverrides.has(id) && !overrides.has(id) && !presetOverrides.has(id)) put(id, value)
    }
    for (const [id, value] of clickOverrides) if (!motionOwns(id)) put(id, value)
    for (const key of activeKeys) if (!motionOwns(key)) put(key, 1)
    for (const [id, value] of overrides) if (!motionOwns(id)) put(id, value)
    for (const [id, value] of presetOverrides) if (!motionOwns(id)) put(id, value)
    for (const [id, value] of agentOverrides) put(id, value)
    for (const [id, value] of directorRuntime.wardrobe) put(id, value)
    for (const [id, value] of directorRuntime.values) put(id, value)
    if (choreo.active) {
      choreo.apply((id, value) => {
        if (model.hasParameter(id)) model.setParameter(id, value, cubismModel)
      })
    }
    applyLipSync(cubismModel, owned)
    applyLiveliness(cubismModel, owned)
  }
  model.onSample = sampleAnimationFrame
  if (barName) barName.textContent = next.name || next.id || '角色'}

let loopStarted = false

/**
 * 静止时的"活着"的感觉：呼吸 + 尾巴轻摆 + 耳朵抖动。
 * 参数名按模型实际的参数表来（导入的模型往往没有 ParamBreath / 尾巴骨），
 * 没有的项就换成通用参数或直接跳过。
 */
// ------------------------------------------------------------ 视线跟随鼠标

const GAZE_KEY = 'pet-gaze-follow'
const GAZE_RANGE_KEY = 'pet-gaze-range'
let gazeEnabled = true
// Relative input amplitude, not geometric rotation degrees.
let gazeStrength = 1
let gazeBody = 0.35
let gazeSpeed = 1
// 归一化方向（-1..1）与平滑后的当前值
const gaze = { x: 0, y: 0, targetX: 0, targetY: 0 }
const gazeHead = { x: 0, y: 0 }
const gazeBodyState = { x: 0 }
let controlledGaze = null
const directorReleased = new Map()
const directorRuntime = window.PetDirectorRuntime.create({
  now: () => performance.now(),
  expression: (name) => name ? applyExpressionAny(name) : clearExpressionNow(),
  speech: (text, sayJa) => showBubble(text, 6500, sayJa || ''),
  // 释放参数时用渐变回默认，避免瞬间跳变导致手部贴图残影
  release: (ids) => { for (const id of ids) { const p = model?.parameterById.get(id); if (p?.writable) fadeTo(id, p.default, 200) } },
  report: (result) => window.pet.report({ type: 'director-status', result }),
})
function localDirectorCapabilities(displays = []) {
  const c = dumpCapabilities()
  return window.PetDirectorContract.buildCapabilities({ characterId: c.character?.id, characterRevision, params: c.params, motions: c.motions, expressions: c.expressions, displays })
}
const clickVariants = { head: ['original', 'nod', 'tilt', 'wink'], face: ['original', 'surprise', 'wink', 'shake'], body: ['original', 'wave', 'nod', 'tilt'], leg: ['original', 'shake', 'surprise', 'tilt'] }
const clickCounts = {}
let lastCursorAt = 0
const GAZE_V2_KEY = 'pet-gaze-v2'
let cursorPos = null

function loadGazePref() {
  try {
    const raw = window.localStorage.getItem(GAZE_KEY)
    if (raw !== null) gazeEnabled = raw === '1'
    const range = window.localStorage.getItem(GAZE_RANGE_KEY)
    if (range !== null) {
      const value = Number(range)
      if (Number.isFinite(value)) gazeStrength = Math.min(2, Math.max(0, value))
    }
    const saved = JSON.parse(window.localStorage.getItem(GAZE_V2_KEY) || 'null')
    if (saved && saved.version === 2) {
      gazeEnabled = saved.enabled !== false
      if (Number.isFinite(saved.strength)) gazeStrength = Math.max(0, Math.min(1.5, saved.strength))
      if (Number.isFinite(saved.body)) gazeBody = Math.max(0, Math.min(1, saved.body))
      if (Number.isFinite(saved.speed)) gazeSpeed = Math.max(0.5, Math.min(2, saved.speed))
    } else {
      window.localStorage.setItem('pet-gaze-v1-backup', JSON.stringify({ enabled: raw, range }))
      gazeStrength = Math.min(1, gazeStrength)
      saveGazePref()
    }
  } catch (error) {
    /* ignore */
  }
}

loadGazePref()

function saveGazePref() {
  try {
    window.localStorage.setItem(GAZE_V2_KEY, JSON.stringify({ version: 2, enabled: gazeEnabled, strength: gazeStrength, body: gazeBody, speed: gazeSpeed }))
  } catch (_) { /* storage may be unavailable */ }
}

function changeGazePref(values) {
  if (typeof values.enabled === 'boolean') gazeEnabled = values.enabled
  if (Number.isFinite(values.strength)) gazeStrength = Math.max(0, Math.min(1.5, values.strength))
  if (Number.isFinite(values.body)) gazeBody = Math.max(0, Math.min(1, values.body))
  if (Number.isFinite(values.speed)) gazeSpeed = Math.max(0.5, Math.min(2, values.speed))
  saveGazePref()
  syncGazeRangeUi()
  if (gazeToggle) gazeToggle.checked = gazeEnabled
  reportSettingsState()
}

function resetGazeMotion() {
  gaze.x = gaze.y = gaze.targetX = gaze.targetY = 0
  gazeHead.x = gazeHead.y = gazeBodyState.x = 0
  cursorPos = null
  lastCursorAt = 0
}

/**
 * 鼠标位置 → 归一化方向。
 * 用屏幕坐标（不是窗口坐标）：范围按屏幕算，窗口挪位置、鼠标在窗口外都不影响，
 * 也修掉了「鼠标没到窗口顶就满仰、到底也不低头」的窗口尺寸依赖。
 * 原点 = 模型脸部在屏幕上的位置（窗口屏幕坐标 + 模型窗口内坐标）。
 */
function updateGazeTarget(screenX, screenY) {
  if (!gazeEnabled || !modelPos || !Number.isFinite(screenX) || !Number.isFinite(screenY)) return
  const scr = window.screen || {}
  const screenW = scr.availWidth || scr.width || 1280
  const screenH = scr.availHeight || scr.height || 800
  // 屏幕 35% 宽 / 38% 高内视为满偏
  const rangeX = Math.max(320, screenW * 0.35)
  const rangeY = Math.max(240, screenH * 0.38)
  const cx = window.screenX + modelPos.x
  // 视线中性点靠近脸，不是躯干中心
  const faceY = window.screenY + modelPos.y - modelScreenSize().h * 0.27
  const dx = (screenX - cx) / rangeX
  const dy = (screenY - faceY) / rangeY
  gaze.targetX = Math.max(-1, Math.min(1, dx))
  gaze.targetY = Math.max(-1, Math.min(1, dy))
}

// ============================ 点击手感：脉冲动画层 ============================
// 独立的短动画来源，使用已核对的物理输入；显式参数、动作和预设优先。

const pulses = new Map()
const holdTimers = new Map()

/** 一次衰减振荡：起步即最大，回弹一次，归零 */
function pulse(paramId, amp, dur = 650, freq = 1.4, damp = 3.5) {
  if (!model) return
  if (!model.parameterById.get(paramId)?.writable) return
  pulses.set(paramId, { amp, dur, freq, damp, t0: performance.now() })
}

/** 保持型设置（不是脉冲），返回一个用于清理的 key */
function hold(paramId, value, ms, onDone) {
  if (!model) return
  if (typeof model.hasParameter === 'function' && !model.hasParameter(paramId)) return
  if (!model.parameterById.get(paramId)?.writable) return
  holdTimers.set(paramId, { value, until: performance.now() + ms, onDone })
}

// 渐变：表情切换时让参数在 200ms 内平滑过去，而不是瞬间跳变
const fades = new Map()

function fadeTo(paramId, to, dur = 200, release = false) {
  if (!model) return
  if (typeof model.hasParameter === 'function' && !model.hasParameter(paramId)) return
  let from = 0
  if (overrides.has(paramId)) from = Number(overrides.get(paramId)) || 0
  else if (typeof model.getParameterValue === 'function') {
    const cur = model.getParameterValue(paramId)
    from = Number.isFinite(cur) ? cur : 0
  }
  fades.set(paramId, { from, to: Number(to) || 0, t0: performance.now(), dur: Math.max(60, dur), release })
}

function stepFades() {
  if (!fades.size) return
  const now = performance.now()
  for (const [id, f] of fades) {
    const raw = (now - f.t0) / f.dur
    if (raw >= 1) {
      if (f.release) overrides.delete(id)
      else overrides.set(id, f.to)
      fades.delete(id)
      continue
    }
    // easeInOutQuad：起步和收尾都缓，中间快
    const e = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2
    overrides.set(id, f.from + (f.to - f.from) * e)
  }
}

function stepPulses() {
  clickOverrides.clear()
  const now = performance.now()
  for (const [id, h] of holdTimers) {
    if (now >= h.until) {
      holdTimers.delete(id)
      if (typeof h.onDone === 'function') h.onDone()
    } else clickOverrides.set(id, h.value)
  }
  for (const [id, p] of pulses) {
    const elapsed = now - p.t0
    if (elapsed > p.dur) {
      // 必须删，否则参数永久残留（她会被卡在歪头/眯眼）
      pulses.delete(id)
      continue
    }
    const pdef = model.parameterById.get(id)
    const v = window.PetAnimationMath.pulseValue(p, elapsed)
    clickOverrides.set(id, (pdef?.default || 0) + v)
  }
}

/** 清空所有点击动画（show 打断 / reset 时用） */
function clearPulses() {
  pulses.clear()
  holdTimers.clear()
  clickOverrides.clear()
}

// ---------------------------------------------------------------- 眨眼
// 模型声明了 EyeBlink 组，但 ParamEyeLOpen/ROpen 从没被驱动过——她现在不眨眼。
let nextBlinkAt = 0
let blinking = false
let blinkStartedAt = 0
const blinkValues = new Map()

function stepBlink() {
  if (!model) return
  const now = performance.now()
  blinkValues.clear()
  if (!nextBlinkAt) {
    nextBlinkAt = now + 2500 + Math.random() * 3000
    return
  }
  if (now < nextBlinkAt && !blinking) return
  if (!blinking) { blinking = true; blinkStartedAt = now }
  const t = now - blinkStartedAt
  if (t >= 210) {
    blinking = false
    nextBlinkAt = now + 2500 + Math.random() * 3500
    return
  }
  const value = t < 70 ? 1 - t / 70 : t < 95 ? 0 : (t - 95) / 115
  blinkValues.set('ParamEyeLOpen', value)
  blinkValues.set('ParamEyeROpen', value)
}

// ------------------------------------------------------- 点击手感：按部位播放
const CLICK_ANIM = {
  head() {
    // 摸头：脸颊轻颤 + 眯眼笑 + 嘴角上扬 + 头微下压偏一侧
    pulse('AngleY', -5, 700, 0.7, 2.8)
    pulse('AngleZ', -5, 750, 1.1, 3.2)
    hold('EyeSmile', 0.75, 800)
    hold('LEyeSquint', 0.45, 800)
    hold('REyeSquint', 0.45, 800)
    hold('ParamMouthForm', 0.4, 800)
  },
  face(side) {
    // 戳脸：惊讶眼快弹 + 对应侧脸颊抖 + 反向躲
    pulse('SHOCKEYE', 1, 460, 0.7, 2.8)
    pulse('CheeckPuff', 0.45, 520, 0.6, 3)
    pulse('MouthFunnel', 0.7, 480, 0.7, 2.8)
    pulse('AngleZ', side < 0 ? 9 : -9, 780, 1.1, 3)
    pulse('AngleX', side < 0 ? 6 : -6, 680, 0.8, 3)
  },
  body(side) {
    // 戳身体：身体侧倾（阻尼），髋部反向补偿，头晚一点跟
    pulse('PositionX', side < 0 ? 5 : -5, 850, 0.8, 2.8)
    pulse('AngleZ', side < 0 ? 4 : -4, 780, 1.1, 3.2)
  },
  leg(side) {
    // 戳腿：侧闪 + 身体反向 + 惊讶眼
    pulse('PositionX', side < 0 ? 7 : -7, 850, 0.7, 2.8)
    pulse('AngleX', side < 0 ? -5 : 5, 750, 0.9, 3)
    pulse('SHOCKEYE', 0.8, 460, 0.7, 2.8)
  },
}

/** 按部位播一次点击动画；side<0 表示点在模型中心左侧 */
function playClickAnim(zone, side) {
  const fn = CLICK_ANIM[zone]
  if (!fn) return
  directorRuntime.cancel('touch-interrupted')
  const choices = clickVariants[zone], choice = choices[(clickCounts[zone] || 0) % choices.length]
  clickCounts[zone] = (clickCounts[zone] || 0) + 1
  if (choice !== 'original') {
    const caps = localDirectorCapabilities(), gesture = caps.gestures.find(g => g.id === choice)
    if (gesture) {
      const checked = window.PetDirectorContract.validatePlan({ version: 1, characterRevision, cues: [{ at: 0, kind: 'gesture', name: choice, intensity: 0.8 }] }, caps)
      if (checked.ok) {
        model.stopMotions(); clearPulses(); clearExpressionNow()
        directorRuntime.start(checked.plan, caps, 'touch-' + performance.now())
        interactionActiveUntil = performance.now() + gesture.durationMs
        return
      }
    }
  }
  interactionActiveUntil = performance.now() + 900
  try {
    fn(side)
  } catch (error) {
    /* 参数缺失时静默跳过 */
  }
}

/** 每帧缓动，避免眼睛"啪"地跳过去 */
function stepGaze(dt) {
  const target = directorRuntime.gaze
  let direct = controlledGaze
  if (target?.space === 'direction') direct = target
  else if (target?.space === 'screen') { updateGazeTarget(target.x, target.y); direct = { x: gaze.targetX, y: gaze.targetY } }
  if (cursorPos && !direct) updateGazeTarget(cursorPos.x, cursorPos.y)
  const fresh = direct || (lastCursorAt && Date.now() - lastCursorAt < 800)
  const x = (gazeEnabled || target) && fresh ? (direct ? direct.x : gaze.targetX) : 0
  const y = (gazeEnabled || target) && fresh ? (direct ? direct.y : gaze.targetY) : 0
  const approach = window.PetAnimationMath.approach
  gaze.x = approach(gaze.x, x, 18 * gazeSpeed, dt)
  gaze.y = approach(gaze.y, y, 18 * gazeSpeed, dt)
  gazeHead.x = approach(gazeHead.x, x, 8 * gazeSpeed, dt)
  gazeHead.y = approach(gazeHead.y, y, 8 * gazeSpeed, dt)
  gazeBodyState.x = approach(gazeBodyState.x, x, 4 * gazeSpeed, dt)
}

function claimed(id) {
  return agentOverrides.has(id) || presetOverrides.has(id) || overrides.has(id) || clickOverrides.has(id) || activeKeys.has(id) || model.motionClaims.has(id)
}

/** 写进头部/眼球参数（模型有什么就用什么） */
function applyGaze(cubismModel, owned) {
  if (!model?.parameterCatalog?.bindings || !model.parameterById || !model.hasParameter) return
  const put = (role, value) => {
    const id = model.parameterCatalog.bindings[role]
    const p = model.parameterById.get(id)
    if (p && !claimed(id) && !(owned && owned.has(id))) model.setParameter(id, Math.max(p.min, Math.min(p.max, p.default + value)), cubismModel)
  }
  const amp = 18 * gazeStrength
  const eye = Math.min(0.8, gazeStrength * 0.75)
  // 眼球：-1..1，幅度再大也不会超出眼白
  put('eyeX', gaze.x * eye)
  put('eyeY', -gaze.y * eye)
  // 头部：保守的模型输入幅度；物理输出及屏幕旋转不等同于此数值。
  put('headX', gazeHead.x * amp)
  put('headY', -gazeHead.y * amp * 0.65)
  // 身体带一点点，看起来不像只有头在转
  put('bodyX', gazeBodyState.x * 8 * gazeStrength * gazeBody)
}

window.addEventListener('mousemove', (event) => {
  // 窗口能收到 mousemove 时用真实坐标（比 60ms 轮询更跟手）
  cursorPos = { x: event.screenX, y: event.screenY }
  lastCursorAt = Date.now()
  updateGazeTarget(event.screenX, event.screenY)
})

// 方案 D：右键打开独立快捷菜单（替代 ☰ 按钮），弹到鼠标位置；再右键关闭
window.addEventListener('contextmenu', (event) => {
  event.preventDefault()
  if (!window.pet || typeof window.pet.openPanelWindow !== 'function') return
  window.pet.openPanelWindow(event.screenX, event.screenY).then((result) => {
    // 已经是打开的（reused）→ 再右键就当关闭
    if (result && result.reused && typeof window.pet.closePanelWindow === 'function') {
      window.pet.closePanelWindow()
    }
  }).catch(() => {})
})

function applyIdleLife(cubismModel, owned) {
  if (!model) return
  const t = performance.now() / 1000
  const put = (id, value) => {
    const p = model.parameterById.get(id)
    if (p && p.writable && !claimed(id) && !(owned && owned.has(id))) model.setParameter(id, Math.max(p.min, Math.min(p.max, value)), cubismModel)
  }

  // 呼吸
  const breath = 0.5 + 0.5 * Math.sin(t * 1.35)
  if (model.hasParameter('ParamBreath')) {
    put('ParamBreath', breath)
  } else {
    // 没有呼吸参数就退化成身体/头部极轻微的起伏
    put('ParamBodyAngleZ', Math.sin(t * 1.1) * 1.6)
    put('ParamAngleZ', Math.sin(t * 1.35) * 1.2)
    put('ParamBodyAngleY', Math.sin(t * 1.35) * 1.8)
  }

  // 尾巴：只有存在这些骨骼参数时才摆
  for (let i = 0; i < 6; i += 1) {
    const id = 'Param_Angle_Rotation' + (84 + i)
    if (model.hasParameter(id)) {
      put(id, Math.sin(t * 0.9 - i * 0.42) * (2.2 + i * 0.5))
    }
  }

  // 耳朵
  const ear = Math.sin(t * 0.55) * 3
  const ear2 = Math.sin(t * 0.55 + 0.6) * 3
  for (const id of ['LEar1', 'LEar2', 'LEar3']) put(id, ear)
  for (const id of ['REar1', 'REar2', 'REar3']) put(id, ear2)

  window.__idleDebug = {
    breath: Number(breath.toFixed(3)),
    ear: Number(ear.toFixed(3)),
    native: model.hasParameter('ParamBreath'),
  }
}

// ---- B1/B2：帧率门控与被遮挡暂停 ----
const FPS_IDLE = 30
const FPS_ACTIVE = 60
let minFrameInterval = 1000 / FPS_IDLE
let interactionActiveUntil = 0
let paused = false

/** 演出开始/结束时切换帧率（runShow 调用） */
function setRenderFps(active) {
  minFrameInterval = 1000 / (active ? FPS_ACTIVE : FPS_IDLE)
}

function startLoop() {
  if (loopStarted) return
  loopStarted = true
  let last = 0
  let frames = 0
  let fpsAt = performance.now()
  let lastDraw = 0
  const loop = (now) => {
    if (headlessTest) window.setTimeout(() => loop(performance.now()), 8)
    else requestAnimationFrame(loop)
    // B1：帧率门控。待机 30fps 足够，演出时切到 60fps 保观感。
    // 只跳过这一帧，不碰参数写入顺序（C7 高压线）。
    const interval = now < interactionActiveUntil ? Math.min(minFrameInterval, 1000 / FPS_ACTIVE) : minFrameInterval
    if (now - lastDraw < interval) return
    lastDraw = now
    const elapsed = last ? (now - last) / 1000 : 1 / 60
    const gazeDt = elapsed > 0.5 ? 1 / 60 : elapsed
    const delta = Math.min(gazeDt, 0.05)
    last = now
    frames += 1
    if (now - fpsAt >= 1000) {
      window.__petFps = Math.round((frames * 1000) / (now - fpsAt))
      frames = 0
      fpsAt = now
    }
    if (document.hidden || !model) return
    // B2：被遮挡/最小化时暂停；但演出期间绝不暂停（否则 agent 会等到超时）
    if (paused && !showRunning && !directorRuntime.running) return
    try {
      // Also catch DPR-only and late native geometry changes between resize events.
      const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
      if (handleEl.hidden && (model.size.width !== innerWidth || model.size.height !== innerHeight || model.pixelRatio !== ratio)) resize()
      stepScaleEasing()
      directorRuntime.step()
      // 编舞/导演驱动时参数变化快，局部清屏会留残影 → 让渲染层整块清
      if (model) model.forceFullClear = choreo.active || directorRuntime.running
      if (choreo.active) {
        const finished = choreo.tick(delta * 1000)
        if (finished && finished.status === 'completed') {
          window.pet.report({ type: 'choreo-done', id: finished.id })
        }
      }
      stepGaze(gazeDt)
      stepFades()
      stepPulses()
      stepBlink()
      for (const [id, value] of partOverrides) model.setPartOpacity(id, value)
      model.update(delta)
      model.draw()
      directorRuntime.afterFrame()
      while (pendingParamAcks.length) {
        const ack = pendingParamAcks.shift()
        const sameCharacter = ack.characterRevision === characterRevision
        window.pet.report({ type: 'param-applied', requestId: ack.requestId, result: sameCharacter
          ? { ok: true, status: 200, applied: true, characterRevision, set: ack.set, reset: ack.reset }
          : { ok: false, status: 409, code: 'CHARACTER_CHANGED' } })
      }
    } catch (error) {
      console.error('[pet] 帧失败', error)
    }
  }
  if (headlessTest) window.setTimeout(() => loop(performance.now()), 8)
  else requestAnimationFrame(loop)
}

function fitModel() {
  if (!model) return false
  const width = Math.max(240, stage.clientWidth)
  const height = Math.max(280, stage.clientHeight)
  return model.resize(width, height)
}

function resize() {
  if (!handleEl.hidden) return
  const changed = fitModel()
  if(modelPos&&model){
    syncScaleSliderLimits()
    const limit = maxScale()
    viewScale.x = Math.min(viewScale.x, limit)
    viewScale.y = Math.min(viewScale.y, limit)
    renderScale.x = Math.min(renderScale.x, limit)
    renderScale.y = Math.min(renderScale.y, limit)
    model.scaleX = renderScale.x
    model.scaleY = renderScale.y
    applyScale(false)
    const size=modelScreenSize(),mx=Math.min(window.innerWidth/2,size.w/2+20),my=Math.min(window.innerHeight/2,size.h/2+20)
    modelPos.x=Math.max(mx,Math.min(window.innerWidth-mx,modelPos.x))
    modelPos.y=Math.max(my,Math.min(window.innerHeight-my,modelPos.y))
    // Persist the accepted size/viewport too: otherwise shrink → grow → restart
    // revives an older scale and rescales an old position against the new viewport.
    saveScale()
    applyModelPos(true)
    // Redraw the resized buffer in the same callback, before browser paint.
    if (changed && model.ready) model.draw()
  }
  // 窗口尺寸变了以后把 ☰ 拉回可视范围
  if (menuPos && menuButton) placeMenuButton(menuPos.x, menuPos.y, false)
}

new ResizeObserver(() => resize()).observe(stage)
window.addEventListener('resize', resize)

// ------------------------------------------------------------- model scale

/**
 * 只缩放模型本身：canvas 与窗口尺寸都不变，模型按比例画大/画小，
 * 超出画布的部分被裁掉（想看得全就把窗口拉大）。
 */
const SCALE_KEY = 'pet-model-scale'
const DEFAULT_SCALE_KEY = 'pet-model-scale-default'
const SCALE_MIN = 0.4
const SCALE_MAX = 2.6
// 等比锁：开着时 x / y 恒相等（滑杆、滚轮、控制口都遵守）
let lockAspect = true
// 启动时如果本地没有"上次的大小"，就用这里保存的默认值
let savedDefaultScale = { x: 1, y: 1 }

function loadDefaultScale() {
  try {
    const raw = window.localStorage.getItem(DEFAULT_SCALE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
      savedDefaultScale = { x: parsed.x, y: parsed.y }
    }
  } catch (error) {
    /* ignore */
  }
}
// 默认横向给一点拉伸：模型本身窄，1.1 在 400 宽的窗口里看起来正常
// viewScale 是用户设定的"目标值"；renderScale 是每帧向目标缓动的实际值，
// 这样滑杆一格一格跳的时候模型是平滑追过去的，不会一卡一卡。
const viewScale = { x: 1, y: 1 }
const renderScale = { x: 1, y: 1 }

// ------------------------------------------------------------ 编舞（语义计划播放）

/** 编舞引擎：IR 轨道 → 逐帧参数。由 window.PetEngine 提供（见 engine/engine.js） */
const choreo = window.PetEngine ? new window.PetEngine.ChoreoEngine() : { active: false, apply() {}, tick() { return null }, start() {}, stop() {} }

/** 编舞当前占用的参数集合（待机/注视在编舞期间让出这些参数） */
function choreoOwned() {
  if (!choreo.active || !choreo.job) return null
  return new Set(choreo.job.ir.tracks.map((track) => track.id))
}

/** 播放一份编舞 IR：先停掉预置动作和导演，避免两套同时写同一参数（手部重影） */
function playChoreo(ir, id) {
  if (!model) return false
  try {
    if (model._motionManager) model._motionManager.stopAllMotions()
  } catch (error) {
    /* ignore */
  }
  try {
    directorRuntime.cancel('choreo')
  } catch (error) {
    /* ignore */
  }
  choreo.start(ir, id)
  return true
}

// 设置面板就是那块方形卡片，缩放/不透明度/气泡开关都在里面
const scalePanel = document.getElementById('panel')
const scaleXInput = document.getElementById('scaleX')
const scaleYInput = document.getElementById('scaleY')
const scaleXValue = document.getElementById('scaleXValue')
const scaleYValue = document.getElementById('scaleYValue')
const bubbleToggle = document.getElementById('bubbleToggle')
const panelOpacityInput = document.getElementById('panelOpacity')
const panelOpacityValue = document.getElementById('panelOpacityValue')

function clampScale(value) {
  return Math.min(maxScale(), Math.max(SCALE_MIN, value))
}

/**
 * 模型的"100% 高度"按屏幕比例算（屏幕高的 42%）。
 * 这样换分辨率也不会时大时小，PSD 的 3749:7697 比例始终成立。
 */
function baseModelHeight() {
  return INITIAL_MODEL_HEIGHT
}

/**
 * 放大极限：模型高度不能超过屏幕可用高度（留点边距），
 * 否则放大到最大也只能看到一截，还会把宽度比例带歪。
 */
function maxScale() {
  const available = Math.max(1, window.innerHeight - 40)
  const aspect = model?.canvasW ? model.canvasW / model.canvasH : 3749 / 7697
  const widthLimit = Math.max(1, window.innerWidth - 40) / (baseModelHeight() * aspect * 1.1)
  return Math.max(SCALE_MIN, Math.min(SCALE_MAX, available / baseModelHeight(), widthLimit))
}

/** 滑杆上限跟着屏幕走，别让用户拖到一个根本显示不下的倍数 */
function syncScaleSliderLimits() {
  const limit = String(Math.round(maxScale() * 100))
  if (scaleXInput) scaleXInput.max = limit
  if (scaleYInput) scaleYInput.max = limit
}

/**
 * 启动恢复上次实际大小；“保存为默认”只改变显式复位的目标。
 */
function loadScale() {
  try {
    const saved = JSON.parse(localStorage.getItem(SCALE_KEY) || 'null')
    if (saved && Number.isFinite(saved.x) && saved.x > 0 && Number.isFinite(saved.y) && saved.y > 0) {
      viewScale.x = clampScale(saved.x)
      viewScale.y = clampScale(saved.y)
      return
    }
  } catch (_) { /* invalid old preferences fall back to default */ }
  viewScale.x = clampScale(savedDefaultScale.x)
  viewScale.y = clampScale(savedDefaultScale.y)
}

function saveScale() {
  try {
    window.localStorage.setItem(SCALE_KEY, JSON.stringify(viewScale))
  } catch (error) {
    /* ignore */
  }
}

/**
 * 等比归一：以"高度"为基准，让 x / y 相等。
 * 只在读档、勾选比例锁这类"数据可能不一致"的时机调用；
 * 不要塞进 applyScale —— 用 max() 会把刚缩小的一侧又拉回去。
 */
function normalizeAspect() {
  if (!lockAspect) return
  const value = clampScale(viewScale.y)
  viewScale.x = value
  viewScale.y = value
}

function applyScale(withWindow) {
  const percentX = Math.round(viewScale.x * 100)
  const percentY = Math.round(viewScale.y * 100)
  if (scaleXInput) scaleXInput.value = String(percentX)
  if (scaleYInput) scaleYInput.value = String(percentY)
  if (scaleXValue) scaleXValue.textContent = percentX + '%'
  if (scaleYValue) scaleYValue.textContent = percentY + '%'
  if (withWindow) requestWindowForScale()
}

/** 立刻把渲染比例对齐目标值（松手时用，避免缓动尾巴） */
function snapScale() {
  renderScale.x = viewScale.x
  renderScale.y = viewScale.y
  if (model) {
    model.scaleX = renderScale.x
    model.scaleY = renderScale.y
    if (modelPos) {
      modelPos = clampModelPosition(modelPos.x, modelPos.y)
      applyModelPos(false)
    }
  }
}

/** 每帧把实际缩放往目标值靠一点（缓动），拖动滑杆时模型才会顺滑 */
function stepScaleEasing() {
  if (!model) return
  let moving = false
  for (const axis of ['x', 'y']) {
    const delta = viewScale[axis] - renderScale[axis]
    if (Math.abs(delta) > 0.0008) {
      renderScale[axis] += delta * 0.22
      moving = true
    } else if (renderScale[axis] !== viewScale[axis]) {
      renderScale[axis] = viewScale[axis]
      moving = true
    }
  }
  if (moving || model.scaleX !== renderScale.x || model.scaleY !== renderScale.y) {
    model.scaleX = renderScale.x
    model.scaleY = renderScale.y
    // 模型一变大变小，☰ 要跟着重新贴到左下角
    if (menuButton) keepMenuAttached()
    layoutAppearance()
  }
}

// 窗口的"基准画面尺寸"：模型放大到多少倍，窗口就长到多少倍，
// 这样放大不会被窗口边界裁掉（缩小不回缩，避免窗口抖动）。
const BASE_WIDTH = 400
const BASE_HEIGHT = 620

/**
 * 窗口是全屏透明的一块，尺寸永远不变——缩放只改模型自己，
 * 所以这里不需要再调窗口（原来那套 resize 就是闪烁的来源）。
 */
function requestWindowForScale() {
  snapScale()
}

function nudgeScale(factor) {
  // 滚轮也遵守等比锁：两条轴用同一个结果，避免历史 x≠y 一路带成"宽体"
  const next = clampScale(viewScale.y * factor)
  viewScale.y = next
  viewScale.x = lockAspect ? next : clampScale(viewScale.x * factor)
  applyScale()
  saveScale()
  requestWindowForScale()
}

loadDefaultScale()
try { lockAspect = localStorage.getItem('pet-lock-aspect') !== '0' } catch (_) { /* default locked */ }
loadScale()
normalizeAspect()
snapScale()

// 等比锁定：默认勾上，拖任一条滑杆两条一起走，模型不会被拉扁或拉长
const lockAspectToggle = document.getElementById('lockAspect')

function syncScaleSliderLimits() {
  const limit = String(Math.round(maxScale() * 100))
  if (scaleXInput) scaleXInput.max = limit
  if (scaleYInput) scaleYInput.max = limit
}

syncScaleSliderLimits()

if (lockAspectToggle) {
  try {
    const stored = window.localStorage.getItem('pet-lock-aspect')
    if (stored !== null) lockAspect = stored === '1'
  } catch (error) {
    /* ignore */
  }
  lockAspectToggle.checked = lockAspect
  lockAspectToggle.addEventListener('change', () => {
    lockAspect = lockAspectToggle.checked
    try {
      window.localStorage.setItem('pet-lock-aspect', lockAspect ? '1' : '0')
    } catch (error) {
      /* ignore */
    }
  })
}

if (scaleXInput) {
  scaleXInput.addEventListener('input', () => {
    viewScale.x = clampScale(Number(scaleXInput.value) / 100)
    if (lockAspect) viewScale.y = viewScale.x
    applyScale()
    saveScale()
  })
  scaleXInput.addEventListener('change', () => {
    // 松手：立刻对齐目标值，别留"指数衰减"的尾巴（那就是视觉上的漂移）
    snapScale()
    requestWindowForScale()
  })
}

if (scaleYInput) {
  scaleYInput.addEventListener('input', () => {
    viewScale.y = clampScale(Number(scaleYInput.value) / 100)
    if (lockAspect) viewScale.x = viewScale.y
    applyScale()
    saveScale()
  })
  scaleYInput.addEventListener('change', () => {
    snapScale()
    requestWindowForScale()
  })
}

const scaleResetButton = document.getElementById('scaleReset')
if (scaleResetButton) {
  scaleResetButton.addEventListener('click', () => {
    viewScale.x = 1
    viewScale.y = 1
    applyScale()
    saveScale()
  })
}

const scaleButton = document.getElementById('btnScale')
if (scaleButton) {
  scaleButton.addEventListener('click', () => {
    if (!scalePanel) return
    scalePanel.hidden = !scalePanel.hidden
    syncChrome()
    if (scalePanel.hidden) scheduleAutoHide()
    else cancelAutoHide()
  })
}

// ---------------------------------------------------- panel opacity & bubble

const PANEL_ALPHA_KEY = 'pet-panel-alpha'
const BUBBLE_ON_KEY = 'pet-bubble-enabled'
let panelAlpha = 0.9
let bubbleEnabled = true

function applyPanelAlpha() {
  document.documentElement.style.setProperty('--panel-alpha', String(panelAlpha))
  if (panelOpacityInput) panelOpacityInput.value = String(Math.round(panelAlpha * 100))
  if (panelOpacityValue) panelOpacityValue.textContent = Math.round(panelAlpha * 100) + '%'
}

function loadPanelPrefs() {
  try {
    const alpha = Number(window.localStorage.getItem(PANEL_ALPHA_KEY))
    if (Number.isFinite(alpha) && alpha > 0) panelAlpha = Math.min(1, Math.max(0.25, alpha))
    const bubble = window.localStorage.getItem(BUBBLE_ON_KEY)
    if (bubble !== null) bubbleEnabled = bubble === '1'
  } catch (error) {
    /* ignore */
  }
  applyPanelAlpha()
  if (bubbleToggle) bubbleToggle.checked = bubbleEnabled
}

loadPanelPrefs()

if (panelOpacityInput) {
  panelOpacityInput.addEventListener('input', () => {
    panelAlpha = Math.min(1, Math.max(0.25, Number(panelOpacityInput.value) / 100))
    applyPanelAlpha()
    try {
      window.localStorage.setItem(PANEL_ALPHA_KEY, String(panelAlpha))
    } catch (error) {
      /* ignore */
    }
  })
}

if (bubbleToggle) {
  bubbleToggle.addEventListener('change', () => {
    bubbleEnabled = bubbleToggle.checked
    try {
      window.localStorage.setItem(BUBBLE_ON_KEY, bubbleEnabled ? '1' : '0')
    } catch (error) {
      /* ignore */
    }
    if (!bubbleEnabled) bubble.hidden = true
  })
}

// 滚轮等比缩放模型（不滚动页面、不改窗口）
stage.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault()
    const factor = event.deltaY > 0 ? 0.94 : 1.06
    nudgeScale(factor)
  },
  { passive: false },
)


// ------------------------------------------------------- click-through (全屏窗口)
// 全屏透明窗口会挡住整个桌面，所以平时让整块穿透；鼠标移到角色/面板/按钮上时
// 才临时关掉穿透，这样点击和拖动才落到我们身上。
let lastInteractive = null
let pendingInteractive = null
let pendingCount = 0
let lastCursorX = -1
let lastCursorY = -1
let hitTestAt = 0

function insideElement(element, x, y) {
  if (!element || element.hidden) return false
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return false
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

// 正在拖动某块 UI（模型 / 聊天框 / ☰）时，绝不能让穿透判定插一脚：
// 一旦鼠标滑到元素外，窗口会被切成穿透，后面的 pointermove 就收不到，
// 表现就是"拖到一半卡住、然后突然吸附回光标"。
let uiDragging = 0

function beginUiDrag() {
  uiDragging += 1
  if (uiDragging === 1 && window.pet && typeof window.pet.setClickThrough === 'function') {
    lastInteractive = true
    window.pet.setClickThrough(false)
  }
}

function endUiDrag() {
  uiDragging = Math.max(0, uiDragging - 1)
  if (uiDragging === 0) lastInteractive = null
}

function updateClickThrough(clientX, clientY) {
  if (uiDragging > 0) return

  // 用户关掉"自动穿透"时，窗口保持可点（会挡住桌面，作为兜底）
  if (!autoClickThrough) {
    if (lastInteractive !== true) {
      lastInteractive = true
      if (window.pet && typeof window.pet.setClickThrough === 'function') {
        window.pet.setClickThrough(false)
      }
    }
    return
  }

  let interactive =
    insideElement(barEl, clientX, clientY) ||
    insideElement(menuButton, clientX, clientY) ||
    insideElement(handleEl, clientX, clientY) ||
    insideElement(chatEl, clientX, clientY) ||
    insideElement(bubble, clientX, clientY) ||
    insideElement(settingsModal, clientX, clientY)

  if (!interactive && model && stage.hidden === false) {
    const rect = canvas.getBoundingClientRect()
    interactive = model.isOpaqueAt(clientX, clientY)
  }

  // 去抖的目的只是防"光标停在边界时一闪一闪"，但阈值必须分方向：
  //   进入交互（穿透 → 可点）：1 次就切。宁可短暂挡住桌面，
  //     也不能因为采样不够 3 次就永远卡在穿透态（那就是"点不动、拖不动"）。
  //   离开交互（可点 → 穿透）：仍然 3 次，避免边界抖动。
  // 穿透态下几乎收不到 mousemove（只靠主进程 60ms 轮询推 cursor），
  // 阈值 3 在这里太容易被跳过。
  if (interactive === lastInteractive) {
    pendingInteractive = null
    pendingCount = 0
    return
  }

  if (interactive === true) {
    // 进入交互：立刻生效，不攒样本
    pendingInteractive = null
    pendingCount = 0
    lastInteractive = true
    if (window.pet && typeof window.pet.setClickThrough === 'function') {
      window.pet.setClickThrough(false)
    }
    return
  }

  // 离开交互：保持 3 次防抖
  if (interactive !== pendingInteractive) {
    pendingInteractive = interactive
    pendingCount = 1
    return
  }
  pendingCount += 1
  if (pendingCount < 3) return

  pendingInteractive = null
  pendingCount = 0
  lastInteractive = false
  if (window.pet && typeof window.pet.setClickThrough === 'function') {
    window.pet.setClickThrough(true)
  }
}

window.addEventListener('mousemove', (event) => {
  updateClickThrough(event.clientX, event.clientY)
})

/** 气泡跟着模型走（全屏窗口里没有"窗口顶部"可用） */
function placeBubble() {
  if (!bubble || !modelPos) return
  const size = modelScreenSize()
  const width = Math.min(window.innerWidth - 20, Math.max(240, Math.min(380, appearance.fontSize * 16 + 24)))
  bubble.style.width = width + 'px'
  if (bubble.hidden) return
  const box = window.PetAppearance.positionBubble({vw:window.innerWidth,vh:window.innerHeight,cx:modelPos.x,
    headTop:modelPos.y-size.h*0.40,width,height:bubble.offsetHeight,gap:appearance.gap})
  bubble.style.left = box.left + 'px'
  bubble.style.top = box.top + 'px'
  bubble.dataset.placement = box.placement
  bubble.style.setProperty('--bubble-tail-x',box.tail+'px')
}

function layoutAppearance() {
  if (!modelPos || !model) return
  const size = modelScreenSize()
  if (sceneBackground) {
    const w = Math.min(window.innerWidth-16,Math.max(240,size.w+100))
    const h = Math.min(window.innerHeight-16,size.h*1.04+40)
    sceneBackground.style.width = w+'px'
    sceneBackground.style.height = h+'px'
    sceneBackground.style.left = Math.max(8,Math.min(window.innerWidth-w-8,modelPos.x-w/2))+'px'
    sceneBackground.style.top = Math.max(8,Math.min(window.innerHeight-h-8,modelPos.y-h/2+8))+'px'
  }
  placeBubble()
  if (appearance.chatDock && !chatEl.hidden && !chatDrag) dockChat()
}

function dockChat() {
  if (!modelPos || !model || !chatBox) return
  const size = modelScreenSize()
  const w=chatBox.w,h=chatBox.h,gap=14
  const right=modelPos.x+size.w/2+gap
  const left=modelPos.x-size.w/2-gap-w
  const x=right+w<=window.innerWidth-8?right:left>=8?left:(window.innerWidth-w)/2
  const y=(right+w<=window.innerWidth-8||left>=8)?modelPos.y-size.h*.36:Math.max(8,modelPos.y-size.h*.40-h-gap)
  applyChatBox({x,y,w,h},false)
}

function applyAppearance() {
  const root=document.documentElement
  root.style.setProperty('--dialogue-font-size',appearance.fontSize+'px')
  root.style.setProperty('--bubble-color',appearance.bubbleColor)
  const alpha=appearance.bubbleTint/100
  const hasBubbleImage=appearance.bubbleImage&&!missingBackgrounds.has(appearance.bubbleImage)
  root.style.setProperty('--bubble-background',hasBubbleImage
    ? `linear-gradient(rgba(255,255,255,${alpha}),rgba(255,255,255,${alpha})),url("${appearance.bubbleImage}")`:'none')
  const ink=window.PetAppearance.ink(appearance.bubbleColor,Boolean(hasBubbleImage))
  root.style.setProperty('--dialogue-ink',ink)
  bubble.style.color=ink
  chatEl.style.color=ink
  sceneBackground.hidden=appearance.sceneMode==='transparent'
  sceneBackground.style.backgroundColor=appearance.sceneColor
  sceneBackground.style.backgroundImage=appearance.sceneMode==='image'&&appearance.sceneImage&&!missingBackgrounds.has(appearance.sceneImage)?`url("${appearance.sceneImage}")`:'none'
  sceneBackground.style.backgroundSize=appearance.sceneFit
  sceneBackground.style.opacity=appearance.sceneOpacity/100
  layoutAppearance()
}

async function changeAppearance(patch) {
  const generation=++appearanceGeneration
  const next=window.PetAppearance.normalize({...appearanceDraft,...patch})
  appearanceDraft=next
  try {
    for(const key of ['sceneImage','bubbleImage']) if(next[key]&&next[key]!==appearance[key]) {
      await new Promise((resolve,reject)=>{const img=new Image();img.onload=resolve;img.onerror=()=>reject(new Error('背景图片读取失败，已保留原设置'));img.src=next[key]})
    }
    if(generation!==appearanceGeneration)return false
    localStorage.setItem(APPEARANCE_KEY,JSON.stringify(next))
    appearance=next
    for(const key of ['sceneImage','bubbleImage'])if(next[key])missingBackgrounds.delete(next[key])
    appearanceStatus='已保存'
    applyAppearance()
  } catch(error) {
    if(generation!==appearanceGeneration)return false
    appearanceDraft={...appearance}
    appearanceStatus=String(error.message||error); reportSettingsState(); return false
  }
  reportSettingsState()
  return true
}

// 设置面板贴屏幕右下角（固定，不跟模型跑）
if (scalePanel) {
  scalePanel.style.left = 'auto'
  scalePanel.style.right = '16px'
  scalePanel.style.bottom = '16px'
}

// --------------------------------------------------------------- interaction

// 全屏窗口里，角色是"画布上的一个位置"，拖动改的是这个位置（窗口不动）
const MODEL_POS_KEY = 'pet-model-pos'
let modelPos = null

function defaultModelPos() {
  // 紧凑窗口：模型放窗口正中（脚部略留白）
  return { x: window.innerWidth / 2, y: window.innerHeight * 0.52 }
}

function applyModelPos(persist) {
  if (!model) return
  const centerX = window.innerWidth / 2
  const centerY = window.innerHeight / 2
  model.offsetX = modelPos.x - centerX
  model.offsetY = modelPos.y - centerY
  // ☰ 始终跟着模型左下角（之前这里被 menuPos 判空拦住，导致按钮留在 CSS 默认位置）
  if (menuButton) keepMenuAttached()
  layoutAppearance()
  if (persist) {
    try {
      window.localStorage.setItem(MODEL_POS_KEY, JSON.stringify({version:2,...modelPos,width:innerWidth,height:innerHeight}))
    } catch (error) {
      /* ignore */
    }
  }
}

function loadModelPos() {
  modelPos = defaultModelPos()
  try {
    const raw = window.localStorage.getItem(MODEL_POS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      // Ignore old unversioned fullscreen coordinates; new positions record their viewport.
      if (parsed?.version === 2 && Number.isFinite(parsed.x) && Number.isFinite(parsed.y) && Number.isFinite(parsed.width) && Number.isFinite(parsed.height) && parsed.width > 0 && parsed.height > 0) {
        modelPos = clampModelPosition(parsed.x * innerWidth / parsed.width, parsed.y * innerHeight / parsed.height)
      }
    }
  } catch (error) {
    /* ignore */
  }
}

function clampModelPosition(x, y) {
  const size = modelScreenSize()
  const mx = Math.min(innerWidth / 2, size.w * 0.55 + 20)
  const my = Math.min(innerHeight / 2, size.h / 2 + 20)
  return {x:Math.max(mx,Math.min(innerWidth-mx,x)),y:Math.max(my,Math.min(innerHeight-my,y))}
}

function useCanvasDrag() {
  const screen = window.screen
  return screen?.availWidth > 0 && screen?.availHeight > 0
    && innerWidth >= screen.availWidth * 0.8 && innerHeight >= screen.availHeight * 0.8
}

const drag = { active: false, moved: false, x: 0, y: 0, lastX: 0, lastY: 0, origin: null, mode:'window', pointerId:null }
let lastDirectorTouch = 0

stage.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  // 只有点在角色身上才开始拖：空白透明处不响应，拖起来就是"抓着模型"
  if (model && typeof model.isOpaqueAt === 'function') {
    const rect = canvas.getBoundingClientRect()
    const inside = model.isOpaqueAt(event.clientX, event.clientY)
    if (!inside) return
  }
  drag.active = true
  drag.moved = false
  lastDirectorTouch = performance.now()
  window.pet?.interact?.('touch')
  markUserTouch()
  beginUiDrag()
  drag.x = event.screenX
  drag.y = event.screenY
  drag.lastX = event.screenX
  drag.lastY = event.screenY
  drag.origin = modelPos ? { ...modelPos } : null
  drag.mode = useCanvasDrag() ? 'model' : 'window'
  drag.pointerId = event.pointerId
  cancelAutoHide()
  stage.classList.add('dragging')
  stage.setPointerCapture?.(event.pointerId)
})

stage.addEventListener('pointermove', (event) => {
  if (!drag.active) return
  if (performance.now() - lastDirectorTouch > 1000) {
    lastDirectorTouch = performance.now()
    window.pet?.interact?.('drag')
  }
  const dx = event.screenX - drag.x
  const dy = event.screenY - drag.y
  if (!drag.moved && Math.hypot(dx, dy) < 5) return
  const stepX = event.screenX - drag.lastX
  const stepY = event.screenY - drag.lastY
  drag.moved = true
  drag.lastX = event.screenX
  drag.lastY = event.screenY
  // 大画布中只移动人物，避免把整块近全屏窗口拖出显示器。
  if (drag.mode === 'window' && window.pet && typeof window.pet.moveBy === 'function') {
    window.pet.moveBy(stepX, stepY)
    return
  }
  if (!drag.origin) return
  modelPos = clampModelPosition(drag.origin.x + dx, drag.origin.y + dy)
  applyModelPos(false)
})

stage.addEventListener('pointerup', (event) => {
  if (!drag.active) return
  const wasMoved = drag.moved
  drag.active = false
  // 松手才吸附：拖动中吸附会让窗口每帧被拉回边缘，表现就是拖不动
  if (wasMoved && drag.mode === 'window') applyEdgeSnap()
  endUiDrag()
  stage.classList.remove('dragging')
  stage.releasePointerCapture?.(event.pointerId)
  if (!drag.moved) {
    // C1：先判断戳到哪个部位，再决定说什么、做什么表情
    const zone = touchZoneAt(event.clientX, event.clientY)
    // side：点在她中心左边还是右边，决定她往哪边躲
    const side = event.clientX < modelPos.x ? -1 : 1
    sayForZone(zone, side)
    showTransientUI()
    // C2：点一下算一次互动
    if (window.pet && typeof window.pet.interact === 'function') window.pet.interact('click')
  } else {
    applyModelPos(true)
  }
})

function cancelModelDrag() {
  if (!drag.active) return
  drag.active = false
  if (drag.moved) applyModelPos(true)
  drag.moved = false
  drag.origin = null
  endUiDrag()
  stage.classList.remove('dragging')
  try { if (stage.hasPointerCapture?.(drag.pointerId)) stage.releasePointerCapture(drag.pointerId) } catch (_) {}
}
stage.addEventListener('pointercancel', cancelModelDrag)
stage.addEventListener('lostpointercapture', cancelModelDrag)

/**
 * C1：按命中点相对模型绘制区的高度比例分区。
 * head 0~0.22 / face 0.22~0.38 / body 0.38~0.75 / leg 0.75~1
 * 只在已经通过 alpha 命中测试之后调用，不改那套判定。
 */
function touchZoneAt(clientX, clientY) {
  if (!model) return 'body'
  try {
    const rect = canvas.getBoundingClientRect()
    const localX = clientX - rect.left
    const localY = clientY - rect.top
    const bounds = typeof model.computeDrawBounds === 'function' ? model.computeDrawBounds() : null
    if (!bounds || bounds.bottom <= bounds.top) return 'body'
    const t = (localY - bounds.top) / (bounds.bottom - bounds.top)
    if (t < 0.22) return 'head'
    if (t < 0.38) return 'face'
    if (t < 0.75) return 'body'
    return 'leg'
  } catch (error) {
    return 'body'
  }
}

/** 各部位的反应：表情 + 语料池 + 可选动作 */
const TOUCH_REACTIONS = {
  head: { pool: 'touchHead', emotion: 'squeeze' },
  face: { pool: 'touchFace', emotion: 'facepalm' },
  body: { pool: 'click', emotion: 'none' },
  leg: { pool: 'touchLeg', emotion: 'sweat' },
}

/** 腿/尾被碰时侧身躲一下（纯参数，0.8 秒后回去） */
function dodgeSideways() {
  if (!model) return
  const dir = Math.random() < 0.5 ? -1 : 1
  pulse('PositionX', 8 * dir, 900, 0.6, 3)
  pulse('AngleZ', 5 * dir, 850, 0.8, 3)
}

/** 按部位说话（语料池取不到时退回 click 池） */
// 连击：800ms 内同一部位点 3 次 → 她烦了
const COMBO_WINDOW = 800
let comboZone = ''
let comboCount = 0
let comboLastAt = 0

function checkCombo(zone) {
  const now = performance.now()
  if (zone === comboZone && now - comboLastAt < COMBO_WINDOW) {
    comboCount += 1
  } else {
    comboZone = zone
    comboCount = 1
  }
  comboLastAt = now
  return comboCount >= 3
}

function sayForZone(zone, side) {
  const reaction = TOUCH_REACTIONS[zone] || TOUCH_REACTIONS.body
  const pools = (character && character.speechPools) || {}
  const poolsJa = (character && character.speechPoolsJa) || {}
  let lines = Array.isArray(pools[reaction.pool]) && pools[reaction.pool].length
    ? pools[reaction.pool]
    : null
  if (!lines) lines = Array.isArray(pools.click) && pools.click.length ? pools.click : (character && character.speech || [])
  const linesJa = Array.isArray(poolsJa[reaction.pool]) && poolsJa[reaction.pool].length
    ? poolsJa[reaction.pool]
    : (Array.isArray(poolsJa.click) ? poolsJa.click : [])
  // Touch feedback must also work for imported characters with no speech pool.
  playClickAnim(zone, Number(side) || 1)
  if (!lines.length) return
  let idx = Math.floor(Math.random() * lines.length)
  let text = lines[idx]
  if (lines.length > 1 && text === lastSaidLine) {
    idx = (idx + 1) % lines.length
    text = lines[idx]
  }
  lastSaidLine = text
  showBubble(text, 6500, linesJa[idx] || '')
  // 手感优先：先播物理，再说话
  // 连击：同一部位 800ms 内第 3 次 → 烦了
  if (checkCombo(zone)) {
    playClickAnim('head', -1)
    pulse('AngleZ', 7, 750, 2.0, 2.8)
    applyExpressionAny(affinityMood === 'close' ? '＞＜' : '黑脸')
    if (window.pet && typeof window.pet.interact === 'function') window.pet.interact('combo')
    comboCount = 0
    scheduleAutoHide()
    return
  }
  if (zone === 'leg') dodgeSideways()
  // head/face 用专门表情，其它走随机
  if (zone === 'head') applyExpressionAny('＞＜')
  else if (zone === 'face') applyExpressionAny('＞＜')
  else if (zone === 'leg') applyExpressionAny('流冷汗')
  else applyEmotion(['none', 'blush', 'smug', 'heart', 'deadpan', 'sweat'][Math.floor(Math.random() * 6)])
  if (zone === 'body') playRandomAction()
  scheduleAutoHide()
}

/** 模型当前的屏幕像素尺寸（用于拖动边界和菜单按钮定位） */
function modelScreenSize() {
  const height = baseModelHeight() * renderScale.y
  const aspect = model && model.canvasW ? model.canvasW / model.canvasH : 3749 / 7697
  const stretch = renderScale.y === 0 ? 1 : renderScale.x / renderScale.y
  return { w: height * aspect * stretch, h: height }
}

// ------------------------------------------------------- chat box: move / resize

const CHAT_BOX_KEY = 'pet-chat-box'
const chatHead = document.getElementById('chatHead')
let chatBox = null
let chatDrag = null

function clampChatBox(box) {
  const maxW = Math.max(1, window.innerWidth - 16), maxH = Math.max(1, window.innerHeight - 16)
  const w = Math.min(Math.max(Math.min(280,maxW), Number(box.w) || 340), maxW)
  const h = Math.min(Math.max(Math.min(260,maxH), Number(box.h) || 340), maxH)
  return {
    x: Math.min(Math.max(8, Number(box.x) || 8), Math.max(8, window.innerWidth - w - 8)),
    y: Math.min(Math.max(8, Number(box.y) || 8), Math.max(8, window.innerHeight - h - 8)),
    w,
    h,
  }
}

function applyChatBox(box, persist) {
  chatBox = clampChatBox(box)
  if (!chatEl) return
  chatEl.style.left = chatBox.x + 'px'
  chatEl.style.top = chatBox.y + 'px'
  chatEl.style.right = 'auto'
  chatEl.style.bottom = 'auto'
  chatEl.style.width = chatBox.w + 'px'
  chatEl.style.height = chatBox.h + 'px'
  if (persist) {
    try {
      window.localStorage.setItem(CHAT_BOX_KEY, JSON.stringify(chatBox))
    } catch (error) {
      /* ignore */
    }
  }
}

function loadChatBox() {
  try {
    const raw = window.localStorage.getItem(CHAT_BOX_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.w)) {
        applyChatBox(parsed, false)
        return
      }
    }
  } catch (error) {
    /* ignore */
  }
  applyChatBox({ x: window.innerWidth - 356, y: window.innerHeight - 356, w: 340, h: 340 }, false)
}

loadChatBox()

if (chatHead) {
  chatHead.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('button,input,select,textarea,[role="button"]')) return
    event.stopPropagation()
    const rect = chatEl.getBoundingClientRect()
    chatDrag = {
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      originX: chatBox ? chatBox.x : rect.left,
      originY: chatBox ? chatBox.y : rect.top,
      pending: null,
      moved: false,
    }
    chatHead.setPointerCapture?.(event.pointerId)
    chatEl.classList.add('dragging')
    beginUiDrag()
  })

  // 拖动只改 transform（合成层，不触发布局），松手才落到 left/top 上——
  // 否则每一帧都改 left/top 会强制重排，拖快了就卡。
  chatHead.addEventListener('pointermove', (event) => {
    if (!chatDrag) return
    if (!chatDrag.moved && Math.hypot(event.clientX - chatDrag.startX, event.clientY - chatDrag.startY) < 3) {
      return
    }
    chatDrag.moved = true
    chatDrag.pending = { x: event.clientX - chatDrag.dx, y: event.clientY - chatDrag.dy }
    if (chatDrag.raf) return
    chatDrag.raf = requestAnimationFrame(() => {
      if (!chatDrag) return
      chatDrag.raf = 0
      if (!chatDrag.pending) return
      const dx = chatDrag.pending.x - chatDrag.originX
      const dy = chatDrag.pending.y - chatDrag.originY
      chatEl.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0)'
    })
  })

  chatHead.addEventListener('pointerup', (event) => {
    if (!chatDrag) return
    const moved = chatDrag.moved
    const pending = chatDrag.pending
    const originX = chatDrag.originX
    const originY = chatDrag.originY
    if (chatDrag.raf) cancelAnimationFrame(chatDrag.raf)
    chatDrag = null
    endUiDrag()
    chatEl.classList.remove('dragging')
    chatHead.releasePointerCapture?.(event.pointerId)
    if (moved && chatBox) {
      if (appearance.chatDock) changeAppearance({chatDock:false})
      chatEl.style.transform = ''
      const next = pending || { x: originX, y: originY }
      applyChatBox({ x: next.x, y: next.y, w: chatBox.w, h: chatBox.h }, true)
    }
  })

  chatHead.addEventListener('pointercancel', () => {
    if (chatDrag && chatDrag.raf) cancelAnimationFrame(chatDrag.raf)
    if (chatDrag) endUiDrag()
    chatDrag = null
    chatEl.classList.remove('dragging')
    chatEl.style.transform = ''
  })
}

// 拖右下角改大小：变化停下来以后记住
if (chatEl && typeof ResizeObserver !== 'undefined') {
  let resizeTimer = 0
  const observer = new ResizeObserver(() => {
    if (!chatBox || chatEl.hidden) return
    const rect = chatEl.getBoundingClientRect()
    if (Math.abs(rect.width - chatBox.w) < 1 && Math.abs(rect.height - chatBox.h) < 1) return
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      if (!chatBox || chatEl.hidden) return
      const latest = chatEl.getBoundingClientRect()
      applyChatBox({ x: chatBox.x, y: chatBox.y, w: latest.width, h: latest.height }, true)
    }, 200)
  })
  observer.observe(chatEl)
}

const chatCloseButton = document.getElementById('btnChatClose')
if (chatCloseButton) {
  chatCloseButton.addEventListener('click', () => { closeChat(); showTransientUI(); menuButton?.focus({preventScroll:true}) })
}

window.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.isComposing) return
  const control = event.target.closest?.('button,input,textarea,select,summary,[contenteditable="true"],[role="tab"]')
  if (event.key === 'Enter' && !control) { event.preventDefault(); openChat() }
  if (event.key === 'Escape') {
    if (!chatEl.hidden) { closeChat(); showTransientUI(); menuButton?.focus({preventScroll:true}) }
    else if (barEl && !barEl.hidden) { barEl.hidden = true; menuButton?.focus({preventScroll:true}); scheduleAutoHide() }
  }
})
window.addEventListener('resize', () => {
  if (chatBox) { applyChatBox(chatBox,false); if (appearance.chatDock && !chatEl.hidden) dockChat() }
})

// ------------------------------------------------------- transient chrome

const IDLE_HIDE_MS = 5000
let hideTimer = 0

/** 头像上方那个小菜单按钮、气泡：都属于"临时 UI"，会自动退场 */
function showTransientUI() {
  if (menuButton) menuButton.hidden = false
  scheduleAutoHide()
}

function scheduleAutoHide() {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = window.setTimeout(() => {
    hideTimer = 0
    // Returning focus to the menu must keep the keyboard's next target visible.
    if (document.activeElement === menuButton) return
    // 聊天或尺寸面板开着就别收，否则用户正在操作的东西会消失
    if (!chatEl.hidden) return
    if (scalePanel && !scalePanel.hidden) return
    if (bubbleTimer) clearTimeout(bubbleTimer)
    bubble.hidden = true
    if (menuButton) menuButton.hidden = true
    if (barEl) barEl.hidden = true
  }, IDLE_HIDE_MS)
}

function cancelAutoHide() {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = 0
}

/** 点 ☰：打开/收起设置面板（顶栏那排按钮） */
function toggleSettings() {
  if (!barEl) return
  const willShow = barEl.hidden
  barEl.hidden = !willShow
  if (willShow) {
    panelMovable?.fit()
    if (!panelMovable?.wasPositioned()) panelMovable?.placeNear(modelPos, modelScreenSize())
    cancelAutoHide()
    if (menuButton) menuButton.hidden = false
  } else {
    scheduleAutoHide()
  }
}

// ☰ 跟着模型左下角走；用户自己拖过之后，记住相对模型的偏移
const MENU_POS_KEY = 'pet-menu-offset'
const MENU_SIZE = 40
let menuPos = null
let menuDrag = null
let menuOffset = { x: 4, y: -44 }

function clampMenuPos(x, y) {
  const maxX = Math.max(4, window.innerWidth - MENU_SIZE - 4)
  const maxY = Math.max(4, window.innerHeight - MENU_SIZE - 4)
  return { x: Math.min(maxX, Math.max(4, x)), y: Math.min(maxY, Math.max(4, y)) }
}

function placeMenuButton(x, y, persist) {
  if (!menuButton) return
  menuPos = clampMenuPos(x, y)
  menuButton.style.left = menuPos.x + 'px'
  menuButton.style.top = menuPos.y + 'px'
  if (persist) {
    try {
      window.localStorage.setItem(MENU_POS_KEY, JSON.stringify(menuOffset))
    } catch (error) {
      /* ignore */
    }
  }
}

/** 模型移动/缩放后，让 ☰ 继续贴在模型左下角 */
function keepMenuAttached() {
  if (!menuButton || !modelPos || !model) return
  const size = modelScreenSize()
  const anchorX = modelPos.x - size.w / 2
  const anchorY = modelPos.y + size.h / 2
  placeMenuButton(anchorX + menuOffset.x, anchorY + menuOffset.y, false)
}

function loadMenuPos() {
  try {
    const raw = window.localStorage.getItem(MENU_POS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
        menuOffset = { x: parsed.x, y: parsed.y }
      }
    }
  } catch (error) {
    /* ignore */
  }
  keepMenuAttached()
}

if (menuButton) {
  menuButton.addEventListener('focus', cancelAutoHide)
  menuButton.addEventListener('blur', scheduleAutoHide)
  // Native keyboard activation dispatches click without a pointerup.
  menuButton.addEventListener('click', (event) => {
    if (event.detail === 0) {
      toggleSettings()
    } else if (window.pet && typeof window.pet.openPanelWindow === 'function') {
      // 方案 D：快捷菜单改成独立窗口
      window.pet.openPanelWindow()
    }
  })
  if (barEl) new MutationObserver(() => {
    menuButton.setAttribute('aria-expanded', String(!barEl.hidden))
    menuButton.setAttribute('aria-label', barEl.hidden ? '打开快捷菜单' : '关闭快捷菜单')
  }).observe(barEl, {attributes:true,attributeFilter:['hidden']})
  menuButton.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    event.stopPropagation()
    const rect = stage.getBoundingClientRect()
    const base = menuPos || { x: 0, y: 0 }
    menuDrag = {
      offsetX: event.clientX - rect.left - base.x,
      offsetY: event.clientY - rect.top - base.y,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    }
    beginUiDrag()
    menuButton.setPointerCapture?.(event.pointerId)
  })

  menuButton.addEventListener('pointermove', (event) => {
    if (!menuDrag) return
    const rect = stage.getBoundingClientRect()
    if (!menuDrag.moved && Math.hypot(event.clientX - menuDrag.startX, event.clientY - menuDrag.startY) < 4) {
      return
    }
    menuDrag.moved = true
    placeMenuButton(
      event.clientX - rect.left - menuDrag.offsetX,
      event.clientY - rect.top - menuDrag.offsetY,
      false,
    )
  })

  menuButton.addEventListener('pointerup', (event) => {
    if (!menuDrag) return
    const moved = menuDrag.moved
    menuDrag = null
    endUiDrag()
    menuButton.releasePointerCapture?.(event.pointerId)
    if (moved) {
      // 记住"相对模型左下角"的偏移，换位置/缩放后它还会贴在同一个角落
      if (menuPos && modelPos && model) {
        const size = modelScreenSize()
        menuOffset = {
          x: menuPos.x - (modelPos.x - size.w / 2),
          y: menuPos.y - (modelPos.y + size.h / 2),
        }
        placeMenuButton(menuPos.x, menuPos.y, true)
      }
    } else {
      toggleSettings()
    }
  })

  menuButton.addEventListener('pointercancel', () => {
    if (menuDrag) endUiDrag()
    menuDrag = null
  })
}

loadMenuPos()

const panelCloseButton = document.getElementById('btnPanelClose')
if (panelCloseButton) {
  panelCloseButton.addEventListener('click', () => {
    if (barEl) barEl.hidden = true
    menuButton?.focus({preventScroll:true})
    scheduleAutoHide()
  })
}

// ------------------------------------------------------------ advanced panel

const saveDefaultButton = document.getElementById('btnSaveDefault')
if (saveDefaultButton) {
  saveDefaultButton.addEventListener('click', () => {
    savedDefaultScale = { x: viewScale.x, y: viewScale.y }
    try {
      window.localStorage.setItem(DEFAULT_SCALE_KEY, JSON.stringify(savedDefaultScale))
    } catch (error) {
      /* ignore */
    }
    setStatus('已保存为默认大小（' + Math.round(viewScale.x * 100) + '% / ' + Math.round(viewScale.y * 100) + '%）')
    window.setTimeout(() => setStatus(''), 2200)
  })
}

const resetDefaultButton = document.getElementById('btnResetDefault')
if (resetDefaultButton) {
  resetDefaultButton.addEventListener('click', () => {
    viewScale.x = clampScale(savedDefaultScale.x)
    viewScale.y = clampScale(savedDefaultScale.y)
    applyScale(true)
    saveScale()
  })
}

// ------------------------------------------------- 通用：可拖动 / 可缩放的面板

/**
 * 让一个弹层能拖动 + 拖右下角改大小，并把位置尺寸记到 localStorage。
 * 拖动期间只改 transform（合成层，不触发布局），松手才落到 left/top；
 * 全程用 beginUiDrag 锁住穿透判定，避免"拖到一半窗口变透明、鼠标被吸走"。
 */
function attachMovable(box, handle, key, defaults) {
  if (!box || !handle) return null

  let state = null
  let drag = null
  let resizeTimer = 0
  let positioned = false

  function clampBox(box_) {
    const maxW=Math.max(1,window.innerWidth-16),maxH=Math.max(1,window.innerHeight-16)
    const minW=box===barEl?260:220,minH=box===barEl?320:140
    const w = Math.min(Math.max(Math.min(minW,maxW),Number(box_.w)||defaults.w),maxW)
    const h = Math.min(Math.max(Math.min(minH,maxH),Number(box_.h)||defaults.h),maxH)
    return {
      x: Math.min(Math.max(8, Number(box_.x)||8), Math.max(8, window.innerWidth - w - 8)),
      y: Math.min(Math.max(8, Number(box_.y)||8), Math.max(8, window.innerHeight - h - 8)),
      w,
      h,
    }
  }

  function apply(box_, persist) {
    state = clampBox(box_)
    box.style.left = state.x + 'px'
    box.style.top = state.y + 'px'
    box.style.right = 'auto'
    box.style.bottom = 'auto'
    box.style.width = state.w + 'px'
    box.style.height = state.h + 'px'
    if (persist) {
      positioned = true
      try {
        window.localStorage.setItem(key, JSON.stringify(state))
      } catch (error) {
        /* ignore */
      }
    }
  }

  function restore() {
    try {
      const raw = window.localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.w)) {
          positioned = true
          apply(parsed, false)
          return
        }
      }
    } catch (error) {
      /* ignore */
    }
    apply(defaults, false)
  }

  restore()

  function safeCapture(el, pointerId, capture) {
    try {
      if (capture) el.setPointerCapture?.(pointerId)
      else el.releasePointerCapture?.(pointerId)
    } catch (error) {
      // 合成事件或 pointerId 已失效时会抛，别让它把后续的落位逻辑一起中断
    }
  }

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    // 别抢按钮/输入框的点击
    if (event.target.closest('button, input, select, textarea, label')) return
    if (!state) return
    event.stopPropagation()
    const rect = box.getBoundingClientRect()
    drag = {
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      originX: state.x,
      originY: state.y,
      pending: null,
      raf: 0,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
    }
    safeCapture(handle, event.pointerId, true)
    box.classList.add('dragging')
    beginUiDrag()
  })

  handle.addEventListener('pointermove', (event) => {
    if (!drag) return
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 3) return
    drag.moved = true
    drag.pending = { x: event.clientX - drag.dx, y: event.clientY - drag.dy }
    if (drag.raf) return
    drag.raf = requestAnimationFrame(() => {
      if (!drag) return
      drag.raf = 0
      if (!drag.pending) return
      const dx = drag.pending.x - drag.originX
      const dy = drag.pending.y - drag.originY
      box.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0)'
    })
  })

  function endDrag(event) {
    if (!drag) return
    const moved = drag.moved
    const pending = drag.pending
    if (drag.raf) cancelAnimationFrame(drag.raf)
    drag = null
    box.classList.remove('dragging')
    safeCapture(handle, event.pointerId, false)
    endUiDrag()
    if (moved && state) {
      box.style.transform = ''
      apply(
        { x: (pending && pending.x) || state.x, y: (pending && pending.y) || state.y, w: state.w, h: state.h },
        true,
      )
    }
  }

  handle.addEventListener('pointerup', endDrag)
  handle.addEventListener('pointercancel', (event) => {
    if (drag && drag.raf) cancelAnimationFrame(drag.raf)
    drag = null
    box.classList.remove('dragging')
    box.style.transform = ''
    endUiDrag()
    if (event) safeCapture(handle, event.pointerId, false)
  })

  // 拖右下角改大小：稳定后记下来
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => {
      if (!state || box.hidden) return
      const rect = box.getBoundingClientRect()
      // 隐藏 / 尚未布局时 rect 会是 0，别把尺寸存成最小值
      if (rect.width < 40 || rect.height < 40) return
      if (Math.abs(rect.width - state.w) < 1 && Math.abs(rect.height - state.h) < 1) return
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        if (!state || box.hidden) return
        const latest = box.getBoundingClientRect()
        apply({ x: state.x, y: state.y, w: latest.width, h: latest.height }, true)
      }, 200)
    })
    observer.observe(box)
  }

  window.addEventListener('resize', () => { if (state) apply(state,false) })
  return {
    restore,
    fit: () => { if (state) apply(state,false) },
    wasPositioned: () => positioned,
    placeNear: (pos,size) => {
      if(!state||!pos||!size)return
      const right=pos.x+size.w/2+16,left=pos.x-size.w/2-state.w-16
      const x=right+state.w<=window.innerWidth-8?right:left>=8?left:pos.x-state.w/2
      const y=(right+state.w<=window.innerWidth-8||left>=8)?pos.y-size.h*.4:pos.y-size.h*.4-state.h-16
      apply({...state,x,y},false)
    },
    getState: () => state,
    reset: () => apply(defaults, true),
  }
}

// ------------------------------------------------- 自动呼吸

const BREATH_KEY = 'pet-breath-factor'
let breathFactor = 1

function baseBreathStrength() {
  // 自带 ParamBreath 的模型，程序化起伏压到 35%（参数呼吸已经够）
  return model && model.hasParameter && model.hasParameter('ParamBreath') ? 0.35 : 1
}

function applyBreath() {
  if (model) model.breathStrength = baseBreathStrength() * breathFactor
}

function loadBreathPref() {
  try {
    const raw = window.localStorage.getItem(BREATH_KEY)
    if (raw !== null) {
      const value = Number(raw)
      if (Number.isFinite(value)) breathFactor = Math.min(1.5, Math.max(0, value))
    }
  } catch (error) {
    /* ignore */
  }
}

const breathRange = document.getElementById('breathRange')
const breathValue = document.getElementById('breathValue')

function syncBreathUi() {
  if (breathRange) breathRange.value = String(Math.round(breathFactor * 100))
  if (breathValue) breathValue.textContent = Math.round(breathFactor * 100) + '%'
}

loadBreathPref()
syncBreathUi()

if (breathRange) {
  breathRange.addEventListener('input', () => {
    breathFactor = Math.min(1.5, Math.max(0, Number(breathRange.value) / 100))
    syncBreathUi()
    applyBreath()
    try {
      window.localStorage.setItem(BREATH_KEY, String(breathFactor))
    } catch (error) {
      /* ignore */
    }
  })
}

// --------------------------------------------------------- character import

const characterSelect = document.getElementById('characterSelect')
const dropZone = document.getElementById('dropZone')
const dropStatus = document.getElementById('dropStatus')

function setDropStatus(text, kind) {
  if (!dropStatus) return
  dropStatus.textContent = text || ''
  dropStatus.className = 'dropzone-status' + (kind ? ' ' + kind : '')
}

async function refreshCharacterList() {
  if (!characterSelect || !window.pet.listCharacters) return
  try {
    const result = await window.pet.listCharacters()
    if (!result || !result.ok) return
    characterSelect.innerHTML = ''
    for (const item of result.items || []) {
      const option = document.createElement('option')
      option.value = item.id
      option.textContent = item.name || item.id
      characterSelect.appendChild(option)
    }
    if (result.active) characterSelect.value = result.active
    else if (character && character.id) characterSelect.value = character.id
  } catch (error) {
    /* ignore */
  }
}

async function importCharacterFile(file) {
  if (!file) return
  if (!window.pet || typeof window.pet.importCharacter !== 'function') {
    setDropStatus('当前版本不支持导入', 'error')
    return
  }
  if (!/\.zip$/i.test(file.name || '')) {
    setDropStatus('只能导入 .zip 压缩包（收到：' + (file.name || '未知') + '）', 'error')
    return
  }
  const filePath = window.pet.pathForFile(file)
  if (!filePath) {
    setDropStatus('拿不到文件路径，请把 zip 放到本地磁盘再拖进来', 'error')
    return
  }

  setDropStatus('正在解压：' + file.name + ' …')
  try {
    const result = await window.pet.importCharacter(filePath)
    if (!result || !result.ok) {
      setDropStatus('导入失败：' + ((result && result.error) || '未知错误'), 'error')
      return
    }
    setDropStatus('导入成功：' + result.character.name + '（' + (result.files || 0) + ' 个文件）', 'ok')
    await refreshCharacterList()
    await loadCharacter(result.character)
  } catch (error) {
    setDropStatus('导入失败：' + error.message, 'error')
  }
}

if (characterSelect) {
  characterSelect.addEventListener('change', async () => {
    const id = characterSelect.value
    if (!id) return
    const result = await window.pet.switchCharacter(id)
    if (result && result.ok) await loadCharacter(result.character)
    else setDropStatus('切换失败：' + ((result && result.error) || '未知错误'), 'error')
  })
}

if (dropZone) {
  for (const type of ['dragenter', 'dragover']) {
    dropZone.addEventListener(type, (event) => {
      event.preventDefault()
      event.stopPropagation()
      dropZone.classList.add('active')
    })
  }
  for (const type of ['dragleave', 'dragend']) {
    dropZone.addEventListener(type, () => dropZone.classList.remove('active'))
  }
  dropZone.addEventListener('drop', (event) => {
    event.preventDefault()
    event.stopPropagation()
    dropZone.classList.remove('active')
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]
    importCharacterFile(file)
  })
}

// 整个窗口挡住默认拖放（否则会把文件当页面加载）
for (const type of ['dragover', 'drop']) {
  window.addEventListener(
    type,
    (event) => {
      event.preventDefault()
      event.stopPropagation()
    },
    false,
  )
}

// 自动穿透开关：关掉后窗口始终可点（会挡住桌面），用来应付光标检测失灵
let autoClickThrough = true
// ------------------------------------------------------------- advanced modal

const settingsModal = document.getElementById('settingsModal')

// 设置卡片和高级弹窗都做成可拖动 / 可缩放
const panelHead = document.querySelector('#panel .panel-head')
const panelMovable = attachMovable(
  barEl,
  panelHead,
  'pet-ui-box-panel',
  { x: window.innerWidth - 336, y: window.innerHeight - 376, w: 320, h: 360 },
)

const modalCard = document.getElementById('settingsCard')
const modalHead = modalCard ? modalCard.querySelector('.modal-head') : null
const modalMovable = attachMovable(
  modalCard,
  modalHead,
  'pet-ui-box-modal',
  { x: Math.round(window.innerWidth / 2 - 230), y: Math.round(window.innerHeight / 2 - 200), w: 460, h: 400 },
)

function openAdvanced(open) {
  if (!settingsModal) return
  settingsModal.hidden = !open
  if (open) {
    // 弹窗开着就不用留着右下角那块面板了
    if (barEl) barEl.hidden = true
    cancelAutoHide()
    refreshCharacterList()
    if (window.pet && typeof window.pet.setClickThrough === 'function') {
      lastInteractive = true
      window.pet.setClickThrough(false)
    }
  } else {
    scheduleAutoHide()
  }
}

const openAdvancedButton = document.getElementById('btnOpenAdvanced')
if (openAdvancedButton) {
  openAdvancedButton.addEventListener('click', () => {
    // 设置是独立窗口，交给主进程去开
    if (window.pet && typeof window.pet.openSettings === 'function') {
      window.pet.openSettings()
    } else {
      openAdvanced(true)
    }
  })
}

const openConsoleButton = document.getElementById('btnOpenConsole')
if (openConsoleButton) {
  openConsoleButton.addEventListener('click', () => {
    if (window.pet && typeof window.pet.openConsoleWindow === 'function') {
      window.pet.openConsoleWindow()
    }
  })
}

const closeAdvancedButton = document.getElementById('btnCloseAdvanced')
if (closeAdvancedButton) {
  closeAdvancedButton.addEventListener('click', () => openAdvanced(false))
}

// 点卡片外的遮罩关闭
if (settingsModal) {
  settingsModal.addEventListener('pointerdown', (event) => {
    if (event.target === settingsModal) openAdvanced(false)
  })
}

const resetModelPosButton = document.getElementById('btnResetModelPos')
if (resetModelPosButton) {
  resetModelPosButton.addEventListener('click', () => {
    modelPos = defaultModelPos()
    applyModelPos(true)
    placeBubble()
  })
}

// 视线跟随开关 + 幅度
const gazeToggle = document.getElementById('gazeToggle')
const gazeRange = document.getElementById('gazeRange')
const gazeValue = document.getElementById('gazeValue')

function syncGazeRangeUi() {
  if (gazeRange) gazeRange.value = String(Math.round(gazeStrength * 100))
  if (gazeValue) {
    gazeValue.textContent = Math.round(gazeStrength * 100) + '% · 模型幅度'
  }
}

syncGazeRangeUi()

if (gazeRange) {
  gazeRange.addEventListener('input', () => {
    changeGazePref({ strength: Number(gazeRange.value) / 100 })
  })
}

if (gazeToggle) {
  gazeToggle.checked = gazeEnabled
  gazeToggle.addEventListener('change', () => {
    changeGazePref({ enabled: gazeToggle.checked })
    // 关掉时让视线平滑回正
    if (!gazeEnabled) {
      gaze.targetX = 0
      gaze.targetY = 0
    }
  })
}

// 托盘右键菜单的几项，在高级面板里也放一份，省得去托盘找
const watchToggle = document.getElementById('watchToggle')
if (watchToggle) {
  watchToggle.addEventListener('change', () => {
    if (window.pet && typeof window.pet.setWatch === 'function') {
      window.pet.setWatch(watchToggle.checked)
    }
  })
}

const toggleWindowButton = document.getElementById('btnToggleWindow')
if (toggleWindowButton) {
  // 不要真把窗口 hide 掉：面板在窗口里，隐藏之后就没东西能点回来了。
  // 收成右下角的小球，随时点得回来。
  toggleWindowButton.addEventListener('click', () => {
    openAdvanced(false)
    collapseToBall()
  })
}

const quitButton = document.getElementById('btnQuit')
if (quitButton) {
  quitButton.addEventListener('click', () => {
    if (window.pet && typeof window.pet.quit === 'function') window.pet.quit()
  })
}

const clickThroughToggle = document.getElementById('clickThroughToggle')
if (clickThroughToggle) {
  try {
    const stored = window.localStorage.getItem('pet-auto-click-through')
    if (stored !== null) autoClickThrough = stored === '1'
  } catch (error) {
    /* ignore */
  }
  clickThroughToggle.checked = autoClickThrough
  clickThroughToggle.addEventListener('change', () => {
    autoClickThrough = clickThroughToggle.checked
    try {
      window.localStorage.setItem('pet-auto-click-through', autoClickThrough ? '1' : '0')
    } catch (error) {
      /* ignore */
    }
    if (!autoClickThrough && window.pet.setClickThrough) window.pet.setClickThrough(false)
    lastInteractive = null
  })
}

/** 菜单（面板）跟着聊天出现 */
function syncChrome() {
  if (!barEl) return
  // 只有设置面板自己的状态能把它叫出来；聊天面板打开时不抢位置（否则右下角两个框叠一起）
  if (scalePanel && !scalePanel.hidden) barEl.hidden = false
}

/** 从角色 manifest 的语料里随机说一句 */
/** 随机播一个动作：按模型实际拥有的动作组来，不再写死 Wave/Raise */
// ---------------------------------------------------------------- C3：待机导演

/**
 * 低强度小剧本。只用短动作（张望 3s / 伸懒腰 3.4s / 打招呼 2.6s），
 * 不用脱捕那种 13 秒的，免得用户在忙的时候被长时间占用。
 * 走的是现成的 runShow，所以外部 pet_show 一到就会把这里打断。
 */
const IDLE_SCRIPTS = [
  [{ at: 0, motion: '张望' }, { at: 1800, expression: '脸红' }, { at: 3600, expression: 'none' }],
  [{ at: 0, motion: '伸懒腰' }, { at: 2400, expression: '＞＜' }, { at: 4200, expression: 'none' }],
  [{ at: 0, motion: '打招呼' }, { at: 1500, expression: '爱心眼' }, { at: 3400, expression: 'none' }],
  [{ at: 0, expression: '屑屑眼' }, { at: 2200, expression: 'none' }],
  [{ at: 0, motion: '张望' }, { at: 2000, expression: '流冷汗' }, { at: 3800, expression: 'none' }],
]

const IDLE_DIRECTOR_MIN_MS = 20000
const IDLE_DIRECTOR_MAX_MS = 60000
/** 用户最近一次交互（点击/拖动/聊天）在这么久内就先别自己演 */
const IDLE_QUIET_MS = 15000

let idleDirectorTimer = 0
let lastUserTouchAt = 0
let idleDirectorEnabled = true

function markUserTouch() {
  lastUserTouchAt = Date.now()
}

function scheduleIdleDirector() {
  if (idleDirectorTimer) window.clearTimeout(idleDirectorTimer)
  const gap = IDLE_DIRECTOR_MIN_MS + Math.random() * (IDLE_DIRECTOR_MAX_MS - IDLE_DIRECTOR_MIN_MS)
  idleDirectorTimer = window.setTimeout(() => {
    idleDirectorTimer = 0
    runIdleScene()
    scheduleIdleDirector()
  }, gap)
}

function runIdleScene() {
  if (!idleDirectorEnabled) return
  if (!model || document.hidden) return
  // 正在演（不管是她就是 agent）就别抢台
  if (showRunning) return
  // 用户刚动过手，先安静一会儿
  if (Date.now() - lastUserTouchAt < IDLE_QUIET_MS) return
  if (paused) return
  const script = IDLE_SCRIPTS[Math.floor(Math.random() * IDLE_SCRIPTS.length)]
  // 用独立的 token 流程：runShow 内部会 ++showToken，
  // 所以外部 pet_show 一到就天然把这段打断
  runShow(script, {}).catch(() => {})
}

function playRandomAction() {
  if (!model || !model.actionGroups || model.actionGroups.length === 0) return false
  const group = model.actionGroups[Math.floor(Math.random() * model.actionGroups.length)]
  const list = model.motionGroups.get(group)
  if (!list || list.length === 0) return false
  // 狗尾草动作：手指贴图和默认手重叠，播放时手部有虚影，随机动作里跳过（控制台仍可手动播）
  const withIndex = list.map((motion, index) => ({ motion, index }))
  const safe = withIndex.filter(({ motion }) => !/狗尾草/.test(String(motion.petName || '')))
  const pool = safe.length ? safe : withIndex
  const pick = pool[Math.floor(Math.random() * pool.length)]
  return model.playMotion(group, pick.index)
}

/**
 * A2：按场景选语料池。
 * manifest 里 speechPools 是可选的；没有这个字段时退回旧的 speech 数组，
 * 所以老角色包照样能用。
 */
function pickSpeechPool(reason) {
  const pools = (character && character.speechPools) || null
  const fallback = (character && character.speech) || []
  if (!pools) return fallback
  // 点击一定是点击反应，优先级最高
  if (reason === 'click' && Array.isArray(pools.click) && pools.click.length) return pools.click
  // C2：好感度优先于时间——冷淡就该冷冷地说话，不管几点
  if (affinityMood === 'cold' && Array.isArray(pools.cold) && pools.cold.length) return pools.cold
  if (affinityMood === 'close' && Array.isArray(pools.close) && pools.close.length) return pools.close
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 10 && Array.isArray(pools.morning)) return pools.morning
  if (hour >= 23 || hour < 5) {
    if (Array.isArray(pools.lateNight)) return pools.lateNight
  }
  if (lastSceneGame && Array.isArray(pools.gaming)) return pools.gaming
  if (lastSceneWork && Array.isArray(pools.work)) return pools.work
  if (Array.isArray(pools.idle) && pools.idle.length) return pools.idle
  return fallback
}

// C2：好感度（主进程推送，渲染层只用来选语气池）
let affinity = 0
let affinityMood = 'normal'

let lastSceneGame = false
let lastSceneWork = false

function sayRandom(reason) {
  const lines = pickSpeechPool(reason || 'click')
  if (!lines || lines.length === 0) return
  let text = lines[Math.floor(Math.random() * lines.length)]
  // 避免连着两次说同一句
  if (lines.length > 1 && text === lastSaidLine) {
    text = lines[(lines.indexOf(text) + 1) % lines.length]
  }
  lastSaidLine = text
  showBubble(text)
  applyEmotion(['none', 'blush', 'smug', 'heart', 'deadpan', 'sweat'][Math.floor(Math.random() * 6)])
  playRandomAction()
  scheduleAutoHide()
}

let lastSaidLine = ''

function openChat() {
  if (!chatEl.hidden) {
    inputEl.focus()
    return
  }
  chatEl.hidden = false
  const epoch = ++chatOpenEpoch, revision = chatLogRevision
  if (appearance.chatDock) dockChat()
  markUserTouch()
  // 聊天和设置面板都在右下角，开聊天就把面板收起来，别互相压着
  if (barEl) barEl.hidden = true
  window.pet.setPanel(true)
  syncChrome()
  cancelAutoHide()
  inputEl.focus()
  const history = window.pet.chatHistory()
  if (!history || typeof history.then !== 'function') return
  history.then((result) => {
    if (chatEl.hidden || epoch !== chatOpenEpoch || revision !== chatLogRevision) return
    logEl.innerHTML = ''
    const empty = document.getElementById('chatEmpty')
    if (empty) empty.hidden = Boolean(result.chat?.length)
    for (const entry of result.chat || []) {
      logMessage(entry.role === 'user' ? 'user' : 'pet', entry.text)
    }
  }).catch(() => { if (!chatEl.hidden && epoch === chatOpenEpoch && revision === chatLogRevision) logMessage('err','聊天记录暂时无法读取，可以稍后重新打开。') })
}

function closeChat() {
  chatOpenEpoch += 1
  chatEl.hidden = true
  window.pet.setPanel(false)
  syncChrome()
  scheduleAutoHide()
}

document.getElementById('btnChat').addEventListener('click', () => {
  // 方案 D：聊天挪到独立窗口，主窗不再展开内嵌聊天面板
  if (window.pet && typeof window.pet.openChatWindow === 'function') window.pet.openChatWindow()
})

document.getElementById('btnObserve').addEventListener('click', async () => {
  if (busy) return
  busy = true
  setDot('busy')
  setStatus('看看你在做什么…')
  try {
    const result = await window.pet.observe(false)
    if (result.ok) {
      perform(result)
      if (!chatEl.hidden && result.say) logMessage('pet', result.say, { animate: true })
    } else setStatus('观察失败：' + result.error, true)
  } finally {
    busy = false
    setDot('ready')
    if (!statusEl.dataset.error) setStatus('')
  }
})

// 收起 = 屏幕上只留一个小球（窗口是全屏的，不缩；只是不画模型）
function collapseToBall() {
  closeChat()
  if (scalePanel) scalePanel.hidden = true
  if (barEl) barEl.hidden = true
  if (menuButton) menuButton.hidden = true
  stage.hidden = true
  handleEl.hidden = false
  cancelAutoHide()
  handleEl.focus({preventScroll:true})
}

function expandFromBall() {
  const returnFocus = document.activeElement === handleEl
  handleEl.hidden = true
  stage.hidden = false
  showTransientUI()
  if (returnFocus) menuButton?.focus({preventScroll:true})
}

document.getElementById('btnHide').addEventListener('click', collapseToBall)

handleEl.addEventListener('click', expandFromBall)

document.getElementById('composer').addEventListener('submit', async (event) => {
  event.preventDefault()
  const text = inputEl.value.trim()
  if (!text || busy) return
  inputEl.value = ''
  logMessage('user', text)
  busy = true
  sendEl.disabled = true
  sendEl.textContent = '发送中…'
  setDot('busy')
  try {
    const result = await window.pet.send(text)
    if (result.ok) {
      logMessage('pet', result.say, { animate: true })
      perform(result)
    } else {
      logMessage('err', result.error || '出错了')
      setDot('error')
    }
  } catch (error) {
    logMessage('err','发送失败，请检查模型配置后重试。')
    setDot('error')
  } finally {
    busy = false
    sendEl.disabled = false
    sendEl.textContent = '发送'
    if (dot.dataset.state !== 'error') setDot('ready')
    if (!chatEl.hidden) inputEl.focus()
  }
})

// ------------------------------------------------------------------- events

/** 把每个 drawable 投到窗口坐标，用来定位异常绘制块（调试用）。 */
function dumpDrawables() {
  if (!model || !app) return { ok: false, error: '模型未就绪' }
  const core = model.getModel().getModel()
  const count = core.getDrawableCount()
  const W = model.width
  const H = model.height
  const sx = model.scale.x
  const sy = model.scale.y
  const px = model.x
  const py = model.y
  const items = []
  for (let i = 0; i < count; i += 1) {
    const vp = core.getDrawableVertexPositions(i)
    if (!vp || vp.length < 6) continue
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (let k = 0; k < vp.length; k += 2) {
      const x = vp[k]
      const y = vp[k + 1]
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    // anchor 0.5 / 1：本地矩形底边中点对齐到 (px, py)
    const x0 = px + (minX - W / 2) * sx
    const y0 = py + (minY - H) * sy
    const x1 = px + (maxX - W / 2) * sx
    const y1 = py + (maxY - H) * sy
    items.push({
      i,
      x: Math.round(Math.min(x0, x1)),
      y: Math.round(Math.min(y0, y1)),
      w: Math.round(Math.abs(x1 - x0)),
      h: Math.round(Math.abs(y1 - y0)),
      tex: core.getDrawableTextureIndex ? core.getDrawableTextureIndex(i) : -1,
      opacity: core.getDrawableOpacity(i),
    })
  }
  return { ok: true, width: model.size.width, height: model.size.height, items }
}

/** 汇总遮罩信息：多少 drawable 用了剪裁遮罩（Cubism 4 API 用 counts 数组）。 */
function dumpMasks() {
  if (!model) return { ok: false, error: '模型未就绪' }
  const core = model.getModel().getModel()
  let masked = 0
  let refs = 0
  let maxPerDrawable = 0
  try {
    const counts = core.getDrawableMaskCounts()
    for (let i = 0; i < counts.length; i += 1) {
      const value = counts[i]
      if (value > 0) {
        masked += 1
        refs += value
        if (value > maxPerDrawable) maxPerDrawable = value
      }
    }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
  let version = null
  try {
    version = window.Live2DCubismCore && window.Live2DCubismCore.Version
      ? window.Live2DCubismCore.Version.csmGetVersion()
      : null
  } catch (error) {
    version = null
  }
  return {
    ok: true,
    drawables: core.getDrawableCount(),
    maskedDrawables: masked,
    totalMaskRefs: refs,
    maxMasksPerDrawable: maxPerDrawable,
    coreVersion: version,
  }
}

window.pet.onEvent((payload) => {
  if (!payload) return
  if (payload.type === 'director-cancel') {
    if (!payload.requestId || directorRuntime.status().requestId === payload.requestId) directorRuntime.cancel('cancelled')
    return
  }
  if (payload.type === 'director-plan') {
    const caps = localDirectorCapabilities(payload.caps?.displays || [])
    const checked = window.PetDirectorContract.validatePlan(payload.plan, caps)
    if (!checked.ok) { window.pet.report({ type: 'director-status', result: { ...checked, requestId: payload.requestId } }); return }
    if (!handleEl.hidden) expandFromBall()
    resetAll(['motion', 'expression', 'param'])
    showToken++; showRunning = false
    directorRuntime.start(checked.plan, caps, payload.requestId)
    interactionActiveUntil = performance.now() + 30000
    return
  }
  if (payload.type === 'play-plan' && payload.ir) {
    playChoreo(payload.ir, payload.id)
    return
  }
  if (payload.type === 'expand') {
    if (!handleEl.hidden) expandFromBall()
    return
  }
  if (payload.type === 'cursor') {
    // 窗口穿透时收不到 mousemove，靠主进程轮询的坐标驱动视线。
    // payload.x/y 是窗口内坐标（穿透判定用），sx/sy 是屏幕坐标（视线跟随用）。
    if (!Number.isFinite(payload.x) || !Number.isFinite(payload.y)) return
    const at = Number(payload.at) || Number(payload.timestamp) || Date.now()
    if (at < lastCursorAt) return
    lastCursorAt = at
    const sx = Number.isFinite(payload.sx) ? payload.sx : payload.x + window.screenX
    const sy = Number.isFinite(payload.sy) ? payload.sy : payload.y + window.screenY
    cursorPos = { x: sx, y: sy }
    updateGazeTarget(sx, sy)
    updateClickThrough(payload.x, payload.y)
    return
  }
  if (payload.type === 'hotkey') {
    handleVtubeHotkey(payload)
    return
  }
  if (payload.type === 'hide-ui') {
    const hide = Boolean(payload.hide)
    for (const el of [barEl, chatEl, bubble, menuButton, handleEl]) {
      if (!el) continue
      if (hide) {
        el.dataset.prevHidden = el.hidden ? '1' : '0'
        el.hidden = true
      } else if (el.dataset.prevHidden === '0') {
        el.hidden = false
      }
      if (!hide) delete el.dataset.prevHidden
    }
    return
  }  if (payload.type === 'read-params') {
    const wanted = Array.isArray(payload.ids) ? payload.ids : []
    const values = {}
    if (model && typeof model.getParameterValue === 'function') {
      for (const id of wanted) values[id] = model.getParameterValue(id)
    }
    if (window.pet && typeof window.pet.report === 'function') {
      window.pet.report({ type: 'params-read', requestId: payload.requestId, characterRevision, values })
    }
    return
  }
  if (payload.type === 'wake') {
    resetGazeMotion()
    // 睡眠唤醒后：拖动状态可能停在 active，穿透判定缓存也可能过期
    drag.active = false
    drag.moved = false
    drag.origin = null
    lastInteractive = null
    uiDragging = 0
    // C3：睡眠期间 setTimeout 可能冻结，唤醒后重新排期待机导演
    lastUserTouchAt = Date.now()
    if (idleDirectorEnabled) scheduleIdleDirector()
    if (stage) stage.classList.remove('dragging')
    if (window.pet && typeof window.pet.setClickThrough === 'function') {
      window.pet.setClickThrough(false)
    }
    return
  }
  if (payload.type === 'click-through-state') {
    lastInteractive = !payload.ignore
    pendingInteractive = null
    pendingCount = 0
    return
  }
  if (payload.type === 'affinity') {
    affinity = Number(payload.value) || 0
    affinityMood = String(payload.mood || 'normal')
    return
  }
  if (payload.type === 'pause') {
    paused = true
    resetGazeMotion()
    return
  }
  if (payload.type === 'resume') {
    paused = false
    return
  }
  if (payload.type === 'capabilities-request') {
    if (window.pet && typeof window.pet.report === 'function') {
      window.pet.report({ type: 'capabilities', data: dumpCapabilities() })
    }
    return
  }
  if (payload.type === 'show') {
    markUserTouch()
    const showReqId = String(payload.reqId || '')
    runShow(payload.timeline || [], { loop: Boolean(payload.loop), reqId: showReqId }).then((result) => {
      reportShowResult({ ...result, reqId: showReqId })
    }).catch((error) => {
      reportShowResult({ interrupted: true, error: String(error.message || error), reqId: showReqId })
    })
    return
  }
  if (payload.type === 'reset') {
    const cleared = resetAll(payload.scope)
    if (window.pet && typeof window.pet.report === 'function') {
      window.pet.report({ type: 'reset-done', cleared })
    }
    return
  }
  if (payload.type === 'preset') {
    const ok = applyPreset(payload.name)
    if (window.pet && typeof window.pet.report === 'function') {
      window.pet.report({ type: 'preset-done', ok, name: payload.name })
    }
    return
  }
  if (payload.type === 'console-request') {
    reportConsoleState()
    return
  }
  if (payload.type === 'console-action') {
    handleConsoleAction(payload.payload)
    return
  }
  if (payload.type === 'settings-command') {
    handleSettingsCommand(payload.payload)
    return
  }
  if (payload.type === 'lip-sync') {
    handleRemoteLipSync(payload)
    return
  }
  if (payload.type === 'acting') {
    // 主进程发来的即时表演；未知的名字会被表演层拒绝
    if (typeof payload.gesture === 'string') performGesture(payload.gesture)
    if (typeof payload.mood === 'string') setActingMood(payload.mood)
    return
  }
  if (payload.type === 'sayRandom') {
    sayRandom()
    return
  }
  if (payload.type === 'character' && payload.character) {
    loadCharacter(payload.character).catch((error) => {
      setStatus('换角色失败：' + error.message, true)
      setDot('error')
    })
    return
  }
  if (payload.type === 'ui') {
    if (payload.chat) openChat()
    else closeChat()
    return
  }
  if (payload.type === 'scale') {
    if (Number.isFinite(payload.x)) viewScale.x = clampScale(payload.x)
    if (Number.isFinite(payload.y)) viewScale.y = clampScale(payload.y)
    applyScale(true)
    saveScale()
    return
  }
  if (payload.type === 'param') {
    const reject = (result) => window.pet.report({ type: 'param-applied', requestId: payload.requestId, result })
    if (!model?.ready) { reject({ ok: false, status: 503, code: 'MODEL_NOT_READY' }); return }
    if (payload.characterRevision !== characterRevision) { reject({ ok: false, status: 409, code: 'CHARACTER_CHANGED' }); return }
    const set = payload.set || { [payload.id]: payload.value }
    const check = payload.resetAll ? { ok: true, set: {} } : window.PetParameterPolicy.validateSet(set, model.parameterCatalog.params)
    if (!check.ok) { reject(check); return }
    if (payload.resetAll) clearParameterSources()
    else for (const [id, value] of Object.entries(check.set)) {
      if (value === null) agentOverrides.delete(id)
      else agentOverrides.set(id, value)
    }
    pendingParamAcks.push({ requestId: payload.requestId, characterRevision, set: check.set, reset: Boolean(payload.resetAll) })
    return
  }
  if (payload.type === 'part') {
    const id = String(payload.id || '')
    if (!id) return
    if (payload.value === null || payload.value === undefined) partOverrides.delete(id)
    else partOverrides.set(id, Number(payload.value))
    return
  }
  if (payload.type === 'dump') {
    try {
      const result = dumpDrawables()
      result.masks = dumpMasks()
      window.pet.report({ kind: 'drawables', data: result })
    } catch (error) {
      window.pet.report({ kind: 'drawables', data: { ok: false, error: String(error) } })
    }
    return
  }
  if (payload.type !== 'say') return
  perform(payload)
  if (!chatEl.hidden && payload.say) logMessage('pet', payload.say, { animate: true })
})

window.pet.onStatus((payload) => {
  if (payload && payload.text) setStatus(payload.text, true)
})

// 调试入口（本机控制口用，不影响正常交互）
window.__petDebug = {
  click() {
    sayRandom()
    showTransientUI()
  },
  collapse() {
    collapseToBall()
  },
  expand() {
    expandFromBall()
  },
  settings(open) {
    if (barEl) barEl.hidden = !open
    if (open) showTransientUI()
    else scheduleAutoHide()
  },
  setPanelAlpha(value) {
    panelAlpha = Math.min(1, Math.max(0.25, Number(value)))
    applyPanelAlpha()
  },
  moveMenu(x, y) {
    placeMenuButton(Number(x), Number(y), true)
  },
  probe(x, y) {
    const rect = canvas.getBoundingClientRect()
    return {
      onModel: model ? model.isOpaqueAt(x, y) : null,
      panel: insideElement(barEl, x, y),
      menu: insideElement(menuButton, x, y),
      pos: modelPos ? { ...modelPos } : null,
    }
  },
  moveModel(x, y) {
    if (!modelPos) return null
    modelPos.x = Number(x)
    modelPos.y = Number(y)
    applyModelPos(true)
    return { ...modelPos }
  },
  menuPos() {
    return menuPos ? { x: menuPos.x, y: menuPos.y } : null
  },
  state() {
    return {
      model: Boolean(model),
      ready: Boolean(model && model.ready),
      bubble: bubble ? !bubble.hidden : null,
      menu: menuButton ? !menuButton.hidden : null,
      bar: barEl ? !barEl.hidden : null,
      chat: !chatEl.hidden,
      scale: { x: viewScale.x, y: viewScale.y },
      render: { x: Number(renderScale.x.toFixed(3)), y: Number(renderScale.y.toFixed(3)) },
      speech: character && character.speech ? character.speech.length : 0,
      name: character ? character.name : null,
      fps: window.__petFps || 0,
    }
  },
}

bootEngine().catch((error) => {
  setDot('error')
  setStatus('形象加载失败：' + error.message, true)
  console.error(error)
})

// ======================= 独立窗口 / 边缘吸附 / 表情修复 =======================

let expressionBase = null
let lastExpressionName = null
let lastExpressionKeys = null

/** 拍一份"没有表情"时的参数基线 */
function captureExpressionBase() {
  try {
    const core = model && model.getModel && model.getModel()
    if (core && core._parameterValues) expressionBase = Float32Array.from(core._parameterValues)
  } catch (error) {
    expressionBase = null
  }
}

/** 只还原某个表情动过的参数（参数 id 列表是 csmVector，得用 getSize/at） */
function resetExpressionParams(name) {
  if (!name || !expressionBase || !model || !model.expressionParams) return
  const ids = model.expressionParams.get(name) || []
  if (!ids.length) return
  try {
    const core = model.getModel()
    const allIds = core._parameterIds
    const values = core._parameterValues
    if (!allIds || !values) return
    const size = typeof allIds.getSize === 'function' ? allIds.getSize() : allIds.length
    for (const entry of ids) {
      const id = typeof entry === 'string' ? entry : entry && entry.id
      if (!id) continue
      for (let i = 0; i < size; i += 1) {
        const item = typeof allIds.at === 'function' ? allIds.at(i) : allIds[i]
        const paramName = item && item._id && item._id.s
        if (paramName === id) {
          values[i] = expressionBase[i]
          break
        }
      }
    }
  } catch (error) {
    /* ignore */
  }
}

function clearExpressionNow() {
  try {
    // 表情现在写在 overrides 里，清场就是把这批 key 删掉
    clearExpressionValues()
    if (model && typeof model.saveParameters === "function") {
      try {
        model.saveParameters()
      } catch (error) {
        /* 模型未就绪时忽略 */
      }
    }
    if (model && model._expressionManager) model._expressionManager.stopAllMotions()
    return true
  } catch (error) {
    return false
  }
}

// ------------------------------------------------------------------ 边缘吸附

const SNAP_KEY = 'pet-edge-snap'
let snapDistance = 24

function loadSnapPref() {
  try {
    const raw = window.localStorage.getItem(SNAP_KEY)
    if (raw !== null) {
      const value = Number(raw)
      if (Number.isFinite(value)) snapDistance = Math.min(120, Math.max(0, value))
    }
  } catch (error) {
    /* ignore */
  }
}

loadSnapPref()

function applyEdgeSnap() {
  if (!snapDistance || !modelPos || !model || !window.pet.moveTo) return
  const size = modelScreenSize()
  const ds = window.screen || {}
  const screenLeft = Number.isFinite(ds.availLeft) ? ds.availLeft : 0
  const screenTop = Number.isFinite(ds.availTop) ? ds.availTop : 0
  const screenRight = screenLeft + (ds.availWidth || window.innerWidth)
  const screenBottom = screenTop + (ds.availHeight || window.innerHeight)
  const centerX = window.screenX + modelPos.x
  const centerY = window.screenY + modelPos.y
  const left = centerX - size.w / 2
  const right = centerX + size.w / 2
  const top = centerY - size.h / 2
  const bottom = centerY + size.h / 2

  let shiftX = 0
  let shiftY = 0
  if (left < screenLeft + snapDistance && left > screenLeft - snapDistance * 3) shiftX = screenLeft - left
  else if (right > screenRight - snapDistance && right < screenRight + snapDistance * 3) {
    shiftX = screenRight - right
  }
  if (top < screenTop + snapDistance && top > screenTop - snapDistance * 3) shiftY = screenTop - top
  else if (bottom > screenBottom - snapDistance && bottom < screenBottom + snapDistance * 3) {
    shiftY = screenBottom - bottom
  }

  if (shiftX || shiftY) {
    window.pet.moveTo(window.screenX + shiftX, window.screenY + shiftY)
    lastInteractive = null
  }
}

// ------------------------------------------------ 独立窗口发来的命令

function reportSettingsState() {
  if (!window.pet || typeof window.pet.report !== 'function') return
  window.pet.report({
    type: 'settings-state',
    state: { gazeStrength, gazeBody, gazeSpeed, breathFactor, liveliness: livelinessStrength, actingScale, snapDistance, gazeEnabled, clickThrough: autoClickThrough, idleDirectorEnabled, bindings: model?.parameterCatalog?.bindings || {},appearance,appearanceStatus },
  })
}

function reportConsoleState() {
  if (!model || !window.pet || typeof window.pet.report !== 'function') return
  window.pet.report({
    type: 'console-state',
    state: {
      motions: Array.isArray(model.motionMeta) ? model.motionMeta : [],
      expressions: model.expressionList ? [...model.expressionList.keys()] : [],
    },
  })
}

function handleSettingsCommand(payload) {
  const cmd = payload && payload.cmd
  const value = payload && payload.value
  switch (cmd) {
    case 'appearance':
      if(value&&typeof value==='object'&&!Array.isArray(value))changeAppearance(value)
      break
    case 'previewDialogue':
      showBubble('现在对话框贴近我了。字号和两处背景都可以在这里调整。',12000)
      break
    case 'requestState':
      reportSettingsState()
      break
    case 'ttsSayLanguage':
      if (value === 'ja' || value === 'zh') ttsSayLanguage = value
      break
    case 'ttsConfig':
      if (value && typeof value === 'object') {
        if (typeof value.lipSync === 'boolean') lipSync.enabled = value.lipSync
        if (typeof value.enabled === 'boolean') ttsEnabled = value.enabled
        if (value.sayLanguage === 'ja' || value.sayLanguage === 'zh') ttsSayLanguage = value.sayLanguage
      }
      break
    case 'gazeStrength':
      changeGazePref({ strength: value / 100 })
      break
    case 'gazeEnabled':
      changeGazePref({ enabled: Boolean(value) })
      break
    case 'gazeBody':
      changeGazePref({ body: value / 100 })
      break
    case 'gazeSpeed':
      changeGazePref({ speed: value / 100 })
      break
    case 'perform':
      if (typeof value === 'string') performGesture(value)
      break
    case 'mood':
      if (typeof value === 'string') setActingMood(value, 1)
      break
    case 'actingScale':
      setActingScale(value / 100)
      break
    case 'liveliness':
      setLiveliness(value / 100)
      break
    case 'breathFactor':
      if (Number.isFinite(value)) {
        breathFactor = Math.min(1.5, Math.max(0, value / 100))
        applyBreath()
      }
      break
    case 'snapDistance':
      if (Number.isFinite(value)) snapDistance = Math.min(120, Math.max(0, value))
      break
    case 'clickThrough':
      autoClickThrough = Boolean(value)
      lastInteractive = null
      if (!autoClickThrough && window.pet.setClickThrough) window.pet.setClickThrough(false)
      break
    case 'watch':
      if (window.pet.setWatch) window.pet.setWatch(Boolean(value))
      break
    case 'idleDirector':
      idleDirectorEnabled = Boolean(value)
      if (idleDirectorEnabled) scheduleIdleDirector()
      else if (idleDirectorTimer) {
        window.clearTimeout(idleDirectorTimer)
        idleDirectorTimer = 0
      }
      break
    case 'saveDefaultScale':
      savedDefaultScale = { x: viewScale.x, y: viewScale.y }
      try {
        window.localStorage.setItem(DEFAULT_SCALE_KEY, JSON.stringify(savedDefaultScale))
      } catch (error) {
        /* ignore */
      }
      break
    case 'resetDefaultScale':
      viewScale.x = clampScale(savedDefaultScale.x)
      viewScale.y = clampScale(savedDefaultScale.y)
      applyScale(true)
      saveScale()
      break
    case 'resetModelPos':
      modelPos = defaultModelPos()
      applyModelPos(true)
      break
    case 'collapse':
      collapseToBall()
      break
    case 'windowSize':
      if (value && window.pet.setWindowSize) window.pet.setWindowSize(value)
      break
    case 'quit':
      if (window.pet.quit) window.pet.quit()
      break
    default:
      break
  }
}

function handleConsoleAction(payload) {
  if (!model || !payload) return
  if (payload.kind === 'motion' && payload.group) {
    model.playMotion(payload.group, Number(payload.index) || 0)
    return
  }
  if (payload.kind === 'expression' && payload.name) {
    playReaction(payload.name)
    return
  }
  if (payload.kind === 'expressionClear') clearExpressionNow()
}

/**
 * 播放表情：直接把 exp3 里的参数值写进模型。
 * 之前用 expressionManager（setExpression）时情绪类表情不生效，
 * 而状态类（体型/服装）一直能用——它们本质就是改参数，
 * 所以这里统一走「写参数」这条路，行为一致。
 */
/** 多表情叠加：按激活顺序合并，后开的覆盖先开的（同参数） */
let expressionStack = []

/** 表情写入通道：走 overrides（逐帧重放），不能直写 _parameterValues（下一帧就被覆盖） */
function playReaction(name) {
  if (!model || !name) return false
  const entries = (model.expressionParams && model.expressionParams.get(name)) || []
  if (!entries.length) return false
  // 已激活则关闭，否则叠加
  const idx = expressionStack.indexOf(name)
  if (idx >= 0) expressionStack.splice(idx, 1)
  else expressionStack.push(name)
  applyExpressionStack()
  return true
}

/** 按激活顺序合成所有表情参数：后开的覆盖先开的，基线取模型默认值 */
function applyExpressionStack() {
  if (!model) return
  // 先把上一轮表情占用的参数恢复到默认
  for (const id of lastExpressionKeys || []) {
    const base = model.parameterById.get(id)?.default || 0
    fadeTo(id, base, 200)
  }
  const merged = new Map()
  for (const name of expressionStack) {
    const entries = (model.expressionParams && model.expressionParams.get(name)) || []
    for (const entry of entries) {
      const id = typeof entry === 'string' ? entry : entry && entry.id
      if (!id) continue
      const raw = typeof entry === 'object' ? entry.value : 0
      const blend = typeof entry === 'object' ? entry.blend : 2
      merged.set(id, { raw: Number(raw), blend })
    }
  }
  const applied = []
  for (const [id, { raw, blend }] of merged) {
    let value = Number.isFinite(raw) ? raw : 0
    const isAdd = blend === 0 || blend === 'Add' || blend === 'Additive'
    const isMul = blend === 1 || blend === 'Multiply'
    if (isAdd || isMul) {
      const base = model.parameterById.get(id)?.default || 0
      value = isAdd ? base + value : base * value
    }
    fadeTo(id, value, 200)
    applied.push(id)
  }
  lastExpressionKeys = applied
  lastExpressionName = expressionStack[expressionStack.length - 1] || null
}

/** 只清掉表情写进 overrides 的那些参数，别动别的覆盖 */
function clearExpressionValues() {
  expressionStack = []
  if (Array.isArray(lastExpressionKeys)) {
    for (const id of lastExpressionKeys) {
      // Release only this source; a newer fade replaces this entry atomically.
      const cur = overrides.has(id) ? Number(overrides.get(id)) || 0 : 0
      const base = model?.parameterById.get(id)?.default || 0
      if (Math.abs(cur - base) > 0.01) {
        fadeTo(id, base, 260, true)
      } else {
        overrides.delete(id)
        fades.delete(id)
      }
    }
  }
  lastExpressionKeys = null
  lastExpressionName = null
}

// ==================== Agent 操作层：capabilities / show / reset ====================

/** 默认缩放与位置（reset 用，只动画面不动用户偏好） */
const MOTION_PAIRS = {
  举手切默认手: '默认手切举手',
  默认手切举手: '举手切默认手',
  竖手指切出来动画: '竖手指切回默认',
  竖手指切回默认: '竖手指切出来动画',
  狗尾草切换出来: '狗尾草切回默认手',
  狗尾草切回默认手: '狗尾草切换出来',
}

/** 哪些动作是「打开」，需要收尾时补关 */
/** 哪些动作是「打开」，收尾时补一条反动作把状态还原（注意方向：默认手切举手 = 举起） */
const PAIR_OPENERS = {
  默认手切举手: '举手切默认手',
  竖手指切出来动画: '竖手指切回默认',
  狗尾草切换出来: '狗尾草切回默认手',
}

const EYE_EXCLUSIVE = ['圈圈眼', '爱心眼', '＞＜', '屑屑眼']

let showToken = 0
let showRunning = false
let motionByFile = null

function buildMotionIndex() {
  if (!model || !Array.isArray(model.motionMeta)) return
  motionByFile = new Map()
  for (const item of model.motionMeta) {
    motionByFile.set(item.name, item)
  }
}

/** 按文件名播动作（找不到返回 false） */
function playMotionFile(file) {
  if (!model) return false
  if (!motionByFile) buildMotionIndex()
  const item = motionByFile && motionByFile.get(file)
  if (!item) return false
  return model.playMotion(item.group, item.index)
}

/** 模型热键（.vtube.json）：表情开关 / 动作播放 / 清除全部表情 */
function handleVtubeHotkey(payload) {
  const action = String(payload.action || '')
  const file = String(payload.file || '')
  const name = file.replace(/\.(exp3|motion3)\.json$/i, '').replace(/\.json$/i, '')
  if (action === 'RemoveAllExpressions' || action === 'RemoveAllExpression') {
    clearExpressionNow()
    return
  }
  if (!name) return
  if (action === 'ToggleExpression') {
    if (!playReaction(name)) applyExpressionAny(name)
    return
  }
  if (action === 'TriggerAnimation') {
    playMotionFile(file)
  }
}

/**
 * 统一表情派发：优先真 exp3（23 个），失败回退 key 开关（13 个）。
 * command / show / console 三处共用同一条路，避免「状态类能用、情绪类不行」。
 */
function applyExpressionAny(name) {
  if (!name || name === 'none') {
    clearExpressionNow()
    return true
  }
  if (playReaction(name)) return true
  if (Object.hasOwn(EMOTION_KEYS, name)) {
    applyEmotion(name)
    return true
  }
  return false
}

/** 能力清单：动作 / 表情 / 参数 / 部件 / 互斥组 / 预设 */
function dumpCapabilities() {
  const motions = (model && Array.isArray(model.motionMeta) ? model.motionMeta : []).map((item) => ({
    group: item.group,
    index: item.index,
    file: item.name,
    durationMs: Math.round((item.duration || 0) * 1000),
    pair: MOTION_PAIRS[item.name] || null,
  }))
  const expressions = model && model.expressionList ? [...model.expressionList.keys()] : []
  const params = model?.parameterCatalog?.params || []
  const parts = model && typeof model.getPartIds === 'function' ? model.getPartIds() : []
  return {
    ok: true,
    characterRevision,
    parameterPolicyVersion: 1,
    actor: { capturedAt: Date.now(), base: baseModelHeight(), scale: { ...viewScale }, size: modelScreenSize(),
      pos: modelPos ? { ...modelPos } : null, viewport: { width: innerWidth, height: innerHeight },
      appearance: { ...appearance }, settings: { gazeEnabled, gazeStrength, gazeBody, gazeSpeed } },
    bindings: model?.parameterCatalog?.bindings || {},
    physicsStats: model?.parameterCatalog?.stats || {},
    motionAdaptations: model?.motionAdaptations || [],
    character: character
      ? { id: character.id, name: character.name || character.id }
      : null,
    motions,
    expressions,
    keyEmotions: EMOTION_KEYS,
    exclusive: { eyes: EYE_EXCLUSIVE },
    params,
    parts,
    presets: character?.id === 'DeepSeek免费公皮' ? PRESETS : {},
  }
}

/** 预设组合：一次调用做完一组表情 + 参数 */
const PRESETS = {
  害羞: { expression: '脸红', param: { AngleX: -12, AngleZ: -5, ParamEyeLOpen: 0.7, ParamEyeROpen: 0.7 } },
  生气: { expression: '＞＜', param: { AngleZ: 5, PositionX: 3 } },
  无语: { expression: '黑脸', param: { AngleY: -7 } },
  惊喜: { expression: '爱心眼', param: { AngleY: 9, ParamMouthOpenY: 0.45 } },
  疲惫: { expression: '流冷汗', param: { AngleY: -9, AngleZ: -3, ParamEyeLOpen: 0.65, ParamEyeROpen: 0.65 } },
}

function applyPreset(name) {
  const preset = Object.hasOwn(PRESETS, name) ? PRESETS[name] : null
  if (!preset || character?.id !== 'DeepSeek免费公皮') return false
  presetOverrides.clear()
  if (preset.expression) applyExpressionAny(preset.expression)
  if (preset.param) {
    const check = window.PetParameterPolicy.validateSet(preset.param, model.parameterCatalog.params)
    if (!check.ok) return false
    for (const [id, value] of Object.entries(check.set)) presetOverrides.set(id, value)
  }
  return true
}

/** 复位：把演出留下的东西清掉，但不动用户的缩放/位置偏好 */
function clearParameterSources() {
  agentOverrides.clear()
  presetOverrides.clear()
  overrides.clear()
  fades.clear()
  clearPulses()
  blinkValues.clear()
  blinking = false
  nextBlinkAt = performance.now() + 2500
  lastExpressionKeys = null
  lastExpressionName = null
}

function resetAll(scope) {
  directorRuntime.cancel('reset')
  const want = new Set(Array.isArray(scope) && scope.length ? scope : ['motion', 'expression', 'param', 'part'])
  const cleared = {}
  if (want.has('scale')) {
    viewScale.x = clampScale(savedDefaultScale.x)
    viewScale.y = clampScale(savedDefaultScale.y)
    normalizeAspect()
    applyScale(true)
    saveScale()
    resize()
    cleared.scale = {...viewScale}
  }
  if (want.has('motion')) {
    try {
      if (model) model.stopMotions()
      cleared.motion = true
    } catch (error) {
      cleared.motion = false
    }
  }
  if (want.has('expression')) {
    cleared.expression = true
    overrides.clear()
    fades.clear()
    lastExpressionKeys = null
    lastExpressionName = null
    if (model?._expressionManager) model._expressionManager.stopAllMotions()
    // command 走的是 activeKeys，reset 必须一起清，否则表情拆不掉
    activeKeys.clear()
  }
  if (want.has('param')) {
    cleared.param = overrides.size + agentOverrides.size + presetOverrides.size
    clearParameterSources()
    // reset 之后不应该还在抖
    try {
      clearPulses()
    } catch (error) {
      /* ignore */
    }
  }
  if (want.has('part')) {
    cleared.part = partOverrides.size
    partOverrides.clear()
  }
  showToken += 1
  showRunning = false
  setRenderFps(false)
  return cleared
}

/**
 * 时间轴演出。timeline 每项 { at, motion, expression, say, preset }。
 * at 是相对演出起点的毫秒；用 token 实现真打断。
 */
/** 时间轴上「最后一步动作播完」的毫秒数（含动作自身时长） */
function motionEndMs(timeline) {
  let end = 0
  for (const step of timeline || []) {
    const at = Number(step && step.at) || 0
    const file = step && step.motion
    let dur = 0
    if (file && model && Array.isArray(model.motionMeta)) {
      const hit = model.motionMeta.find((m) => m.name === file)
      if (hit) dur = (Number(hit.duration) || 0) * 1000
    }
    end = Math.max(end, at + dur)
  }
  return end
}

async function runShow(timeline, options) {
  const opts = options || {}
  const reqId = opts.reqId || ''
  const token = ++showToken
  showRunning = true
  setRenderFps(true)   // 演出期间回满帧
  // 演出优先：清掉点击动画，别让残留的脉冲和 show 抢参数
  try {
    clearPulses()
  } catch (error) {
    /* ignore */
  }
  const played = []
  const skipped = []
  let round = 0
  let lastDurationMs = 0

  try {
  // 用 while 而不是递归：loop 时递归会让栈深度线性增长（V8 不做尾调用优化），
  // 单步 at:0 的时间轴 3 秒内必然 RangeError，整个渲染进程挂掉。
  while (true) {
    round += 1
    const roundStartedAt = performance.now()
    // 除第一轮外，每轮清空记录，回执里给最后一轮的结果
    if (round > 1) {
      played.length = 0
      skipped.length = 0
    }
    const pendingOpens = new Set()

    for (let i = 0; i < timeline.length; i += 1) {
      const step = timeline[i] || {}
      const wait = Number(step.at || 0) - (performance.now() - roundStartedAt)
      if (wait > 0) {
        // 分段等：一下子 sleep(wait) 会睡死，打断要等到睡完才生效
        let left = wait
        while (left > 0) {
          if (token !== showToken) break
          await new Promise((r) => setTimeout(r, Math.min(120, left)))
          left = Number(step.at || 0) - (performance.now() - roundStartedAt)
        }
      }
      if (token !== showToken) {
        return { interrupted: true, played, skipped, round, durationMs: lastDurationMs }
      }
      let ok = true
      if (step.preset) {
        ok = applyPreset(step.preset)
        if (!ok) skipped.push({ index: i, reason: '未知预设:' + step.preset })
      }
      if (step.expression) {
        const done = applyExpressionAny(step.expression)
        if (!done) {
          ok = false
          skipped.push({ index: i, reason: '未知表情:' + step.expression })
        }
      }
      if (step.motion) {
        const done = playMotionFile(step.motion)
        if (done) {
          if (PAIR_OPENERS[step.motion]) pendingOpens.add(step.motion)
          else if (Object.values(PAIR_OPENERS).includes(step.motion)) {
            pendingOpens.delete(Object.keys(PAIR_OPENERS).find((k) => PAIR_OPENERS[k] === step.motion))
          }
        } else {
          ok = false
          skipped.push({ index: i, reason: '未知动作:' + step.motion })
        }
      }
      if (step.say) {
        const next = timeline[i + 1]
        const gap = next ? Math.max(600, Number(next.at || 0) - Number(step.at || 0)) : 3200
        showBubble(step.say, gap)
      }
      if (ok) played.push(i)
    }

    // 等到这一步的动作也播完（loop 的每轮都要等，否则下一轮立刻覆盖上一轮的动作）
    if (token === showToken) {
      const expected = motionEndMs(timeline)
      let remain = expected - (performance.now() - roundStartedAt)
      // 分段等：否则 13 秒的脱捕要等满才响应打断
      while (remain > 0) {
        if (token !== showToken) break
        await new Promise((r) => setTimeout(r, Math.min(120, remain)))
        remain = expected - (performance.now() - roundStartedAt)
      }
      if (token !== showToken) {
        return { interrupted: true, played, skipped, round, durationMs: performance.now() - roundStartedAt }
      }
    }

    // Only close a hand pose after its opening motion has actually finished.
    for (const open of pendingOpens) {
      if (token !== showToken) break
      const close = PAIR_OPENERS[open]
      if (close && playMotionFile(close)) {
        const dur = motionEndMs([{ at: 0, motion: close }])
        const until = performance.now() + dur
        while (token === showToken && performance.now() < until) await new Promise((r) => setTimeout(r, 50))
      }
    }

    lastDurationMs = performance.now() - roundStartedAt
    if (token !== showToken) {
      return { interrupted: true, played, skipped, round, durationMs: lastDurationMs }
    }
    if (!opts.loop) break
    // A speech-only/empty loop must always yield so reset/interrupt remains responsive.
    await new Promise((r) => setTimeout(r, Math.max(16, 250 - lastDurationMs)))
    if (token !== showToken) return { interrupted: true, played, skipped, round, durationMs: lastDurationMs }
  }

  if (token === showToken) { showRunning = false; setRenderFps(false) }
  return { interrupted: false, played, skipped, round, durationMs: lastDurationMs, reqId }
  } finally {
    if (token === showToken) { showRunning = false; setRenderFps(false) }
  }
}

/** 把演出结果回执给主进程 */
function reportShowResult(result) {
  if (!window.pet || typeof window.pet.report !== 'function') return
  window.pet.report({ type: 'show-done', result })
}

// Local authenticated diagnostics. Sampling observes the real render/physics path, not a mock.
let animationTrace = null
function sampleAnimationFrame(stageName) {
  if (!animationTrace || animationTrace.frames.length >= animationTrace.limit) return
  const values = Object.fromEntries(animationTrace.ids.map((id) => [id, model.getParameterValue(id)]))
  animationTrace.frames.push({ at: performance.now(), stage: stageName, values, claims: [...model.motionClaims] })
}

window.__petCandidate = {
  state: () => ({ version: '0.6.8-preview.11', characterRevision, appearance, gaze: { ...gaze }, head: { ...gazeHead }, director: directorRuntime.status(),
    settings: { gazeEnabled, gazeStrength, gazeBody, gazeSpeed }, bindings: model?.parameterCatalog?.bindings,
    agent: Object.fromEntries(agentOverrides), preset: Object.fromEntries(presetOverrides), expression: Object.fromEntries(overrides),
    click: Object.fromEntries(clickOverrides), fades: fades.size, motions: [...(model?.motionClaims || [])], showRunning,
    pos: modelPos, size: modelScreenSize(), fps: window.__petFps, headlessTest }),
  gaze: (x, y) => { controlledGaze = x === null ? null : { x: Math.max(-1, Math.min(1, Number(x) || 0)), y: Math.max(-1, Math.min(1, Number(y) || 0)) }; return true },
  prefs: (values) => { changeGazePref(values); return true },
  click: (zone, side = 1) => { playClickAnim(zone, side); return true },
  preset: applyPreset,
  motion: playMotionFile,
  reset: resetAll,
  trace: (ids, limit = 12000) => { animationTrace = { ids, limit: Math.min(20000, limit), frames: [] }; return true },
  takeTrace: () => { const out = animationTrace; animationTrace = null; return out },
  fps: (fps) => { minFrameInterval = 1000 / Math.max(10, Math.min(120, fps)); return true },
  blink: () => { nextBlinkAt = performance.now(); return true },
  appearance: changeAppearance,
}

applyAppearance()
for(const url of [appearance.sceneImage,appearance.bubbleImage].filter(Boolean)){
  const generation=appearanceGeneration,img=new Image()
  img.onerror=()=>{
    if(generation!==appearanceGeneration)return
    missingBackgrounds.add(url);appearanceStatus='已保存的图片缺失或不可读，暂用底色；请重新选择背景。';applyAppearance();reportSettingsState()
  }
  img.src=url
}
