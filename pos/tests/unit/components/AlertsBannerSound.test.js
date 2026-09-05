import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

/**
 * Sound alerts on the operations banner.
 *
 * The banner has always shown the breach; now it says it out loud when the
 * breach is critical. Three things are worth pinning in tests, because each
 * one is a way this feature quietly annoys or fails:
 *
 *  1. Only critical breaches chime — warnings are the banner's job, not the
 *     room's.
 *  2. A chime does not repeat while the same alert stays open — the sweep
 *     runs every minute, and a siren that re-fires every minute trains the
 *     floor to mute it. A warning that *escalates* into critical is a new
 *     fact, and does chime.
 *  3. One chime per batch, however many criticals arrived together — the
 *     first sweep after a cold start can raise five at once, and five
 *     sirens is noise, not signal.
 *
 * The mute toggle must be its own button, not nested in the summary button
 * (invalid HTML swallows the inner click), and its state must show.
 */

vi.mock('../../../src/composables/useAudioAlerts', async () => {
  const { ref } = await import('vue')
  const playCriticalAlert = vi.fn()
  const opsMuted = ref(false)
  // Mirrors the real toggle: flips the persisted ref the banner renders from.
  const toggleOpsMute = vi.fn(() => {
    opsMuted.value = !opsMuted.value
  })
  return {
    useAudioAlerts: () => ({ playCriticalAlert, opsMuted, toggleOpsMute }),
    __audioMock: { playCriticalAlert, opsMuted, toggleOpsMute },
  }
})

const listeners = {}
vi.mock('../../../src/composables/useSSE', () => ({
  useSSE: () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: (evt, cb) => { listeners[evt] = cb },
    // Shared module ref in the real composable — the quota circuit-breaker
    // mode the banner mirrors. Tests here run in 'normal'.
    quotaMode: { value: 'normal' },
  }),
}))

vi.mock('../../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  apiPost: (...a) => mockApiPost(...a),
}))

let authRoleKey = 'manager'
vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: () => ({ roleKey: authRoleKey, name: 'Test Manager' }),
}))

import AlertsBanner from '../../../src/components/AlertsBanner.vue'
import { __audioMock } from '../../../src/composables/useAudioAlerts'

const { playCriticalAlert, opsMuted, toggleOpsMute } = __audioMock

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const toastFn = vi.fn()

function mountBanner() {
  return mount(AlertsBanner, { global: { provide: { toast: toastFn } } })
}

beforeEach(() => {
  vi.clearAllMocks()
  opsMuted.value = false
  authRoleKey = 'manager'
  // A fresh module instance per test would be cleaner, but the sounded-id Set
  // lives in the component — a new mount is enough to reset it.
})

describe('critical alert sound', () => {
  it('chimes once when a critical alert is present on load', async () => {
    mockApiGet.mockResolvedValue({
      ok: true,
      alerts: [{ id: 'A1', severity: 'critical', message: 'Takeaway preparing 17 h 40 min', created: '2026-08-27T16:20:00.000Z' }],
    })
    mountBanner()
    await flushPromises()
    expect(playCriticalAlert).toHaveBeenCalledTimes(1)
  })

  it('does not chime for warnings alone', async () => {
    mockApiGet.mockResolvedValue({
      ok: true,
      alerts: [{ id: 'W1', severity: 'warning', message: 'Reservation past time', created: '2026-08-28T09:30:00.000Z' }],
    })
    mountBanner()
    await flushPromises()
    expect(playCriticalAlert).not.toHaveBeenCalled()
  })

  it('does not repeat while the same critical stays open', async () => {
    const critical = { id: 'A1', severity: 'critical', message: 'stale order', created: '2026-08-27T16:20:00.000Z' }
    mockApiGet.mockResolvedValue({ ok: true, alerts: [critical] })
    mountBanner()
    await flushPromises()
    expect(playCriticalAlert).toHaveBeenCalledTimes(1)

    // The minute tick re-reads the same open alert — silence expected.
    listeners['alerts_update']({ alerts: [{ ...critical }] })
    await flushPromises()
    expect(playCriticalAlert).toHaveBeenCalledTimes(1)
  })

  it('chimes when a warning escalates into critical', async () => {
    mockApiGet.mockResolvedValue({
      ok: true,
      alerts: [{ id: 'W1', severity: 'warning', message: 'preparing 22 min', created: '2026-08-28T09:30:00.000Z' }],
    })
    mountBanner()
    await flushPromises()
    expect(playCriticalAlert).not.toHaveBeenCalled()

    // Same alert id, now critical — a new fact, and the room hears it.
    listeners['alerts_update']({ alerts: [{ id: 'W1', severity: 'critical', message: 'preparing 41 min', created: '2026-08-28T09:30:00.000Z' }] })
    await flushPromises()
    expect(playCriticalAlert).toHaveBeenCalledTimes(1)
  })

  it('chimes once for a batch of new criticals, not once each', async () => {
    mockApiGet.mockResolvedValue({ ok: true, alerts: [] })
    mountBanner()
    await flushPromises()
    expect(playCriticalAlert).not.toHaveBeenCalled()

    const stamp = '2026-08-28T09:30:00.000Z'
    listeners['alerts_update']({
      alerts: [
        { id: 'C1', severity: 'critical', message: 'one', created: stamp },
        { id: 'C2', severity: 'critical', message: 'two', created: stamp },
        { id: 'C3', severity: 'critical', message: 'three', created: stamp },
      ],
    })
    await flushPromises()
    expect(playCriticalAlert).toHaveBeenCalledTimes(1)
  })

  it('silences for roles that cannot read alerts', async () => {
    authRoleKey = 'cleaner'
    mockApiGet.mockResolvedValue({ ok: true, alerts: [{ id: 'A1', severity: 'critical', message: 'x', created: '2026-08-27T16:20:00.000Z' }] })
    const wrapper = mountBanner()
    await flushPromises()
    // The banner never mounted its listeners, so no chime and no banner.
    expect(playCriticalAlert).not.toHaveBeenCalled()
    expect(wrapper.find('.alerts-banner').exists()).toBe(false)
  })
})

describe('sound toggle', () => {
  it('is a separate button from the summary, and shows state', async () => {
    mockApiGet.mockResolvedValue({
      ok: true,
      alerts: [{ id: 'W1', severity: 'warning', message: 'warning only', created: '2026-08-28T09:30:00.000Z' }],
    })
    const wrapper = mountBanner()
    await flushPromises()

    const btn = wrapper.find('.alerts-sound')
    expect(btn.exists()).toBe(true)
    // aria-pressed says sound is ON when not muted.
    expect(btn.attributes('aria-pressed')).toBe('true')

    await btn.trigger('click')
    expect(toggleOpsMute).toHaveBeenCalled()
    expect(opsMuted.value).toBe(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.alerts-sound').attributes('aria-pressed')).toBe('false')
  })

  it('renders the summary and the toggle as siblings, not nested buttons', async () => {
    mockApiGet.mockResolvedValue({
      ok: true,
      alerts: [{ id: 'W1', severity: 'warning', message: 'warning only', created: '2026-08-28T09:30:00.000Z' }],
    })
    const wrapper = mountBanner()
    await flushPromises()
    const top = wrapper.find('.alerts-top')
    expect(top.find('.alerts-summary').exists()).toBe(true)
    expect(top.find('.alerts-sound').exists()).toBe(true)
    // A button inside a button is invalid HTML and eats clicks.
    expect(top.find('.alerts-summary .alerts-sound').exists()).toBe(false)
  })
})
