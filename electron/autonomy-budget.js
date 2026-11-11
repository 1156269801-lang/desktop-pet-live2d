'use strict'
// Durable call-count ceiling, NOT a monetary-cost estimate. DPAPI CurrentUser
// does not protect against the same account, disk rollback or whole-root restore.
const nativeFs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const { TextDecoder } = require('node:util')
const vault = require('./secret-vault')
const PURPOSE = 'dafeiyu-autonomy-budget-v1', HOUR = 3600000, DAY = 24 * HOUR
const MAX_DAY = 240, MAX_BYTES = 65536
const fail = code => Object.assign(new Error('Autonomous call budget is unavailable.'), { code })
const exact = (o, keys) => o && typeof o === 'object' && !Array.isArray(o)
  && [Object.prototype, null].includes(Object.getPrototypeOf(o))
  && Reflect.ownKeys(o).length === keys.length && keys.every(key => {
    const d = Object.getOwnPropertyDescriptor(o, key); return d?.enumerable && Object.hasOwn(d, 'value')
  })
function limits(value) {
  if (!exact(value, ['maxCallsPerHour', 'maxCallsPerDay']) || !Number.isInteger(value.maxCallsPerHour)
    || value.maxCallsPerHour < 1 || value.maxCallsPerHour > 120 || !Number.isInteger(value.maxCallsPerDay)
    || value.maxCallsPerDay < 1 || value.maxCallsPerDay > MAX_DAY) throw fail('BUDGET_INVALID')
  return value
}
function cipher(value) {
  if (!exact(value, ['version', 'algorithm', 'ciphertext']) || value.version !== 1 || value.algorithm !== 'dpapi-current-user'
    || typeof value.ciphertext !== 'string' || !value.ciphertext.length || value.ciphertext.length > 43692
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.ciphertext)
    || Buffer.from(value.ciphertext, 'base64').toString('base64') !== value.ciphertext) throw fail('BUDGET_CORRUPT')
  return value
}
function document(value) {
  if (!exact(value, ['schemaVersion', 'lastSeenAt', 'reservations']) || value.schemaVersion !== 1
    || !Number.isSafeInteger(value.lastSeenAt) || value.lastSeenAt < 0 || !Array.isArray(value.reservations)
    || value.reservations.length > MAX_DAY || value.reservations.some((stamp, index, all) => !Number.isSafeInteger(stamp)
      || stamp < 0 || stamp > value.lastSeenAt || (index > 0 && stamp < all[index - 1]))) throw fail('BUDGET_CORRUPT')
  return value
}
function createBudget(root, options = {}) {
  if (typeof root !== 'string' || !root || root.length > 32767 || root.includes('\0') || !path.isAbsolute(root) || /^[/\\]{2}/.test(root)
    || path.resolve(root) === path.parse(path.resolve(root)).root) throw fail('BUDGET_UNSAFE_PATH')
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Reflect.ownKeys(options).some(key => !['now', 'protect', 'unprotect', 'fs'].includes(key)
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(options, key), 'value'))) throw fail('BUDGET_INVALID')
  const injected = Object.hasOwn(options, 'protect') || Object.hasOwn(options, 'unprotect')
  if (injected && (typeof options.protect !== 'function' || typeof options.unprotect !== 'function')) throw fail('BUDGET_INVALID')
  const io = options.fs || nativeFs, now = options.now || Date.now
  if (typeof now !== 'function') throw fail('BUDGET_INVALID')
  const protect = injected ? options.protect : vault.protectString, unprotect = injected ? options.unprotect : vault.unprotectString
  const directory = path.join(path.resolve(root), '_private'), target = path.join(directory, 'autonomy-budget.json'), lock = target + '.lock'
  if (path.relative(path.parse(target).root, target).split(path.sep).some(part => /[<>:"|?*]/.test(part) || /[. ]$/.test(part))) throw fail('BUDGET_UNSAFE_PATH')
  let highWater = 0, seenDocument = false, decoded = null
  function stat(name) { try { return io.lstatSync(name) } catch (error) { if (error?.code === 'ENOENT') return null; throw error } }
  function checkPath(name) {
    const parents = []; let p = path.dirname(name)
    for (;;) { parents.push(p); const next = path.dirname(p); if (next === p) break; p = next }
    for (const parent of parents.reverse()) { const s = stat(parent); if (s && (s.isSymbolicLink() || !s.isDirectory())) throw fail('BUDGET_UNSAFE_PATH') }
    const s = stat(name)
    if (s && (s.isSymbolicLink() || !s.isFile() || s.nlink > 1)) throw fail('BUDGET_UNSAFE_PATH')
    return s
  }
  function read() {
    const before = checkPath(target)
    if (!before) { if (seenDocument) throw fail('BUDGET_CORRUPT'); return { schemaVersion: 1, lastSeenAt: 0, reservations: [] } }
    let fd
    try {
      if (before.size < 1 || before.size > MAX_BYTES) throw fail('BUDGET_CORRUPT')
      fd = io.openSync(target, nativeFs.constants.O_RDONLY | (nativeFs.constants.O_NOFOLLOW || 0))
      const s = io.fstatSync(fd)
      if (!s.isFile() || s.nlink > 1 || before.ino !== s.ino || before.dev !== s.dev) throw fail('BUDGET_UNSAFE_PATH')
      const bytes = io.readFileSync(fd)
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_BYTES) throw fail('BUDGET_CORRUPT')
      let data
      try {
        const record = cipher(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
        const plain = decoded?.ciphertext === record.ciphertext ? decoded.plain : unprotect(record, PURPOSE)
        if (typeof plain !== 'string' || Buffer.byteLength(plain, 'utf8') > 16384) throw fail('BUDGET_CORRUPT')
        data = document(JSON.parse(plain))
        decoded = { ciphertext: record.ciphertext, plain }
      } catch { decoded = null; throw fail('BUDGET_CORRUPT') }
      seenDocument = true; return data
    } finally { if (fd !== undefined) { try { io.closeSync(fd) } catch {} } }
  }
  function timestamp(doc) {
    const value = now()
    if (!Number.isSafeInteger(value) || value < 0) throw fail('BUDGET_CLOCK')
    if (value < Math.max(highWater, doc.lastSeenAt)) throw fail('BUDGET_CLOCK')
    highWater = value; return value
  }
  function summarize(doc, at, caps) {
    const daily = doc.reservations.filter(stamp => stamp > at - DAY), hourly = daily.filter(stamp => stamp > at - HOUR)
    const blocked = hourly.length >= caps.maxCallsPerHour || daily.length >= caps.maxCallsPerDay
    const hourlyAt = hourly.length >= caps.maxCallsPerHour ? hourly[hourly.length - caps.maxCallsPerHour] + HOUR : 0
    const dailyAt = daily.length >= caps.maxCallsPerDay ? daily[daily.length - caps.maxCallsPerDay] + DAY : 0
    return { ok: !blocked, ...(blocked ? { code: 'BUDGET_LIMIT' } : {}), callsThisHour: hourly.length, callsToday: daily.length,
      ...caps, nextAllowedAt: blocked ? Math.max(hourlyAt, dailyAt) : null, persistent: true, window: 'rolling-24h' }
  }
  function failed(error, caps) {
    const allowed = ['BUDGET_INVALID', 'BUDGET_CORRUPT', 'BUDGET_UNSAFE_PATH', 'BUDGET_CLOCK', 'BUDGET_BUSY', 'BUDGET_ENCRYPTION']
    return { ok: false, code: allowed.includes(error?.code) ? error.code : 'BUDGET_IO',
      callsThisHour: null, callsToday: null, ...caps, nextAllowedAt: null, persistent: true, window: 'rolling-24h' }
  }
  function status(caps) {
    try { limits(caps); const doc = read(); return summarize(doc, timestamp(doc), caps) }
    catch (error) { return failed(error, {}) }
  }
  function reserve(caps) {
    let fd, owned = false, tempFd, temporary, ownsTemporary = false
    try {
      limits(caps); checkPath(target); checkPath(lock); io.mkdirSync(directory, { recursive: true }); checkPath(target); checkPath(lock)
      try { fd = io.openSync(lock, 'wx', 0o600); owned = true } catch (error) { if (error?.code === 'EEXIST') throw fail('BUDGET_BUSY'); throw error }
      // An unrecovered lock is never stolen, even when its recorded PID is gone.
      io.writeFileSync(fd, 'autonomy-budget-v1', 'utf8'); io.fsyncSync(fd)
      const doc = read(), at = timestamp(doc), result = summarize(doc, at, caps)
      if (!result.ok) return result
      const next = { schemaVersion: 1, lastSeenAt: at, reservations: [...doc.reservations.filter(stamp => stamp > at - DAY), at] }
      let serialized
      try { serialized = JSON.stringify(cipher(protect(JSON.stringify(document(next)), PURPOSE))) + '\n' }
      catch { throw fail('BUDGET_ENCRYPTION') }
      temporary = path.join(directory, '.autonomy-budget.' + crypto.randomUUID() + '.tmp')
      tempFd = io.openSync(temporary, 'wx', 0o600); ownsTemporary = true
      io.writeFileSync(tempFd, serialized, 'utf8'); io.fsyncSync(tempFd); io.closeSync(tempFd); tempFd = undefined
      checkPath(target); io.renameSync(temporary, target); ownsTemporary = false; seenDocument = true
      // Confirm a durable read before giving the caller permission to send.
      const confirmed = read()
      if (JSON.stringify(confirmed) !== JSON.stringify(next)) throw fail('BUDGET_IO')
      return { ...summarize(next, at, caps), ok: true, code: null, reserved: true }
    } catch (error) { return failed(error, {}) }
    finally {
      if (tempFd !== undefined) { try { io.closeSync(tempFd) } catch {} }
      if (ownsTemporary) { try { io.unlinkSync(temporary) } catch {} }
      if (fd !== undefined) { try { io.closeSync(fd) } catch {} }
      if (owned) { try { io.unlinkSync(lock) } catch {} }
    }
  }
  return Object.freeze({ status, reserve })
}
module.exports = { createBudget, PURPOSE, MAX_DAY }
