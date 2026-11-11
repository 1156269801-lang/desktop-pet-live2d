'use strict';

const MAX_ENTRIES = 40;
const MAX_DOCUMENT_BYTES = 60000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const messages = Object.freeze({
  MEMORY_INVALID: 'Memory data is invalid.',
  MEMORY_SENSITIVE: 'This memory may contain sensitive information and was not accepted.',
});
function failure(code = 'MEMORY_INVALID') { const error = new Error(messages[code]); error.code = code; return error; }
function record(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key)
    || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value'))) throw failure();
  return Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
}
function uuid(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw failure();
  return value.toLowerCase();
}
function iso(value) {
  if (typeof value !== 'string' || value.length > 35) throw failure();
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts || +parts[2] > 23 || +parts[3] > 59 || +parts[4] > 59) throw failure();
  const midnight = new Date(parts[1] + 'T00:00:00.000Z');
  const timestamp = Date.parse(value);
  if (!Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== parts[1]
    || !Number.isFinite(timestamp)) throw failure();
  return new Date(timestamp).toISOString();
}
function luhnCandidate(digits) {
  if (digits.length < 13 || digits.length > 19 || digits[0] === '0' || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0, doubled = false;
  for (let index = digits.length - 1; index >= 0; index--) {
    let value = Number(digits[index]);
    if (doubled) { value *= 2; if (value > 9) value -= 9; }
    sum += value; doubled = !doubled;
  }
  return sum % 10 === 0;
}
// Deliberately heuristic, not a complete sensitive-data detector. NFKC is used
// ONLY as a detection view: the stored text remains NFC and is never rewritten.
function isSensitiveText(text) {
  if (typeof text !== 'string' || text.length > 2048 || Buffer.from(text, 'utf8').toString('utf8') !== text) return true;
  const value = text.normalize('NFKC');
  if (/(?:银行卡|信用卡|卡号)\s*(?:(?:号码?|尾号|末四位|末4位)\s*)?(?:[=:]|是|为)?\s*\d/u.test(value)) return true;
  // Consume each complete digit/separator run before checking its length; do
  // not accidentally match the final 13-19 digits of a longer identifier.
  const numericRuns = value.match(/\d(?:[\d -]*\d)?/g) || [];
  if (numericRuns.some(run => luhnCandidate(run.replace(/[ -]/g, '')))) return true;
  return /\bsk-[a-z0-9_-]{4,}/i.test(value)
    || /\bBearer\s+\S+/i.test(value)
    || /(?:password|passwd|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|token|密码|密钥)\s*[=:：]\s*\S+/i.test(value)
    || /-----BEGIN\s+(?:[A-Z0-9 ]*PRIVATE KEY|[A-Z0-9 ]*CERTIFICATE)-----/i.test(value)
    || /(?:\b(?:private[_ -]?key|seed[_ -]?phrase)|助记词)\s*(?:[=:：]|是|为)\s*\S+/i.test(value)
    || /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/i.test(value)
    || /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+(?::[^\s/@]*)?@/i.test(value)
    || /(?:^|[^0-9])(?:\+?86[- .]?)?1[3-9]\d{9}(?!\d)/.test(value)
    || /(?:^|[^0-9])\+\d{1,3}[ -]?(?:\d[ ()-]?){7,14}\d(?!\d)/.test(value)
    || /(?:^|[^0-9])(?:\(0\d{2,3}\)|0\d{2,3})[- ]?\d{7,8}(?!\d)/.test(value)
    || /(?:^|[^0-9])(?:\(\d{3}\)|\d{3})[- .]\d{3}[- .]\d{4}(?!\d)/.test(value)
    || /(?:^|[^0-9])\d{17}[0-9Xx](?![0-9])/i.test(value)
    || /(?:^|[^0-9])\d{8}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}(?!\d)/.test(value)
    || /(?:^|[^a-z0-9])(?:0x)?[0-9a-f]{64}(?![a-z0-9])/i.test(value);
}
// Existing encrypted records must remain readable/manageable when heuristics
// become stricter. This function validates structure, not permission to send.
function validateStoredEntry(input) {
  try {
    const version = Object.getOwnPropertyDescriptor(input || {}, 'schemaVersion')?.value;
    const entry = record(input, ['schemaVersion', 'id', 'kind', 'text', 'source', 'createdAt', 'confirmedAt',
      'expiresAt', 'pinned', 'useInChat', 'destinationId', 'supersedesId', ...(version === 2 ? ['importance'] : [])]);
    const source = record(entry.source, ['kind', 'id']);
    if (![1, 2].includes(entry.schemaVersion) || (entry.schemaVersion === 2 && (!Number.isInteger(entry.importance) || entry.importance < 0 || entry.importance > 3))
      || !['name', 'preference', 'interest'].includes(entry.kind)
      || source.kind !== 'user-confirmed-settings' || typeof entry.text !== 'string'
      || entry.text.length > 2048 || Buffer.from(entry.text, 'utf8').toString('utf8') !== entry.text
      || typeof entry.pinned !== 'boolean' || typeof entry.useInChat !== 'boolean') throw failure();
    const normalized = entry.text.replace(/\r\n/g, '\n').normalize('NFC');
    const text = normalized.trim();
    if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(normalized.replace(/\n/g, ''))
      || !text || Buffer.byteLength(text, 'utf8') > 512 || Array.from(text).length > (entry.kind === 'name' ? 40 : 200)) throw failure();
    const id = uuid(entry.id), sourceId = uuid(source.id);
    const createdAt = iso(entry.createdAt), confirmedAt = iso(entry.confirmedAt);
    let expiresAt = null;
    if (entry.pinned) { if (entry.expiresAt !== null) throw failure(); }
    else { expiresAt = iso(entry.expiresAt); if (Date.parse(expiresAt) <= Date.parse(confirmedAt)) throw failure(); }
    let destinationId = null;
    if (entry.useInChat) {
      if (typeof entry.destinationId !== 'string' || !/^[a-f0-9]{64}$/i.test(entry.destinationId)) throw failure();
      destinationId = entry.destinationId.toLowerCase();
    } else if (entry.destinationId !== null) throw failure();
    const supersedesId = entry.supersedesId === null ? null : uuid(entry.supersedesId);
    if (supersedesId === id) throw failure();
    return { schemaVersion: entry.schemaVersion, id, kind: entry.kind, text, source: { kind: source.kind, id: sourceId },
      createdAt, confirmedAt, expiresAt, pinned: entry.pinned, useInChat: entry.useInChat, destinationId, supersedesId,
      ...(entry.schemaVersion === 2 ? { importance: entry.importance } : {}) };
  } catch (error) {
    throw failure();
  }
}
function validateEntry(input) {
  const entry = validateStoredEntry(input);
  if (isSensitiveText(entry.text)) throw failure('MEMORY_SENSITIVE');
  return entry;
}
module.exports = Object.freeze({ validateEntry, validateStoredEntry, isSensitiveText, MAX_ENTRIES, MAX_DOCUMENT_BYTES });
