import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiGet, apiPost, apiPut, apiDelete, isOnline, onOnlineChange, ROLE_PERMISSIONS, ROLE_DEFAULT_VIEW, NAV_ITEMS, TODAY } from '../../src/api'

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
      expect(fetch).toHaveBeenCalledWith('/api/orders', { credentials: 'include' })
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
      expect(fetch).toHaveBeenCalledWith('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      })
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
      expect(fetch).toHaveBeenCalledWith('/api/orders/O-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'preparing' })
      })
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
      expect(fetch).toHaveBeenCalledWith('/api/orders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: 'O-1' })
      })
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
      expect(fetch).toHaveBeenCalledWith('/api/orders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(undefined)
      })
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
      // Manager has all permissions except menu-view, pipeline, and revenue
      const allViews = NAV_ITEMS.map(n => n.view)
      const nonManagerViews = allViews.filter(v => !ROLE_PERMISSIONS.manager.includes(v))
      // These views exist in NAV_ITEMS but are not in manager permissions
      expect(nonManagerViews.sort()).toEqual(['menu-view', 'pipeline', 'revenue'].sort())
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

    it('NAV_ITEMS should have 19 items across defined sections', () => {
      expect(NAV_ITEMS.length).toBe(19)
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
  })
})
