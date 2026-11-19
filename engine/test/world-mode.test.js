/**
 * 小世界模式状态机测试：进出、出帧、事件、暂停、恢复原窗口。
 * 运行：node engine/test/world-mode.test.js
 */
'use strict'

const assert = require('node:assert/strict')
const { createWorldMode, WORLD_SIZE, MIN_SIZE } = require('../../electron/world-mode')

let passed = 0
function test(name, fn) {
  fn()
  passed += 1
  console.log('ok -', name)
}

function seeded(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const AREA = { x: 0, y: 0, width: 1920, height: 1040 }
const BIG_BOUNDS = { x: 1400, y: 300, width: 870, height: 1114 }

function makeBox(extra = {}) {
  return createWorldMode({ area: AREA, bounds: BIG_BOUNDS, random: seeded(11), ...extra })
}

test('进入世界模式：窗口收成小方块，落在原窗口中心附近', () => {
  const mode = makeBox()
  const result = mode.enter({ area: AREA, bounds: BIG_BOUNDS, now: 1000 })
  assert.equal(result.ok, true)
  assert.equal(result.bounds.width, WORLD_SIZE.width)
  assert.equal(result.bounds.height, WORLD_SIZE.height)
  // 原窗口中心 x ≈ 1835，收小后中心应该还在这附近（被夹在屏幕内）
  const centerX = result.bounds.x + WORLD_SIZE.width / 2
  assert.ok(Math.abs(centerX - 1835) < 120, 'centerX ' + centerX)
  assert.equal(result.restore.width, 870)
  assert.equal(mode.status().active, true)
})

test('重复进入 / 未进入就退出 都有明确拒绝原因', () => {
  const mode = makeBox()
  assert.deepEqual(mode.exit(), { ok: false, code: 'NOT_ACTIVE' })
  mode.enter({ area: AREA, bounds: BIG_BOUNDS, now: 0 })
  assert.deepEqual(mode.enter({ area: AREA, bounds: BIG_BOUNDS, now: 0 }), { ok: false, code: 'ALREADY_ACTIVE' })
  assert.equal(mode.exit().ok, true)
  assert.equal(mode.status().active, false)
})

test('工作区非法时不进模式', () => {
  const mode = makeBox()
  assert.equal(mode.enter({ area: null, bounds: BIG_BOUNDS }).code, 'AREA_INVALID')
  assert.equal(mode.enter({ area: { x: 0, y: 0, width: 0, height: 0 }, bounds: BIG_BOUNDS }).code, 'AREA_INVALID')
  assert.equal(mode.status().active, false)
})

test('小屏上不会把窗口收得比最小尺寸还小', () => {
  const mode = createWorldMode({ size: { width: 10, height: 10 }, random: seeded(2) })
  const result = mode.enter({ area: AREA, bounds: BIG_BOUNDS })
  assert.equal(result.bounds.width, MIN_SIZE.width)
  assert.equal(result.bounds.height, MIN_SIZE.height)
})

test('推进时给出新的窗口位置，且始终在工作区内', () => {
  const mode = makeBox()
  mode.enter({ area: AREA, bounds: BIG_BOUNDS, now: 0 })
  let now = 0
  let moved = 0
  for (let i = 0; i < 400; i += 1) {
    now += 33
    const frame = mode.frame({ now, dtMs: 33, pace: 1 })
    if (frame.bounds) {
      moved += 1
      assert.ok(frame.bounds.x >= AREA.x, 'x 越界 ' + frame.bounds.x)
      assert.ok(frame.bounds.y >= AREA.y, 'y 越界 ' + frame.bounds.y)
      assert.ok(frame.bounds.x + frame.bounds.width <= AREA.x + AREA.width, '右边越界')
      assert.ok(frame.bounds.y + frame.bounds.height <= AREA.y + AREA.height, '下边越界')
      assert.equal(frame.bounds.width, WORLD_SIZE.width)
    }
  }
  assert.ok(moved > 0, '应该有移动帧')
})

test('未进入模式时出帧是空转', () => {
  const mode = makeBox()
  const frame = mode.frame({ now: 0, dtMs: 16 })
  assert.deepEqual(frame, { active: false, bounds: null, events: [] })
})

test('暂停时不移动也不发事件', () => {
  const mode = makeBox()
  mode.enter({ area: AREA, bounds: BIG_BOUNDS, now: 0 })
  let now = 0
  for (let i = 0; i < 60; i += 1) {
    now += 33
    const frame = mode.frame({ now, dtMs: 33, paused: true })
    assert.equal(frame.bounds, null)
    assert.equal(frame.events.length, 0)
    assert.equal(frame.paused, true)
  }
})

test('自娱自乐：待机结束后发 world-idle，并自动安排下一段路', () => {
  const events = []
  const mode = createWorldMode({
    random: seeded(3),
    onEvent: (event) => events.push(event.type),
    area: AREA,
    bounds: BIG_BOUNDS,
  })
  mode.enter({ area: AREA, bounds: BIG_BOUNDS, now: 0 })
  let now = 0
  let sawIdle = false
  for (let i = 0; i < 3000 && !sawIdle; i += 1) {
    now += 33
    const frame = mode.frame({ now, dtMs: 33, pace: 1 })
    if (frame.events.some((event) => event.type === 'world-idle')) sawIdle = true
  }
  assert.equal(sawIdle, true, '60 秒内应该至少自己玩一次')
  assert.ok(events.includes('world-idle') || events.includes('world-arrived'))
  // idle 之后应该重新在走
  const after = mode.frame({ now: now + 33, dtMs: 33, pace: 1 })
  assert.equal(after.active, true)
})

test('到点会发 world-arrived', () => {
  const events = []
  const mode = createWorldMode({ random: seeded(4), onEvent: (e) => events.push(e.type), area: AREA, bounds: BIG_BOUNDS })
  mode.enter({ area: AREA, bounds: BIG_BOUNDS, now: 0 })
  let now = 0
  for (let i = 0; i < 2000 && !events.includes('world-arrived'); i += 1) {
    now += 33
    mode.frame({ now, dtMs: 33, pace: 1 })
  }
  assert.ok(events.includes('world-arrived'), '应该有到点事件')
})

test('退出模式还原原来的窗口尺寸', () => {
  const mode = makeBox()
  mode.enter({ area: AREA, bounds: BIG_BOUNDS, now: 0 })
  const result = mode.exit()
  assert.equal(result.ok, true)
  assert.deepEqual(result.restore, BIG_BOUNDS)
  assert.equal(mode.status().active, false)
})

test('用户拖动会中断当前这一段路', () => {
  const mode = makeBox()
  mode.enter({ area: AREA, bounds: BIG_BOUNDS, now: 0 })
  mode.frame({ now: 33, dtMs: 33 })
  const synced = mode.syncPosition({ x: 300, y: 400 })
  assert.equal(synced.ok, true)
  assert.equal(synced.moving, false)
  assert.equal(synced.target, null)
  assert.ok(Math.abs(synced.x - 300) <= 1)
})

test('换分辨率后位置被重新夹紧', () => {
  const mode = makeBox()
  mode.enter({ area: AREA, bounds: BIG_BOUNDS, now: 0 })
  const result = mode.updateArea({ x: 0, y: 0, width: 800, height: 600 })
  assert.equal(result.ok, true)
  assert.ok(result.x + WORLD_SIZE.width <= 800, 'x ' + result.x)
  assert.ok(result.y + WORLD_SIZE.height <= 600, 'y ' + result.y)
})

test('事件回调抛异常不会打断漫游', () => {
  const mode = createWorldMode({
    random: seeded(5),
    onEvent: () => { throw new Error('boom') },
    area: AREA,
    bounds: BIG_BOUNDS,
  })
  mode.enter({ area: AREA, bounds: BIG_BOUNDS, now: 0 })
  let now = 0
  for (let i = 0; i < 300; i += 1) {
    now += 33
    const frame = mode.frame({ now, dtMs: 33, pace: 1 })
    assert.equal(frame.active, true)
  }
  assert.equal(mode.status().active, true)
})

test('睡眠唤醒的超大 dt 也被夹住', () => {
  const mode = makeBox()
  mode.enter({ area: AREA, bounds: BIG_BOUNDS, now: 0 })
  const before = mode.status().roamer
  const frame = mode.frame({ now: 60000, dtMs: 60000, pace: 1 })
  if (frame.bounds) {
    const moved = Math.hypot(frame.bounds.x - before.x, frame.bounds.y - before.y)
    assert.ok(moved < 80, '一次最多走 ' + moved + 'px')
  }
})

console.log('\n' + passed + ' passed')
