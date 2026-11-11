'use strict';

// Main-process only. Separate document and purpose, never the provider vault.
const nativeFs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');
const { DEFAULT_PERSONA, validatePersona } = require('./persona-schema');
const vault = require('./secret-vault');
const PURPOSE = 'dafeiyu-persona-v1';
const MAX_FILE_BYTES = 262144;
const MAX_HISTORY = 5;
const messages = Object.freeze({
  PERSONA_INVALID: 'Persona data or revision is invalid.',
  PERSONA_CONFLICT: 'The persona revision changed. Reload before saving.',
  PERSONA_CORRUPT: 'The persona document cannot be safely read. It was not overwritten.',
  PERSONA_UNSAFE_PATH: 'The persona path is not a regular local file path.',
  PERSONA_ENCRYPTION_ERROR: 'Persona encryption failed. The previous version was preserved.',
  PERSONA_IO_ERROR: 'Persona storage failed. The previous version was preserved.',
  PERSONA_BUSY: 'Another persona write or an unrecovered write lock is present.',
  PERSONA_REVISION_NOT_FOUND: 'That persona revision is not retained.',
});
function failure(code) { const error = new Error(messages[code]); error.code = code; return error; }
const hasCode = error => error && Object.hasOwn(messages, error.code);
function record(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure('PERSONA_CORRUPT');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key)
    || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value'))) throw failure('PERSONA_CORRUPT');
  return Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
}
function cipherRecord(value) {
  const p = record(value, ['version', 'algorithm', 'ciphertext']);
  if (p.version !== 1 || p.algorithm !== 'dpapi-current-user' || typeof p.ciphertext !== 'string'
    || p.ciphertext.length > 43692 || !p.ciphertext.length
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(p.ciphertext)) throw failure('PERSONA_CORRUPT');
  const bytes = Buffer.from(p.ciphertext, 'base64');
  if (!bytes.length || bytes.length > 32768 || bytes.toString('base64') !== p.ciphertext) throw failure('PERSONA_CORRUPT');
  return { version: 1, algorithm: 'dpapi-current-user', ciphertext: p.ciphertext };
}
function revision(value, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw failure('PERSONA_INVALID');
  return value;
}
function createPersonaStore(file, options = {}) {
  if (typeof file !== 'string' || !file || file.length > 32767 || file.includes('\0') || !path.isAbsolute(file)
    || /^[/\\]{2}/.test(file) || path.resolve(file) === path.parse(path.resolve(file)).root) throw failure('PERSONA_UNSAFE_PATH');
  let settings;
  try {
    if (!options || typeof options !== 'object' || Array.isArray(options)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(options))) throw failure('PERSONA_INVALID');
    const descriptors = Object.getOwnPropertyDescriptors(options);
    if (Reflect.ownKeys(descriptors).some(key => !['protect', 'unprotect', 'fs'].includes(key)
      || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value'))) throw failure('PERSONA_INVALID');
    settings = Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]));
  } catch { throw failure('PERSONA_INVALID'); }
  const injected = Object.hasOwn(settings, 'protect') || Object.hasOwn(settings, 'unprotect');
  if (injected && (typeof settings.protect !== 'function' || typeof settings.unprotect !== 'function')) throw failure('PERSONA_INVALID');
  const protect = injected ? settings.protect : vault.protectString;
  const unprotect = injected ? settings.unprotect : vault.unprotectString;
  if (Object.hasOwn(settings, 'fs') && (!settings.fs || typeof settings.fs !== 'object')) throw failure('PERSONA_INVALID');
  const io = settings.fs || nativeFs;
  const required = ['lstatSync', 'fstatSync', 'readFileSync', 'mkdirSync', 'openSync', 'writeFileSync', 'fsyncSync', 'closeSync', 'renameSync', 'unlinkSync'];
  if (required.some(name => typeof io[name] !== 'function')) throw failure('PERSONA_INVALID');
  const target = path.resolve(file);
  const directory = path.dirname(target);
  const lock = target + '.lock';
  // At most five already-validated plaintexts, never persisted or exposed by
  // reference. Every read still validates the file, ciphertext and revisions.
  let decodedCache = new Map();

  function remember(entries) {
    decodedCache = new Map(entries.map(({ sealed, revision, changedAt, persona }) =>
      [sealed.ciphertext, { revision, changedAt, persona: validatePersona(persona) }]));
  }

  function statOrMissing(name) {
    try { return io.lstatSync(name); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
  }
  function checkPath(name, fileMayBeMissing = true) {
    const chain = []; let ancestor = path.dirname(name);
    while (true) { chain.push(ancestor); const parent = path.dirname(ancestor); if (parent === ancestor) break; ancestor = parent; }
    for (const folder of chain.reverse()) {
      const stat = statOrMissing(folder);
      if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) throw failure('PERSONA_UNSAFE_PATH');
    }
    const stat = statOrMissing(name);
    if (stat && (stat.isSymbolicLink() || !stat.isFile() || stat.nlink > 1)) throw failure('PERSONA_UNSAFE_PATH');
    if (!stat && !fileMayBeMissing) throw failure('PERSONA_IO_ERROR');
    return stat;
  }
  function empty() { return { revision: 0, entries: [], exists: false }; }
  function load() {
    let descriptor;
    try {
      const before = checkPath(target);
      if (!before) { decodedCache.clear(); return empty(); }
      if (before.size < 1 || before.size > MAX_FILE_BYTES) throw failure('PERSONA_CORRUPT');
      descriptor = io.openSync(target, nativeFs.constants.O_RDONLY | (nativeFs.constants.O_NOFOLLOW || 0));
      const opened = io.fstatSync(descriptor);
      if (!opened.isFile() || opened.nlink > 1
        || (before.ino !== undefined && opened.ino !== undefined && before.ino !== opened.ino)
        || (before.dev !== undefined && opened.dev !== undefined && before.dev !== opened.dev)) throw failure('PERSONA_UNSAFE_PATH');
      if (opened.size < 1 || opened.size > MAX_FILE_BYTES) throw failure('PERSONA_CORRUPT');
      const bytes = io.readFileSync(descriptor);
      if (!Buffer.isBuffer(bytes) || bytes.length > MAX_FILE_BYTES) throw failure('PERSONA_CORRUPT');
      let raw;
      try { raw = record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), ['schemaVersion', 'kind', 'revision', 'records']); }
      catch { throw failure('PERSONA_CORRUPT'); }
      if (raw.schemaVersion !== 1 || raw.kind !== 'dafeiyu-persona' || !Number.isSafeInteger(raw.revision) || raw.revision < 1
        || !Array.isArray(raw.records) || raw.records.length < 1 || raw.records.length > MAX_HISTORY) throw failure('PERSONA_CORRUPT');
      const entries = raw.records.map((encrypted, index) => {
        try {
          const sealed = cipherRecord(encrypted);
          let candidate = decodedCache.get(sealed.ciphertext);
          if (!candidate) {
            const decrypted = unprotect(sealed, PURPOSE);
            if (typeof decrypted !== 'string' || Buffer.byteLength(decrypted, 'utf8') > 16384
              || Buffer.from(decrypted, 'utf8').toString('utf8') !== decrypted) throw failure('PERSONA_CORRUPT');
            candidate = JSON.parse(decrypted);
          }
          const entry = record(candidate, ['revision', 'changedAt', 'persona']);
          if (entry.revision !== raw.revision - raw.records.length + index + 1 || entry.revision < 1
            || typeof entry.changedAt !== 'string' || !Number.isFinite(Date.parse(entry.changedAt))
            || new Date(entry.changedAt).toISOString() !== entry.changedAt) throw failure('PERSONA_CORRUPT');
          return { revision: entry.revision, changedAt: entry.changedAt, persona: validatePersona(entry.persona), sealed };
        } catch { throw failure('PERSONA_CORRUPT'); }
      });
      remember(entries);
      return { revision: raw.revision, entries, exists: true };
    } catch (error) { decodedCache.clear(); throw hasCode(error) ? error : failure('PERSONA_IO_ERROR'); }
    finally { if (descriptor !== undefined) { try { io.closeSync(descriptor); } catch {} } }
  }
  function snapshot(document) {
    return { revision: document.revision,
      persona: validatePersona(document.entries.length ? document.entries.at(-1).persona : DEFAULT_PERSONA),
      history: document.entries.slice().reverse().map(({ revision, changedAt }) => ({ revision, changedAt })), exists: document.exists };
  }
  function replace(document) {
    const serialized = JSON.stringify({ schemaVersion: 1, kind: 'dafeiyu-persona', revision: document.revision,
      records: document.entries.map(entry => entry.sealed) }) + '\n';
    if (Buffer.byteLength(serialized, 'utf8') > MAX_FILE_BYTES) throw failure('PERSONA_IO_ERROR');
    const temporary = path.join(directory, '.' + path.basename(target) + '.' + crypto.randomUUID() + '.tmp');
    let fd, owned = false;
    try {
      checkPath(target);
      fd = io.openSync(temporary, 'wx', 0o600); owned = true;
      io.writeFileSync(fd, serialized, 'utf8'); io.fsyncSync(fd); io.closeSync(fd); fd = undefined;
      checkPath(target);
      io.renameSync(temporary, target); owned = false;
    } catch (error) { throw hasCode(error) ? error : failure('PERSONA_IO_ERROR'); }
    finally {
      if (fd !== undefined) { try { io.closeSync(fd); } catch {} }
      if (owned) { try { io.unlinkSync(temporary); } catch {} }
    }
  }
  function update(expectedRevision, select) {
    revision(expectedRevision);
    let lockFd, ownsLock = false;
    try {
      checkPath(target); checkPath(lock);
      io.mkdirSync(directory, { recursive: true });
      checkPath(target); checkPath(lock);
      try { lockFd = io.openSync(lock, 'wx', 0o600); ownsLock = true; }
      catch (error) { if (error?.code === 'EEXIST') throw failure('PERSONA_BUSY'); throw error; }
      io.writeFileSync(lockFd, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }), 'utf8');
      const current = load();
      if (current.revision !== expectedRevision) throw failure('PERSONA_CONFLICT');
      if (current.revision >= Number.MAX_SAFE_INTEGER) throw failure('PERSONA_INVALID');
      const persona = validatePersona(select(current));
      const entry = { revision: current.revision + 1, changedAt: new Date().toISOString(), persona };
      try { entry.sealed = cipherRecord(protect(JSON.stringify(entry), PURPOSE)); }
      catch { throw failure('PERSONA_ENCRYPTION_ERROR'); }
      if (current.entries.some(previous => previous.sealed.ciphertext === entry.sealed.ciphertext)) throw failure('PERSONA_ENCRYPTION_ERROR');
      const next = { revision: entry.revision, entries: [...current.entries, entry].slice(-MAX_HISTORY), exists: true };
      replace(next);
      remember(next.entries);
      return snapshot(next);
    } catch (error) { throw hasCode(error) ? error : failure('PERSONA_IO_ERROR'); }
    finally {
      if (lockFd !== undefined) { try { io.closeSync(lockFd); } catch {} }
      if (ownsLock) { try { io.unlinkSync(lock); } catch {} }
    }
  }
  return Object.freeze({
    read: () => snapshot(load()),
    commit(persona, expectedRevision) { const clean = validatePersona(persona); return update(expectedRevision, () => clean); },
    rollback(targetRevision, expectedRevision) {
      revision(targetRevision, 1);
      return update(expectedRevision, document => {
        const found = document.entries.find(entry => entry.revision === targetRevision);
        if (!found) throw failure('PERSONA_REVISION_NOT_FOUND');
        return found.persona;
      });
    },
    reset: expectedRevision => update(expectedRevision, () => DEFAULT_PERSONA),
  });
}
module.exports = Object.freeze({ createPersonaStore, PURPOSE, MAX_FILE_BYTES, MAX_HISTORY });
