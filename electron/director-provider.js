'use strict'
const { inspectBudget } = require('./token-budget')
// Provider credentials exist only in this request's memory and authorization header.
const IMAGE_MAX_BYTES = 4 * 1024 * 1024
// Byte ceiling, not a model-specific token estimate. Images retain a separate cap.
const TEXT_REQUEST_MAX_BYTES = 64 * 1024
function validateImageDataUrl(value) {
  if (typeof value !== 'string' || value.length > Math.ceil(IMAGE_MAX_BYTES / 3) * 4 + 32) throw new Error('截图格式或大小无效')
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match || match[2].length % 4 !== 0) throw new Error('截图格式或大小无效')
  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.length > IMAGE_MAX_BYTES || bytes.toString('base64') !== match[2]
    || (match[1] === 'png' && !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
    || (match[1] === 'jpeg' && (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217))) throw new Error('截图格式或大小无效')
  return value
}
function endpoint(baseURL) {
  let u
  try { u = new URL(baseURL) } catch { throw new Error('模型服务地址无效') }
  if (u.username || u.password || u.search || u.hash || !['https:', 'http:'].includes(u.protocol)
    || (u.protocol === 'http:' && u.hostname !== '127.0.0.1' && u.hostname !== '[::1]')) throw new Error('仅允许 HTTPS 服务或本机 HTTP，地址不能含凭据和查询参数')
  return u.href.replace(/\/+$/, '') + '/chat/completions'
}
function rejectCredentialReflection(value, key) {
  // Parse before scanning: JSON escapes must not disguise a reflected secret.
  // Iteration, depth and node bounds avoid recursive stack exhaustion. Keys are
  // data too; an unknown property can still be echoed through a later error.
  const pending = [{ value, depth: 0 }]
  let visited = 0
  while (pending.length) {
    const item = pending.pop()
    if (++visited > 10000 || item.depth > 32) throw new Error('response structure')
    if (typeof item.value === 'string') {
      if (item.value.includes(key)) throw new Error('credential reflection')
    } else if (item.value && typeof item.value === 'object') {
      for (const name of Object.keys(item.value)) {
        if (name.includes(key)) throw new Error('credential reflection')
        if (pending.length + visited >= 10000) throw new Error('response structure')
        pending.push({ value: item.value[name], depth: item.depth + 1 })
      }
    }
  }
}
// 失败原因只归类成固定的几种，不回显服务商的响应内容。
const PROVIDER_MESSAGES = Object.freeze({
  auth: '模型服务拒绝了密钥（401/403）。请检查密钥是否完整、是否属于这个服务商。',
  balance: '模型服务提示余额不足（402）。',
  'not-found': '服务地址或模型名称不存在（404）。',
  'bad-request': '模型服务拒绝了请求（400/422），多半是模型名称不对。',
  rate: '请求太频繁或额度已用尽（429），请稍后再试。',
  server: '模型服务暂时出错（5xx），请稍后再试。',
  status: '模型服务返回了未预期的状态。',
  network: '连不上模型服务。请检查网络、代理和服务地址。',
  timeout: '模型请求已取消或超时。',
  format: '模型返回的内容不是约定的 JSON 格式。可以再试一次，或换一个模型。',
})
function classifyStatus(status) {
  if (status === 401 || status === 403) return 'auth'
  if (status === 402) return 'balance'
  if (status === 404) return 'not-found'
  if (status === 400 || status === 422) return 'bad-request'
  if (status === 429) return 'rate'
  if (status >= 500) return 'server'
  return 'status'
}
function providerError(code) {
  const known = Object.hasOwn(PROVIDER_MESSAGES, code) ? code : 'status'
  return Object.assign(new Error(PROVIDER_MESSAGES[known]), { providerCode: known })
}
/** 模型有时会在 JSON 前后加说明文字：退一步取第一个 { 到最后一个 } */
function parseLoose(text) {
  try { return JSON.parse(text) } catch {
    const start = text.indexOf('{'), end = text.lastIndexOf('}')
    if (start < 0 || end <= start) throw new Error('format')
    return JSON.parse(text.slice(start, end + 1))
  }
}
async function readLimited(response, max) {
  const reader = response.body.getReader(), chunks = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > max) { await reader.cancel(); throw new Error('size') }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks).toString('utf8')
}
/** 读服务商的模型列表（OpenAI 兼容的 GET /models）。只留形如模型名的短字符串。 */
async function listModels({ baseURL, key, signal, fetchImpl }) {
  try {
    const url = endpoint(baseURL).replace(/\/chat\/completions$/, '/models')
    const r = await fetchImpl(url, { method: 'GET', redirect: 'error', signal, headers: { authorization: 'Bearer ' + key } })
    if (!r.ok) { await r.body?.cancel(); return [] }
    const data = JSON.parse(await readLimited(r, 262144))
    return [...new Set((Array.isArray(data?.data) ? data.data : []).map(item => item?.id)
      .filter(id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(id) && !id.includes(key)))].slice(0, 40)
  } catch { return [] }
}
/**
 * 发一条极短的请求，确认地址、模型、密钥三者能用。
 * 返回 { ok, code, models? }；code 是固定分类，models 只在地址通但模型不对时给出。
 */
async function testConnection({ config, key, fetchImpl = fetch, timeoutMs = 15000 }) {
  if (typeof key !== 'string' || !key) return { ok: false, code: 'no-key' }
  let url
  try { url = endpoint(config?.baseURL) } catch { return { ok: false, code: 'address' } }
  if (typeof config.model !== 'string' || !config.model.trim() || config.model.length > 128) return { ok: false, code: 'model' }
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), timeoutMs)
  try {
    let r
    try {
      r = await fetchImpl(url, { method: 'POST', redirect: 'error', signal: abort.signal,
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
        body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 8 }) })
    } catch { return { ok: false, code: abort.signal.aborted ? 'timeout' : 'network' } }
    if (!r.ok) {
      await r.body?.cancel()
      const code = classifyStatus(r.status)
      const models = ['not-found', 'bad-request'].includes(code)
        ? await listModels({ baseURL: config.baseURL, key, signal: abort.signal, fetchImpl }) : []
      return { ok: false, code, ...(models.length ? { models } : {}) }
    }
    try {
      const data = JSON.parse(await readLimited(r, 65536))
      return Array.isArray(data?.choices) ? { ok: true, code: 'ok' } : { ok: false, code: 'format' }
    } catch { return { ok: false, code: abort.signal.aborted ? 'timeout' : 'format' } }
  } finally { clearTimeout(timer) }
}
async function requestPlan({ config, key, prompt, text, imageDataUrl, signal, fetchImpl = fetch }) {
  if (config.enabled !== true || config.allowRemote !== true || typeof key !== 'string' || !key) throw new Error('尚未启用并授权模型服务')
  const url = endpoint(config.baseURL)
  if (typeof config.model !== 'string' || !config.model.trim() || config.model.length > 128) throw new Error('模型名称无效')
  if (typeof prompt !== 'string' || typeof text !== 'string') throw new Error('模型输入格式无效')
  const payload = { model: config.model, messages: [{ role: 'system', content: prompt }, { role: 'user', content: text }], temperature: 0.35, max_tokens: 1800 }
  // Count the serialized envelope too; never silently trim security/persona instructions.
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > TEXT_REQUEST_MAX_BYTES) throw new Error('模型文本输入超过本地字节预算，未发送；请缩短输入或人设')
  const image = imageDataUrl === undefined ? undefined : validateImageDataUrl(imageDataUrl)
  const userContent = image ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: image, detail: 'low' } }] : text
  const messages = [payload.messages[0], { role: 'user', content: userContent }]
  const budget = inspectBudget({ messages, profile: config.tokenizerProfile || 'conservative', contextTokens: config.contextTokens ?? 32768, maxOutputTokens: payload.max_tokens })
  if (!budget.ok) throw Object.assign(new Error('整体输入预算或分词配置不满足要求，未发送：' + budget.code), { code: budget.code })
  const abort = new AbortController()
  const cancel = () => abort.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) abort.abort()
  const timer = setTimeout(cancel, 30000)
  try {
    if (abort.signal.aborted) throw new Error('cancelled')
    let r
    try { r = await fetchImpl(url, { method: 'POST', redirect: 'error', signal: abort.signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify({ ...payload, messages }) }) } catch { throw providerError(abort.signal.aborted ? 'timeout' : 'network') }
    if (abort.signal.aborted) { await r.body?.cancel(); throw new Error('cancelled') }
    if (!r.ok) { await r.body?.cancel(); throw providerError(classifyStatus(r.status)) }
    const reader = r.body.getReader(), chunks = []
    let size = 0
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 262144) { await reader.cancel(); throw new Error('size') } chunks.push(Buffer.from(value)) }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || content.length > 50000) throw new Error('format')
    const clean = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    if (abort.signal.aborted) throw new Error('cancelled')
    const parsed = parseLoose(clean)
    rejectCredentialReflection(parsed, key)
    return parsed
  } catch (error) {
    // Never echo provider responses, URLs, headers, causes or prompt content: only a fixed category.
    throw providerError(abort.signal.aborted ? 'timeout' : error?.providerCode || 'format')
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel) }
}
module.exports = { endpoint, requestPlan, testConnection, classifyStatus, PROVIDER_MESSAGES, validateImageDataUrl, IMAGE_MAX_BYTES, TEXT_REQUEST_MAX_BYTES }
