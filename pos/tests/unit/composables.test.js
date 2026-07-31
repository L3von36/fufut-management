import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAnimatedNumber } from '../../src/composables/useAnimatedNumber'
import { useToast } from '../../src/composables/useToast'

// Mock API for useSync
vi.mock('../../src/api', () => ({
  isOnline: vi.fn(() => true),
  onOnlineChange: vi.fn(() => vi.fn())
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
  it('should not throw when no toast container exists', () => {
    const { toast } = useToast()
    expect(() => toast('Hello')).not.toThrow()
  })

  it('should create a toast element when container exists', () => {
    const container = document.createElement('div')
    container.id = 'toastContainer'
    document.body.appendChild(container)

    const { toast } = useToast()
    toast('Order created', 'success')

    const toastEl = container.querySelector('.toast')
    expect(toastEl).not.toBeNull()
    expect(toastEl.textContent).toBe('Order created')
    expect(toastEl.className).toContain('success')

    document.body.removeChild(container)
  })

  it('should auto-remove toast after 3 seconds', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    container.id = 'toastContainer'
    document.body.appendChild(container)

    const { toast } = useToast()
    toast('Test message')

    // Trigger animation frame
    await vi.advanceTimersByTimeAsync(16)
    expect(container.querySelector('.toast')).not.toBeNull()

    // Wait for timeout + fade (3000ms + 350ms)
    await vi.advanceTimersByTimeAsync(3500)
    expect(container.querySelector('.toast')).toBeNull()

    document.body.removeChild(container)
    vi.useRealTimers()
  })

  it('should apply show class via requestAnimationFrame', async () => {
    const container = document.createElement('div')
    container.id = 'toastContainer'
    document.body.appendChild(container)

    const { toast } = useToast()
    toast('Hello')

    // Before rAF, no show class
    const toastEl = container.querySelector('.toast')
    expect(toastEl.classList.contains('show')).toBe(false)

    // After rAF
    await new Promise(r => requestAnimationFrame(r))
    expect(toastEl.classList.contains('show')).toBe(true)

    document.body.removeChild(container)
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
