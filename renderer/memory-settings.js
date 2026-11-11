'use strict'

;(() => {
  const byId = id => document.getElementById(id)
  const group = byId('memoryControls')
  if (!group) return
  const api = window.settings
  const supported = ['memoryState', 'memorySave', 'memoryDelete', 'memoryClear', 'memoryRevoke'].every(name => typeof api?.[name] === 'function')
  const kinds = { name: '名字 / 称呼', preference: '偏好', interest: '兴趣' }
  const placeholders = { name: '例如：小鲸（昵称）', preference: '例如：我更喜欢简短的回答', interest: '例如：我喜欢鲸鱼和海洋题材' }
  const fields = { kind: byId('memoryKind'), text: byId('memoryText'), pinned: byId('memoryPinned'), ttlDays: byId('memoryTtlDays'), useInChat: byId('memoryUseInChat'), importance: byId('memoryImportance') }
  const encoder = new TextEncoder()
  const clone = value => JSON.parse(JSON.stringify(value))
  const emptyDraft = () => ({ kind: 'name', text: '', pinned: false, ttlDays: 30, useInChat: false, importance: 1 })
  const sizes = text => ({ chars: [...text].length, bytes: encoder.encode(text).length })
  const errors = {
    MEMORY_INVALID: '内容或字段格式无效；请检查类别、字符数、字节数与有效期。',
    MEMORY_SENSITIVE: '内容触发敏感信息检查，未保存；请移除密钥、联系方式或证件等信息后重试。',
    MEMORY_CONFLICT: '版本已变化，草稿仍保留；请明确载入最新版本后重新编辑。',
    MEMORY_CORRUPT: '记忆存储不可读或已损坏，当前只读；请正常关闭桌宠，修复存储后重新启动，不要用空库覆盖。',
    MEMORY_UNSAFE_PATH: '记忆存储路径不安全，当前只读；请正常关闭桌宠后检查本地路径。',
    MEMORY_IO_ERROR: '本机写入未完成，不能确认成功；请刷新核对后再试。',
    MEMORY_ENCRYPTION_ERROR: '本机加密不可用，未确认保存；不会降级明文存储，请检查 Windows 用户环境。',
    MEMORY_BUSY: '另一个操作正在进行，或异常退出留下锁；请稍后刷新。若持续出现，请正常退出后检查，不要删除活动进程的锁。',
    MEMORY_LIMIT: '达到条目或累计确认额度，未保存。本版最多 40 条、216 次确认（含更正与重新授权，删除不重置）；另留 40 个 ID 用于安全撤权。仍可删除和撤权。',
    MEMORY_CLEANUP_PENDING: '删除后的清理尚未完成；被屏蔽内容不会用于聊天。当前禁写，请刷新重试清理，不能把本次操作视为完全完成。',
    MEMORY_DESTINATION_UNAVAILABLE: '当前 API 目的地未配置或未授权；请先完成配置，刷新后重新勾选这一条的聊天授权。',
    MEMORY_DESTINATION_CHANGED: 'API 目的地已变化，未写入；草稿已保留并取消云端勾选。请先刷新查看新目的地，再重新勾选和预览确认，不会自动重发。',
    MEMORY_NAME_EXISTS: '已经保存了一条名字 / 称呼；请编辑现有条目，不新增第二条。',
  }
  let state = null, baseRevision = 0, editId = null, baseline = emptyDraft(), consentId = null
  let pending = null, busy = false, loading = false, unavailable = true, conflict = false, disposed = false, readId = 0, editSerial = 0

  function message(text, error = false) { byId('memoryStatus').textContent = text; byId('memoryStatus').dataset.error = String(error) }
  function draft() {
    return { kind: fields.kind.value, text: fields.text.value, pinned: fields.pinned.checked, ttlDays: Number(fields.ttlDays.value), useInChat: fields.useInChat.checked, importance: Number(fields.importance.value) }
  }
  function dirty() { return JSON.stringify(draft()) !== JSON.stringify(baseline) }
  function availableConfirmations() {
    const value = state?.limits.availableConfirmations
    return Number.isSafeInteger(value) && value >= 0 ? value : Math.max(0, 216 - (state?.entries.length || 0) - (state?.deletedCount || 0))
  }
  function validText(text) { const n = sizes(text); return typeof text === 'string' && text.trim().length > 0 && n.chars <= 200 && n.bytes <= 512 && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text) }
  function validState(value) {
    return value?.ok === true && Number.isSafeInteger(value.revision) && value.revision >= 0
      && Array.isArray(value.entries) && value.entries.length <= 40 && new Set(value.entries.map(e => e?.id)).size === value.entries.length
      && value.entries.every(e => [1, 2].includes(e?.schemaVersion) && (e.schemaVersion === 1 ? e.importance === undefined : Number.isInteger(e.importance) && e.importance >= 0 && e.importance <= 3) && typeof e.id === 'string' && e.id.length <= 128
        && Object.hasOwn(kinds, e.kind) && typeof e.text === 'string' && validText(e.text)
        && typeof e.pinned === 'boolean' && typeof e.useInChat === 'boolean'
        && e.source?.kind === 'user-confirmed-settings' && typeof e.source.id === 'string'
        && typeof e.createdAt === 'string' && Number.isFinite(Date.parse(e.createdAt))
        && typeof e.confirmedAt === 'string' && Number.isFinite(Date.parse(e.confirmedAt))
        && (e.expiresAt === null || (typeof e.expiresAt === 'string' && Number.isFinite(Date.parse(e.expiresAt))))
        && (e.destinationId === null || typeof e.destinationId === 'string'))
      && Number.isSafeInteger(value.deletedCount) && value.deletedCount >= 0 && typeof value.cleanupPending === 'boolean'
      && typeof value.destination?.configured === 'boolean' && typeof value.destination.label === 'string' && value.destination.label.length <= 512
      && (value.destination.id === null || typeof value.destination.id === 'string')
      && value.limits?.maxEntries === 40 && value.limits.maxTextChars === 200 && value.limits.maxLifetimeIds === 256
      && (value.blockedEntryIds === undefined || (Array.isArray(value.blockedEntryIds)
        && value.blockedEntryIds.every(id => value.entries.some(entry => entry.id === id))))
  }
  function hideConfirmation() { pending = null; byId('memoryConfirmation').hidden = true; byId('memorySave').setAttribute('aria-expanded', 'false') }
  function discardStaleList(result) {
    // A ledger-first deletion can succeed before the body file is compacted.
    // Keep the editor draft, never a stale persisted-list copy of deleted facts.
    const filtered = result?.code === 'MEMORY_CLEANUP_PENDING' ? { ...result, ok: true } : null
    if (filtered && validState(filtered)) state = clone(filtered)
    else if (state) state = { ...state, entries: [], blockedEntryIds: [] }
  }
  function resetEditor() {
    editId = null; consentId = null; baseline = emptyDraft()
    for (const [key, value] of Object.entries(baseline)) { if (typeof value === 'boolean') fields[key].checked = value; else fields[key].value = String(value) }
    baseRevision = state?.revision || 0
    conflict = false; hideConfirmation()
  }
  function dateLabel(value) { const time = Date.parse(value); return Number.isFinite(time) ? new Date(time).toLocaleString('zh-CN', { hour12: false }) : '时间未提供' }
  function authorization(entry) {
    if (state?.blockedEntryIds?.includes(entry.id)) return '疑似敏感 · 已阻止用于模型；请更正或删除。原有授权不会绕过此限制'
    if (!entry.useInChat) return '仅本机 · 未授权云端'
    return state.destination.configured && entry.destinationId === state.destination.id ? '已授权手动聊天 · ' + state.destination.label : '授权目的地失配 · 需编辑并重新确认'
  }
  function renderList() {
    const list = byId('memoryList'); list.replaceChildren()
    for (const entry of state?.entries || []) {
      const item = document.createElement('li'); item.className = 'memory-entry'; item.dataset.memoryId = entry.id
      const heading = document.createElement('div'); heading.className = 'memory-entry-heading'
      const kind = document.createElement('strong'); kind.textContent = kinds[entry.kind]; heading.appendChild(kind)
      const text = document.createElement('p'); text.className = 'memory-entry-text'; text.textContent = entry.text
      const meta = document.createElement('p'); meta.className = 'memory-entry-meta'
      meta.textContent = '来源：你在设置中确认 · 重要度 ' + (entry.importance ?? 1) + (entry.schemaVersion === 1 ? '（旧记录默认）' : '') + ' · 确认于 ' + dateLabel(entry.confirmedAt) + ' · ' + (entry.pinned ? '长期保留' : '到期 ' + dateLabel(entry.expiresAt))
      const auth = document.createElement('p'); auth.className = 'memory-entry-meta'; auth.textContent = authorization(entry)
      const identity = document.createElement('p'); identity.className = 'memory-entry-meta'; identity.textContent = 'ID：' + entry.id
      const actions = document.createElement('div'); actions.className = 'memory-entry-actions'
      for (const action of ['edit', 'delete']) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'panel-mini' + (action === 'delete' ? ' memory-danger' : '')
        button.dataset.memoryAction = action; button.dataset.memoryId = entry.id; button.textContent = action === 'edit' ? '编辑…' : '删除…'
        button.setAttribute('aria-label', (action === 'edit' ? '编辑' : '删除') + kinds[entry.kind] + '记忆，ID ' + entry.id)
        button.disabled = unavailable || busy || loading || conflict || state.cleanupPending
        button.addEventListener('click', () => action === 'edit' ? edit(entry.id) : stage('delete', entry.id))
        actions.appendChild(button)
      }
      item.appendChild(heading); item.appendChild(text); item.appendChild(meta); item.appendChild(auth); item.appendChild(identity); item.appendChild(actions); list.appendChild(item)
    }
    byId('memoryEmpty').hidden = Boolean(state?.entries.length)
    byId('memoryEmpty').textContent = unavailable ? '记忆尚不可读，没有显示默认替代内容。' : '还没有显式记忆。只有你填写并两次确认后才会保存。'
  }
  function render() {
    const ready = supported && Boolean(state) && !unavailable && !state.cleanupPending
    const locked = !ready || busy || loading
    for (const field of Object.values(fields)) field.disabled = locked || conflict
    fields.ttlDays.disabled = locked || conflict || fields.pinned.checked
    fields.useInChat.disabled = locked || conflict || !state.destination.configured
    for (const id of ['memoryNew', 'memorySave', 'memoryClear', 'memoryRevoke']) byId(id).disabled = locked || conflict
    byId('memoryClear').disabled ||= !state?.entries.length
    byId('memoryRevoke').disabled ||= !state?.entries.some(entry => entry.useInChat)
    byId('memorySave').disabled ||= availableConfirmations() <= 0 || (!editId && Boolean(state && state.entries.length >= state.limits.maxEntries))
    byId('memoryRefresh').disabled = !supported || loading || busy
    byId('memoryReload').hidden = !dirty() && !editId && !conflict
    byId('memoryReload').disabled = !ready || busy || loading
    byId('memoryConfirm').disabled = locked || !pending
    byId('memoryCancelConfirm').disabled = busy
    byId('memorySave').textContent = busy ? '正在提交…' : editId ? '预览编辑差异' : '预览并确认保存'
    byId('memoryCount').textContent = loading ? '正在读取' : unavailable ? '只读 · 不可用'
      : state.entries.length + ' / ' + state.limits.maxEntries + ' 条 · 剩余确认 ' + availableConfirmations() + ' · 版本 ' + state.revision
    byId('memoryDestination').textContent = state?.destination.configured ? '当前可授权的 API：' + state.destination.label + '。每条需单独勾选；配置变化不会重新绑定旧条目。'
      : '当前没有已配置并授权的 API 目的地。仍可保存仅本机记忆。'
    byId('memoryConsentDestination').textContent = fields.useInChat.checked && state?.destination.configured
      ? '将授权这条记忆用于手动聊天：' + state.destination.label + '。只在确认保存后生效。'
      : '这份草稿仅本机；未授予手动聊天云端使用权限。'
    const n = sizes(fields.text.value)
    fields.text.placeholder = Object.hasOwn(placeholders, fields.kind.value) ? placeholders[fields.kind.value] : placeholders.name
    const charLimit = fields.kind.value === 'name' ? 40 : 200
    byId('memoryTextCount').textContent = n.chars + ' / ' + charLimit + ' 字符 · ' + n.bytes + ' / 512 UTF-8 字节'
    byId('memoryTextCount').dataset.error = String(n.chars > charLimit || n.bytes > 512)
    byId('memoryEditorHeading').textContent = editId ? '编辑 ID ' + editId + '；保存会生成新 ID。在当前删除账本有效时，旧 ID 不会恢复' : '新增一条记忆 · 默认仅本机、30 天到期'
    byId('memoryDraftState').textContent = state?.cleanupPending ? errors.MEMORY_CLEANUP_PENDING : conflict ? errors.MEMORY_CONFLICT
      : dirty() || editId ? '有编辑草稿。刷新不会覆盖；只有预览后再次确认才提交。' : '保存只写入本机，不会立即发送给模型。已删除 ' + (state?.deletedCount || 0) + ' 条；累计确认最多 216 次（含更正与重新授权，删除不重置），另留 40 个 ID 用于安全撤权。'
    group.setAttribute('aria-busy', String(loading || busy))
    renderList()
  }
  async function refresh(discard = false) {
    if (!supported || busy || disposed) return
    const token = ++readId, editVersion = editSerial
    loading = true; render()
    try {
      const result = await api.memoryState()
      if (disposed || token !== readId) return
      if (!validState(result)) {
        discardStaleList(result)
        unavailable = true; hideConfirmation()
        message(errors[result?.code] || '读取记忆失败，当前只读；请刷新核对。不会用空库覆盖已有记忆。', true); return
      }
      const priorDestination = state?.destination.id
      const keep = Boolean(state && (editSerial !== editVersion || (!discard && (dirty() || editId))))
      const changedRevision = Boolean(state && result.revision !== baseRevision)
      state = clone(result); unavailable = false; hideConfirmation()
      let destinationChanged = false
      if (priorDestination !== undefined && (priorDestination !== state.destination.id || !state.destination.configured)) {
        destinationChanged = true; fields.useInChat.checked = false; consentId = null
      }
      if (keep) { if (changedRevision) conflict = true }
      else resetEditor()
      if (state.cleanupPending) message(errors.MEMORY_CLEANUP_PENDING, true)
      else if (conflict) message(errors.MEMORY_CONFLICT, true)
      else if (destinationChanged) message('API 目的地或授权已变化，草稿云端勾选已撤销；若需要，请重新勾选并预览确认。', true)
      else if (state.blockedEntryIds?.length) message('发现 ' + state.blockedEntryIds.length + ' 条疑似敏感旧记录，已阻止用于模型；仍可更正、撤权或删除。', true)
      else message(keep ? '已刷新状态，保留了未保存草稿；没有调用模型。' : '已读取显式记忆；没有新增、发送或自动提取聊天内容。')
    } catch (_) {
      if (!disposed && token === readId) { discardStaleList(); unavailable = true; hideConfirmation(); message('读取失败，草稿仍保留，当前只读；请刷新重试，不会覆盖存储。', true) }
    } finally { if (!disposed && token === readId) { loading = false; render() } }
  }
  function edit(id) {
    if (!state || unavailable || busy || loading || conflict || state.cleanupPending) return
    if (dirty()) { message('现有草稿尚未保存；请先保存，或通过“新增 / 清空草稿”明确放弃后再编辑另一条。', true); return }
    const entry = state.entries.find(item => item.id === id); if (!entry) return
    editId = id; consentId = null
    let ttlDays = 30
    if (!entry.pinned) {
      const days = Math.round((Date.parse(entry.expiresAt) - Date.parse(entry.confirmedAt)) / 86400000)
      if ([1, 7, 30, 90].includes(days)) ttlDays = days
    }
    baseline = { kind: entry.kind, text: entry.text, pinned: entry.pinned, ttlDays, useInChat: false, importance: entry.importance ?? 1 }
    for (const [key, value] of Object.entries(baseline)) { if (typeof value === 'boolean') fields[key].checked = value; else fields[key].value = String(value) }
    baseRevision = state.revision; ++editSerial; hideConfirmation(); render()
    message('正在编辑；旧条目仍有效。保存会生成新 ID；如需云端使用，请重新勾选这一条。')
    fields.text.focus()
  }
  function validDraft(value) {
    if (!Object.hasOwn(kinds, value.kind) || ![1, 7, 30, 90].includes(value.ttlDays) || !Number.isInteger(value.importance) || value.importance < 0 || value.importance > 3 || !validText(value.text) || (value.kind === 'name' && [...value.text].length > 40)) {
      message('内容不能为空；名字最多 40 字符，偏好/兴趣最多 200 个 Unicode 字符，均不超过 512 UTF-8 字节。请检查类别、重要度与有效期。', true); fields.text.focus(); return false
    }
    if (value.useInChat && (!state.destination.configured || !consentId || consentId !== state.destination.id)) {
      fields.useInChat.checked = false; consentId = null; render()
      message('云端授权与当前目的地不一致，请重新勾选并确认；没有提交。', true); return false
    }
    return true
  }
  function stage(kind, id) {
    if (!state || unavailable || busy || loading || state.cleanupPending || (conflict && kind !== 'reload')) return
    let title, lines, payload
    if (kind === 'save') {
      const value = draft(); value.text = value.text.normalize('NFC').replace(/\r\n?/g, '\n').trim()
      if (!validDraft(value)) return
      const previous = editId ? state.entries.find(entry => entry.id === editId) : null
      if (editId && !previous) { conflict = true; render(); message('要编辑的旧条目已不存在，请明确载入最新状态。', true); return }
      title = previous ? '确认编辑：旧 ID → 新 ID' : '确认新增显式记忆'
      lines = [previous ? '旧内容：' + previous.text + '\n新内容：' + value.text : '内容：' + value.text,
        '类别：' + (previous ? kinds[previous.kind] + ' → ' : '') + kinds[value.kind],
        '重要度：' + (previous ? (previous.importance ?? 1) + ' → ' : '') + value.importance + '（由你明确选择，不推断心理）',
        '有效期：' + (previous ? (previous.pinned ? '长期保留' : dateLabel(previous.expiresAt)) + ' → ' : '') + (value.pinned ? '长期保留（直到手动删除）' : value.ttlDays + ' 天，从确认时起'),
        '授权：' + (previous ? authorization(previous) + ' → ' : '') + (value.useInChat ? '手动聊天可按问题发送至 ' + state.destination.label : '仅本机，不发送'),
        '来源：你在设置中手动确认；不会自动记下聊天。']
      if (previous) lines.push('旧 ID：' + previous.id + ' → 确认后生成新 ID；在当前删除账本有效时，旧 ID 不会恢复。')
      payload = { expectedRevision: baseRevision, draft: value, ...(editId ? { replaceId: editId } : {}), ...(value.useInChat ? { expectedDestinationId: state.destination.id } : {}) }
    } else if (kind === 'delete') {
      const entry = state.entries.find(item => item.id === id); if (!entry) return
      title = '确认删除这一条记忆'
      lines = ['将删除：' + entry.text, 'ID：' + entry.id, '将停止后续使用；不能撤回已发送内容、外部备份或服务商历史。']
      payload = { expectedRevision: baseRevision, id }
    } else if (kind === 'clear') {
      title = '确认清空全部记忆'; lines = ['将删除当前全部 ' + state.entries.length + ' 条记忆。在当前删除账本有效时，旧 ID 不会恢复。', '不能撤回已发送内容，也不能擦除外部备份或服务商历史。']
      payload = { expectedRevision: baseRevision }
    } else if (kind === 'revoke') {
      title = '确认撤回全部云端授权'
      lines = ['撤回 ' + state.entries.filter(entry => entry.useInChat).length + ' 条记忆的手动聊天授权；内容保留为仅本机。', '撤权会生成新 ID；在当前删除账本有效时，旧 ID 不会恢复。已发出的内容无法撤回。']
      payload = { expectedRevision: baseRevision }
    } else if (kind === 'reload' || kind === 'new') {
      title = '确认放弃当前草稿'; lines = ['未保存草稿将清空；不改变已保存记忆，不发送数据。']
    } else return
    if (kind !== 'save' && (dirty() || editId)) lines.push('当前编辑草稿也会清空，请先检查是否需要保留。')
    pending = { kind, payload, destinationId: state.destination.id, knownIds: state.entries.map(entry => entry.id) }
    byId('memoryConfirmationTitle').textContent = title
    const list = byId('memoryDiffList'); list.replaceChildren()
    for (const line of lines) { const item = document.createElement('li'); item.textContent = line; list.appendChild(item) }
    byId('memoryConfirmHelp').textContent = ['new', 'reload'].includes(kind) ? '只放弃草稿，不改动已保存内容。' : '再次确认后才提交本机操作，不会立即调用模型；可能停止正在进行的表演与请求。'
    byId('memoryConfirm').textContent = kind === 'save' ? '确认保存' : kind === 'delete' ? '确认删除' : kind === 'clear' ? '确认全部清空' : kind === 'revoke' ? '确认全部撤权' : '确认放弃草稿'
    byId('memoryConfirmation').hidden = false; byId('memorySave').setAttribute('aria-expanded', 'true')
    render(); byId('memoryConfirmationTitle').focus()
  }
  function receiptMatches(action, result) {
    if (!validState(result) || result.revision <= action.payload.expectedRevision || result.cleanupPending) return false
    if (action.kind === 'clear') return result.entries.length === 0
    if (action.kind === 'delete') return !result.entries.some(entry => entry.id === action.payload.id)
    if (action.kind === 'revoke') return result.entries.every(entry => entry.useInChat === false)
    const value = action.payload.draft
    return (!action.payload.replaceId || !result.entries.some(entry => entry.id === action.payload.replaceId))
      && result.entries.some(entry => !action.knownIds.includes(entry.id) && entry.text === value.text && entry.kind === value.kind
        && entry.pinned === value.pinned && entry.useInChat === value.useInChat && entry.schemaVersion === 2 && entry.importance === value.importance
        && (!value.useInChat || entry.destinationId === action.destinationId))
  }
  async function commit() {
    if (!pending || unavailable || busy || loading || disposed || state?.cleanupPending) return
    const action = pending
    if (action.kind === 'new') { resetEditor(); ++editSerial; render(); message('已清空未保存草稿，没有改动记忆库。'); return }
    if (action.kind === 'reload') { hideConfirmation(); await refresh(true); return }
    if (action.kind === 'save' && action.payload.draft.useInChat && action.destinationId !== state.destination.id) { hideConfirmation(); message('API 目的地已变化，请重新确认授权。', true); render(); return }
    busy = true; ++readId; render(); message('正在提交本机操作，等待持久化回执…')
    try {
      const result = action.kind === 'save' ? await api.memorySave(action.payload)
        : action.kind === 'delete' ? await api.memoryDelete(action.payload)
          : action.kind === 'clear' ? await api.memoryClear(action.payload) : await api.memoryRevoke(action.payload)
      if (disposed) return
      hideConfirmation()
      if (!result?.ok) {
        if (result?.code === 'MEMORY_DESTINATION_CHANGED') {
          fields.useInChat.checked = false; consentId = null; unavailable = true
        } else if (result?.code === 'MEMORY_CONFLICT' || result?.status === 409) conflict = true
        if (['MEMORY_CORRUPT', 'MEMORY_UNSAFE_PATH'].includes(result?.code)) unavailable = true
        if (result?.cleanupPending || ['MEMORY_CORRUPT', 'MEMORY_UNSAFE_PATH'].includes(result?.code)) discardStaleList(result)
        if (result?.cleanupPending && state) state.cleanupPending = true
        message(errors[result?.code] || '操作未完成，不能确认保存或删除成功；草稿仍保留，请刷新核对。', true); return
      }
      if (result.cleanupPending && validState(result)) {
        state = clone(result); resetEditor(); message(errors.MEMORY_CLEANUP_PENDING, true); return
      }
      if (!receiptMatches(action, result)) { unavailable = true; message('没有收到可核验的持久化回执，不能确认成功；草稿仍保留，请刷新核对。', true); return }
      state = clone(result); unavailable = false; resetEditor()
      const added = action.kind === 'save' ? state.entries.find(entry => !action.knownIds.includes(entry.id)) : null
      message(action.kind === 'save' ? '已保存并收到持久化回执。' + (action.payload.replaceId ? '旧 ID ' + action.payload.replaceId + ' → 新 ID ' + added.id + '。' : '新 ID：' + added.id + '。') + '没有调用模型。'
        : action.kind === 'revoke' ? '已撤回全部云端授权，内容保留为仅本机；已发送内容无法撤回。'
          : action.kind === 'clear' ? '已清空本机记忆并完成本轮清理；外部备份和已发送内容不在删除范围。' : '已删除这一条并完成本轮清理；在当前删除账本有效时，旧 ID 不会恢复。')
    } catch (_) {
      if (!disposed) { hideConfirmation(); message('提交失败，不能确认操作完成；草稿仍保留，请刷新核对，不要反复连点。', true) }
    } finally { if (!disposed) { busy = false; render() } }
  }
  for (const [key, field] of Object.entries(fields)) {
    const changed = () => {
      ++editSerial
      if (key === 'useInChat') consentId = field.checked && state?.destination.configured ? state.destination.id : null
      hideConfirmation(); render()
    }
    field.addEventListener('input', changed); field.addEventListener('change', changed)
  }
  for (const [id, action] of [['memorySave', 'save'], ['memoryClear', 'clear'], ['memoryRevoke', 'revoke'], ['memoryReload', 'reload']]) byId(id).addEventListener('click', () => stage(action))
  byId('memoryNew').addEventListener('click', () => { if (dirty() || editId) stage('new'); else { resetEditor(); render(); fields.text.focus() } })
  byId('memoryRefresh').addEventListener('click', () => { void refresh(false) })
  byId('memoryConfirm').addEventListener('click', () => { void commit() })
  byId('memoryCancelConfirm').addEventListener('click', () => { hideConfirmation(); render(); fields.text.focus() })
  window.addEventListener('settings:tab-change', event => { if (event.detail?.name === 'director') void refresh(false) })
  window.addEventListener('director:config-updated', () => {
    fields.useInChat.checked = false; consentId = null; ++editSerial; hideConfirmation()
    if (busy) { conflict = true; render() } else void refresh(false)
  })
  window.addEventListener('pagehide', () => { disposed = true; ++readId; pending = null })
  resetEditor(); render()
  if (supported) void refresh(false)
  else message('当前版本没有显式记忆接口，保持只读；请使用配套版本。', true)
})()
