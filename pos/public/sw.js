// Service Worker for FU FUT POS — offline-first with sync queue
const CACHE = 'fufut-pos-v3'
// Built with `--base /`, so these live at the site root. '/pos/*' paths only
// hit the SPA fallback and would silently precache HTML in place of assets.
const STATIC_ASSETS = [
  '/pos/',
  '/assets/logo.webp',
  '/favicon.svg'
]

// Install: precache static assets. Individually, so one missing file cannot
// abort the whole install the way cache.addAll() does.
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(
        STATIC_ASSETS.map((url) => c.add(url).catch(() => {}))
      ))
      .then(() => self.skipWaiting())
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

  // Page loads — network first. Cache-first here would pin staff to the app
  // shell from an old deploy, which then requests asset hashes that no longer
  // exist and leaves them on a blank screen until the cache is cleared.
  if (e.request.mode === 'navigate') {
    e.respondWith(navigationFirst(e.request))
    return
  }

  // Hashed/static assets — cache first
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

// Page loads: always prefer the network so deploys land immediately, but fall
// back to the cached app shell so the POS still opens on a dead connection.
async function navigationFirst(req) {
  try {
    const res = await fetch(req)
    if (res.ok) {
      const cache = await caches.open(CACHE)
      cache.put('/pos/', res.clone())
    }
    return res
  } catch {
    const cached = await caches.match('/pos/') || await caches.match(req)
    if (cached) return cached
    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
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
