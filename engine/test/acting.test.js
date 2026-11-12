/**
 * 表演层测试：手势库、情绪状态、行内标记解析，以及提示词里列出的标记都能用。
 * 运行：node engine/test/acting.test.js
 */
'use strict'

const assert = require('node:assert/strict')
const Acting = require('../../renderer/acting')
const Markup = require('../../renderer/director-markup')
const Contract = require('../../renderer/director-contract')

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

function run(stage, seconds, fps = 60) {
  const frames = []
  for (let i = 0; i < Math.round(seconds * fps); i += 1) frames.push(stage.step(1 / fps))
  return frames
}
const peak = (frames, role) => Math.max(...frames.map((f) => Math.abs(f.pose[role])))
const maxAbs = (pose) => Math.max(...Object.values(pose).map(Math.abs))

test('手势库：通道合法、关键帧有序、首尾归零', () => {
  for (const [id, gesture] of Object.entries(Acting.GESTURES)) {
    assert.ok(gesture.label && gesture.duration >= 500 && gesture.duration <= 3000, id)
    const roles = Object.keys(gesture.tracks)
    assert.ok(roles.length >= 2, id + ' 至少驱动两个通道')
    for (const role of roles) {
      assert.ok(Acting.ROLES.includes(role), id + '.' + role)
      const points = gesture.tracks[role]
      assert.equal(points[0][0], 0, id + '.' + role)
      assert.equal(points[0][1], 0, id + '.' + role + ' 起点为 0')
      assert.equal(points[points.length - 1][0], 1, id + '.' + role)
      assert.equal(points[points.length - 1][1], 0, id + '.' + role + ' 终点为 0')
      for (let i = 1; i < points.length; i += 1) assert.ok(points[i][0] > points[i - 1][0], id + '.' + role + ' 时间递增')
      const limit = ['headX', 'headY', 'headZ', 'bodyX', 'bodyY', 'lean'].includes(role) ? 14 : 1.01
      for (const [, value] of points) assert.ok(Math.abs(value) <= limit, id + '.' + role + ' 幅度 ' + value)
    }
  }
})

test('每个手势都会动，并在结束后完全回零', () => {
  for (const id of Object.keys(Acting.GESTURES)) {
    const stage = Acting.create({ random: seeded(11) })
    assert.equal(stage.play(id), true)
    const frames = run(stage, 4)
    assert.ok(Math.max(...frames.map((f) => maxAbs(f.pose))) > 0.1, id + ' 没有动')
    assert.ok(maxAbs(frames[frames.length - 1].pose) < 1e-9, id + ' 没有回零')
    assert.deepEqual(stage.playing, [])
    for (const frame of frames) for (const role of Acting.ROLES) assert.ok(Number.isFinite(frame.pose[role]), id + '.' + role)
  }
})

test('点头：先微微后仰再低头，过冲后回弹', () => {
  const stage = Acting.create({ random: seeded(1) })
  stage.play('nod')
  const ys = run(stage, 1.5).map((f) => f.pose.headY)
  const down = Math.max(...ys)
  assert.ok(down > 8 && down < 13, '低头幅度 ' + down)
  assert.ok(ys.indexOf(Math.min(...ys.slice(0, ys.indexOf(down)))) < ys.indexOf(down), '预备动作在前')
  assert.ok(Math.min(...ys.slice(0, ys.indexOf(down))) < -0.5, '有预备动作')
  assert.ok(Math.min(...ys.slice(ys.indexOf(down))) < -0.4, '有回弹')
})

test('眼和眉先动，头随后，身体最后', () => {
  const stage = Acting.create({ random: seeded(2) })
  stage.play('glance', { side: 'right' })
  const frames = run(stage, 0.4, 240)
  const first = (role) => frames.findIndex((f) => Math.abs(f.pose[role]) > 1e-4)
  assert.ok(first('eyeX') < first('headX'), '眼先于头')
  const stage2 = Acting.create({ random: seeded(2) })
  stage2.play('shake')
  const frames2 = run(stage2, 0.5, 240)
  const first2 = (role) => frames2.findIndex((f) => Math.abs(f.pose[role]) > 1e-4)
  assert.ok(first2('headX') < first2('bodyX'), '头先于身体')
})

test('方向：side 决定左右，镜像时眉毛对调', () => {
  const at = (side) => {
    const stage = Acting.create({ random: seeded(3) })
    stage.play('tilt', { side })
    return run(stage, 0.8)[45].pose
  }
  const right = at('right')
  const left = at('left')
  assert.ok(right.headZ > 3 && left.headZ < -3)
  assert.ok(Math.abs(right.headZ + left.headZ) < 1e-9)
  assert.ok(Math.abs(right.browL - left.browR) < 1e-9 && Math.abs(right.browR - left.browL) < 1e-9)
  // 不指定方向时两边都会出现
  const sides = new Set()
  const random = seeded(4)
  for (let i = 0; i < 20; i += 1) {
    const stage = Acting.create({ random })
    stage.play('tilt')
    sides.add(Math.sign(run(stage, 0.8)[45].pose.headZ))
  }
  assert.deepEqual([...sides].sort(), [-1, 1])
})

test('力度缩放幅度；同一手势每次略有不同', () => {
  const peakOf = (intensity, seed) => {
    const stage = Acting.create({ random: seeded(seed) })
    stage.play('nod', { intensity })
    return peak(run(stage, 1.5), 'headY')
  }
  assert.ok(peakOf(0.5, 5) < peakOf(1, 5) * 0.6)
  assert.equal(peakOf(0, 5), 0)
  assert.ok(Math.abs(peakOf(1, 5) - peakOf(1, 6)) > 0.05)
  assert.ok(peakOf(99, 5) <= 8 * Acting.GAIN.headY * 1.12 + 1e-9, '力度被限制在 1 以内')
})

test('未知手势与情绪被拒绝，不影响状态', () => {
  const stage = Acting.create({ random: seeded(7) })
  assert.equal(stage.play('backflip'), false)
  assert.equal(stage.play('__proto__'), false)
  assert.equal(stage.setMood('constructor'), false)
  assert.equal(maxAbs(stage.step(1 / 60).pose), 0)
})

test('同名手势重播会替换；同时进行的手势有上限', () => {
  const stage = Acting.create({ random: seeded(8) })
  stage.play('nod'); stage.play('nod')
  assert.deepEqual(stage.playing, ['nod'])
  for (const id of ['shake', 'tilt', 'perk', 'bounce']) stage.play(id)
  assert.equal(stage.playing.length, 3)
  assert.ok(!stage.playing.includes('nod'))
})

test('情绪：渐入底姿、改变活跃度、按半衰期回到平静', () => {
  const stage = Acting.create({ random: seeded(9) })
  assert.equal(stage.setMood('sad', 1), true)
  const early = run(stage, 2)
  const pose = early[early.length - 1].pose
  assert.ok(pose.headY > 3 && pose.mouthForm < -0.3 && pose.browL < -0.2, JSON.stringify(pose))
  assert.ok(early[early.length - 1].energy < 0.8)
  // 不是瞬间跳到位
  assert.ok(Math.abs(early[5].pose.headY) < Math.abs(pose.headY) * 0.5)
  run(stage, 400)
  const end = stage.step(1 / 60)
  assert.equal(stage.mood.name, 'neutral')
  assert.ok(maxAbs(end.pose) < 0.01 && Math.abs(end.energy - 1) < 0.01)
})

test('开心比平静活跃，犯困更沉', () => {
  const energyOf = (name) => {
    const stage = Acting.create({ random: seeded(10) })
    stage.setMood(name, 1)
    return run(stage, 3).pop().energy
  }
  assert.ok(energyOf('happy') > 1.15)
  assert.ok(energyOf('sleepy') < 0.7)
  assert.ok(Math.abs(energyOf('neutral') - 1) < 1e-6)
})

test('情绪带身体摆动：开心左右摇并上下颠，平静不摆，生气比犯困快', () => {
  const swing = (name, seconds = 6) => {
    const stage = Acting.create({ random: seeded(21) })
    stage.setMood(name, 1)
    const frames = run(stage, seconds).slice(120)
    const xs = frames.map((f) => f.pose.bodyX)
    let crossings = 0
    for (let i = 1; i < xs.length; i += 1) if (Math.sign(xs[i]) !== Math.sign(xs[i - 1])) crossings += 1
    return { range: Math.max(...xs) - Math.min(...xs), crossings, bob: Math.max(...frames.map((f) => f.pose.bodyY)) - Math.min(...frames.map((f) => f.pose.bodyY)) }
  }
  const happy = swing('happy')
  assert.ok(happy.range > 5, '开心左右摆幅 ' + happy.range)
  assert.ok(happy.bob > 0.6, '开心上下颠 ' + happy.bob)
  assert.ok(happy.crossings >= 4, '来回次数 ' + happy.crossings)
  assert.ok(swing('neutral').range < 1e-6)
  assert.ok(swing('angry').crossings > swing('sleepy').crossings * 4)
  // 头跟着身体倾
  const stage = Acting.create({ random: seeded(22) })
  stage.setMood('happy', 1)
  const zs = run(stage, 6).slice(120).map((f) => f.pose.headZ)
  assert.ok(Math.max(...zs) - Math.min(...zs) > 3)
})

test('情绪带上身前倾或后仰', () => {
  const leanOf = (name) => {
    const stage = Acting.create({ random: seeded(23) })
    stage.setMood(name, 1)
    return run(stage, 3).pop().pose.lean
  }
  assert.ok(leanOf('sad') > 3, '难过前倾')
  assert.ok(leanOf('smug') < -3, '得意后仰')
  assert.ok(leanOf('surprised') < -3, '惊讶后仰')
})

test('情绪联动模型表情，强度不够或消退后关掉', () => {
  const expr = (name, intensity) => {
    const stage = Acting.create({ random: seeded(24) })
    stage.setMood(name, intensity)
    return stage.step(1 / 60).expressions
  }
  assert.deepEqual(expr('smug', 1), ['屑屑眼'])
  assert.deepEqual(expr('love', 1), ['爱心眼', '脸红'])
  assert.deepEqual(expr('shy', 1), ['脸红'])
  assert.deepEqual(expr('sad', 1), ['流泪'])
  assert.deepEqual(expr('angry', 1), ['黑脸'])
  assert.deepEqual(expr('nervous', 1), ['流冷汗'])
  assert.deepEqual(expr('happy', 1), [])
  assert.deepEqual(expr('neutral', 1), [])
  // 轻微的难过不流泪
  assert.deepEqual(expr('sad', 0.5), [])
  // 消退后自动关掉
  const stage = Acting.create({ random: seeded(25) })
  stage.setMood('smug', 1)
  run(stage, 120)
  assert.deepEqual(stage.step(1 / 60).expressions, [])
  // 换情绪立刻换脸
  stage.setMood('smug', 1); stage.step(1 / 60)
  stage.setMood('love', 1)
  assert.deepEqual(stage.step(1 / 60).expressions, ['爱心眼', '脸红'])
})

test('手势期间打开对应表情，结束后关掉；眼型表情同一时刻只有一个', () => {
  const stage = Acting.create({ random: seeded(26) })
  stage.play('smirk', { side: 'right' })
  const frames = run(stage, 3)
  assert.deepEqual(frames[0].expressions, [], '起手时还没开')
  assert.deepEqual(frames[60].expressions, ['屑屑眼'])
  assert.deepEqual(frames[frames.length - 1].expressions, [])
  // 得意（屑屑眼）时心动：手势的爱心眼优先，屑屑眼让位，脸红照常
  const both = Acting.create({ random: seeded(27) })
  both.setMood('smug', 1)
  both.play('swoon')
  const mid = run(both, 1).pop().expressions
  assert.deepEqual(mid, ['爱心眼', '脸红'])
  // 手势结束后回到情绪的脸
  assert.deepEqual(run(both, 3).pop().expressions, ['屑屑眼'])
  // 力度很小的手势不换脸
  const soft = Acting.create({ random: seeded(28) })
  soft.play('laugh', { intensity: 0.2 })
  assert.ok(run(soft, 1).every((f) => f.expressions.length === 0))
  for (const frame of mid ? [mid] : []) assert.ok(frame.filter((n) => Acting.EYE_EXPRESSIONS.includes(n)).length <= 1)
})

test('标记解析：手势、方向、力度、情绪', () => {
  assert.deepEqual(Markup.parseCue('点头'), { type: 'perform', name: 'nod' })
  assert.deepEqual(Markup.parseCue('歪头:左'), { type: 'perform', name: 'tilt', side: 'left' })
  assert.deepEqual(Markup.parseCue('瞥：右'), { type: 'perform', name: 'glance', side: 'right' })
  assert.deepEqual(Markup.parseCue('点头:0.6'), { type: 'perform', name: 'nod', intensity: 0.6 })
  assert.deepEqual(Markup.parseCue('开心'), { type: 'mood', name: 'happy' })
  assert.deepEqual(Markup.parseCue('难过:0.5'), { type: 'mood', name: 'sad', intensity: 0.5 })
  assert.deepEqual(Markup.parseCue('心情:得意'), { type: 'mood', name: 'smug' })
  assert.deepEqual(Markup.parseCue('看:左'), { type: 'gaze', x: -1, y: 0 })
  assert.equal(Markup.parseCue('清表情').type, 'clearExpression')
  // 不认识的名字仍按表情/动作名处理
  assert.deepEqual(Markup.parseCue('脸红'), { type: 'name', name: '脸红', strength: 1 })
  assert.equal(Markup.parseCue('constructor').type, 'name')
})

test('整段台词：标记落在对应的字上，显示文字不含标记', () => {
  const parsed = Markup.parseMarkup('〔开心〕哇，〔蹦〕赢了！〔歪头:右 瞥:左〕真的假的')
  assert.equal(parsed.speech, '哇，赢了！真的假的')
  assert.deepEqual(parsed.cues.map((c) => [c.charIndex, c.type, c.name]),
    [[0, 'mood', 'happy'], [2, 'perform', 'bounce'], [5, 'perform', 'tilt'], [5, 'perform', 'glance']])
  assert.equal(Markup.stripMarkup('好呀〔点头〕。'), '好呀。')
  // 被截断的半个标记不显示
  assert.equal(Markup.stripMarkup('嗯〔点头〕好〔歪'), '嗯好')
  assert.equal(Markup.stripMarkup(''), '')
  assert.equal(Markup.stripMarkup(null), '')
})

test('标记表里的每个 id 都存在于表演层', () => {
  for (const id of Object.values(Markup.PERFORM)) assert.ok(Object.hasOwn(Acting.GESTURES, id), id)
  for (const id of Object.values(Markup.MOOD)) assert.ok(Object.hasOwn(Acting.MOODS, id), id)
  // 每个手势至少有一个标记能触发
  for (const id of Object.keys(Acting.GESTURES)) assert.ok(Object.values(Markup.PERFORM).includes(id), id + ' 没有标记')
})

test('提示词里列出的标记全部可用', () => {
  const marks = (text) => [...text.matchAll(/〔([^〕]+)〕/g)].map((m) => m[1])
  const performs = marks(Contract.PERFORM_MARKS)
  const moods = marks(Contract.MOOD_MARKS)
  assert.ok(performs.length >= 15 && moods.length >= 8)
  for (const mark of performs) assert.equal(Markup.parseCue(mark).type, 'perform', mark)
  for (const mark of moods) assert.equal(Markup.parseCue(mark).type, 'mood', mark)
  const prompt = Contract.buildPrompt({ characterRevision: 'r1' })
  assert.ok(prompt.includes(Contract.PERFORM_MARKS) && prompt.includes(Contract.MOOD_MARKS))
})

test('截断按显示字数算，标记不占字数也不被切开', () => {
  const text = '〔开心〕哇，〔蹦〕赢了！〔歪头:右〕真的假的'
  assert.equal(Markup.truncateMarkup(text, 5), '〔开心〕哇，〔蹦〕赢了！')
  assert.equal(Markup.stripMarkup(Markup.truncateMarkup(text, 3)), '哇，赢')
  assert.equal(Markup.truncateMarkup(text, 99), text)
  assert.equal(Markup.truncateMarkup(text, 0), '')
  assert.equal(Markup.truncateMarkup('没有标记的话', 3), '没有标')
  assert.equal(Markup.truncateMarkup(null, 5), '')
})

console.log('\n' + passed + ' passed')
