'use strict'
const crypto = require('node:crypto')
const { isSensitiveText } = require('./memory-schema')
const clone = value => JSON.parse(JSON.stringify(value))
const FIELDS = Object.freeze(['identity', 'temperament', 'voice', 'interactionStyle', 'styleNotes'])
const exact = (body, keys) => body && Object.getPrototypeOf(body) === Object.prototype
  && Reflect.ownKeys(body).length === keys.length && keys.every(key => Object.hasOwn(body, key)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(body, key), 'value'))
const hasSensitive = value => typeof value === 'string' ? isSensitiveText(value)
  : value && typeof value === 'object' ? Object.values(value).some(hasSensitive) : false
function createSharedPersona({ getPersona, getCharacterRevision, onRevoke = () => {}, now = Date.now }) {
  let draft = null, grant = null, lastTime = now()
  function readTime() {
    const current = now()
    if (!Number.isFinite(current) || current < lastTime) { draft = grant = null; onRevoke(); if (Number.isFinite(current)) lastTime = current; return NaN }
    lastTime = current; return current
  }
  const denied = () => ({ ok: false, status: 409, error: '共享预览已失效、包含疑似敏感字段或版本变化；请重新预览确认' })
  function valid(value) {
    try {
      const stamp = readTime(), ok = Boolean(value && Number.isFinite(stamp) && stamp < value.expiresAt && getPersona().revision === value.personaRevision
        && getCharacterRevision() === value.characterRevision)
      if (!ok && value) { if (value === grant) { grant = null; onRevoke() }; if (value === draft) draft = null }
      return ok
    } catch { draft = grant = null; return false }
  }
  function revoke() { draft = grant = null; onRevoke(); return state() }
  function state() {
    if (!valid(grant)) grant = null
    return { ok: true, enabled: Boolean(grant), fields: grant?.fields || [],
      expiresAt: grant ? new Date(grant.expiresAt).toISOString() : null,
      scope: 'authenticated-local-director', persisted: false }
  }
  function preview(body) {
    if (!exact(body, ['fields']) || !Array.isArray(body.fields) || !body.fields.length
      || body.fields.length > FIELDS.length || new Set(body.fields).size !== body.fields.length
      || body.fields.some(field => !FIELDS.includes(field))) return denied()
    try {
      const stamp = readTime(); if (!Number.isFinite(stamp)) return denied()
      const snapshot = getPersona(), persona = Object.fromEntries(body.fields.map(field => [field, snapshot.persona[field]]))
      if (hasSensitive(persona)) return denied()
      draft = { previewId: crypto.randomUUID(), fields: [...body.fields], persona: clone(persona),
        personaRevision: snapshot.revision, characterRevision: getCharacterRevision(), expiresAt: stamp + 120000 }
      return { ok: true, ...clone(draft), expiresAt: new Date(draft.expiresAt).toISOString(),
        warning: '仅本机预览。确认后，持有此桌宠控制凭据的本机程序可读取选中字段并可能发给其模型；不是对 DSH 的进程隔离。无记忆、密钥或截图。' }
    } catch { return denied() }
  }
  function confirm(body) {
    if (!exact(body, ['previewId', 'confirm']) || body.confirm !== 'SHARE_SELECTED_PERSONA'
      || body.previewId !== draft?.previewId || !valid(draft)) return denied()
    onRevoke()
    grant = { ...draft, grantId: crypto.randomUUID(), expiresAt: lastTime + 600000 }; draft = null
    return state()
  }
  function envelope() {
    if (!valid(grant)) { grant = null; return { ok: true, available: false } }
    return { ok: true, available: true, envelope: { schemaVersion: 1, grantId: grant.grantId,
      personaRevision: grant.personaRevision, characterRevision: grant.characterRevision,
      expiresAt: new Date(grant.expiresAt).toISOString(), persona: clone(grant.persona),
      scope: 'style-data-only', memory: false, observation: false, autonomousStart: false } }
  }
  function accepts(header) {
    return Boolean(valid(grant) && exact(header, ['schemaVersion', 'grantId', 'personaRevision', 'characterRevision'])
      && header.schemaVersion === 1 && header.grantId === grant.grantId
      && header.personaRevision === grant.personaRevision && header.characterRevision === grant.characterRevision)
  }
  return { state, preview, confirm, revoke, envelope, accepts }
}
module.exports = { createSharedPersona, FIELDS }
