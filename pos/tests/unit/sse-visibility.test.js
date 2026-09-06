// Visibility-aware SSE connection management (commit 2b5ea27).
//
// Contract under test: a hidden screen (tablet locked, app backgrounded) must
// RELEASE its Worker connection — EventSource closed AND any pending reconnect
// timer cancelled — and a returning screen must reconnect immediately. An
// intentionally disconnected screen must stay disconnected no matter how the
// tab flickers. Every idle tablet this keeps offline is a Worker connection
// slot and SSE tick cost saved.
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

// useSSE registers cleanup via onUnmounted, which only binds inside a real
// component instance — so the tests mount a minimal host component.
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

describe('useSSE visibility-aware connection management', () => {
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

  it('hidden cancels a pending reconnect timer (no ghost reconnect while asleep)', () => {
    const { api, unmount } = mountWithSSE()
    api.connect('kitchen')
    MockEventSource.instances[0].onerror() // schedules reconnect in 1s (fake clock)

    setVisibility('hidden') // must cancel that pending timer
    vi.advanceTimersByTime(60_000)

    expect(MockEventSource.instances).toHaveLength(1) // nothing recreated
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
    api.disconnect() // staff signed out — the stream must stay down

    setVisibility('hidden')
    setVisibility('visible')
    setVisibility('hidden')
    setVisibility('visible')

    expect(MockEventSource.instances).toHaveLength(1)
    unmount()
  })

  it('unmount removes the visibility listener (no handler leaks across screens)', () => {
    const { api, unmount } = mountWithSSE()
    api.connect('kitchen')
    unmount() // onUnmounted -> removeEventListener + disconnect

    // A fresh connect would normally be killed by a later hidden flip if the
    // listener had leaked — but after unmount nothing may react at all.
    setVisibility('hidden')
    setVisibility('visible')
    expect(MockEventSource.instances).toHaveLength(1)
  })
})
