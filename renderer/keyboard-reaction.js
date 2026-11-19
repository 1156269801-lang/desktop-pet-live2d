'use strict'
;(function (root) {
  function createKeyboardReaction(play, now = Date.now) {
    let enabled = true, sensitivity = 35, last = -Infinity, lastLook = -Infinity, side = 'left'
    return {
      configure(prefs) {
        enabled = prefs?.enabled !== false
        sensitivity = Number.isFinite(prefs?.sensitivity) ? Math.max(0, Math.min(100, prefs.sensitivity)) : 35
      },
      push(strength) {
        if (!enabled || !sensitivity || !Number.isFinite(strength) || strength <= 0) return
        const time = now()
        if (time - last < 300) return
        const intensity = Math.min(0.8, (0.25 + Math.min(1, strength) * 0.75) * sensitivity / 65)
        const fast = strength >= 0.83
        const glance = !fast && strength >= 0.48 && time - lastLook >= 14000
        if (glance) lastLook = time
        last = time
        side = side === 'left' ? 'right' : 'left'
        play(fast ? 'typingRush' : glance ? 'typingLook' : 'typingTap', { intensity, side })
      },
    }
  }
  if (typeof module === 'object' && module.exports) module.exports = { createKeyboardReaction }
  else root.createKeyboardReaction = createKeyboardReaction
})(typeof self !== 'undefined' ? self : this)
