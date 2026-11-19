'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createPresenceSensor, cameraMediaAllowed } = require('../../electron/camera-sensor')

test('presence transitions: empty → arrived → away → returned', () => {
  let now = 0
  const events = []
  const sensor = createPresenceSensor({ now: () => now, awayMs: 1000, onChange: (event) => events.push(event) })
  sensor.setEnabled(true)
  sensor.sample(0); sensor.sample(1)
  assert.deepEqual(events, [])
  sensor.sample(2)
  sensor.sample(0); now = 999; sensor.sample(0)
  assert.deepEqual(events, ['arrived'])
  now = 1000; sensor.sample(0); sensor.sample(0); sensor.sample(1); sensor.sample(1)
  assert.deepEqual(events, ['arrived', 'left', 'returned'])
})

test('brief disappearance does not chatter; disable drops all prior state', () => {
  let now = 0
  const events = []
  const sensor = createPresenceSensor({ now: () => now, awayMs: 1000, onChange: (event) => events.push(event) })
  sensor.sample(1); sensor.sample(1)
  sensor.setEnabled(true)
  sensor.sample(1); sensor.sample(1)
  sensor.sample(0); now = 500; sensor.sample(1); now = 1100; sensor.sample(0)
  sensor.setEnabled(false)
  sensor.sample(1); sensor.sample(1)
  sensor.setEnabled(true)
  sensor.sample(1); sensor.sample(1)
  assert.deepEqual(events, ['arrived', 'arrived'])
})

test('media access restricts video to the explicitly enabled main frame and preserves chat ASR', () => {
  const origin = 'http://127.0.0.1:41888'
  const pet = { getURL: () => origin + '/' }, chat = { getURL: () => origin + '/chat.html' }
  const base = { contents: pet, petContents: pet, chatContents: chat, isMainFrame: true, port: 41888,
    url: origin + '/', origin, types: ['video'], allowed: true }
  assert.equal(cameraMediaAllowed(base), true)
  for (const change of [{ allowed: false }, { isMainFrame: false }, { types: ['video', 'audio'] },
    { origin: 'https://example.invalid' }, { url: origin + '/settings.html' }, { contents: {} }]) {
    assert.equal(cameraMediaAllowed({ ...base, ...change }), false)
  }
  assert.equal(cameraMediaAllowed({ ...base, allowed: false, types: ['audio'], contents: chat, url: origin + '/chat.html' }), true)
})
