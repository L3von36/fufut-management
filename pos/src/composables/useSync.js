// Sync engine: replays queued mutations when back online
import { ref } from 'vue'
import { getPendingMutations, removeMutation, getSyncQueueLength, clearSyncQueue } from '../db'
import { isOnline, onOnlineChange } from '../api'

const pendingCount = ref(0)
const syncing = ref(false)

// Update counter periodically
async function refreshCount() {
  pendingCount.value = await getSyncQueueLength()
}

async function processQueue() {
  if (syncing.value) return
  syncing.value = true
  try {
    const queue = await getPendingMutations()
    if (!queue?.length) { syncing.value = false; return }

    for (const item of queue) {
      try {
        const url = `/api/${item.endpoint}`
        const opts = {
          method: item.method,
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: item.body ? JSON.stringify(item.body) : undefined
        }
        // For DELETE with body containing id, use URL pattern
        let fetchUrl = url
        if (item.method === 'DELETE' && item.body?.id) {
          fetchUrl = `${url}/${item.body.id}`
        }
        const r = await fetch(fetchUrl, opts)
        if (r.ok || r.status === 404) {
          await removeMutation(item.id)
        }
      } catch (e) {
        item.retries = (item.retries || 0) + 1
        if (item.retries >= 10) await removeMutation(item.id) // give up after 10 tries
      }
    }
    await refreshCount()
  } finally {
    syncing.value = false
  }
}

export function useSync() {
  // Auto-process when coming online
  onOnlineChange((online) => {
    if (online) processQueue()
  })

  // Periodic check
  let interval = null
  function start() {
    refreshCount()
    interval = setInterval(() => {
      if (isOnline()) processQueue()
      refreshCount()
    }, 30000)
  }
  function stop() {
    if (interval) clearInterval(interval)
  }

  return {
    pendingCount,
    syncing,
    processQueue,
    refreshCount,
    start,
    stop
  }
}
