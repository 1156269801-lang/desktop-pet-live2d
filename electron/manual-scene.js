'use strict'
const crypto = require('node:crypto')
const { validateImageDataUrl } = require('./director-provider')
const { destinationFor } = require('./memory-service')
const exact = (body, keys) => body && Object.getPrototypeOf(body) === Object.prototype
  && Reflect.ownKeys(body).length === keys.length && keys.every(key => Object.hasOwn(body, key)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(body, key), 'value'))
const safe = (text, max) => typeof text === 'string' ? text.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max) : ''
function createManualScene({ capture, getDestination, now = Date.now }) {
  let preview = null, generation = 0, controller = null, lastTime = now()
  const fail = () => ({ ok: false, status: 409, error: '感知未完成或已失效；请重新采集并确认当前目的地，不会发送旧内容' })
  function invalidate() { generation++; controller?.abort(); controller = null; preview = null; return { ok: true } }
  function readTime() {
    const current = now()
    if (!Number.isFinite(current) || current < lastTime) { invalidate(); if (Number.isFinite(current)) lastTime = current; return NaN }
    lastTime = current; return current
  }
  async function collect(body) {
    if (!exact(body, ['title', 'screenshot']) || typeof body.title !== 'boolean' || typeof body.screenshot !== 'boolean'
      || (!body.title && !body.screenshot) || typeof capture !== 'function') return fail()
    invalidate(); const capturedAt = readTime(); if (!Number.isFinite(capturedAt)) return fail()
    const token = generation, current = new AbortController(); controller = current
    try {
      const result = await capture({ ...body, signal: current.signal })
      const finishedAt = readTime()
      if (token !== generation || current.signal.aborted || !Number.isFinite(finishedAt) || finishedAt >= capturedAt + 30000) return fail()
      const front = body.title && result?.front ? { title: safe(result.front.title, 300), process: safe(result.front.process, 80) } : null
      const imageDataUrl = body.screenshot && result?.imageDataUrl ? validateImageDataUrl(result.imageDataUrl) : null
      if ((body.title && !front?.title) || (body.screenshot && !imageDataUrl)) return fail()
      const destination = destinationFor(getDestination())
      preview = { previewId: crypto.randomUUID(), generation: token, capturedAt, expiresAt: capturedAt + 30000,
        front, imageDataUrl, destinationId: destination.id, permissions: { title: body.title, screenshot: body.screenshot } }
      return { ok: true, previewId: preview.previewId, capturedAt: new Date(capturedAt).toISOString(),
        expiresAt: new Date(preview.expiresAt).toISOString(), front, imageDataUrl, destination,
        warning: '仅内存保存30秒；尚未发送。标题和截图可能含私人内容，确认发送后无法撤回。' }
    } catch { return fail() }
    finally { if (token === generation) controller = null }
  }
  function consume(body) {
    const stamp = readTime()
    if (!Number.isFinite(stamp) || (preview && stamp >= preview.expiresAt)) { invalidate(); throw Error('SCENE_EXPIRED') }
    if (!exact(body, ['previewId', 'expectedDestinationId', 'confirm']) || body.confirm !== 'SEND_THIS_SCENE'
      || !preview || preview.previewId !== body.previewId) throw Error('SCENE_EXPIRED')
    const target = destinationFor(getDestination())
    if (!target.configured || target.id !== body.expectedDestinationId || target.id !== preview.destinationId) throw Error('SCENE_DESTINATION_CHANGED')
    const result = preview; preview = null
    return result
  }
  const valid = value => { const stamp = readTime(); return Boolean(value && value.generation === generation && Number.isFinite(stamp) && stamp < value.expiresAt
    && value.destinationId === destinationFor(getDestination()).id) }
  return { collect, consume, valid, invalidate }
}
module.exports = { createManualScene }
