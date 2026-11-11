'use strict';
const { createRecordStore, failure, record, array } = require('./memory-record-store');
const { isSensitiveText } = require('./memory-schema');
const { LIMITS, validateNode, validateNodes, validateNew } = require('./memory-library-schema');
const PURPOSE = 'dafeiyu-memory-library-v1', DELETIONS_PURPOSE = 'dafeiyu-memory-library-deletions-v1';
function createMemoryLibraryStore(file, options = {}) {
  return createRecordStore(file, options, { purpose: PURPOSE, ledgerPurpose: DELETIONS_PURPOSE, ledgerName: 'memory-library-deletions.json',
    maxEntries: LIMITS.maxNodes, maxIds: LIMITS.maxLifetimeIds, maxPlainBytes: LIMITS.maxPlainBytes,
    maxFileBytes: LIMITS.maxFileBytes, maxCombinedBytes: LIMITS.maxCombinedBytes, validate: validateNode, validateSet: validateNodes,
    ledgerKeys: ['grants'],
    ledgerData: nodes => ({ grants: nodes.filter(node => node.useInChat).map(node => ({ id: node.id, destinationId: node.destinationId })) }),
    validateLedger(ledger) {
      const grants = array(ledger.grants, 276, 'MEMORY_CORRUPT').map(value => record(value, ['id', 'destinationId']));
      if (new Set(grants.map(value => value.id)).size !== grants.length || grants.some(value => !ledger.activeIds.includes(value.id)
        || typeof value.destinationId !== 'string' || !/^[a-f0-9]{64}$/.test(value.destinationId))) throw failure('MEMORY_CORRUPT');
    },
    applyLedger(nodes, ledger) {
      const grants = new Map(ledger.grants.map(value => [value.id, value.destinationId]));
      return nodes.map(node => node.useInChat && grants.get(node.id) !== node.destinationId ? { ...node, useInChat: false, destinationId: null } : node);
    },
    transition(next, byId) {
      for (const node of next) {
        const old = byId.get(node.id);
        if (!old) { validateNew(node); continue; }
        if (JSON.stringify(node) === JSON.stringify(old)) continue;
        const consumed = old.type !== 'suggestion' && old.status === 'active'
          && JSON.stringify(node) === JSON.stringify({ ...old, status: 'consumed', text: null, useInChat: false, destinationId: null });
        const accepted = old.type === 'suggestion' && old.decision === 'pending' && node.decision === 'accepted'
          && Date.parse(node.decidedAt) >= Date.parse(old.createdAt)
          && JSON.stringify(node) === JSON.stringify({ ...old, decision: 'accepted', decidedAt: node.decidedAt });
        const grantChanged = old.status === 'active' && (old.type !== 'suggestion' || old.decision === 'accepted')
          && (!node.useInChat || !isSensitiveText(node.text))
          && JSON.stringify(node) === JSON.stringify({ ...old, useInChat: node.useInChat, destinationId: node.destinationId });
        if (!consumed && !accepted && !grantChanged) throw failure('MEMORY_INVALID');
      }
    } });
}
module.exports = Object.freeze({ createMemoryLibraryStore, PURPOSE, DELETIONS_PURPOSE });
