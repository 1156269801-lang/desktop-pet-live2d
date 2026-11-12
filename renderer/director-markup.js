/**
 * 导演标记解析：把台词里的〔标记〕拆成「纯文本 + 时间点动作」。
 *
 * 语法：〔歪头:右 眯眼〕嗯……〔点头〕好呀〔开心〕
 * 返回：{ speech: "嗯……好呀", cues: [{ charIndex, type, name, ... }] }
 *
 * 标记种类：
 *   perform  表演层手势，可带方向或力度：〔歪头:左〕〔点头:0.6〕
 *   mood     持续情绪：〔开心〕〔难过〕〔平静〕
 *   pose / gaze / clearExpression / name（表情或模型自带动作名）
 *
 * 未知标记静默忽略，不影响说话。
 */
(function (root) {
  'use strict'

  const POSE = {
    '眯眼': { type: 'pose', name: 'squint' },
  }

  /** 中文标记 → 表演层手势 id（见 acting.js） */
  const PERFORM = {
    '点头': 'nod', '连点头': 'nods', '摇头': 'shake', '歪头': 'tilt',
    '惊': 'perk', '一惊': 'perk', '惊讶': 'perk',
    '蹦': 'bounce', '笑': 'laugh', '哼': 'huff',
    '失落': 'droop', '垂头': 'droop',
    '想': 'think', '思考': 'think',
    '瞥': 'glance', '移开视线': 'away', '盯': 'peer',
    '抬头': 'lookUp', '低头': 'lookDown',
    '坏笑': 'smirk', '心动': 'swoon', '摇摆': 'sway', '跺脚': 'stomp', '凑近': 'leanIn',
  }

  /** 中文标记 → 情绪 id */
  const MOOD = {
    '开心': 'happy', '喜欢': 'love', '害羞': 'shy', '难过': 'sad', '生气': 'angry',
    '得意': 'smug', '困': 'sleepy', '犯困': 'sleepy', '困惑': 'confused',
    '紧张': 'nervous', '平静': 'neutral',
  }

  const SIDE = { '左': 'left', '右': 'right' }

  const GAZE = {
    '看:左': { x: -1, y: 0 },
    '看:右': { x: 1, y: 0 },
    '看:上': { x: 0, y: -1 },
    '看:下': { x: 0, y: 1 },
  }

  const has = (table, key) => Object.prototype.hasOwnProperty.call(table, key)

  /** 解析单个标记体，返回 { type, ... } */
  function parseCue(raw) {
    const body = String(raw || '').trim()
    if (!body) return { type: 'unknown' }
    // 一律按自有属性查表：标记来自模型输出，不能命中 constructor 之类的原型成员
    if (has(POSE, body)) return { ...POSE[body] }
    if (has(GAZE, body)) return { type: 'gaze', ...GAZE[body] }
    if (/^清表情/.test(body)) return { type: 'clearExpression' }
    // 名字:参数（方向 左/右，或 0~1 的力度）
    const m = /^([^:：]+)[:：]\s*(.+)$/.exec(body)
    const name = m ? m[1].trim() : body
    const arg = m ? m[2].trim() : ''
    const number = /^[0-9]*\.?[0-9]+$/.test(arg) ? Math.max(0, Math.min(1, Number(arg))) : null
    if (has(PERFORM, name)) {
      const cue = { type: 'perform', name: PERFORM[name] }
      if (has(SIDE, arg)) cue.side = SIDE[arg]
      if (number !== null) cue.intensity = number
      return cue
    }
    const moodName = name === '心情' ? arg : name
    if (has(MOOD, moodName)) {
      const cue = { type: 'mood', name: MOOD[moodName] }
      if (name !== '心情' && number !== null) cue.intensity = number
      return cue
    }
    return { type: 'name', name, strength: number === null ? 1 : number }
  }

  /** 解析整段台词 */
  function parseMarkup(text) {
    const src = String(text || '')
    const cues = []
    let speech = ''
    const re = /〔([^〕]*)〕/g
    let last = 0
    let m
    while ((m = re.exec(src))) {
      speech += src.slice(last, m.index)
      const raw = m[1].trim()
      if (raw) {
        // 同一位置多个标记用空格分隔
        for (const part of raw.split(/\s+/)) {
          if (part) cues.push({ charIndex: speech.length, raw: part, ...parseCue(part) })
        }
      }
      last = m.index + m[0].length
    }
    speech += src.slice(last)
    // 台词被截断时可能留下半个标记（〔点），不显示出来
    speech = speech.replace(/〔[^〕]*$/, '')
    return { speech: speech.trim(), cues }
  }

  /** 去掉全部标记，只留要显示的文字（聊天窗、QQ 回复用） */
  function stripMarkup(text) {
    return parseMarkup(text).speech
  }

  /** 截断到最多 max 个显示字符；标记不计入字数，也不会被切成两半 */
  function truncateMarkup(text, max) {
    const src = String(text || '')
    const limit = Math.max(0, Number(max) || 0)
    let out = ''
    let visible = 0
    for (let i = 0; i < src.length && visible < limit;) {
      const end = src[i] === '〔' ? src.indexOf('〕', i) : -1
      if (end >= 0) {
        out += src.slice(i, end + 1)
        i = end + 1
      } else {
        out += src[i]
        visible += 1
        i += 1
      }
    }
    return out
  }

  const api = { parseMarkup, parseCue, stripMarkup, truncateMarkup, PERFORM, MOOD }
  if (typeof module === 'object' && module.exports) module.exports = api
  root.PetDirectorMarkup = api
})(typeof globalThis !== 'undefined' ? globalThis : window)
