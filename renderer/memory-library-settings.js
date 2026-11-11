'use strict';

;(() => {
  const get = id => document.getElementById(id), group = get('memoryLibraryControls');
  if (!group) return;
  const api = window.settings;
  const methods = ['memoryLibraryState', 'memoryAddEvent', 'memoryPreviewConsolidation', 'memoryConfirmConsolidation',
    'memoryDeleteSource', 'memorySuggest', 'memoryResolveSuggestion', 'memorySetLibraryAuthorization', 'memoryRevokeLibrary'];
  const supported = methods.every(name => typeof api?.[name] === 'function');
  const clone = value => JSON.parse(JSON.stringify(value)), encoder = new TextEncoder();
  const fields = { text: get('memoryEventText'), occurredAt: get('memoryEventOccurred'), importance: get('memoryEventImportance'),
    ttlDays: get('memoryEventTtl'), pinned: get('memoryEventPinned') };
  const controls = ['memoryEventSave', 'memoryEventNew', 'memoryLibraryPreview', 'memoryLibrarySuggest',
    'memoryLibraryConsolidate', 'memoryLibrarySummaryText', 'memoryLibrarySummaryImportance', 'memoryLibrarySource',
    'memoryLibraryDeleteSource', 'memoryLibraryCorrectSource', 'memoryLibraryRevoke'];
  const messages = {
    MEMORY_CONFLICT: '版本已变化，草稿保留；请明确载入最新版本后重新确认。',
    MEMORY_PREVIEW_EXPIRED: '预览已过期或来源已变化；请重新选择并预览。',
    MEMORY_DESTINATION_CHANGED: 'API 目的地或授权已变化；旧确认已取消，请刷新后重新确认，不会自动重发。',
    MEMORY_CLEANUP_PENDING: '操作尚未完全清理；仅显示账本允许的内容，当前禁写，请刷新重试。不能把本次操作视为完成。',
    MEMORY_CORRUPT: '事件库不可安全读取；已停止使用，不会用空库覆盖。上方事实库仍可独立管理。',
    MEMORY_SENSITIVE: '疑似含敏感信息，未保存。请移除密钥、联系方式或证件等内容。',
    MEMORY_LIMIT: '活动条目、谱系或存储达到上限；未自动丢弃内容。可检查来源并删除或撤权。',
    MEMORY_NO_PATTERN: '所选来源没有至少两条共同的明确表达；没有推断心理或生成成长结论。',
    MEMORY_INVALID: '字段或操作无效。正文最多 200 字符 / 512 UTF-8 字节，压缩需选择 2–8 条同层活动来源。',
    MEMORY_BUSY: '有正在进行的写入或未恢复的锁，请稍后刷新；不要删除活动进程的锁。',
    MEMORY_IO_ERROR: '本机写入未完成，不能确认成功；请刷新核对。',
    MEMORY_ENCRYPTION_ERROR: '本机加密失败，未保存；不会降级为明文。',
  };
  let state = null, unavailable = true, busy = false, loading = false, conflict = false, disposed = false;
  let sequence = 0, changeEpoch = 0, baseRevision = 0, editId = null, pending = null, preview = null;
  let selected = new Set(), baseline = '';
  const all = () => state ? [...state.events, ...state.summaries, ...state.suggestions] : [];
  const kind = node => node.type === 'event' ? '明确事件' : node.type === 'summary' ? '第 ' + node.level + ' 级摘要' : '表达建议';
  const textOkay = value => typeof value === 'string' && value.trim() && [...value].length <= 200 && encoder.encode(value).length <= 512
    && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
  function note(text, error = false) { get('memoryLibraryStatus').textContent = text; get('memoryLibraryStatus').dataset.error = String(error); }
  function draftRaw() { return { text: fields.text.value, occurredAt: fields.occurredAt.value, importance: Number(fields.importance.value), ttlDays: Number(fields.ttlDays.value), pinned: fields.pinned.checked }; }
  const dirty = () => JSON.stringify(draftRaw()) !== baseline || editId !== null;
  function validState(value) {
    if (value?.ok !== true || !Number.isSafeInteger(value.revision) || value.revision < 0
      || !Array.isArray(value.events) || value.events.length > 200 || !Array.isArray(value.summaries) || value.summaries.length > 66
      || !Array.isArray(value.suggestions) || value.suggestions.length > 10 || !Array.isArray(value.lineage) || value.lineage.length > 2048
      || !Number.isSafeInteger(value.deletedCount) || value.deletedCount < 0 || typeof value.cleanupPending !== 'boolean'
      || value.limits?.events !== 200 || value.limits.summary1 !== 50 || value.limits.summary2 !== 12 || value.limits.summary3 !== 4
      || value.limits.suggestions !== 10 || value.limits.maxLifetimeIds !== 2048
      || typeof value.destination?.configured !== 'boolean' || typeof value.destination.label !== 'string'
      || value.destination.label.length > 512 || (value.destination.id !== null && !/^[a-f0-9]{64}$/.test(value.destination.id))) return false;
    const nodes = [...value.events, ...value.summaries, ...value.suggestions];
    return new Set(value.lineage.map(n => n?.id)).size === value.lineage.length && nodes.every(n => n?.schemaVersion === 1
      && typeof n.id === 'string' && n.id.length <= 128 && textOkay(n.text) && n.status === 'active'
      && Number.isInteger(n.importance) && n.importance >= 0 && n.importance <= 3
      && Array.isArray(n.parents) && n.parents.length <= 8 && typeof n.useInChat === 'boolean'
      && value.lineage.some(source => source.id === n.id))
      && value.events.every(n => n.type === 'event' && n.level === 0)
      && value.summaries.every(n => n.type === 'summary' && [1, 2, 3].includes(n.level))
      && value.suggestions.every(n => n.type === 'suggestion' && ['pending', 'accepted'].includes(n.decision))
      && value.lineage.every(n => typeof n.id === 'string' && n.id.length <= 128 && Array.isArray(n.parents)
        && n.parents.length <= 8 && ['active', 'consumed'].includes(n.status));
  }
  function hideConfirmation() { pending = null; get('memoryLibraryConfirmation').hidden = true; }
  function clearPreview() { preview = null; get('memoryLibraryPreviewBox').hidden = true; }
  function resetDraft() {
    editId = null; fields.text.value = ''; fields.occurredAt.value = ''; fields.importance.value = '1'; fields.ttlDays.value = '30'; fields.pinned.checked = false;
    baseline = JSON.stringify(draftRaw()); baseRevision = state?.revision ?? 0; conflict = false;
  }
  function failure(result) {
    const code = typeof result?.code === 'string' ? result.code : 'MEMORY_IO_ERROR';
    hideConfirmation(); clearPreview(); unavailable = true;
    if (code === 'MEMORY_CLEANUP_PENDING' && validState({ ...result, ok: true })) state = clone({ ...result, ok: true });
    else state = null; // Never keep a stale body list after uncertain deletion/read.
    conflict = ['MEMORY_CONFLICT', 'MEMORY_DESTINATION_CHANGED'].includes(code);
    note(messages[code] || '操作失败，当前只读；请刷新核对，没有自动重试写入。', true);
  }
  function make(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
  function action(text, actionName, id, handler, disabled = false) {
    const button = make('button', text, 'panel-mini'); button.type = 'button'; button.dataset.libraryAction = actionName;
    if (id) button.dataset.libraryId = id; button.disabled = disabled; button.addEventListener('click', handler); return button;
  }
  function cascade(id) {
    const removed = new Set([id]); let changed = true;
    while (changed) { changed = false; for (const item of state.lineage) if (!removed.has(item.id) && item.parents.some(parent => removed.has(parent))) { removed.add(item.id); changed = true; } }
    return [...removed];
  }
  function renderLists(locked) {
    const list = get('memoryLibraryList'), suggestions = get('memoryLibrarySuggestions');
    list.replaceChildren(); suggestions.replaceChildren();
    for (const item of all()) {
      const row = make('li', undefined, 'memory-entry'), heading = make('div', undefined, 'memory-entry-heading');
      if (item.type !== 'suggestion') {
        const label = make('label', undefined, 'memory-library-select'), check = make('input'); check.type = 'checkbox';
        check.checked = selected.has(item.id); check.disabled = locked; check.dataset.libraryId = item.id; check.dataset.libraryAction = 'select';
        check.setAttribute('aria-label', '选择' + kind(item) + '，ID ' + item.id);
        check.addEventListener('change', () => {
          if (locked || busy || loading) return;
          if (check.checked && selected.size >= 8) { check.checked = false; note('一次最多选择 8 条来源。', true); return; }
          check.checked ? selected.add(item.id) : selected.delete(item.id); hideConfirmation(); clearPreview(); render(false);
        });
        label.appendChild(check); label.appendChild(make('span', kind(item))); heading.appendChild(label);
      } else heading.appendChild(make('strong', item.decision === 'accepted' ? '已接受 · 本地生效' : '待确认 · 尚未生效'));
      row.appendChild(heading); row.appendChild(make('p', item.text, 'memory-entry-text'));
      const expiry = item.expiresAt === null ? '长期保留' : '到期 ' + new Date(item.expiresAt).toLocaleString('zh-CN', { hour12: false });
      row.appendChild(make('p', '重要度 ' + item.importance + ' · ' + expiry + (item.type === 'event' ? ' · 发生时间：' + (item.occurredAt || '未提供') : ' · 来源 ' + item.parents.length + ' 条'), 'memory-entry-meta'));
      row.appendChild(make('p', item.useInChat ? item.destinationId === state.destination.id && state.destination.configured
        ? '已授权当前手动聊天 API · ' + state.destination.label : '旧目的地授权，不会自动重绑'
        : '仅本机 · 未授权云端', 'memory-entry-meta'));
      row.appendChild(make('p', 'ID：' + item.id, 'memory-entry-meta'));
      const buttons = make('div', undefined, 'memory-entry-actions');
      if (item.type === 'event') buttons.appendChild(action('更正…', 'edit', item.id, () => edit(item.id), locked));
      if (item.type === 'suggestion' && item.decision === 'pending') {
        for (const [verb, label] of [['accept', '接受…'], ['reject', '拒绝…'], ['once', '仅下次本地试演…']])
          buttons.appendChild(action(label, verb, item.id, () => stage('resolve', { id: item.id, action: verb }), locked));
      } else buttons.appendChild(action(item.useInChat ? '撤回此条授权…' : '授权手动聊天…', 'grant', item.id,
        () => stage('grant', { id: item.id, useInChat: !item.useInChat }), locked || (!item.useInChat && !state.destination.configured)));
      buttons.appendChild(action('删除来源…', 'delete', item.id, () => stage('delete', { id: item.id }), locked));
      row.appendChild(buttons); (item.type === 'suggestion' ? suggestions : list).appendChild(row);
    }
    const source = get('memoryLibrarySource'), previous = source.value; source.replaceChildren();
    const empty = make('option', '选择来源 ID（含已消费来源）'); empty.value = ''; source.appendChild(empty);
    for (const item of state?.lineage || []) { const option = make('option', kind(item) + (item.status === 'consumed' ? ' · 已消费无正文' : '') + ' · ' + item.id); option.value = item.id; source.appendChild(option); }
    source.value = state?.lineage.some(item => item.id === previous) ? previous : '';
  }
  function render(lists = true) {
    const locked = !supported || !state || unavailable || state.cleanupPending || conflict || busy || loading;
    for (const field of Object.values(fields)) field.disabled = locked;
    fields.ttlDays.disabled = locked || fields.pinned.checked;
    for (const id of controls) get(id).disabled = locked;
    get('memoryLibraryRefresh').disabled = !supported || busy || loading;
    get('memoryLibraryReload').hidden = !dirty() && !conflict;
    get('memoryLibraryReload').disabled = !supported || busy || loading;
    get('memoryLibraryConfirm').disabled = locked || !pending;
    get('memoryLibraryCancel').disabled = busy;
    get('memoryLibraryCancelPreview').disabled = busy;
    get('memoryEventSave').disabled ||= !editId && Boolean(state && state.events.length >= 200);
    get('memoryLibraryPreview').disabled ||= selected.size < 2;
    get('memoryLibrarySuggest').disabled ||= selected.size < 2;
    get('memoryLibraryConsolidate').disabled ||= !preview;
    get('memoryLibraryRevoke').disabled ||= !all().some(item => item.useInChat);
    if (lists) renderLists(locked);
    get('memoryLibraryDeleteSource').disabled = locked || !get('memoryLibrarySource').value;
    get('memoryLibraryCorrectSource').disabled = locked || !state?.lineage.some(n => n.id === get('memoryLibrarySource').value && n.type === 'event');
    const count = fields.text.value ? [...fields.text.value].length : 0, bytes = encoder.encode(fields.text.value).length;
    get('memoryEventCount').textContent = count + ' / 200 字符 · ' + bytes + ' / 512 UTF-8 字节';
    get('memoryEventCount').dataset.error = String(count > 200 || bytes > 512);
    get('memoryEventHeading').textContent = editId ? '更正事件 ID ' + editId : '新增一条明确事件';
    get('memoryLibrarySelection').textContent = '已选 ' + selected.size + ' 条；压缩要求 2–8 条同层活动来源，建议需两条独立确认来源。';
    get('memoryLibraryCount').textContent = loading ? '正在读取' : unavailable || !state ? '只读 · 不可用'
      : state.events.length + '/200 事件 · ' + state.summaries.length + ' 摘要 · ' + state.suggestions.length + '/10 建议';
    get('memoryLibraryLimits').textContent = state ? '三级活动摘要 ' + [1,2,3].map(level => state.summaries.filter(n => n.level === level).length + '/' + state.limits['summary' + level]).join(' · ')
      + '；谱系 ' + state.lineage.length + '，已删 ' + state.deletedCount + '；累计最多 2048 个 ID · 版本 ' + state.revision
      : '事件 200 条 · 三级活动摘要 50 / 12 / 4 条 · 建议 10 条';
    get('memoryLibraryDestination').textContent = state?.destination.configured ? '可逐条授权至 ' + state.destination.label + '；变更目的地不会自动重绑。' : '未配置已授权的 API；仍可保存仅本机内容。';
    get('memoryLibraryEmpty').hidden = Boolean(state && (state.events.length || state.summaries.length));
    get('memoryLibraryEmpty').textContent = unavailable ? '事件库暂不可读，不显示默认替代内容。' : '还没有活动事件或摘要。展开“新增一条明确事件”开始；不会自动采集。';
    get('memoryLibrarySuggestionEmpty').hidden = Boolean(state?.suggestions.length);
    group.setAttribute('aria-busy', String(busy || loading));
  }
  async function refresh(discard = false) {
    if (!supported || busy || disposed) return;
    const token = ++sequence, beforeEpoch = changeEpoch, hadDraft = dirty();
    loading = true; hideConfirmation(); clearPreview(); render();
    try {
      const result = await api.memoryLibraryState(); if (disposed || token !== sequence) return;
      if (!validState(result)) { failure(result); return; }
      const preserve = !discard && hadDraft, changed = result.revision !== baseRevision;
      state = clone(result); unavailable = false; selected = new Set();
      if (discard || !preserve) resetDraft(); else if (changed || beforeEpoch !== changeEpoch) conflict = true;
      note(state.cleanupPending ? messages.MEMORY_CLEANUP_PENDING : conflict ? messages.MEMORY_CONFLICT
        : preserve ? '已刷新，未保存草稿仍保留；没有发送或提取内容。' : '已读取事件库。未新增、发送或自动提取任何内容。', state.cleanupPending || conflict);
    } catch { if (!disposed && token === sequence) failure(null); }
    finally { if (!disposed && token === sequence) { loading = false; render(); } }
  }
  function edit(id) {
    if (unavailable || conflict || busy || loading || !state) return;
    if (dirty()) { note('已有未保存草稿；请保存或明确清空后再更正其他事件。', true); return; }
    const item = state.events.find(n => n.id === id) || state.lineage.find(n => n.id === id && n.type === 'event'); if (!item) return;
    editId = id; fields.text.value = item.text || ''; fields.importance.value = String(item.importance ?? 1); fields.pinned.checked = item.expiresAt === null;
    fields.ttlDays.value = '30'; fields.occurredAt.value = item.occurredAt ? new Date(Date.parse(item.occurredAt) - new Date(item.occurredAt).getTimezoneOffset() * 60000).toISOString().slice(0,16) : '';
    if (!item.pinned) { const days = Math.round((Date.parse(item.expiresAt) - Date.parse(item.confirmedAt)) / 86400000); if ([1,7,30,90].includes(days)) fields.ttlDays.value = String(days); }
    baseRevision = state.revision; baseline = JSON.stringify(draftRaw()); hideConfirmation(); clearPreview(); get('memoryEventDetails').open = true; render(false); fields.text.focus();
    note((item.status === 'consumed' ? '旧正文已经消费，不会恢复；请重新填写你确认的更正内容。' : '') + '更正生成新来源 ID，旧来源及其派生摘要/建议将失效；新记录默认不授权云端。');
  }
  function stage(type, detail = {}) {
    if (busy || loading || disposed || (!['reset','reload'].includes(type) && (unavailable || conflict || !state || state.cleanupPending))) return;
    let title, lines, payload = { expectedRevision: state?.revision ?? baseRevision };
    const item = detail.id ? all().find(n => n.id === detail.id) : null;
    if (type === 'event') {
      const draft = draftRaw(); draft.text = draft.text.replace(/\r\n/g,'\n').normalize('NFC').trim();
      if (!textOkay(draft.text) || ![0,1,2,3].includes(draft.importance) || ![1,7,30,90].includes(draft.ttlDays)) { note(messages.MEMORY_INVALID,true); fields.text.focus(); return; }
      if (draft.occurredAt) { const time=Date.parse(draft.occurredAt); if (!Number.isFinite(time)) { note('发生时间无效；可留空，但不会用确认时间代替。',true); return; } draft.occurredAt=new Date(time).toISOString(); } else draft.occurredAt=null;
      payload = { ...payload, draft, ...(editId ? {replaceId:editId} : {}) };
      title=editId?'确认更正来源与级联失效':'确认新事件 · 默认仅本机';
      lines=[draft.text,'发生时间：'+(draft.occurredAt||'未提供'),'重要度 '+draft.importance+' · '+(draft.pinned?'长期保留':draft.ttlDays+' 天'),'只写入本机，不立即发送给模型。'];
      if(editId)lines.push('将撤销旧来源及 '+Math.max(0,cascade(editId).length-1)+' 条派生内容；新 ID 不继承授权。');
    } else if(type==='delete'){
      if(!state.lineage.some(n=>n.id===detail.id))return;payload.id=detail.id;
      title='确认来源级联删除';lines=['来源 ID：'+detail.id,'合计删除 '+cascade(detail.id).length+' 个来源/派生节点；已接受建议的本地效果同时撤销。','不能撤回已发送内容、外部备份或服务商历史。'];
    } else if(type==='grant'){
      if(!item || (item.type==='suggestion'&&item.decision!=='accepted'))return;
      if(detail.useInChat&&!state.destination.configured)return;
      payload={...payload,id:item.id,useInChat:detail.useInChat,expectedDestinationId:detail.useInChat?state.destination.id:null};
      title=detail.useInChat?'确认授权这一条手动聊天':'确认撤回这一条授权';
      lines=[item.text,detail.useInChat?'授权至：'+state.destination.label:'内容保留为仅本机；不能撤回已经发送的内容。','目的地确认值：'+(payload.expectedDestinationId||'无'),'不授予自主导演、DSH 或自动采集权限。'];
    } else if(type==='revoke'){
      title='撤回事件库全部云端授权';lines=['仅处理这个事件库，保留本地正文与来源关系。上方事实库授权需单独撤回。','将停止 '+all().filter(n=>n.useInChat).length+' 条内容后续外发；已发送内容无法撤回。'];
    } else if(type==='resolve'){
      if(!item||item.decision!=='pending')return;payload={...payload,id:item.id,action:detail.action};
      title={accept:'接受本地表达建议',reject:'拒绝并移除这条建议',once:'仅用于下一次本地试演'}[detail.action];if(!title)return;
      lines=[item.text,detail.action==='accept'?'以后本地试演可使用，来源失效后立即撤销。':detail.action==='once'?'只在当前运行中等待下一次本地试演；使用一次或来源失效后清除，不自动外发。':'删除此候选；不改变核心人设、来源或权限。'];
    } else if(type==='consolidate'){
      if(!preview||preview.revision!==state.revision)return;
      const text=get('memoryLibrarySummaryText').value.replace(/\r\n/g,'\n').normalize('NFC').trim(),importance=Number(get('memoryLibrarySummaryImportance').value);
      if(!textOkay(text)||![0,1,2,3].includes(importance)){note(messages.MEMORY_INVALID,true);return;}
      payload={...payload,previewId:preview.previewId,text,importance};
      title='确认有损压缩与来源正文移除';lines=[text,'重要度 '+importance,'将消费 '+preview.candidate.sourceIds.length+' 条来源，只保留无正文谱系；新摘要默认不授权云端。','摘录不保证完整语义；固定事实库不变。'];
    } else if(type==='reset'||type==='reload'){
      title='确认放弃未保存草稿';lines=['清空本页事件草稿与候选预览，不改动已保存内容；载入最新状态后需要重新确认。'];
    } else return;
    pending={type,payload,destinationId:state?.destination.id??null,epoch:changeEpoch,sourceIds:preview?.candidate.sourceIds?[...preview.candidate.sourceIds]:[],
      removedIds:type==='delete'?cascade(detail.id):type==='event'&&editId?cascade(editId):[],pattern:item?.pattern??null};
    get('memoryLibraryConfirmHeading').textContent=title;const list=get('memoryLibraryDiff');list.replaceChildren();
    for(const text of lines)list.appendChild(make('li',text));get('memoryLibraryConfirmation').hidden=false;
    render(false);get('memoryLibraryConfirm').disabled=busy||loading;get('memoryLibraryConfirmHeading').focus();
  }
  function receipt(action,result){
    if(!validState(result)||result.cleanupPending||result.revision<=action.payload.expectedRevision)return false;
    const nodes=[...result.events,...result.summaries,...result.suggestions],item=nodes.find(n=>n.id===action.payload.id);
    if(action.type==='event')return typeof result.createdId==='string'&&result.events.some(n=>n.id===result.createdId&&n.text===action.payload.draft.text&&n.importance===action.payload.draft.importance&&!n.useInChat)
      &&action.removedIds.every(id=>!result.lineage.some(n=>n.id===id));
    if(action.type==='delete')return action.removedIds.every(id=>!result.lineage.some(n=>n.id===id));
    if(action.type==='revoke')return nodes.every(n=>!n.useInChat);
    if(action.type==='grant')return item&&item.useInChat===action.payload.useInChat&&item.destinationId===action.payload.expectedDestinationId;
    if(action.type==='resolve')return action.payload.action==='accept'?item?.decision==='accepted':!item && (action.payload.action!=='once'
      || (action.pattern==='short_response'?result.oneShot?.presentation?.maxSpeechCharacters===80:result.oneShot?.presentation?.questionFrequency==='less'));
    if(action.type==='consolidate')return result.summaries.some(n=>n.id===result.createdId&&n.text===action.payload.text&&!n.useInChat)
      &&action.sourceIds.every(id=>result.lineage.some(n=>n.id===id&&n.status==='consumed')&&!result.events.some(n=>n.id===id)&&!result.summaries.some(n=>n.id===id));
    return false;
  }
  async function commit(){
    if(!pending||busy||loading||disposed)return;const action=pending;
    if(action.type==='reset'){hideConfirmation();clearPreview();resetDraft();render();note('已清空草稿，未改动已保存内容。');return;}
    if(action.type==='reload'){hideConfirmation();await refresh(true);return;}
    if(unavailable||conflict||!state||state.cleanupPending)return;
    if(action.epoch!==changeEpoch||action.payload.expectedRevision!==state.revision
      ||(action.type==='grant'&&action.payload.useInChat&&action.destinationId!==state.destination.id)){hideConfirmation();conflict=true;render();note(messages.MEMORY_CONFLICT,true);return;}
    const map={event:'memoryAddEvent',delete:'memoryDeleteSource',grant:'memorySetLibraryAuthorization',revoke:'memoryRevokeLibrary',resolve:'memoryResolveSuggestion',consolidate:'memoryConfirmConsolidation'};
    busy=true;++sequence;render();note('正在等待本机持久化回执…');
    try{
      const result=await api[map[action.type]](action.payload);if(disposed)return;
      hideConfirmation();clearPreview();
      if(!result?.ok){failure(result);return;}
      if(!receipt(action,result)){failure(null);note('没有收到可核验的持久化回执；请刷新核对，不能报告成功。',true);return;}
      state=clone(result);unavailable=false;selected=new Set();
      if(action.type==='event')resetDraft();else baseRevision=state.revision;
      if(action.epoch!==changeEpoch){conflict=true;note(messages.MEMORY_DESTINATION_CHANGED,true);}
      else note(action.type==='resolve'&&action.payload.action==='once'?'已确认，仅等待下一次本地试演使用一次；没有外发。':'已收到持久化回执；没有调用模型。');
    }catch{if(!disposed)failure(null);}
    finally{if(!disposed){busy=false;render();}}
  }
  async function buildCandidate(type){
    if(busy||loading||conflict||unavailable||!state||selected.size<2)return;
    const ids=[...selected],revision=state.revision,epoch=changeEpoch;busy=true;hideConfirmation();clearPreview();render();note(type==='preview'?'正在生成本地有损摘录…':'正在核对明确来源…');
    try{
      const result=await api[type==='preview'?'memoryPreviewConsolidation':'memorySuggest']({expectedRevision:revision,sourceIds:ids});
      if(disposed)return;
      if(epoch!==changeEpoch){conflict=true;note(messages.MEMORY_DESTINATION_CHANGED,true);return;}
      if(!result?.ok){failure(result);return;}
      if(type==='preview'){
        if(result.revision!==revision||typeof result.previewId!=='string'||!textOkay(result.candidate?.text)
          ||!Array.isArray(result.candidate.sourceIds)||result.candidate.sourceIds.join()!==ids.join()){failure(null);return;}
        preview=clone(result);get('memoryLibrarySummaryText').value=result.candidate.text;get('memoryLibrarySummaryImportance').value='1';
        get('memoryLibraryLosses').textContent='第 '+result.candidate.level+' 级摘要 · 摘录省略约 '+result.candidate.losses.omittedCharacters+' 个来源字符；请核对语义。';
        get('memoryLibraryPreviewBox').hidden=false;get('memoryLibraryPreviewHeading').focus();note('预览未写入；修改正文后仍需明确确认才消费来源。');
      }else{
        if(!validState(result)||result.revision<=revision||!result.suggestions.some(n=>n.id===result.createdId&&n.decision==='pending'&&!n.useInChat)){failure(null);return;}
        state=clone(result);baseRevision=state.revision;get('memoryLibrarySuggestionDetails').open=true;note('已保存待确认候选；尚未生效，也未获得云端授权。');
      }
    }catch{if(!disposed)failure(null);}
    finally{if(!disposed){busy=false;render();}}
  }
  for(const field of Object.values(fields)){const changed=()=>{if(busy||loading)return;hideConfirmation();render(false);};field.addEventListener('input',changed);field.addEventListener('change',changed);}
  for(const id of ['memoryLibrarySummaryText','memoryLibrarySummaryImportance'])get(id).addEventListener('input',()=>{hideConfirmation();render(false);});
  get('memoryLibrarySource').addEventListener('change',()=>render(false));
  get('memoryEventSave').addEventListener('click',()=>stage('event'));
  get('memoryEventNew').addEventListener('click',()=>stage('reset'));
  get('memoryLibraryReload').addEventListener('click',()=>stage('reload'));
  get('memoryLibraryDeleteSource').addEventListener('click',()=>stage('delete',{id:get('memoryLibrarySource').value}));
  get('memoryLibraryCorrectSource').addEventListener('click',()=>edit(get('memoryLibrarySource').value));
  get('memoryLibraryRevoke').addEventListener('click',()=>stage('revoke'));
  get('memoryLibraryConsolidate').addEventListener('click',()=>stage('consolidate'));
  get('memoryLibraryPreview').addEventListener('click',()=>void buildCandidate('preview'));
  get('memoryLibrarySuggest').addEventListener('click',()=>void buildCandidate('suggest'));
  get('memoryLibraryRefresh').addEventListener('click',()=>void refresh());
  get('memoryLibraryConfirm').addEventListener('click',()=>void commit());
  get('memoryLibraryCancel').addEventListener('click',()=>{const eventDraft=pending?.type==='event';hideConfirmation();render(false);(eventDraft?fields.text:get('memoryLibraryRefresh')).focus();});
  get('memoryLibraryCancelPreview').addEventListener('click',()=>{hideConfirmation();clearPreview();render(false);get('memoryLibraryPreview').focus();});
  group.addEventListener('keydown',event=>{if(event.key==='Escape'&&!busy){hideConfirmation();clearPreview();render(false);get('memoryLibraryRefresh').focus();event.stopPropagation?.();}});
  window.addEventListener('settings:tab-change',event=>{if(event.detail?.name==='director')void refresh();});
  window.addEventListener('director:config-updated',()=>{++changeEpoch;hideConfirmation();clearPreview();conflict=true;if(!busy)void refresh();else render();});
  window.addEventListener('pagehide',()=>{disposed=true;++sequence;pending=null;preview=null;});
  resetDraft();render();if(supported)void refresh();else note('当前版本没有配套事件库接口，保持只读。',true);
})();
