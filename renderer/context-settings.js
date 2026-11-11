'use strict'
;(() => {
  const api = window.settings, $ = id => document.getElementById(id)
  if (!$('sceneDetails') || !api?.sceneCollect) return
  let scene = null, share = null, legacy = null, collecting = false, sending = false, sceneGeneration = 0, disposed = false, timer = null
  const status = (id, text, error = false) => { $(id).textContent = text; $(id).dataset.error = String(error) }
  const message = (result, fallback) => result?.ok ? fallback : (typeof result?.error === 'string' ? result.error : '操作未完成，请刷新重试。')
  function clearSceneView() {
    scene = null; $('scenePreview').hidden = true; $('sceneImage').removeAttribute('src'); $('sceneImage').hidden = true
    $('sceneMeta').textContent = ''; $('sceneConsent').checked = false; $('sceneSend').disabled = true
  }
  async function clearScene() {
    ++sceneGeneration; if (timer) clearTimeout(timer); timer = null; collecting = false; clearSceneView(); $('sceneCollect').disabled = false
    try { await api.sceneClear(); status('sceneStatus', '本次预览已清除；已经发出的内容不能撤回。') } catch { status('sceneStatus', '未能确认主进程清除，请重试。', true) }
  }
  function sceneReady() { $('sceneSend').disabled = sending || !scene?.destination?.configured || !scene || Date.now() >= Date.parse(scene.expiresAt) || !$('sceneConsent').checked || !$('sceneQuestion').value.trim() }
  $('sceneCollect').addEventListener('click', () => {
    if (collecting || sending) return
    const flags = { title: $('sceneTitle').checked, screenshot: $('sceneScreenshot').checked }
    if (!flags.title && !flags.screenshot) return status('sceneStatus', '请明确勾选本次允许采集的内容。', true)
    const generation = ++sceneGeneration; clearSceneView(); collecting = true; $('sceneCollect').disabled = true
    status('sceneStatus', '3 秒后采集；如读取标题，请自行切换到目标窗口。此时不发送模型。')
    timer = setTimeout(async () => {
      timer = null
      try {
        const result = await api.sceneCollect(flags)
        if (disposed || generation !== sceneGeneration) return
        if (!result?.ok) throw Error('CAPTURE_FAILED')
        scene = result; $('scenePreview').hidden = false
        $('sceneMeta').textContent = `采集：${new Date(result.capturedAt).toLocaleTimeString()}\n失效：${new Date(result.expiresAt).toLocaleTimeString()}\n目的地：${result.destination.label}\n` + (result.front ? `标题：${result.front.title}\n进程：${result.front.process}` : '未读取窗口标题')
        if (result.imageDataUrl) { $('sceneImage').src = result.imageDataUrl; $('sceneImage').hidden = false }
        status('sceneStatus', result.warning); sceneReady()
      } catch { if (generation === sceneGeneration) status('sceneStatus', '采集未完成；未发送。请确认目标不是桌宠自身，然后重试。', true) }
      finally { if (generation === sceneGeneration) { collecting = false; $('sceneCollect').disabled = false } }
    }, 3000)
  })
  $('sceneClear').addEventListener('click', () => { void clearScene() })
  for (const id of ['sceneConsent', 'sceneQuestion']) $(id).addEventListener('input', sceneReady)
  for (const id of ['sceneTitle', 'sceneScreenshot']) $(id).addEventListener('change', () => { void clearScene() })
  $('sceneSend').addEventListener('click', async () => {
    if ($('sceneSend').disabled || !scene) return
    const body = { text: $('sceneQuestion').value.trim(), previewId: scene.previewId, expectedDestinationId: scene.destination.id, confirm: 'SEND_THIS_SCENE' }
    sending = true; $('sceneCollect').disabled = true; clearSceneView(); status('sceneStatus', '正在发送已确认的本次感知；预览已从页面清除…')
    try { const result = await api.sceneSend(body); status('sceneStatus', message(result, '本次感知调用已完成；没有保存截图或标题。'), !result?.ok) }
    catch { status('sceneStatus', '本次调用未完成；请检查目的地授权或重新采集。', true) }
    finally { sending = false; $('sceneCollect').disabled = false; sceneReady() }
  })
  function clearShareDraft() { share = null; $('shareConfirm').hidden = true; $('sharePreviewText').hidden = true; $('sharePreviewText').textContent = '' }
  async function refreshShare() {
    try { const state = await api.shareState(); status('shareStatus', state.enabled ? `正在共享所选风格，${new Date(state.expiresAt).toLocaleTimeString()} 到期。撤回不能收回已外发内容。` : '共享关闭；本机控制 API 不返回人设。') }
    catch { status('shareStatus', '无法读取共享状态。', true) }
  }
  $('shareFields').addEventListener('change', clearShareDraft)
  $('sharePreviewButton').addEventListener('click', async () => {
    clearShareDraft()
    const fields = [...$('shareFields').querySelectorAll('input:checked')].map(input => input.value)
    try { const result = await api.sharePreview({ fields }); if (!result.ok) return status('shareStatus', message(result), true)
      share = result; $('sharePreviewText').textContent = JSON.stringify(result.persona, null, 2); $('sharePreviewText').hidden = false; $('shareConfirm').hidden = false; status('shareStatus', result.warning)
    } catch { status('shareStatus', '预览失败；没有启用共享。', true) }
  })
  $('shareConfirm').addEventListener('click', async () => {
    if (!share) return; const previewId = share.previewId; clearShareDraft()
    try { const result = await api.shareConfirm({ previewId, confirm: 'SHARE_SELECTED_PERSONA' }); if (!result.ok) return status('shareStatus', message(result), true); await refreshShare() }
    catch { status('shareStatus', '未能确认共享状态，请刷新。', true) }
  })
  $('shareRevoke').addEventListener('click', async () => { clearShareDraft(); try { await api.shareRevoke(); await refreshShare() } catch { status('shareStatus', '撤回未确认，请重试。', true) } })
  async function refreshLegacy() {
    $('legacyConfirmation').hidden = true; $('legacyPrepare').disabled = true
    try { legacy = await api.legacyState(); if (!legacy.ok) throw Error('LEGACY_FAILED')
      status('legacyStatus', legacy.hasLegacyData ? '检测到此目录中的旧字段。检查清单后可单独确认清除。' : '此目录未发现需清理的旧字段。'); $('legacyPrepare').disabled = !legacy.hasLegacyData
    } catch { legacy = null; status('legacyStatus', '旧字段状态读取失败；没有执行清理。', true) }
  }
  $('legacyRefresh').addEventListener('click', () => { void refreshLegacy() })
  $('legacyPrepare').addEventListener('click', () => { if (!legacy?.hasLegacyData) return; $('legacyPreview').textContent = JSON.stringify({ state: legacy.state, config: legacy.config }, null, 2); $('legacyConfirmation').hidden = false })
  $('legacyCancel').addEventListener('click', () => { $('legacyConfirmation').hidden = true })
  $('legacyConfirm').addEventListener('click', async () => {
    if (!legacy) return; const expectedRevision = legacy.revision; $('legacyConfirmation').hidden = true; $('legacyPrepare').disabled = true
    try { const result = await api.legacyDelete({ expectedRevision, confirm: 'DELETE_LEGACY_FIELDS' }); await refreshLegacy()
      const completed = (Array.isArray(result.completed) ? result.completed : []).filter(name => ['state', 'config'].includes(name)).map(name => name === 'state' ? '状态文件旧聊天/记忆' : '配置文件旧人设/凭据')
      const receipt = completed.length ? ' 已提交：' + completed.join('、') + '。' : ''
      status('legacyStatus', (result.ok ? '指定旧字段已清理。当前人设和记忆保持不变。' : message(result, '') + ' 请重新检查；两个文件可能部分完成。') + receipt, !result.ok)
    }
    catch { status('legacyStatus', '清理结果未确认，请重新检查旧字段状态。', true) }
  })
  let ticks = 0
  const expiry = setInterval(() => { if (scene && Date.now() >= Date.parse(scene.expiresAt)) { void clearScene(); status('sceneStatus', '本次感知已过期；如需发送请重新采集。') }
    if (++ticks % 5 === 0 && $('shareDetails').open && !share && document.body.dataset.settingsTab === 'director') void refreshShare()
  }, 1000)
  document.addEventListener('persona:updated', () => { void clearScene(); clearShareDraft(); void refreshShare() })
  window.addEventListener('director:config-updated', () => { void clearScene(); clearShareDraft(); void refreshShare() })
  window.addEventListener('settings:tab-change', event => { if (event.detail?.name === 'director') { void refreshShare(); void refreshLegacy() } })
  window.addEventListener('pagehide', () => { disposed = true; ++sceneGeneration; clearInterval(expiry); if (timer) clearTimeout(timer); clearSceneView(); void api.sceneClear() })
  void refreshShare(); void refreshLegacy()
})()
