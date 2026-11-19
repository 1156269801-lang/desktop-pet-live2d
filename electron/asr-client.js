'use strict'
const MAX_BYTES = 12 * 1024 * 1024
async function transcribeAudio(config, input, fetchImpl = fetch) {
  if (config.enabled === false) throw new Error('ASR 已关闭')
  if (!input || typeof input.audio !== 'string' || input.audio.length > Math.ceil(MAX_BYTES / 3) * 4) throw new Error('音频为空或超过 12MB')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input.audio)) throw new Error('音频数据格式错误')
  const bytes = Buffer.from(input.audio, 'base64')
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('音频为空或超过 12MB')
  let endpoint
  try { endpoint = new URL(config.url) } catch { throw new Error('请配置本机 ASR 服务地址') }
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) || endpoint.username || endpoint.password) throw new Error('本地 ASR 仅接受回环 HTTP 地址')
  const allowed = ['audio/webm', 'audio/webm;codecs=opus', 'audio/ogg', 'audio/ogg;codecs=opus', 'audio/wav']
  if (!allowed.includes(input.mime)) throw new Error('录音格式暂不支持')
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: input.mime }), input.mime.includes('wav') ? 'speech.wav' : 'speech.webm')
  form.append('model', config.model || 'sensevoice')
  if (config.language) form.append('language', config.language)
  let response
  try {
    response = await fetchImpl(endpoint, { method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(90000) })
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new Error('语音转写超时，请缩短录音后重试')
    throw new Error('本地 ASR 服务未连接，请运行“启动语音识别.cmd”')
  }
  if (!response.ok) throw new Error(response.status === 429 ? 'ASR 正忙，请稍后重试' : '语音转写失败（HTTP ' + response.status + '）')
  const body = await response.text()
  if (body.length > 64000) throw new Error('ASR 返回内容过长')
  let data
  try { data = JSON.parse(body) } catch { data = { text: body } }
  const value = data.text ?? data.transcript ?? data.result
  if (typeof value !== 'string') throw new Error('ASR 返回中没有文字')
  const text = value.trim().slice(0, 2000)
  if (!text) throw new Error('没有识别到语音，请靠近麦克风重试')
  return text
}
module.exports = { transcribeAudio, MAX_BYTES }
