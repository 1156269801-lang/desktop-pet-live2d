'use strict'

const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('pet', {
  ready: () => ipcRenderer.invoke('pet:ready'),
  send: (text) => ipcRenderer.invoke('pet:send', text),
  observe: (withVision) => ipcRenderer.invoke('pet:observe', { withVision: !!withVision }),
  setWatch: (enabled) => ipcRenderer.invoke('pet:watch', !!enabled),
  listCharacters: () => ipcRenderer.invoke('pet:list-characters'),
  switchCharacter: (id) => ipcRenderer.invoke('pet:switch-character', id),
  importCharacter: (filePath) => ipcRenderer.invoke('pet:import-character', { path: filePath }),
  captureIcon: (id, box) => ipcRenderer.invoke('pet:capture-icon', { id, box }),
  pathForFile: (file) => {
    try {
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
  state: () => ipcRenderer.invoke('pet:state'),
  chatHistory: () => ipcRenderer.invoke('pet:history'),
  setPanel: (open) => ipcRenderer.invoke('pet:panel', !!open),
  hideWindow: () => ipcRenderer.invoke('pet:hide-window'),
  collapse: () => ipcRenderer.invoke('pet:collapse'),
  expand: () => ipcRenderer.invoke('pet:expand'),
  resizeTo: (size) => ipcRenderer.invoke('pet:resize', size),
  setClickThrough: (ignore) => ipcRenderer.invoke('pet:click-through', !!ignore),
  setFocusable: (enabled) => ipcRenderer.invoke('pet:focusable', !!enabled),
  openSettings: () => ipcRenderer.invoke('settings:open'),
  openConsoleWindow: () => ipcRenderer.invoke('console:open'),
  report: (payload) => ipcRenderer.invoke('pet:report', payload),
  tts: (text, lang) => ipcRenderer.invoke('pet:tts', text, lang),
  openChatWindow: () => ipcRenderer.invoke('chat:open'),
  closeChatWindow: () => ipcRenderer.send('chat:close'),
  openPanelWindow: (x, y) => ipcRenderer.invoke('panel:open', { x, y }),
  closePanelWindow: () => ipcRenderer.send('panel:close'),
  moveBy: (dx, dy) => ipcRenderer.send('pet:move-by', { dx, dy }),
  interact: (kind) => ipcRenderer.send('pet:interact', kind),
  autostart: (enabled) => ipcRenderer.invoke('pet:autostart', enabled),
  moveTo: (x, y) => ipcRenderer.send('pet:move-to', { x, y }),
  setWindowSize: (size) => ipcRenderer.invoke('pet:window-size', size),
  quit: () => ipcRenderer.send('pet:quit'),
  onEvent: (listener) => {
    const handler = (_event, payload) => listener(payload)
    ipcRenderer.on('pet:event', handler)
    return () => ipcRenderer.removeListener('pet:event', handler)
  },
  onStatus: (listener) => {
    const handler = (_event, payload) => listener(payload)
    ipcRenderer.on('pet:status', handler)
    return () => ipcRenderer.removeListener('pet:status', handler)
  },
})
