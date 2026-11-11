'use strict'

const MIN_WIDTH = 420
const MIN_HEIGHT = 460

const finite = (value, fallback) => Number.isFinite(value) ? value : fallback
const dimension = (value, fallback) => Number.isFinite(value) && value >= 2
  ? Math.floor(value) : fallback
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

/**
 * All arguments and results use Electron DIP, never physical/device pixels.
 * A valid Electron workArea is authoritative. Invalid display dimensions fall
 * back to a small finite area; callers should normally supply the real display.
 * Missing/nonfinite requested dimensions keep the current dimensions when valid.
 * Inputs are not mutated. step=1 keeps slider values identical to actual bounds.
 */
function normalizeWindowGeometry(currentBox = {}, requestedSize = {}, workArea = {}) {
  const current = currentBox || {}
  const requested = requestedSize || {}
  const area = workArea || {}
  const areaX = Math.round(finite(area.x, 0))
  const areaY = Math.round(finite(area.y, 0))
  const areaWidth = dimension(area.width, MIN_WIDTH)
  const areaHeight = dimension(area.height, MIN_HEIGHT)
  const maxWidth = Math.floor(areaWidth * 0.95)
  const maxHeight = Math.floor(areaHeight * 0.95)
  const minWidth = Math.min(MIN_WIDTH, maxWidth)
  const minHeight = Math.min(MIN_HEIGHT, maxHeight)
  const width = clamp(Math.round(finite(requested.width, finite(current.width, minWidth))), minWidth, maxWidth)
  const height = clamp(Math.round(finite(requested.height, finite(current.height, minHeight))), minHeight, maxHeight)
  const x = clamp(Math.round(finite(current.x, areaX)), areaX, areaX + areaWidth - width)
  const y = clamp(Math.round(finite(current.y, areaY)), areaY, areaY + areaHeight - height)

  return {
    bounds: { x, y, width, height },
    sliderLimits: {
      width: { min: minWidth, max: maxWidth, step: 1 },
      height: { min: minHeight, max: maxHeight, step: 1 },
    },
  }
}

module.exports = { normalizeWindowGeometry }
