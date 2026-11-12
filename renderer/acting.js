'use strict'

/**
 * 表演层：意图级的手势与持续的情绪状态，输出各通道的"叠加量"和要打开的模型表情。
 *
 *   手势  一次性的多通道动作（点头、歪头、哼、蹦……）。每个手势同时驱动头、
 *         身体、眉、眼、嘴等多个通道，带预备动作和过冲回弹；眼和眉先动，头
 *         随后，身体最后。每次播放的幅度、时长、左右都略有不同。
 *   情绪  持续的底姿（开心、难过、得意……）加上有节奏的身体摆动，慢慢衰减
 *         回平静，同时改变微动和说话伴随的力度。
 *   表情  情绪和部分手势会点名模型自带的表情（屑屑眼、爱心眼、脸红……）。
 *         这里只给名字，由调用方在模型有这个表情时打开、结束时关掉。
 *
 * 调用方只说"做什么"（play('nod')、setMood('happy')），曲线都在这里。
 *
 * 单位：头/身体/前倾是"参数范围为 ±30 时的度数"，其余是参数原生单位（约 -1..1）。
 * 方向：headY 正=低头，headX 正=转向画面右侧，headZ 正=向画面右侧倾，
 *       eyeX 正=看右，eyeY 正=看上，眉毛正=抬起，bodyY 正=上移，lean 正=上身前倾。
 *
 * 浏览器里挂在 window.PetActing；node 里 module.exports。
 */
;(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.PetActing = api
})(typeof self !== 'undefined' ? self : this, function () {
  const ROLES = ['headX', 'headY', 'headZ', 'bodyX', 'bodyY', 'lean', 'eyeX', 'eyeY', 'browL', 'browR', 'eyeOpen', 'mouthForm', 'eyeSmile', 'shock']
  /** 各通道的起步延迟（占手势时长的比例）：眼和眉先动，头随后，身体最后 */
  const LAG = { eyeX: 0, eyeY: 0, eyeOpen: 0, shock: 0, browL: 0.02, browR: 0.02, eyeSmile: 0.02, mouthForm: 0.03, headX: 0.07, headY: 0.07, headZ: 0.09, lean: 0.12, bodyX: 0.15, bodyY: 0.13 }
  const MAX_LAG = 0.15
  /** 手势关键帧的整体放大：头部动作要看得清，身体位移在这个模型上本来就不显眼 */
  const GAIN = { headX: 1.35, headY: 1.35, headZ: 1.35, bodyX: 2.5, bodyY: 1.8 }
  /** 左右镜像时取反的通道 */
  const MIRRORED = ['headX', 'headZ', 'bodyX', 'eyeX']
  const MAX_ACTIVE = 3
  /** 互斥的眼型表情：同一时刻只开一个，手势的优先于情绪的 */
  const EYE_EXPRESSIONS = ['＞＜', '屑屑眼', '爱心眼', '圈圈眼']
  const TAU = Math.PI * 2

  const hold = (value, a = 0.22, b = 0.76) => [[0, 0], [a, value], [b, value * 0.94], [1, 0]]
  const both = (points) => ({ browL: points, browR: points })
  /** 手势期间打开的表情：从进度 from 到 to */
  const during = (names, from = 0.06, to = 0.84) => ({ names, from, to })

  /** 手势库。关键帧 [进度 0..1, 值]；sided 的手势按"朝画面右侧"编写，可镜像。 */
  const GESTURES = {
    nod: { label: '点头', duration: 900, tracks: {
      headY: [[0, 0], [0.12, -1.5], [0.42, 8], [0.68, -1.2], [1, 0]],
      lean: [[0, 0], [0.42, 2.5], [0.72, 0], [1, 0]],
      eyeOpen: [[0, 0], [0.4, -0.25], [0.75, 0], [1, 0]],
      ...both([[0, 0], [0.4, -0.08], [1, 0]]),
    } },
    nods: { label: '连点两下头', duration: 1300, tracks: {
      headY: [[0, 0], [0.08, -1.2], [0.28, 7], [0.48, 1], [0.68, 6], [0.86, -0.8], [1, 0]],
      lean: [[0, 0], [0.28, 2.5], [0.48, 0.5], [0.68, 2], [1, 0]],
      eyeOpen: [[0, 0], [0.28, -0.2], [0.48, 0], [0.68, -0.2], [1, 0]],
      mouthForm: [[0, 0], [0.2, 0.4], [0.8, 0.4], [1, 0]],
    } },
    shake: { label: '摇头', duration: 1200, tracks: {
      headX: [[0, 0], [0.08, 1.5], [0.28, -9], [0.5, 8], [0.72, -5], [0.88, 1], [1, 0]],
      bodyX: [[0, 0], [0.28, -1.6], [0.5, 1.4], [0.72, -0.9], [1, 0]],
      eyeOpen: [[0, 0], [0.3, -0.3], [0.8, -0.2], [1, 0]],
      ...both([[0, 0], [0.3, -0.25], [0.8, -0.2], [1, 0]]),
    } },
    tilt: { label: '歪头', duration: 1700, sided: true, tracks: {
      headZ: [[0, 0], [0.06, -1.5], [0.24, 11], [0.34, 9.5], [0.78, 9.5], [1, 0]],
      headX: hold(3, 0.24, 0.78),
      bodyX: hold(-1.2, 0.3, 0.78),
      browL: hold(0.4, 0.24, 0.78),
      browR: hold(0.15, 0.24, 0.78),
      eyeY: hold(0.15, 0.2, 0.78),
    } },
    perk: { label: '一惊', duration: 1100, tracks: {
      bodyY: [[0, 0], [0.14, 3.5], [0.34, 1.2], [0.7, 0.8], [1, 0]],
      lean: [[0, 0], [0.14, -7], [0.4, -4], [0.75, -3], [1, 0]],
      headY: [[0, 0], [0.14, -6], [0.4, -3], [0.75, -2], [1, 0]],
      eyeOpen: [[0, 0], [0.1, 0.4], [0.7, 0.3], [1, 0]],
      shock: [[0, 0], [0.1, 0.8], [0.6, 0.6], [1, 0]],
      ...both([[0, 0], [0.1, 0.9], [0.7, 0.6], [1, 0]]),
    } },
    bounce: { label: '开心地蹦一下', duration: 1100, tracks: {
      bodyY: [[0, 0], [0.08, -1.2], [0.22, 4], [0.38, 0], [0.52, 3], [0.68, 0], [0.8, 1], [1, 0]],
      headY: [[0, 0], [0.22, -3], [0.38, 2], [0.52, -2], [0.68, 1.5], [1, 0]],
      eyeSmile: hold(0.9, 0.15, 0.8),
      mouthForm: hold(0.9, 0.15, 0.8),
      ...both(hold(0.45, 0.15, 0.8)),
    } },
    laugh: { label: '笑', duration: 1500, expression: during(['＞＜'], 0.08, 0.8), tracks: {
      headY: [[0, 0], [0.12, -5], [0.24, -2.5], [0.36, -5.5], [0.48, -2.5], [0.6, -4.5], [0.74, -2], [1, 0]],
      bodyY: [[0, 0], [0.12, 1.2], [0.24, 0.2], [0.36, 1.3], [0.48, 0.2], [0.6, 1], [1, 0]],
      lean: hold(-4, 0.12, 0.74),
      eyeSmile: hold(1, 0.1, 0.8),
      mouthForm: hold(1, 0.1, 0.82),
      ...both(hold(0.4, 0.1, 0.8)),
    } },
    huff: { label: '哼地别过头', duration: 1500, sided: true, tracks: {
      headX: [[0, 0], [0.08, -1.5], [0.26, 12], [0.74, 11], [1, 0]],
      headY: hold(-6, 0.26, 0.74),
      headZ: hold(-3, 0.26, 0.74),
      bodyX: hold(1.5, 0.3, 0.74),
      lean: hold(-3, 0.3, 0.74),
      eyeOpen: [[0, 0], [0.2, -0.9], [0.7, -0.9], [0.85, 0], [1, 0]],
      mouthForm: hold(-0.8, 0.2, 0.74),
      ...both(hold(-0.6, 0.2, 0.74)),
    } },
    droop: { label: '失落地垂头', duration: 2200, sided: true, tracks: {
      headY: hold(10, 0.3, 0.75),
      headZ: hold(3, 0.35, 0.75),
      bodyY: hold(-2, 0.35, 0.75),
      lean: hold(6, 0.35, 0.75),
      eyeY: hold(-0.4, 0.25, 0.75),
      eyeOpen: hold(-0.3, 0.3, 0.75),
      mouthForm: hold(-0.9, 0.3, 0.75),
      ...both(hold(-0.7, 0.25, 0.75)),
    } },
    think: { label: '抬眼想一想', duration: 2200, sided: true, tracks: {
      eyeX: [[0, 0], [0.1, 0.55], [0.72, 0.5], [0.85, 0], [1, 0]],
      eyeY: [[0, 0], [0.1, 0.5], [0.72, 0.45], [0.85, 0], [1, 0]],
      headZ: hold(-6, 0.25, 0.75),
      headY: hold(-3, 0.25, 0.75),
      headX: hold(3, 0.25, 0.75),
      lean: hold(-2, 0.3, 0.75),
      browL: hold(0.4, 0.2, 0.75),
      browR: hold(-0.15, 0.2, 0.75),
    } },
    glance: { label: '瞥一眼', duration: 1400, sided: true, tracks: {
      eyeX: [[0, 0], [0.08, 0.8], [0.6, 0.75], [0.75, 0], [1, 0]],
      headX: [[0, 0], [0.25, 7], [0.62, 6.5], [1, 0]],
      ...both(hold(0.2, 0.15, 0.6)),
    } },
    away: { label: '害羞地移开视线', duration: 1800, sided: true, expression: during(['脸红'], 0.05, 0.9), tracks: {
      eyeX: [[0, 0], [0.1, -0.7], [0.7, -0.65], [0.85, 0], [1, 0]],
      eyeY: [[0, 0], [0.1, -0.3], [0.7, -0.3], [0.85, 0], [1, 0]],
      headX: hold(-5, 0.25, 0.72),
      headY: hold(5, 0.25, 0.72),
      bodyX: hold(-1, 0.3, 0.72),
      mouthForm: hold(0.3, 0.25, 0.72),
      ...both(hold(0.3, 0.2, 0.72)),
    } },
    peer: { label: '低头抬眼盯着看', duration: 1600, tracks: {
      headY: hold(4, 0.25, 0.75),
      lean: hold(5, 0.25, 0.75),
      eyeY: hold(0.2, 0.2, 0.75),
      eyeOpen: hold(0.3, 0.2, 0.75),
      ...both(hold(0.5, 0.2, 0.75)),
    } },
    lookUp: { label: '抬头', duration: 1500, tracks: { headY: hold(-9, 0.25, 0.72), eyeY: hold(0.3, 0.15, 0.7), ...both(hold(0.25, 0.2, 0.7)) } },
    lookDown: { label: '低头', duration: 1500, tracks: { headY: hold(9, 0.25, 0.72), eyeY: hold(-0.3, 0.15, 0.7) } },
    smirk: { label: '坏笑', duration: 2000, sided: true, expression: during(['屑屑眼'], 0.08, 0.84), tracks: {
      headZ: hold(-6, 0.22, 0.8),
      headY: hold(-4, 0.22, 0.8),
      headX: hold(4, 0.22, 0.8),
      lean: hold(-4, 0.28, 0.8),
      eyeOpen: hold(-0.25, 0.15, 0.8),
      mouthForm: hold(0.7, 0.15, 0.8),
      browL: hold(0.4, 0.15, 0.8),
      browR: hold(-0.2, 0.15, 0.8),
    } },
    swoon: { label: '心动', duration: 2200, expression: during(['爱心眼', '脸红'], 0.05, 0.88), tracks: {
      lean: hold(5, 0.2, 0.8),
      headZ: [[0, 0], [0.25, 5], [0.5, -5], [0.75, 4], [1, 0]],
      bodyX: [[0, 0], [0.25, 1.2], [0.5, -1.2], [0.75, 1], [1, 0]],
      bodyY: [[0, 0], [0.1, 2], [0.25, 0.5], [0.8, 0.5], [1, 0]],
      mouthForm: hold(0.9, 0.12, 0.85),
      ...both(hold(0.5, 0.12, 0.85)),
    } },
    sway: { label: '开心地左右摇摆', duration: 2200, tracks: {
      bodyX: [[0, 0], [0.17, 3], [0.5, -3], [0.83, 3], [1, 0]],
      headZ: [[0, 0], [0.2, 5], [0.53, -5], [0.86, 5], [1, 0]],
      bodyY: [[0, 0], [0.17, 1], [0.33, 0], [0.5, 1], [0.67, 0], [0.83, 1], [1, 0]],
      mouthForm: hold(0.7, 0.1, 0.88),
      eyeSmile: hold(0.6, 0.1, 0.88),
    } },
    stomp: { label: '气得跺脚', duration: 1400, tracks: {
      bodyY: [[0, 0], [0.1, 2], [0.2, -2.5], [0.32, 1.5], [0.44, -2.5], [0.56, 1], [0.68, -2], [0.82, 0], [1, 0]],
      lean: hold(5, 0.15, 0.75),
      headY: hold(3, 0.15, 0.75),
      mouthForm: hold(-0.8, 0.1, 0.8),
      ...both(hold(-0.7, 0.1, 0.8)),
    } },
    leanIn: { label: '凑近看', duration: 1800, tracks: {
      lean: [[0, 0], [0.08, -1.5], [0.28, 9], [0.75, 8.5], [1, 0]],
      headY: hold(-3, 0.28, 0.75),
      eyeOpen: hold(0.3, 0.2, 0.75),
      ...both(hold(0.45, 0.2, 0.75)),
    } },
  }

  /**
   * 情绪：
   *   pose        底姿
   *   sway        身体摆动 { x 左右, z 头跟着倾, y 上下颠, hz 频率 }
   *   expression  模型表情 { eyes 眼型, extra 其它, above 情绪强度高于此值才开 }
   *   energy      活跃度（乘到微动和说话伴随上）
   *   halfLife    半衰期（秒）
   */
  const MOODS = {
    neutral: { label: '平静', pose: {}, energy: 1, halfLife: 1 },
    happy: { label: '开心', energy: 1.35, halfLife: 25,
      pose: { mouthForm: 0.7, eyeSmile: 0.5, browL: 0.25, browR: 0.25, headY: -2.5, bodyY: 0.8 },
      sway: { x: 4, z: 3, y: 1.2, hz: 0.8 } },
    love: { label: '喜欢', energy: 1.2, halfLife: 20,
      pose: { mouthForm: 0.7, browL: 0.3, browR: 0.3, headZ: 3, lean: 4 },
      sway: { x: 3, z: 3.5, y: 0.8, hz: 0.6 },
      expression: { eyes: '爱心眼', extra: ['脸红'], above: 0.4 } },
    shy: { label: '害羞', energy: 0.8, halfLife: 20,
      pose: { headY: 5, headZ: 4, eyeY: -0.25, eyeX: -0.3, browL: 0.2, browR: 0.2, mouthForm: 0.3, lean: 2 },
      sway: { x: 2.5, z: 2, y: 0, hz: 0.4 },
      expression: { extra: ['脸红'], above: 0.35 } },
    sad: { label: '难过', energy: 0.55, halfLife: 30,
      pose: { headY: 8, browL: -0.5, browR: -0.5, mouthForm: -0.7, eyeY: -0.3, eyeOpen: -0.2, bodyY: -2, lean: 6 },
      sway: { x: 1.2, z: 1, y: 0, hz: 0.15 },
      expression: { extra: ['流泪'], above: 0.6 } },
    angry: { label: '生气', energy: 1.15, halfLife: 20,
      pose: { headY: 3, browL: -0.7, browR: -0.7, mouthForm: -0.6, eyeOpen: -0.1, lean: 5 },
      sway: { x: 1, z: 0, y: 0.8, hz: 2.6 },
      expression: { extra: ['黑脸'], above: 0.5 } },
    surprised: { label: '惊讶', energy: 1.2, halfLife: 5,
      pose: { browL: 0.7, browR: 0.7, eyeOpen: 0.35, headY: -3, lean: -5, shock: 0.6 } },
    smug: { label: '得意', energy: 0.9, halfLife: 20,
      pose: { headY: -5, headZ: -4, browL: 0.3, browR: -0.15, mouthForm: 0.6, eyeOpen: -0.2, lean: -5 },
      sway: { x: 3, z: 2.5, y: 0, hz: 0.3 },
      expression: { eyes: '屑屑眼', above: 0.4 } },
    sleepy: { label: '犯困', energy: 0.45, halfLife: 40,
      pose: { headY: 6, eyeOpen: -0.45, browL: -0.2, browR: -0.2, lean: 3 },
      sway: { x: 2.5, z: 3, y: 0, hz: 0.12 } },
    confused: { label: '困惑', energy: 0.9, halfLife: 15,
      pose: { headZ: 7, browL: 0.4, browR: -0.2, mouthForm: -0.2 },
      sway: { x: 0, z: 2.5, y: 0, hz: 0.35 },
      expression: { eyes: '圈圈眼', above: 0.75 } },
    nervous: { label: '紧张', energy: 1.25, halfLife: 15,
      pose: { browL: 0.3, browR: 0.3, eyeX: 0.15, mouthForm: -0.3, headY: 2, lean: -2 },
      sway: { x: 1.5, z: 0.8, y: 0.5, hz: 2 },
      expression: { extra: ['流冷汗'], above: 0.4 } },
  }

  const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0)
  const blank = () => Object.fromEntries(ROLES.map((role) => [role, 0]))
  const follow = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt))

  /** 关键帧采样：相邻两点之间用 smoothstep，首尾钳制 */
  function sample(points, u) {
    if (u <= points[0][0]) return points[0][1]
    for (let i = 1; i < points.length; i += 1) {
      if (u <= points[i][0]) {
        const a = points[i - 1]
        const b = points[i]
        const k = (u - a[0]) / Math.max(1e-6, b[0] - a[0])
        return a[1] + (b[1] - a[1]) * k * k * (3 - 2 * k)
      }
    }
    return points[points.length - 1][1]
  }

  function mirrorTracks(tracks) {
    const out = {}
    for (const [role, points] of Object.entries(tracks)) {
      const target = role === 'browL' ? 'browR' : role === 'browR' ? 'browL' : role
      out[target] = MIRRORED.includes(role) ? points.map(([t, v]) => [t, -v]) : points
    }
    return out
  }

  const list = (table) => Object.entries(table).map(([id, item]) => ({ id, label: item.label }))

  function create(options = {}) {
    const random = typeof options.random === 'function' ? options.random : Math.random
    const active = []
    const mood = { name: 'neutral', intensity: 0 }
    const moodPose = blank()
    const sway = { x: 0, z: 0, y: 0, hz: 0.5, phase: random() * TAU }
    let energy = 1

    /**
     * 播放一个手势。
     * @param {string} name
     * @param {{intensity?: number, side?: 'left'|'right'}} opts
     * @returns {boolean} 是否认识这个手势
     */
    function play(name, opts = {}) {
      if (!Object.hasOwn(GESTURES, name)) return false
      const gesture = GESTURES[name]
      const intensity = Number.isFinite(opts.intensity) ? clamp01(opts.intensity) : 1
      let tracks = gesture.tracks
      if (gesture.sided) {
        const left = opts.side === 'left' || (opts.side !== 'right' && random() < 0.5)
        if (left) tracks = mirrorTracks(tracks)
      }
      // 同名手势重播时替换旧的；总数有上限，避免叠出夸张姿势
      const same = active.findIndex((item) => item.name === name)
      if (same >= 0) active.splice(same, 1)
      while (active.length >= MAX_ACTIVE) active.shift()
      active.push({
        name, tracks, elapsed: 0,
        expression: intensity > 0.3 ? gesture.expression || null : null,
        duration: gesture.duration * (0.92 + random() * 0.16) / 1000,
        scale: intensity * (0.88 + random() * 0.24),
      })
      return true
    }

    /** 设定情绪；强度 0..1，之后按半衰期衰减回平静 */
    function setMood(name, intensity = 0.8) {
      if (!Object.hasOwn(MOODS, name)) return false
      mood.name = name
      mood.intensity = name === 'neutral' ? 0 : clamp01(Number.isFinite(intensity) ? intensity : 0.8)
      return true
    }

    /**
     * @returns {{pose: object, energy: number, expressions: string[]}}
     *   本帧各通道叠加量、活跃度倍率、此刻应当打开的模型表情名
     */
    function step(dt) {
      const delta = Math.max(0, Math.min(0.1, Number(dt) || 0))
      const current = MOODS[mood.name]
      mood.intensity *= Math.pow(0.5, delta / current.halfLife)
      if (mood.intensity < 0.03) {
        mood.name = 'neutral'
        mood.intensity = 0
      }
      const target = MOODS[mood.name]
      energy = follow(energy, 1 + (target.energy - 1) * mood.intensity, 1.5, delta)
      const pose = blank()
      for (const role of ROLES) {
        moodPose[role] = follow(moodPose[role], (target.pose[role] || 0) * mood.intensity, 2.5, delta)
        pose[role] = moodPose[role]
      }

      // 情绪的身体摆动：身体左右摆，头滞后一点跟着倾，每摆一次上下颠两下
      const wish = target.sway || { x: 0, z: 0, y: 0, hz: sway.hz }
      sway.x = follow(sway.x, wish.x * mood.intensity, 2, delta)
      sway.z = follow(sway.z, wish.z * mood.intensity, 2, delta)
      sway.y = follow(sway.y, wish.y * mood.intensity, 2, delta)
      sway.hz = follow(sway.hz, wish.hz, 2, delta)
      sway.phase = (sway.phase + TAU * sway.hz * delta) % TAU
      pose.bodyX += sway.x * Math.sin(sway.phase)
      pose.headZ += sway.z * Math.sin(sway.phase - 0.6)
      pose.bodyY += sway.y * (1 - Math.cos(sway.phase * 2)) / 2

      const names = []
      for (let i = active.length - 1; i >= 0; i -= 1) {
        const item = active[i]
        item.elapsed += delta
        const t = item.elapsed / item.duration
        if (t >= 1) {
          active.splice(i, 1)
          continue
        }
        for (const [role, points] of Object.entries(item.tracks)) {
          const u = clamp01((t * (1 + MAX_LAG) - LAG[role]))
          pose[role] += sample(points, u) * item.scale * (GAIN[role] || 1)
        }
        // 倒序遍历：后播的手势先登记，眼型冲突时以它为准
        if (item.expression && t >= item.expression.from && t <= item.expression.to) names.push(...item.expression.names)
      }
      const wanted = target.expression
      if (wanted && mood.intensity > wanted.above) {
        if (wanted.eyes) names.push(wanted.eyes)
        for (const name of wanted.extra || []) names.push(name)
      }
      const expressions = []
      let eyes = false
      for (const name of names) {
        if (expressions.includes(name)) continue
        if (EYE_EXPRESSIONS.includes(name)) {
          if (eyes) continue
          eyes = true
        }
        expressions.push(name)
      }
      return { pose, energy, expressions }
    }

    return {
      play, setMood, step,
      get mood() { return { name: mood.name, intensity: mood.intensity } },
      get playing() { return active.map((item) => item.name) },
    }
  }

  return { ROLES, GESTURES, MOODS, GAIN, EYE_EXPRESSIONS, gestures: () => list(GESTURES), moods: () => list(MOODS), create, sample }
})
