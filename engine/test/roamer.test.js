/**
 * 桌面漫游调度测试：目标点、移动、到点、暂停、跨屏边界。
 * 运行：node engine/test/roamer.test.js
 */
'use strict'

const assert = require('node:assert/strict')
const { createRoamer } = require('../../electron/roamer')

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
const SIZE = { width: 260, height: 300 }

function make(extra = {}) {
  return createRoamer({ area: AREA, size: SIZE, random: seeded(7), ...extra })
}

/** 一直推进到到点，最多 maxSeconds 秒 */
function runToArrive(roamer, { fps = 30, maxSeconds = 30, pace = 1, now0 = 0 } = {}) {
  const dt = 1000 / fps
  let now = now0
  const frames = []
  for (let i = 0; i < maxSeconds * fps; i += 1) {
    now += dt
    const frame = roamer.step(dt, { now, pace })
    frames.push(frame)
    if (frame.arrived) return { frames, now, arrived: true }
  }
  return { frames, now, arrived: false }
}

test('初始位置夹在工作区内', () => {
  const roamer = make({ x: -9999, y: 99999 })
  const status = roamer.status()
  assert.ok(status.x >= AREA.x + 16)
  assert.ok(status.y >= AREA.y + 16)
  assert.ok(status.x <= AREA.width - SIZE.width - 16)
  assert.ok(status.y <= AREA.height - SIZE.height - 16)
})

test('目标点永远在可用范围内', () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const roamer = createRoamer({ area: AREA, size: SIZE, random: seeded(seed) })
    roamer.retarget(0)
    const target = roamer.status().target
    assert.ok(target.x >= AREA.x + 16 && target.x <= AREA.width - SIZE.width - 16, 'x ' + target.x)
    assert.ok(target.y >= AREA.y + 16 && target.y <= AREA.height - SIZE.height - 16, 'y ' + target.y)
  }
})

test('一次漫游能走到目标点并停下', () => {
  const roamer = make()
  roamer.retarget(0)
  const { frames, arrived } = runToArrive(roamer)
  assert.equal(arrived, true, '30 秒内应该走到')
  const last = frames[frames.length - 1]
  const target = roamer.status().target
  assert.equal(last.moving, false)
  assert.equal(last.idleDone, false)
  // 停下时位置就是目标点（target 已被清空）
  assert.equal(target, null)
})

test('移动过程中不会越来越远，也不会来回抖', () => {
  const roamer = make()
  roamer.retarget(0)
  const { frames } = runToArrive(roamer)
  const distances = frames.filter((f) => f.moving).map((f) => f.distanceLeft)
  assert.ok(distances.length > 0, '应该有移动帧')
  for (let i = 1; i < distances.length; i += 1) {
    assert.ok(distances[i] <= distances[i - 1] + 1, '距离不该变大: ' + distances[i - 1] + ' → ' + distances[i])
  }
  assert.ok(distances[distances.length - 1] <= 3, '最后应该贴到目标点附近')
})

test('到点后进入待机，待机时间到给出 idleDone', () => {
  const roamer = make()
  roamer.retarget(0)
  const { now } = runToArrive(roamer)
  // 刚停下：不是 idleDone
  const justIdle = roamer.step(16, { now: now + 10 })
  assert.equal(justIdle.idleDone, false)
  assert.equal(justIdle.moving, false)
  // 待机上限 7.8 秒之后再问一次，必然已经到点
  const laterIdle = roamer.step(16, { now: now + 9000 })
  assert.equal(laterIdle.idleDone, true)
  // idleDone 只报一次
  assert.equal(roamer.step(16, { now: now + 9016 }).idleDone, false)
})

test('paused 时一步都不走', () => {
  const roamer = make()
  roamer.retarget(0)
  const before = roamer.status()
  for (let i = 0; i < 60; i += 1) {
    const frame = roamer.step(16, { now: i * 16, paused: true, pace: 1 })
    assert.equal(frame.moving, false)
    assert.equal(frame.x, before.x)
    assert.equal(frame.y, before.y)
  }
  // 解除暂停后还能继续走
  assert.equal(roamer.step(16, { now: 2000, pace: 1 }).moving, true)
})

test('睡眠唤醒的超大 dt 被夹住，不会瞬移', () => {
  const roamer = make()
  roamer.retarget(0)
  const start = roamer.status()
  const frame = roamer.step(60_000, { now: 60_000, pace: 1 })
  const moved = Math.hypot(frame.x - start.x, frame.y - start.y)
  // 250ms 上限 × 155px/s ≈ 39px，留点余量
  assert.ok(moved < 60, '一次最多走 ' + moved + 'px')
})

test('pace 越小走得越慢', () => {
  const measure = (pace) => {
    const roamer = make()
    roamer.retarget(0)
    const start = roamer.status()
    let now = 0
    for (let i = 0; i < 30; i += 1) {
      now += 1000 / 30
      roamer.step(1000 / 30, { now, pace })
    }
    const end = roamer.status()
    return Math.hypot(end.x - start.x, end.y - start.y)
  }
  const fast = measure(1)
  const slow = measure(0.35)
  assert.ok(slow < fast, slow + ' < ' + fast)
  assert.ok(slow > 0)
})

test('facing 给出横向朝向', () => {
  const roamer = make()
  roamer.retarget(0)
  const dt = 1000 / 30
  let now = 0
  let sawFacing = false
  for (let i = 0; i < 200; i += 1) {
    now += dt
    const frame = roamer.step(dt, { now, pace: 1 })
    if (frame.moving && typeof frame.facing === 'number') {
      sawFacing = true
      assert.ok(frame.facing === 1 || frame.facing === -1 || frame.facing === 0)
    }
    if (frame.arrived) break
  }
  assert.equal(sawFacing, true)
})

test('拖动手动 setPosition 会中断当前漫游', () => {
  const roamer = make()
  roamer.retarget(0)
  roamer.step(16, { now: 16, pace: 1 })
  roamer.setPosition({ x: 500, y: 400 })
  const status = roamer.status()
  assert.equal(status.moving, false)
  assert.equal(status.target, null)
  assert.equal(status.x, 500)
  assert.equal(status.y, 400)
})

test('换分辨率后位置被重新夹紧', () => {
  const roamer = make({ x: 1600, y: 700 })
  roamer.setArea({ x: 0, y: 0, width: 800, height: 600 })
  const status = roamer.status()
  assert.ok(status.x <= 800 - SIZE.width - 16, 'x ' + status.x)
  assert.ok(status.y <= 600 - SIZE.height - 16, 'y ' + status.y)
})

test('窗口变大后位置被重新夹紧', () => {
  const roamer = make({ x: 1600, y: 700 })
  roamer.setSize({ width: 800, height: 900 })
  const status = roamer.status()
  assert.ok(status.x + 800 <= AREA.width, '右边不出界')
  assert.ok(status.y + 900 <= AREA.height, '下边不出界')
})

test('负数和 NaN 输入不产生 NaN 坐标', () => {
  const roamer = make()
  const frames = [
    roamer.step(Number.NaN, { now: Number.NaN, pace: Number.NaN }),
    roamer.step(-5, { now: -5, pace: -3 }),
    roamer.step(16, {}),
  ]
  for (const frame of frames) {
    assert.ok(Number.isFinite(frame.x), 'x ' + frame.x)
    assert.ok(Number.isFinite(frame.y), 'y ' + frame.y)
  }
})

console.log('\n' + passed + ' passed')
