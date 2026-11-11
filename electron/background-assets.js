'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')

const MAX_BYTES = 12 * 1024 * 1024
const MAX_SIDE = 8192
const ASSET_PREFIX = '/user-assets/backgrounds/'
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const ASSET_ROUTE = /^\/user-assets\/backgrounds\/([a-f0-9]{64})\.png$/
const FORMATS = new Map([['.png', 'png'], ['.jpg', 'jpeg'], ['.jpeg', 'jpeg'], ['.webp', 'webp']])

function fail(code, message) {
  const error = new Error(message)
  error.code = code
  error.publicMessage = message
  throw error
}

function checkDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    fail('BACKGROUND_EMPTY', '图片为空或无法读取尺寸。')
  }
  if (width > MAX_SIDE || height > MAX_SIDE) fail('BACKGROUND_DIMENSIONS', '图片最长边不能超过 8192 像素。')
}

// Check both signature and dimensions before decoding, preventing disguised SVG/HTML
// and oversized compressed images from reaching the image decoder.
function imageHeader(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(PNG_SIGNATURE) && bytes.toString('ascii', 12, 16) === 'IHDR') {
    return { format: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset + 3 < bytes.length) {
      if (bytes[offset++] !== 0xff) return null
      while (bytes[offset] === 0xff) offset++
      const marker = bytes[offset++]
      if (marker === 0xda || marker === 0xd9) return null
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
      if (offset + 2 > bytes.length) return null
      const length = bytes.readUInt16BE(offset)
      if (length < 2 || offset + length > bytes.length) return null
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 7) return null
        return { format: 'jpeg', width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) }
      }
      offset += length
    }
  }
  if (bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = bytes.toString('ascii', 12, 16)
    if (chunk === 'VP8X' && bytes.length >= 30) return { format: 'webp', width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) }
    if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { format: 'webp', width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff }
    }
    if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      const dimensions = bytes.readUInt32LE(21)
      return { format: 'webp', width: (dimensions & 0x3fff) + 1, height: ((dimensions >>> 14) & 0x3fff) + 1 }
    }
  }
  return null
}

async function readBoundedFile(filePath) {
  const handle = await fs.open(filePath, 'r')
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) fail('BACKGROUND_NOT_FILE', '请选择图片文件。')
    if (stat.size < 1) fail('BACKGROUND_EMPTY', '图片文件为空。')
    if (stat.size > MAX_BYTES) fail('BACKGROUND_SIZE', '图片文件不能超过 12 MiB。')
    // Read at most one byte beyond the limit even if the source changes after stat.
    const chunks = []
    let total = 0
    while (total <= MAX_BYTES) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, MAX_BYTES + 1 - total))
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null)
      if (!bytesRead) break
      chunks.push(chunk.subarray(0, bytesRead))
      total += bytesRead
    }
    if (total > MAX_BYTES) fail('BACKGROUND_SIZE', '图片文件不能超过 12 MiB。')
    return Buffer.concat(chunks, total)
  } finally {
    await handle.close()
  }
}

function resolveBackgroundAsset(root, route) {
  if (typeof root !== 'string' || typeof route !== 'string') return null
  const match = ASSET_ROUTE.exec(route)
  if (!match) return null
  const directory = path.resolve(root, 'user-assets', 'backgrounds')
  const target = path.resolve(directory, match[1] + '.png')
  return path.dirname(target) === directory ? target : null
}

async function checkedDirectory(root, create) {
  const realRoot = await fs.realpath(root)
  const directory = path.join(realRoot, 'user-assets', 'backgrounds')
  // Reject a pre-existing junction/symlink before creating anything beneath it.
  for (const component of [path.join(realRoot, 'user-assets'), directory]) {
    let stat
    try {
      stat = await fs.lstat(component)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      if (!create) throw error
      try {
        await fs.mkdir(component)
      } catch (mkdirError) {
        if (mkdirError.code !== 'EEXIST') throw mkdirError
      }
      // Another creator may have won the race. Recheck rather than accepting
      // EEXIST blindly: it could be a file, junction or symbolic link.
      stat = await fs.lstat(component)
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('BACKGROUND_PATH', '背景资源目录不是安全的本地目录。')
  }
  if (path.relative(realRoot, await fs.realpath(directory)) !== path.join('user-assets', 'backgrounds')) {
    fail('BACKGROUND_PATH', '背景资源路径超出候选版目录。')
  }
  return directory
}

// Serialize this helper's imports through completion, not just path creation.
// Otherwise a duplicate may compare against a PNG that is still being written.
// Always settle the queue tail so a failed import cannot block later selections.
let importQueue = Promise.resolve()
function importBackground(sourcePath, options) {
  const pending = importQueue.then(() => importBackgroundOnce(sourcePath, options))
  importQueue = pending.then(() => undefined, () => undefined)
  return pending
}

async function importBackgroundOnce(sourcePath, { root, nativeImage } = {}) {
  try {
    if (typeof sourcePath !== 'string' || sourcePath.includes('\0') || !path.isAbsolute(sourcePath)
      || /^[a-z][a-z0-9+.-]*:\/\//i.test(sourcePath) || /^(?:\\\\|\/\/)/.test(sourcePath)) {
      fail('BACKGROUND_LOCAL_ONLY', '请选择本地图片，不支持链接或网络路径。')
    }
    const format = FORMATS.get(path.extname(sourcePath).toLowerCase())
    if (!format) fail('BACKGROUND_FORMAT', '仅支持 PNG、JPEG 和 WebP 图片。')
    const bytes = await readBoundedFile(sourcePath)
    const header = imageHeader(bytes)
    if (!header || header.format !== format) fail('BACKGROUND_FORMAT', '文件内容不是所选格式的有效图片。')
    checkDimensions(header.width, header.height)
    const decoded = nativeImage.createFromBuffer(bytes)
    if (!decoded || decoded.isEmpty()) fail('BACKGROUND_EMPTY', '图片无法解码，请换一张图片。')
    const { width, height } = decoded.getSize()
    checkDimensions(width, height)
    const png = decoded.toPNG()
    const outputHeader = Buffer.isBuffer(png) ? imageHeader(png) : null
    if (!outputHeader || outputHeader.format !== 'png') fail('BACKGROUND_EMPTY', '图片转换失败。')
    if (png.length > MAX_BYTES) fail('BACKGROUND_SIZE', '转换后的 PNG 超过 12 MiB，请先缩小图片。')
    const hash = crypto.createHash('sha256').update(png).digest('hex')
    const directory = await checkedDirectory(root, true)
    const destination = path.join(directory, hash + '.png')
    try {
      await fs.writeFile(destination, png, { flag: 'wx' })
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      const stat = await fs.lstat(destination)
      if (stat.isSymbolicLink() || !stat.isFile() || path.dirname(await fs.realpath(destination)) !== directory) {
        fail('BACKGROUND_PATH', '背景资源文件路径不安全。')
      }
      if (!(await readBoundedFile(destination)).equals(png)) fail('BACKGROUND_CONFLICT', '背景资源文件校验失败，请保留文件并检查目录。')
    }
    return { ok: true, url: ASSET_PREFIX + hash + '.png', name: path.basename(sourcePath), width, height }
  } catch (error) {
    return { ok: false, code: error.publicMessage ? error.code : 'BACKGROUND_IMPORT_FAILED', error: error.publicMessage || '图片导入失败，请确认文件可读取且资源目录可写。' }
  }
}

async function readBackgroundAsset(root, route) {
  const target = resolveBackgroundAsset(root, route)
  if (!target) return null
  try {
    const directory = await checkedDirectory(root, false)
    const stat = await fs.lstat(target)
    if (stat.isSymbolicLink() || !stat.isFile() || path.dirname(await fs.realpath(target)) !== directory) return null
    const bytes = await readBoundedFile(target)
    const header = imageHeader(bytes)
    if (!header || header.format !== 'png') return null
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')
    if (path.basename(target) !== hash + '.png') return null
    return bytes
  } catch {
    return null
  }
}

module.exports = { importBackground, resolveBackgroundAsset, readBackgroundAsset, imageHeader, MAX_BYTES, MAX_SIDE }
