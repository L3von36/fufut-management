import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * A refusal is not an outage — the write path.
 *
 * The read path already rethrew server refusals (api-refusal.test.js). The
 * write paths did not: apiPut caught the 409 a waiter's table claim earned,
 * queued the refused write as though the tablet were offline, and answered
 * the caller with `{ ok: true, _offline: true }`. The caller believed the
 * claim succeeded, the kitchen cooked, and a write the server had refused
 * replayed every sync cycle forever.
 *
 * Same session, three failures hiding behind one catch:
 *   1. the caller is told a refusal is a success,
 *   2. the refused write is queued and replayed forever,
 *   3. tryFetch retried the thrown HTTP error as though it were a network
 *      hiccup — three identical failing PUTs and 1.5s of dead air before the
 *      waiter's error toast even appeared.
 */

vi.mock('../../src/db', () => ({
  dbGetAll: vi.fn(async () => []),
  dbCacheAll: vi.fn(async () => {}),
  dbClearCaches: vi.fn(async () => {}),
  queueMutation: vi.fn(async () => {}),
}))

let apiPut, apiPost, apiPatch, apiDelete, queueMutation

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('navigator', { onLine: true })
  ;({ apiPut, apiPost, apiPatch, apiDelete } = await import('../../src/api'))
  ;({ queueMutation } = await import('../../src/db'))
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** A server that answered, and said no, with a JSON reason. */
function refuses(status, error = 'Table 3 already has a party seated.') {
  return vi.fn(async () => ({
    ok: false,
    status,
    headers: { get: () => 'application/json' },
    json: async () => ({ ok: false, error }),
  }))
}

/** No answer at all — the network is down. */
function dead() {
  return vi.fn(async () => { throw new TypeError('Failed to fetch') })
}

describe('a write the server refused', () => {
  it.each([['apiPut', (d) => apiPut('tables/T3', d)], ['apiPost', (d) => apiPost('orders', d)], ['apiPatch', (d) => apiPatch('orders/O1/items', d)], ['apiDelete', (d) => apiDelete('expenses/E1', d)]])(
    '%s surfaces the refusal instead of a fake offline success',
    async (_name, call) => {
      vi.stubGlobal('fetch', refuses(409))
      await expect(call({ x: 1 })).rejects.toMatchObject({ status: 409 })
      expect(queueMutation).not.toHaveBeenCalled()
    }
  )

  it.each([400, 401, 403, 404, 422])('a %d refusal is never queued', async (status) => {
    vi.stubGlobal('fetch', refuses(status))
    await expect(apiPut('tables/T3', { status: 'occupied' })).rejects.toMatchObject({ status })
    expect(queueMutation).not.toHaveBeenCalled()
  })

  it('carries the server\'s explanation so the toast can say something useful', async () => {
    vi.stubGlobal('fetch', refuses(409))
    const err = await apiPut('tables/T3', { status: 'occupied' }).catch((e) => e)
    expect(err.message).toContain('already has a party seated')
    expect(err.httpError).toBe(true)
  })
})

describe('a write with no network', () => {
  it('is still queued for the sync engine, and answers optimistic success', async () => {
    vi.stubGlobal('fetch', dead())
    await expect(apiPut('tables/T3', { status: 'occupied' })).resolves.toMatchObject({ ok: true, _offline: true })
    expect(queueMutation).toHaveBeenCalledWith('PUT', 'tables/T3', { status: 'occupied' })
  })

  it('POST still queues (the capability this layer exists for)', async () => {
    vi.stubGlobal('fetch', dead())
    const res = await apiPost('orders', { total: 100 })
    expect(res._offline).toBe(true)
    expect(queueMutation).toHaveBeenCalledWith('POST', 'orders', { total: 100 })
  })
})

describe('retrying', () => {
  it('does not retry a refused write — the server already answered', async () => {
    const fetchMock = refuses(409)
    vi.stubGlobal('fetch', fetchMock)
    await expect(apiPut('tables/T3', { status: 'occupied' })).rejects.toMatchObject({ status: 409 })
    // Exactly one request: the old catch block re-caught the thrown HTTP error
    // and replayed it twice with backoff — three failing writes per tap.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('still retries a genuine network failure', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)
    await expect(apiPut('tables/T3', { status: 'occupied' })).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
