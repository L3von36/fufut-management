// SSE connection for real-time kitchen & table events
import { ref, onUnmounted } from 'vue'
import { getSSEUrl } from '../api'

const MAX_RECONNECT_DELAY = 30000
const INITIAL_RECONNECT_DELAY = 1000

/**
 * The API's quota circuit breaker mode, shared by EVERY useSSE instance via
 * module scope — one EventSource per screen, one truth. The server emits
 * `quota_mode` the moment degradation starts or ends, and `connected` already
 * carries the current mode on first attach, so a tablet that mounts mid-
 * emergency learns it without waiting for the next transition. Boards read
 * this to explain why live updates slowed — the one case where silently
 * freezing is worse than telling the room.
 */
const quotaMode = ref('normal')

export function useSSE() {
  const connected = ref(false)
  const lastEvent = ref(null)
  let eventSource = null
  let listeners = {}
  let reconnectTimer = null
  let reconnectDelay = INITIAL_RECONNECT_DELAY
  let currentEventPath = null
  let intentionalClose = false

  function connect(eventPath) {
    if (eventSource) disconnect()
    if (!eventPath) throw new Error('useSSE: eventPath is required (e.g. "kitchen")')

    // Live updates are an enhancement, not a prerequisite for the screen. Where
    // EventSource does not exist this threw inside the caller's mounted hook and
    // took the rest of the hook with it, so the page came up half-initialised.
    // Callers keep their own refresh path; they simply do not get pushed to.
    if (typeof EventSource === 'undefined') return

    currentEventPath = eventPath
    intentionalClose = false
    reconnectDelay = INITIAL_RECONNECT_DELAY

    const url = getSSEUrl(eventPath)
    eventSource = new EventSource(url)

    eventSource.onopen = () => {
      connected.value = true
      reconnectDelay = INITIAL_RECONNECT_DELAY
    }

    eventSource.onerror = () => {
      connected.value = false
      eventSource.close()
      eventSource = null
      scheduleReconnect()
    }

    eventSource.addEventListener('new_order', (e) => {
      try {
        const data = JSON.parse(e.data)
        lastEvent.value = { type: 'new_order', data }
        if (listeners['new_order']) listeners['new_order'].forEach(fn => fn(data))
      } catch (err) {
        console.warn('SSE: failed to parse new_order event', err)
      }
    })

    eventSource.addEventListener('order_update', (e) => {
      try {
        const data = JSON.parse(e.data)
        lastEvent.value = { type: 'order_update', data }
        if (listeners['order_update']) listeners['order_update'].forEach(fn => fn(data))
      } catch (err) {
        console.warn('SSE: failed to parse order_update event', err)
      }
    })

    eventSource.addEventListener('table_update', (e) => {
      try {
        const data = JSON.parse(e.data)
        lastEvent.value = { type: 'table_update', data }
        if (listeners['table_update']) listeners['table_update'].forEach(fn => fn(data))
      } catch (err) {
        console.warn('SSE: failed to parse table_update event', err)
      }
    })

    eventSource.addEventListener('alerts_update', (e) => {
      try {
        const data = JSON.parse(e.data)
        lastEvent.value = { type: 'alerts_update', data }
        if (listeners['alerts_update']) listeners['alerts_update'].forEach(fn => fn(data))
      } catch (err) {
        console.warn('SSE: failed to parse alerts_update event', err)
      }
    })

    // First attach: the server states the channel's mode alongside the hello.
    eventSource.addEventListener('connected', (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data && data.mode) quotaMode.value = data.mode
      } catch (err) {
        console.warn('SSE: failed to parse connected event', err)
      }
    })

    // Degradation ladder transitions (normal/conserve/emergency/critical).
    // Emitted on start AND on the way back down, so the notice clears itself.
    eventSource.addEventListener('quota_mode', (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data && data.mode) quotaMode.value = data.mode
        lastEvent.value = { type: 'quota_mode', data }
        if (listeners['quota_mode']) listeners['quota_mode'].forEach(fn => fn(data))
      } catch (err) {
        console.warn('SSE: failed to parse quota_mode event', err)
      }
    })
  }

  function scheduleReconnect() {
    if (intentionalClose || !currentEventPath) return
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(() => {
      connect(currentEventPath)
    }, reconnectDelay)
    // Exponential backoff
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY)
  }

  function disconnect() {
    intentionalClose = true
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    connected.value = false
  }

  function on(eventType, fn) {
    if (!listeners[eventType]) listeners[eventType] = []
    listeners[eventType].push(fn)
    return () => {
      listeners[eventType] = listeners[eventType].filter(f => f !== fn)
    }
  }

  // Auto-cleanup on component unmount if used in setup()
  onUnmounted(() => {
    disconnect()
  })

  return { connected, lastEvent, connect, disconnect, on, quotaMode }
}
