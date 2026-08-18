// IndexedDB wrapper for offline data + sync queue
const DB_NAME = 'fufut-pos'
const DB_VERSION = 1
const SYNC_STORE = 'sync_queue'

/**
 * The read caches, as opposed to the sync queue.
 *
 * Named once so signing out can empty them. A till is a shared device: the
 * cached lists belong to whoever was signed in, and leaving them for the next
 * person is how one shift's data reaches the next one's screen.
 *
 * The sync queue is deliberately NOT in this list. It holds writes that have
 * not reached the server yet, and those are the venue's orders — clearing them
 * on sign-out would throw away work the person had every reason to believe was
 * saved.
 */
export const CACHE_STORES = [
  'orders', 'menu', 'inventory', 'staff', 'tables', 'expenses',
  'reservations', 'delivery', 'waste', 'shifts', 'timeclock', 'cashdrawers',
]

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      // Data stores for offline reads
      for (const store of CACHE_STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'id' })
        }
      }
      // Sync queue for failed writes
      if (!db.objectStoreNames.contains(SYNC_STORE)) {
        const s = db.createObjectStore(SYNC_STORE, { keyPath: 'id', autoIncrement: true })
        s.createIndex('timestamp', 'timestamp')
      }
    }
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror = (e) => reject(e.target.error)
  })
}

async function withStore(storeName, mode, cb) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const store = tx.objectStore(storeName)
    const result = cb(store)
    if (result && typeof result.onsuccess === 'function') {
      // IDBRequest — wait for it to complete and resolve with actual data
      result.onsuccess = () => resolve(result.result)
      result.onerror = (e) => reject(e.target.error)
    } else {
      // Not an IDBRequest (e.g., undefined for bulk operations)
      tx.oncomplete = () => resolve(result)
      tx.onerror = (e) => reject(e.target.error)
    }
  })
}

// Read operations
export async function dbGetAll(store) {
  return withStore(store, 'readonly', (s) => {
    const r = s.getAll()
    return r
  })
}

export async function dbGet(store, id) {
  return withStore(store, 'readonly', (s) => {
    const r = s.get(id)
    return r
  })
}

// Write operations (for caching reads locally)
export async function dbPut(store, data) {
  return withStore(store, 'readwrite', (s) => s.put(data))
}

export async function dbDelete(store, id) {
  return withStore(store, 'readwrite', (s) => s.delete(id))
}

export async function dbClear(store) {
  return withStore(store, 'readwrite', (s) => s.clear())
}

// Bulk update cache from API response
export async function dbCacheAll(store, items) {
  return withStore(store, 'readwrite', (s) => {
    s.clear()
    for (const item of items) {
      s.put(item)
    }
  })
}

// Sync queue operations
/**
 * Empty every read cache, leaving the sync queue alone.
 *
 * Called when a session ends, so a tablet handed to the next member of staff
 * carries none of the previous one's data.
 */
export async function dbClearCaches() {
  await Promise.all(CACHE_STORES.map((store) => dbClear(store).catch(() => {})))
}

export async function queueMutation(method, endpoint, body) {
  return withStore(SYNC_STORE, 'readwrite', (s) => {
    return s.add({ method, endpoint, body, timestamp: Date.now(), retries: 0 })
  })
}

export async function getPendingMutations() {
  return withStore(SYNC_STORE, 'readonly', (s) => {
    const items = s.getAll()
    return items
  })
}

export async function removeMutation(id) {
  return withStore(SYNC_STORE, 'readwrite', (s) => s.delete(id))
}

export async function clearSyncQueue() {
  return withStore(SYNC_STORE, 'readwrite', (s) => s.clear())
}

export async function getSyncQueueLength() {
  const items = await getPendingMutations()
  return items?.length || 0
}
