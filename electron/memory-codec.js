'use strict';
const crypto = require('node:crypto');
const CHUNK_BYTES = 15000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function invalid() { throw new Error('Encrypted memory document is invalid.'); }
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length || keys.some(key => !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key], 'value'))) invalid();
  return value;
}
function cipher(value) {
  exact(value, ['version', 'algorithm', 'ciphertext']);
  if (value.version !== 1 || value.algorithm !== 'dpapi-current-user' || typeof value.ciphertext !== 'string'
    || !value.ciphertext.length || value.ciphertext.length > 43692 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.ciphertext)) invalid();
  const bytes = Buffer.from(value.ciphertext, 'base64');
  if (!bytes.length || bytes.length > 32768 || bytes.toString('base64') !== value.ciphertext) invalid();
  return { version: 1, algorithm: value.algorithm, ciphertext: value.ciphertext };
}
function envelope(value, maximum) {
  if (value?.version === 1) return cipher(value);
  exact(value, ['version', 'algorithm', 'documentId', 'chunks']);
  if (value.version !== 2 || value.algorithm !== 'dpapi-chunks-current-user' || !UUID.test(value.documentId)
    || !Array.isArray(value.chunks) || value.chunks.length < 1 || value.chunks.length > Math.ceil(maximum / CHUNK_BYTES) + 1) invalid();
  return { version: 2, algorithm: value.algorithm, documentId: value.documentId, chunks: value.chunks.map(cipher) };
}
function checkedText(text, maximum) {
  if (typeof text !== 'string' || !text.length || Buffer.byteLength(text, 'utf8') > maximum || Buffer.from(text, 'utf8').toString('utf8') !== text) invalid();
  return text;
}
function checkedParts(values, count, validate) {
  if (!Array.isArray(values) || Object.getPrototypeOf(values) !== Array.prototype || values.length !== count) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(values);
  if (Reflect.ownKeys(descriptors).length !== count + 1) invalid();
  return Array.from({ length: count }, (_, index) => {
    if (!descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], 'value')) invalid();
    return validate(descriptors[index].value);
  });
}
function seal(text, purpose, protect, maximum) {
  checkedText(text, maximum);
  if (Buffer.byteLength(text, 'utf8') <= CHUNK_BYTES) return cipher(protect(text, purpose));
  const parts = []; let current = '', bytes = 0;
  for (const char of text) {
    const size = Buffer.byteLength(char, 'utf8');
    if (bytes + size > CHUNK_BYTES) { parts.push(current); current = ''; bytes = 0; }
    current += char; bytes += size;
  }
  if (current) parts.push(current);
  const documentId = crypto.randomUUID();
  const items = parts.map((text, index) => ({ text, purpose: `${purpose}:v2:${documentId}:${index}:${parts.length}` }));
  const encrypted = typeof protect.batch === 'function' ? protect.batch(items) : items.map(item => protect(item.text, item.purpose));
  return { version: 2, algorithm: 'dpapi-chunks-current-user', documentId,
    chunks: checkedParts(encrypted, parts.length, cipher) };
}
function unseal(value, purpose, unprotect, maximum) {
  const safe = envelope(value, maximum);
  if (safe.version === 1) return checkedText(unprotect(safe, purpose), Math.min(maximum, CHUNK_BYTES));
  const items = safe.chunks.map((record, index) => ({ record, purpose: `${purpose}:v2:${safe.documentId}:${index}:${safe.chunks.length}` }));
  const decrypted = typeof unprotect.batch === 'function' ? unprotect.batch(items) : items.map(item => unprotect(item.record, item.purpose));
  const parts = checkedParts(decrypted, safe.chunks.length, part => checkedText(part, CHUNK_BYTES));
  return checkedText(parts.join(''), maximum);
}
module.exports = Object.freeze({ CHUNK_BYTES, envelope, seal, unseal });
