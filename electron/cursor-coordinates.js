'use strict'

/** Screen and content bounds are Electron DIP coordinates, including negative monitors. */
function toContentCursor(point, contentBounds, at = Date.now()) {
  if (!point || !contentBounds) return null
  if (![point.x, point.y, contentBounds.x, contentBounds.y, at].every(Number.isFinite)) return null
  return { x: point.x - contentBounds.x, y: point.y - contentBounds.y, at }
}

module.exports = { toContentCursor }
