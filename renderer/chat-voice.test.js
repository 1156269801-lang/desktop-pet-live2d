'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createRecorder, createSpeechPlayer } = require('./chat-voice')
const vm = require('node:vm')
const fs = require('node:fs')
const path = require('node:path')
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const flush = () => new Promise((resolve) => setImmediate(resolve))
function setup(overrides = {}) {
  const permission = deferred()
  const asr = deferred()
  const tracks = [{ stops: 0, stop() { this.stops++ } }]
  const errors = [], texts = [], timers = new Map(), instances = []
  let time = 0, requests = 0, stops = 0, speechStops = 0
  class Recorder extends EventTarget {
    static isTypeSupported() { return true }
    constructor() { super(); this.state = 'inactive'; this.mimeType = 'audio/webm;codecs=opus'; instances.push(this) }
    start() { this.state = 'recording' }
    stop() { stops++; this.state = 'inactive' }
    emit(name, data = {}) { const event = new Event(name); Object.assign(event, data); this.dispatchEvent(event) }
  }
  const options = {
    getUserMedia: () => { requests++; return permission.promise }, MediaRecorder: Recorder,
    Blob, now: () => time, setTimeout: (fn, ms) => { timers.set(ms, fn); return ms }, clearTimeout: (id) => timers.delete(id),
    isBusy: () => false, stopSpeech: () => speechStops++, onState: () => {}, onError: (e) => errors.push(e),
    transcribe: () => asr.promise, onText: (text) => texts.push(text), ...overrides,
  }
  const voice = createRecorder(options)
  return { voice, permission, asr, tracks, errors, texts, timers, instances,
    get requests() { return requests }, get stops() { return stops }, get speechStops() { return speechStops },
    async record() { const pending = voice.start(); permission.resolve({ getTracks: () => tracks }); await pending; time = 1000 },
    finish() { voice.stop(); instances[0].emit('dataavailable', { data: new Blob(['x'.repeat(1500)]) }); instances[0].emit('stop') },
  }
}

test('cancel pending permission releases late stream and does not start recorder', async () => {
  const s = setup(); const pending = s.voice.start(); s.voice.start(); assert.equal(s.requests, 1)
  assert.equal(s.voice.state, 'requesting'); assert.equal(s.speechStops, 1)
  s.voice.cancel(); s.permission.resolve({ getTracks: () => s.tracks }); await pending
  assert.equal(s.tracks[0].stops, 1); assert.equal(s.instances.length, 0); assert.equal(s.voice.state, 'idle')
})
test('close during permission remains disposed and releases late stream', async () => {
  const s = setup(); const pending = s.voice.start(); s.voice.dispose(); s.permission.resolve({ getTracks: () => s.tracks }); await pending
  s.voice.cancel(); await s.voice.start(); assert.equal(s.voice.state, 'disposed'); assert.equal(s.requests, 1); assert.equal(s.tracks[0].stops, 1)
})
test('stop releases tracks immediately, locks transcription and sends only once', async () => {
  const s = setup(); await s.record(); s.finish(); s.voice.stop(); await s.voice.start()
  assert.equal(s.voice.state, 'transcribing'); assert.equal(s.tracks[0].stops, 1); assert.equal(s.stops, 1); assert.equal(s.requests, 1)
  s.asr.resolve('你好'); await flush(); assert.deepEqual(s.texts, ['你好']); assert.equal(s.voice.state, 'idle'); assert.equal(s.timers.size, 0)
})
test('cancel transcription discards late text and errors', async () => {
  const s = setup(); await s.record(); s.finish(); s.voice.cancel(); s.asr.resolve('过期'); await flush()
  assert.deepEqual(s.texts, []); assert.deepEqual(s.errors, []); assert.equal(s.voice.state, 'idle')
})
test('60 second timer stops recording and is removed', async () => {
  const s = setup(); await s.record(); assert.ok(s.timers.has(60000)); s.timers.get(60000)()
  assert.equal(s.voice.state, 'stopping'); assert.equal(s.tracks[0].stops, 1); assert.equal(s.stops, 1); assert.equal(s.timers.size, 0)
})
test('recorder error clears all capture resources and ignores trailing stop', async () => {
  const s = setup(); await s.record(); s.instances[0].emit('error', { error: new Error('device') }); s.instances[0].emit('stop')
  assert.equal(s.voice.state, 'idle'); assert.equal(s.tracks[0].stops, 1); assert.equal(s.timers.size, 0); assert.equal(s.errors.length, 1)
})
test('constructor and start failures release tracks', async () => {
  for (const step of ['constructor', 'start']) {
    class Broken { static isTypeSupported() { return true }; constructor() { if (step === 'constructor') throw Error(step); this.state = 'inactive' }; addEventListener() {}; start() { throw Error(step) } }
    const s = setup({ MediaRecorder: Broken }); await s.record(); assert.equal(s.voice.state, 'idle'); assert.equal(s.tracks[0].stops, 1); assert.equal(s.errors.length, 1)
  }
})
test('permission denial, empty clip and ASR error recover to idle', async () => {
  const denied = setup(); const pending = denied.voice.start(); denied.permission.reject(Error('permission')); await pending; assert.equal(denied.voice.state, 'idle')
  const empty = setup(); await empty.record(); empty.voice.stop(); empty.instances[0].emit('stop'); await flush(); assert.equal(empty.voice.state, 'idle'); assert.deepEqual(empty.texts, [])
  const failed = setup(); await failed.record(); failed.finish(); failed.asr.reject(Error('ASR')); await flush(); assert.equal(failed.voice.state, 'idle'); assert.equal(failed.errors.length, 1)
})
function speechSetup() {
  const pending = [], urls = [], revoked = [], audios = []
  class Audio extends EventTarget {
    constructor() { super(); audios.push(this); this.pauses = 0 }
    pause() { this.pauses++ }; removeAttribute() {}; load() {}; play() { return Promise.resolve() }
  }
  const speech = createSpeechPlayer({
    tts: () => { const d = deferred(); pending.push(d); return d.promise }, blocked: () => false,
    lipSync: () => {}, decode: () => new Uint8Array([1]), Blob, Audio, envelope: () => null,
    URL: { createObjectURL: () => { const url = `blob:${urls.length}`; urls.push(url); return url }, revokeObjectURL: (url) => revoked.push(url) },
  })
  return { speech, pending, urls, revoked, audios }
}
test('TTS result arriving after microphone interruption never creates audio', async () => {
  const s = speechSetup(); const job = s.speech.speak('hello'); s.speech.stop(); s.pending[0].resolve({ ok: true, audio: 'AA==' }); await job
  assert.deepEqual(s.urls, []); assert.deepEqual(s.audios, [])
})
test('chat wiring reuses sendText once and blocks duplicate submit until reply', async () => {
  class Node extends EventTarget {
    constructor() { super(); this.children = []; this.value = ''; this.classList = { toggle() {} } }
    appendChild(child) { this.children.push(child) }; setAttribute() {}; focus() {}
  }
  const ids = Object.fromEntries(['log', 'input', 'send', 'voice', 'cancelVoice', 'voiceStatus', 'composer', 'btnClose'].map((id) => [id, new Node()]))
  const document = new Node(); document.getElementById = (id) => ids[id]; document.createElement = () => new Node()
  const reply = deferred(), sent = []
  let recordingOptions, speechStops = 0
  const voice = { state: 'idle', dispose() { this.state = 'disposed' }, cancel() { this.state = 'idle' } }
  const window = new Node()
  Object.assign(window, { setInterval: () => 1, clearInterval() {}, PetChatVoice: {
    createRecorder(options) { recordingOptions = options; return voice },
    createSpeechPlayer() { return { stop() { speechStops++ }, speak() {} } },
  }, pet: { send(text) { sent.push(text); return reply.promise }, closeChatWindow() {} } })
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'chat.js'), 'utf8'), { window, document, navigator: {}, Blob, Audio: class {}, URL, Uint8Array, Date })
  voice.state = 'transcribing'; const pending = recordingOptions.onText('你好')
  ids.input.value = '重复'; ids.composer.dispatchEvent(new Event('submit', { cancelable: true }))
  assert.deepEqual(sent, ['你好']); assert.equal(ids.log.children.filter((node) => node.className === 'msg user').length, 1)
  assert.equal(ids.send.disabled, true); assert.equal(ids.voice.disabled, true)
  reply.resolve({ ok: true, say: '收到' }); await pending
  assert.equal(ids.log.children.filter((node) => node.className === 'msg pet').length, 1)
  assert.equal(ids.log.children.filter((node) => node.className === 'msg err').length, 0)
  ids.btnClose.dispatchEvent(new Event('click')); assert.equal(voice.state, 'disposed'); assert.equal(speechStops, 1)
})

test('TTS replacement and end/error release each URL exactly once', async () => {
  const s = speechSetup(); const first = s.speech.speak('first'); s.pending[0].resolve({ ok: true, audio: 'AA==' }); await first
  const second = s.speech.speak('second'); assert.deepEqual(s.revoked, ['blob:0']); assert.equal(s.audios[0].pauses, 1)
  s.pending[1].resolve({ ok: true, audio: 'AA==' }); await second
  s.audios[1].dispatchEvent(new Event('error')); s.audios[1].dispatchEvent(new Event('ended')); s.speech.stop()
  assert.deepEqual(s.revoked, ['blob:0', 'blob:1'])
})
