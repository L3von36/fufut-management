// SSE connection for real-time kitchen & table events
import { ref } from 'vue'
import { API } from '../api'

const MAX_RECONNECT_DELAY = 30000
const INITIAL_RECONNECT_DELAY = 1000

function buildSSEUrl(eventPath) {
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'https' : 'http'
    return `${proto}://${window.location.host}/api/events/${eventPath}`
  }
  // Fallback for SSR or test environments
  const base = API || 'http://localhost:3000'
  return `${base}/api/events/${eventPath}`
}

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

    currentEventPath = eventPath
    intentionalClose = false
    reconnectDelay = INITIAL_RECONNECT_DELAY

    const url = buildSSEUrl(eventPath)
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
  }

  function scheduleReconnect() {
    if (intentionalClose || !currentEventPath) return
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(() => {
      connect(currentEventPath)
    }, reconnectDelay)
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

  return { connected, lastEvent, connect, disconnect, on }
}
