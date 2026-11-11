'use strict'

;(() => {
  const byId = id => document.getElementById(id)
  const group = byId('personaControls')
  if (!group) return
  const api = window.settings
  const supported = ['personaState', 'personaSave', 'personaReset', 'personaRollback'].every(name => typeof api?.[name] === 'function')
  const definitions = [
    ['Name', '名字', ['identity', 'name']], ['Role', '身份与角色', ['identity', 'role']],
    ['Warmth', '温和程度', ['temperament', 'warmth']], ['Playfulness', '俏皮程度', ['temperament', 'playfulness']],
    ['Initiative', '主动程度', ['temperament', 'initiative']], ['Length', '回复长短', ['voice', 'defaultLength']],
    ['Address', '对你的称呼', ['voice', 'address']], ['StyleNotes', '补充风格', ['styleNotes']],
  ]
  const fields = Object.fromEntries(definitions.map(([id]) => [id, byId('persona' + id)]))
  const labels = { gentle: '温柔', neutral: '平和', lively: '活泼', low: '克制', medium: '适中', high: '俏皮',
    restrained: '克制陪伴', balanced: '适度主动', short: '简短', normal: '正常' }
  const clone = value => JSON.parse(JSON.stringify(value))
  const at = (value, keys) => keys.reduce((current, key) => current?.[key], value)
  const object = value => value && typeof value === 'object' && !Array.isArray(value)
  const string = (value, max, required = false) => typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0)
  const list = (value, count, length) => Array.isArray(value) && value.length <= count && value.every(item => string(item, length))
  let state = null, pending = null, busy = false, loading = false, unavailable = true, conflict = false, disposed = false
  let reads = 0, edits = 0

  function validPersona(p) {
    return object(p) && p.schemaVersion === 1 && p.personaId === 'dafeiyu-default'
      && object(p.identity) && string(p.identity.name, 40, true) && string(p.identity.role, 160, true)
      && object(p.temperament) && ['gentle', 'neutral', 'lively'].includes(p.temperament.warmth)
      && ['low', 'medium', 'high'].includes(p.temperament.playfulness) && ['restrained', 'balanced'].includes(p.temperament.initiative)
      && object(p.voice) && p.voice.language === 'zh-CN' && ['short', 'normal'].includes(p.voice.defaultLength)
      && string(p.voice.address, 40) && list(p.voice.catchphrases, 3, 40) && list(p.voice.avoid, 5, 80)
      && object(p.interactionStyle) && string(p.interactionStyle.companionship, 200) && string(p.interactionStyle.humor, 200)
      && string(p.styleNotes, 2000)
  }
  function validState(result) {
    return result?.ok === true && Number.isSafeInteger(result.revision) && result.revision >= 0
      && typeof result.persisted === 'boolean' && validPersona(result.persona)
      && Array.isArray(result.history) && result.history.length <= 5
      && result.history.every(item => object(item) && Number.isSafeInteger(item.revision) && item.revision >= 1)
  }
  function status(text, error = false) {
    byId('personaStatus').textContent = text
    byId('personaStatus').dataset.error = String(error)
  }
  function draft() {
    if (!state) return null
    const result = clone(state.persona)
    for (const [id, , keys] of definitions) {
      const parent = keys.length === 1 ? result : result[keys[0]]
      parent[keys.at(-1)] = fields[id].value
    }
    return result
  }
  function dirty() { return Boolean(state && JSON.stringify(draft()) !== JSON.stringify(state.persona)) }
  function clearConfirmation() {
    pending = null
    byId('personaConfirmation').hidden = true
    byId('personaSave').setAttribute('aria-expanded', 'false')
  }
  function fill() {
    for (const [id, , keys] of definitions) fields[id].value = at(state.persona, keys)
  }
  function history() {
    const select = byId('personaHistory'), previous = select.value
    select.replaceChildren()
    const empty = document.createElement('option')
    empty.value = ''; empty.textContent = state?.history.length ? '选择一个已保存版本' : '尚无已保存版本'
    select.appendChild(empty)
    for (const item of state?.history || []) {
      const option = document.createElement('option')
      option.value = String(item.revision)
      const date = new Date(item.changedAt)
      const dateLabel = Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { hour12: false }) : '时间未提供'
      option.textContent = '版本 ' + item.revision + (item.revision === state.revision ? '（当前）' : '') + ' · ' + dateLabel
      option.disabled = item.revision === state.revision
      select.appendChild(option)
    }
    if (state?.history.some(item => String(item.revision) === previous && item.revision !== state.revision)) select.value = previous
    else select.value = ''
  }
  function legacy() {
    let found = false
    for (const key of ['Chat', 'Autonomy']) {
      const value = state?.legacy?.[key.toLowerCase()]
      const present = typeof value === 'string' && value.trim().length > 0
      byId('personaLegacy' + key + 'Group').hidden = !present
      byId('personaLegacy' + key + 'Text').textContent = present ? value : ''
      found ||= present
    }
    const allowedWarnings = new Set([
      '旧聊天设定超过显示上限（20,000 个 UTF-16 单位），未加载；未截断或改写旧文件。',
      '旧自主人设超过显示上限（20,000 个 UTF-16 单位），未加载；未截断或改写旧文件。',
    ])
    const warnings = Array.isArray(state?.legacyWarnings) ? state.legacyWarnings.filter(value => allowedWarnings.has(value)) : []
    const hint = found
      ? '两个旧源请选其一，仅在补充风格草稿为空时导入；已有内容请先手动清空。不自动拼接，仍需确认保存，不删除旧文件。'
      : warnings.length ? '部分旧设定未加载，不影响现有统一人设。' : '没有可导入的旧设定；不会读取其他应用的配置或密钥。'
    byId('personaLegacyHint').textContent = [hint, ...warnings].join('\n')
  }
  function render() {
    const ready = supported && Boolean(state) && !unavailable
    for (const field of Object.values(fields)) field.disabled = !ready || busy
    byId('personaSave').disabled = !ready || busy || loading || conflict || (state.persisted && !dirty())
    byId('personaRefresh').disabled = !supported || busy || loading
    byId('personaReset').disabled = !ready || busy || loading || conflict
    byId('personaHistory').disabled = !ready || busy || loading || conflict
    byId('personaRollback').disabled = !ready || busy || loading || conflict || !byId('personaHistory').value
    byId('personaConfirm').disabled = !ready || busy || loading || !pending
    byId('personaCancelConfirm').disabled = busy
    byId('personaReload').hidden = !dirty() && !conflict
    byId('personaReload').disabled = !ready || busy || loading
    for (const key of ['Chat', 'Autonomy']) byId('personaImport' + key).disabled = !ready || busy || loading || conflict
    byId('personaRevision').textContent = loading ? '正在读取' : unavailable ? '只读 · 不可用'
      : '版本 ' + state.revision + (state.persisted ? ' · 已保存' : ' · 尚未落盘')
    byId('personaSave').textContent = busy ? '正在提交…' : '查看差异并保存'
    byId('personaDraftState').textContent = conflict ? '检测到版本冲突。草稿仍保留；请先载入最新版本，再重新编辑。'
      : dirty() ? '有未保存修改。刷新不会覆盖草稿；保存会停止表演与自主会话，需手动重新开始。'
        : '保存会停止当前手动与自主表演；需要手动重新开始。'
    group.setAttribute('aria-busy', String(loading || busy))
  }
  async function refresh(discard = false) {
    if (!supported || busy || disposed) return
    const token = ++reads, edit = edits
    loading = true; render()
    try {
      const result = await api.personaState()
      if (disposed || token !== reads) return
      if (!validState(result)) {
        unavailable = true; clearConfirmation()
        status('人设存储不可读或数据损坏，当前只读；不会用默认值覆盖。请关闭桌宠、修复存储后重新启动。', true)
        return
      }
      unavailable = false
      if (state && (edits !== edit || (dirty() && !discard))) {
        if (result.revision !== state.revision) conflict = true
        status(conflict ? '后台版本已变化，未覆盖你的草稿。请明确载入最新版本后重试。' : '状态已刷新，未保存草稿保持不变。', conflict)
      } else {
        state = clone(result); conflict = false; clearConfirmation(); fill(); history(); legacy()
        status(state.persisted ? '已读取保存的人设；没有启动或调用模型。' : '正在使用默认人设，尚未写入文件；编辑后确认保存即可生效。')
      }
    } catch (_) {
      if (!disposed && token === reads) { unavailable = true; clearConfirmation(); status('读取失败，当前只读；草稿保持不变，请刷新重试。', true) }
    } finally { if (!disposed && token === reads) { loading = false; render() } }
  }
  function differences(value) {
    const changed = []
    for (const [id, label, keys] of definitions) {
      const before = at(state.persona, keys), after = at(value, keys)
      if (before === after) continue
      if (id === 'StyleNotes') changed.push(label + '：' + before.length + ' 字 → ' + after.length + ' 字（完整草稿见上方）')
      else changed.push(label + '：' + (labels[before] || before || '未填写') + ' → ' + (labels[after] || after || '未填写'))
    }
    return changed
  }
  function stage(kind) {
    if (!state || unavailable || busy || loading || (conflict && kind !== 'reload')) return
    let lines, title, payload
    if (kind === 'save') {
      const persona = draft()
      if (!validPersona(persona)) {
        status('请填写名字和身份，并遵守字段长度与选项限制。', true)
        const target = !string(persona.identity.name, 40, true) ? fields.Name : !string(persona.identity.role, 160, true) ? fields.Role : fields.StyleNotes
        target.focus(); return
      }
      lines = differences(persona)
      if (!lines.length && state.persisted) { status('没有需要保存的差异。'); return }
      if (!lines.length) lines.push('首次保存当前默认人设。')
      payload = { expectedRevision: state.revision, persona }
      title = '确认保存以下差异'
    } else if (kind === 'reset') {
      payload = { expectedRevision: state.revision }
      title = '确认恢复默认人设'
      lines = ['使用内置默认人设替换当前人设，并产生新版本。', '当前未保存草稿将被丢弃；旧文件与历史不会被当作安全擦除。']
    } else if (kind === 'rollback') {
      const targetRevision = Number(byId('personaHistory').value)
      if (!state.history.some(item => item.revision === targetRevision) || targetRevision === state.revision) return
      payload = { expectedRevision: state.revision, targetRevision }
      title = '确认历史回滚'
      lines = ['用历史版本 ' + targetRevision + ' 的完整人设替换当前内容，并产生新版本。', '当前未保存草稿将被丢弃。']
    } else if (kind === 'reload') {
      title = '确认丢弃未保存草稿'
      lines = ['放弃当前未保存编辑，读取最新保存版本；不会改变已保存人设或运行状态。']
    } else return
    pending = { kind, payload }
    byId('personaConfirmationTitle').textContent = title
    const diff = byId('personaDiffList')
    diff.replaceChildren()
    for (const line of lines) { const item = document.createElement('li'); item.textContent = line; diff.appendChild(item) }
    byId('personaConfirmHelp').textContent = kind === 'reload' ? '只重新读取本机人设，不保存、不联网。'
      : '仅保存，不会调用模型。当前表演和自主会话将停止，需手动重新开始。'
    byId('personaConfirm').textContent = kind === 'save' ? '确认保存' : kind === 'reset' ? '确认恢复默认' : kind === 'rollback' ? '确认回滚' : '确认丢弃并载入'
    byId('personaConfirmation').hidden = false
    byId('personaSave').setAttribute('aria-expanded', 'true')
    render(); byId('personaConfirmationTitle').focus()
  }
  async function commit() {
    if (!pending || busy || loading || unavailable || disposed) return
    const action = pending
    if (action.kind === 'reload') { clearConfirmation(); await refresh(true); return }
    busy = true; ++reads; render(); status('正在提交人设；不会调用模型…')
    let needsRefresh = false, busyConflict = false
    try {
      const result = action.kind === 'save' ? await api.personaSave(action.payload)
        : action.kind === 'reset' ? await api.personaReset(action.payload) : await api.personaRollback(action.payload)
      if (disposed) return
      if (!result?.ok) {
        clearConfirmation()
        if (result?.status === 409) {
          busyConflict = result.error === '另一个保存正在进行，或上次异常退出留下锁；未改动现有版本'
          if (!busyConflict) conflict = true
          needsRefresh = true
          status('保存发生冲突，正在读取最新状态；你的草稿不会被覆盖。', true)
        }
        else {
          if (result?.status === 503) unavailable = true
          status(result?.status === 503 ? '存储不可用，当前只读；未保存成功，草稿仍保留。请关闭桌宠、修复存储后重新启动。' : '保存未完成；草稿仍保留，请检查或刷新后重试。', true)
        }
        return
      }
      if (!validState(result) || result.persisted !== true || result.revision <= action.payload.expectedRevision) {
        unavailable = true; clearConfirmation()
        status('未收到有效保存回执，不能确认成功；草稿仍保留，请刷新核对。', true); return
      }
      state = clone(result); conflict = false; unavailable = false; clearConfirmation(); fill(); history(); legacy()
      status('人设已保存为版本 ' + state.revision + '。手动与自主表演已停止，需要手动重新开始；没有调用模型。')
      document.dispatchEvent(new CustomEvent('persona:updated', { detail: { revision: state.revision } }))
    } catch (_) {
      if (!disposed) { clearConfirmation(); status('提交失败，不能确认保存成功；草稿仍保留，请刷新核对后重试。', true) }
    } finally {
      if (!disposed) {
        busy = false; render()
        if (needsRefresh) await refresh(false)
        if (!disposed && busyConflict) status('另一个保存正在进行，或上次异常退出留下锁；未改动现有版本。若持续提示残留锁，请正常退出桌宠后检查，不要删除活动进程的锁。', true)
      }
    }
  }
  function importLegacy(key) {
    if (!state || unavailable || busy || conflict) return
    const value = state.legacy?.[key]
    if (typeof value !== 'string' || !value.trim()) return
    if (fields.StyleNotes.value.length > 0) { status('补充风格已有草稿，未覆盖或拼接。两个旧源请选其一；若要更换，请先手动清空草稿再导入。', true); return }
    if (value.length > 2000) { status('所选旧设定超过 2000 字；没有截断或覆盖草稿，请手动选择并精简内容。', true); return }
    fields.StyleNotes.value = value; ++edits; clearConfirmation(); render()
    status('已将所选单一旧源用作补充风格草稿，尚未保存；请检查差异后确认。')
    fields.StyleNotes.focus()
  }
  for (const field of Object.values(fields)) {
    const changed = () => { ++edits; clearConfirmation(); render() }
    field.addEventListener('input', changed); field.addEventListener('change', changed)
  }
  for (const [id, kind] of [['personaSave', 'save'], ['personaReset', 'reset'], ['personaRollback', 'rollback'], ['personaReload', 'reload']]) byId(id).addEventListener('click', () => stage(kind))
  byId('personaRefresh').addEventListener('click', () => { void refresh(false) })
  byId('personaHistory').addEventListener('change', () => { clearConfirmation(); render() })
  byId('personaConfirm').addEventListener('click', () => { void commit() })
  byId('personaCancelConfirm').addEventListener('click', () => { clearConfirmation(); render(); fields.Name.focus() })
  byId('personaImportChat').addEventListener('click', () => importLegacy('chat'))
  byId('personaImportAutonomy').addEventListener('click', () => importLegacy('autonomy'))
  byId('autonomyEditPersona').addEventListener('click', () => { group.scrollIntoView({ block: 'start' }); fields.Name.focus({ preventScroll: true }) })
  window.addEventListener('settings:tab-change', event => { if (event.detail?.name === 'director' && !busy) void refresh(false) })
  window.addEventListener('pagehide', () => { disposed = true; ++reads; pending = null })
  render()
  if (supported) void refresh(false)
  else status('当前版本未提供人设接口，已保持只读；请使用配套版本。', true)
})()
