import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAnimatedNumber } from '../../src/composables/useAnimatedNumber'
import { useToast } from '../../src/composables/useToast'

// Mock API for useSync
vi.mock('../../src/api', () => ({
  isOnline: vi.fn(() => true),
  onOnlineChange: vi.fn(() => vi.fn()),
  getSSEUrl: vi.fn((eventPath) => `http://localhost:1234/api/events/${eventPath}`)
}))

// Mock DB for useSync
vi.mock('../../src/db', () => ({
  getPendingMutations: vi.fn().mockResolvedValue([]),
  removeMutation: vi.fn().mockResolvedValue(undefined),
  getSyncQueueLength: vi.fn().mockResolvedValue(0),
  clearSyncQueue: vi.fn().mockResolvedValue(undefined)
}))

describe('useAnimatedNumber', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

   afterEach(() => {
    vi.useRealTimers()
  })

  it('should start at 0', () => {
    const { displayValue } = useAnimatedNumber()
    expect(displayValue.value).toBe(0)
  })

  it('should animate to target value', () => {
    const { displayValue, animateTo } = useAnimatedNumber(100)
    animateTo(100)

    // After a few frames, value should be moving toward target
    vi.advanceTimersByTime(50)
    expect(displayValue.value).toBeGreaterThan(0)
    expect(displayValue.value).toBeLessThan(100)
  })

  it('should reach target after duration', () => {
    const { displayValue, animateTo } = useAnimatedNumber(200)
    animateTo(1000)

    vi.advanceTimersByTime(100)
    // Should not have reached yet
    expect(displayValue.value).toBeLessThan(1000)

    vi.advanceTimersByTime(200)
    // Should be close to or at target
    expect(displayValue.value).toBeGreaterThan(500)
  })

  it('should handle downward animation', () => {
    const { displayValue, animateTo } = useAnimatedNumber(100)
    // First animate up
    animateTo(500)
    vi.advanceTimersByTime(150)
    const midValue = displayValue.value

    // Then animate down
    animateTo(100)
    vi.advanceTimersByTime(150)
    // Should be moving down
    expect(displayValue.value).toBeLessThanOrEqual(midValue)
  })

  it('should accept custom duration', () => {
    const { displayValue, animateTo } = useAnimatedNumber(50)
    animateTo(100)

    vi.advanceTimersByTime(60)
    // With 50ms duration, should be done or very close
    expect(displayValue.value).toBeGreaterThan(80)
  })
})

describe('useToast', () => {
  let toastApi

  beforeEach(() => {
    // The store is a module-level singleton, so reset state between tests.
    toastApi = useToast()
    toastApi.dismissAll()
  })

  afterEach(() => {
    toastApi.dismissAll()
  })

  it('should push a toast onto the shared reactive store', () => {
    toastApi.toast('Hello', 'info')
    expect(toastApi.toasts.value.length).toBe(1)
    expect(toastApi.toasts.value[0].message).toBe('Hello')
    expect(toastApi.toasts.value[0].type).toBe('info')
  })

  it('should render a toast element when the container component is mounted', () => {
    toastApi.toast('Order created', 'success')
    const t = toastApi.toasts.value[0]
    expect(t.type).toBe('success')
    expect(t.message).toBe('Order created')
  })

  // The store no longer injects <style> — ToastContainer.vue owns all styles,
  // so the old "style injection" regression cannot occur by construction.
  it('should not require runtime style injection', () => {
    toastApi.toast('Welcome back', 'success')
    expect(document.head.querySelector('style[data-toast-styles]')).toBeNull()
  })

  it('should expose type-aliased helpers (success, error, info, warning)', () => {
    toastApi.success('ok')
    toastApi.error('bad')
    toastApi.info('hi')
    toastApi.warning('careful')

    expect(toastApi.toasts.value.length).toBe(4)
    expect(toastApi.toasts.value[0].type).toBe('success')
    expect(toastApi.toasts.value[1].type).toBe('error')
    expect(toastApi.toasts.value[2].type).toBe('info')
    expect(toastApi.toasts.value[3].type).toBe('warning')
  })

  it('should normalize swapped args like toast("error", "message")', () => {
    toastApi.toast('error', 'Something broke')
    const t = toastApi.toasts.value[0]
    expect(t.type).toBe('error')
    expect(t.message).toBe('Something broke')
  })

  it('should default unknown types to info', () => {
    toastApi.toast('Hello', 'unknown-type')
    expect(toastApi.toasts.value[0].type).toBe('info')
  })

  it('should accept an options.title', () => {
    toastApi.toast('Saved', 'success', { title: 'Done' })
    expect(toastApi.toasts.value[0].title).toBe('Done')
  })

  it('should auto-dismiss after the configured duration', async () => {
    vi.useFakeTimers()
    toastApi.toast('Test message', 'info', { duration: 4000 })
    expect(toastApi.toasts.value.length).toBe(1)

    await vi.advanceTimersByTimeAsync(3999)
    expect(toastApi.toasts.value.length).toBe(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(toastApi.toasts.value.length).toBe(0)

    vi.useRealTimers()
  })

  it('should remove a toast immediately on dismiss()', () => {
    const id = toastApi.toast('Bye', 'info')
    expect(toastApi.toasts.value.length).toBe(1)
    toastApi.dismiss(id)
    expect(toastApi.toasts.value.length).toBe(0)
  })

  it('should clear all toasts with dismissAll()', () => {
    toastApi.toast('one', 'info')
    toastApi.toast('two', 'success')
    toastApi.dismissAll()
    expect(toastApi.toasts.value.length).toBe(0)
  })

  it('should not throw when no container is in the DOM', () => {
    document.body.innerHTML = ''
    expect(() => toastApi.toast('Hello', 'info')).not.toThrow()
  })
})

describe('useSync', () => {
  it('should expose sync functions', async () => {
    const { useSync } = await import('../../src/composables/useSync')
    const sync = useSync()

    expect(sync.pendingCount).toBeDefined()
    expect(sync.syncing).toBeDefined()
    expect(typeof sync.processQueue).toBe('function')
    expect(typeof sync.refreshCount).toBe('function')
    expect(typeof sync.start).toBe('function')
    expect(typeof sync.stop).toBe('function')
  })

  it('should start with 0 pending items', async () => {
    const { useSync } = await import('../../src/composables/useSync')
    const sync = useSync()
    await sync.refreshCount()
    expect(sync.pendingCount.value).toBe(0)
  })

  it('start should set up interval', async () => {
    vi.useFakeTimers()
    const { useSync } = await import('../../src/composables/useSync')
    const sync = useSync()

    sync.start()
    expect(sync.pendingCount.value).toBe(0)

    sync.stop()
    vi.useRealTimers()
  })
})
