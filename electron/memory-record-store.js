'use strict';
// Internal bounded encrypted store. Policies are local code, never renderer input.
const nativeFs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');
const vault = require('./secret-vault');
const codec = require('./memory-codec');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const codes = new Set(['MEMORY_INVALID', 'MEMORY_SENSITIVE', 'MEMORY_CONFLICT', 'MEMORY_CORRUPT', 'MEMORY_UNSAFE_PATH',
  'MEMORY_IO_ERROR', 'MEMORY_ENCRYPTION_ERROR', 'MEMORY_BUSY', 'MEMORY_LIMIT', 'MEMORY_CLEANUP_PENDING']);
function failure(code) { return Object.assign(new Error(code === 'MEMORY_CLEANUP_PENDING'
  ? 'Deletion protection was saved; snapshot cleanup is pending.' : 'Memory operation could not be safely completed.'), { code }); }
function mapped(error, fallback) { return failure(codes.has(error?.code) ? error.code : fallback); }
function record(value, keys, code = 'MEMORY_CORRUPT') {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure(code);
  const descriptors = Object.getOwnPropertyDescriptors(value), actual = Reflect.ownKeys(descriptors);
  if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key)
    || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value'))) throw failure(code);
  return Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
}
function array(value, maximum, code = 'MEMORY_INVALID') {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw failure(code);
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  if (keys.length !== value.length + 1 || keys.some(key => key !== 'length' && (typeof key !== 'string'
    || !/^(0|[1-9]\d*)$/.test(key) || +key >= value.length || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value')))) throw failure(code);
  return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function createRecordStore(file, options, policy) {
  if (typeof file !== 'string' || !file || file.length > 32767 || file.includes('\0') || !path.isAbsolute(file)
    || /^[/\\]{2}/.test(file) || path.resolve(file) === path.parse(path.resolve(file)).root) throw failure('MEMORY_UNSAFE_PATH');
  let settings;
  try {
    const keys = Reflect.ownKeys(Object.getOwnPropertyDescriptors(options));
    if (keys.some(key => !['protect', 'unprotect', 'fs', 'now'].includes(key))) throw failure('MEMORY_INVALID');
    settings = record(options, keys, 'MEMORY_INVALID');
  } catch { throw failure('MEMORY_INVALID'); }
  const injected = Object.hasOwn(settings, 'protect') || Object.hasOwn(settings, 'unprotect');
  if (injected && (typeof settings.protect !== 'function' || typeof settings.unprotect !== 'function')) throw failure('MEMORY_INVALID');
  const protect = injected ? settings.protect : vault.protectString, unprotect = injected ? settings.unprotect : vault.unprotectString;
  if (Object.hasOwn(settings, 'now') && typeof settings.now !== 'function') throw failure('MEMORY_INVALID');
  if (Object.hasOwn(settings, 'fs') && (!settings.fs || typeof settings.fs !== 'object')) throw failure('MEMORY_INVALID');
  const io = settings.fs || nativeFs, now = settings.now || Date.now;
  const required = ['lstatSync', 'fstatSync', 'readFileSync', 'mkdirSync', 'openSync', 'writeFileSync', 'fsyncSync', 'closeSync', 'renameSync', 'unlinkSync'];
  if (required.some(key => typeof io[key] !== 'function')) throw failure('MEMORY_INVALID');
  const target = path.resolve(file), directory = path.dirname(target), ledgerFile = path.join(directory, policy.ledgerName), lock = target + '.lock';
  if (target.toLowerCase() === ledgerFile.toLowerCase() || path.relative(path.parse(target).root, target).split(path.sep)
    .some(part => /[<>:"|?*]/.test(part) || /[. ]$/.test(part))) throw failure('MEMORY_UNSAFE_PATH');
  const cache = new Map();
  function normalize(value, code = 'MEMORY_INVALID') {
    if (Array.isArray(value) && value.length > policy.maxEntries) throw failure(code === 'MEMORY_INVALID' ? 'MEMORY_LIMIT' : code);
    const entries = array(value, policy.maxEntries, code).map(policy.validate);
    if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw failure(code);
    policy.validateSet?.(entries);
    return entries;
  }
  function stat(name) { try { return io.lstatSync(name); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; } }
  function safe(name) {
    const ancestors = []; let folder = path.dirname(name);
    for (;;) { ancestors.push(folder); const parent = path.dirname(folder); if (parent === folder) break; folder = parent; }
    for (const ancestor of ancestors.reverse()) { const s = stat(ancestor); if (s && (s.isSymbolicLink() || !s.isDirectory())) throw failure('MEMORY_UNSAFE_PATH'); }
    const s = stat(name); if (s && (s.isSymbolicLink() || !s.isFile() || s.nlink > 1)) throw failure('MEMORY_UNSAFE_PATH'); return s;
  }
  function readDocument(name, purpose, staged, sizes) {
    let fd;
    try {
      const before = safe(name); if (!before) { cache.delete(purpose); return null; }
      if (before.size < 1 || before.size > policy.maxFileBytes) throw failure('MEMORY_CORRUPT');
      fd = io.openSync(name, nativeFs.constants.O_RDONLY | (nativeFs.constants.O_NOFOLLOW || 0)); const opened = io.fstatSync(fd);
      if (!opened.isFile() || opened.nlink > 1 || (before.ino !== undefined && opened.ino !== undefined && before.ino !== opened.ino)
        || (before.dev !== undefined && opened.dev !== undefined && before.dev !== opened.dev)) throw failure('MEMORY_UNSAFE_PATH');
      if (opened.size < 1 || opened.size > policy.maxFileBytes) throw failure('MEMORY_CORRUPT');
      const bytes = io.readFileSync(fd);
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > policy.maxFileBytes) throw failure('MEMORY_CORRUPT');
      sizes.total += bytes.length; if (sizes.total > policy.maxCombinedBytes) throw failure('MEMORY_CORRUPT');
      try {
        const sealed = codec.envelope(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), policy.maxPlainBytes);
        const fingerprint = JSON.stringify(sealed), previous = cache.get(purpose);
        const hit = previous && previous.purpose === purpose && previous.fingerprint === fingerprint;
        if (!hit) cache.delete(purpose);
        const plaintext = hit ? previous.plaintext : codec.unseal(sealed, purpose, unprotect, policy.maxPlainBytes);
        const parsed = JSON.parse(plaintext); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw failure('MEMORY_CORRUPT');
        staged.set(purpose, { purpose, fingerprint, plaintext }); return parsed;
      } catch { throw failure('MEMORY_CORRUPT'); }
    } finally { if (fd !== undefined) { try { io.closeSync(fd); } catch {} } }
  }
  function load() {
    try {
      const staged = new Map(), sizes = { total: 0 };
      const rawMain = readDocument(target, policy.purpose, staged, sizes), rawLedger = readDocument(ledgerFile, policy.ledgerPurpose, staged, sizes);
      if (!rawMain && !rawLedger) { cache.clear(); return { revision: 0, entries: [], exists: false, deletedCount: 0, cleanupPending: false, ledger: null }; }
      if (!rawLedger) throw failure('MEMORY_CORRUPT');
      let ledger, main;
      try {
        ledger = record(rawLedger, ['schemaVersion', 'storeId', 'revision', 'activeIds', 'deletedIds', ...(policy.ledgerKeys || [])]);
        if (ledger.schemaVersion !== 1 || !UUID.test(ledger.storeId) || !Number.isSafeInteger(ledger.revision) || ledger.revision < 1) throw failure('MEMORY_CORRUPT');
        ledger.activeIds = array(ledger.activeIds, policy.maxEntries, 'MEMORY_CORRUPT'); ledger.deletedIds = array(ledger.deletedIds, policy.maxIds, 'MEMORY_CORRUPT');
        const all = [...ledger.activeIds, ...ledger.deletedIds];
        if (all.length > policy.maxIds || all.some(id => typeof id !== 'string' || !UUID.test(id)) || new Set(all).size !== all.length) throw failure('MEMORY_CORRUPT');
        policy.validateLedger?.(ledger);
        if (rawMain) {
          main = record(rawMain, ['schemaVersion', 'storeId', 'revision', 'entries']);
          if (main.schemaVersion !== 1 || main.storeId !== ledger.storeId || !Number.isSafeInteger(main.revision) || main.revision < 1 || main.revision > ledger.revision) throw failure('MEMORY_CORRUPT');
          main.entries = normalize(main.entries, 'MEMORY_CORRUPT'); if (main.entries.some(entry => !all.includes(entry.id))) throw failure('MEMORY_CORRUPT');
        }
      } catch { throw failure('MEMORY_CORRUPT'); }
      const active = new Set(ledger.activeIds);
      let clean = main ? main.entries.filter(entry => active.has(entry.id)) : [];
      if (policy.applyLedger) clean = policy.applyLedger(clean, ledger);
      try { policy.validateSet?.(clean); } catch { throw failure('MEMORY_CORRUPT'); }
      const pending = !main || main.revision !== ledger.revision || main.entries.length !== active.size || clean.length !== active.size;
      cache.clear(); cache.set(policy.ledgerPurpose, staged.get(policy.ledgerPurpose)); if (!pending) cache.set(policy.purpose, staged.get(policy.purpose));
      return { revision: ledger.revision, entries: clean, exists: !!main, deletedCount: ledger.deletedIds.length, cleanupPending: pending, ledger };
    } catch (error) { cache.clear(); throw mapped(error, 'MEMORY_IO_ERROR'); }
  }
  function snapshot(doc) { return { revision: doc.revision, entries: doc.entries.map(policy.validate), exists: doc.exists, deletedCount: doc.deletedCount, cleanupPending: doc.cleanupPending }; }
  function sealed(doc, purpose) {
    const plaintext = JSON.stringify(doc); if (Buffer.byteLength(plaintext, 'utf8') > policy.maxPlainBytes) throw failure('MEMORY_LIMIT');
    try { const result = JSON.stringify(codec.seal(plaintext, purpose, protect, policy.maxPlainBytes)) + '\n'; if (Buffer.byteLength(result) > policy.maxFileBytes) throw failure('MEMORY_LIMIT'); return result; }
    catch { throw failure('MEMORY_ENCRYPTION_ERROR'); }
  }
  function replace(name, contents) {
    const temporary = path.join(directory, '.' + path.basename(name) + '.' + crypto.randomUUID() + '.tmp'); let fd, owned = false;
    try { safe(name); fd = io.openSync(temporary, 'wx', 0o600); owned = true; io.writeFileSync(fd, contents, 'utf8'); io.fsyncSync(fd); io.closeSync(fd); fd = undefined; safe(name); io.renameSync(temporary, name); owned = false; }
    finally { if (fd !== undefined) { try { io.closeSync(fd); } catch {} } if (owned) { try { io.unlinkSync(temporary); } catch {} } }
  }
  function commit(value, expectedRevision) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw failure('MEMORY_INVALID');
    let clean; try { clean = normalize(value); } catch (error) { throw mapped(error, 'MEMORY_INVALID'); }
    let lockFd, owned = false, ledgerSaved = false;
    try {
      safe(target); safe(ledgerFile); safe(lock); io.mkdirSync(directory, { recursive: true }); safe(target); safe(ledgerFile); safe(lock);
      try { lockFd = io.openSync(lock, 'wx', 0o600); owned = true; } catch (error) { if (error?.code === 'EEXIST') throw failure('MEMORY_BUSY'); throw error; }
      const time = now(); if (!Number.isFinite(time) || !Number.isFinite(new Date(time).getTime())) throw failure('MEMORY_INVALID');
      io.writeFileSync(lockFd, JSON.stringify({ pid: process.pid, createdAt: new Date(time).toISOString() }), 'utf8');
      const current = load(); if (current.revision !== expectedRevision) throw failure('MEMORY_CONFLICT'); if (current.revision >= Number.MAX_SAFE_INTEGER) throw failure('MEMORY_INVALID');
      const active = new Set(current.ledger?.activeIds || []), deleted = new Set(current.ledger?.deletedIds || []), byId = new Map(current.entries.map(entry => [entry.id, entry]));
      const ids = new Set(clean.map(entry => entry.id));
      if (clean.some(entry => deleted.has(entry.id) || (active.has(entry.id) && !byId.has(entry.id)))) throw failure('MEMORY_INVALID');
      policy.transition(clean, byId);
      if (new Set([...active, ...deleted, ...ids]).size > policy.maxIds) throw failure('MEMORY_LIMIT');
      for (const id of active) if (!ids.has(id)) deleted.add(id);
      const revision = current.revision + 1, storeId = current.ledger?.storeId || crypto.randomUUID();
      const ledger = sealed({ schemaVersion: 1, storeId, revision, activeIds: [...ids], deletedIds: [...deleted], ...(policy.ledgerData?.(clean) || {}) }, policy.ledgerPurpose);
      const main = sealed({ schemaVersion: 1, storeId, revision, entries: clean }, policy.purpose);
      if (Buffer.byteLength(ledger) + Buffer.byteLength(main) > policy.maxCombinedBytes) throw failure('MEMORY_LIMIT');
      cache.clear(); replace(ledgerFile, ledger); ledgerSaved = true; replace(target, main);
      return snapshot({ revision, entries: clean, exists: true, deletedCount: deleted.size, cleanupPending: false });
    } catch (error) { cache.clear(); if (ledgerSaved) throw failure('MEMORY_CLEANUP_PENDING'); throw mapped(error, 'MEMORY_IO_ERROR'); }
    finally { if (lockFd !== undefined) { try { io.closeSync(lockFd); } catch {} } if (owned) { try { io.unlinkSync(lock); } catch {} } }
  }
  return Object.freeze({ read: () => snapshot(load()), commit });
}
module.exports = Object.freeze({ createRecordStore, record, array, failure });
