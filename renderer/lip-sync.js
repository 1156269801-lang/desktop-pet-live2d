'use strict'

/**
 * 口型同步：TTS 返回的是完整 wav，所以播放前把整段音量包络算好，
 * 播放时按播放进度查表驱动张嘴参数。
 *
 * 不用 Web Audio AnalyserNode：wav 非流式，预计算更稳——不依赖 AudioContext
 * 手势解锁，也不改变音频输出路径。
 *
 * 浏览器里挂在 window.PetLipSync；node 里 module.exports（测试用）。
 */
;(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.PetLipSync = api
})(typeof self !== 'undefined' ? self : this, function () {
  const STEP_MS = 20
  /** 包络最长 2 分钟，防止异常 wav 撑爆内存 / IPC */
  const MAX_POINTS = 6000
  /** 低于峰值这个比例的当作静音（底噪、呼吸声不张嘴） */
  const NOISE_GATE = 0.06
  /** 动态压缩指数：越小轻声越明显 */
  const COMPRESS = 0.5

  const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0)

  /** 解析 RIFF/WAVE，返回 PCM 布局；不是可识别的 wav 返回 null */
  function parseWav(bytes) {
    if (!bytes || bytes.length < 44) return null
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const tag = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3])
    if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null
    let fmt = null
    let offset = 12
    while (offset + 8 <= bytes.length) {
      const id = tag(offset)
      const size = view.getUint32(offset + 4, true)
      const body = offset + 8
      if (id === 'fmt ' && body + 16 <= bytes.length) {
        fmt = {
          format: view.getUint16(body, true),
          channels: view.getUint16(body + 2, true),
          sampleRate: view.getUint32(body + 4, true),
          bits: view.getUint16(body + 14, true),
        }
        // WAVE_FORMAT_EXTENSIBLE：真实格式在 SubFormat 的前两个字节
        if (fmt.format === 0xfffe && size >= 26 && body + 26 <= bytes.length) fmt.format = view.getUint16(body + 24, true)
      } else if (id === 'data') {
        if (!fmt) return null
        // 流式写出的 wav 可能把长度写成 0 或 0xFFFFFFFF：按文件剩余长度算
        const available = bytes.length - body
        const length = size === 0 || size > available ? available : size
        return { ...fmt, dataOffset: body, dataLength: length, view }
      }
      offset = body + size + (size & 1)
    }
    return null
  }

  function sampleReader(wav) {
    const { view, format, bits } = wav
    if (format === 3 && bits === 32) return (o) => view.getFloat32(o, true)
    if (format !== 1) return null
    if (bits === 16) return (o) => view.getInt16(o, true) / 32768
    if (bits === 8) return (o) => (view.getUint8(o) - 128) / 128
    if (bits === 24) return (o) => ((view.getInt8(o + 2) << 16) | (view.getUint8(o + 1) << 8) | view.getUint8(o)) / 8388608
    if (bits === 32) return (o) => view.getInt32(o, true) / 2147483648
    return null
  }

  /**
   * wav 字节 → 音量包络。
   * 返回 { stepMs, duration, peak, values: number[] (0..1) }；解析失败或全程静音返回 null。
   */
  function buildMouthEnvelope(bytes, options = {}) {
    const stepMs = options.stepMs || STEP_MS
    const wav = parseWav(bytes)
    if (!wav || !wav.channels || !wav.sampleRate) return null
    const read = sampleReader(wav)
    if (!read) return null
    const bytesPerSample = wav.bits / 8
    const frameBytes = bytesPerSample * wav.channels
    const frames = Math.floor(wav.dataLength / frameBytes)
    const framesPerStep = Math.max(1, Math.round((wav.sampleRate * stepMs) / 1000))
    const points = Math.min(MAX_POINTS, Math.ceil(frames / framesPerStep))
    if (points < 1) return null
    const rms = new Array(points)
    let peak = 0
    for (let i = 0; i < points; i += 1) {
      const start = i * framesPerStep
      const end = Math.min(frames, start + framesPerStep)
      let sum = 0
      for (let f = start; f < end; f += 1) {
        // 只取第一声道：TTS 基本是单声道，多声道也足够代表响度
        const s = read(wav.dataOffset + f * frameBytes)
        sum += s * s
      }
      const value = Math.sqrt(sum / Math.max(1, end - start))
      rms[i] = value
      if (value > peak) peak = value
    }
    if (!(peak > 1e-4)) return null
    const values = rms.map((value) => {
      const x = value / peak
      if (x < NOISE_GATE) return 0
      return Math.round(Math.pow(x, COMPRESS) * 100) / 100
    })
    return { stepMs, duration: frames / wav.sampleRate, peak, values }
  }

  /** 按播放时间（秒）查包络，相邻两点线性插值；超出范围为 0 */
  function sampleEnvelope(envelope, timeSec) {
    if (!envelope || !envelope.values || !(timeSec >= 0)) return 0
    const pos = (timeSec * 1000) / envelope.stepMs
    const i = Math.floor(pos)
    const values = envelope.values
    if (i >= values.length) return 0
    const a = values[i]
    const b = i + 1 < values.length ? values[i + 1] : 0
    return clamp01(a + (b - a) * (pos - i))
  }

  /** 校验/收紧一份跨进程传来的包络（聊天窗 → 主进程 → 主窗） */
  function sanitizeEnvelope(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.values)) return null
    const stepMs = Number(raw.stepMs)
    if (!(stepMs >= 5 && stepMs <= 200)) return null
    const values = raw.values.slice(0, MAX_POINTS).map((v) => clamp01(Number(v) || 0))
    if (!values.length) return null
    return { stepMs, duration: (values.length * stepMs) / 1000, peak: 1, values }
  }

  /**
   * 平滑器：张嘴快、闭嘴慢（非对称），与帧率无关。
   * step(target, active, dtSec) → { level, weight }
   *   level  当前张嘴程度 0..1
   *   weight 口型对嘴参数的接管权重 0..1（说话时升到 1，结束后渐隐，把嘴还给表情/动作）
   */
  function createMouthSmoother() {
    let level = 0
    let weight = 0
    const follow = (current, target, per60, dt) => current + (target - current) * (1 - Math.pow(1 - per60, dt * 60))
    return {
      step(target, active, dtSec) {
        const dt = Math.max(0, Math.min(0.1, dtSec || 0))
        const goal = active ? clamp01(target) : 0
        level = follow(level, goal, goal > level ? 0.55 : 0.25, dt)
        weight = follow(weight, active ? 1 : 0, active ? 0.4 : 0.15, dt)
        if (!active && weight < 0.01) {
          level = 0
          weight = 0
        }
        return { level, weight }
      },
      reset() {
        level = 0
        weight = 0
      },
    }
  }

  return { STEP_MS, MAX_POINTS, parseWav, buildMouthEnvelope, sampleEnvelope, sanitizeEnvelope, createMouthSmoother }
})
