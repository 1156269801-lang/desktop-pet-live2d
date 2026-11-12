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
    connect: byId('directorConnect'), test: byId('directorTest'),
    local: byId('directorPreviewLocal'), remote: byId('directorPreviewRemote'), cancel: byId('directorCancel'),
  }
  const configControls = ['enabled', 'baseURL', 'model', 'allowRemote', 'allowDiagnostics', 'tokenizerProfile', 'contextTokens'].map(key => controls[key])
  const supported = ['directorState', 'directorSave', 'directorClearKey', 'directorPreview', 'directorCancel']
    .every(name => typeof api?.[name] === 'function')
  const connectSupported = supported && typeof api?.directorConnect === 'function' && typeof api?.directorTest === 'function'
  let state = null
  let loading = false, saving = false, previewing = false, stopping = false, disposed = false
  let stateRevision = 0, editRevision = 0, previewRevision = 0, refreshTimer = 0
  let directorTabActive = document.body.dataset.settingsTab === 'director'

  function message(text, error = false, preview = false) {
    const target = byId(preview ? 'directorPreviewStatus' : 'directorStatus')
    target.textContent = text
    target.dataset.error = String(error)
    // 保存类提示原本只显示在「自主」子页里，在 API 页看不到：这里同步一份
    if (!preview) connectMessage(text, error)
  }

  function connectMessage(text, error = false) {
    const target = byId('directorConnectStatus')
    target.textContent = text
    target.dataset.error = String(error)
  }

  const TEST_MESSAGES = {
    ok: '已连接，可以聊天了。',
    auth: '密钥被拒绝（401/403）。请检查密钥是否完整、是否属于这个服务商。',
    balance: '服务商提示余额不足（402）。',
    'not-found': '服务地址或模型名称不存在（404）。',
    'bad-request': '请求被拒绝（400/422），多半是模型名称不对。',
    rate: '请求太频繁或额度已用尽（429），稍后再试。',
    server: '服务商暂时出错（5xx），稍后再试。',
    status: '服务商返回了未预期的状态。',
    network: '连不上这个地址。请检查网络、代理和服务地址。',
    timeout: '连接超时。请检查网络和服务地址。',
    format: '连上了，但返回的不是标准的 chat/completions 格式。请确认服务地址写到了正确的层级。',
    'no-key': '还没有密钥。换了服务地址后旧密钥会被清除，请重新输入。',
    address: '服务地址无效：需要 https 地址（本机可用 http://127.0.0.1）。',
    model: '请填写模型名称。',
    disabled: '还没有保存并连接。',
    vault: '读取本机密钥失败，请确认系统加密可用后重新输入密钥。',
  }

  function showTest(test) {
    const code = typeof test?.code === 'string' && Object.hasOwn(TEST_MESSAGES, test.code) ? test.code : 'status'
    const models = (Array.isArray(test?.models) ? test.models : []).filter(id => typeof id === 'string').slice(0, 40)
    const list = byId('directorModelList')
    list.replaceChildren(...models.map(id => { const option = document.createElement('option'); option.value = id; return option }))
    const hint = models.length ? ' 这个地址可用的模型：' + models.slice(0, 8).join('、') + (models.length > 8 ? ' 等' : '') + '。' : ''
    connectMessage((test?.ok === true ? '' : '已保存，但没连上：') + TEST_MESSAGES[code] + hint, test?.ok !== true)
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
    const typedKey = Boolean(controls.key.value.trim())
    controls.connect.disabled = !ready || !connectSupported || busy || !controls.baseURL.value.trim() || !controls.model.value.trim()
      || !(typedKey || state.hasKey) || (typedKey && !state.encryptionAvailable)
    controls.test.disabled = !ready || !connectSupported || busy || Boolean(isDirty()) || typedKey
      || !(state.config.enabled && state.config.allowRemote && state.hasKey)
    controls.connect.textContent = saving && controls.connect.dataset.pending === 'true' ? '正在连接…' : '保存并连接'
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

  async function connect(testOnly) {
    if (!connectSupported || !state || saving || previewing || stopping) return
    const payload = { baseURL: controls.baseURL.value.trim(), model: controls.model.value.trim() }
    if (!testOnly && !validConfig({ ...payload, enabled: true })) return
    const typed = controls.key.value.trim()
    if (!testOnly && typed) payload.apiKey = typed
    if (!testOnly) controls.key.value = ''
    ++stateRevision
    loading = false
    saving = true
    controls.connect.dataset.pending = String(!testOnly)
    render()
    connectMessage(testOnly ? '正在测试连接…' : '正在保存并测试连接…')
    try {
      const result = testOnly ? await api.directorTest() : await api.directorConnect(payload)
      if (disposed) return
      if (!result?.ok) { connectMessage(typeof result?.error === 'string' ? result.error : '保存未完成，请检查后重试。', true); return }
      acceptState(result, !testOnly)
      if (!testOnly) window.dispatchEvent(new CustomEvent('director:config-updated'))
      showTest(result.test)
    } catch (_) {
      if (!disposed) connectMessage(testOnly ? '测试未完成，请重试。' : '保存未完成，密钥输入已清空，请重新输入后重试。', true)
    } finally {
      payload.apiKey = ''
      if (!disposed) { saving = false; controls.connect.dataset.pending = 'false'; render(); scheduleRefresh() }
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
      message('服务地址或模型已修改，点「保存并连接」生效。换了服务地址需要重新输入密钥。')
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
  controls.connect.addEventListener('click', () => { void connect(false) })
  controls.test.addEventListener('click', () => { void connect(true) })
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
