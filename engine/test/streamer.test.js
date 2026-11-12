/**
 * 自主陪伴「直播搭子」语气测试：没有新事件时也定时点评；其它语气行为不变；
 * API 模式下没有标题或截图授权时不定时调用。
 * 运行：node engine/test/streamer.test.js
 */
'use strict'

const assert = require('node:assert/strict')
const { createAutonomous, parseConfig, DEFAULTS } = require('../../electron/autonomous-director')
const { stripMarkup } = require('../../renderer/director-markup')

let passed = 0
async function test(name, fn) {
  await fn()
  passed += 1
  console.log('ok -', name)
}

const CAPS = { version: 1, characterRevision: 'r1', parameters: [], gestures: [], emotions: [], outfits: [], expressions: [], displays: [] }
const tick = () => new Promise((resolve) => setImmediate(resolve))

/** 假时钟 + 假定时器的自主模块 */
function harness(autonomy, { request, sense } = {}) {
  // 中午 12 点：不在夜间降频时段
  let clock = new Date(2026, 10, 12, 12, 0, 0).getTime()
  const timers = new Map()
  let seq = 0
  const performed = []
  const requests = []
  const auto = createAutonomous({
    config: { autonomy: { ...DEFAULTS, allowAutonomous: true, ...autonomy } },
    saveConfig() {},
    getCapabilities: () => CAPS,
    providerReady: () => true,
    request: async (args) => { requests.push(args); return request(requests.length) },
    sense,
    budget: { status: () => ({ ok: true, callsThisHour: 0, callsToday: 0 }), reserve: () => ({ ok: true, callsThisHour: 0, callsToday: 0 }) },
    perform: async (plan) => { performed.push(plan); return { ok: true } },
    cancelPerformance() {},
    now: () => clock,
    setTimer: (fn, delay) => { const id = ++seq; timers.set(id, { at: clock + Math.max(0, delay), fn }); return id },
    clearTimer: (id) => { timers.delete(id) },
  })
  async function advance(ms) {
    const target = clock + ms
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      timers.delete(due[0])
      clock = Math.max(clock, due[1].at)
      due[1].fn()
      for (let i = 0; i < 8; i += 1) await tick()
    }
    clock = target
  }
  return { auto, advance, performed, requests }
}

const apiPlan = (n) => ({ version: 1, characterRevision: 'r1', speech: '〔开心〕第' + n + '句点评', cues: [] })

async function main() {
  await test('配置接受 streamer 语气，拒绝未知语气', () => {
    assert.equal(parseConfig({ tone: 'streamer' }).tone, 'streamer')
    assert.equal(parseConfig({ tone: 'shouty' }), null)
  })

  await test('温柔语气：会话开始说一次，之后没有新事件就保持安静', async () => {
    const h = harness({ tone: 'caring' })
    assert.equal(h.auto.start().ok, true)
    await h.advance(10 * 60000)
    assert.equal(h.performed.length, 1)
    assert.equal(h.auto.state().lastEvent, 'session-start')
    h.auto.stop()
  })

  await test('直播搭子（离线）：没有新事件也定时点评，台词带表演标记', async () => {
    const h = harness({ tone: 'streamer' })
    h.auto.start()
    await h.advance(10 * 60000)
    assert.ok(h.performed.length >= 4, '点评次数 ' + h.performed.length)
    assert.equal(h.auto.state().lastEvent, 'commentary')
    assert.ok(h.performed.every((plan) => plan.speech.includes('〔') && stripMarkup(plan.speech).length > 0))
    // 不连着说同一句
    for (let i = 1; i < h.performed.length; i += 1) assert.notEqual(h.performed[i].speech, h.performed[i - 1].speech)
    h.auto.stop()
  })

  await test('直播搭子仍遵守最短安静时间', async () => {
    const h = harness({ tone: 'streamer', intervalSec: 30, minSilenceSec: 120 })
    h.auto.start()
    await h.advance(10 * 60000)
    assert.ok(h.performed.length >= 3 && h.performed.length <= 6, '次数 ' + h.performed.length)
    h.auto.stop()
  })

  await test('直播搭子（API）：没有标题或截图授权时不定时调用', async () => {
    const h = harness({ tone: 'streamer', mode: 'api' }, { request: apiPlan })
    h.auto.start()
    await h.advance(10 * 60000)
    assert.equal(h.requests.length, 1, '只有会话开始那一次')
    h.auto.stop()
  })

  await test('直播搭子（API）：授权标题后定时点评，提示词是搭子口吻', async () => {
    const sense = async () => ({ front: { title: 'Some Game', process: 'game.exe' }, fullscreen: false })
    const h = harness({ tone: 'streamer', mode: 'api', allowWindowTitle: true }, { request: apiPlan, sense })
    h.auto.start()
    await h.advance(10 * 60000)
    assert.ok(h.requests.length >= 4, '调用次数 ' + h.requests.length)
    assert.ok(h.requests.every((r) => r.prompt.includes('直播搭子')))
    assert.ok(h.requests[0].text.includes('Some Game'))
    assert.equal(h.performed.length, h.requests.length)
    h.auto.stop()
  })

  await test('温柔语气（API）的提示词不变', async () => {
    const sense = async () => ({ front: { title: 'Some Game', process: 'game.exe' }, fullscreen: false })
    const h = harness({ tone: 'caring', mode: 'api', allowWindowTitle: true }, { request: apiPlan, sense })
    h.auto.start()
    await h.advance(10 * 60000)
    assert.equal(h.requests.length, 1)
    assert.ok(!h.requests[0].prompt.includes('直播搭子') && h.requests[0].prompt.includes('短而克制'))
    h.auto.stop()
  })

  console.log('\n' + passed + ' passed')
}

main().catch((error) => { console.error(error); process.exit(1) })
