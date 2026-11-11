'use strict'

/** 独立快捷菜单窗：按钮只负责开关其它窗口/功能，不承载聊天和设置本体。 */
function call(fn) {
  try {
    if (typeof fn === 'function') fn()
  } catch {
    /* ignore */
  }
}

function closePanel() {
  call(window.pet.closePanelWindow)
}

document.getElementById('btnClose').addEventListener('click', closePanel)

document.getElementById('btnChat').addEventListener('click', () => {
  call(window.pet.openChatWindow)
  closePanel()
})

document.getElementById('btnConsole').addEventListener('click', () => {
  call(window.pet.openConsoleWindow)
  closePanel()
})

document.getElementById('btnSettings').addEventListener('click', () => {
  call(window.pet.openSettings)
  closePanel()
})

document.getElementById('btnObserve').addEventListener('click', () => {
  call(() => window.pet.observe(false))
  closePanel()
})

document.getElementById('btnCollapse').addEventListener('click', () => {
  call(window.pet.collapse)
  closePanel()
})
