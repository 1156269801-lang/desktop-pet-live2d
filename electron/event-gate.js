'use strict'
// No titles, prompts or user activity history. Only bounded coarse event state.
const CATEGORIES = new Set(['general', 'code', 'video', 'game', 'chat', 'fullscreen'])
const EVENTS = Object.freeze(['session-start', 'scene-change', 'interaction', 'routine-transition'])
function createEventGate({ now = Date.now, stabilityMs = 30000 } = {}) {
  let candidate = null, since = 0, committed = null, routine = null
  const pending = new Set()
  function reset() { candidate = committed = routine = null; since = now(); pending.clear() }
  function begin(initialCategory, initialRoutine) {
    reset(); pending.add('session-start'); routine = initialRoutine
    if (CATEGORIES.has(initialCategory)) { candidate = initialCategory; since = now() }
  }
  function observe(category, nextRoutine) {
    if (!CATEGORIES.has(category)) category = 'general'
    if (routine !== null && nextRoutine !== routine) pending.add('routine-transition')
    routine = nextRoutine
    if (candidate !== category) { candidate = category; since = now() }
    const remainingMs = Math.max(0, stabilityMs - (now() - since))
    if (remainingMs === 0 && committed !== category) {
      if (committed !== null) pending.add('scene-change')
      committed = category
    }
    return { stable: remainingMs === 0, remainingMs }
  }
  return Object.freeze({ begin, observe, reset,
    interaction() { pending.add('interaction') },
    peek() { return EVENTS.find(event => pending.has(event)) || null },
    consume() { const event = EVENTS.find(item => pending.has(item)) || null; pending.clear(); return event },
  })
}
module.exports = { createEventGate, EVENTS }
