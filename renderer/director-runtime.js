(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.PetDirectorRuntime = api
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict'
  function interpolate(points, at) {
    if (at <= points[0][0]) return points[0][1]
    for (let i = 1; i < points.length; i++) if (at <= points[i][0]) {
      const a = points[i - 1], b = points[i], t = (at - a[0]) / Math.max(1, b[0] - a[0]), smooth = t * t * (3 - 2 * t)
      return a[1] + (b[1] - a[1]) * smooth
    }
    return points[points.length - 1][1]
  }
  function create({ now, expression, speech, report, release }) {
    let active = null, expressionName = null
    const wardrobe = new Map(), values = new Map()
    let gaze = null
    function clearTransient() {
      release?.([...values.keys()])
      values.clear(); gaze = null
      if (expressionName) expression(null)
      expressionName = null
    }
    function cancel(reason = 'cancelled') {
      const old = active
      active = null; clearTransient()
      if (old) report({ requestId: old.id, running: false, state: reason })
    }
    function start(plan, caps, id) {
      cancel('replaced')
      active = { plan, caps, id, at: now(), applied: new Set(), acknowledged: false,
        end: Math.max(0, ...plan.cues.map(c => c.at + c.duration)) }
      if (plan.speech) speech(plan.speech, plan.speech_ja)
    }
    function step() {
      const previous = [...values.keys()]
      values.clear(); gaze = null
      if (!active) return
      const a = active, elapsed = now() - a.at
      let nextExpression = null
      for (let i = 0; i < a.plan.cues.length; i++) {
        const c = a.plan.cues[i], time = elapsed - c.at
        if (time < 0) continue
        if (c.kind === 'outfit' && !a.applied.has(i)) {
          for (const [id, value] of Object.entries(a.caps.outfits.find(x => x.id === c.name).set)) wardrobe.set(id, value)
          a.applied.add(i)
        }
        if (time >= c.duration) continue
        if (c.kind === 'gesture') {
          const g = a.caps.gestures.find(x => x.id === c.name)
          for (const track of g.tracks) {
            const p = a.caps.parameters.find(p => p.id === track.id), base = p.default || 0
            values.set(track.id, base + (interpolate(track.points, time * g.durationMs / c.duration) - base) * c.intensity)
          }
        } else if (c.kind === 'parameters') {
          for (const [id, value] of Object.entries(c.set)) values.set(id, value)
        } else if (c.kind === 'expression') {
          const emotion = a.caps.emotions.find(e => e.id === c.name)
          nextExpression = emotion?.expression || (emotion ? null : c.name)
          for (const [id, value] of Object.entries(emotion?.set || {})) values.set(id, value)
        } else if (c.kind === 'gaze') {
          gaze = { ...c }
          if (c.space === 'display') { const d = a.caps.displays.find(d => d.id === c.displayId); gaze = { ...c, space: 'screen', x: d.bounds.x + c.x * d.bounds.width, y: d.bounds.y + c.y * d.bounds.height } }
        }
      }
      release?.(previous.filter(id => !values.has(id)))
      if (nextExpression !== expressionName) { expression(nextExpression); expressionName = nextExpression }
      if (elapsed >= a.end && a.acknowledged) cancel('completed')
    }
    function afterFrame() {
      if (active && !active.acknowledged) { active.acknowledged = true; report({ requestId: active.id, ok: true, running: true, state: 'frame-applied' }) }
    }
    return { start, step, afterFrame, cancel, values, wardrobe,
      clearWardrobe() { release?.([...wardrobe.keys()]); wardrobe.clear() },
      get gaze() { return gaze }, get running() { return Boolean(active) },
      status() { return { running: Boolean(active), requestId: active?.id || null, gaze, values: Object.fromEntries(values), wardrobe: Object.fromEntries(wardrobe) } } }
  }
  return { create, interpolate }
})
