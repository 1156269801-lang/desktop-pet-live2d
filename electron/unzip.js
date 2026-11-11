'use strict'

/**
 * 极简 ZIP 解压：只依赖 Node 自带的 zlib。
 *
 * 为什么不用 PowerShell 的 Expand-Archive / .NET：它们在不同区域设置下
 * 对 UTF-8 文件名（尤其是中文）处理不一致，模型包里目录名常是中文，
 * 解出来变乱码就找不到文件了。这里自己读中央目录，按 zip 的通用标志位
 * 判断文件名是 UTF-8 还是 CP437，稳定得多。
 */

const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

function readZipEntries(buffer) {
  // 找 End of Central Directory (EOCD)：0x06054b50，从尾部往前扫
  let eocd = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 66000); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('不是有效的 zip 文件（找不到目录结尾）')

  const entryCount = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  const entries = []

  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break
    const flags = buffer.readUInt16LE(offset + 8)
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const rawName = buffer.subarray(offset + 46, offset + 46 + nameLength)

    // bit 11 = 文件名是 UTF-8
    const name = flags & 0x800 ? rawName.toString('utf8') : decodeCp437(rawName)

    entries.push({ name, method, compressedSize, uncompressedSize, localOffset })
    offset += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

function decodeCp437(bytes) {
  // 只处理 ASCII 与常见的高位字符；不确定时按 latin1 读回来，至少不会崩
  try {
    return bytes.toString('latin1')
  } catch (error) {
    return bytes.toString('utf8')
  }
}

function extractEntry(buffer, entry, targetPath) {
  const local = entry.localOffset
  if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error('本地文件头损坏: ' + entry.name)
  const nameLength = buffer.readUInt16LE(local + 26)
  const extraLength = buffer.readUInt16LE(local + 28)
  const dataStart = local + 30 + nameLength + extraLength
  const raw = buffer.subarray(dataStart, dataStart + entry.compressedSize)

  let data
  if (entry.method === 0) data = raw
  else if (entry.method === 8) data = zlib.inflateRawSync(raw)
  else throw new Error('不支持的压缩方式 ' + entry.method + ': ' + entry.name)

  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, data)
}

/** 把 zip 解到 outDir（会做路径穿越防护） */
function extractZip(zipPath, outDir) {
  const buffer = fs.readFileSync(zipPath)
  const entries = readZipEntries(buffer)
  const root = path.resolve(outDir)
  let files = 0

  for (const entry of entries) {
    const safeName = entry.name.replace(/\\/g, '/')
    if (!safeName || safeName.endsWith('/')) continue // 目录条目
    const target = path.resolve(root, safeName)
    // 防 zip slip：不允许解到 outDir 外面
    if (!target.startsWith(root + path.sep)) continue
    extractEntry(buffer, entry, target)
    files += 1
  }

  return { files, entries: entries.length }
}

module.exports = { extractZip }
