/**
 * 口型同步测试：wav 解析 + 音量包络 + 查表 + 平滑器。
 * 运行：node engine/test/lip-sync.test.js
 */
'use strict'

const assert = require('node:assert/strict')
const { parseWav, buildMouthEnvelope, sampleEnvelope, sanitizeEnvelope, createMouthSmoother, MAX_POINTS } = require('../../renderer/lip-sync')

let passed = 0
function test(name, fn) {
  fn()
  passed += 1
  console.log('ok -', name)
}

/** 生成 wav：segments = [{ sec, amp }]，440Hz 正弦 */
function makeWav(segments, { sampleRate = 16000, bits = 16, channels = 1, format = 1, dataSize = null, junk = false } = {}) {
  const samples = []
  for (const { sec, amp } of segments) {
    const n = Math.round(sec * sampleRate)
    for (let i = 0; i < n; i += 1) samples.push(amp * Math.sin((2 * Math.PI * 440 * i) / sampleRate))
  }
  const bytesPer = bits / 8
  const data = Buffer.alloc(samples.length * bytesPer * channels)
  samples.forEach((s, i) => {
    for (let c = 0; c < channels; c += 1) {
      const o = (i * channels + c) * bytesPer
      if (format === 3) data.writeFloatLE(s, o)
      else if (bits === 16) data.writeInt16LE(Math.round(s * 32767), o)
      else if (bits === 8) data.writeUInt8(Math.round(s * 127) + 128, o)
      else if (bits === 24) data.writeIntLE(Math.round(s * 8388607), o, 3)
      else if (bits === 32) data.writeInt32LE(Math.round(s * 2147483647), o)
    }
  })
  const fmt = Buffer.alloc(24)
  fmt.write('fmt ', 0, 'ascii')
  fmt.writeUInt32LE(16, 4)
  fmt.writeUInt16LE(format, 8)
  fmt.writeUInt16LE(channels, 10)
  fmt.writeUInt32LE(sampleRate, 12)
  fmt.writeUInt32LE(sampleRate * channels * bytesPer, 16)
  fmt.writeUInt16LE(channels * bytesPer, 20)
  fmt.writeUInt16LE(bits, 22)
  const extra = junk ? Buffer.concat([Buffer.from('LIST'), Buffer.from([3, 0, 0, 0]), Buffer.from([1, 2, 3, 0])]) : Buffer.alloc(0)
  const dataHead = Buffer.alloc(8)
  dataHead.write('data', 0, 'ascii')
  dataHead.writeUInt32LE(dataSize === null ? data.length : dataSize, 4)
  const head = Buffer.alloc(12)
  head.write('RIFF', 0, 'ascii')
  head.writeUInt32LE(4 + fmt.length + extra.length + 8 + data.length, 4)
  head.write('WAVE', 8, 'ascii')
  return new Uint8Array(Buffer.concat([head, fmt, extra, dataHead, data]))
}

const speech = [{ sec: 0.2, amp: 0 }, { sec: 0.4, amp: 0.8 }, { sec: 0.2, amp: 0 }, { sec: 0.2, amp: 0.2 }]

test('parseWav 读出格式与数据区', () => {
  const wav = parseWav(makeWav(speech))
  assert.equal(wav.format, 1)
  assert.equal(wav.channels, 1)
  assert.equal(wav.sampleRate, 16000)
  assert.equal(wav.bits, 16)
  assert.equal(wav.dataLength, 16000 * 2)
})

test('不是 wav / 太短 / 空输入返回 null', () => {
  assert.equal(parseWav(null), null)
  assert.equal(parseWav(new Uint8Array(10)), null)
  assert.equal(buildMouthEnvelope(new Uint8Array(200)), null)
  assert.equal(buildMouthEnvelope(new Uint8Array(Buffer.from('ID3' + 'x'.repeat(100)))), null)
})

test('包络：静音为 0，响处接近 1，轻声被压缩抬高', () => {
  const env = buildMouthEnvelope(makeWav(speech))
  assert.equal(env.stepMs, 20)
  assert.equal(env.values.length, 50)
  assert.ok(Math.abs(env.duration - 1) < 1e-6)
  assert.equal(env.values[2], 0)
  assert.ok(env.values[20] > 0.95, 'loud ' + env.values[20])
  assert.equal(env.values[35], 0)
  // 幅度 0.2/0.8 = 0.25，指数 0.5 压缩后 = 0.5
  assert.ok(Math.abs(env.values[45] - 0.5) < 0.03, 'soft ' + env.values[45])
  assert.ok(env.values.every((v) => v >= 0 && v <= 1))
})

test('各种采样格式得到一致的包络', () => {
  const base = buildMouthEnvelope(makeWav(speech)).values
  const variants = [
    { bits: 8 }, { bits: 24 }, { bits: 32 }, { bits: 32, format: 3 },
    { channels: 2 }, { sampleRate: 32000 }, { sampleRate: 44100 },
  ]
  for (const options of variants) {
    const values = buildMouthEnvelope(makeWav(speech, options)).values
    assert.equal(values.length, base.length, JSON.stringify(options))
    for (const i of [2, 20, 35, 45]) assert.ok(Math.abs(values[i] - base[i]) < 0.05, JSON.stringify(options) + ' @' + i)
  }
})

test('data 长度写成 0 / 0xFFFFFFFF（流式 wav）时按实际长度算', () => {
  for (const dataSize of [0, 0xffffffff]) {
    const env = buildMouthEnvelope(makeWav(speech, { dataSize }))
    assert.equal(env.values.length, 50)
    assert.ok(env.values[20] > 0.95)
  }
})

test('跳过 fmt 与 data 之间的其它块（含奇数长度补齐）', () => {
  const env = buildMouthEnvelope(makeWav(speech, { junk: true }))
  assert.equal(env.values.length, 50)
  assert.ok(env.values[20] > 0.95)
})

test('全程静音与不支持的编码返回 null', () => {
  assert.equal(buildMouthEnvelope(makeWav([{ sec: 0.5, amp: 0 }])), null)
  assert.equal(buildMouthEnvelope(makeWav(speech, { format: 2 })), null)
})

test('超长音频的包络点数有上限', () => {
  const env = buildMouthEnvelope(makeWav([{ sec: 130, amp: 0.5 }], { sampleRate: 8000, bits: 8 }))
  assert.equal(env.values.length, MAX_POINTS)
})

test('sampleEnvelope 线性插值，越界为 0', () => {
  const env = { stepMs: 20, values: [0, 1, 0.5] }
  assert.equal(sampleEnvelope(env, 0), 0)
  assert.ok(Math.abs(sampleEnvelope(env, 0.01) - 0.5) < 1e-9)
  assert.equal(sampleEnvelope(env, 0.02), 1)
  assert.ok(Math.abs(sampleEnvelope(env, 0.05) - 0.25) < 1e-9)
  assert.equal(sampleEnvelope(env, 0.06), 0)
  assert.equal(sampleEnvelope(env, -1), 0)
  assert.equal(sampleEnvelope(env, NaN), 0)
  assert.equal(sampleEnvelope(null, 0.1), 0)
})

test('sanitizeEnvelope 收紧跨进程数据', () => {
  assert.equal(sanitizeEnvelope(null), null)
  assert.equal(sanitizeEnvelope({ stepMs: 20, values: 'x' }), null)
  assert.equal(sanitizeEnvelope({ stepMs: 0, values: [1] }), null)
  assert.equal(sanitizeEnvelope({ stepMs: 20, values: [] }), null)
  const clean = sanitizeEnvelope({ stepMs: 20, values: [5, -1, 'a', 0.4, NaN], extra: 'drop' })
  assert.deepEqual(clean.values, [1, 0, 0, 0.4, 0])
  assert.equal(clean.extra, undefined)
  assert.ok(Math.abs(clean.duration - 0.1) < 1e-9)
  assert.equal(sanitizeEnvelope({ stepMs: 20, values: new Array(MAX_POINTS + 50).fill(0.5) }).values.length, MAX_POINTS)
})

test('平滑器：张嘴比闭嘴快，结束后权重渐隐归零', () => {
  const s = createMouthSmoother()
  const dt = 1 / 60
  let r
  for (let i = 0; i < 3; i += 1) r = s.step(1, true, dt)
  const opened = r.level
  assert.ok(opened > 0.85, 'open ' + opened)
  for (let i = 0; i < 3; i += 1) r = s.step(0, true, dt)
  assert.ok(r.level > 1 - opened, '闭嘴应慢于张嘴: ' + r.level)
  assert.ok(r.weight > 0.9)
  for (let i = 0; i < 120; i += 1) r = s.step(0, false, dt)
  assert.deepEqual(r, { level: 0, weight: 0 })
})

test('平滑器与帧率无关', () => {
  const a = createMouthSmoother()
  const b = createMouthSmoother()
  let ra
  let rb
  for (let i = 0; i < 6; i += 1) ra = a.step(1, true, 1 / 60)
  for (let i = 0; i < 3; i += 1) rb = b.step(1, true, 1 / 30)
  assert.ok(Math.abs(ra.level - rb.level) < 1e-9)
  assert.ok(Math.abs(ra.weight - rb.weight) < 1e-9)
})

console.log('\n' + passed + ' passed')
