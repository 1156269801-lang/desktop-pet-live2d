'use strict'
// 「小世界模式」的状态机：进出模式、把 roamer 的出帧结果翻译成给主进程的指令。
// 这里不碰 Electron：main.js 拿到 frame() 的 bounds 后自己 setBounds。
//
// 关键约定：
// 1. 世界模式下窗口收成一个小方块，模型才好在桌面上爬；
// 2. 用户一交互就立刻暂停，别让窗口在手里乱跑；
// 3. 主进程只发「时机」事件，具体播什么动作由渲染层按模型能力自己挑。

const { createRoamer } = require('./roamer')

const WORLD_SIZE = Object.freeze({ width: 260, height: 300 })
const MIN_SIZE = Object.freeze({ width: 220, height: 240 })
const FRAME_MS = 33 // ≈30fps，再高 Windows 上 setBounds 会明显掉帧

function createWorldMode(options = {}) {
  const size = {
    width: Math.max(MIN_SIZE.width, Math.round(Number(options.size?.width) || WORLD_SIZE.width)),
    height: Math.max(MIN_SIZE.height, Math.round(Number(options.size?.height) || WORLD_SIZE.height)),
  }
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {}
  let roamer = null
  let active = false
  let restore = null
  let lastIdleAt = 0

  function makeRoamer(area, position) {
    return createRoamer({
      area,
      size,
      x: position ? position.x : area.x,
      y: position ? position.y : area.y,
      random: options.random,
    })
  }

  /** 进世界模式：记住原来的窗口尺寸，等退出时原样还回去。 */
  function enter({ area, bounds, now = Date.now() } = {}) {
    if (active) return { ok: false, code: 'ALREADY_ACTIVE' }
    if (!area || !(area.width > 0) || !(area.height > 0)) return { ok: false, code: 'AREA_INVALID' }
    const from = bounds && Number.isFinite(bounds.x) && Number.isFinite(bounds.y)
      ? { x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height) }
      : null
    restore = from
    // 以当前窗口中心为锚点收小，宠物不会"跳"到别处
    const anchorX = from ? from.x + from.width / 2 : area.x + area.width / 2
    const anchorY = from ? from.y + from.height * 0.52 : area.y + area.height * 0.6
    roamer = makeRoamer(area, { x: Math.round(anchorX - size.width / 2), y: Math.round(anchorY - size.height * 0.52) })
    active = true
    lastIdleAt = now
    // 一进模式就开始溜达，否则会先站着不动等到有人叫它
    roamer.retarget(now)
    const start = roamer.status()
    return {
      ok: true,
      bounds: { x: start.x, y: start.y, width: size.width, height: size.height },
      size: { ...size },
      restore,
    }
  }

  function exit() {
    if (!active) return { ok: false, code: 'NOT_ACTIVE' }
    active = false
    roamer = null
    const back = restore
    restore = null
    return { ok: true, restore: back }
  }

  function syncPosition(position) {
    if (!active || !roamer) return { ok: false, code: 'NOT_ACTIVE' }
    roamer.setPosition(position)
    return { ok: true, ...roamer.status() }
  }

  function updateArea(area) {
    if (!active || !roamer) return { ok: false, code: 'NOT_ACTIVE' }
    roamer.setArea(area)
    return { ok: true, ...roamer.status() }
  }

  /**
   * 推进一帧。
   * 返回 { active, bounds?, events }，bounds 只在真的移动时给出，
   * 避免每帧都 setBounds 把窗口消息队列打满。
   */
  function frame({ now = Date.now(), dtMs = FRAME_MS, paused = false, pace = 1 } = {}) {
    if (!active || !roamer) return { active: false, bounds: null, events: [] }
    const events = []
    const settled = roamer.step(dtMs, { now, paused, pace })

    if (settled.paused) return { active: true, bounds: null, events, paused: true }

    if (settled.arrived) {
      events.push({ type: 'world-arrived', at: now })
    }
    if (settled.idleDone) {
      // 站着没事干的时间到了：让渲染层自己挑一个"自娱自乐"的动作，
      // 然后立刻安排下一段路，别让它一直杵在同一个地方。
      events.push({ type: 'world-idle', at: now, since: lastIdleAt })
      lastIdleAt = now
      roamer.retarget(now)
    }

    const bounds = settled.moving
      ? { x: settled.x, y: settled.y, width: size.width, height: size.height }
      : null
    for (const event of events) {
      try { onEvent(event) } catch { /* 事件回调失败不影响漫游 */ }
    }
    return {
      active: true,
      bounds,
      events,
      moving: Boolean(settled.moving),
      facing: settled.facing || 0,
      speed: settled.speed || 0,
    }
  }

  function status() {
    return {
      active,
      size: { ...size },
      restore: restore ? { ...restore } : null,
      roamer: active && roamer ? roamer.status() : null,
    }
  }

  return Object.freeze({ enter, exit, frame, syncPosition, updateArea, status })
}

module.exports = { createWorldMode, WORLD_SIZE, MIN_SIZE, FRAME_MS }
