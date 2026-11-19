'use strict'

;(function () {
  let generation = 0, stream = null, detector = null, timer = null
  const video = document.createElement('video')
  const indicator = document.getElementById('cameraIndicator')
  video.muted = true
  video.playsInline = true

  function stop() {
    generation++
    clearInterval(timer); timer = null
    stream?.getTracks().forEach((track) => track.stop()); stream = null
    video.srcObject = null
    detector?.close(); detector = null
    indicator.hidden = true
  }

  async function start() {
    stop()
    const token = generation
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported')
      const { FaceDetector, FilesetResolver } = await import('/assets/mediapipe/vision_bundle.mjs')
      const files = await FilesetResolver.forVisionTasks('/assets/mediapipe/wasm')
      if (token !== generation) return
      const model = await FaceDetector.createFromOptions(files, { baseOptions: {
        modelAssetPath: '/assets/mediapipe/blaze_face_short_range.tflite', delegate: 'CPU',
      }, runningMode: 'VIDEO', minDetectionConfidence: 0.65 })
      if (token !== generation) { model.close(); return }
      detector = model
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
        width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 5, max: 10 },
      } })
      if (token !== generation) { acquired.getTracks().forEach((track) => track.stop()); return }
      stream = acquired
      const fail = () => {
        if (token !== generation) return
        stop()
        window.pet.cameraReport('error')
      }
      stream.getVideoTracks().forEach((track) => track.addEventListener('ended', fail, { once: true }))
      video.srcObject = stream
      indicator.hidden = false
      await video.play()
      if (token !== generation) return
      window.pet.cameraReport('on')
      timer = setInterval(() => {
        if (!detector || video.readyState < 2 || video.videoWidth === 0) return
        try {
          const result = detector.detectForVideo(video, performance.now())
          window.pet.cameraReport('sample', Math.min(10, result.detections.length))
        } catch { fail() }
      }, 1100)
    } catch {
      if (token === generation) { stop(); window.pet.cameraReport('error') }
    }
  }

  window.pet.onEvent((payload) => {
    if (payload?.type !== 'camera-control') return
    if (payload.enabled) void start()
    else stop()
  })
  window.addEventListener('pagehide', stop)
})()
