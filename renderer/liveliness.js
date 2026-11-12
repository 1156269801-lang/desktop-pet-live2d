'use strict'

/**
 * 生动层：不依赖模型调用的两类持续动作，输出的是"叠加量"而不是绝对值。
 *
 *   micro   不自主微动。头、身体、眉毛的慢漂移（频率互不整除，不会循环），
 *           加上眼球的小幅扫视。幅度在 1 度级：看不出在动，但画面不僵。
 *   speech  说话伴随。按语音音量包络检测重音，重音处点一下头并换一侧
 *           微转/微倾，眉毛随音量抬起；说完后回正。
 *
 * 头部和身体的单位是"假设参数范围为 ±30 时的度数"，眼球和眉毛是 -1..1。
 * 调用方按各参数的真实范围换算，再加到当前值上（所以不会覆盖表情、动作、视线）。
 *
 * 浏览器里挂在 window.PetLiveliness；node 里 module.exports（测试用）。
 */
;(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.PetLiveliness = api
})(typeof self !== 'undefined' ? self : this, function () {
  const ROLES = ['headX', 'headY', 'headZ', 'bodyX', 'eyeX', 'eyeY', 'browL', 'browR']
  const TAU = Math.PI * 2
  /** 弹簧积分的固定步长：结果与帧率基本无关 */
  const SUBSTEP = 1 / 120
  /** 两次重音点头之间的最短间隔（秒） */
  const ACCENT_GAP = 0.42

  const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0)
  const blank = () => ({ headX: 0, headY: 0, headZ: 0, bodyX: 0, eyeX: 0, eyeY: 0, browL: 0, browR: 0 })
  /** 指数逼近，与帧率无关 */
  const follow = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt))

  function create(options = {}) {
    const random = typeof options.random === 'function' ? options.random : Math.random
    // 每次启动相位不同，避免每次打开都从同一个姿势开始
    const phase = Array.from({ length: 10 }, () => random() * TAU)
    const saccade = { x: 0, y: 0, targetX: 0, targetY: 0, wait: 0.8 + random() * 1.5 }
    const speech = {
      weight: 0, // 说话状态的渐入渐出
      loud: 0, // 平滑后的音量
      slow: 0, // 慢速平均，用来判断"比刚才明显更响"
      sinceAccent: 10,
      side: random() < 0.5 ? -1 : 1,
      nod: 0, nodVelocity: 0, // 点头：欠阻尼弹簧，带一点回弹
      turn: 0, turnTarget: 0,
      tilt: 0, tiltTarget: 0,
    }

    function stepSaccade(dt) {
      saccade.wait -= dt
      if (saccade.wait <= 0) {
        saccade.targetX = (random() * 2 - 1) * 0.05
        saccade.targetY = (random() * 2 - 1) * 0.03
        saccade.wait = 1.2 + random() * 2.8
      }
      // 扫视是跳过去的，不是滑过去的
      saccade.x = follow(saccade.x, saccade.targetX, 30, dt)
      saccade.y = follow(saccade.y, saccade.targetY, 30, dt)
    }

    function stepSpeech(dt, speaking, level) {
      speech.weight = follow(speech.weight, speaking ? 1 : 0, speaking ? 6 : 3, dt)
      speech.loud = follow(speech.loud, speaking ? level : 0, level > speech.loud ? 28 : 9, dt)
      speech.slow = follow(speech.slow, speaking ? level : 0, 2.2, dt)
      speech.sinceAccent += dt
      if (speaking && level > 0.5 && level - speech.slow > 0.22 && speech.sinceAccent > ACCENT_GAP) {
        speech.sinceAccent = 0
        speech.nodVelocity += 60 * level
        // 每个重音换一侧，幅度带随机：同一句话不会点出一样的头
        speech.side = -speech.side
        speech.turnTarget = speech.side * (0.7 + random() * 1.3)
        speech.tiltTarget = -speech.side * (0.5 + random() * 0.9)
      }
      if (!speaking) {
        speech.turnTarget = 0
        speech.tiltTarget = 0
      }
      // 点头弹簧：刚度 120、阻尼 14（阻尼比约 0.64，过冲后轻微回弹）
      let remaining = dt
      while (remaining > 1e-6) {
        const h = Math.min(SUBSTEP, remaining)
        speech.nodVelocity += (-120 * speech.nod - 14 * speech.nodVelocity) * h
        speech.nod += speech.nodVelocity * h
        remaining -= h
      }
      speech.turn = follow(speech.turn, speech.turnTarget, 3.2, dt)
      speech.tilt = follow(speech.tilt, speech.tiltTarget, 2.6, dt)
    }

    /**
     * @param {number} t   秒，单调递增
     * @param {number} dt  距上一帧的秒数
     * @param {{speaking?: boolean, level?: number, nodSign?: number}} input
     *        level    当前语音音量 0..1
     *        nodSign  "低头"在该模型头部俯仰参数上的方向（+1 或 -1）
     * @returns {{micro: object, speech: object}} 两层各自的叠加量
     */
    function step(t, dt, input = {}) {
      const delta = Math.max(0, Math.min(0.1, Number(dt) || 0))
      const speaking = Boolean(input.speaking)
      const level = clamp01(Number(input.level) || 0)
      const nodSign = input.nodSign === -1 ? -1 : 1
      stepSaccade(delta)
      stepSpeech(delta, speaking, level)

      const micro = blank()
      micro.headX = Math.sin(t * 0.37 + phase[0]) * 0.55 + Math.sin(t * 0.83 + phase[1]) * 0.3
      micro.headY = Math.sin(t * 0.29 + phase[2]) * 0.6 + Math.sin(t * 0.71 + phase[3]) * 0.25
      micro.headZ = Math.sin(t * 0.43 + phase[4]) * 0.9 + Math.sin(t * 1.13 + phase[5]) * 0.4
      micro.bodyX = Math.sin(t * 0.21 + phase[6]) * 0.45
      micro.eyeX = Math.sin(t * 0.61 + phase[7]) * 0.02 + saccade.x
      micro.eyeY = saccade.y
      // 两边眉毛相位错开，不同步
      micro.browL = Math.sin(t * 0.52 + phase[8]) * 0.055 + Math.sin(t * 1.31 + phase[9]) * 0.028
      micro.browR = Math.sin(t * 0.52 + phase[8] + 0.35) * 0.045 + Math.sin(t * 1.19 + phase[9] + 1.4) * 0.024

      const out = blank()
      const w = speech.weight
      // 重音处低头；说话时随音量略微抬头，两者方向相反，形成起伏
      out.headY = nodSign * (speech.nod - w * speech.loud * 0.9)
      out.headX = speech.turn
      out.headZ = speech.tilt
      out.bodyX = speech.turn * 0.25
      const brow = w * (0.05 + speech.loud * 0.2)
      out.browL = brow
      out.browR = brow
      return { micro, speech: out }
    }

    return { step }
  }

  return { ROLES, create }
})
