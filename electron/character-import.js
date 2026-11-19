'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { extractZip } = require('./unzip')

const MAX_FILES = 10000
const MAX_BYTES = 512 * 1024 * 1024
const MAX_FILE = 64 * 1024 * 1024
const modelName = /model3\.json$/i
const safePart = (part) => part && part !== '.' && part !== '..' && !/[<>:"|?*\x00-\x1f]|[. ]$/u.test(part)
  && !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(part)

function scan(root) {
  const files = new Set()
  let total = 0, count = 0
  function walk(dir, depth) {
    if (depth > 20) throw new Error('模型目录嵌套过深')
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (++count > MAX_FILES || !safePart(entry.name)) throw new Error('模型包文件太多或包含不安全的名称')
      const full = path.join(dir, entry.name)
      const stat = fs.lstatSync(full)
      if (stat.isDirectory() && !stat.isSymbolicLink()) walk(full, depth + 1)
      else {
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('模型包不能包含链接或特殊文件')
        total += stat.size
        if (total > MAX_BYTES || stat.size > MAX_FILE) throw new Error('模型包过大')
        files.add(path.relative(root, full).split(path.sep).join('/'))
      }
    }
  }
  walk(root, 0)
  return files
}

function importCharacter(source, root, defaultSpeech, readCharacter) {
  if (!path.isAbsolute(source) || /^\\\\/.test(source)) throw new Error('请选择本机文件夹或 ZIP')
  const stat = fs.lstatSync(source)
  const directory = stat.isDirectory() && !stat.isSymbolicLink()
  if (!directory && (!stat.isFile() || !/\.zip$/i.test(source))) throw new Error('只支持模型文件夹或 .zip 压缩包')
  const name = path.basename(source, directory ? '' : path.extname(source))
  const candidate = name.replace(/[<>:"|?*\x00-\x1f]/gu, '').replace(/\.{2,}/g, '-').slice(0, 50).replace(/[. ]+$/u, '')
  const seed = safePart(candidate) ? candidate : 'character'
  fs.mkdirSync(root, { recursive: true })
  root = fs.realpathSync(root)
  if (directory && (source === root || !path.relative(source, root).split(path.sep).includes('..') && !path.isAbsolute(path.relative(source, root)))) {
    throw new Error('不能导入角色存储目录或其上级目录')
  }
  let id = seed, target
  for (let suffix = 2;; suffix++) {
    target = path.join(root, id)
    try { fs.mkdirSync(target); break } catch (error) { if (error.code !== 'EEXIST') throw error }
    id = seed + '-' + suffix
  }
  try {
    if (!directory) {
      try { extractZip(source, target, { maxFiles: MAX_FILES, maxBytes: MAX_BYTES, maxFile: MAX_FILE, safePart }) }
      catch (error) { throw new Error('解压失败：' + error.message) }
    }
    const input = directory ? source : target
    const files = scan(input)
    let manifest, model, icon
    const manifests = [...files].filter((file) => path.posix.basename(file) === 'manifest.json')
      .sort((a, b) => a.split('/').length - b.split('/').length)
    for (const file of manifests) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(input, file), 'utf8').replace(/^\uFEFF/, ''))
        const relative = (value) => typeof value === 'string' && value.replace(/\\/g, '/').split('/').every(safePart)
          ? path.posix.join(path.posix.dirname(file), value.replace(/\\/g, '/')) : null
        const ref = relative(data.model ?? 'model3.json')
        if (!ref || !ref.toLowerCase().endsWith('.json') || !files.has(ref)) continue
        model = ref
        manifest = data
        const preview = relative(data.icon)
        if (files.has(preview)) icon = preview.split('/').map(encodeURIComponent).join('/')
        break
      } catch { /* Try another manifest or a raw model. */ }
    }
    model ||= [...files].find((file) => modelName.test(path.posix.basename(file)))
    if (!model) throw new Error('没有找到有效的 manifest.json 或 *.model3.json')
    try { if (!JSON.parse(fs.readFileSync(path.join(input, model), 'utf8').replace(/^\uFEFF/, ''))?.FileReferences) throw new Error() }
    catch { throw new Error('模型 JSON 无效：缺少 FileReferences 或无法解析') }
    if (directory) {
      for (const file of files) {
        const destination = path.join(target, file)
        const original = path.join(source, file)
        if (!fs.lstatSync(original).isFile() || fs.realpathSync(original) !== path.join(fs.realpathSync(source), file)) {
          throw new Error('复制时模型文件路径发生变化')
        }
        fs.mkdirSync(path.dirname(destination), { recursive: true })
        fs.copyFileSync(original, destination, fs.constants.COPYFILE_EXCL)
      }
    }
    fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify({ speech: defaultSpeech, ...manifest,
      id, name: manifest?.name || name || id, model, icon }, null, 2), 'utf8')
    const character = readCharacter(id)
    if (!character) throw new Error('角色清单校验失败')
    return { character, files: files.size }
  } catch (error) {
    if (target === path.join(fs.realpathSync(root), id) && path.dirname(target) === root && !fs.lstatSync(target).isSymbolicLink()) {
      fs.rmSync(target, { recursive: true, force: true })
    }
    throw error
  }
}

module.exports = { importCharacter }
