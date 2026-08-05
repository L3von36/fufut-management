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
  // Cleanup any toast container / injected styles between tests so each test
  // starts from a clean DOM.
  beforeEach(() => {
    document.body.innerHTML = ''
    document.head.querySelectorAll('style[data-toast-styles]').forEach(s => s.remove())
  })

  it('should not throw when no toast container exists', () => {
    const { toast } = useToast()
    // Calling toast() without a container should auto-create one and not throw.
    expect(() => toast('info', 'Hello')).not.toThrow()
  })

  it('should create a toast element when container exists', () => {
    const container = document.createElement('div')
    container.id = 'toastContainer'
    document.body.appendChild(container)

    const { toast } = useToast()
    toast('success', 'Order created')

    const toastEl = container.querySelector('.toast-notification')
    expect(toastEl).not.toBeNull()
    expect(toastEl.className).toContain('toast-success')
    expect(toastEl.textContent).toContain('Order created')
  })

  it('should render an auto-detected title for known types', () => {
    const container = document.createElement('div')
    container.id = 'toastContainer'
    document.body.appendChild(container)

    const { toast } = useToast()
    toast('error', 'Something broke')

    const toastEl = container.querySelector('.toast-notification')
    expect(toastEl).not.toBeNull()
    expect(toastEl.className).toContain('toast-error')
    expect(toastEl.textContent).toContain('Error')
    expect(toastEl.textContent).toContain('Something broke')
  })

  it('should add the .show class via requestAnimationFrame', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    container.id = 'toastContainer'
    document.body.appendChild(container)

    const { toast } = useToast()
    toast('info', 'Hello')

    const toastEl = container.querySelector('.toast-notification')
    expect(toastEl).not.toBeNull()
    // rAF is mocked as setTimeout(cb, 16) in tests/setup.js — before the
    // timer fires, .show is NOT present.
    expect(toastEl.classList.contains('show')).toBe(false)

    // Flush the rAF callback.
    await vi.advanceTimersByTimeAsync(16)
    expect(toastEl.classList.contains('show')).toBe(true)

    vi.useRealTimers()
  })

  it('should auto-dismiss after the duration by adding .hidden', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    container.id = 'toastContainer'
    document.body.appendChild(container)

    const { toast } = useToast()
    toast('info', 'Test message', { duration: 4000 })

    let toastEl = container.querySelector('.toast-notification')
    expect(toastEl).not.toBeNull()

    // Just before the auto-dismiss timer fires, the toast is still visible.
    await vi.advanceTimersByTimeAsync(3999)
    expect(container.querySelector('.toast-notification')).not.toBeNull()
    expect(toastEl.classList.contains('hidden')).toBe(false)

    // At 4000ms the dismiss handler runs and adds .hidden to trigger the
    // CSS slide-out animation.
    await vi.advanceTimersByTimeAsync(1)
    expect(toastEl.classList.contains('hidden')).toBe(true)

    vi.useRealTimers()
  })

  it('should remove the element from the DOM after the slide-out animation ends', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    container.id = 'toastContainer'
    document.body.appendChild(container)

    const { toast } = useToast()
    toast('info', 'Bye', { duration: 4000 })

    // Trigger the auto-dismiss.
    await vi.advanceTimersByTimeAsync(4000)

    let toastEl = container.querySelector('.toast-notification')
    expect(toastEl).not.toBeNull()
    expect(toastEl.classList.contains('hidden')).toBe(true)

    // jsdom doesn't run CSS animations, so simulate the animationend event
    // that the production code listens for to remove the element.
    const evt = new Event('animationend', { bubbles: true })
    evt.animationName = 'toastSlideOut'
    toastEl.dispatchEvent(evt)

    expect(container.querySelector('.toast-notification')).toBeNull()

    vi.useRealTimers()
  })

  it('should expose type-aliased helpers (success, error, info, warning)', () => {
    const container = document.createElement('div')
    container.id = 'toastContainer'
    document.body.appendChild(container)

    const { success, error, info, warning } = useToast()
    success('ok')
    error('bad')
    info('hi')
    warning('careful')

    const toasts = container.querySelectorAll('.toast-notification')
    expect(toasts.length).toBe(4)
    expect(toasts[0].className).toContain('toast-success')
    expect(toasts[1].className).toContain('toast-error')
    expect(toasts[2].className).toContain('toast-info')
    expect(toasts[3].className).toContain('toast-warning')
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
