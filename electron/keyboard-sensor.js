'use strict'
const path = require('node:path')
const { spawn } = require('node:child_process')

const WINDOW_MS = 200

function createKeyboardAggregator(emit, interval = WINDOW_MS) {
  let timer = null, taps = 0, held = false
  function flush() {
    timer = null
    const strength = Math.min(1, Math.max(0, taps / 6 + (held ? 0.18 : 0)))
    taps = 0; held = false
    if (strength) emit(strength)
  }
  return {
    push(count, repeat) {
      taps = Math.min(24, taps + (Number.isFinite(count) ? Math.max(0, count) : 0))
      held ||= Boolean(repeat)
      if ((taps || held) && timer === null) timer = setTimeout(flush, interval)
    },
    reset() { clearTimeout(timer); timer = null; taps = 0; held = false },
  }
}

function createKeyboardSensor(emit) {
  let enabled = false, child = null, global = false
  const aggregate = createKeyboardAggregator(emit)
  const stop = () => {
    enabled = false; global = false; aggregate.reset()
    const old = child; child = null
    old?.kill()
  }
  function setEnabled(value) {
    if (!value) return stop()
    if (enabled) return
    enabled = true
    if (process.platform !== 'win32') return
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const helper = spawn(executable, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'keyboard-win.ps1'), String(process.pid)],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    child = helper
    let pending = ''
    const ended = () => { if (child === helper) { child = null; global = false } }
    helper.on('error', ended); helper.on('exit', ended)
    helper.stdout.setEncoding('utf8').on('data', (chunk) => {
      if (child !== helper || !enabled) return
      const lines = (pending + chunk).split('\n')
      pending = lines.pop().slice(-32)
      for (const line of lines) {
        const match = /^(\d{1,2}) ([01])\r?$/.exec(line)
        if (!match) continue
        if (!global) { global = true; aggregate.reset() }
        const strength = Math.min(1, Number(match[1]) / 6 + (match[2] === '1' ? 0.18 : 0))
        if (strength) emit(strength)
      }
    })
  }
  return {
    setEnabled, stop,
    focusedInput(input) {
      if (!enabled || global || input.type !== 'keyDown' || input.isComposing || input.control || input.alt || input.meta) return
      aggregate.push(input.isAutoRepeat ? 0 : 1, input.isAutoRepeat)
    },
  }
}

module.exports = { createKeyboardAggregator, createKeyboardSensor }
