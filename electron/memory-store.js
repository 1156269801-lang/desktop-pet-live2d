'use strict';
const { createRecordStore, failure } = require('./memory-record-store');
const { validateEntry, validateStoredEntry, isSensitiveText, MAX_ENTRIES, MAX_DOCUMENT_BYTES } = require('./memory-schema');
const PURPOSE = 'dafeiyu-memory-v1', DELETIONS_PURPOSE = 'dafeiyu-memory-deletions-v1';
const MAX_FILE_BYTES = 192 * 1024, MAX_COMBINED_BYTES = 256 * 1024, MAX_IDS = 256;
function createMemoryStore(file, options = {}) {
  return createRecordStore(file, options, { purpose: PURPOSE, ledgerPurpose: DELETIONS_PURPOSE, ledgerName: 'memory-deletions.json',
    maxEntries: MAX_ENTRIES, maxIds: MAX_IDS, maxPlainBytes: MAX_DOCUMENT_BYTES, maxFileBytes: MAX_FILE_BYTES, maxCombinedBytes: MAX_COMBINED_BYTES,
    validate: validateStoredEntry,
    transition(clean, byId) {
      const ids = new Set(clean.map(entry => entry.id)), downgraded = new Set();
      for (const entry of clean) {
        if (byId.has(entry.id)) { if (JSON.stringify(byId.get(entry.id)) !== JSON.stringify(entry)) throw failure('MEMORY_INVALID'); continue; }
        const old = byId.get(entry.supersedesId);
        const privacyDowngrade = old && old.useInChat === true && isSensitiveText(old.text) && !ids.has(old.id) && !downgraded.has(old.id)
          && entry.useInChat === false && entry.destinationId === null && entry.source.id !== old.source.id
          && Date.parse(entry.confirmedAt) >= Date.parse(old.confirmedAt)
          && ['schemaVersion', 'text', 'kind', 'createdAt', 'expiresAt', 'pinned', 'importance'].every(key => entry[key] === old[key]);
        if (privacyDowngrade) downgraded.add(old.id); else validateEntry(entry);
      }
    } });
}
module.exports = Object.freeze({ createMemoryStore, PURPOSE, DELETIONS_PURPOSE, MAX_FILE_BYTES, MAX_COMBINED_BYTES, MAX_IDS });
