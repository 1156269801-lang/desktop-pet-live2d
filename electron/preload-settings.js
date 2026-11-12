'use strict'

const { contextBridge, ipcRenderer } = require('electron')

// 独立设置窗口的桥：只暴露"设置"需要的能力，
// 真正的动作转发给主窗口（那里才有 model / Live2D 上下文）执行。
contextBridge.exposeInMainWorld('settings', {
  legacyState: () => ipcRenderer.invoke('legacy-state:status'),
  legacyDelete: body => ipcRenderer.invoke('legacy-state:delete', body),
  shareState: () => ipcRenderer.invoke('share:state'),
  sharePreview: body => ipcRenderer.invoke('share:preview', body),
  shareConfirm: body => ipcRenderer.invoke('share:confirm', body),
  shareRevoke: () => ipcRenderer.invoke('share:revoke'),
  sceneCollect: body => ipcRenderer.invoke('scene:collect', body),
  sceneSend: body => ipcRenderer.invoke('scene:send', body),
  sceneClear: () => ipcRenderer.invoke('scene:clear'),
  memoryLibraryState: () => ipcRenderer.invoke('memory:library-state'),
  memoryAddEvent: body => ipcRenderer.invoke('memory:add-event', body),
  memoryPreviewConsolidation: body => ipcRenderer.invoke('memory:preview-consolidation', body),
  memoryConfirmConsolidation: body => ipcRenderer.invoke('memory:confirm-consolidation', body),
  memoryDeleteSource: body => ipcRenderer.invoke('memory:delete-source', body),
  memorySuggest: body => ipcRenderer.invoke('memory:suggest', body),
  memoryResolveSuggestion: body => ipcRenderer.invoke('memory:resolve-suggestion', body),
  memorySetLibraryAuthorization: body => ipcRenderer.invoke('memory:set-library-authorization', body),
  memoryRevokeLibrary: body => ipcRenderer.invoke('memory:revoke-library', body),
  memoryState: () => ipcRenderer.invoke('memory:state'),
  memorySave: (body) => ipcRenderer.invoke('memory:save', body),
  memoryDelete: (body) => ipcRenderer.invoke('memory:delete', body),
  memoryClear: (body) => ipcRenderer.invoke('memory:clear', body),
  memoryRevoke: (body) => ipcRenderer.invoke('memory:revoke', body),
  personaState: () => ipcRenderer.invoke('persona:state'),
  personaSave: (body) => ipcRenderer.invoke('persona:save', body),
  personaReset: (body) => ipcRenderer.invoke('persona:reset', body),
  personaRollback: (body) => ipcRenderer.invoke('persona:rollback', body),
  autonomyState: () => ipcRenderer.invoke('autonomy:state'),
  autonomySave: (body) => ipcRenderer.invoke('autonomy:save', body),
  autonomyStart: () => ipcRenderer.invoke('autonomy:start'),
  autonomyStop: () => ipcRenderer.invoke('autonomy:stop'),
  autonomyOnce: () => ipcRenderer.invoke('autonomy:once'),
  directorState: () => ipcRenderer.invoke('director:state'),
  directorSave: (body) => ipcRenderer.invoke('director:save', body),
  directorConnect: (body) => ipcRenderer.invoke('director:connect', body),
  directorTest: () => ipcRenderer.invoke('director:test'),
  directorClearKey: () => ipcRenderer.invoke('director:clear-key'),
  directorPreview: (body) => ipcRenderer.invoke('director:preview', body),
  directorCancel: () => ipcRenderer.invoke('director:cancel'),
  state: () => ipcRenderer.invoke('settings:state'),
  listCharacters: () => ipcRenderer.invoke('settings:characters'),
  switchCharacter: (id) => ipcRenderer.invoke('settings:switch', id),
  importCharacter: (filePath) => ipcRenderer.invoke('settings:import', { path: filePath }),
  pickBackground: (target) => ipcRenderer.invoke('settings:background-pick', { target }),
  captureIcon: (id, box) => ipcRenderer.invoke('pet:capture-icon', { id, box }),
  command: (cmd, value) => ipcRenderer.send('settings:command', { cmd, value }),
  close: () => ipcRenderer.send('settings:close'),
  // 无参 = 读当前状态；传 bool = 设置
  autostart: (enabled) => ipcRenderer.invoke('settings:autostart', enabled),
  pathForFile: (file) => {
    try {
      const { webUtils } = require('electron')
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        const p = webUtils.getPathForFile(file)
        if (p) return p
      }
    } catch (error) {
      /* ignore */
    }
    try {
      if (file && typeof file.path === 'string') return file.path
    } catch (error) {
      /* ignore */
    }
    return ''
  },
  onState: (listener) => {
    const handler = (_event, payload) => listener(payload)
    ipcRenderer.on('pet:event', handler)
    return () => ipcRenderer.removeListener('pet:event', handler)
  },
})
