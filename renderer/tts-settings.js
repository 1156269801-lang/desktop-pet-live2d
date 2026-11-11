'use strict'

/** 导演/API 页的 TTS 子面板：读 config.tts，保存走 settings:command('ttsConfig')。 */
(function () {
  const api = window.settings
  if (!api) return
  const el = (id) => document.getElementById(id)

  function fill(tts) {
    if (!tts) return
    if (el('ttsEnabled')) el('ttsEnabled').checked = tts.enabled !== false
    if (el('ttsUrl')) el('ttsUrl').value = tts.url || ''
    if (el('ttsRefAudio')) el('ttsRefAudio').value = tts.refAudio || ''
    if (el('ttsRefLang')) el('ttsRefLang').value = tts.refLang || 'ja'
    if (el('ttsSayLang')) el('ttsSayLang').value = tts.sayLanguage || 'ja'
  }

  async function load() {
    try {
      const state = await api.state()
      fill(state && state.tts)
    } catch (error) {
      /* state 读不到时保持默认 */
    }
  }

  function save() {
    const status = el('ttsStatus')
    const payload = {
      enabled: el('ttsEnabled') ? el('ttsEnabled').checked : true,
      url: ((el('ttsUrl') && el('ttsUrl').value) || '').trim(),
      refAudio: ((el('ttsRefAudio') && el('ttsRefAudio').value) || '').trim(),
      refLang: (el('ttsRefLang') && el('ttsRefLang').value) || 'ja',
      sayLanguage: (el('ttsSayLang') && el('ttsSayLang').value) || 'ja',
    }
    api.command('ttsConfig', payload)
    if (status) status.textContent = '已保存；下次说话立即使用新设置'
  }

  document.getElementById('ttsSave')?.addEventListener('click', save)
  load()
})()
