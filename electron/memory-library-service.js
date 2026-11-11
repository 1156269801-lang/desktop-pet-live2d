'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const { record, array, failure } = require('./memory-record-store');
const { isSensitiveText } = require('./memory-schema');
const { createMemoryLibraryStore } = require('./memory-library-store');
const { LIMITS, PRESENTATIONS, validateNode, rootsFor, signalsFor, cascadeIds } = require('./memory-library-schema');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const clone = value => JSON.parse(JSON.stringify(value));
const messages = { MEMORY_INVALID: '事件库输入或操作无效。', MEMORY_SENSITIVE: '疑似敏感内容不能写入事件库。',
  MEMORY_CONFLICT: '事件库版本已变化，请刷新并重新确认。', MEMORY_LIMIT: '事件、摘要、模式或谱系达到容量上限；不会自动丢弃内容。',
  MEMORY_CORRUPT: '事件库不可安全读取，未用空库覆盖；事实库仍可独立管理。', MEMORY_CLEANUP_PENDING: '事件库删除已受保护，清理尚未完成；请刷新重试。',
  MEMORY_BUSY: '事件库正写入或存在未恢复的锁。', MEMORY_PREVIEW_EXPIRED: '候选已过期或来源已变化，请重新预览。',
  MEMORY_DESTINATION_CHANGED: '模型目的地或授权已变化，请重新确认。', MEMORY_NO_PATTERN: '这些来源没有共同的受支持明确表达；未生成成长结论。' };
function exact(input, keys, optional = []) {
  const all = Reflect.ownKeys(Object.getOwnPropertyDescriptors(input || {}));
  if (all.some(key => ![...keys, ...optional].includes(key)) || keys.some(key => !all.includes(key))) throw failure('MEMORY_INVALID');
  return record(input, all, 'MEMORY_INVALID');
}
const finiteRevision = value => Number.isSafeInteger(value) && value >= 0;
function createMemoryLibraryService({ root, store: injected, getDestination = () => ({ configured: false, id: null, label: '' }),
  beforeChange = () => {}, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let store, snapshot = null, errorCode = null, timer = null, stopped = false, preview = null, oneShot = null;
  function schedule(retry = false) {
    if (timer !== null) clearTimer(timer); timer = null; if (stopped) return;
    const times = (snapshot?.entries || []).filter(node => node.expiresAt !== null).map(node => Date.parse(node.expiresAt));
    if (!times.length && !retry) return;
    timer = setTimer(() => { timer = null; try { refresh(); } catch {} }, retry ? 60000 : Math.max(1, Math.min(2147483647, Math.min(...times) - now())));
    timer?.unref?.();
  }
  function invalidate() { preview = null; oneShot = null; beforeChange(); }
  function refresh() {
    try {
      if (!store) throw failure(errorCode || 'MEMORY_CORRUPT');
      snapshot = store.read();
      const expired = snapshot.entries.filter(node => node.expiresAt !== null && Date.parse(node.expiresAt) <= now()).map(node => node.id);
      if (expired.length || snapshot.cleanupPending) {
        invalidate(); const removed = cascadeIds(snapshot.entries, expired);
        try { snapshot = store.commit(snapshot.entries.filter(node => !removed.has(node.id)), snapshot.revision); }
        catch (error) { if (error.code === 'MEMORY_CLEANUP_PENDING') snapshot = store.read(); throw error; }
      }
      errorCode = null; schedule(); return snapshot;
    } catch (error) { errorCode = typeof error?.code === 'string' && error.code.startsWith('MEMORY_') ? error.code : 'MEMORY_CORRUPT'; schedule(true); throw failure(errorCode); }
  }
  function view(ok = true, code = null, extra = {}) {
    const nodes = ok || code === 'MEMORY_CLEANUP_PENDING' ? snapshot?.entries || [] : [];
    const active = nodes.filter(node => node.status === 'active');
    return { ok, revision: snapshot?.revision ?? 0, events: clone(active.filter(node => node.type === 'event')),
      summaries: clone(active.filter(node => node.type === 'summary')), suggestions: clone(active.filter(node => node.type === 'suggestion')),
      lineage: nodes.map(({ id, type, level, parents, status, expiresAt, signals }) => ({ id, type, level, parents: [...parents], status, expiresAt, signals: [...signals] })),
      deletedCount: snapshot?.deletedCount || 0, cleanupPending: code === 'MEMORY_CLEANUP_PENDING' || snapshot?.cleanupPending === true,
      limits: { ...LIMITS }, destination: getDestination(), ...(ok ? {} : { code, error: messages[code] || '事件库操作失败，未报告成功。' }), ...extra };
  }
  function fail(error) { const code = typeof error?.code === 'string' && error.code.startsWith('MEMORY_') ? error.code : 'MEMORY_INVALID'; return view(false, code); }
  function current(body, keys, optional = []) {
    const clean = exact(body, ['expectedRevision', ...keys], optional);
    if (!finiteRevision(clean.expectedRevision)) throw failure('MEMORY_INVALID'); refresh();
    if (clean.expectedRevision !== snapshot.revision) throw failure('MEMORY_CONFLICT'); return clean;
  }
  function persist(nodes, extra = {}) {
    invalidate();
    try { snapshot = store.commit(nodes, snapshot.revision); errorCode = null; schedule(); return view(true, null, extra); }
    catch (error) { try { snapshot = store.read(); } catch { snapshot = null; } schedule(true); return fail(error); }
  }
  function node(type, { text, parents = [], level = 0, importance = 1, occurredAt = null, pinned = false, expiresAt, pattern = null, signals = [] }) {
    const stamp = new Date(now()).toISOString();
    return validateNode({ schemaVersion: 1, id: crypto.randomUUID(), type, level, status: 'active', text, parents,
      createdAt: stamp, confirmedAt: stamp, occurredAt, expiresAt: pinned ? null : expiresAt, pinned, importance,
      useInChat: false, destinationId: null, pattern, decision: type === 'suggestion' ? 'pending' : null, decidedAt: null, signals,
      source: { kind: 'user-confirmed-settings', id: crypto.randomUUID() } });
  }
  function derivedExpiry(parents) {
    const times = parents.filter(parent => parent.expiresAt !== null).map(parent => Date.parse(parent.expiresAt));
    return { pinned: !times.length, expiresAt: times.length ? new Date(Math.min(...times)).toISOString() : null };
  }
  function ids(value) { const result = array(value, LIMITS.maxParents); if (result.length < 2 || result.some(id => typeof id !== 'string' || !UUID.test(id)) || new Set(result).size !== result.length) throw failure('MEMORY_INVALID'); return result; }
  function sources(sourceIds, activeOnly = true) {
    const byId = new Map(snapshot.entries.map(item => [item.id, item]));
    return ids(sourceIds).map(id => { const found = byId.get(id); if (!found || found.type === 'suggestion' || (activeOnly && found.status !== 'active')) throw failure('MEMORY_INVALID'); return found; });
  }
  function addEvent(body) {
    try {
      const clean = current(body, ['draft'], ['replaceId']);
      const draft = exact(clean.draft, ['text', 'occurredAt', 'ttlDays', 'pinned', 'importance']);
      if (![1, 7, 30, 90].includes(draft.ttlDays) || typeof draft.pinned !== 'boolean') throw failure('MEMORY_INVALID');
      const replacement = node('event', { ...draft, expiresAt: new Date(now() + draft.ttlDays * 86400000).toISOString(), signals: signalsFor(draft.text) });
      if (isSensitiveText(replacement.text)) throw failure('MEMORY_SENSITIVE');
      let removed = new Set();
      if (clean.replaceId !== undefined) {
        if (typeof clean.replaceId !== 'string' || !UUID.test(clean.replaceId) || !snapshot.entries.some(item => item.id === clean.replaceId && item.type === 'event')) throw failure('MEMORY_INVALID');
        removed = cascadeIds(snapshot.entries, [clean.replaceId]);
      }
      return persist([...snapshot.entries.filter(item => !removed.has(item.id)), replacement], { createdId: replacement.id, invalidatedIds: [...removed] });
    } catch (error) { return fail(error); }
  }
  function previewConsolidation(body) {
    try {
      const clean = current(body, ['sourceIds']); const selected = sources(clean.sourceIds);
      const level = selected[0].level + 1;
      if (level > 3 || selected.some(item => item.level !== level - 1)) throw failure('MEMORY_INVALID');
      let text = '', omittedCharacters = 0;
      for (const item of selected) {
        const excerpt = [...item.text].slice(0, Math.floor(170 / selected.length)).join('');
        omittedCharacters += [...item.text].length - [...excerpt].length;
        text += (text ? '；' : '') + excerpt;
      }
      while (Buffer.byteLength(text, 'utf8') > 512 || [...text].length > 200) { text = [...text].slice(0, -1).join(''); omittedCharacters++; }
      const candidate = { level, text, sourceIds: selected.map(item => item.id), losses: { omittedCharacters,
        notice: '这是有损摘录，不保证保留全部语义。确认后来源正文将移除，只保留无正文谱系；固定事实库不受影响。' } };
      preview = { id: crypto.randomUUID(), revision: snapshot.revision, until: now() + 300000, candidate };
      return { ok: true, previewId: preview.id, revision: snapshot.revision, candidate: clone(candidate) };
    } catch (error) { return fail(error); }
  }
  function confirmConsolidation(body) {
    try {
      const clean = current(body, ['previewId', 'text', 'importance']);
      if (!preview || preview.id !== clean.previewId || preview.revision !== snapshot.revision || preview.until <= now()) throw failure('MEMORY_PREVIEW_EXPIRED');
      const selected = sources(preview.candidate.sourceIds), chosen = new Set(selected.map(item => item.id));
      const summary = node('summary', { text: clean.text, parents: [...chosen], level: preview.candidate.level, importance: clean.importance, ...derivedExpiry(selected) });
      if (isSensitiveText(summary.text)) throw failure('MEMORY_SENSITIVE');
      const next = snapshot.entries.map(item => chosen.has(item.id) ? { ...item, status: 'consumed', text: null, useInChat: false, destinationId: null } : item);
      return persist([...next, summary], { createdId: summary.id, consumedIds: [...chosen], lossy: true });
    } catch (error) { return fail(error); }
  }
  function deleteSource(body) {
    try {
      const clean = current(body, ['id']); if (typeof clean.id !== 'string' || !UUID.test(clean.id) || !snapshot.entries.some(item => item.id === clean.id)) throw failure('MEMORY_INVALID');
      const removed = cascadeIds(snapshot.entries, [clean.id]);
      return persist(snapshot.entries.filter(item => !removed.has(item.id)), { invalidatedIds: [...removed] });
    } catch (error) { return fail(error); }
  }
  function suggest(body) {
    try {
      const clean = current(body, ['sourceIds']); const selected = sources(clean.sourceIds, false), byId = new Map(snapshot.entries.map(item => [item.id, item]));
      const roots = [...new Set(selected.flatMap(item => rootsFor(item.id, byId)))];
      const supported = Object.keys(PRESENTATIONS).map(pattern => ({ pattern, roots: roots.filter(id => byId.get(id).signals.includes(pattern)) })).find(item => item.roots.length >= 2);
      if (!supported) throw failure('MEMORY_NO_PATTERN');
      const parentIds = supported.roots.slice(0, LIMITS.maxParents), parents = parentIds.map(id => byId.get(id));
      if (snapshot.entries.some(item => item.type === 'suggestion' && item.pattern === supported.pattern
        && [...item.parents].sort().join() === [...parentIds].sort().join())) throw failure('MEMORY_INVALID');
      const explanation = supported.pattern === 'short_response' ? '希望回答简短' : '希望减少提问';
      const suggestion = node('suggestion', { text: `${parentIds.length} 条用户确认来源明确表达${explanation}。建议仅调整本地试演的表达方式，不改变人设或权限。`,
        level: 4, parents: parentIds, pattern: supported.pattern, importance: 1, ...derivedExpiry(parents) });
      return persist([...snapshot.entries, suggestion], { createdId: suggestion.id, explanation: { rootSourceIds: parentIds, count: parentIds.length }, presentation: { ...PRESENTATIONS[supported.pattern] } });
    } catch (error) { return fail(error); }
  }
  function resolveSuggestion(body) {
    try {
      const clean = current(body, ['id', 'action']);
      const item = snapshot.entries.find(candidate => candidate.id === clean.id && candidate.type === 'suggestion' && candidate.decision === 'pending');
      if (!item || !['accept', 'reject', 'once'].includes(clean.action)) throw failure('MEMORY_INVALID');
      if (clean.action === 'accept') return persist(snapshot.entries.map(candidate => candidate.id === item.id
        ? { ...candidate, decision: 'accepted', decidedAt: new Date(Math.max(now(), Date.parse(item.createdAt))).toISOString() } : candidate));
      const once = clean.action === 'once' ? { presentation: { ...PRESENTATIONS[item.pattern] }, sourceIds: [...item.parents], expiresAt: item.expiresAt } : null;
      const result = persist(snapshot.entries.filter(candidate => candidate.id !== item.id));
      if (result.ok && once) { oneShot = once; return { ...result, oneShot: clone(once) }; }
      return result;
    } catch (error) { return fail(error); }
  }
  function setLibraryAuthorization(body) {
    try {
      const clean = current(body, ['id', 'useInChat', 'expectedDestinationId']);
      const item = snapshot.entries.find(candidate => candidate.id === clean.id && candidate.status === 'active'); const destination = getDestination();
      if (!item || typeof clean.useInChat !== 'boolean' || (item.type === 'suggestion' && item.decision !== 'accepted')) throw failure('MEMORY_INVALID');
      if (clean.useInChat ? !destination.configured || clean.expectedDestinationId !== destination.id : clean.expectedDestinationId !== null) throw failure('MEMORY_DESTINATION_CHANGED');
      if (clean.useInChat && isSensitiveText(item.text)) throw failure('MEMORY_SENSITIVE');
      if (item.useInChat === clean.useInChat && item.destinationId === (clean.useInChat ? destination.id : null)) return view();
      const replacement = { ...item,
        useInChat: clean.useInChat, destinationId: clean.useInChat ? destination.id : null };
      return persist(snapshot.entries.map(candidate => candidate.id === item.id ? replacement : candidate));
    } catch (error) { return fail(error); }
  }
  function revokeLibrary(body) {
    try {
      current(body, []); const grants = snapshot.entries.filter(item => item.useInChat);
      if (!grants.length) { invalidate(); return view(); }
      // The independent ledger records the grant intersection, so old main
      // snapshots cannot revive consent and revocation requires no new IDs.
      return persist(snapshot.entries.map(item => item.useInChat ? { ...item, useInChat: false, destinationId: null } : item));
    } catch (error) { return fail(error); }
  }
  function takeLocalPresentation() {
    try {
      refresh(); const byId = new Map(snapshot.entries.map(item => [item.id, item])); let result = {};
      for (const item of snapshot.entries) if (item.type === 'suggestion' && item.decision === 'accepted') result = { ...result, ...PRESENTATIONS[item.pattern] };
      const once = oneShot; oneShot = null;
      if (once && once.sourceIds.every(id => byId.has(id)) && (once.expiresAt === null || Date.parse(once.expiresAt) > now())) result = { ...result, ...once.presentation };
      return result;
    } catch { oneShot = null; return {}; }
  }
  function retrieveNodes() {
    refresh(); return { revision: snapshot.revision, entries: snapshot.entries.filter(item => item.status === 'active'
      && item.useInChat && (item.type !== 'suggestion' || item.decision === 'accepted') && !isSensitiveText(item.text)).map(item => ({ ...item,
      kind: item.type === 'suggestion' ? 'pattern' : item.type,
      text: (item.type === 'event' ? `用户确认事件（${item.occurredAt || '未提供发生时间'}）：` : item.type === 'summary' ? '用户确认有损摘要：' : '用户接受模式：') + item.text })) };
  }
  try { store = injected || createMemoryLibraryStore(path.join(root, '_private', 'memory-library.json')); refresh(); }
  catch (error) { errorCode = error.code || 'MEMORY_CORRUPT'; }
  return { libraryState() { try { refresh(); return view(); } catch (error) { return fail(error); } }, addEvent, previewConsolidation, confirmConsolidation,
    deleteSource, suggest, resolveSuggestion, setLibraryAuthorization, revokeLibrary, takeLocalPresentation, retrieveNodes,
    valid(revision) { try { return refresh().revision === revision; } catch { return false; } },
    shutdown() { stopped = true; preview = null; oneShot = null; if (timer !== null) clearTimer(timer); timer = null; } };
}
module.exports = Object.freeze({ createMemoryLibraryService });
