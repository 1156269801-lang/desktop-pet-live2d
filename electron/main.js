'use strict'

/**
 * 大肥鱼桌宠 — Electron 主进程。
 *
 * 三件事：
 *   1. 一个透明置顶的无边框窗口，里面是渲染进程的 Live2D 页面。页面走本地
 *      HTTP，这样 Cubism 的 XHR / fetch 不会踩到 file:// 的跨源限制。
 *   2. 用户明确授权后，使用本机加密保存的独立 API 凭据调用导演模型。
 *      不读取 DSH 凭据；统一人设只通过主进程上下文装配器使用。
 *   3. 一个本机控制口：127.0.0.1:port 上的 HTTP API，DSH 的插件用 secret
 *      调它就能在对话里让她说话、做表情。
 *
 * 注意：screen / desktopCapturer / Tray / Menu / globalShortcut 都只能在
 * app ready 之后触碰 —— 顶层解构会在 ready 之前触发断言，主进程静默退出。
 */

const path = require('node:path')
const fs = require('node:fs')
const http = require('node:http')
const crypto = require('node:crypto')
const { execFile, spawn } = require('node:child_process')
const { extractZip } = require('./unzip')
const { startQQGateway } = require('./qq-gateway')
const { readVtubeHotkeys } = require('./vtube-hotkeys')
const { toContentCursor } = require('./cursor-coordinates')
const { normalizeWindowGeometry } = require('./window-geometry')
const { validateSet } = require('../renderer/parameter-policy')
const { sanitizeEnvelope } = require('../renderer/lip-sync')
const { stripMarkup } = require('../renderer/director-markup')
const { importBackground, readBackgroundAsset } = require('./background-assets')
const { protectString, createVault } = require('./secret-vault')
const { createDirector } = require('./director-service')
const { createForegroundSensor } = require('./foreground-sensor')
const { readStaticAsset } = require('./static-assets')
const { createPlatformSecurity, configureSandbox } = require('./platform-security')

/** QQ 网关实例（config.qq.enabled 打开后才有） */
let qqGateway = null

/** 已注册的模型热键加速键（换角色时先注销） */
let vtubeHotkeyAccel = []

/** 注册当前角色 .vtube.json 里的模型热键 */
function registerVtubeHotkeys(character) {
  for (const acc of vtubeHotkeyAccel) {
    try {
      shortcuts().unregister(acc)
    } catch {
      /* ignore */
    }
  }
  vtubeHotkeyAccel = []
  if (!character || !character.model) return 0
  const modelDir = path.dirname(path.join(CHARACTERS_DIR, character.id, character.model))
  const hotkeys = readVtubeHotkeys(modelDir)
  let ok = 0
  for (const h of hotkeys) {
    try {
      const registered = shortcuts().register(h.accelerator, () => {
        pushToPet({ type: 'hotkey', action: h.action, file: h.file, fade: h.fade, name: h.name })
      })
      if (registered) {
        vtubeHotkeyAccel.push(h.accelerator)
        ok += 1
      }
    } catch {
      /* 按键冲突时跳过 */
    }
  }
  logLine('[hotkey] 模型热键注册', ok + '/' + hotkeys.length)
  return ok
}

const ROOT = path.resolve(__dirname, '..')
const TEST_HEADLESS = process.env.DAFEIYU_TEST_HEADLESS === '1'
const APP_VERSION = 'v0.6.8-preview.11'
const APP_LABEL = '大肥鱼桌宠 · ' + APP_VERSION + ' 测试版'
const LOG_PATH = path.join(ROOT, '_pet.log')

/** Windows 上 electron.exe 是 GUI 子系统，stdout 常常看不到，所以同时落盘。 */
function logLine(...args) {
  const text = args
    .map((item) => {
      if (typeof item === 'string') return item
      try {
        return JSON.stringify(item)
      } catch {
        return String(item)
      }
    })
    .join(' ')
  try {
    fs.appendFileSync(LOG_PATH, new Date().toISOString() + ' ' + text + '\n', 'utf8')
  } catch {
    /* ignore */
  }
  console.log(text)
}

process.on('uncaughtException', (error) => {
  logLine('[fatal] uncaught:', error && error.stack ? error.stack : String(error))
})
process.on('unhandledRejection', (reason) => {
  logLine('[fatal] unhandled rejection:', String(reason))
})

const electron = require('electron')
const { app, BrowserWindow, ipcMain } = electron
try { configureSandbox(app) } catch (error) {
  logLine('[boot]', error.code || 'PLATFORM_SANDBOX_DISABLED')
  app.exit(1)
  throw error
}
// powerMonitor 用于睡眠唤醒后恢复交互（取不到也不影响其它功能）
const powerMonitor = electron.powerMonitor || null

// 这台机器上 %APPDATA% 下的默认 userData 会让 requestSingleInstanceLock 直接
// abort（无 JS 异常、无 stderr），所以把运行时目录挪到应用自己的文件夹里。
const PROFILE_DIR = path.join(ROOT, '_profile')
try {
  fs.mkdirSync(PROFILE_DIR, { recursive: true })
  app.setPath('userData', PROFILE_DIR)
  app.setPath('sessionData', PROFILE_DIR)
} catch (error) {
  logLine('[boot] userData 重定向失败:', error.message)
}

const LOCK_PATH = path.join(ROOT, '_pet.lock')

/** 用 pid 文件代替 requestSingleInstanceLock（后者在本机会 abort）。 */
function acquireLock() {
  try {
    const previous = Number(fs.readFileSync(LOCK_PATH, 'utf8').trim())
    if (Number.isFinite(previous) && previous > 0 && previous !== process.pid) {
      try {
        process.kill(previous, 0)
        return false
      } catch {
        /* 旧进程已经不在了 */
      }
    }
  } catch {
    /* 没有锁文件 */
  }
  try {
    fs.writeFileSync(LOCK_PATH, String(process.pid), 'utf8')
  } catch (error) {
    logLine('[boot] 写锁文件失败:', error.message)
  }
  return true
}

const screenModule = () => electron.screen
const desktopCapturerModule = () => electron.desktopCapturer
const trayClass = () => electron.Tray
const menuClass = () => electron.Menu
const shortcuts = () => electron.globalShortcut
const nativeImageModule = () => electron.nativeImage
const shellModule = () => electron.shell

const RENDERER_DIR = path.join(ROOT, 'renderer')
const ASSET_DIR = path.join(ROOT, 'assets')
const CHARACTERS_DIR = path.join(ROOT, 'characters')
const CONFIG_PATH = path.join(ROOT, 'config.json')
const STATE_PATH = path.join(ROOT, 'state.json')
const SHOT_DIR = path.join(ROOT, '_shots')
// 独立候选版：桥接和可选凭据均只留在自身目录，不触碰正式版 ~/.dsh。
const DSH_HOME = path.join(ROOT, '_integration')
const CREDENTIALS_PATH = path.join(DSH_HOME, '.credentials.yaml')
const BRIDGE_PATH = path.join(DSH_HOME, 'pet-bridge.json')
const BRIDGE_FALLBACK = path.join(ROOT, 'pet-bridge.json')
const platformSecurity = createPlatformSecurity({ root: ROOT,
  beforeLegacyDelete: () => director.cancel(),
  onLegacyCommitted: (file) => {
    if (file === 'state') { delete state.chat; delete state.memories }
    if (file === 'config') {
      for (const current of [config, rawConfig]) {
        delete current.persona
        if (current.autonomy && typeof current.autonomy === 'object') delete current.autonomy.persona
        if (current.llm && typeof current.llm === 'object') { delete current.llm.apiKey; delete current.llm.credentialRef }
      }
      legacyPersona.chat = null; legacyPersona.autonomy = null
      director.clearLegacyPersona?.()
    }
  },
})
// Fail closed before persona, credentials, memory or bridge files are opened.
try { platformSecurity.initialize() } catch (error) {
  logLine('[boot]', error.code || 'PLATFORM_ACL_FAILED')
  app.exit(1)
  throw error
}

/** 控制口信息仅写入候选版自身目录。 */
/**
 * A3：截图目录清理。
 * 只删「超过 24 小时」且「不在最新 50 张里」的文件——
 * agent 的上下文里可能还留着最近截图的路径，按条数砍会导致 read_image 失败。
 */
function pruneShots() {
  try {
    if (!fs.existsSync(SHOT_DIR)) return 0
    const cutoff = Date.now() - 24 * 3600 * 1000
    const files = fs
      .readdirSync(SHOT_DIR)
      .filter((name) => name.toLowerCase().endsWith('.png'))
      .map((name) => {
        const file = path.join(SHOT_DIR, name)
        try {
          const stat = fs.statSync(file)
          return { file, mtime: stat.mtimeMs, size: stat.size }
        } catch {
          return null
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime)
    let removed = 0
    files.forEach((item, index) => {
      // 最新 50 张永远保留；更早的才看时间
      if (index < 50) return
      if (item.mtime > cutoff) return
      try {
        fs.unlinkSync(item.file)
        removed += 1
      } catch {
        /* 被占用就下次再说 */
      }
    })
    if (removed) logLine('[pet] 清理旧截图', removed, '张')
    return removed
  } catch (error) {
    return 0
  }
}

function writeBridge(info) {
  // Only the ACL-verified bridge directory may receive authentication metadata.
  const protectedInfo = { ...info, secretProtected: protectString(info.secret, 'dafeiyu-bridge-v1') }
  delete protectedInfo.secret
  fs.mkdirSync(DSH_HOME, { recursive: true })
  const candidates = [BRIDGE_PATH]
  for (const file of candidates) {
    try {
      fs.writeFileSync(file, JSON.stringify(protectedInfo, null, 2) + '\n', 'utf8')
      return file
    } catch (error) {
      logLine('[pet] 写 bridge 失败', file, error.code || error.message)
    }
  }
  return ''
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.moc3': 'application/octet-stream',
}

// ------------------------------------------------------------------- config

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  try {
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8')
  } catch (error) {
    logLine('[pet] 写入失败', file, error.message)
  }
}

// Settings permissions must never report success after a failed disk write.
// Keep general legacy state persistence separate; director settings use this
// same-directory atomic replacement and propagate a fixed public error.
function saveDirectorConfig() {
  const temporary = CONFIG_PATH + '.' + crypto.randomUUID() + '.tmp'
  let fd, ownsTemporary = false
  try {
    fd = fs.openSync(temporary, 'wx', 0o600); ownsTemporary = true
    fs.writeFileSync(fd, JSON.stringify(config, null, 2) + '\n', 'utf8')
    fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined
    fs.renameSync(temporary, CONFIG_PATH); ownsTemporary = false
  } catch {
    throw new Error('配置未保存到磁盘；当前运行已停止，请检查目录可写性后重试。')
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd) } catch {} }
    if (ownsTemporary) { try { fs.unlinkSync(temporary) } catch {} }
  }
}

const DEFAULT_CONFIG = {
  window: { width: 400, height: 620, alwaysOnTop: true, skipTaskbar: true, x: null, y: null },
  llm: {
    baseURL: 'https://discovery-api.intern-ai.org.cn/v1',
    model: 'deepseek-v4-flash-vision',
    temperature: 0.85,
    maxTokens: 400,
  },
  control: { port: 41968 },
  watch: { enabled: false, intervalMs: 75000, maxSilenceMs: 240000, vision: false },
  // QQ 接入（OneBot 11 正向 WS）：enabled 打开后才连接
  qq: {
    enabled: false,
    wsUrl: 'ws://127.0.0.1:3001',
    accessToken: '',
    selfId: '',
    adminQq: '',
    atOnly: true,
    replyInQQ: true,
    groups: [],
  },
  // TTS：把气泡台词交给本地 GPT-SoVITS 合成（engine: 'gpt-sovits'）
  tts: {
    enabled: true,
    engine: 'gpt-sovits',
    url: 'http://127.0.0.1:9880/tts',
    refAudio: 'D:/GPT-SoVITS/ref_audio/idle50.wav',
    lang: 'zh',
    refLang: 'ja',
    // 说话语言：ja=日语朗读（speech_ja），zh=中文朗读（speech）
    sayLanguage: 'ja',
    // 口型同步：说话时按语音音量驱动张嘴
    lipSync: true,
  },
  debug: { captureAfterMs: 0 },
}

function mergeConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const merged = { ...DEFAULT_CONFIG, ...source }
  for (const key of ['window', 'llm', 'control', 'watch', 'qq', 'tts', 'debug']) {
    merged[key] = { ...DEFAULT_CONFIG[key], ...(source[key] || {}) }
  }
  return merged
}

// Capture legacy presence before default merging; offer explicit settings import.
const rawConfig = readJson(CONFIG_PATH, {})
const legacyPersona = {
  chat: typeof rawConfig?.persona === 'string' ? rawConfig.persona : null,
  autonomy: typeof rawConfig?.autonomy?.persona === 'string' ? rawConfig.autonomy.persona : null,
}
const config = mergeConfig(rawConfig)
// Legacy watch lacks scoped consent; autonomous perception remains opt-in.
config.watch.enabled = false
const state = Object.assign(
  {
    window: { x: null, y: null, width: null, height: null },
    games: {},
    lastSeen: null,
    character: 'dafeiyu',
    // Compatibility affinity counters; explicit memory has its own private store.
    affinity: 0,
    lastInteractAt: 0,
    interactions: { click: 0, chat: 0, ignoredDays: 0 },
  },
  readJson(STATE_PATH, {}),
)

// 兜底：旧存档可能只有部分字段
if (!Number.isFinite(state.affinity)) state.affinity = 0
if (!state.interactions || typeof state.interactions !== 'object') {
  state.interactions = { click: 0, chat: 0, ignoredDays: 0 }
}
// Preserve any historical memories value verbatim on save, including malformed
// field types. Never create, normalize, migrate or read it as runtime context.

function saveState() {
  writeJson(STATE_PATH, state)
}

// ------------------------------------------------------------- characters

/** 从 model3.json 里找第一张纹理，当角色缩略图用（找不到就返回空） */
function findPreviewTexture(dir, modelFile) {
  try {
    const modelPath = path.join(dir, modelFile)
    const json = JSON.parse(fs.readFileSync(modelPath, 'utf8'))
    const textures = json && json.FileReferences && json.FileReferences.Textures
    if (!Array.isArray(textures) || textures.length === 0) return ''
    const modelDir = path.dirname(modelPath)
    const texturePath = path.resolve(modelDir, textures[0])
    if (!fs.existsSync(texturePath)) return ''
    const rel = path.relative(dir, texturePath).split(path.sep).join('/')
    return rel.split('/').map(encodeURIComponent).join('/')
  } catch {
    return ''
  }
}

/** 每个角色就是一个 characters/<id>/ 目录，里面必须有 manifest.json。 */
function readCharacter(id) {
  if (typeof id !== 'string' || id.length === 0) return null
  // 允许中文目录名（导入的角色包常是中文），只挡路径穿越和非法字符
  if (id.includes('/') || id.includes('\\') || id.includes('..')) return null
  if (/[<>:"|?*\u0000-\u001f]/.test(id)) return null
  const safe = id
  const dir = path.join(CHARACTERS_DIR, safe)
  const manifestPath = path.join(dir, 'manifest.json')
  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch {
    return null
  }
  const modelFile = typeof manifest.model === 'string' ? manifest.model : 'model3.json'
  if (!fs.existsSync(path.join(dir, modelFile))) return null
  const previewFile = typeof manifest.icon === 'string' && manifest.icon ? manifest.icon : findPreviewTexture(dir, modelFile)
  return {
    id: safe,
    name: typeof manifest.name === 'string' ? manifest.name : safe,
    model: modelFile,
    speech: Array.isArray(manifest.speech) ? manifest.speech.filter((line) => typeof line === 'string') : [],
    // A2：按场景分组的语料池（可选字段，旧角色包没有就走 speech 回退）
    speechPools:
      manifest.speechPools && typeof manifest.speechPools === 'object'
        ? Object.fromEntries(
            Object.entries(manifest.speechPools)
              .filter(([, list]) => Array.isArray(list))
              .map(([key, list]) => [key, list.filter((line) => typeof line === 'string')]),
          )
        : {},
    // 日语台词池（点击/待机等本地语料，TTS 朗读用）
    speechPoolsJa:
      manifest.speechPoolsJa && typeof manifest.speechPoolsJa === 'object'
        ? Object.fromEntries(
            Object.entries(manifest.speechPoolsJa)
              .filter(([, list]) => Array.isArray(list))
              .map(([key, list]) => [key, list.filter((line) => typeof line === 'string')]),
          )
        : {},
    // 表情分组（reactions = 可以随机播放的那批），渲染层用来做点击反应
    expressions: manifest.expressions && typeof manifest.expressions === 'object' ? manifest.expressions : {},
    defaultScale:
      manifest.defaultScale && Number.isFinite(manifest.defaultScale.x) && Number.isFinite(manifest.defaultScale.y)
        ? { x: manifest.defaultScale.x, y: manifest.defaultScale.y }
        : { x: 1, y: 1 },
    baseUrl:
      '/characters/' +
      encodeURIComponent(safe) +
      '/' +
      modelFile.split('/').map(encodeURIComponent).join('/'),
    preview: previewFile ? '/characters/' + encodeURIComponent(safe) + '/' + previewFile : '',
  }
}

function listCharacters() {
  let entries = []
  try {
    entries = fs.readdirSync(CHARACTERS_DIR, { withFileTypes: true })
  } catch {
    return []
  }
  const items = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const character = readCharacter(entry.name)
    if (character) items.push(character)
  }
  return items
}

function activeCharacter() {
  return readCharacter(state.character) || listCharacters()[0] || null
}

// ------------------------------------------------------- 角色导入（zip）

const DEFAULT_SPEECH = [
  '在的，怎么了？',
  '……你又盯着我看。',
  '刚才是不是在想我？',
  '别熬太晚，真的。',
  '需要我陪一会儿吗？',
  '今天的你也在偷懒吧。',
]

/** 递归找 .model3.json（压缩包里常常多套一层目录） */
function findModelFiles(dir, out = [], depth = 0) {
  if (depth > 8) return out
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) findModelFiles(full, out, depth + 1)
    // 注意：模型文件可能就叫 model3.json（没有前缀点），别写成 \.model3\.json
    else if (/model3\.json$/i.test(entry.name)) out.push(full)
  }
  return out
}

function sanitizeCharacterId(raw) {
  let id = String(raw || '')
    .trim()
    .replace(/[<>:"|?*\u0000-\u001f]/g, '')
    .replace(/[\\/]+/g, '-')
  if (!id) id = 'character-' + Date.now()
  return id.slice(0, 60)
}

/** 解压 → 找模型 → 生成 manifest → 返回可以直接用的角色对象 */
function importCharacterFromZip(zipPath) {
  const stat = fs.statSync(zipPath)
  if (!stat.isFile()) throw new Error('这不是文件')
  if (!/\.zip$/i.test(zipPath)) throw new Error('只支持 .zip 压缩包')

  fs.mkdirSync(CHARACTERS_DIR, { recursive: true })
  const baseName = path.basename(zipPath, path.extname(zipPath))
  const seed = sanitizeCharacterId(baseName)

  let id = seed
  let target = path.join(CHARACTERS_DIR, id)
  let suffix = 2
  while (fs.existsSync(target)) {
    id = sanitizeCharacterId(seed + '-' + suffix)
    target = path.join(CHARACTERS_DIR, id)
    suffix += 1
  }

  fs.mkdirSync(target, { recursive: true })
  try {
    const result = extractZip(zipPath, target)
    const topLevel = (() => {
      try {
        return fs.readdirSync(target)
      } catch {
        return []
      }
    })()
    logLine('[pet] 解压完成 files=', result.files, '顶层=', JSON.stringify(topLevel))
    const models = findModelFiles(target)
    if (models.length === 0) {
      logLine('[pet] 扫描模型结果为 0，目录树：', JSON.stringify(topLevel))
      throw new Error('压缩包里没找到 .model3.json')
    }

    const modelRel = path.relative(target, models[0]).split(path.sep).join('/')
    const manifest = {
      id,
      name: baseName || id,
      model: modelRel,
      defaultScale: { x: 1, y: 1 },
      speech: DEFAULT_SPEECH.slice(),
      expressions: {},
    }
    fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')

    const character = readCharacter(id)
    if (!character) throw new Error('模型文件不完整（manifest 校验没通过）')
    logLine('[pet] 导入角色:', id, 'files=', result.files, 'model=', modelRel)
    return { character, files: result.files }
  } catch (error) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
    throw error
  }
}

// Helpers still shared by compatibility HTTP commands and bounded wait loops.
const MOTIONS = new Set(['none', 'wave', 'raise', 'drop'])
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
// ------------------------------------------------- compatibility affinity

const AFFINITY_MIN = -100
const AFFINITY_MAX = 100

function clampAffinity(value) {
  return Math.max(AFFINITY_MIN, Math.min(AFFINITY_MAX, Math.round(value)))
}

/** 心跳式衰减：一天没互动 -3，按整天数算，最多记 7 天 */
function decayAffinity() {
  const last = Number(state.lastInteractAt) || 0
  if (!last) {
    state.lastInteractAt = Date.now()
    return 0
  }
  const days = Math.floor((Date.now() - last) / 86400000)
  if (days <= 0) return 0
  const lost = Math.min(7, days) * 3
  state.affinity = clampAffinity(state.affinity - lost)
  state.interactions.ignoredDays = Math.min(30, (state.interactions.ignoredDays || 0) + days)
  state.lastInteractAt = Date.now()
  saveState()
  logLine('[pet] 好感度衰减', -lost, '→', state.affinity)
  return lost
}

/** 互动：点一次 +1，聊天 +2 */
function bumpAffinity(kind) {
  const weight = kind === 'chat' ? 2 : kind === 'click' || kind === 'command' ? 1 : 0
  if (!weight) return state.affinity
  state.affinity = clampAffinity(state.affinity + weight)
  state.lastInteractAt = Date.now()
  if (kind === 'click') state.interactions.click = (state.interactions.click || 0) + 1
  if (kind === 'chat') state.interactions.chat = (state.interactions.chat || 0) + 1
  saveState()
  return state.affinity
}

/** 好感度决定语气：<-20 冷淡，>50 亲近 */
function affinityMood() {
  if (state.affinity <= -20) return 'cold'
  if (state.affinity >= 50) return 'close'
  return 'normal'
}

// Only the exact local pet/settings renderer may opt in to explicit memory.
// HTTP callers never get this trusted option, even if their body contains it.
async function replyAsPet(userText, scene, { allowMemory = false } = {}) {
  if (/^(?:停|停止|停下|暂停|停止自主运行|stop)[。！!\s]*$/i.test(String(userText).trim())) {
    director.autonomyStop()
    director.cancel()
    return { say: '已停止自主运行。', emotion: 'none', motion: 'none' }
  }
  // 模型回复要几秒：先让她做一个"在想"的即时反应，台词到了再接上
  pushToPet({ type: 'acting', gesture: 'think' })
  const result = await director.preview({ text: userText, remote: true }, { allowMemory })
  if (!result.ok) throw new Error(result.error || '导演请求失败')
  // 台词里的〔表演标记〕只给主窗用；聊天窗和 QQ 拿到的是纯文字
  return { say: stripMarkup(result.plan.speech) || '……', say_ja: result.plan.speech_ja || '', emotion: 'none', motion: 'none' }
}

/**
 * 统一的聊天处理：HTTP 路由与 QQ 网关共用。
 * preview11 的记忆是显式保存的，聊天不会自动写入记忆；allowMemory 保持 false。
 * meta: { source: 'http' | 'qq', push }
 */
async function handleChatText(rawText, meta = {}) {
  const text = String(rawText || '').slice(0, 2000)
  if (!text) return null
  bumpAffinity('chat')
  const reply = await replyAsPet(text, lastScene)
  lastSpeakAt = Date.now()
  if (meta.push !== false) {
    pushToPet({ type: 'say', ...reply, scene: lastScene, source: meta.source || 'dsh' })
  }
  return reply
}

// -------------------------------------------------------- screen and windows

// Static BOM-prefixed script, paths through environment, observations never logged.
const foregroundSensor = createForegroundSensor({ root: ROOT })

async function senseForDirector({ title = false, screenshot = false, fullscreen = false, signal } = {}) {
  const grants = config.autonomy || {}
  const includeTitle = title === true && grants.allowWindowTitle === true
  const includeScreenshot = screenshot === true && grants.allowScreenshot === true
    && grants.allowAutonomous === true && grants.mode === 'api'
    && config.director.enabled === true && config.director.allowRemote === true
  const geometryOnly = fullscreen === true && grants.pauseFullscreen === true
  if (signal?.aborted || (!includeTitle && !includeScreenshot && !geometryOnly)) return {}
  const front = (includeTitle || geometryOnly) ? await foregroundSensor.read({ includeTitle, signal }) : null
  if (signal?.aborted) return {}
  const sensed = { fullscreen: front?.fullscreen === true }
  if (includeTitle && front?.title) sensed.front = { title: front.title, process: front.process }
  if (includeScreenshot && !(grants.pauseFullscreen && sensed.fullscreen)) {
    // No file, clipboard or opacity manipulation. Only explicit per-session vision consent.
    const imageDataUrl = await captureScreen()
    if (!signal?.aborted && imageDataUrl) sensed.imageDataUrl = imageDataUrl
  }
  return signal?.aborted ? {} : sensed
}

async function captureScreen() {
  const display = screenModule().getPrimaryDisplay()
  const width = 1280
  const height = Math.max(320, Math.round((width * display.size.height) / display.size.width))
  const sources = await desktopCapturerModule().getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
    fetchWindowIcons: false,
  })
  const source = sources.find((item) => String(item.display_id) === String(display.id)) || sources[0]
  if (!source || source.thumbnail.isEmpty()) return null
  return source.thumbnail.toDataURL('image/jpeg', 72)
}

/** Closed legacy path. It must not read titles, capture, upload or persist data. */
async function observe() {
  return { ok: false, status: 403, error: '旧版观察入口已停用；自主感知须在导演设置中单独授权，聊天目前不会读取屏幕。' }
}

function sceneText(observed) {
  if (!observed) return ''
  const front = observed.front
  const analysis = observed.analysis
  const parts = []
  if (front && front.title) parts.push('前台窗口「' + front.title + '」')
  if (analysis && analysis.game) parts.push('看起来在玩《' + analysis.game + '》')
  else if (analysis && analysis.activity) parts.push('看起来在' + analysis.activity)
  return parts.join('，')
}

// ------------------------------------------------------------------- to page

let mainWindow = null
let chatWindow = null
let panelWindow = null
let tray = null
let controlServer = null
let controlSecret = ''
let controlPort = 0
let watchTimer = null
let lastSpeakAt = 0
let lastScene = ''
let lastDump = null
let lastCapabilities = null
const paramWaiters = new Map()
const paramsReadWaiters = new Map()
let parameterRequestSeq = 0
let lastShowResult = null
let lastResetResult = null
// E1：每次 show 一个 reqId，回执按 id 配对，避免并发串台
const showWaiters = new Map()
let showSeq = 0
let showRunning = false
let activeShowReqId = null
let collapsed = false
let expandedBounds = null
const COLLAPSED_SIZE = 76
let clickThrough = true

/** 全屏窗口必须能穿透，否则桌面全被挡住；这里统一开关 */
function applyClickThrough(ignore) {
  clickThrough = Boolean(ignore)
  if (mainWindow && !mainWindow.isDestroyed()) {
    // forward 只对「ignore 为 true」有意义：让被穿透的窗口仍转发 mousemove。
    // 恢复可点时必须传空 options —— 带 forward 会在 Windows 侧留下转发钩子，
    // 结果是 mousemove 照常收到、点击却被转发到下层窗口，表现成「点不动、拖不动」。
    if (clickThrough) mainWindow.setIgnoreMouseEvents(true, { forward: true })
    else mainWindow.setIgnoreMouseEvents(false)
    pushToPet({ type: 'click-through-state', ignore: clickThrough })
  }
  return clickThrough
}

/**
 * 轮询系统光标位置推给渲染进程做命中测试。
 * 不依赖 forward 转发的 mousemove（那个在部分环境里收不到，会表现成"模型点不动"）。
 */
let cursorTimer = null

function sendCursorSample() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  try {
    // Electron 的系统光标和窗口内容边界均为 DIP；不再乘缩放比。
    const point = screenModule().getCursorScreenPoint()
    const sample = toContentCursor(point, mainWindow.getContentBounds(), Date.now())
    if (sample) {
      // x/y 是窗口内坐标（穿透判定用）；sx/sy 是屏幕坐标（视线跟随用，
      // 窗口挪位置、鼠标跑到窗口外时都保持正确）
      sample.sx = point.x
      sample.sy = point.y
      pushToPet({ type: 'cursor', ...sample })
    }
  } catch {
    /* 屏幕或窗口刚销毁时，丢弃该帧 */
  }
}

/**
 * 睡眠唤醒 / 解锁之后，窗口的「忽略鼠标」状态有可能卡住：
 * 系统把 setIgnoreMouseEvents(true, { forward: true }) 之后不再派发事件，
 * 表现就是「模型点不动、拖不动」。
 * 这里在唤醒时强行回到「可点」再让光标轮询重新判定。
 */
function recoverAfterWake(reason) {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return {ok:false,status:503,code:'WINDOW_NOT_READY',error:'窗口尚未就绪'}
    logLine('[pet] 系统唤醒（' + reason + '），恢复窗口状态')
    // 注意：lastInteractive 是渲染层的去抖缓存，主进程没有这个变量，
    // 这里只负责把窗口拉回「可点」，渲染层收到 wake 事件后自己会清缓存。
    if (typeof lastInteractive !== 'undefined') lastInteractive = null
    // 先恢复成可点，宁可短暂挡住桌面，也不要卡死成点不动
    applyClickThrough(false)
    try {
      mainWindow.setAlwaysOnTop(true, 'floating')
    } catch (error) {
      /* ignore */
    }
    // 重建光标轮询（睡眠期间定时器可能已停摆）
    if (!TEST_HEADLESS) startCursorWatch()
    // 通知渲染层把拖动状态归零
    pushToPet({ type: 'wake', reason })
    // 200ms 后让轮询按真实光标位置重新决定是否穿透
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      if (!TEST_HEADLESS) sendCursorSample()
    }, 200)
    return {ok:true,recoveryRequested:true,stage:'native-reset-dispatched'}
  } catch (error) {
    logLine('[pet] 唤醒恢复失败', error.message)
    return {ok:false,status:500,code:'RECOVERY_FAILED',error:error.message}
  }
}

function startCursorWatch() {
  if (cursorTimer) clearInterval(cursorTimer)
  cursorTimer = null
  if (TEST_HEADLESS) return
  cursorTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return
    sendCursorSample()
  }, 60)
}

/** 必须先登记等待者再发送 IPC；快速回执也不会丢失。 */
function waitForRenderer(waiters, requestId, timeoutMs, timeoutResult) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiters.delete(requestId)
      resolve({ ok: false, status: 504, requestId, ...timeoutResult })
    }, timeoutMs)
    waiters.set(requestId, (result) => {
      clearTimeout(timer)
      waiters.delete(requestId)
      resolve(result)
    })
  })
}

function invalidateCapabilities() {
  lastCapabilities = null
  for (const waiters of [paramWaiters, paramsReadWaiters]) {
    for (const [requestId, waiter] of waiters) {
      waiter({ ok: false, status: 409, requestId, code: 'CHARACTER_CHANGED', error: '模型正在切换，请等待能力表更新后重试' })
    }
  }
}

function pushToPet(payload) {
  if (payload && payload.type === 'character') invalidateCapabilities()
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('pet:event', payload)
}

function pushStatus(text) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pet:status', { text, at: Date.now() })
  }
}

async function sayNow({ say, emotion, motion, scene }) {
  let payload = { say, emotion, motion }
  if (!say) payload = await replyAsPet('随便说点什么，观察一下我在干嘛。', scene)
  lastSpeakAt = Date.now()
  pushToPet({ type: 'say', ...payload, scene: scene || '' })
  return payload
}

/** 主动巡视：场景变了才说话，避免刷屏。 */
async function watchTick() {
  if (!config.watch.enabled) return
  if (Date.now() - lastSpeakAt < Math.min(Number(config.watch.intervalMs) || 75000, 30000)) return
  try {
    const observed = await observe({ withVision: config.watch.vision === true })
    const scene = sceneText(observed)
    const changed = lastScene !== scene
    lastScene = scene
    if (!changed && Date.now() - lastSpeakAt < (Number(config.watch.maxSilenceMs) || 240000)) return
    // Background observation never spends a model request or uploads observations.
    pushToPet({ type: 'sayRandom' })
    lastSpeakAt = Date.now()
  } catch (error) {
    logLine('[pet] 巡视失败:', error.message)
  }
}

// -------------------------------------------------------------------- window

/** 所有显示器的联合区域：跨屏拖动时用它做边界，而不是只看主屏 */
function screenUnion() {
  let displays = []
  try {
    displays = screenModule().getAllDisplays()
  } catch {
    displays = [screenModule().getPrimaryDisplay()]
  }
  if (!displays || displays.length === 0) {
    const single = screenModule().getPrimaryDisplay().workArea
    return { x: single.x, y: single.y, width: single.width, height: single.height }
  }
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const display of displays) {
    const b = display.workArea || display.bounds
    x0 = Math.min(x0, b.x)
    y0 = Math.min(y0, b.y)
    x1 = Math.max(x1, b.x + b.width)
    y1 = Math.max(y1, b.y + b.height)
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}
function windowBounds() {
  // 紧凑窗口，绝对不要铺满屏幕。
  // Chromium 的"窗口遮挡检测"只看窗口矩形（不看透明度）：一个铺满屏幕的置顶窗口
  // 会让后台浏览器判定自己完全被遮住，于是停止渲染视频帧——画面变黑但声音继续。
  // 窗口只占模型那一块，浏览器其余部分露在外面，就不会触发。
  const saved = state.window || {}
  const hasPosition = Number.isFinite(saved.x) && Number.isFinite(saved.y)
  const probeWidth = Number.isFinite(saved.width) && saved.width > 0 ? saved.width : 700
  const probeHeight = Number.isFinite(saved.height) && saved.height > 0 ? saved.height : 720
  const display = hasPosition ? screenModule().getDisplayMatching({x:Math.round(saved.x),y:Math.round(saved.y),width:Math.round(probeWidth),height:Math.round(probeHeight)}) : screenModule().getPrimaryDisplay()
  const area = display.workArea
  // 窗口要能同时容纳「模型 + 展开的面板/聊天/控制台」，
  // 但绝不能接近整屏（铺满会触发浏览器的遮挡检测，后台视频就黑了）。
  // 1100×1200 约等于屏幕的 43%×86%，浏览器总有一大块露在外面。
  // 窗口方案：只占模型那一块，不再 44%×86% 的大块；UI 用 ☰ 菜单/独立窗
  const width = Number.isFinite(saved.width) && saved.width > 0 ? saved.width : Math.min(960, Math.max(600, Math.round(area.width * 0.34)))
  const height = Number.isFinite(saved.height) && saved.height > 0 ? saved.height : Math.min(1150, Math.max(700, Math.round(area.height * 0.8)))
  const x = Number.isFinite(saved.x) ? saved.x : area.x + area.width - width - 28
  const y = Number.isFinite(saved.y) ? saved.y : area.y + area.height - height - 28
  logLine('[pet] 窗口尺寸:', width + 'x' + height, '位置:', x + ',' + y)
  return normalizeWindowGeometry({x,y,width,height},{width,height},area).bounds
}

let windowSaveTimer = null
function rememberWindowBounds({flush = false} = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const special = mainWindow.isMaximized?.() || mainWindow.isFullScreen?.()
  const box = collapsed ? expandedBounds : special ? mainWindow.getNormalBounds() : mainWindow.getBounds()
  if (box && ['x','y','width','height'].every(key => Number.isFinite(box[key])) && box.width > 76 && box.height > 76) {
    state.window = {x:box.x,y:box.y,width:box.width,height:box.height}
  }
  if (windowSaveTimer) clearTimeout(windowSaveTimer)
  windowSaveTimer = null
  if (flush) saveState()
  else windowSaveTimer = setTimeout(() => { windowSaveTimer = null; saveState() }, 150)
  if (!collapsed) publishWindowGeometry()
}

// ------------------------------------------------------------ smoke 自检
const SMOKE_MODE = process.argv.includes('--smoke')

/** --smoke：端到端自检，结果写入 smoke-out/result.json 后退出 */
async function runSmokeMode() {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const checks = []
  for (let i = 0; i < 100 && !lastCapabilities; i += 1) await wait(100)
  checks.push({ id: 'model-loaded', ok: Boolean(lastCapabilities) })
  if (lastCapabilities) {
    const params = Array.isArray(lastCapabilities.params) ? lastCapabilities.params : []
    const motions = Array.isArray(lastCapabilities.motions) ? lastCapabilities.motions : []
    const expressions = Array.isArray(lastCapabilities.expressions) ? lastCapabilities.expressions : []
    checks.push({ id: 'params', ok: params.length > 0, count: params.length })
    checks.push({ id: 'motions', ok: motions.length > 0, count: motions.length })
    checks.push({ id: 'expressions', ok: expressions.length > 0, count: expressions.length })
  }
  // 触发一个表情和一个动作，确认渲染层接住
  pushToPet({ type: 'hotkey', action: 'ToggleExpression', file: '脸红.exp3.json' })
  await wait(600)
  pushToPet({ type: 'hotkey', action: 'TriggerAnimation', file: '打招呼.motion3.json' })
  await wait(600)
  checks.push({ id: 'hotkey-dispatched', ok: true })
  try {
    const outDir = path.join(ROOT, 'smoke-out')
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify({ time: new Date().toISOString(), checks }, null, 2))
    logLine('[smoke] 结果已写入 smoke-out/result.json')
  } catch (error) {
    logLine('[smoke] 写结果失败:', error.message)
  }
  app.quit()
}

// ------------------------------------------------------------ TTS（GPT-SoVITS）
let ttsRefTextCache = ''
function readTtsRefText() {
  if (ttsRefTextCache) return ttsRefTextCache
  try {
    ttsRefTextCache = fs.readFileSync('D:/GPT-SoVITS/ref_audio/idle50.txt', 'utf8').trim()
  } catch {
    ttsRefTextCache = 'はい'
  }
  return ttsRefTextCache
}

async function ttsSynthesize(text, lang) {
  const tts = config.tts || {}
  if (tts.enabled === false) return ''
  const say = String(text || '').slice(0, 500)
  if (!say) return ''
  const payload = {
    text: say,
    text_lang: lang || tts.lang || 'zh',
    ref_audio_path: tts.refAudio || 'D:/GPT-SoVITS/ref_audio/idle50.wav',
    prompt_text: readTtsRefText(),
    prompt_lang: tts.refLang || 'ja',
    streaming_mode: false,
    media_type: 'wav',
  }
  const response = await fetch(tts.url || 'http://127.0.0.1:9880/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error('TTS HTTP ' + response.status)
  const buf = Buffer.from(await response.arrayBuffer())
  return buf.toString('base64')
}

// 聊天窗播放的语音：口型包络转发给主窗（模型在那边）。只接受聊天窗，内容先收紧再转发。
ipcMain.on('pet:lip-sync', (event, payload) => {
  try {
    if (!chatWindow || chatWindow.isDestroyed() || event.sender !== chatWindow.webContents) return
    // 口型开关由主窗判断：包络同时用于说话伴随动作，关掉口型也要转发
    const envelope = payload && !payload.stop ? sanitizeEnvelope(payload.envelope) : null
    pushToPet(envelope ? { type: 'lip-sync', envelope } : { type: 'lip-sync', stop: true })
  } catch {
    /* 口型失败不影响语音 */
  }
})

ipcMain.handle('pet:tts', async (_event, text, lang) => {
  try {
    const audio = await ttsSynthesize(text, lang)
    return { ok: true, audio }
  } catch (error) {
    return { ok: false, error: error.message }
  }
})

function createWindow() {
  const bounds = windowBounds()
  mainWindow = new BrowserWindow({
    ...bounds,
    title: APP_LABEL,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    movable: true,
    // 默认不抢焦点：点设置面板/拖滑杆时，别把后台浏览器抢得失焦，
    // 否则 Chrome 会认为页面被遮挡，停止渲染视频帧（只留声音，画面变黑）。
    // 需要输入文字（聊天）时再临时打开。
    // ⚠️ 诊断中：focusable:false 在 Windows 上会带 WS_EX_NOACTIVATE，
    // 表现为 mousemove 正常但点击不派发（点不动、拖不动）。先改 true 验证。
    focusable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })

  // Fractional-DPI integer round trips must not grow the saved window on every restart.
  const accepted = mainWindow.getBounds()
  if (accepted.width > bounds.width || accepted.height > bounds.height) {
    mainWindow.setBounds({...bounds,
      width:bounds.width-Math.max(0,accepted.width-bounds.width),
      height:bounds.height-Math.max(0,accepted.height-bounds.height)})
  }
  // 用 floating 而不是 screen-saver：后者会盖在任务栏右键菜单之上，光标来回跳
  mainWindow.setAlwaysOnTop(true, 'floating')
  // 默认整块穿透：桌面和其它窗口照常可点，只有鼠标移到角色/面板上才临时关掉
  mainWindow.setIgnoreMouseEvents(true, { forward: true })
  mainWindow.loadURL('http://127.0.0.1:' + controlPort + '/')
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault()
    mainWindow.setTitle(APP_LABEL)
  })
  mainWindow.once('ready-to-show', () => {
    if (!TEST_HEADLESS) mainWindow.showInactive()
    // 预加载设置窗（隐藏）：点设置时直接 show，避免首次创建卡顿
    try {
      createSettingsWindow(true)
    } catch (error) {
      /* 预加载失败不影响主窗 */
    }
  })

  mainWindow.on('move', () => rememberWindowBounds())
  mainWindow.on('resize', () => rememberWindowBounds())
  mainWindow.on('close', () => rememberWindowBounds({flush:true}))

  mainWindow.webContents.on('console-message', (details) => {
    // 调试：临时记录 renderer 的 console 内容，定位 TTS 双响问题
    if (['warning', 'error'].includes(details.level)) {
      logLine('[pet:renderer]', details.level, String(details.message || '').slice(0, 200))
    }
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logLine('[pet] 渲染进程异常:', details.reason)
  })
  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    logLine('[pet] 页面加载失败:', code, description)
  })
  // B2：被遮挡 / 最小化时通知渲染进程暂停（演出期间渲染进程自己会忽略）
  mainWindow.on('hide', () => pushToPet({ type: 'pause', reason: 'hidden' }))
  mainWindow.on('minimize', () => pushToPet({ type: 'pause', reason: 'minimized' }))
  mainWindow.on('restore', () => pushToPet({ type: 'resume' }))
  mainWindow.on('show', () => pushToPet({ type: 'resume' }))
  mainWindow.on('focus', () => pushToPet({ type: 'resume' }))

  mainWindow.webContents.on('did-finish-load', () => {
    // 页面加载完推一次好感度，保证语气池按真实状态选
    setTimeout(pushAffinity, 1200)
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (Number(config.debug.captureAfterMs) > 0) {
    setTimeout(async () => {
      try {
        if (!mainWindow || mainWindow.isDestroyed()) return
        const image = await mainWindow.capturePage()
        fs.mkdirSync(SHOT_DIR, { recursive: true })
        const file = path.join(SHOT_DIR, 'window-' + Date.now() + '.png')
        fs.writeFileSync(file, image.toPNG())
        logLine('[pet] 窗口截图:', file)
      } catch (error) {
        logLine('[pet] capturePage 失败:', error.message)
      }
    }, Number(config.debug.captureAfterMs))
  }
}

function toggleWindow() {
  if (!mainWindow) return
  if (!mainWindow.isVisible()) {
    mainWindow.show()
    mainWindow.focus()
    pushToPet({ type: 'expand' })
    return
  }
  // 收成球的时候，托盘/快捷键应当是"展开"，而不是把窗口藏掉
  if (collapsed) {
    pushToPet({ type: 'expand' })
    return
  }
  mainWindow.hide()
  collapsed = false
  // 藏起来之后唯一能回来的入口是托盘和快捷键，必须明确告诉用户
  try {
    if (tray && typeof tray.displayBalloon === 'function') {
      tray.displayBalloon({
        title: '大肥鱼已隐藏',
        content: '按 Ctrl+Alt+F 或单击托盘图标可以叫回来',
      })
    }
  } catch {
    /* 部分环境不支持气泡 */
  }
  logLine('[pet] 窗口已隐藏（Ctrl+Alt+F / 托盘图标恢复）')
}

function createTray() {
  const iconPath = path.join(__dirname, 'tray.png')
  const image = nativeImageModule().createFromPath(iconPath)
  const TrayClass = trayClass()
  tray = new TrayClass(image.isEmpty() ? nativeImageModule().createEmpty() : image.resize({ width: 20, height: 20 }))
  tray.setToolTip(APP_LABEL)
  const menu = menuClass().buildFromTemplate([
    { label: APP_LABEL, enabled: false },
    { label: '显示 / 隐藏（Ctrl+Alt+F）', click: toggleWindow },
    {
      label: '鼠标穿透（Ctrl+Alt+P）',
      type: 'checkbox',
      checked: clickThrough,
      click: (item) => applyClickThrough(item.checked),
    },
    {
      label: '旧版观察已停用（使用导演设置）',
      enabled: false,
      click: () => {
        observe({ withVision: config.watch.vision === true })
          .then(async (observed) => {
            const scene = sceneText(observed)
            const reply = await replyAsPet('（你瞄了一眼我的屏幕，随便说一句话）', scene)
            await sayNow({ ...reply, scene })
          })
          .catch((error) => pushStatus('观察失败：' + error.message))
      },
    },
    {
      label: '旧版巡视已停用',
      enabled: false,
      type: 'checkbox',
      checked: config.watch.enabled !== false,
      click: (item) => {
        config.watch.enabled = item.checked
        scheduleWatch()
      },
    },
    {
      label: '巡视时发截图（视觉模型）',
      type: 'checkbox',
      checked: config.watch.vision === true,
      click: (item) => {
        config.watch.vision = item.checked
      },
    },
    { type: 'separator' },
    { label: '打开配置文件夹', click: () => shellModule().openPath(ROOT) },
    { label: '重新加载界面', click: () => mainWindow && mainWindow.reload() },
    { label: '退出', click: () => app.quit() },
  ])
  tray.setContextMenu(menu)
  tray.on('double-click', toggleWindow)
  // 单击也能恢复：窗口藏起来以后，用户最可能做的就是点托盘图标
  tray.on('click', toggleWindow)
}

// -------------------------------------------------------------- http service

async function serveStatic(base, filePath, res) {
    const data = await readStaticAsset(ROOT, base, filePath)
    if (!data) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('not found')
      return
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    })
    res.end(data)
}

function jsonResponse(res, code, value) {
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(value))
}

function readBody(req, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text) return resolve({})
      try {
        resolve(JSON.parse(text))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      let url
      let route
      try {
        url = new URL(req.url || '/', 'http://127.0.0.1')
        route = decodeURIComponent(url.pathname)
      } catch {
        res.writeHead(400)
        return res.end('invalid path')
      }

      if (route.startsWith('/user-assets')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { allow: 'GET, HEAD' })
          return res.end('method not allowed')
        }
        const bytes = await readBackgroundAsset(ROOT, route)
        if (!bytes) {
          res.writeHead(404)
          return res.end('not found')
        }
        res.writeHead(200, { 'content-type': 'image/png', 'content-length': bytes.length, 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' })
        return res.end(req.method === 'HEAD' ? undefined : bytes)
      }

      if (route.startsWith('/api/pet/')) {
        if (req.headers.origin || req.headers['sec-fetch-site'] === 'cross-site') return jsonResponse(res, 403, { ok: false, error: 'browser-origin requests are forbidden' })
        const secret = req.headers['x-pet-secret']
        if (secret !== controlSecret) return jsonResponse(res, 401, { ok: false, error: 'bad secret' })
        try {
          if (route.startsWith('/api/pet/director/')) {
            const action = route.slice('/api/pet/director/'.length)
            if (action === 'autonomy/state' && req.method === 'GET') return jsonResponse(res, 200, director.autonomyState())
            if (action === 'autonomy/stop' && req.method === 'POST') {
              const body = await readBody(req, 1024)
              if (body && Object.keys(body).length) return jsonResponse(res, 400, { ok: false, error: '停止指令不接受额外参数' })
              director.autonomyStop(); director.cancel()
              return jsonResponse(res, 200, { ok: true })
            }
            if (req.method !== (['capabilities', 'state', 'context'].includes(action) ? 'GET' : 'POST')) return jsonResponse(res, 405, { ok: false, error: 'method not allowed' })
            const result = await director.http(action, req.method === 'POST' ? await readBody(req, 64000) : undefined)
            return jsonResponse(res, result.status || (result.ok ? 200 : 400), result)
          }
          if (route === '/api/pet/state' && req.method === 'GET') {
            return jsonResponse(res, 200, {
              ok: true,
              running: true,
              candidate: true,
              appVersion: APP_VERSION,
              headless: TEST_HEADLESS,
              port: controlPort,
              visible: Boolean(mainWindow && mainWindow.isVisible()),
              scene: '',
              lastSpeakAt,
              games: state.games,
              hasKey: director.hasKey(),
              modelReady: Boolean(lastCapabilities),
              affinity: state.affinity,
              affinityMood: affinityMood(),
            })
          }
          if (route === '/api/pet/command' && req.method === 'POST') {
            const body = await readBody(req)
            const say = typeof body.say === 'string' ? body.say.slice(0, 400) : ''
            // 不再用 13 个 key 白名单过滤：23 个 exp3 也要能从 command 走
            const emotion = typeof body.emotion === 'string' ? body.emotion.trim() : 'none'
            const motion = MOTIONS.has(body.motion) ? body.motion : 'none'
            if (!say && emotion === 'none' && motion === 'none') {
              return jsonResponse(res, 400, { ok: false, error: 'say/emotion/motion 至少要有一个' })
            }
            // J：agent 驱动也算一次互动，否则只有手点才涨好感度
            try {
              bumpAffinity('command')
            } catch (error) {
              /* ignore */
            }
            lastSpeakAt = Date.now()
            pushToPet({ type: 'say', say, emotion, motion, scene: '', source: 'dsh' })
            return jsonResponse(res, 200, { ok: true })
          }
          if (route === '/api/pet/eval' && req.method === 'POST') {
            if (!director.diagnosticsAllowed()) return jsonResponse(res, 403, { ok: false, error: 'diagnostics disabled' })
            const body = await readBody(req)
            const code = typeof body.code === 'string' ? body.code : ''
            if (!code) return jsonResponse(res, 400, { ok: false, error: 'code required' })
            if (!mainWindow || mainWindow.isDestroyed()) {
              return jsonResponse(res, 400, { ok: false, error: '窗口不存在' })
            }
            try {
              const result = await mainWindow.webContents.executeJavaScript(code, true)
              return jsonResponse(res, 200, { ok: true, result })
            } catch (error) {
              return jsonResponse(res, 500, { ok: false, error: error.message })
            }
          }
          if (route === '/api/pet/say-random' && req.method === 'POST') {
            pushToPet({ type: 'sayRandom' })
            return jsonResponse(res, 200, { ok: true })
          }
          if (route === '/api/pet/characters' && req.method === 'GET') {
            const active = activeCharacter()
            const items = listCharacters().map((item) => ({
              id: item.id,
              name: item.name,
              speechCount: item.speech.length,
            }))
            return jsonResponse(res, 200, { ok: true, active: active ? active.id : null, items })
          }
          if (route === '/api/pet/character' && req.method === 'POST') {
            const body = await readBody(req)
            const character = readCharacter(body.id)
            if (!character) return jsonResponse(res, 404, { ok: false, error: '没有这个角色' })
            state.character = character.id
            saveState()
            pushToPet({ type: 'character', character })
            return jsonResponse(res, 200, { ok: true, character })
          }
          if (route === '/api/pet/ui' && req.method === 'POST') {
            const body = await readBody(req)
            if (body.settings === 'director') {
              createSettingsWindow()
              const select = () => { if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('pet:event', { type: 'settings-select-tab', tab: 'director' }) }
              if (settingsWindow.webContents.isLoading()) settingsWindow.webContents.once('did-finish-load', select)
              else select()
              return jsonResponse(res, 200, { ok: true, settings: 'director' })
            }
            const chat = body.chat === undefined ? null : Boolean(body.chat)
            if (chat === null) return jsonResponse(res, 400, { ok: false, error: 'chat required' })
            pushToPet({ type: 'ui', chat })
            return jsonResponse(res, 200, { ok: true, chat })
          }
          if (route === '/api/pet/scale' && req.method === 'POST') {
            const body = await readBody(req)
            const x = Number(body.x)
            const y = Number(body.y)
            const payload = {}
            if (Number.isFinite(x)) payload.x = Math.min(2.6, Math.max(0.4, x))
            if (Number.isFinite(y)) payload.y = Math.min(2.6, Math.max(0.4, y))
            if (payload.x === undefined && payload.y === undefined) {
              return jsonResponse(res, 400, { ok: false, error: 'x 或 y 至少给一个' })
            }
            pushToPet({ type: 'scale', ...payload })
            return jsonResponse(res, 200, { ok: true, ...payload })
          }
          if (route === '/api/pet/param' && req.method === 'POST') {
            const body = await readBody(req)
            if (!body || typeof body !== 'object' || Array.isArray(body)) {
              return jsonResponse(res, 400, { ok: false, error: 'JSON 对象 required' })
            }
            const resetAll = body.reset === true
            if (!resetAll && (!lastCapabilities || !Array.isArray(lastCapabilities.params))) {
              return jsonResponse(res, 503, { ok: false, error: '模型尚未就绪', code: 'MODEL_NOT_READY' })
            }
            let set = null
            if (!resetAll) {
              const isBatch = Object.prototype.hasOwnProperty.call(body, 'set')
              const id = typeof body.id === 'string' ? body.id.trim() : ''
              if (!isBatch && !id) return jsonResponse(res, 400, { ok: false, error: 'id required' })
              const checked = validateSet(isBatch ? body.set : { [id]: body.value }, lastCapabilities.params)
              if (!checked.ok) return jsonResponse(res, checked.status || 400, checked)
              set = checked.set
            }
            const requestId = 'param-' + (++parameterRequestSeq)
            const characterRevision = lastCapabilities ? lastCapabilities.characterRevision : null
            const response = waitForRenderer(paramWaiters, requestId, 3000, { error: '参数应用超时，未收到逐帧确认', code: 'PARAM_APPLY_TIMEOUT' })
            pushToPet({ type: 'param', requestId, characterRevision, ...(resetAll ? { resetAll: true } : { set }) })
            const result = await response
            return jsonResponse(res, result.status || (result.ok ? 200 : 500), { ...result, requestId })
          }
          // ---- P1：参数批量写 / 直读 ----
          if (route === '/api/pet/params' && req.method === 'GET') {
            if (!lastCapabilities) return jsonResponse(res, 503, { ok: false, error: '模型尚未就绪', code: 'MODEL_NOT_READY' })
            const idsParam = url.searchParams.get('ids') || ''
            const ids = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : []
            const requestId = 'read-params-' + (++parameterRequestSeq)
            const response = waitForRenderer(paramsReadWaiters, requestId, 3000, { error: '参数读取超时', code: 'PARAM_READ_TIMEOUT' })
            pushToPet({ type: 'read-params', ids, requestId, characterRevision: lastCapabilities.characterRevision })
            const result = await response
            return jsonResponse(res, result.status || (result.ok ? 200 : 500), { ...result, requestId })
          }

          if (route === '/api/pet/part' && req.method === 'POST') {
            const body = await readBody(req)
            const id = typeof body.id === 'string' ? body.id.trim() : ''
            if (!id) return jsonResponse(res, 400, { ok: false, error: 'id required' })
            const value = body.value === null || body.value === undefined ? null : Number(body.value)
            pushToPet({ type: 'part', id, value })
            return jsonResponse(res, 200, { ok: true, id, value })
          }

          // ---- Agent 操作层：能力清单 ----
          if (route === '/api/pet/capabilities' && req.method === 'GET') {
            const force = url.searchParams.get('refresh') === '1'
            const active = activeCharacter()
            const same = lastCapabilities && lastCapabilities.character && active
              && lastCapabilities.character.id === active.id
            if (force || !same) {
              lastCapabilities = null
              pushToPet({ type: 'capabilities-request' })
              for (let i = 0; i < 40 && !lastCapabilities; i += 1) await sleep(100)
            }
            if (!lastCapabilities) {
              return jsonResponse(res, 503, { ok: false, error: '渲染进程没有回应（模型可能还在加载）' })
            }
            return jsonResponse(res, 200, lastCapabilities)
          }
          // ---- Agent 操作层：时间轴演出 ----
          if (route === '/api/pet/show' && req.method === 'POST') {
            const body = await readBody(req)
            const timeline = Array.isArray(body.timeline) ? body.timeline : []
            if (!timeline.length) {
              return jsonResponse(res, 400, { ok: false, error: 'timeline 不能为空' })
            }
            for (let i = 0; i < timeline.length; i += 1) {
              const at = Number(timeline[i] && timeline[i].at)
              if (!Number.isFinite(at) || at < 0) {
                return jsonResponse(res, 400, { ok: false, error: '第 ' + (i + 1) + ' 步的 at 不是有效毫秒数' })
              }
              if (i > 0 && at < Number(timeline[i - 1].at)) {
                return jsonResponse(res, 400, { ok: false, error: '第 ' + (i + 1) + ' 步的 at 小于上一步（必须单调不减）' })
              }
            }
            const wait = url.searchParams.get('wait') === '1' || body.wait === true
            // E2：interrupt 透传给渲染进程（true=立刻抢占，false=排队等前一段结束）
            const interrupt = body.interrupt === false ? false : true
            if (!interrupt && showRunning) {
              // 排队：等当前演出结束（最多 60 秒）
              for (let i = 0; i < 600 && showRunning; i += 1) await sleep(100)
            }
            // E3：预期时长要含动作自身时长，不能只看最后一个 at
            const knownDur = new Map(
              (lastCapabilities && Array.isArray(lastCapabilities.motions)
                ? lastCapabilities.motions
                : []
              ).map((m) => [m.file, Number(m.durationMs) || 0]),
            )
            let durationMs = 0
            for (const step of timeline) {
              const at = Number(step.at) || 0
              const dur = knownDur.get(step.motion) || 0
              durationMs = Math.max(durationMs, at + dur)
            }
            const reqId = 'show-' + (++showSeq)
            lastShowResult = null
            showRunning = true
            activeShowReqId = reqId
            const budget = Math.min(120000, durationMs + 20000)
            const response = wait ? waitForRenderer(showWaiters, reqId, budget, { error: '演出超时未回执', reqId }) : null
            pushToPet({ type: 'show', timeline, loop: Boolean(body.loop), reqId, interrupt })
            if (!wait) {
              return jsonResponse(res, 200, {
                ok: true,
                reqId,
                accepted: timeline.length,
                durationMs,
                startedAt: Date.now(),
                note: '已开始播放；要等结果请加 ?wait=1',
              })
            }
            // E1：按 reqId 配对，并发请求各拿各的结果
            const result = await response
            return jsonResponse(res, result.status || 200, { ...result, reqId })
          }
          // ---- Agent 操作层：复位 ----
          if (route === '/api/pet/reset' && req.method === 'POST') {
            const body = await readBody(req).catch(() => ({}))
            const allowed = ['motion','expression','param','part','scale']
            if (body.scope !== undefined && (!Array.isArray(body.scope) || body.scope.some(item => !allowed.includes(item)))) return jsonResponse(res,400,{ok:false,code:'INVALID_RESET_SCOPE',error:'scope 仅支持 motion/expression/param/part/scale'})
            const scope = Array.isArray(body.scope) ? body.scope : []
            lastResetResult = null
            pushToPet({ type: 'reset', scope })
            for (let i = 0; i < 30 && !lastResetResult; i += 1) await sleep(100)
            if (!lastResetResult) return jsonResponse(res,504,{ok:false,code:'RESET_TIMEOUT',error:'渲染进程未确认复位'})
            return jsonResponse(res, 200, { ok: true, cleared: lastResetResult })
          }
          // ---- Agent 操作层：预设 ----
          if (route === '/api/pet/preset' && req.method === 'POST') {
            const body = await readBody(req)
            const name = typeof body.name === 'string' ? body.name.trim() : ''
            if (!name) return jsonResponse(res, 400, { ok: false, error: 'name required' })
            pushToPet({ type: 'preset', name })
            return jsonResponse(res, 200, { ok: true, name })
          }
          if (route === '/api/pet/dump' && req.method === 'POST') {
            lastDump = null
            pushToPet({ type: 'dump' })
            for (let i = 0; i < 20 && !lastDump; i += 1) await sleep(100)
            return jsonResponse(res, 200, lastDump || { ok: false, error: '渲染进程没有回应' })
          }
          if (route === '/api/pet/shot' && req.method === 'POST') {
            if (!mainWindow || mainWindow.isDestroyed()) {
              return jsonResponse(res, 400, { ok: false, error: '窗口不存在' })
            }
            const body = await readBody(req).catch(() => ({}))
const winSize = mainWindow.getContentBounds()
            let box = null
            if (body.box && Number.isFinite(Number(body.box.x))) {
              const bx = Math.max(0, Math.round(Number(body.box.x)))
              const by = Math.max(0, Math.round(Number(body.box.y)))
              box = {
                x: Math.min(bx, Math.max(0, winSize.width - 1)),
                y: Math.min(by, Math.max(0, winSize.height - 1)),
                width: Math.max(1, Math.round(Number(body.box.w))),
                height: Math.max(1, Math.round(Number(body.box.h))),
              }
              box.width = Math.min(box.width, winSize.width - box.x)
              box.height = Math.min(box.height, winSize.height - box.y)
            }
            // hideUi：临时把面板/气泡/☰ 藏掉再拍，否则截图里全是 UI
            const hideUi = body.hideUi !== false
            if (hideUi) {
              pushToPet({ type: 'hide-ui', hide: true })
              await sleep(220)
            }
            let image
            try {
              image = box ? await mainWindow.capturePage(box) : await mainWindow.capturePage()
            } finally {
              if (hideUi) {
                pushToPet({ type: 'hide-ui', hide: false })
              }
            }
            fs.mkdirSync(SHOT_DIR, { recursive: true })
            // 截图清理交给 pruneShots()（保留最近 50 张 + 24 小时内的），
            // 这里不重复实现，避免两套策略互相打架。
            const file = path.join(SHOT_DIR, 'api-' + Date.now() + '.png')
            const png = image.toPNG()
            fs.writeFileSync(file, png)
            pruneShots()
            const size = image.getSize()
            const wantInline = url.searchParams.get('inline') === '1' || body.inline === true
            return jsonResponse(res, 200, {
              ok: true,
              path: file,
              width: size.width,
              height: size.height,
              bytes: png.length,
              mimeType: 'image/png',
              capturedAt: Date.now(),
              base64: wantInline ? png.toString('base64') : undefined,
              // 给工具层直接拼 image 块用
              dataUrl: wantInline ? 'data:image/png;base64,' + png.toString('base64') : undefined,
            })
          }
          // 手动恢复交互（睡眠唤醒卡死、或点不动时的自救入口）
          if (route === '/api/pet/recover' && req.method === 'POST') {
            const result = recoverAfterWake('manual')
            return jsonResponse(res, result.status || 200, result)
          }
          if (route === '/api/pet/observe' && req.method === 'POST') {
            const result = await observe()
            return jsonResponse(res, result.status, result)
          }
          if (route === '/api/pet/chat' && req.method === 'POST') {
            const body = await readBody(req)
            const text = typeof body.text === 'string' ? body.text : ''
            if (!text) return jsonResponse(res, 400, { ok: false, error: 'text required' })
            const reply = await handleChatText(text, { source: 'http' })
            return jsonResponse(res, 200, { ok: true, ...reply, scene: lastScene })
          }
          if (route === '/api/pet/plan' && req.method === 'POST') {
            const body = await readBody(req)
            const text = typeof body.text === 'string' ? body.text : ''
            if (!text.trim()) return jsonResponse(res, 400, { ok: false, error: 'text required' })
            const result = await choreograph(text).catch((error) => ({ ok: false, error: error.message }))
            return jsonResponse(res, result.ok ? 200 : 500, result)
          }
          return jsonResponse(res, 404, { ok: false, error: 'unknown endpoint' })
        } catch (error) {
          return jsonResponse(res, error instanceof SyntaxError ? 400 : 500, { ok: false, error: '请求失败，请检查参数与本机服务状态' })
        }
      }

      let relative = route === '/' ? '/index.html' : route
      let base = RENDERER_DIR
      if (relative.startsWith('/characters/')) {
        base = CHARACTERS_DIR
        relative = relative.slice('/characters'.length)
      }
      if (relative.startsWith('/assets/')) {
        base = ASSET_DIR
        relative = relative.slice('/assets'.length)
      }
      // 编舞采样器与引擎给渲染进程加载
      if (relative.startsWith('/engine/')) {
        base = path.join(ROOT, 'engine')
        relative = relative.slice('/engine'.length)
      }
      const target = path.resolve(base, '.' + relative)
      if (!target.startsWith(base + path.sep) && target !== base) {
        res.writeHead(403)
        return res.end('forbidden')
      }
      await serveStatic(base, target, res)
    })

    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE' && port < 41999) {
        server.close()
        startServer(port + 1).then(resolve, reject)
        return
      }
      reject(error)
    })

    server.listen(port, '127.0.0.1', () => {
      controlServer = server
      controlPort = port
      controlSecret = crypto.randomBytes(18).toString('hex')
      const bridgePayload = {
        port,
        secret: controlSecret,
        pid: process.pid,
        bridgeFile: null,
        startedAt: new Date().toISOString(),
        // 供插件握手：接口版本 + 支持的 ability，避免新旧版本错配
        version: 5,
        app: 'dafeiyu-pet',
        appVersion: APP_VERSION,
        candidate: true,
        headless: TEST_HEADLESS,
        abilities: ['command', 'chat', 'observe', 'capabilities', 'show', 'reset', 'preset', 'shot', 'param', 'part', 'scale', 'ui', 'characters', 'recover', 'director'],
      }
      const written = writeBridge(bridgePayload)
      if (written) {
        // 回填实际落点，方便 DSH 侧与排查
        writeBridge({
          ...bridgePayload,
          bridgeFile: written,
        })
      }
      logLine('[pet] 控制口 http://127.0.0.1:' + port + '/api/pet/ （bridge: ' + (written || '失败') + '）')
      resolve(server)
    })
  })
}

function scheduleWatch() {
  if (watchTimer) clearInterval(watchTimer)
  watchTimer = null
  if (TEST_HEADLESS || config.watch.enabled === false) return
  const interval = Math.max(20000, Number(config.watch.intervalMs) || 75000)
  watchTimer = setInterval(() => {
    void watchTick()
  }, interval)
}

// ----------------------------------------------------------------------- ipc

function personaDisplayName() {
  try { return director.personaSnapshot?.()?.persona?.identity?.name || '大肥鱼' }
  catch { return '大肥鱼（人设存储不可用）' }
}

ipcMain.handle('pet:ready', () => ({
  ok: true,
  candidate: true,
  appVersion: APP_VERSION,
  headless: TEST_HEADLESS,
  persona: personaDisplayName(),
  model: config.llm.model,
  scene: lastScene,
  watch: config.watch,
  tts: config.tts,
  hasKey: director.hasKey(),
  character: activeCharacter(),
}))

function trustedPetSender(event) {
  try {
    const isMain = mainWindow && !mainWindow.isDestroyed()
      && event?.sender === mainWindow.webContents
      && event.senderFrame === mainWindow.webContents.mainFrame
      && event.senderFrame.url === `http://127.0.0.1:${controlPort}/`
    const isChat = chatWindow && !chatWindow.isDestroyed()
      && event?.sender === chatWindow.webContents
      && event.senderFrame === chatWindow.webContents.mainFrame
      && event.senderFrame.url === `http://127.0.0.1:${controlPort}/chat.html`
    return Boolean(isMain || isChat)
  } catch { return false }
}

ipcMain.handle('pet:send', async (event, text) => {
  if (!trustedPetSender(event)) return { ok: false, status: 403, error: '仅允许桌宠主窗口发起本机聊天' }
  const message = String(text || '').slice(0, 2000).trim()
  if (!message) return { ok: false, error: '空消息' }
  try {
    const reply = await replyAsPet(message, lastScene, { allowMemory: true })
    lastSpeakAt = Date.now()
    return { ok: true, ...reply }
  } catch (error) {
    return { ok: false, error: error.message }
  }
})

ipcMain.handle('pet:list-characters', () => ({
  ok: true,
  active: activeCharacter()?.id || null,
  items: listCharacters().map((item) => ({
    id: item.id,
    name: item.name,
    preview: item.preview || '',
  })),
}))

ipcMain.handle('pet:switch-character', (_event, id) => {
  const character = readCharacter(String(id || ''))
  if (!character) return { ok: false, error: '没有这个角色' }
  state.character = character.id
  saveState()
  pushToPet({ type: 'character', character })
  registerVtubeHotkeys(character)
  return { ok: true, character }
})

ipcMain.handle('pet:import-character', (_event, payload) => {
  try {
    const filePath = String((payload && payload.path) || '').trim()
    if (!filePath) return { ok: false, error: '没有收到文件路径' }
    if (!fs.existsSync(filePath)) return { ok: false, error: '文件不存在：' + filePath }
    const { character, files } = importCharacterFromZip(filePath)
    state.character = character.id
    saveState()
    pushToPet({ type: 'character', character })
    registerVtubeHotkeys(character)
    return { ok: true, character, files }
  } catch (error) {
    logLine('[pet] 导入失败:', error.message)
    return { ok: false, error: error.message }
  }
})

/**
 * 切换角色后截一张"头肩"图当缩略图：纹理图集看不出角色长相，
 * 现场截一张才是真预览。存成 characters/<id>/icon.png，下次直接用。
 */
ipcMain.handle('pet:capture-icon', async (_event, payload) => {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false, error: '窗口不存在' }
    const id = String((payload && payload.id) || '')
    const character = readCharacter(id)
    if (!character) return { ok: false, error: '没有这个角色' }

    const box = payload && payload.box
    const width = Math.max(64, Math.round(Number(box && box.width) || 0))
    const height = Math.max(64, Math.round(Number(box && box.height) || 0))
    const rect = {
      x: Math.round(Number(box && box.x) || 0),
      y: Math.round(Number(box && box.y) || 0),
      width,
      height,
    }
    const image = await mainWindow.webContents.capturePage(rect)
    const target = path.join(CHARACTERS_DIR, character.id, 'icon.png')
    fs.writeFileSync(target, image.toPNG())

    // manifest 里记一笔，之后列表直接用
    const manifestPath = path.join(CHARACTERS_DIR, character.id, 'manifest.json')
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      manifest.icon = 'icon.png'
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
    } catch {
      /* ignore */
    }
    return { ok: true, path: target }
  } catch (error) {
    logLine('[pet] 截缩略图失败:', error.message)
    return { ok: false, error: error.message }
  }
})

// 高级面板里的"主动巡视"开关：和托盘菜单里的那一项共用同一份配置
ipcMain.handle('pet:watch', (_event, enabled) => {
  return { ok: false, status: 403, enabled: false, error: '旧版巡视入口已停用；请在导演设置中单独授权自主感知。' }
})

ipcMain.handle('pet:observe', async (_event, options) => {
  return observe()
})

ipcMain.handle('pet:state', () => ({
  ok: true,
  port: controlPort,
  scene: lastScene,
  games: state.games,
  model: config.llm.model,
  hasKey: director.hasKey(),
}))

// ------------------------------------------------- 编舞（语义计划 → 参数轨道）

// 编舞引擎模块在 engine/，规划器在 electron/（同属主进程，按真实位置加载）
const choreoRequire = (name) => require(path.join(ROOT, 'engine', name))
const choreoElectronRequire = (name) => require(path.join(__dirname, name))
let choreoProfile = null
let choreoProfileKey = ''

/** 能力目录按当前角色缓存；角色或参数表变化时重建 */
function currentChoreoProfile() {
  const active = activeCharacter()
  if (!active || !lastCapabilities || !Array.isArray(lastCapabilities.params)) {
    throw new Error('模型尚未就绪，无法生成编舞')
  }
  const key = active.id + '|' + lastCapabilities.params.length
  if (choreoProfile && choreoProfileKey === key) return choreoProfile
  const { buildProfile } = choreoRequire('model-profile.js')
  choreoProfile = buildProfile({
    modelPath: path.join(CHARACTERS_DIR, active.id, active.model),
    parameterTable: lastCapabilities.params,
  })
  choreoProfileKey = key
  return choreoProfile
}

/** 一次模型调用（编舞规划专用）：用导演配置的服务地址和加密保存的密钥 */
async function callLlmOnce(messages, options = {}) {
  let key = ''
  try {
    key = createVault(path.join(ROOT, '_private', 'secrets.json')).get('provider') || ''
  } catch {
    key = ''
  }
  if (!key) throw new Error('没有可用的模型密钥（请在导演/API 里配置）')
  const base = String(config.director.baseURL || '').replace(/\/+$/, '')
  if (!base) throw new Error('未配置模型服务地址')
  const response = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: config.director.model,
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 900,
    }),
  })
  if (!response.ok) throw new Error('模型接口 HTTP ' + response.status)
  const data = await response.json()
  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : ''
  return Array.isArray(content) ? content.map((part) => (typeof part === 'string' ? part : part.text || '')).join('') : String(content || '')
}

/** 自然语言 → 计划 → IR → 经 IPC 下发给渲染进程播放 */
async function choreograph(text) {
  const message = String(text || '').slice(0, 1000).trim()
  if (!message) throw new Error('空指令')
  const { planChoreo } = choreoElectronRequire('planner.js')
  const profile = currentChoreoProfile()
  const result = await planChoreo({
    text: message,
    profile,
    callModel: (messages, options) => callLlmOnce(messages, options),
  })
  const id = 'choreo-' + Date.now()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pet:event', { type: 'play-plan', id, ir: result.ir })
  }
  return { ok: true, id, plan: result.plan, ir: result.ir, planner: result.planner }
}

ipcMain.handle('pet:play-plan', async (_event, text) => {
  try {
    return await choreograph(text)
  } catch (error) {
    return { ok: false, error: error.message }
  }
})

ipcMain.handle('pet:report', (_event, payload) => {
  director.receive(payload)
  if (payload && payload.kind === 'drawables') lastDump = payload.data
  if (payload && payload.type === 'model-loading') invalidateCapabilities()
  if (payload && payload.type === 'capabilities') lastCapabilities = payload.data
  if (payload && payload.type === 'param-applied') {
    const waiter = paramWaiters.get(payload.requestId)
    if (waiter) waiter(payload.result || { ok: false, status: 500, error: '参数确认缺少 result' })
  }
  if (payload && payload.type === 'show-done') {
    const result = payload.result || {}
    if (result.reqId === activeShowReqId) {
      showRunning = false
      activeShowReqId = null
    }
    const waiter = result.reqId ? showWaiters.get(result.reqId) : null
    if (waiter) {
      showWaiters.delete(result.reqId)
      waiter(result)
    } else {
      lastShowResult = result
    }
  }
  if (payload && payload.type === 'reset-done') lastResetResult = payload.cleared
  if (payload && payload.type === 'params-read') {
    const waiter = paramsReadWaiters.get(payload.requestId)
    if (waiter) waiter(payload.result || { ok: true, values: payload.values })
  }
  // 主窗口把当前设置推给独立设置窗口
  if (payload && payload.type === 'settings-state' && settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('pet:event', payload)
  }
  if (payload && payload.type === 'console-state' && consoleWindow && !consoleWindow.isDestroyed()) {
    consoleWindow.webContents.send('pet:event', payload)
  }
  return { ok: true }
})

ipcMain.handle('pet:focusable', (_event, enabled) => {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false }
  const value = Boolean(enabled)
  mainWindow.setFocusable(value)
  if (value) {
    try {
      mainWindow.focus()
    } catch {
      /* ignore */
    }
  }
  return { ok: true, focusable: value }
})

ipcMain.handle('pet:click-through', (_event, ignore) => {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false }
  return { ok: true, ignore: applyClickThrough(ignore) }
})

ipcMain.handle('pet:collapse', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false }
  const box = mainWindow.getBounds()
  if (!collapsed) expandedBounds = { ...box }
  collapsed = true
  const area = screenModule().getPrimaryDisplay().workArea
  const size = COLLAPSED_SIZE
  // 窗口本身有最小尺寸，收球前先放开
  mainWindow.setMinimumSize(60, 60)
  mainWindow.setBounds({
    x: Math.max(area.x, Math.min(box.x + box.width - size, area.x + area.width - size - 8)),
    y: Math.max(area.y, Math.min(box.y + box.height - size, area.y + area.height - size - 8)),
    width: size,
    height: size,
  })
  // 用 floating 而不是 screen-saver：后者会盖在任务栏右键菜单之上，光标来回跳
  mainWindow.setAlwaysOnTop(true, 'floating')
  return { ok: true }
})

ipcMain.handle('pet:expand', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false }
  collapsed = false
  mainWindow.setMinimumSize(240, 320)
  if (expandedBounds) mainWindow.setBounds(expandedBounds)
  return { ok: true }
})

/**
 * 模型尺寸变了以后，按需要的画面尺寸把窗口一起调大（右下角锚定），
 * 这样放大模型不会被窗口边界裁掉。缩小不回缩，避免窗口来回跳。
 */
ipcMain.handle('pet:resize', (_event, size) => {
  if (!mainWindow || mainWindow.isDestroyed() || collapsed) return { ok: false }
  const area = screenModule().getPrimaryDisplay().workArea
  const width = Math.min(area.width, Math.max(240, Math.round(Number(size && size.width) || 0)))
  const height = Math.min(area.height, Math.max(320, Math.round(Number(size && size.height) || 0)))
  const box = mainWindow.getBounds()
  if (box.width === width && box.height === height) return { ok: true, unchanged: true }
  // 以"画面中心"为锚点缩放，模型（居中于窗口）在屏幕上就不会被推着漂移
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  const nextX = Math.round(
    Math.min(Math.max(area.x, centerX - width / 2), area.x + area.width - width),
  )
  const nextY = Math.round(
    Math.min(Math.max(area.y, centerY - height / 2), area.y + area.height - height),
  )
  mainWindow.setBounds({ x: nextX, y: nextY, width, height })
  return { ok: true, bounds: { x: nextX, y: nextY, width, height } }
})

ipcMain.handle('pet:hide-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide()
  return { ok: true }
})

// Legacy chat stays on disk until explicit settings cleanup, never auto-displays.
ipcMain.handle('pet:history', () => ({ ok: true, chat: [] }))

// 窗口是全屏固定的一块：开关聊天只动 DOM，绝不能再 setBounds，
// 否则窗口一缩，居中绘制的模型就在屏幕上"漂"，还会被裁住。
ipcMain.handle('pet:panel', () => ({ ok: true }))

function currentWindowGeometry(size) {
  const box = mainWindow.getBounds()
  const display = screenModule().getDisplayMatching(box)
  return normalizeWindowGeometry(box, size, display.workArea)
}

function windowGeometryState() {
  if (!mainWindow || mainWindow.isDestroyed()) return { window: null }
  const box = mainWindow.getBounds(), limits = currentWindowGeometry().sliderLimits
  // Windows DIP/physical-pixel round trips can add one DIP at fractional scale.
  for (const axis of ['width', 'height']) {
    if (box[axis] <= limits[axis].max + 1) limits[axis].max = Math.max(limits[axis].max, box[axis])
  }
  return { window: box, windowLimits: limits }
}

function publishWindowGeometry() {
  const state = windowGeometryState()
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('pet:event', { type: 'window-state', state })
  return state
}

ipcMain.handle('pet:window-size', (_event, size) => {
  if (!mainWindow || mainWindow.isDestroyed() || collapsed) return { ok: false }
  const requested = currentWindowGeometry(size).bounds
  mainWindow.setBounds(requested)
  // Windows can round a DIP edge outward. Check the accepted native rectangle,
  // then move it just inside the work area instead of trusting requested bounds.
  const box = mainWindow.getBounds(), area = screenModule().getDisplayMatching(box).workArea
  if (box.x < area.x || box.y < area.y || box.x + box.width > area.x + area.width || box.y + box.height > area.y + area.height) {
    const x = Math.min(Math.max(area.x + 2, box.x), area.x + area.width - box.width - 2)
    const y = Math.min(Math.max(area.y + 2, box.y), area.y + area.height - box.height - 2)
    mainWindow.setBounds({ ...requested, x, y })
  }
  const actual = publishWindowGeometry()
  rememberWindowBounds({flush:true})
  logLine('[pet] 窗口尺寸改为:', actual.window.width + 'x' + actual.window.height)
  return { ok: true, width: actual.window.width, height: actual.window.height, ...actual }
})

ipcMain.on('pet:move-to', (_event, pos) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const box = mainWindow.getBounds()
  const area = screenUnion()
  const halfW = Math.round(box.width * 0.5)
  const anchorY = Math.round(box.height * 0.52)
  const x = Number(pos && pos.x)
  const y = Number(pos && pos.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return
  mainWindow.setPosition(
    Math.min(Math.max(area.x - halfW, Math.round(x)), area.x + area.width - halfW),
    Math.min(Math.max(area.y - anchorY, Math.round(y)), area.y + area.height - anchorY),
  )
})
ipcMain.on('pet:move-by', (_event, delta) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const box = mainWindow.getBounds()
  const area = screenUnion()
  const nextX = Math.round(box.x + Number(delta.dx || 0))
  const nextY = Math.round(box.y + Number(delta.dy || 0))
  // 模型画在窗口正中，所以窗口要能"一半移出屏幕"，模型才贴得到屏幕边缘。
  // 允许范围 = 让模型中心正好落在屏幕四条边上。
  const halfW = Math.round(box.width * 0.5)
  const anchorY = Math.round(box.height * 0.52)
  const minX = area.x - halfW
  const maxX = area.x + area.width - halfW
  const minY = area.y - anchorY
  const maxY = area.y + area.height - anchorY
  mainWindow.setPosition(
    Math.min(Math.max(minX, nextX), maxX),
    Math.min(Math.max(minY, nextY), maxY),
  )
})

// C2：点击 / 互动上报（渲染层调用）
// ---------------------------------------------------------- C4：开机自启

// 走「启动文件夹」而不是注册表：
//   · 主进程里 spawn reg.exe 会被拒（EACCES）
//   · app.setLoginItemSettings 在未打包的 dev 模式下也不落盘
// 启动文件夹只需要普通文件写权限，最可靠。
function startupFolder() {
  const appData = process.env.APPDATA
  if (!appData) return ''
  return path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
}

function autostartFile() {
  const dir = startupFolder()
  return dir ? path.join(dir, '大肥鱼桌宠自启.cmd') : ''
}

function getAutostart() {
  const file = autostartFile()
  if (!file) return { enabled: false, command: '', error: '找不到启动文件夹' }
  const enabled = fs.existsSync(file)
  return { enabled, command: enabled ? file : '' }
}

function watchdogRunning() {
  try {
    const exec = require('node:child_process').execSync
    const out = exec('tasklist /FI "IMAGENAME eq powershell.exe" /FO CSV', {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 4000,
    })
    return /powershell\.exe/i.test(out)
  } catch (error) {
    return false
  }
}

function setAutostart(enabled) {
  try {
    const file = autostartFile()
    if (!file) return { enabled: false, command: '', error: '找不到启动文件夹' }
    if (!enabled) {
      if (fs.existsSync(file)) fs.unlinkSync(file)
      return getAutostart()
    }
    // 启动文件夹里放一个 cmd：清掉 ELECTRON_RUN_AS_NODE 后直接启动桌宠本体。
    // 不用 PowerShell 看门狗——那条链路在中文路径 + PS5.1 编码下不稳定，
    // 而且「开机自启」本身只需要把程序拉起来，不需要额外守候进程。
    const electronExe = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
    if (!fs.existsSync(electronExe)) {
      return { enabled: false, command: '', error: '找不到 electron.exe' }
    }
    const body = [
      '@echo off',
      'chcp 65001 >nul',
      'set ELECTRON_RUN_AS_NODE=',
      'start "" "' + electronExe + '" "' + ROOT + '"',
      '',
    ].join('\r\n')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, body, 'utf8')
    return getAutostart()
  } catch (error) {
    return { enabled: false, command: '', error: error.message }
  }
}

// C2：窗口就绪后推一次当前好感度（否则渲染层默认 normal）
function pushAffinity() {
  try {
    pushToPet({ type: 'affinity', value: state.affinity, mood: affinityMood() })
  } catch (error) {
    /* ignore */
  }
}

ipcMain.handle('pet:autostart', (_event, enabled) => {
  if (enabled === undefined) return { ok: true, ...getAutostart() }
  const result = setAutostart(Boolean(enabled))
  logLine('[pet] 开机自启 →', result.enabled ? '开' : '关', result.error || '')
  return { ok: !result.error, ...result }
})

ipcMain.on('pet:interact', (_event, kind) => {
  try {
    // Pointer-down preempts before the renderer starts its click response on pointer-up.
    if (['touch', 'drag', 'manual'].includes(kind)) director.interact()
    const value = bumpAffinity(String(kind || 'click'))
    pushToPet({ type: 'affinity', value, mood: affinityMood() })
  } catch (error) {
    /* ignore */
  }
})

ipcMain.on('pet:quit', () => {
  // 退出前把桥接文件写空，别让事后看文件的人以为还在跑
  try {
    for (const file of [BRIDGE_PATH, BRIDGE_FALLBACK]) {
      if (fs.existsSync(file)) fs.unlinkSync(file)
    }
  } catch (error) {
    /* ignore */
  }
  app.quit()
})

// ----------------------------------------------------------------- lifecycle

const singleInstance = acquireLock()
logLine('[boot] electron', process.versions.electron, 'lock=', singleInstance, 'userData=', app.getPath('userData'))
if (!singleInstance) {
  logLine('[boot] 已有实例在跑，退出本次启动')
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
  // C2：开机算一次「多久没互动」的衰减
  try {
    decayAffinity()
  } catch (error) {
    /* ignore */
  }
  // 睡眠唤醒 / 解锁后恢复窗口交互状态（否则会卡成「点不动、拖不动」）
  try {
    if (powerMonitor) {
      for (const [native, event] of [['lock-screen', 'lock'], ['suspend', 'suspend'], ['shutdown', 'shutdown'], ['resume', 'resume'], ['unlock-screen', 'unlock']]) {
        powerMonitor.on(native, () => { director.systemEvent(event); if (event === 'resume' || event === 'unlock') recoverAfterWake(event) })
      }
    }
  } catch (error) {
    logLine('[pet] powerMonitor 挂载失败', error.message)
  }
    logLine('[boot] ready')
    try {
      await startServer(Number(config.control.port) || 41968)
      logLine('[boot] 服务已起，port=', controlPort)
    } catch (error) {
      logLine('[boot] HTTP 服务启动失败:', error.message)
      app.quit()
      return
    }
    try {
      createWindow()
      logLine('[boot] 窗口已建')
      if (SMOKE_MODE) setTimeout(() => { void runSmokeMode() }, 3000)
      if (!TEST_HEADLESS) {
        createTray()
        logLine('[boot] 托盘已建')
        const okToggle = shortcuts().register('Control+Alt+F', toggleWindow)
        logLine('[boot] 快捷键 Ctrl+Alt+F:', okToggle ? '已注册' : '注册失败（可能被别的程序占用）')
        // 万一自动穿透判定失灵，这个快捷键能手动把窗口变回可点。
        const okThrough = shortcuts().register('Control+Alt+P', () => applyClickThrough(!clickThrough))
        logLine('[boot] 快捷键 Ctrl+Alt+P:', okThrough ? '已注册' : '注册失败（可能被别的程序占用）')
        startCursorWatch()
        scheduleWatch()
        // 注册当前角色的 .vtube.json 模型热键
        registerVtubeHotkeys(activeCharacter())
        // QQ 网关：config.json 里 qq.enabled=true 才连
        if (config.qq && config.qq.enabled === true) {
          try {
            qqGateway = startQQGateway(config.qq, {
              log: (...args) => logLine('[qq]', ...args),
              notify: (text) => pushStatus(text),
              onText: async (text, meta) => {
                const reply = await handleChatText(text, meta)
                if (reply && config.qq.replyInQQ !== false && qqGateway) {
                  qqGateway.sendText(meta.chatType, meta.chatId, reply.say)
                }
              },
            })
            if (qqGateway) logLine('[qq] 网关已启动', config.qq.wsUrl)
          } catch (error) {
            logLine('[qq] 启动失败：' + error.message)
          }
        }
      }
    } catch (error) {
      logLine('[boot] 界面初始化失败:', error.stack || error.message)
    }
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    /* 桌宠常驻托盘，这里不退出 */
  })

  app.on('before-quit', () => { director.shutdown(); rememberWindowBounds({flush:true}) })
  app.on('will-quit', () => {
    if (windowSaveTimer) clearTimeout(windowSaveTimer)
    if (watchTimer) clearInterval(watchTimer)
    if (cursorTimer) clearInterval(cursorTimer)
    if (qqGateway) {
      try {
        qqGateway.close()
      } catch {
        /* ignore */
      }
      qqGateway = null
    }
    shortcuts().unregisterAll()
    if (controlServer) controlServer.close()
    for (const file of [BRIDGE_PATH, BRIDGE_FALLBACK]) {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file)
      } catch {
        /* ignore */
      }
    }
    try {
      if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH)
    } catch {
      /* ignore */
    }
    saveState()
  })
}

// --------------------------------------------------- 独立设置窗口（多窗口）

let settingsWindow = null
const director = createDirector({ root: ROOT, config, legacyPersona, saveConfig: saveDirectorConfig,
  sense: senseForDirector,
  senseManual: async ({ title, screenshot, signal }) => {
    if (signal.aborted) return {}
    const front = title ? await foregroundSensor.read({ includeTitle: true, signal }) : null
    if (signal.aborted) return {}
    const imageDataUrl = screenshot ? await captureScreen() : null
    return signal.aborted ? {} : { front, imageDataUrl }
  },
  getCapabilities: () => lastCapabilities,
  getDisplays: () => screenModule().getAllDisplays().map(d => ({ id: d.id, bounds: d.bounds })),
  getSettingsUrl: () => 'http://127.0.0.1:' + controlPort + '/settings.html',
  getWindow: () => mainWindow, getSettingsWindow: () => settingsWindow, send: pushToPet, ipcMain })

function createSettingsWindow(preloadOnly = false) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (!TEST_HEADLESS) {
      settingsWindow.show()
      settingsWindow.focus()
    }
    return { ok: true, reused: true }
  }
  const area = screenModule().getPrimaryDisplay().workArea
  const width = 520
  const height = 660
  settingsWindow = new BrowserWindow({
    width,
    height,
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })
  settingsWindow.setAlwaysOnTop(true, 'floating')
  settingsWindow.loadURL('http://127.0.0.1:' + controlPort + '/settings.html')
  settingsWindow.once('ready-to-show', () => {
    if (!TEST_HEADLESS && !preloadOnly) settingsWindow.show()
  })
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
  logLine('[pet] 设置窗口已创建')
  return { ok: true, created: true }
}

ipcMain.handle('settings:open', () => createSettingsWindow())

function legacySettingsSender(event) {
  const contents = settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.webContents
  const expected = 'http://127.0.0.1:' + controlPort + '/settings.html'
  return Boolean(contents && event && event.sender === contents
    && event.senderFrame === contents.mainFrame && event.senderFrame.url === expected
    && contents.getURL() === expected)
}
ipcMain.handle('legacy-state:status', (event, ...args) => {
  if (!legacySettingsSender(event)) return { ok: false, status: 403, code: 'LEGACY_FORBIDDEN', error: '仅设置窗口可管理旧字段。' }
  if (args.length) return { ok: false, status: 400, code: 'LEGACY_INVALID', error: '旧字段状态不接受参数。' }
  return platformSecurity.legacyStatus()
})
ipcMain.handle('legacy-state:delete', (event, body, ...extra) => {
  if (!legacySettingsSender(event)) return { ok: false, status: 403, code: 'LEGACY_FORBIDDEN', error: '仅设置窗口可管理旧字段。' }
  if (extra.length) return { ok: false, status: 400, code: 'LEGACY_INVALID', error: '旧字段清理请求无效。' }
  return platformSecurity.deleteLegacy(body)
})

ipcMain.handle('settings:background-pick', async (event, payload) => {
  if (!settingsWindow || settingsWindow.isDestroyed() || event.sender !== settingsWindow.webContents
    || event.senderFrame !== settingsWindow.webContents.mainFrame) {
    return { ok: false, code: 'BACKGROUND_FORBIDDEN', error: '仅设置窗口可以选择背景图片。' }
  }
  const expectedUrl = 'http://127.0.0.1:' + controlPort + '/settings.html'
  if (event.senderFrame.url.split(/[?#]/, 1)[0] !== expectedUrl) {
    return { ok: false, code: 'BACKGROUND_FORBIDDEN', error: '设置窗口来源无效。' }
  }
  if (!payload || !['scene', 'bubble'].includes(payload.target)) {
    return { ok: false, code: 'BACKGROUND_TARGET', error: '背景类型必须为 scene 或 bubble。' }
  }
  try {
    const chosen = await electron.dialog.showOpenDialog(settingsWindow, {
      title: payload.target === 'scene' ? '选择人物背景图片' : '选择对话气泡背景图片',
      properties: ['openFile'],
      filters: [{ name: '背景图片（PNG / JPEG / WebP）', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    })
    if (chosen.canceled || !chosen.filePaths || chosen.filePaths.length !== 1) return { ok: false, cancelled: true }
    if (!settingsWindow || settingsWindow.isDestroyed() || event.sender !== settingsWindow.webContents) return { ok: false, cancelled: true }
    return await importBackground(chosen.filePaths[0], { root: ROOT, nativeImage: nativeImageModule() })
  } catch {
    return { ok: false, code: 'BACKGROUND_PICK_FAILED', error: '无法打开图片选择器，请稍后重试。' }
  }
})

// C4：开机自启开关（无参读、有参写）
ipcMain.handle('settings:autostart', (_event, enabled) => {
  try {
    if (enabled === undefined || enabled === null) {
      const cur = getAutostart()
      return { ok: true, enabled: Boolean(cur.enabled), path: cur.command, error: cur.error || null }
    }
    const result = setAutostart(Boolean(enabled))
    logLine('[pet] 开机自启', enabled ? '已开启' : '已关闭', result.error || '')
    return { ok: !result.error, enabled: Boolean(result.enabled), error: result.error || null }
  } catch (error) {
    return { ok: false, enabled: false, error: error.message }
  }
})

ipcMain.on('settings:close', () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close()
})

// 设置窗口发出的操作 → 转给主窗口执行（模型在那边）
ipcMain.on('settings:command', (_event, payload) => {
  // 说话语言持久化到 config
  if (payload && payload.cmd === 'ttsSayLanguage' && (payload.value === 'ja' || payload.value === 'zh')) {
    config.tts.sayLanguage = payload.value
    writeJson(CONFIG_PATH, config)
  }
  // TTS 接入配置（高级设置）
  if (payload && payload.cmd === 'ttsConfig' && payload.value && typeof payload.value === 'object') {
    config.tts = { ...config.tts, ...payload.value }
    writeJson(CONFIG_PATH, config)
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pet:event', { type: 'settings-command', payload })
  }
})

ipcMain.handle('settings:state', () => ({
  ok: true,
  character: activeCharacter(),
  ...windowGeometryState(),
  characters: listCharacters().map((item) => ({ id: item.id, name: item.name, preview: item.preview || '' })),
  tts: config.tts,
}))

ipcMain.handle('settings:characters', () => ({
  ok: true,
  active: activeCharacter()?.id || null,
  items: listCharacters().map((item) => ({ id: item.id, name: item.name, preview: item.preview || '' })),
}))

ipcMain.handle('settings:switch', (_event, id) => {
  const character = readCharacter(String(id || ''))
  if (!character) return { ok: false, error: '没有这个角色' }
  state.character = character.id
  saveState()
  pushToPet({ type: 'character', character })
  return { ok: true, character }
})

ipcMain.handle('settings:import', (_event, payload) => {
  try {
    const filePath = String((payload && payload.path) || '').trim()
    if (!filePath) return { ok: false, error: '没有收到文件路径' }
    if (!fs.existsSync(filePath)) return { ok: false, error: '文件不存在：' + filePath }
    const { character, files } = importCharacterFromZip(filePath)
    state.character = character.id
    saveState()
    pushToPet({ type: 'character', character })
    registerVtubeHotkeys(character)
    return { ok: true, character, files }
  } catch (error) {
    logLine('[pet] 设置窗口导入失败:', error.message)
    return { ok: false, error: error.message }
  }
})

// --------------------------------------------------- 独立动作控制台窗口

let consoleWindow = null

function createConsoleWindow() {
  if (consoleWindow && !consoleWindow.isDestroyed()) {
    if (!TEST_HEADLESS) { consoleWindow.show(); consoleWindow.focus() }
    return { ok: true, reused: true }
  }
  const area = screenModule().getPrimaryDisplay().workArea
  const width = 460
  const height = 520
  consoleWindow = new BrowserWindow({
    width,
    height,
    x: area.x + Math.round((area.width - width) / 2) - 80,
    y: area.y + Math.round((area.height - height) / 2) + 40,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-console.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })
  consoleWindow.setAlwaysOnTop(true, 'floating')
  consoleWindow.loadURL('http://127.0.0.1:' + controlPort + '/console.html')
  consoleWindow.once('ready-to-show', () => { if (!TEST_HEADLESS) consoleWindow.show() })
  consoleWindow.on('closed', () => {
    consoleWindow = null
  })
  logLine('[pet] 动作控制台窗口已创建')
  return { ok: true, created: true }
}

ipcMain.handle('console:open', () => createConsoleWindow())

// --------------------------------------------------- 独立聊天窗口
function createChatWindow() {
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.show()
    chatWindow.focus()
    return { ok: true, reused: true }
  }
  const area = screenModule().getPrimaryDisplay().workArea
  const width = 460
  const height = 560
  chatWindow = new BrowserWindow({
    width,
    height,
    x: area.x + area.width - width - 40,
    y: area.y + area.height - height - 40,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    resizable: true,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })
  chatWindow.setAlwaysOnTop(true, 'floating')
  chatWindow.loadURL('http://127.0.0.1:' + controlPort + '/chat.html')
  chatWindow.once('ready-to-show', () => chatWindow.show())
  chatWindow.on('closed', () => {
    chatWindow = null
  })
  logLine('[pet] 聊天窗口已创建')
  return { ok: true, created: true }
}

ipcMain.handle('chat:open', () => createChatWindow())
ipcMain.on('chat:close', () => {
  if (chatWindow && !chatWindow.isDestroyed()) chatWindow.close()
})

// --------------------------------------------------- 独立快捷菜单窗
function createPanelWindow(pos) {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.show()
    panelWindow.focus()
    return { ok: true, reused: true }
  }
  const area = screenModule().getPrimaryDisplay().workArea
  const width = 220
  const height = 270
  let x = pos && Number.isFinite(pos.x) ? Math.round(pos.x) : area.x + area.width - width - 40
  let y = pos && Number.isFinite(pos.y) ? Math.round(pos.y) : area.y + area.height - height - 120
  x = Math.max(area.x, Math.min(area.x + area.width - width, x))
  y = Math.max(area.y, Math.min(area.y + area.height - height, y))
  panelWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })
  panelWindow.setAlwaysOnTop(true, 'floating')
  panelWindow.loadURL('http://127.0.0.1:' + controlPort + '/panel.html')
  panelWindow.once('ready-to-show', () => panelWindow.show())
  // 点到别处（失焦）自动收起
  panelWindow.on('blur', () => {
    if (!panelWindow || panelWindow.isDestroyed()) return
    setTimeout(() => {
      if (panelWindow && !panelWindow.isDestroyed()) panelWindow.close()
    }, 150)
  })
  panelWindow.on('closed', () => {
    panelWindow = null
  })
  logLine('[pet] 快捷菜单窗口已创建')
  return { ok: true, created: true }
}

ipcMain.handle('panel:open', (_event, pos) => createPanelWindow(pos))
ipcMain.on('panel:close', () => {
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.close()
})

ipcMain.on('console:close', () => {
  if (consoleWindow && !consoleWindow.isDestroyed()) consoleWindow.close()
})

// 控制台请主窗口报一次动作/表情清单
ipcMain.on('console:request', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pet:event', { type: 'console-request' })
  }
})

// 播放动作 / 表情：转给主窗口
ipcMain.on('console:action', (_event, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pet:event', { type: 'console-action', payload })
  }
})
