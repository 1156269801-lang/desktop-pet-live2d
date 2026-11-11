'use strict'

const { contextBridge, ipcRenderer } = require('electron')

// 独立设置窗口的桥：只暴露"设置"需要的能力，
// 真正的动作转发给主窗口（那里才有 model / Live2D 上下文）执行。
contextBridge.exposeInMainWorld('petConsole', {
  state: () => ipcRenderer.invoke('settings:state'),
  listCharacters: () => ipcRenderer.invoke('settings:characters'),
  switchCharacter: (id) => ipcRenderer.invoke('settings:switch', id),
  importCharacter: (filePath) => ipcRenderer.invoke('settings:import', { path: filePath }),
  captureIcon: (id, box) => ipcRenderer.invoke('pet:capture-icon', { id, box }),
  command: (cmd, value) => ipcRenderer.send('settings:command', { cmd, value }),
  close: () => ipcRenderer.send('console:close'),
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
  requestConsole: () => ipcRenderer.send('console:request'),
  play: (group, index, name) => ipcRenderer.send('console:action', { kind: 'motion', group, index, name }),
  playExpression: (name) => ipcRenderer.send('console:action', { kind: 'expression', name }),
  clearExpression: () => ipcRenderer.send('console:action', { kind: 'expressionClear' }),
  onState: (listener) => {
    const handler = (_event, payload) => listener(payload)
    ipcRenderer.on('pet:event', handler)
    return () => ipcRenderer.removeListener('pet:event', handler)
  },
})

