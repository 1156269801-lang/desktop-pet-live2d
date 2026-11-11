/**
 * 导演标记解析：把台词里的〔标记〕拆成「纯文本 + 时间点动作」。
 *
 * 语法：〔歪头:右 眯眼〕嗯……〔竖手指〕
 * 返回：{ speech: "嗯……", cues: [{ charIndex, type, name, ... }] }
 *
 * 未知标记静默忽略，不影响说话。
 */
(function (root) {
  'use strict'

  const POSE = {
    '歪头:左': { type: 'pose', name: 'tiltLeft' },
    '歪头:右': { type: 'pose', name: 'tiltRight' },
    '抬头': { type: 'pose', name: 'lookUp' },
    '低头': { type: 'pose', name: 'lookDown' },
    '眯眼': { type: 'pose', name: 'squint' },
    '笑': { type: 'pose', name: 'smile' },
  }

  const GAZE = {
    '看:左': { x: -1, y: 0 },
    '看:右': { x: 1, y: 0 },
    '看:上': { x: 0, y: -1 },
    '看:下': { x: 0, y: 1 },
  }

  /** 解析单个标记体，返回 { type, ... } */
  function parseCue(raw) {
    const body = String(raw || '').trim()
    if (!body) return { type: 'unknown' }
    if (POSE[body]) return { ...POSE[body] }
    if (GAZE[body]) return { type: 'gaze', ...GAZE[body] }
    if (/^清表情/.test(body)) return { type: 'clearExpression' }
    // 名字:强度（0~1）
    const m = /^([^:：]+)[:：]\s*([0-9]*\.?[0-9]+)$/.exec(body)
    const name = m ? m[1].trim() : body
    const strength = m ? Math.max(0, Math.min(1, Number(m[2]) || 1)) : 1
    return { type: 'name', name, strength }
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
    return { speech: speech.trim(), cues }
  }

  root.PetDirectorMarkup = { parseMarkup, parseCue }
})(typeof globalThis !== 'undefined' ? globalThis : window)
