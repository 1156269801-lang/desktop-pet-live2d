'use strict'
// Virtual character rhythm only. Never estimates the human's mood or needs.
function createLifeState({ now = Date.now } = {}) {
  function state() {
    const hour = new Date(now()).getHours()
    const routine = hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
    const energy = routine === 'night' ? 0.3 : routine === 'evening' ? 0.55 : 0.75
    const sleepy = routine === 'night' ? 0.85 : routine === 'evening' ? 0.4 : 0.1
    return { virtual: true, routine, energy, sleepy, pace: routine === 'night' ? 2 : routine === 'evening' ? 1.25 : 1,
      intensityScale: routine === 'night' ? 0.35 : routine === 'evening' ? 0.55 : 0.7,
      maxSpeechCharacters: routine === 'night' ? 24 : routine === 'evening' ? 40 : 60 }
  }
  return Object.freeze({ state })
}
module.exports = { createLifeState }
