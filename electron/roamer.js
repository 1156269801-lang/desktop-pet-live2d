'use strict'
// 桌面漫游调度：只负责算「窗口该挪到哪儿」，不直接调 Electron。
// 调用方拿到 step() 的结果后自己 setPosition，并按 moving/arrived/idleDone
// 决定播什么动作、要不要自言自语。纯函数化，方便在 headless 下跑测试。

const DEFAULTS = Object.freeze({
  speed: 155,        // 像素/秒，基准速度
  accel: 900,        // 像素/秒²，起步和刹车的平滑
  margin: 16,        // 窗户距离工作区边缘的留白
  arriveEpsilon: 2,  // 判定到点
  idleMinMs: 2600,
  idleMaxMs: 7800,
  groundBias: 0.55,  // 目标点偏向屏幕下方的概率（「地面」感）
})

const num = (v, fallback) => (Number.isFinite(v) ? v : fallback)

function createRoamer(options = {}) {
  const cfg = {
    speed: num(options.speed, DEFAULTS.speed),
    accel: num(options.accel, DEFAULTS.accel),
    margin: num(options.margin, DEFAULTS.margin),
    idleMinMs: num(options.idleMinMs, DEFAULTS.idleMinMs),
    idleMaxMs: num(options.idleMaxMs, DEFAULTS.idleMaxMs),
    groundBias: num(options.groundBias, DEFAULTS.groundBias),
  }
  const random = typeof options.random === 'function' ? options.random : Math.random

  let area = normalizeArea(options.area)
  let size = normalizeSize(options.size)
  let x = num(options.x, area.x)
  let y = num(options.y, area.y)
  let target = null
  let velocity = 0
  let idleUntil = 0
  let moving = false

  // 构造时传进来的坐标可能来自旧分辨率或旧窗口尺寸，先夹一遍再开工
  x = clampX(x)
  y = clampY(y)

  function normalizeArea(value) {
    const v = value && typeof value === 'object' ? value : {}
    return {
      x: Math.round(num(v.x, 0)),
      y: Math.round(num(v.y, 0)),
      width: Math.max(1, Math.round(num(v.width, 1280))),
      height: Math.max(1, Math.round(num(v.height, 720))),
    }
  }

  function normalizeSize(value) {
    const v = value && typeof value === 'object' ? value : {}
    return {
      width: Math.max(1, Math.round(num(v.width, 260))),
      height: Math.max(1, Math.round(num(v.height, 300))),
    }
  }

  /** 窗口整个留在工作区内，不做半出屏——爬行时模型被裁一半很难看。 */
  function limits() {
    const left = area.x + cfg.margin
    const top = area.y + cfg.margin
    const right = area.x + area.width - size.width - cfg.margin
    const bottom = area.y + area.height - size.height - cfg.margin
    return {
      minX: left,
      maxX: Math.max(left, right),
      minY: Math.min(top, bottom),
      maxY: Math.max(top, bottom),
    }
  }

  function clampX(value) {
    const l = limits()
    return Math.min(l.maxX, Math.max(l.minX, Math.round(value)))
  }

  function clampY(value) {
    const l = limits()
    return Math.min(l.maxY, Math.max(l.minY, Math.round(value)))
  }

  // 内部位置必须留浮点：最后一两像素如果每帧都四舍五入，位移会被吃掉，
  // 宠物会卡在离目标 10px 的地方一直"走"。取整只发生在对外输出。
  function clampXf(value) {
    const l = limits()
    return Math.min(l.maxX, Math.max(l.minX, value))
  }

  function clampYf(value) {
    const l = limits()
    return Math.min(l.maxY, Math.max(l.minY, value))
  }

  function pickTarget() {
    const l = limits()
    // 横向自由；纵向按 groundBias 偏向下方那一段，读起来像「在地上爬」
    const spanX = l.maxX - l.minX
    const spanY = l.maxY - l.minY
    const groundTop = l.minY + spanY * (1 - 0.45)
    const useGround = spanY > 40 && random() < cfg.groundBias
    const ty = useGround
      ? Math.round(groundTop + (l.maxY - groundTop) * random())
      : Math.round(l.minY + spanY * random())
    const tx = Math.round(l.minX + spanX * random())
    return { x: clampX(tx), y: clampY(ty) }
  }

  function setArea(next) {
    area = normalizeArea(next)
    x = clampX(x)
    y = clampY(y)
    if (moving && target) target = { x: clampX(target.x), y: clampY(target.y) }
    return { x, y }
  }

  function setSize(next) {
    size = normalizeSize(next)
    x = clampX(x)
    y = clampY(y)
    return { x, y }
  }

  function setPosition(next) {
    x = clampX(num(next && next.x, x))
    y = clampY(num(next && next.y, y))
    if (moving) { moving = false; target = null; velocity = 0 }
    return { x, y }
  }

  /** 开始一次新的漫游。距离太近就再来一次，免得原地抖。 */
  function retarget(nowMs) {
    let next = pickTarget()
    for (let i = 0; i < 4; i += 1) {
      const dx = next.x - x
      const dy = next.y - y
      if (Math.hypot(dx, dy) > 60) break
      next = pickTarget()
    }
    target = next
    moving = true
    idleUntil = 0
    velocity = 0
    return {
      target: { ...target },
      distance: Math.round(Math.hypot(target.x - x, target.y - y)),
      startedAt: num(nowMs, 0),
    }
  }

  /**
   * 推进一帧。
   * dtMs 夹在 1..250，避免睡眠唤醒后一次跳很远。
   * pace 来自 life-state（夜晚 0.35~2），用来让夜里爬得慢。
   */
  function step(dtMs, ctx = {}) {
    const dt = Math.min(250, Math.max(1, num(dtMs, 16))) / 1000
    const nowMs = num(ctx.now, 0)
    const pos = () => ({ x: Math.round(x), y: Math.round(y) })

    if (ctx.paused) {
      velocity = 0
      return { ...pos(), moving: false, arrived: false, idleDone: false, paused: true }
    }

    if (!moving) {
      const idleDone = idleUntil > 0 && nowMs >= idleUntil
      if (idleDone) idleUntil = 0
      return { ...pos(), moving: false, arrived: false, idleDone }
    }

    if (!target) {
      moving = false
      return { ...pos(), moving: false, arrived: false, idleDone: false }
    }

    const dx = target.x - x
    const dy = target.y - y
    const distance = Math.hypot(dx, dy)
    if (distance <= DEFAULTS.arriveEpsilon) {
      x = target.x
      y = target.y
      moving = false
      velocity = 0
      target = null
      const idleSpan = Math.max(0, cfg.idleMaxMs - cfg.idleMinMs)
      idleUntil = nowMs + cfg.idleMinMs + Math.round(idleSpan * random())
      return { ...pos(), moving: false, arrived: true, idleDone: false }
    }

    const pace = Math.min(3, Math.max(0.05, num(ctx.pace, 1)))
    // 快到时自动减速，到点前不会一脚急刹
    const brakeWindow = 90
    const targetSpeed = distance < brakeWindow
      ? Math.max(10, (cfg.speed * pace) * (distance / brakeWindow))
      : cfg.speed * pace

    const maxDelta = cfg.accel * dt
    if (velocity < targetSpeed) velocity = Math.min(targetSpeed, velocity + maxDelta)
    else velocity = Math.max(targetSpeed, velocity - maxDelta)

    const travel = velocity * dt
    if (travel >= distance) {
      x = target.x
      y = target.y
    } else {
      const ratio = travel / distance
      x = clampXf(x + dx * ratio)
      y = clampYf(y + dy * ratio)
    }
    const facing = Math.abs(dx) < 2 ? 0 : Math.sign(dx)

    return {
      ...pos(),
      moving: true,
      arrived: false,
      idleDone: false,
      facing,
      speed: Math.round(velocity),
      distanceLeft: Math.round(Math.hypot(target.x - x, target.y - y)),
    }
  }

  function status() {
    return {
      x: Math.round(x),
      y: Math.round(y),
      moving,
      target: target ? { ...target } : null,
      idleUntil,
      area: { ...area },
      size: { ...size },
    }
  }

  return Object.freeze({ step, retarget, setArea, setSize, setPosition, status })
}

module.exports = { createRoamer, DEFAULTS }
