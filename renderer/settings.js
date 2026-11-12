'use strict'

/**
 * 独立设置窗口的脚本。
 * 它自己不能操作 Live2D 模型（模型在主窗口里），所以：
 *   - 读状态：settings.state() / listCharacters()
 *   - 改设置：settings.command(cmd, value) → 主进程转发给主窗口执行
 */

const api = window.settings
// Only user navigation moves DOM focus; opening/updating settings never focuses a window.
const settingsTabList = document.querySelector('.settings-tabs')
const getSettingsTabs = () => [...settingsTabList.querySelectorAll('[role="tab"][data-settings-tab]')]
const settingsScroll = document.getElementById('settingsScroll')
const settingsScrollPositions = new Map()
let activeSettingsTab = 'appearance'
function selectSettingsTab(name, moveFocus = false) {
  const settingsTabs = getSettingsTabs()
  const selected = settingsTabs.find(tab => tab.dataset.settingsTab === name)
  if (!selected) return false
  if (activeSettingsTab !== name) settingsScrollPositions.set(activeSettingsTab, settingsScroll.scrollTop)
  for (const tab of settingsTabs) {
    const active = tab === selected
    tab.setAttribute('aria-selected', String(active))
    tab.tabIndex = active ? 0 : -1
    const panel = document.getElementById(tab.getAttribute('aria-controls'))
    panel.hidden = !active
    panel.inert = !active
  }
  activeSettingsTab = name
  document.body.dataset.settingsTab = name
  settingsScroll.scrollTop = settingsScrollPositions.get(name) || 0
  if (moveFocus) selected.focus({ preventScroll: true })
  window.dispatchEvent(new CustomEvent('settings:tab-change', { detail: { name } }))
  return true
}

// 导演页二级导航：人设 / 记忆 / 自主 / API，避免四个大块挤在一页
function selectDirectorSubtab(name) {
  const tabs = document.querySelectorAll('#directorSubTabs [data-subtab]')
  if (!tabs.length) return
  tabs.forEach(btn => btn.classList.toggle('active', btn.dataset.subtab === name))
  const panel = document.getElementById('settingsPanelDirector')
  if (!panel) return
  panel.querySelectorAll('[data-subpanel]').forEach(el => {
    el.hidden = el.dataset.subpanel !== name
  })
}
const directorSubTabs = document.getElementById('directorSubTabs')
if (directorSubTabs) {
  directorSubTabs.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-subtab]')
    if (btn) selectDirectorSubtab(btn.dataset.subtab)
  })
  selectDirectorSubtab('persona')
}
settingsTabList.addEventListener('click', event => {
  const tab = event.target.closest('[data-settings-tab]')
  if (tab && settingsTabList.contains(tab)) selectSettingsTab(tab.dataset.settingsTab)
})
settingsTabList.addEventListener('keydown', event => {
    const settingsTabs = getSettingsTabs()
    const tab = event.target.closest('[data-settings-tab]')
    const index = settingsTabs.indexOf(tab)
    if (index < 0) return
    let next
    if (event.key === 'ArrowRight') next = (index + 1) % settingsTabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + settingsTabs.length) % settingsTabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = settingsTabs.length - 1
    else return
    event.preventDefault()
    selectSettingsTab(settingsTabs[next].dataset.settingsTab, true)
})
selectSettingsTab('appearance')
document.querySelectorAll('.background-details').forEach(details => {
  const summary = details.querySelector('summary')
  summary.setAttribute('aria-expanded', String(details.open))
  details.addEventListener('toggle', () => summary.setAttribute('aria-expanded', String(details.open)))
})

let appearanceState = window.PetAppearance.normalize()
const appearanceStatus = document.getElementById('appearanceStatus')
function appearanceMessage(message,error=false){
  if(document.body.dataset.settingsTab==='director'){
    appearanceStatus.textContent='导演 / API 配置需手动保存；保存不会发起远程调用。'
    appearanceStatus.dataset.error='false'
    return
  }
  appearanceStatus.textContent=message;appearanceStatus.dataset.error=String(error)
}
function renderAppearance(value){
  appearanceState=window.PetAppearance.normalize(value)
  const s=appearanceState
  for(const [id,key,unit] of [['dialogueFontSize','fontSize',' px'],['dialogueGap','gap',' px'],['sceneOpacity','sceneOpacity','%'],['bubbleTint','bubbleTint','%']]){
    document.getElementById(id).value=s[key]
    document.getElementById(id==='dialogueFontSize'?'dialogueFontValue':id+'Value').textContent=s[key]+unit
  }
  for(const key of ['sceneMode','sceneColor','sceneFit','bubbleColor'])document.getElementById(key).value=s[key]
  document.getElementById('chatDockToggle').checked=s.chatDock
  for(const target of ['scene','bubble']){
    const el=document.getElementById(target+'BackgroundName');el.textContent=s[target+'Image']?(s[target+'Name']||'已保存的背景图片'):'未选择图片';el.title=el.textContent
  }
  document.getElementById('sceneBackgroundSummary').textContent=s.sceneMode==='transparent'?'透明桌宠':s.sceneMode==='image'?(s.sceneImage?'自定义图片':'尚未选择图片'):'纯色背景'
  document.getElementById('bubbleBackgroundSummary').textContent=s.bubbleImage?'自定义图片':'纯色底色'
  const preview=document.getElementById('appearancePreview'),dialogue=document.getElementById('dialoguePreview')
  preview.style.setProperty('--scene-preview-color',s.sceneMode==='transparent'?'transparent':s.sceneColor)
  preview.style.setProperty('--scene-preview-image',s.sceneMode==='image'&&s.sceneImage?`url("${s.sceneImage}")`:'none')
  preview.style.setProperty('--scene-preview-fit',s.sceneFit)
  dialogue.style.fontSize=s.fontSize+'px';dialogue.style.backgroundColor=s.bubbleColor
  dialogue.style.backgroundImage=s.bubbleImage?`linear-gradient(rgba(255,255,255,${s.bubbleTint/100}),rgba(255,255,255,${s.bubbleTint/100})),url("${s.bubbleImage}")`:'none'
  dialogue.style.backgroundSize='cover'
  dialogue.style.color=window.PetAppearance.ink(s.bubbleColor,Boolean(s.bubbleImage))
  preview.style.setProperty('--scene-preview-opacity',s.sceneOpacity/100)
}
function changeAppearance(patch){renderAppearance({...appearanceState,...patch});send('appearance',patch)}
for(const [id,key] of [['dialogueFontSize','fontSize'],['dialogueGap','gap'],['sceneOpacity','sceneOpacity'],['bubbleTint','bubbleTint']]){
  document.getElementById(id).addEventListener('input',event=>changeAppearance({[key]:Number(event.target.value)}))
}
for(const key of ['sceneMode','sceneColor','sceneFit','bubbleColor'])document.getElementById(key).addEventListener('change',event=>changeAppearance({[key]:event.target.value}))
document.getElementById('chatDockToggle').addEventListener('change',event=>changeAppearance({chatDock:event.target.checked}))
for(const target of ['scene','bubble']){
  const name=target==='scene'?'Scene':'Bubble'
  const button=document.getElementById('pick'+name+'Background')
  button.addEventListener('click',async()=>{
    button.disabled=true;appearanceMessage('选择本地图片…')
    try{
      const result=await api.pickBackground(target)
      if(result.cancelled){appearanceMessage('已取消，原背景未改');return}
      if(!result.ok)throw new Error(result.error||'导入失败')
      const patch={[target+'Image']:result.url,[target+'Name']:result.name}
      if(target==='scene')patch.sceneMode='image'
      changeAppearance(patch);appearanceMessage('背景已复制到本机测试目录')
    }catch(error){appearanceMessage(error.message||String(error),true)}finally{button.disabled=false}
  })
  document.getElementById('clear'+name+'Background').addEventListener('click',()=>{
    const patch={[target+'Image']:'',[target+'Name']:''};if(target==='scene')patch.sceneMode='color';changeAppearance(patch)
  })
}
document.getElementById('previewDialogue').addEventListener('click',()=>send('previewDialogue'))
document.getElementById('resetAppearance').addEventListener('click',()=>changeAppearance({...window.PetAppearance.DEFAULTS}))
renderAppearance(appearanceState)

const characterGrid = document.getElementById('characterGrid')
const dropZone = document.getElementById('dropZone')
const statusEl = document.getElementById('status')
const watchToggle = document.getElementById('watchToggle')
const gazeToggle = document.getElementById('gazeToggle')
const gazeRange = document.getElementById('gazeRange')
const gazeValue = document.getElementById('gazeValue')
const breathRange = document.getElementById('breathRange')
const breathValue = document.getElementById('breathValue')
const snapRange = document.getElementById('snapRange')
const snapValue = document.getElementById('snapValue')
const clickThroughToggle = document.getElementById('clickThroughToggle')
const winWidthRange = document.getElementById('winWidthRange')
const winWidthValue = document.getElementById('winWidthValue')
const winHeightRange = document.getElementById('winHeightRange')
const winHeightValue = document.getElementById('winHeightValue')

function setStatus(text, kind) {
  if (!statusEl) return
  statusEl.textContent = text || ''
  statusEl.className = 'dropzone-status' + (kind ? ' ' + kind : '')
  appearanceMessage(text || '更改即时生效', kind === 'error')
}

function send(cmd, value) {
  if (api && typeof api.command === 'function') api.command(cmd, value)
}

const ttsSayLanguageSelect = document.getElementById('ttsSayLanguage')
if (ttsSayLanguageSelect) {
  ttsSayLanguageSelect.addEventListener('change', () => send('ttsSayLanguage', ttsSayLanguageSelect.value))
}

// ------------------------------------------------------------------ 角色列表

async function refreshCharacters() {
  if (!characterGrid || !api) return
  characterGrid.setAttribute('aria-busy', 'true')
  let result
  try {
    result = await api.listCharacters()
    if (!result || !result.ok) throw new Error((result && result.error) || '请稍后重新打开设置')
  } catch (error) {
    setStatus('角色列表读取失败：' + error.message, 'error')
    characterGrid.setAttribute('aria-busy', 'false')
    return
  }
  characterGrid.innerHTML = ''
  // 标题栏：当前角色的头像与名字
  const activeItem = (result.items || []).find((item) => item.id === result.active)
  const avatar = document.getElementById('settingsAvatar')
  const avatarImage = document.getElementById('settingsAvatarImage')
  const characterName = document.getElementById('settingsCharacterName')
  if (avatar && avatarImage) {
    avatar.hidden = !(activeItem && activeItem.preview)
    if (activeItem && activeItem.preview) avatarImage.src = activeItem.preview
  }
  if (characterName) characterName.textContent = activeItem ? activeItem.name || activeItem.id : ''
  if (!(result.items || []).length) {
    const empty = document.createElement('p')
    empty.className = 'character-empty'
    empty.textContent = '还没有可用角色，请在下方导入 Live2D ZIP 模型包。'
    characterGrid.appendChild(empty)
  }
  for (const item of result.items || []) {
    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'character-card' + (item.id === result.active ? ' active' : '')
    card.title = item.name || item.id
    card.setAttribute('aria-pressed', String(item.id === result.active))

    if (item.preview) {
      const img = document.createElement('img')
      img.className = 'character-thumb'
      img.src = item.preview
      img.alt = ''
      card.appendChild(img)
    } else {
      const ph = document.createElement('div')
      ph.className = 'character-thumb'
      card.appendChild(ph)
    }

    const name = document.createElement('div')
    name.className = 'character-name'
    name.textContent = item.name || item.id
    card.appendChild(name)

    if (item.id === result.active) {
      const badge = document.createElement('span')
      badge.className = 'character-badge'
      badge.textContent = '使用中'
      card.appendChild(badge)
    }

    card.addEventListener('click', async () => {
      if (card.classList.contains('active')) return
      setStatus('正在切换：' + (item.name || item.id) + ' …')
      card.disabled = true
      try {
        const switched = await api.switchCharacter(item.id)
        if (!switched || !switched.ok) throw new Error((switched && switched.error) || '未知')
        setStatus('已切换到：' + switched.character.name, 'ok')
        await refreshCharacters()
      } catch (error) {
        setStatus('切换失败：' + error.message, 'error')
      } finally {
        card.disabled = false
      }
    })
    characterGrid.appendChild(card)
  }
  characterGrid.setAttribute('aria-busy', 'false')
}

// -------------------------------------------------------------------- 导入

let characterImportBusy = false
const chooseCharacterFile = document.getElementById('chooseCharacterFile')
const characterZipInput = document.getElementById('characterZipInput')
chooseCharacterFile.addEventListener('click', () => characterZipInput.click())
characterZipInput.addEventListener('change', () => {
  const file = characterZipInput.files && characterZipInput.files[0]
  void importFile(file)
  characterZipInput.value = ''
})

async function importFile(file) {
  if (!file || characterImportBusy) return
  if (!/\.zip$/i.test(file.name || '')) {
    setStatus('只能导入 .zip（收到：' + (file.name || '未知') + '）', 'error')
    return
  }
  const filePath = api.pathForFile(file)
  if (!filePath) {
    setStatus('拿不到文件路径，请把 zip 放到本地磁盘再拖', 'error')
    return
  }
  setStatus('正在解压：' + file.name + ' …')
  characterImportBusy = true
  chooseCharacterFile.disabled = true
  dropZone.setAttribute('aria-busy', 'true')
  try {
    const result = await api.importCharacter(filePath)
    if (!result || !result.ok) throw new Error((result && result.error) || '未知')
    setStatus('导入成功：' + result.character.name + '（' + (result.files || 0) + ' 个文件）', 'ok')
    await refreshCharacters()
  } catch (error) {
    setStatus('导入失败：' + error.message, 'error')
  } finally {
    characterImportBusy = false
    chooseCharacterFile.disabled = false
    dropZone.setAttribute('aria-busy', 'false')
  }
}

if (dropZone) {
  for (const type of ['dragenter', 'dragover']) {
    dropZone.addEventListener(type, (event) => {
      event.preventDefault()
      event.stopPropagation()
      dropZone.classList.add('active')
    })
  }
  for (const type of ['dragleave', 'dragend']) {
    dropZone.addEventListener(type, () => dropZone.classList.remove('active'))
  }
  dropZone.addEventListener('drop', (event) => {
    event.preventDefault()
    event.stopPropagation()
    dropZone.classList.remove('active')
    importFile(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0])
  })
}
for (const type of ['dragover', 'drop']) {
  window.addEventListener(type, (event) => {
    event.preventDefault()
    event.stopPropagation()
  })
}

// -------------------------------------------------------------------- 控件

function bindToggle(el, cmd) {
  if (!el) return
  el.addEventListener('change', () => send(cmd, el.checked))
}

function bindRange(el, valueEl, cmd, format) {
  if (!el) return
  const sync = () => {
    if (valueEl) valueEl.textContent = format(Number(el.value))
  }
  sync()
  el.addEventListener('input', sync)
  el.addEventListener('change', () => send(cmd, Number(el.value)))
}

bindToggle(watchToggle, 'watch')
const directorToggle = document.getElementById('directorToggle')
bindToggle(gazeToggle, 'gazeEnabled')
bindToggle(directorToggle, 'idleDirector')

// C4：开机自启（状态从主进程读，切换直接写注册表）
const autostartToggle = document.getElementById('autostartToggle')
if (autostartToggle && window.settings && typeof window.settings.autostart === 'function') {
  window.settings.autostart().then((res) => {
    if (res && res.ok !== false) autostartToggle.checked = Boolean(res.enabled)
  })
  autostartToggle.addEventListener('change', async () => {
    const res = await window.settings.autostart(autostartToggle.checked)
    if (res && res.ok === false) {
      autostartToggle.checked = !autostartToggle.checked
      setStatus('开机自启设置失败：' + (res.error || '未知'), 'error')
    } else {
      setStatus(res && res.enabled ? '已开启开机自启' : '已关闭开机自启', 'ok')
    }
  })
}
bindToggle(clickThroughToggle, 'clickThrough')

bindRange(gazeRange, gazeValue, 'gazeStrength', (v) => Math.round(v) + '%')
bindRange(document.getElementById('gazeBodyRange'), document.getElementById('gazeBodyValue'), 'gazeBody', (v) => Math.round(v) + '%')
bindRange(document.getElementById('gazeSpeedRange'), document.getElementById('gazeSpeedValue'), 'gazeSpeed', (v) => Math.round(v) + '%')
bindRange(breathRange, breathValue, 'breathFactor', (v) => Math.round(v) + '%')
const livelinessRange = document.getElementById('livelinessRange')
const livelinessValue = document.getElementById('livelinessValue')
bindRange(livelinessRange, livelinessValue, 'liveliness', (v) => (v ? Math.round(v) + '%' : '关闭'))

const actingScaleRange = document.getElementById('actingScaleRange')
const actingScaleValue = document.getElementById('actingScaleValue')
bindRange(actingScaleRange, actingScaleValue, 'actingScale', (v) => (v ? Math.round(v) + '%' : '关闭'))

// 表演试演：手势与情绪的列表直接取自 acting.js，和模型能用的是同一份
function fillPerformChips(id, items, cmd) {
  const box = document.getElementById(id)
  if (!box) return
  for (const item of items) {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'perform-chip'
    chip.textContent = item.label
    chip.addEventListener('click', () => send(cmd, item.id))
    box.appendChild(chip)
  }
}
if (window.PetActing) {
  fillPerformChips('performChips', window.PetActing.gestures(), 'perform')
  fillPerformChips('moodChips', window.PetActing.moods(), 'mood')
}
bindRange(snapRange, snapValue, 'snapDistance', (v) => (v ? Math.round(v) + 'px' : '关闭'))

if (winWidthRange) {
  winWidthRange.addEventListener('input', () => {
    if (winWidthValue) winWidthValue.textContent = winWidthRange.value
  })
  winWidthRange.addEventListener('change', () => {
    send('windowSize', { width: Number(winWidthRange.value), height: Number(winHeightRange.value) })
  })
}
if (winHeightRange) {
  winHeightRange.addEventListener('input', () => {
    if (winHeightValue) winHeightValue.textContent = winHeightRange.value
  })
  winHeightRange.addEventListener('change', () => {
    send('windowSize', { width: Number(winWidthRange.value), height: Number(winHeightRange.value) })
  })
}

document.getElementById('btnSaveDefault').addEventListener('click', () => send('saveDefaultScale'))
document.getElementById('btnResetDefault').addEventListener('click', () => send('resetDefaultScale'))
document.getElementById('btnResetModelPos').addEventListener('click', () => send('resetModelPos'))
document.getElementById('btnCollapse').addEventListener('click', () => send('collapse'))
const quitButton = document.getElementById('btnQuit')
const quitConfirmation = document.getElementById('quitConfirmation')
const cancelQuitButton = document.getElementById('btnCancelQuit')
const confirmQuitButton = document.getElementById('btnConfirmQuit')
function cancelQuit(restoreFocus = false) {
  quitConfirmation.hidden = true
  quitButton.setAttribute('aria-expanded', 'false')
  if (restoreFocus) quitButton.focus({ preventScroll: true })
}
quitButton.addEventListener('click', () => {
  if (!quitConfirmation.hidden) { cancelQuit(true); return }
  quitConfirmation.hidden = false
  quitButton.setAttribute('aria-expanded', 'true')
  cancelQuitButton.focus({ preventScroll: true })
})
cancelQuitButton.addEventListener('click', () => cancelQuit(true))
confirmQuitButton.addEventListener('click', () => {
  confirmQuitButton.disabled = true
  appearanceMessage('正在退出桌宠…')
  send('quit')
})
document.getElementById('btnClose').addEventListener('click', () => api.close())

// 建议/键盘
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  event.preventDefault()
  if (!quitConfirmation.hidden) cancelQuit(true)
  else api.close()
})

// -------------------------------------------------------------------- 初始化

function renderWindowState(state) {
  if (!state?.window) return
  for (const [axis, input, output] of [['width', winWidthRange, winWidthValue], ['height', winHeightRange, winHeightValue]]) {
    if (!input || !Number.isFinite(state.window[axis])) continue
    const limits = state.windowLimits?.[axis]
    if (limits) { input.min = String(limits.min); input.max = String(limits.max) }
    input.step = '1'
    input.value = String(state.window[axis])
    if (output) output.textContent = String(state.window[axis])
  }
}

async function init() {
  await refreshCharacters()
  const state = await api.state()
  renderWindowState(state)
  // 向主窗口要一份当前设置值
  send('requestState')
  appearanceMessage('更改即时生效 · 拖动标题栏可移动窗口')
}

// 主窗口回报的设置值
if (api && typeof api.onState === 'function') {
  api.onState((payload) => {
    if (payload?.type === 'settings-select-tab' && payload.tab === 'director') { selectSettingsTab('director'); return }
    if (payload?.type === 'window-state') { renderWindowState(payload.state); return }
    if (!payload || payload.type !== 'settings-state' || !payload.state) return
    const s = payload.state
    if(s.appearance)renderAppearance(s.appearance)
    if(s.appearanceStatus)appearanceMessage(s.appearanceStatus,s.appearanceStatus!=='已保存')
    for (const [key, prefix] of [['gazeBody', 'gazeBody'], ['gazeSpeed', 'gazeSpeed']]) {
      if (Number.isFinite(s[key])) {
        document.getElementById(prefix + 'Range').value = String(Math.round(s[key] * 100))
        document.getElementById(prefix + 'Value').textContent = Math.round(s[key] * 100) + '%'
      }
    }
    if (typeof s.idleDirectorEnabled === 'boolean' && directorToggle) directorToggle.checked = s.idleDirectorEnabled
    if (s.bindings) document.getElementById('gazeBindingInfo').textContent = s.bindings.headX
      ? '输入绑定已验证 · 眼睛先看、头部跟随、身体轻跟；自动保存。'
      : '当前角色未配置可靠的头部输入绑定；已跳过未验证的跟随通道。'
    if (typeof s.gazeStrength === 'number' && gazeRange) {
      gazeRange.value = String(Math.round(s.gazeStrength * 100))
      if (gazeValue) gazeValue.textContent = Math.round(s.gazeStrength * 100) + '%'
    }
    if (typeof s.actingScale === 'number' && actingScaleRange) {
      const percent = Math.round(s.actingScale * 100)
      actingScaleRange.value = String(percent)
      if (actingScaleValue) actingScaleValue.textContent = percent ? percent + '%' : '关闭'
    }
    if (typeof s.liveliness === 'number' && livelinessRange) {
      const percent = Math.round(s.liveliness * 100)
      livelinessRange.value = String(percent)
      if (livelinessValue) livelinessValue.textContent = percent ? percent + '%' : '关闭'
    }
    if (typeof s.breathFactor === 'number' && breathRange) {
      breathRange.value = String(Math.round(s.breathFactor * 100))
      if (breathValue) breathValue.textContent = Math.round(s.breathFactor * 100) + '%'
    }
    if (typeof s.snapDistance === 'number' && snapRange) {
      snapRange.value = String(Math.round(s.snapDistance))
      if (snapValue) snapValue.textContent = s.snapDistance ? Math.round(s.snapDistance) + 'px' : '关闭'
    }
    if (typeof s.gazeEnabled === 'boolean' && gazeToggle) gazeToggle.checked = s.gazeEnabled
    if (typeof s.watchEnabled === 'boolean' && watchToggle) watchToggle.checked = s.watchEnabled
    if (typeof s.clickThrough === 'boolean' && clickThroughToggle) clickThroughToggle.checked = s.clickThrough
  })
}

init().catch(error => setStatus('读取设置失败：' + (error.message || String(error)), 'error'))
