'use strict'

window.installModelDrop = function (api, afterImport) {
  const status = document.createElement('div')
  status.className = 'model-drop-toast'
  status.setAttribute('role', 'status')
  status.hidden = true
  document.body.append(status)
  let busy = false, timeout
  const show = (message, persistent = false) => {
    clearTimeout(timeout)
    status.textContent = message
    status.hidden = false
    if (!persistent) timeout = setTimeout(() => { status.hidden = true }, 6500)
  }
  const highlight = (active) => document.documentElement.classList.toggle('model-drop-active', active)
  const isFiles = (event) => event.dataTransfer?.types.includes('Files')
  const importFile = async (file) => {
    if (!file || busy) return
    busy = true
    show('正在导入模型…', true)
    try {
      const source = api.pathForFile(file)
      if (!source) throw new Error('请从资源管理器拖入本机文件夹或 ZIP')
      const result = await api.importCharacter(source)
      if (!result?.ok) throw new Error(result?.error || '未知错误')
      show('导入成功：' + result.character.name)
      await afterImport?.()
    } catch (error) { show('导入失败：' + error.message) }
    finally { busy = false }
  }
  for (const type of ['dragenter', 'dragover']) {
    window.addEventListener(type, (event) => {
      event.preventDefault()
      if (!isFiles(event)) return
      event.dataTransfer.dropEffect = 'copy'
      highlight(true)
    })
  }
  window.addEventListener('dragleave', (event) => { if (!event.relatedTarget) highlight(false) })
  window.addEventListener('dragend', () => highlight(false))
  window.addEventListener('drop', (event) => {
    event.preventDefault()
    highlight(false)
    const files = event.dataTransfer?.files
    if (files?.length === 1) void importFile(files[0])
    else if (files?.length > 1) show('一次只能导入一个文件夹或 ZIP')
    else show('只支持拖入本机模型文件夹或 ZIP')
  })
  return importFile
}
