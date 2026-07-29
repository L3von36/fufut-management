// Audio alerts for kitchen events (new orders, order ready, etc.)
// Uses Web Audio API to generate sounds programmatically — no external files needed
import { ref } from 'vue'

let audioContext = null
const muted = ref(false)
const enabled = ref(true)

// Check localStorage for saved preferences
const savedMuted = localStorage.getItem('kitchen-audio-muted')
const savedEnabled = localStorage.getItem('kitchen-audio-enabled')
if (savedMuted !== null) muted.value = savedMuted === 'true'
if (savedEnabled !== null) enabled.value = savedEnabled === 'true'

// Also respect prefers-reduced-motion as a proxy for reduced sensory experience
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
if (prefersReduced) {
  enabled.value = false
}

function getAudioContext() {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)()
    } catch (e) {
      return null
    }
  }
  // Resume context if suspended (required after page load)
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {})
  }
  return audioContext
}

// Generate a "ding" sound — short, pleasant, ascending tone
function playDing() {
  if (!enabled.value || muted.value) return
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    // Create oscillator for the main tone
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.connect(gain)
    gain.connect(ctx.destination)

    // Pleasant ascending "ding" — start at 440Hz, sweep to 660Hz
    osc.frequency.setValueAtTime(440, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15)

    // Quick attack, short decay
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)

    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.3)
  } catch (e) {
    // Audio context might be suspended — try to resume
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => playDing())
    }
  }
}

// Generate a "chime" sound — warmer, lower tone for order ready
function playChime() {
  if (!enabled.value || muted.value) return
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    // Two-tone chime (like a triangle instrument)
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gain = ctx.createGain()

    osc1.connect(gain)
    osc2.connect(gain)
    gain.connect(ctx.destination)

    // Lower, warmer tone
    osc1.frequency.setValueAtTime(330, ctx.currentTime)
    osc2.frequency.setValueAtTime(440, ctx.currentTime)

    // Triangle wave for warm tone
    osc1.type = 'triangle'
    osc2.type = 'triangle'

    // Gentle attack and decay
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)

    osc1.start(ctx.currentTime)
    osc2.start(ctx.currentTime)
    osc1.stop(ctx.currentTime + 0.5)
    osc2.stop(ctx.currentTime + 0.5)
  } catch (e) {
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => playChime())
    }
  }
}

// Generate a "pop" sound — short, sharp for button feedback
function playPop() {
  if (!enabled.value || muted.value) return
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.connect(gain)
    gain.connect(ctx.destination)

    // Short "pop" — white noise-like
    osc.type = 'square'
    osc.frequency.setValueAtTime(880, ctx.currentTime)

    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1)

    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.1)
  } catch (e) {
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => playPop())
    }
  }
}

export function useAudioAlerts() {
  function playNewOrder() {
    playDing()
  }

  function playOrderReady() {
    playChime()
  }

  function playOrderUpdate() {
    playPop()
  }

  function toggleMute() {
    muted.value = !muted.value
    localStorage.setItem('kitchen-audio-muted', String(muted.value))
  }

  function toggleEnabled() {
    enabled.value = !enabled.value
    localStorage.setItem('kitchen-audio-enabled', String(enabled.value))
  }

  return {
    muted,
    enabled,
    playNewOrder,
    playOrderReady,
    playOrderUpdate,
    toggleMute,
    toggleEnabled
  }
}
