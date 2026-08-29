import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The sync engine replays queued writes every 30s while the tablet is online.
 * A write the server refuses (409 the table is taken, 400 the payload is
 * wrong) produces the same refusal on every replay, and fetch does not throw
 * on an HTTP status — so the retry counter, which lives in the catch block,
 * never counted them. A refused write stayed in the queue forever, replaying
 * every cycle, inflating the pending count an operator watches.
 */

const items = new Map()
let nextId = 1

vi.mock('../../src/db', () => ({
  getPendingMutations: vi.fn(async () => [...items.values()]),
  removeMutation: vi.fn(async (id) => { items.delete(id) }),
  getSyncQueueLength: vi.fn(async () => items.size),
  clearSyncQueue: vi.fn(async () => items.clear()),
}))

const online = vi.fn(() => true)
let onlineListeners = []
vi.mock('../../src/api', () => ({
  isOnline: () => online(),
  onOnlineChange: (cb) => { onlineListeners.push(cb) },
}))

let useSync

beforeEach(async () => {
  vi.resetModules()
  items.clear()
  nextId = 1
  online.mockReturnValue(true)
  onlineListeners = []
  ;({ useSync } = await import('../../src/composables/useSync'))
})

function enqueue(method, endpoint, body) {
  items.set(nextId, { id: nextId, method, endpoint, body, timestamp: Date.now(), retries: 0 })
  return nextId++
}

describe('replaying a refused write', () => {
  it('drops a 409 from the queue instead of replaying it forever', async () => {
    const id = enqueue('PUT', 'tables/T3', { status: 'occupied' })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 409,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: false, error: 'Table 3 already has a party seated.' }),
    })))

    const { processQueue } = useSync()
    await processQueue()
    expect(items.has(id)).toBe(false)
  })

  it.each([400, 401, 403, 422])('drops a %d the same way', async (status) => {
    const id = enqueue('POST', 'orders', { total: 1 })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status, json: async () => ({}) })))

    const { processQueue } = useSync()
    await processQueue()
    expect(items.has(id)).toBe(false)
  })

  it('keeps a 503 — the server is struggling, not refusing', async () => {
    const id = enqueue('POST', 'orders', { total: 1 })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })))

    const { processQueue } = useSync()
    await processQueue()
    expect(items.has(id)).toBe(true)
  })

  it('keeps a network failure for the next cycle', async () => {
    const id = enqueue('PUT', 'tables/T3', { status: 'occupied' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))

    const { processQueue } = useSync()
    await processQueue()
    expect(items.has(id)).toBe(true)
    expect(items.get(id).retries).toBe(1)
  })

  it('removes a write the server accepts, as before', async () => {
    const id = enqueue('PUT', 'tables/T3', { status: 'occupied' })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) })))

    const { processQueue } = useSync()
    await processQueue()
    expect(items.has(id)).toBe(false)
  })
})
