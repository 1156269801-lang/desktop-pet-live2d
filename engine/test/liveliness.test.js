/**
 * 生动层测试：微动幅度、说话伴随的重音点头、说完回正、帧率无关。
 * 运行：node engine/test/liveliness.test.js
 */
'use strict'

const assert = require('node:assert/strict')
const { ROLES, create } = require('../../renderer/liveliness')

let passed = 0
function test(name, fn) {
  fn()
  passed += 1
  console.log('ok -', name)
}

/** 可复现的随机数 */
function seeded(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** 模拟一段语音：每 0.6 秒一个 0.18 秒的重音，其余是低音量 */
const syllables = (t) => (t % 0.6 < 0.18 ? 0.95 : 0.12)

function run(layer, { seconds, fps = 60, speaking = () => false, level = () => 0, nodSign = 1, from = 0 }) {
  const dt = 1 / fps
  const frames = []
  for (let i = 0; i < Math.round(seconds * fps); i += 1) {
    const t = from + i * dt
    frames.push(layer.step(t, dt, { speaking: speaking(t), level: level(t), nodSign }))
  }
  return frames
}
const peak = (frames, layer, role) => Math.max(...frames.map((f) => Math.abs(f[layer][role])))

test('输出包含全部通道且都是有限数', () => {
  const frames = run(create({ random: seeded(1) }), { seconds: 5, speaking: () => true, level: syllables })
  for (const frame of frames) {
    for (const layer of ['micro', 'speech']) {
      assert.deepEqual(Object.keys(frame[layer]).sort(), [...ROLES].sort())
      for (const role of ROLES) assert.ok(Number.isFinite(frame[layer][role]), layer + '.' + role)
    }
  }
})

test('微动在动，但幅度停在 1 度级', () => {
  const frames = run(create({ random: seeded(2) }), { seconds: 60 })
  for (const role of ['headX', 'headY', 'headZ']) {
    const p = peak(frames, 'micro', role)
    assert.ok(p > 0.4 && p < 1.4, role + ' ' + p)
  }
  assert.ok(peak(frames, 'micro', 'bodyX') < 0.5)
  assert.ok(peak(frames, 'micro', 'eyeX') < 0.08)
  assert.ok(peak(frames, 'micro', 'eyeY') < 0.04)
  assert.ok(peak(frames, 'micro', 'browL') < 0.09)
  // 眼球确实发生过扫视
  assert.ok(peak(frames, 'micro', 'eyeY') > 0.005)
})

test('不说话时没有说话伴随动作', () => {
  const frames = run(create({ random: seeded(3) }), { seconds: 10, level: syllables })
  for (const role of ROLES) assert.ok(peak(frames, 'speech', role) < 1e-9, role)
})

test('重音处点头，并带转头、歪头和抬眉', () => {
  const frames = run(create({ random: seeded(4) }), { seconds: 4, speaking: () => true, level: syllables })
  const nods = frames.map((f) => f.speech.headY)
  assert.ok(Math.max(...nods) > 1.2, '点头幅度 ' + Math.max(...nods))
  assert.ok(Math.max(...nods) < 6, '点头不过头 ' + Math.max(...nods))
  // 弹簧有回弹：点完头会略微越过原位
  assert.ok(Math.min(...nods) < -0.2, '回弹 ' + Math.min(...nods))
  assert.ok(peak(frames, 'speech', 'headX') > 0.3)
  assert.ok(peak(frames, 'speech', 'headZ') > 0.2)
  assert.ok(peak(frames, 'speech', 'browL') > 0.15 && peak(frames, 'speech', 'browL') < 0.3)
  // 转头会换边
  const turns = frames.map((f) => f.speech.headX)
  assert.ok(Math.max(...turns) > 0.2 && Math.min(...turns) < -0.2)
})

test('平稳的音量不触发点头', () => {
  const frames = run(create({ random: seeded(5) }), { seconds: 5, speaking: () => true, level: () => 0.6 })
  // 只有开口那一下算一次重音，之后不再反复点头
  const later = frames.slice(120).map((f) => f.speech.headY)
  assert.ok(Math.max(...later) - Math.min(...later) < 0.2)
})

test('nodSign 翻转点头方向', () => {
  const a = run(create({ random: seeded(6) }), { seconds: 2, speaking: () => true, level: syllables, nodSign: 1 })
  const b = run(create({ random: seeded(6) }), { seconds: 2, speaking: () => true, level: syllables, nodSign: -1 })
  a.forEach((frame, i) => assert.ok(Math.abs(frame.speech.headY + b[i].speech.headY) < 1e-9))
})

test('说完后回正', () => {
  const layer = create({ random: seeded(7) })
  run(layer, { seconds: 3, speaking: () => true, level: syllables })
  const after = run(layer, { seconds: 4, from: 3 })
  const last = after[after.length - 1].speech
  for (const role of ROLES) assert.ok(Math.abs(last[role]) < 0.02, role + ' ' + last[role])
})

test('同样的随机种子得到同样的结果', () => {
  const a = run(create({ random: seeded(8) }), { seconds: 3, speaking: () => true, level: syllables })
  const b = run(create({ random: seeded(8) }), { seconds: 3, speaking: () => true, level: syllables })
  assert.deepEqual(a, b)
})

test('30 帧与 120 帧下的点头幅度接近', () => {
  const peakAt = (fps) => {
    const frames = run(create({ random: seeded(9) }), { seconds: 3, fps, speaking: () => true, level: syllables })
    return Math.max(...frames.map((f) => f.speech.headY))
  }
  const slow = peakAt(30)
  const fast = peakAt(120)
  assert.ok(Math.abs(slow - fast) / fast < 0.25, slow + ' vs ' + fast)
})

test('异常输入不产生 NaN', () => {
  const layer = create({ random: seeded(10) })
  for (const input of [undefined, {}, { level: NaN, speaking: true }, { level: 99, speaking: 1 }]) {
    const frame = layer.step(1, NaN, input)
    for (const role of ROLES) {
      assert.ok(Number.isFinite(frame.micro[role]))
      assert.ok(Number.isFinite(frame.speech[role]))
    }
  }
})

console.log('\n' + passed + ' passed')
