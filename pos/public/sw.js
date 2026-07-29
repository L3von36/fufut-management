// Service Worker for FU FUT POS — offline-first with sync queue
const CACHE = 'fufut-pos-v1'
const STATIC_ASSETS = [
  '/pos/',
  '/pos/index.html',
  '/pos/assets/logo.webp',
  '/pos/favicon.svg'
]

// Install: precache static assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  )
})

// Activate: clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  )
})

// Network-first for API, cache-first for static assets
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)

  // API calls — network first, cache fallback for GETs
  if (url.pathname.startsWith('/api/')) {
    if (e.request.method === 'GET') {
      e.respondWith(networkFirst(e.request))
    } else {
      // Writes: try network, if offline the client queues it
      e.respondWith(networkOnly(e.request))
    }
    return
  }

  // Static assets — cache first
  e.respondWith(cacheFirst(e.request))
})

async function networkFirst(req) {
  try {
    const res = await fetch(req)
    // Cache successful GET responses
    if (res.ok) {
      const cache = await caches.open(CACHE)
      cache.put(req, res.clone())
    }
    return res
  } catch {
    const cached = await caches.match(req)
    if (cached) return cached
    return new Response(JSON.stringify({ ok: false, offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req)
  if (cached) return cached
  try {
    const res = await fetch(req)
    if (res.ok) {
      const cache = await caches.open(CACHE)
      cache.put(req, res.clone())
    }
    return res
  } catch {
    return new Response('Offline', { status: 503 })
  }
}

async function networkOnly(req) {
  try {
    return await fetch(req)
  } catch {
    return new Response(JSON.stringify({ ok: false, offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
