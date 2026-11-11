'use strict';
const { record, array, failure } = require('./memory-record-store');
const { validateStoredEntry, isSensitiveText } = require('./memory-schema');
const LIMITS = Object.freeze({ events: 200, summary1: 50, summary2: 12, summary3: 4, suggestions: 10,
  maxNodes: 2048, maxLifetimeIds: 2048, maxParents: 8, maxDepth: 4, maxTextBytes: 512, maxTextChars: 200,
  maxPlainBytes: 768 * 1024, maxFileBytes: 1792 * 1024, maxCombinedBytes: 2 * 1024 * 1024 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PRESENTATIONS = Object.freeze({ short_response: Object.freeze({ maxSpeechCharacters: 80 }), less_questions: Object.freeze({ questionFrequency: 'less' }) });
function signalsFor(text) {
  if (typeof text !== 'string' || text.length > 2048 || Buffer.from(text, 'utf8').toString('utf8') !== text) throw failure('MEMORY_INVALID');
  const value = text.normalize('NFKC').toLowerCase(), signals = [];
  // Quoted, hypothetical, third-party or model wording is not a user's own
  // style preference, even when somebody explicitly saved it as an event.
  if (/["“”「」『』\x60]|他说|她说|他们|她希望|他希望|模型|助手|假如|如果|例如|比如|转述|引用|\b(?:he|she|they|model|assistant|example|hypothetical)\b/u.test(value)) return signals;
  if (/(?:回答|回复|说话|表达).{0,8}(?:简短|简洁|精炼|简明)|(?:喜欢|希望|请|偏好).{0,8}(?:简短|简洁|精炼|简明)(?:的)?(?:回答|回复|表达)?|\b(?:brief|concise)\s+(?:answers|responses)\b/u.test(value)
    && !/(?:不喜欢|不要|不想|不希望|讨厌).{0,8}(?:简短|简洁|精炼|简明)/u.test(value)) signals.push('short_response');
  if (/少(?:问|提问)|不要.{0,5}(?:追问|连续提问|反复问)|别.{0,5}追问|不喜欢.{0,5}追问|\b(?:fewer|less) questions\b/u.test(value)) signals.push('less_questions');
  return signals;
}
function validateNode(input) {
  const node = record(input, ['schemaVersion', 'id', 'type', 'level', 'status', 'text', 'parents', 'createdAt', 'confirmedAt',
    'occurredAt', 'expiresAt', 'pinned', 'importance', 'useInChat', 'destinationId', 'pattern', 'decision', 'decidedAt', 'signals', 'source'], 'MEMORY_INVALID');
  if (node.schemaVersion !== 1 || !['event', 'summary', 'suggestion'].includes(node.type) || !['active', 'consumed'].includes(node.status)
    || !Number.isInteger(node.level) || !Number.isInteger(node.importance) || node.importance < 0 || node.importance > 3) throw failure('MEMORY_INVALID');
  const check = validateStoredEntry({ schemaVersion: 2, id: node.id, kind: 'interest', text: node.text === null ? '无正文谱系' : node.text,
    source: node.source, createdAt: node.createdAt, confirmedAt: node.confirmedAt, expiresAt: node.expiresAt, pinned: node.pinned,
    useInChat: node.useInChat, destinationId: node.destinationId, supersedesId: null, importance: node.importance });
  const parents = array(node.parents, LIMITS.maxParents).slice();
  if (parents.some(id => typeof id !== 'string' || !UUID.test(id) || id === check.id) || new Set(parents).size !== parents.length) throw failure('MEMORY_INVALID');
  const signals = array(node.signals, 2).slice();
  if (signals.some(value => typeof value !== 'string' || !Object.hasOwn(PRESENTATIONS, value)) || new Set(signals).size !== signals.length) throw failure('MEMORY_INVALID');
  const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
  if (node.occurredAt !== null && !iso(node.occurredAt)) throw failure('MEMORY_INVALID');
  if (node.type === 'event') {
    if (node.level !== 0 || parents.length || node.pattern !== null || node.decision !== null || node.decidedAt !== null) throw failure('MEMORY_INVALID');
  } else if (node.type === 'summary') {
    if (node.level < 1 || node.level > 3 || parents.length < 2 || node.occurredAt !== null || node.pattern !== null || node.decision !== null || node.decidedAt !== null || signals.length) throw failure('MEMORY_INVALID');
  } else if (node.level !== 4 || parents.length < 2 || node.status !== 'active' || node.occurredAt !== null
    || typeof node.pattern !== 'string' || !Object.hasOwn(PRESENTATIONS, node.pattern) || !['pending', 'accepted'].includes(node.decision) || signals.length
    || (node.decision === 'pending' ? node.decidedAt !== null || node.useInChat : !iso(node.decidedAt) || Date.parse(node.decidedAt) < Date.parse(check.createdAt))) throw failure('MEMORY_INVALID');
  if (node.status === 'consumed' ? node.text !== null || node.useInChat || node.destinationId !== null : typeof node.text !== 'string') throw failure('MEMORY_INVALID');
  return { schemaVersion: 1, id: check.id, type: node.type, level: node.level, status: node.status,
    text: node.text === null ? null : check.text, parents, createdAt: check.createdAt, confirmedAt: check.confirmedAt,
    occurredAt: node.occurredAt, expiresAt: check.expiresAt, pinned: check.pinned, importance: check.importance,
    useInChat: check.useInChat, destinationId: check.destinationId, pattern: node.pattern, decision: node.decision,
    decidedAt: node.decidedAt, signals, source: check.source };
}
function rootsFor(id, byId, visited = new Set()) {
  if (visited.has(id)) throw failure('MEMORY_INVALID'); const node = byId.get(id); if (!node) throw failure('MEMORY_INVALID');
  if (node.type === 'event') return [id];
  const seen = new Set(visited); seen.add(id);
  return [...new Set(node.parents.flatMap(parent => rootsFor(parent, byId, seen)))];
}
function validateNodes(nodes) {
  if (nodes.length > LIMITS.maxNodes) throw failure('MEMORY_LIMIT');
  const byId = new Map(nodes.map(node => [node.id, node])); if (byId.size !== nodes.length) throw failure('MEMORY_INVALID');
  const counts = { events: 0, summary1: 0, summary2: 0, summary3: 0, suggestions: 0 };
  for (const node of nodes) {
    if (node.status === 'active') counts[node.type === 'event' ? 'events' : node.type === 'suggestion' ? 'suggestions' : 'summary' + node.level]++;
    if (node.type === 'event') continue;
    for (const id of node.parents) {
      const parent = byId.get(id);
      if (!parent || parent.type === 'suggestion' || (node.type === 'summary' && parent.level !== node.level - 1)) throw failure('MEMORY_INVALID');
      if (parent.expiresAt !== null && (node.expiresAt === null || Date.parse(node.expiresAt) > Date.parse(parent.expiresAt))) throw failure('MEMORY_INVALID');
    }
    const roots = rootsFor(node.id, byId);
    if (roots.length < 2) throw failure('MEMORY_INVALID');
    if (node.type === 'suggestion' && roots.filter(id => byId.get(id).signals.includes(node.pattern)).length < 2) throw failure('MEMORY_INVALID');
  }
  if (Object.keys(counts).some(key => counts[key] > LIMITS[key])) throw failure('MEMORY_LIMIT');
  return nodes;
}
function validateNew(node) {
  if (node.status !== 'active' || isSensitiveText(node.text)) throw failure(node.status !== 'active' ? 'MEMORY_INVALID' : 'MEMORY_SENSITIVE');
  if (node.type === 'event' && JSON.stringify(node.signals) !== JSON.stringify(signalsFor(node.text))) throw failure('MEMORY_INVALID');
}
function cascadeIds(nodes, initial) {
  const ids = new Set(initial); let changed = true;
  while (changed) { changed = false; for (const node of nodes) if (!ids.has(node.id) && node.parents.some(id => ids.has(id))) { ids.add(node.id); changed = true; } }
  return ids;
}
module.exports = Object.freeze({ LIMITS, PRESENTATIONS, validateNode, validateNodes, validateNew, rootsFor, signalsFor, cascadeIds });
