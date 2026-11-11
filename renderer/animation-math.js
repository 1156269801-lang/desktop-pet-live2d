(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.PetAnimationMath = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'
  function approach(current, target, lambda, dt) {
    if (!Number.isFinite(dt) || dt <= 0) return current
    return current + (target - current) * -Math.expm1(-lambda * dt)
  }
  // Smooth attack + tapered damped rebound. Both endpoints are exactly neutral.
  function pulseValue(p, elapsedMs) {
    if (elapsedMs <= 0 || elapsedMs >= p.dur) return 0
    const t = elapsedMs / 1000
    const attack = Math.min(1, elapsedMs / 70)
    const ease = attack * attack * (3 - 2 * attack)
    const tail = Math.min(1, (p.dur - elapsedMs) / 160)
    return p.amp * ease * tail * Math.exp(-p.damp * t) * Math.cos(p.freq * 2 * Math.PI * t)
  }
  return { approach, pulseValue }
})
