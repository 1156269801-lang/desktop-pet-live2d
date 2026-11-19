'use strict'

;(() => {
  const panel = document.getElementById('settingsPanelQuick')
  if (!panel) return
  const api = window.settings
  const el = id => document.getElementById('quick' + id)
  let state = null, director = null, disposed = false, loading = false
  let chatBusy = false, asrBusy = false, voiceBusy = false, testing = false
  let chatDirty = false, voiceDirty = false, revision = 0
  let connected = false, detecting = false, picking = false, detected = false, startingTts = false
  const voiceFields = ['VoicePreset', 'VoiceEngine', 'VoiceEnabled', 'Voice', 'VoiceUrl', 'RefAudio', 'RefText', 'RefLang', 'SayLanguage', 'LipSync']
  const voiceLocked = () => voiceBusy || testing || detecting || picking || loading || startingTts
  const actionableError = (result, fallback) => typeof result?.error === 'string' && result.error.trim() ? result.error : fallback
  function clearVoiceAudio() {
    for (const name of ['VoiceAudio', 'DetectAudio']) { const audio = el(name); audio.pause(); audio.removeAttribute('src'); audio.hidden = true }
  }
  function voiceChanged() {
    voiceDirty = true; detected = false; clearVoiceAudio()
    el('VoiceChecks').hidden = true
    badge('Voice', '待保存', false)
    status('Voice', '语音配置有改动，请先保存，再检测或试听。')
    status('Detect', '有未保存的改动。请先点击“保存语音”，检测仅使用已保存配置。')
    render()
  }
  const has = name => typeof api?.[name] === 'function'
  const status = (name, text, error = false) => {
    el(name + 'Status').textContent = text
    el(name + 'Status').dataset.error = String(error)
  }
  const badge = (name, text, ready) => {
    el(name + 'Badge').textContent = text
    el(name + 'Badge').dataset.ready = String(ready === true)
  }
  const testMessages = {
    auth: '请检查密钥是否完整、是否属于该服务商（401/403）。',
    balance: '服务商提示余额不足，请补充额度（402）。',
    'not-found': '请检查 API 地址层级和模型名称（404）。',
    'bad-request': '请核对服务商支持的模型名称（400/422）。',
    rate: '请求频率或额度受限，请稍后重试（429）。',
    server: '服务商暂时出错，请稍后重试。',
    network: '请检查网络、代理和 API 地址。',
    timeout: '连接超时，请检查网络后重试。',
    format: '请确认该地址支持标准 chat/completions 格式。',
    'no-key': '请重新输入该服务商的密钥；更换地址会清除旧密钥。',
    address: '请使用 HTTPS 地址；本机服务可用 http://127.0.0.1。',
    model: '请填写服务商提供的模型名称。',
    vault: '请检查 Windows 系统加密，再重新输入密钥。',
  }

  function render() {
    const ready = Boolean(state)
    for (const name of ['BaseURL', 'Model']) el(name).disabled = !director || chatBusy || loading
    el('ApiKey').disabled = !director || director.encryptionAvailable !== true || chatBusy || loading
    el('Connect').disabled = !director || !has('directorConnect') || chatBusy || loading
    el('Connect').textContent = chatBusy ? '正在保存并连接…' : '保存并连接'
    el('Refresh').disabled = loading || chatBusy || asrBusy || voiceLocked()
    el('StartAsr').disabled = !ready || !has('quickStartAsr') || asrBusy || loading || state.asr?.ready === true || state.asr?.installed !== true
    el('StartAsr').textContent = asrBusy ? '正在启动…' : state?.asr?.ready === true ? '语音识别已就绪' : '启动语音识别'
    const systemVoice = el('VoiceEngine').value === 'system'
    for (const name of voiceFields) el(name).disabled = !ready || voiceLocked()
    el('Voice').disabled ||= !systemVoice
    for (const name of ['VoiceUrl', 'RefAudio', 'RefText', 'RefLang', 'SayLanguage']) el(name).disabled ||= systemVoice
    el('VoiceField').hidden = !systemVoice
    el('GptFields').hidden = systemVoice
    el('PickReference').disabled = !ready || !has('quickPickReference') || voiceLocked() || systemVoice
    el('PickReference').textContent = picking ? '选择中…' : '浏览…'
    el('SaveVoice').disabled = !ready || !has('quickSaveVoice') || voiceLocked()
    el('DetectVoice').disabled = !ready || !has('quickDetectVoice') || voiceLocked() || voiceDirty
    el('StartTts').hidden = systemVoice
    el('StartTts').disabled = !ready || !has('quickStartTts') || voiceLocked() || voiceDirty
    el('StartTts').textContent = startingTts ? '正在加载音色…' : '一键启动TTS'
    el('DetectVoice').textContent = detecting ? '正在检测…' : detected ? '重新检测' : '一键检测'
    el('TestVoice').disabled = !ready || !has('quickTestVoice') || voiceLocked() || voiceDirty || state.tts?.enabled !== true || state.tts?.ready !== true
    el('SaveVoice').textContent = voiceBusy ? '正在保存…' : '保存语音'
    el('TestVoice').textContent = testing ? '正在试听…' : '试听一句'
    el('VoiceHelp').textContent = el('VoiceEngine').value === 'system'
      ? '系统语音无需参考音频。首次使用可直接选择系统默认声音。'
      : '先启动本机 GPT-SoVITS，填写合成接口地址与参考音频；参考文字应与音频内容一致。'
    el('DetectVoice').title = voiceDirty ? '请先保存语音配置' : !has('quickDetectVoice') ? '检测接口待更新，请重启桌宠' : '检测并合成，不自动播放'
    el('PickReference').title = has('quickPickReference') ? '选择本机音频文件' : '文件选择接口待更新，请重启桌宠；也可手动填写路径'
    panel.setAttribute('aria-busy', String(loading || chatBusy || asrBusy || voiceLocked()))
  }

  function applyState(updateForms) {
    const asr = state.asr || {}, tts = state.tts || {}
    badge('Chat', chatDirty ? '待保存' : connected ? '已连接' : state.api?.configured === true ? '已配置 · 待测试' : '待配置', !chatDirty && connected)
    badge('Asr', asr.ready === true ? '已就绪' : asr.installed === true ? '待启动' : '待安装', asr.ready === true)
    badge('Voice', voiceDirty ? '待保存' : tts.enabled === true ? '已配置 · 待检测' : '未启用', false)
    if (updateForms && !chatDirty) {
      el('BaseURL').value = typeof state.api?.baseURL === 'string' ? state.api.baseURL : director?.config?.baseURL || ''
      el('Model').value = typeof state.api?.model === 'string' ? state.api.model : director?.config?.model || ''
    }
    if (updateForms && !voiceDirty) {
      el('VoicePreset').replaceChildren(new Option('自定义配置', 'custom'), ...(tts.presets || []).map(p => { const o = new Option(p.name + (p.installed ? '' : ' · 未安装'), p.id); o.disabled = !p.installed; return o }))
      el('VoicePreset').value = tts.preset || 'custom'
      el('VoiceEngine').value = tts.engine === 'gpt-sovits' ? 'gpt-sovits' : 'system'
      el('VoiceEnabled').checked = tts.enabled === true
      el('LipSync').checked = tts.lipSync !== false
      for (const [field, key] of [['VoiceUrl', 'url'], ['RefAudio', 'refAudio'], ['RefText', 'refText']]) el(field).value = typeof tts[key] === 'string' ? tts[key] : ''
      el('RefLang').value = tts.refLang || 'ja'
      el('SayLanguage').value = tts.sayLanguage || 'ja'
      const selected = typeof tts.voice === 'string' ? tts.voice : ''
      const options = [new Option('系统默认声音', '')]
      for (const voice of Array.isArray(tts.voices) ? tts.voices : []) {
        if (typeof voice?.id !== 'string' || !voice.id) continue
        options.push(new Option((voice.name || voice.id) + (voice.language ? ' · ' + voice.language : ''), voice.id))
      }
      el('Voice').replaceChildren(...options)
      if (selected && !options.some(option => option.value === selected)) { const missing = new Option(selected + ' · 当前不可用，请重新选择', selected); el('Voice').add(missing) }
      el('Voice').value = selected
    }
    el('ApiKey').placeholder = director?.hasKey === true ? '已加密保存；留空沿用' : '输入 API 密钥'
    el('KeyHelp').textContent = director?.encryptionAvailable === true
      ? '密钥由 Windows 系统加密保存在本机，不会回显；已保存时可留空沿用。'
      : '系统加密尚未就绪；请检查 Windows 加密状态后刷新，再保存新密钥。'
    status('Asr', asr.ready === true ? '本地识别服务已就绪，可在聊天窗使用麦克风。'
      : asr.installed === true ? '已安装。点击“启动语音识别”，稍后刷新确认状态。'
        : '尚未检测到本地识别环境。请先运行项目中的“启动语音识别.cmd”完成准备，再刷新。')
    status('Voice', voiceDirty ? '当前有未保存的语音配置；刷新会保留草稿。请先保存，再检测或试听。'
      : tts.enabled !== true ? '语音未启用。打开开关并保存后可检测。'
        : '已读取保存的语音配置；点击“一键检测”验证实际合成。')
    if (!has('quickDetectVoice')) status('Detect', '检测接口尚未就绪，请重启更新后的桌宠。', true)
    else if (!detected) status('Detect', voiceDirty ? '有未保存的改动，请先保存再检测。' : '尚未检测。检测会试合成，不自动播放。')
  }

  async function refresh(announce = true) {
    if (disposed || chatBusy || asrBusy || voiceLocked()) return
    if (!has('quickState')) {
      for (const name of ['Chat', 'Asr', 'Voice']) { badge(name, '接口待更新', false); status(name, '快速设置接口尚未就绪，请重启更新后的桌宠；也可使用高级设置。', true) }
      render(); return
    }
    const current = ++revision
    loading = true; render()
    try {
      const results = await Promise.allSettled([api.quickState(), has('directorState') ? api.directorState() : Promise.resolve(null)])
      if (disposed || current !== revision) return
      const quick = results[0].status === 'fulfilled' ? results[0].value : null
      const detail = results[1].status === 'fulfilled' ? results[1].value : null
      director = detail?.ok === true ? detail : null
      if (quick?.ok !== true) throw new Error('STATE_UNAVAILABLE')
      state = quick
      detected = false; el('VoiceChecks').hidden = true; clearVoiceAudio()
      applyState(true)
      if (announce) status('Chat', director ? (connected ? '连接测试已通过。' : state.api?.configured === true
        ? '已读取配置；保存并连接可检查实际连通性。' : '填写服务商提供的地址、模型和密钥，然后保存并连接。')
        : '聊天配置读取失败，请刷新；也可在导演 / API 高级设置检查。', !director)
    } catch (_) {
      state = null; director = null; connected = false
      for (const name of ['Chat', 'Asr', 'Voice']) { badge(name, '状态待确认', false); status(name, '状态读取未完成，请刷新重试；持续失败时重启桌宠。', true) }
    } finally { if (!disposed && current === revision) { loading = false; render() } }
  }

  el('ChatForm').addEventListener('submit', async event => {
    event.preventDefault()
    if (!director || chatBusy || loading || !has('directorConnect')) return
    const payload = { baseURL: el('BaseURL').value.trim(), model: el('Model').value.trim() }
    try {
      const url = new URL(payload.baseURL)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('URL')
    } catch (_) { status('Chat', '请填写不含密钥、查询参数的 HTTP(S) API 地址。', true); el('BaseURL').focus(); return }
    if (!payload.model) { status('Chat', '请填写模型名称。', true); el('Model').focus(); return }
    if (el('ApiKey').value.trim()) payload.apiKey = el('ApiKey').value.trim()
    if (!payload.apiKey && director.hasKey !== true) { status('Chat', '请输入该服务商的 API 密钥。', true); el('ApiKey').focus(); return }
    chatBusy = true; connected = false; badge('Chat', '正在测试', false); render()
    status('Chat', '正在保存，并发送一条短测试请求…')
    try {
      const result = await api.directorConnect(payload)
      if (disposed) return
      if (result?.ok !== true) { status('Chat', '保存未完成，请检查地址、模型和 Windows 加密状态后重试。', true); return }
      el('ApiKey').value = ''
      chatDirty = false
      director = result
      connected = result.test?.ok === true
      badge('Chat', connected ? '已连接' : '已保存 · 未连通', connected)
      status('Chat', connected ? '已连接，可以聊天了。密钥输入已清空。'
        : '已保存，但连接测试未通过。' + (testMessages[result.test?.code] || '请检查服务地址、模型、密钥后重试。'), !connected)
      window.dispatchEvent(new CustomEvent('director:config-updated'))
    } catch (_) { status('Chat', '保存或连接未完成，请检查网络与系统加密后重试。', true) }
    finally { payload.apiKey = ''; if (!disposed) { chatBusy = false; render() } }
  })

  el('StartAsr').addEventListener('click', async () => {
    if (el('StartAsr').disabled) return
    asrBusy = true; render(); status('Asr', '正在启动本地识别服务…')
    let success = false
    try { success = (await api.quickStartAsr())?.ok === true }
    catch (_) { /* Actionable local recovery below; never print raw IPC errors. */ }
    finally { asrBusy = false }
    await refresh(false)
    if (state?.asr?.ready !== true) status('Asr', success
      ? '启动请求已提交，服务尚在准备。请稍后点击“刷新状态”。'
      : '启动未完成。请运行“启动语音识别.cmd”查看环境或端口提示，再刷新重试。', !success)
    render()
  })

  el('VoiceForm').addEventListener('submit', async event => {
    event.preventDefault()
    if (el('SaveVoice').disabled) return
    voiceBusy = true; render(); status('Voice', '正在保存语音设置，不会自动讲话…')
    let result
    const payload = { preset: el('VoicePreset').value, engine: el('VoiceEngine').value, enabled: el('VoiceEnabled').checked, voice: el('Voice').value,
      url: el('VoiceUrl').value.trim(), refAudio: el('RefAudio').value.trim(), refText: el('RefText').value.trim(),
      refLang: el('RefLang').value, sayLanguage: el('SayLanguage').value, lipSync: el('LipSync').checked }
    try { result = await api.quickSaveVoice(payload) }
    catch (error) { result = { error: error?.message } }
    finally { voiceBusy = false }
    if (disposed) return
    if (result?.ok === true) {
      voiceDirty = false; detected = false; clearVoiceAudio(); el('VoiceChecks').hidden = true
      window.dispatchEvent(new CustomEvent('quick:voice-updated'))
      await refresh(false)
      if (state) status('Voice', '语音配置已保存。现在可一键检测；保存不会自动讲话。')
    } else status('Voice', '保存未完成：' + actionableError(result, '请检查语音方式、本地服务地址和参考音频路径后重试。'), true)
    render()
  })

  el('PickReference').addEventListener('click', async () => {
    if (el('PickReference').disabled) return
    picking = true; render()
    try {
      const result = await api.quickPickReference()
      if (disposed || result?.canceled) return
      if (result?.ok === true && typeof result.path === 'string' && result.path) { el('RefAudio').value = result.path; voiceChanged() }
      else status('Voice', actionableError(result, '文件选择未完成，请重试或手动填写本机音频路径。'), true)
    } catch (_) { status('Voice', '文件选择未完成，请重试或手动填写本机音频路径。', true) }
    finally { picking = false; if (!disposed) render() }
  })

  el('StartTts').addEventListener('click', async () => {
    if (el('StartTts').disabled) return
    startingTts = true; render(); status('Voice', '正在启动本机GPT-SoVITS并加载音色，首次可能需要一两分钟…')
    let result
    try { result = await api.quickStartTts() } catch { result = {ok:false,error:'启动请求未完成，请重试'} }
    finally { startingTts = false }
    await refresh(false)
    if (result?.ok) { status('Voice', 'TTS服务已启动，正在检测合成接口…'); el('DetectVoice').click() }
    else status('Voice', result?.error || 'TTS启动未完成，请查看 _tts/service.log', true)
    render()
  })

  el('DetectVoice').addEventListener('click', async () => {
    if (el('DetectVoice').disabled) return
    detecting = true; detected = false; clearVoiceAudio(); el('VoiceChecks').hidden = true; render()
    status('Detect', '正在检查已保存配置并试合成，请稍候；不会自动播放。')
    try {
      const result = await api.quickDetectVoice()
      if (disposed) return
      const checks = Array.isArray(result?.checks) ? result.checks : []
      const rows = checks.map(check => {
        const row = document.createElement('li')
        const kind = ['pass', 'fail', 'skip'].includes(check.status) ? check.status : 'fail'
        row.dataset.status = kind
        const icon = document.createElement('span'); icon.className = 'quick-check-icon'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = { pass: '✓', fail: '✕', skip: '–' }[kind]
        const copy = document.createElement('div'), title = document.createElement('strong'), detail = document.createElement('span')
        title.textContent = (check.label || check.id || '检测项') + ' · ' + { pass: '通过', fail: '失败', skip: '跳过' }[kind]
        detail.textContent = typeof check.message === 'string' ? check.message : ''
        copy.append(title, detail); row.append(icon, copy); return row
      })
      el('VoiceChecks').replaceChildren(...rows); el('VoiceChecks').hidden = !rows.length
      const synthesized = result?.ok === true && checks.some(check => check.id === 'synthesis' && check.status === 'pass') && !checks.some(check => check.status === 'fail')
      detected = true
      badge('Voice', synthesized ? '合成通过' : '检测未通过', synthesized)
      status('Detect', synthesized ? '检测通过，实际试合成成功。未自动播放，可点击下方播放器确认声音。'
        : '检测未通过：' + actionableError(result, '按失败项提示修复；修改后先保存，再点击“重新检测”。服务可达不代表合成成功。'), !synthesized)
      if (synthesized && typeof result.audio === 'string' && result.audio && /^[A-Za-z0-9+/=\r\n]+$/.test(result.audio)) {
        el('DetectAudio').src = 'data:audio/wav;base64,' + result.audio; el('DetectAudio').hidden = false
      }
    } catch (_) { detected = true; badge('Voice', '检测未完成', false); status('Detect', '检测未完成，请点击“重新检测”；若持续失败，请重启桌宠并检查本机语音服务。', true) }
    finally { detecting = false; if (!disposed) render() }
  })

  el('TestVoice').addEventListener('click', async () => {
    if (el('TestVoice').disabled) return
    testing = true; render(); status('Voice', '正在合成试听语音…')
    const audio = el('VoiceAudio')
    audio.pause(); audio.removeAttribute('src'); audio.hidden = true
    try {
      const result = await api.quickTestVoice()
      if (disposed) return
      if (result?.ok !== true || typeof result.audio !== 'string' || !result.audio || !/^[A-Za-z0-9+/=\r\n]+$/.test(result.audio)) throw new Error('AUDIO')
      audio.src = 'data:audio/wav;base64,' + result.audio
      audio.hidden = false
      await audio.play()
      status('Voice', '正在播放试听，可用播放器暂停或重播。')
    } catch (_) { status('Voice', audio.hidden ? '试听未完成，请检查语音引擎是否就绪，再重试。' : '语音已生成，请点击播放器播放；若无声音，请检查系统音量。', true) }
    finally { testing = false; if (!disposed) render() }
  })

  for (const name of ['BaseURL', 'Model', 'ApiKey']) el(name).addEventListener('input', () => {
    chatDirty = true; connected = false; badge('Chat', '待保存', false)
    status('Chat', '配置有改动，保存并连接后生效。')
  })
  el('VoicePreset').addEventListener('change', () => {
    const p = state?.tts?.presets?.find(p => p.id === el('VoicePreset').value)
    if (!p) return
    for (const [id,key] of [['VoiceUrl','url'],['RefAudio','refAudio'],['RefText','refText'],['RefLang','refLang'],['SayLanguage','sayLanguage']]) el(id).value=p[key] || ''
    el('VoiceEnabled').checked=true
    status('Voice', '已选择' + p.name + '；请保存，再一键启动TTS。')
  })
  for (const name of voiceFields) el(name).addEventListener(['VoiceUrl', 'RefAudio', 'RefText'].includes(name) ? 'input' : 'change', voiceChanged)
  el('Refresh').addEventListener('click', () => void refresh())
  el('Advanced').addEventListener('click', () => document.getElementById('settingsTabDirector')?.click())
  window.addEventListener('settings:tab-change', event => { if (event.detail?.name === 'quick') void refresh() })
  window.addEventListener('director:config-updated', () => {
    if (chatBusy) return
    connected = false
    if (document.body.dataset.settingsTab === 'quick') void refresh()
  })
  window.addEventListener('beforeunload', () => { disposed = true; ++revision; el('ApiKey').value = ''; clearVoiceAudio() }, { once: true })
  render()
  void refresh()
})()
