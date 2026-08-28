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

// ── Operations (SLA) alert sounds ──
//
// Deliberately NOT gated on the kitchen's `muted` switch: a ticket chime and a
// breach siren are different conversations, and a cook who muted the order
// dings during a rush did not thereby silence the thing telling them a ticket
// has been lost for an hour. They still respect `enabled`, because
// prefers-reduced-motion is a device-level "no sudden noises" and that is the
// user's call, not ours.
//
// The critical sound is three ascending square beeps — impossible to confuse
// with the warm order chime, and short enough not to startle the room.
const opsMuted = ref(false)
const savedOpsMuted = localStorage.getItem('ops-alerts-muted')
if (savedOpsMuted !== null) opsMuted.value = savedOpsMuted === 'true'

function playBeep(ctx, at, freq, duration) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'square'
  osc.frequency.setValueAtTime(freq, at)

  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(0.14, at + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, at + duration)

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(at)
  osc.stop(at + duration)
}

// Three ascending beeps. Fired when a critical breach appears — including a
// warning that just crossed into critical, which is the moment the floor
// actually needs to hear about.
function playCriticalAlert() {
  if (!enabled.value || opsMuted.value) return
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    const t = ctx.currentTime
    playBeep(ctx, t, 660, 0.12)
    playBeep(ctx, t + 0.18, 880, 0.12)
    playBeep(ctx, t + 0.36, 1100, 0.16)
  } catch (e) {
    // A suspended context stays silent; the banner is still on screen.
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

  function toggleOpsMute() {
    opsMuted.value = !opsMuted.value
    localStorage.setItem('ops-alerts-muted', String(opsMuted.value))
  }

  return {
    muted,
    enabled,
    opsMuted,
    playNewOrder,
    playOrderReady,
    playOrderUpdate,
    playCriticalAlert,
    toggleMute,
    toggleEnabled,
    toggleOpsMute
  }
}
