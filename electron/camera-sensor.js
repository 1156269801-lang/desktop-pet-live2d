'use strict'

function createPresenceSensor({ now = Date.now, awayMs = 15000, onChange = () => {} } = {}) {
  let enabled = false, presence = 'unknown', absentSince = null, consecutive = 0, seen = false
  return {
    setEnabled(value) {
      enabled = value === true
      presence = 'unknown'; absentSince = null; consecutive = 0; seen = false
    },
    sample(count) {
      if (!enabled || !Number.isInteger(count) || count < 0 || count > 10) return
      if (count > 0) {
        absentSince = null
        consecutive += 1
        if (consecutive < 2 || presence === 'present') return
        presence = 'present'
        onChange(seen ? 'returned' : 'arrived')
        seen = true
      } else {
        consecutive = 0
        if (presence === 'unknown') presence = 'absent'
        if (presence !== 'present') return
        absentSince ??= now()
        if (now() - absentSince < awayMs) return
        presence = 'absent'
        onChange('left')
      }
    },
  }
}

const localOrigin = (port) => 'http://127.0.0.1:' + port
function cameraMediaAllowed({ contents, petContents, chatContents, port, allowed, isMainFrame, url, origin, types }) {
  if (!isMainFrame || !contents || !port || !Array.isArray(types) || types.length !== 1) return false
  const base = localOrigin(port)
  if (origin && origin !== base && origin !== base + '/') return false
  if (allowed && contents === petContents && contents.getURL() === base + '/' && (!url || url === base + '/')) return types[0] === 'video'
  if (contents === chatContents && contents.getURL() === base + '/chat.html' && (!url || url === base + '/chat.html')) return types[0] === 'audio'
  return false
}

module.exports = { createPresenceSensor, cameraMediaAllowed }
