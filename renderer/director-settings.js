'use strict'

;(() => {
  const panel = document.getElementById('settingsPanelDirector')
  if (!panel) return
  const api = window.settings
  const byId = id => document.getElementById(id)
  const controls = {
    enabled: byId('directorEnabled'), baseURL: byId('directorBaseURL'), model: byId('directorModel'),
    tokenizerProfile: byId('directorTokenizerProfile'), contextTokens: byId('directorContextTokens'),
    allowRemote: byId('directorAllowRemote'), allowDiagnostics: byId('directorAllowDiagnostics'),
    key: byId('directorApiKey'), text: byId('directorText'), refresh: byId('directorRefresh'),
    save: byId('directorSaveConfig'), saveDiagnostics: byId('directorSaveDiagnostics'),
    saveKey: byId('directorSaveKey'), clearKey: byId('directorClearKey'),
    local: byId('directorPreviewLocal'), remote: byId('directorPreviewRemote'), cancel: byId('directorCancel'),
  }
  const configControls = ['enabled', 'baseURL', 'model', 'allowRemote', 'allowDiagnostics', 'tokenizerProfile', 'contextTokens'].map(key => controls[key])
  const supported = ['directorState', 'directorSave', 'directorClearKey', 'directorPreview', 'directorCancel']
    .every(name => typeof api?.[name] === 'function')
  let state = null
  let loading = false, saving = false, previewing = false, stopping = false, disposed = false
  let stateRevision = 0, editRevision = 0, previewRevision = 0, refreshTimer = 0
  let directorTabActive = document.body.dataset.settingsTab === 'director'

  function message(text, error = false, preview = false) {
    const target = byId(preview ? 'directorPreviewStatus' : 'directorStatus')
    target.textContent = text
    target.dataset.error = String(error)
  }

  function draft() {
    return {
      enabled: controls.enabled.checked, baseURL: controls.baseURL.value.trim(), model: controls.model.value.trim(),
      allowRemote: controls.allowRemote.checked, allowDiagnostics: controls.allowDiagnostics.checked,
      tokenizerProfile: controls.tokenizerProfile.value, contextTokens: Number(controls.contextTokens.value),
    }
  }

  function isDirty() {
    return state && JSON.stringify(draft()) !== JSON.stringify(state.config)
  }

  function count(value) {
    if (Array.isArray(value)) return value.length
    return Number.isInteger(value) && value >= 0 ? value : null
  }

  function sanitizeState(result) {
    if (!result?.ok || !result.config || typeof result.config !== 'object') throw new Error('STATE_UNAVAILABLE')
    const config = result.config
    return {
      config: {
        enabled: config.enabled === true,
        baseURL: typeof config.baseURL === 'string' ? config.baseURL : '',
        model: typeof config.model === 'string' ? config.model : '',
        allowRemote: config.allowRemote === true, allowDiagnostics: config.allowDiagnostics === true,
        tokenizerProfile: config.tokenizerProfile === 'deepseek-v4' ? 'deepseek-v4' : 'conservative', contextTokens: Number.isInteger(config.contextTokens) ? config.contextTokens : 32768,
      },
      hasKey: result.hasKey === true, encryptionAvailable: result.encryptionAvailable === true,
      keySource: result.keySource === 'encrypted-local' ? 'encrypted-local' : 'none',
      capabilities: {
        gestures: count(result.capabilities?.gestures), emotions: count(result.capabilities?.emotions), outfits: count(result.capabilities?.outfits),
      },
      running: Boolean(result.running),
    }
  }

  function acceptState(result, updateForm) {
    state = sanitizeState(result)
    if (updateForm) {
      for (const key of ['enabled', 'allowRemote', 'allowDiagnostics']) controls[key].checked = state.config[key]
      for (const key of ['baseURL', 'model', 'tokenizerProfile', 'contextTokens']) controls[key].value = state.config[key]
    }
    // Never assign any returned value to the password field, even a placeholder key.
    render()
  }

  function remoteReady() {
    return Boolean(state?.config.enabled && state.config.allowRemote && state.hasKey && !isDirty()
      && !controls.key.value.trim() && controls.text.value.trim())
  }

  function render() {
    const ready = supported && Boolean(state)
    const busy = saving || previewing || stopping
    for (const control of configControls) control.disabled = !ready || busy
    controls.text.disabled = !ready || busy
    controls.key.disabled = !ready || busy || !state.encryptionAvailable
    controls.refresh.disabled = !supported || loading || saving || stopping
    controls.save.disabled = controls.saveDiagnostics.disabled = !ready || busy
    controls.saveKey.disabled = !ready || busy || !state.encryptionAvailable || !controls.key.value.trim()
    controls.clearKey.disabled = !ready || busy || !(state.hasKey || controls.key.value)
    controls.local.disabled = !ready || busy || state.running || !controls.text.value.trim()
    controls.remote.disabled = !ready || busy || state.running || !remoteReady()
    controls.cancel.disabled = !ready || stopping || saving || (!previewing && !state.running)
    controls.local.textContent = previewing && controls.local.dataset.pending === 'true' ? '正在本地预演…' : '本地预演'
    controls.remote.textContent = previewing && controls.remote.dataset.pending === 'true' ? '正在调用…' : '调用配置API并表演'
    controls.cancel.textContent = stopping ? '正在停止…' : '停止表演'
    panel.setAttribute('aria-busy', String(loading || busy))
    byId('directorDraftState').textContent = isDirty()
      ? '有未保存的配置；保存后才能使用新配置调用。保存不会联网。'
      : '配置需手动保存；保存不会发起远程调用。'

    if (!ready) return
    const capabilities = [['gestures', '动作'], ['emotions', '表情'], ['outfits', '装扮']]
      .filter(([key]) => state.capabilities[key] !== null)
      .map(([key, label]) => label + ' ' + state.capabilities[key])
    byId('directorCapabilities').textContent = capabilities.length ? capabilities.join(' · ') : '角色能力尚未就绪，请稍后刷新'
    byId('directorRunningState').textContent = previewing ? '正在处理本次试演' : state.running ? '表演进行中' : '当前没有导演表演'
    let privacy = !state.config.enabled ? '直连接入关闭'
      : state.config.allowRemote ? '远程发送已授权；自主 API 另需独立授权与手动启动' : '直连接入已开启，远程发送未授权'
    if (state.config.allowDiagnostics) privacy += '；高级诊断 eval 已开启'
    byId('directorPrivacyState').textContent = privacy
    byId('directorKeyState').textContent = (state.hasKey
      ? state.keySource === 'encrypted-local' ? '本机已加密保存密钥，不会回显。' : '已检测到密钥，存储来源待确认。'
      : '尚未保存密钥。') + (state.encryptionAvailable ? ' 系统加密可用。' : ' 系统加密不可用，不能保存新密钥。')

    const missing = []
    if (!state.config.enabled) missing.push('启用直接接入')
    if (!state.config.allowRemote) missing.push('勾选远程发送授权')
    if (!state.hasKey) missing.push('保存密钥')
    if (isDirty()) missing.push('保存当前配置')
    if (controls.key.value.trim()) missing.push('保存或清空新输入的密钥')
    if (!controls.text.value.trim()) missing.push('输入本次试演内容')
    byId('directorRemoteHint').textContent = missing.length
      ? '远程调用前需要：' + missing.join('、') + '。'
      : '本次按钮发送统一人设和当前输入。自主 API 使用独立授权；启动后定期检查，仅在有事件且预算允许时调用。'
  }

  function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = 0
    // This reads local IPC state only; it never invokes a provider or takes screenshots.
    if (!disposed && directorTabActive && state?.running && !saving && !previewing && !stopping) {
      refreshTimer = window.setTimeout(() => { refreshTimer = 0; void refreshState(false) }, 1000)
    }
  }

  async function refreshState(announce = false) {
    if (!supported || disposed || saving) return
    const revision = ++stateRevision, edit = editRevision
    loading = true
    render()
    try {
      const result = await api.directorState()
      if (disposed || revision !== stateRevision) return
      const first = !state
      acceptState(result, edit === editRevision && !isDirty())
      if (announce || first) message('状态已读取；没有发起远程调用。')
    } catch (_) {
      if (!disposed && revision === stateRevision) message('读取导演状态失败，请稍后刷新重试。', true)
    } finally {
      if (!disposed && revision === stateRevision) { loading = false; render(); scheduleRefresh() }
    }
  }

  function validConfig(config) {
    if (config.baseURL) {
      try {
        const address = new URL(config.baseURL)
        if (!['https:', 'http:'].includes(address.protocol) || address.username || address.password) throw new Error('INVALID_URL')
      } catch (_) {
        message('请填写有效的 HTTP(S) 服务地址；不要把密钥放进地址中。', true)
        controls.baseURL.focus({ preventScroll: true })
        return false
      }
    }
    if (config.enabled && (!config.baseURL || !config.model)) {
      message('启用直接接入前，请填写服务地址和模型名称。', true)
      ;(!config.baseURL ? controls.baseURL : controls.model).focus({ preventScroll: true })
      return false
    }
    return true
  }

  async function save(kind) {
    if (!supported || !state || saving || previewing || stopping) return
    const clearing = kind === 'clear', includeKey = kind === 'key', diagnosticsOnly = kind === 'diagnostics'
    const config = diagnosticsOnly ? { ...state.config, allowDiagnostics: controls.allowDiagnostics.checked } : draft()
    if (!clearing && !validConfig(config)) return
    if (includeKey && (!state.encryptionAvailable || !controls.key.value.trim())) return
    const preserveDraft = diagnosticsOnly || (clearing && Boolean(isDirty()))
    const payload = { ...config }
    if (includeKey) payload.apiKey = controls.key.value.trim()
    if (includeKey || clearing) controls.key.value = ''
    ++stateRevision
    loading = false
    saving = true
    render()
    message(clearing ? '正在清除本机密钥…' : includeKey ? '正在加密保存密钥，输入框已清空…' : '正在保存配置，不会联网…')
    try {
      const result = clearing ? await api.directorClearKey() : await api.directorSave(payload)
      if (disposed) return
      acceptState(result, !preserveDraft)
      window.dispatchEvent(new CustomEvent('director:config-updated'))
      message(clearing ? '本机密钥已清除。' : includeKey ? '密钥已保存，输入框已清空；没有发起远程调用。' : diagnosticsOnly ? '诊断设置已保存；其他未保存的配置保持不变。' : '配置已保存；没有发起远程调用。')
    } catch (_) {
      if (!disposed) message(clearing
        ? '清除未完成，密钥状态尚未确认。请刷新后重试。'
        : includeKey ? '保存未完成，密钥输入已清空。请确认系统加密可用后重新输入。'
          : '保存未完成，请检查服务地址、模型名称后重试。', true)
    } finally {
      if (includeKey) payload.apiKey = ''
      if (!disposed) { saving = false; render(); scheduleRefresh() }
    }
  }

  async function preview(remote) {
    if (!supported || !state || saving || previewing || stopping || state.running) return
    const text = controls.text.value.trim()
    if (!text || (remote && !remoteReady())) return
    const revision = ++previewRevision
    previewing = true
    controls.local.dataset.pending = String(!remote)
    controls.remote.dataset.pending = String(remote)
    render()
    message(remote ? '正在将本次输入发送到已配置服务商…' : '正在进行本地预演，不调用远程模型…', false, true)
    try {
      const result = await api.directorPreview({ text, remote })
      if (disposed || revision !== previewRevision) return
      if (!result?.ok && ['CONTEXT_LIMIT', 'IMAGE_PROFILE_UNSUPPORTED', 'TOKENIZER_UNAVAILABLE', 'BUDGET_INVALID'].includes(result?.code)) { message(result.error, true, true); return }
      if (!result?.ok) throw new Error('PREVIEW_FAILED')
      // Do not print the input, provider response, raw plan, history or credentials.
      message(remote ? '远程调用已完成；表演状态见上方。' : '本地预演已完成；没有调用远程模型。', false, true)
      await refreshState(false)
    } catch (_) {
      if (!disposed && revision === previewRevision) message(remote
        ? '调用未完成，请检查已保存配置、服务可用性及网络后重试。'
        : '本地预演未完成，请检查本次输入后重试。', true, true)
    } finally {
      if (!disposed && revision === previewRevision) { previewing = false; render(); scheduleRefresh() }
    }
  }

  async function cancel() {
    if (!supported || !state || stopping || saving || (!previewing && !state.running)) return
    const wasPreviewing = previewing
    ++previewRevision
    previewing = false
    stopping = true
    render()
    try {
      const result = await api.directorCancel()
      if (disposed) return
      if (!result?.ok) throw new Error('CANCEL_FAILED')
      state.running = false
      message('已停止表演。已经发送到服务商的文字无法撤回。', false, true)
      await refreshState(false)
    } catch (_) {
      if (!disposed) {
        state.running = state.running || wasPreviewing
        message('未能确认停止，请稍后重试。', true, true)
      }
    } finally {
      if (!disposed) { stopping = false; render(); scheduleRefresh() }
    }
  }

  for (const control of configControls) control.addEventListener('input', () => {
    // A retained checkbox is not fresh consent to a changed recipient/model.
    if (control === controls.baseURL || control === controls.model) {
      controls.allowRemote.checked = false
      message('服务地址或模型已编辑；请确认目的地后重新勾选并保存。跨服务地址保存会清除旧密钥，需在专用框重新输入。')
    }
    ++editRevision; render()
  })
  controls.key.addEventListener('input', render)
  controls.text.addEventListener('input', render)
  controls.refresh.addEventListener('click', () => { void refreshState(true) })
  controls.save.addEventListener('click', () => { void save('config') })
  controls.saveDiagnostics.addEventListener('click', () => { void save('diagnostics') })
  controls.saveKey.addEventListener('click', () => { void save('key') })
  controls.clearKey.addEventListener('click', () => { void save('clear') })
  controls.local.addEventListener('click', () => { void preview(false) })
  controls.remote.addEventListener('click', () => { void preview(true) })
  controls.cancel.addEventListener('click', () => { void cancel() })
  window.addEventListener('settings:tab-change', event => {
    const wasActive = directorTabActive
    directorTabActive = event.detail?.name === 'director'
    if (directorTabActive) {
      const footer = byId('appearanceStatus')
      footer.textContent = '导演 / API 配置需手动保存；保存不会发起远程调用。'
      footer.dataset.error = 'false'
      void refreshState(false)
    } else if (wasActive) {
      byId('appearanceStatus').textContent = '更改即时生效 · 拖动标题栏可移动窗口'
      byId('appearanceStatus').dataset.error = 'false'
    }
    scheduleRefresh()
  })
  window.addEventListener('pagehide', () => {
    disposed = true
    controls.key.value = ''
    if (refreshTimer) clearTimeout(refreshTimer)
  })
  render()
  if (supported) void refreshState(false)
  else message('当前主进程尚未提供导演接口，请使用配套版本后重试。', true)
})()
