// SSE connection for real-time kitchen & table events
import { ref, onMounted, onUnmounted } from 'vue'

export function useSSE() {
  const connected = ref(false)
  const lastEvent = ref(null)
  let eventSource = null
  const listeners = {}

  function connect(url = 'http://localhost:3000/api/events/kitchen') {
    if (eventSource) disconnect()
    eventSource = new EventSource(url)

    eventSource.onopen = () => { connected.value = true }

    eventSource.onerror = () => { connected.value = false }

    eventSource.addEventListener('new_order', (e) => {
      try {
        const data = JSON.parse(e.data)
        lastEvent.value = { type: 'new_order', data }
        if (listeners['new_order']) listeners['new_order'].forEach(fn => fn(data))
      } catch {}
    })

    eventSource.addEventListener('order_update', (e) => {
      try {
        const data = JSON.parse(e.data)
        lastEvent.value = { type: 'order_update', data }
        if (listeners['order_update']) listeners['order_update'].forEach(fn => fn(data))
      } catch {}
    })

    eventSource.addEventListener('table_update', (e) => {
      try {
        const data = JSON.parse(e.data)
        lastEvent.value = { type: 'table_update', data }
        if (listeners['table_update']) listeners['table_update'].forEach(fn => fn(data))
      } catch {}
    })
  }

  function disconnect() {
    if (eventSource) {
      eventSource.close()
      eventSource = null
      connected.value = false
    }
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
