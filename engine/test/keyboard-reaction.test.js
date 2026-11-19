'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { setTimeout: delay } = require('node:timers/promises')
const { createKeyboardAggregator, createKeyboardSensor } = require('../../electron/keyboard-sensor')
const { createKeyboardReaction } = require('../../renderer/keyboard-reaction')

test('maps strength to light tap, occasional glance, and frantic gesture', () => {
  let now = 0
  const actions = []
  const reaction = createKeyboardReaction((name, payload) => actions.push([name, payload.intensity]), () => now)
  reaction.push(0.16)
  reaction.push(1)
  now += 500; reaction.push(0.55)
  now += 500; reaction.push(0.55)
  now += 500; reaction.push(1)
  assert.deepEqual(actions.map(([name]) => name), ['typingTap', 'typingLook', 'typingTap', 'typingRush'])
  assert.ok(actions[0][1] < actions[3][1] && actions[3][1] < 0.8)
})

test('aggregates taps into one number per window; differentiates hold', async () => {
  const strengths = []
  const sensor = createKeyboardAggregator((strength) => strengths.push(strength), 10)
  sensor.push(1, false); sensor.push(2, false)
  await delay(25)
  sensor.push(0, true)
  await delay(25)
  assert.deepEqual(strengths, [0.5, 0.18])
})

test('disabled sensors do not emit or play; clearing cancels pending input', async () => {
  const unexpected = () => assert.fail('should not emit')
  const sensor = createKeyboardSensor(unexpected)
  sensor.setEnabled(false)
  sensor.focusedInput({ type: 'keyDown', key: 'a' })
  const aggregate = createKeyboardAggregator(unexpected, 10)
  aggregate.push(3, false); aggregate.reset()
  const reaction = createKeyboardReaction(unexpected)
  reaction.configure({ enabled: false, sensitivity: 100 }); reaction.push(1)
  reaction.configure({ enabled: true, sensitivity: 0 }); reaction.push(1)
  await delay(25)
})
