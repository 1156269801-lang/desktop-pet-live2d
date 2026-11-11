'use strict'

/**
 * 读取模型目录下的 *.vtube.json，把 VTube Studio 的热键表转成 Electron 加速键。
 * VTS 的 Triggers 是 Trigger1/2/3（如 Alt + D、LeftShift + N1），Action 是
 * ToggleExpression / TriggerAnimation / RemoveAllExpressions，File 指向 exp3/motion3。
 */
const fs = require('node:fs')
const path = require('node:path')

/** VTS 按键 token → Electron accelerator 片段 */
function keyToken(token) {
  const t = String(token || '').trim()
  if (!t) return ''
  const low = t.toLowerCase()
  if (low === 'alt') return 'Alt'
  if (low === 'control' || low === 'ctrl') return 'Control'
  if (low === 'shift') return 'Shift'
  if (low === 'meta') return 'Super'
  if (t === 'LeftShift' || t === 'RightShift') return 'Shift'
  if (t === 'LeftControl' || t === 'RightControl') return 'Control'
  if (t === 'LeftAlt' || t === 'RightAlt') return 'Alt'
  // VTS 的 N1~N9 是主键盘数字键
  if (/^N[0-9]$/.test(t)) return t.slice(1)
  if (/^F([0-9]{1,2})$/.test(t)) return t
  if (/^[A-Z]$/.test(t)) return t
  if (/^[0-9]$/.test(t)) return t
  return t
}

/** Triggers → accelerator（如 "Alt+D"） */
function toAccelerator(triggers) {
  if (!triggers || typeof triggers !== 'object') return ''
  const parts = []
  for (const k of ['Trigger1', 'Trigger2', 'Trigger3']) {
    const part = keyToken(triggers[k])
    if (part) parts.push(part)
  }
  return parts.join('+')
}

/** 读取模型目录下的 *.vtube.json，返回 [{ id, name, accelerator, action, file, fade }] */
function readVtubeHotkeys(modelDir) {
  let entries = []
  try {
    entries = fs.readdirSync(modelDir, { withFileTypes: true })
  } catch {
    return []
  }
  const vtube = entries.find((e) => e.isFile() && /\.vtube\.json$/i.test(e.name))
  if (!vtube) return []
  let data
  try {
    data = JSON.parse(fs.readFileSync(path.join(modelDir, vtube.name), 'utf8'))
  } catch {
    return []
  }
  const list = Array.isArray(data.Hotkeys) ? data.Hotkeys : []
  const result = []
  for (const h of list) {
    if (!h || h.IsActive === false) continue
    const accelerator = toAccelerator(h.Triggers)
    if (!accelerator) continue
    result.push({
      id: String(h.HotkeyID || ''),
      name: String(h.Name || '').trim(),
      accelerator,
      action: String(h.Action || ''),
      file: String(h.File || ''),
      fade: Number(h.FadeSecondsAmount) || 0.5,
    })
  }
  return result
}

module.exports = { readVtubeHotkeys, toAccelerator, keyToken }
