import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * A refusal is not an outage.
 *
 * The till caches every list it reads so it can keep working without a line.
 * The cache is keyed by endpoint alone — `staff`, `orders` — with no record of
 * who read it, which is fine while it only ever answers for the person who
 * filled it.
 *
 * It stopped being fine because `apiGet` fell back to that cache on *any*
 * error. The server refuses a cleaner's request for /api/staff with a 403,
 * correctly; the client caught the error, decided it must be offline, and
 * handed back the staff list the manager had loaded on that same tablet an hour
 * earlier. Role enforcement was working perfectly and the screen showed the
 * data regardless.
 *
 * The fix is one distinction: a reply carries a status, a dead network does
 * not.
 */

const cached = { staff: [{ id: 'S1', firstName: 'Manager', lastName: 'Cached' }] }

vi.mock('../../src/db', () => ({
  dbGetAll: vi.fn(async (store) => cached[store] || []),
  dbCacheAll: vi.fn(async () => {}),
  dbClearCaches: vi.fn(async () => {}),
  queueMutation: vi.fn(async () => {}),
}))

let apiGet
let dbGetAll

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('navigator', { onLine: true })
  ;({ apiGet } = await import('../../src/api'))
  ;({ dbGetAll } = await import('../../src/db'))
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** A server that answered, and said no. */
function refuses(status) {
  return vi.fn(async () => ({
    ok: false,
    status,
    headers: { get: () => 'application/json' },
    json: async () => ({ error: 'Forbidden' }),
  }))
}

describe('a role the server refuses', () => {
  it('does not get the previous user\'s cached list', async () => {
    vi.stubGlobal('fetch', refuses(403))

    await expect(apiGet('staff')).rejects.toMatchObject({ status: 403 })
    expect(dbGetAll).not.toHaveBeenCalled()
  })

  it('is refused the same way when the session has ended', async () => {
    vi.stubGlobal('fetch', refuses(401))

    await expect(apiGet('orders')).rejects.toMatchObject({ status: 401 })
    expect(dbGetAll).not.toHaveBeenCalled()
  })

  it('still gets a 404 rather than stale data', async () => {
    vi.stubGlobal('fetch', refuses(404))
    await expect(apiGet('staff')).rejects.toMatchObject({ status: 404 })
  })
})

describe('a till with no line', () => {
  it('still reads from the cache', async () => {
    // The capability all of this exists to protect: no reply at all, so the
    // cached list is the right answer.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))

    await expect(apiGet('staff')).resolves.toEqual(cached.staff)
    expect(dbGetAll).toHaveBeenCalledWith('staff')
  })

  it('reports the failure when the cache is empty too', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))

    await expect(apiGet('cashdrawers')).rejects.toThrow()
  })
})
