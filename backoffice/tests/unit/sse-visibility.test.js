// Visibility-aware SSE connection management (commit 2b5ea27, backoffice variant).
//
// Backoffice contract differs from pos in one way: there is no onUnmounted
// binding here — cleanup is driven by the CALLER through disconnect(), which
// is wrapped to permanently remove the visibilitychange listener. These tests
// pin both halves of that contract.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createApp, h } from 'vue'
import { useSSE } from '../../src/composables/useSSE'

class MockEventSource {
  constructor(url) {
    this.url = url
    this.closed = false
    this.onopen = null
    this.onerror = null
    MockEventSource.instances.push(this)
  }
  addEventListener() {}
  close() {
    this.closed = true
  }
}

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    configurable: true,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

function mountWithSSE() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let api
  const app = createApp({
    setup() {
      api = useSSE()
      return () => h('div')
    },
  })
  app.mount(container)
  return {
    api,
    unmount() {
      app.unmount()
      container.remove()
    },
  }
}

describe('backoffice useSSE visibility-aware connection management', () => {
  beforeEach(() => {
    MockEventSource.instances = []
    vi.stubGlobal('EventSource', MockEventSource)
    vi.useFakeTimers()
    setVisibility('visible')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('opens one EventSource per connect() with the channel URL', () => {
    const { api, unmount } = mountWithSSE()
    api.connect('kitchen')
    expect(MockEventSource.instances).toHaveLength(1)
    expect(MockEventSource.instances[0].url).toContain('/api/events/kitchen')
    unmount()
  })

  it('hidden closes the stream and drops the connected flag', () => {
    const { api, unmount } = mountWithSSE()
    api.connect('kitchen')
    const es = MockEventSource.instances[0]
    es.onopen()
    expect(api.connected.value).toBe(true)

    setVisibility('hidden')
    expect(es.closed).toBe(true)
    expect(api.connected.value).toBe(false)
    unmount()
  })

  it('hidden cancels a pending reconnect timer', () => {
    const { api, unmount } = mountWithSSE()
    api.connect('kitchen')
    MockEventSource.instances[0].onerror() // schedules reconnect (fake clock)

    setVisibility('hidden')
    vi.advanceTimersByTime(60_000)

    expect(MockEventSource.instances).toHaveLength(1) // nothing recreated while asleep
    unmount()
  })

  it('visible reconnects instantly to the same channel', () => {
    const { api, unmount } = mountWithSSE()
    api.connect('kitchen')
    setVisibility('hidden')
    setVisibility('visible')

    expect(MockEventSource.instances).toHaveLength(2)
    expect(MockEventSource.instances[1].url).toContain('/api/events/kitchen')

    MockEventSource.instances[1].onopen()
    expect(api.connected.value).toBe(true)
    unmount()
  })

  it('survives repeated lock/unlock cycles, reconnecting on every wake', () => {
    const { api, unmount } = mountWithSSE()
    api.connect('kitchen') // #1
    setVisibility('hidden')
    setVisibility('visible') // #2
    setVisibility('hidden')
    setVisibility('visible') // #3
    setVisibility('hidden')
    setVisibility('visible') // #4

    expect(MockEventSource.instances).toHaveLength(4)
    unmount()
  })

  it('intentional disconnect stays disconnected across visibility flips', () => {
    const { api, unmount } = mountWithSSE()
    api.connect('kitchen')
    api.disconnect()

    setVisibility('hidden')
    setVisibility('visible')
    setVisibility('hidden')
    setVisibility('visible')

    expect(MockEventSource.instances).toHaveLength(1)
    unmount()
  })

  it('disconnect() permanently removes the visibility listener (explicit teardown contract)', () => {
    const { api, unmount } = mountWithSSE()
    api.connect('kitchen')
    api.disconnect()

    setVisibility('hidden')
    setVisibility('visible')
    expect(MockEventSource.instances).toHaveLength(1)

    // New session on the same composable instance...
    api.connect('kitchen')
    const second = MockEventSource.instances[1]
    second.onopen()
    expect(api.connected.value).toBe(true)

    // ...must NOT be touched by visibility flips: the listener was removed at
    // disconnect(), not merely paused. If it leaked, this hidden flip would
    // force-close the fresh stream.
    setVisibility('hidden')
    expect(second.closed).toBe(false)
    expect(api.connected.value).toBe(true)
    unmount()
  })
})
