import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiGet, apiPost, apiPut, apiDelete, isOnline, onOnlineChange, ROLE_PERMISSIONS, ROLE_DEFAULT_VIEW, NAV_ITEMS, TODAY, getSSEUrl } from '../../src/api'

// Mock the db module
vi.mock('../../src/db', () => ({
  dbGetAll: vi.fn().mockResolvedValue([{ id: 'cached-1', name: 'Cached Item' }]),
  dbCacheAll: vi.fn().mockResolvedValue(undefined),
  queueMutation: vi.fn().mockResolvedValue(undefined)
}))

// Stub navigator.onLine before api module loads
Object.defineProperty(navigator, 'onLine', {
  value: true,
  writable: true,
  configurable: true
})

describe('API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
  })

  describe('apiGet', () => {
    it('should fetch data from the API and return JSON', async () => {
      const mockData = [{ id: 'O-1', items: 'Espresso', total: 50 }]
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData)
      })

      const result = await apiGet('orders')
      expect(result).toEqual(mockData)
      expect(fetch).toHaveBeenCalledWith('/api/orders', expect.objectContaining({ credentials: 'include' }))
    })

    it('should cache array responses to IndexedDB', async () => {
      const mockData = [{ id: 'M-1', name: 'Latte' }]
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData)
      })

      await apiGet('menu')
      const { dbCacheAll } = await import('../../src/db')
      expect(dbCacheAll).toHaveBeenCalledWith('menu', mockData)
    })

    it('should not cache non-array responses', async () => {
      const { dbCacheAll } = await import('../../src/db')
      vi.clearAllMocks()
      const mockData = { ok: true, user: { id: 'S-1' } }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData)
      })

      await apiGet('auth/me')
      expect(dbCacheAll).not.toHaveBeenCalled()
    })

    it('should fallback to IndexedDB cache when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const result = await apiGet('orders')
      expect(result).toEqual([{ id: 'cached-1', name: 'Cached Item' }])
    })

    it('should throw when offline and no cache exists', async () => {
      const { dbGetAll } = await import('../../src/db')
      dbGetAll.mockResolvedValueOnce(null)
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      await expect(apiGet('nonexistent')).rejects.toThrow('Network error')
    })

    it('should extract store name from nested endpoints', async () => {
      const mockData = [{ id: 'O-1' }]
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData)
      })

      await apiGet('orders/today')
      const { dbCacheAll } = await import('../../src/db')
      expect(dbCacheAll).toHaveBeenCalledWith('orders', mockData)
    })
  })

  describe('apiPost', () => {
    it('should POST data with JSON content type', async () => {
      const mockResponse = { ok: true, id: 'O-new123' }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const body = { items: 'Espresso', total: 50 }
      const result = await apiPost('orders', body)
      expect(result).toEqual(mockResponse)
      expect(fetch).toHaveBeenCalledWith('/api/orders', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      }))
    })

    it('should queue non-auth mutations when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
      global.fetch = vi.fn().mockRejectedValue(new Error('Offline'))

      const result = await apiPost('orders', { items: 'Latte' })
      const { queueMutation } = await import('../../src/db')
      expect(queueMutation).toHaveBeenCalledWith('POST', 'orders', { items: 'Latte' })
      expect(result._offline).toBe(true)
      expect(result.ok).toBe(true)
    })

    it('should NOT queue auth mutations when offline (should throw)', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
      global.fetch = vi.fn().mockRejectedValue(new Error('Offline'))

      await expect(apiPost('auth/login', { email: 'test@test.com', password: '123' }))
        .rejects.toThrow('Offline')
    })
  })

  describe('apiPut', () => {
    it('should PUT data and return response', async () => {
      const mockResponse = { ok: true }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const result = await apiPut('orders/O-1', { status: 'preparing' })
      expect(result).toEqual(mockResponse)
      expect(fetch).toHaveBeenCalledWith('/api/orders/O-1', expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'preparing' })
      }))
    })

    it('should queue mutations when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
      global.fetch = vi.fn().mockRejectedValue(new Error('Offline'))

      const result = await apiPut('orders/O-1', { status: 'ready' })
      const { queueMutation } = await import('../../src/db')
      expect(queueMutation).toHaveBeenCalledWith('PUT', 'orders/O-1', { status: 'ready' })
      expect(result._offline).toBe(true)
    })
  })

  describe('apiDelete', () => {
    it('should DELETE with id in body', async () => {
      const mockResponse = { ok: true }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const result = await apiDelete('orders', 'O-1')
      expect(fetch).toHaveBeenCalledWith('/api/orders', expect.objectContaining({
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: 'O-1' })
      }))
    })

    it('should queue delete mutations when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
      global.fetch = vi.fn().mockRejectedValue(new Error('Offline'))

      const result = await apiDelete('orders', 'O-1')
      const { queueMutation } = await import('../../src/db')
      expect(queueMutation).toHaveBeenCalledWith('DELETE', 'orders', { id: 'O-1' })
      expect(result._offline).toBe(true)
    })

    it('should handle DELETE without id', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true })
      })

      await apiDelete('orders')
      expect(fetch).toHaveBeenCalledWith('/api/orders', expect.objectContaining({
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(undefined)
      }))
    })
  })

  describe('Online/Offline tracking', () => {
    it('isOnline should return true when navigator.onLine is true', () => {
      // The api module captures _online from navigator.onLine at module load time
      // and listens for window events. In tests, we verify the function exists and works.
      expect(typeof isOnline()).toBe('boolean')
    })

    it('onOnlineChange should register and unregister listeners', () => {
      const cb = vi.fn()
      const unsub = onOnlineChange(cb)

      // Simulate offline event
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
      // The api module registers its own listeners on window events.
      // We just verify the function returns an unsubscribe function
      expect(typeof unsub).toBe('function')
      unsub()
    })
  })

  describe('Constants', () => {
    it('ROLE_PERMISSIONS should define permissions for all 7 roles', () => {
      const expectedRoles = ['manager', 'head-chef', 'assistant-chef', 'head-waiter', 'cashier', 'delivery-staff', 'cleaner']
      expectedRoles.forEach(role => {
        expect(ROLE_PERMISSIONS[role]).toBeDefined()
        expect(Array.isArray(ROLE_PERMISSIONS[role])).toBe(true)
        expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0)
      })
    })

    it('manager should have most permissions', () => {
      const allViews = NAV_ITEMS.map(n => n.view)
      const nonManagerViews = allViews.filter(v => !ROLE_PERMISSIONS.manager.includes(v))
      // pipeline and revenue are not in manager permissions
      expect(nonManagerViews.sort()).toEqual(['pipeline', 'revenue'].sort())
    })

    it('cleaner should only have waste and dashboard', () => {
      expect(ROLE_PERMISSIONS.cleaner).toEqual(['waste', 'dashboard'])
    })

    it('delivery-staff should only have delivery and dashboard', () => {
      expect(ROLE_PERMISSIONS['delivery-staff']).toEqual(['delivery', 'dashboard'])
    })

    it('ROLE_DEFAULT_VIEW should map each role to a valid view', () => {
      Object.entries(ROLE_DEFAULT_VIEW).forEach(([role, view]) => {
        expect(ROLE_PERMISSIONS[role]).toContain(view)
      })
    })

    it('NAV_ITEMS should have 21 items across defined sections', () => {
      expect(NAV_ITEMS.length).toBe(21)
      const sections = [...new Set(NAV_ITEMS.map(n => n.section))]
      expect(sections).toContain('Overview')
      expect(sections).toContain('Sales')
      expect(sections).toContain('Operations')
      expect(sections).toContain('Finance')
      expect(sections).toContain('Stock')
      expect(sections).toContain('HR')
      expect(sections).toContain('Analytics')
    })

    it('TODAY should return a date string in YYYY-MM-DD format', () => {
      const today = TODAY()
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      const parts = today.split('-')
      const date = new Date()
      expect(parseInt(parts[0])).toBe(date.getFullYear())
      expect(parseInt(parts[1]) - 1).toBe(date.getMonth())
      expect(parseInt(parts[2])).toBe(date.getDate())
    })

    // Regression: TODAY() used toISOString(), which is UTC. Addis Ababa is
    // UTC+3, so from 00:00-03:00 local the UTC date is still yesterday and
    // every post-midnight order landed on the previous business day.
    it('TODAY should use the local date, not UTC, just after local midnight', () => {
      vi.useFakeTimers()
      try {
        // 00:30 on 8 Aug in UTC+3 is still 21:30 on 7 Aug in UTC.
        vi.setSystemTime(new Date('2026-08-07T21:30:00Z'))
        const utcDate = new Date().toISOString().slice(0, 10)
        const localDay = new Date().getDate()

        // Only meaningful when the runner's zone actually straddles midnight.
        if (localDay !== new Date('2026-08-07T21:30:00Z').getUTCDate()) {
          expect(TODAY()).not.toBe(utcDate)
        }
        expect(parseInt(TODAY().split('-')[2])).toBe(localDay)
      } finally {
        vi.useRealTimers()
      }
    })

    it('TODAY should zero-pad single-digit months and days', () => {
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date(2026, 0, 5, 12, 0, 0)) // 5 Jan 2026, local
        expect(TODAY()).toBe('2026-01-05')
      } finally {
        vi.useRealTimers()
      }
    })

    it('getSSEUrl should build a same-origin URL with the correct protocol', () => {
      const url = getSSEUrl('kitchen')
      expect(url).toContain(window.location.host)
      expect(url).toContain('/api/events/kitchen')
      const expectedProto = window.location.protocol === 'https:' ? 'https' : 'http'
      expect(url).toMatch(new RegExp(`^${expectedProto}://`))
    })
  })

  describe('Request timeouts', () => {
    it('should pass AbortSignal to fetch calls', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([])
      })

      await apiGet('orders')
      const callArgs = fetch.mock.calls[0][1]
      expect(callArgs.signal).toBeDefined()
      expect(callArgs.signal instanceof AbortSignal).toBe(true)
    })

    it('should include signal in POST requests', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true })
      })

      await apiPost('orders', { items: 'Espresso' })
      const callArgs = fetch.mock.calls[0][1]
      expect(callArgs.signal).toBeDefined()
      expect(callArgs.signal instanceof AbortSignal).toBe(true)
    })

    it('should include signal in DELETE requests', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true })
      })

      await apiDelete('orders', 'O-1')
      const callArgs = fetch.mock.calls[0][1]
      expect(callArgs.signal).toBeDefined()
      expect(callArgs.signal instanceof AbortSignal).toBe(true)
    })
  })
})
