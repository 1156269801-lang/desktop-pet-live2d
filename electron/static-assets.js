'use strict'
// Static serving never follows links into private/config directories. This is
// scoped path hardening, not a defence against a compromised Windows account.
const fs = require('node:fs'), path = require('node:path')
const MAX_ASSET_BYTES = 64 * 1024 * 1024
const inside = (root, file) => { const r = path.relative(root, file); return r !== '' && !r.startsWith('..' + path.sep) && r !== '..' && !path.isAbsolute(r) }
async function readStaticAsset(root, base, target, options = {}) {
  const io = options.fs || fs
  let fd
  try {
    root = path.resolve(root); base = path.resolve(base); target = path.resolve(target)
    if (!['renderer', 'characters', 'assets', 'engine'].includes(path.relative(root, base)) || !inside(base, target)) return null
    const relative = path.relative(root, target)
    // Reject NTFS alternate streams, ambiguous Win32 trailing dots/spaces and controls.
    const segments = relative.split(path.sep)
    if (segments.some(s => !s || /[:\x00-\x1f\x7f]/.test(s) || /[. ]$/.test(s))) return null
    let cursor = root
    const rootStat = io.lstatSync(cursor)
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return null
    for (let i = 0; i < segments.length; i++) {
      cursor = path.join(cursor, segments[i])
      const st = io.lstatSync(cursor)
      if (st.isSymbolicLink() || (i < segments.length - 1 ? !st.isDirectory() : !st.isFile() || st.nlink !== 1)) return null
    }
    const realRoot = io.realpathSync(root), realTarget = io.realpathSync(target), realBase = io.realpathSync(base)
    if (!inside(realRoot, realBase) || !inside(realBase, realTarget) || path.relative(realRoot, realTarget) !== relative) return null
    const expected = io.statSync(realTarget)
    if (!expected.isFile() || expected.nlink !== 1 || expected.size > MAX_ASSET_BYTES) return null
    fd = await io.promises.open(realTarget, io.constants.O_RDONLY | (io.constants.O_NOFOLLOW || 0))
    const opened = await fd.stat()
    if (!opened.isFile() || opened.dev !== expected.dev || opened.ino !== expected.ino || opened.nlink !== 1 || opened.size !== expected.size) return null
    if (io.realpathSync(target) !== realTarget) return null
    const data = await fd.readFile()
    return data.length <= MAX_ASSET_BYTES ? data : null
  } catch { return null }
  finally { if (fd) await fd.close().catch(() => {}) }
}
module.exports = { readStaticAsset, MAX_ASSET_BYTES }
