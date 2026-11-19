'use strict'

// Browser globals are injected so permission races can be tested without a microphone.
;(function (root) {
  function createRecorder(options) {
    let state = 'idle'
    let generation = 0
    let stream = null
    let recorder = null
    let timer = null
    const setState = (value) => { state = value; options.onState(value) }
    const stopTracks = (value) => value?.getTracks().forEach((track) => track.stop())
    const release = () => {
      options.clearTimeout(timer)
      timer = null
      stopTracks(stream)
      stream = null
    }
    function cancel(dispose = false) {
      if (state === 'disposed') return
      generation += 1
      const active = recorder
      recorder = null
      release()
      if (active && active.state !== 'inactive') {
        try { active.stop() } catch { /* tracks already released */ }
      }
      setState(dispose ? 'disposed' : 'idle')
    }
    async function start() {
      if (state !== 'idle' || options.isBusy()) return
      const token = ++generation
      setState('requesting')
      try {
        options.stopSpeech()
        const acquired = await options.getUserMedia({ audio: true })
        if (token !== generation) { stopTracks(acquired); return }
        stream = acquired
        const mime = options.MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
        const active = new options.MediaRecorder(stream, { mimeType: mime })
        recorder = active
        const chunks = []
        const started = options.now()
        active.addEventListener('dataavailable', (event) => {
          if (token === generation && event.data?.size) chunks.push(event.data)
        })
        active.addEventListener('error', (event) => {
          if (token !== generation) return
          cancel()
          options.onError(event.error || new Error('录音设备发生错误'))
        })
        active.addEventListener('stop', async () => {
          if (token !== generation) return
          recorder = null
          release()
          setState('transcribing')
          try {
            const blob = new options.Blob(chunks, { type: active.mimeType || mime })
            if (options.now() - started < 300 || blob.size < 1000) return
            const text = await options.transcribe(blob)
            if (token !== generation) return
            if (!String(text || '').trim()) throw new Error('ASR 没有返回文字')
            await options.onText(text)
          } catch (error) {
            if (token === generation) options.onError(error)
          } finally {
            if (token === generation) setState('idle')
          }
        }, { once: true })
        active.start()
        setState('recording')
        timer = options.setTimeout(stop, 60000)
      } catch (error) {
        if (token !== generation) return
        cancel()
        options.onError(error)
      }
    }
    function stop() {
      if (state !== 'recording') return
      setState('stopping')
      options.clearTimeout(timer)
      timer = null
      try {
        recorder.stop()
        // Release hardware now; stop/dataavailable are delivered asynchronously.
        stopTracks(stream)
        stream = null
      } catch (error) {
        cancel()
        options.onError(error)
      }
    }
    return { start, stop, cancel, dispose: () => cancel(true), get state() { return state } }
  }

  function createSpeechPlayer(options) {
    let generation = 0
    let current = null
    function stop() {
      generation += 1
      if (current) current.dispose()
      options.lipSync({ stop: true })
    }
    async function speak(text, lang) {
      stop()
      const token = generation
      if (!String(text || '').trim() || options.blocked()) return
      try {
        const result = await options.tts(text, lang)
        if (token !== generation || options.blocked() || !result?.ok || !result.audio) return
        const bytes = options.decode(result.audio)
        const url = options.URL.createObjectURL(new options.Blob([bytes], { type: 'audio/wav' }))
        let audio
        let disposed = false
        const item = { dispose() {
          if (disposed) return
          disposed = true
          if (current === item) {
            current = null
            options.lipSync({ stop: true })
          }
          if (audio) { try { audio.pause(); audio.removeAttribute('src'); audio.load() } catch { /* detached audio */ } }
          options.URL.revokeObjectURL(url)
        } }
        try {
          audio = new options.Audio(url)
          current = item
          const envelope = options.envelope(bytes)
          if (envelope) audio.addEventListener('playing', () => {
            if (current === item) options.lipSync({ envelope })
          }, { once: true })
          audio.addEventListener('ended', item.dispose, { once: true })
          audio.addEventListener('error', item.dispose, { once: true })
          await audio.play()
        } catch { item.dispose() }
      } catch { /* TTS failure leaves text intact */ }
    }
    return { stop, speak }
  }
  const api = { createRecorder, createSpeechPlayer }
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.PetChatVoice = api
})(typeof globalThis === 'object' ? globalThis : this)
