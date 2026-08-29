// Service Worker for FU FUT POS — offline-first with sync queue
// Bumped to v5 to evict caches poisoned by the bug fixed in cacheFirst() below:
// a stylesheet entry holding SPA-fallback HTML. `activate` deletes every cache
// whose name is not CACHE, so bumping this is what heals devices already stuck
// on a blank screen — staff cannot be asked to clear site data mid-service.
//
// v5 also rolls out the non-GET pass-through fix in the fetch handler: any
// POST/PUT/DELETE that isn't an /api/ write (e.g. the Cloudflare Web Analytics
// beacon POSTing to /cdn-cgi/rum on every Settle click) used to land in
// cacheFirst, where cache.put() throws "Request method POST is unsupported".
const CACHE = 'fufut-pos-v5'
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

  // Non-GET requests that fell through here cannot be cached — the Cache API
  // only accepts GET. The Cloudflare Web Analytics beacon (auto-injected on
  // Pages) POSTs to /cdn-cgi/rum on every navigation; without this guard it
  // landed in cacheFirst and threw `Failed to execute 'put' on 'Cache':
  // Request method POST is unsupported` every time the cashier clicked Settle
  // on the Open Checks table. Pass writes straight to the network.
  if (e.request.method !== 'GET') {
    e.respondWith(networkOnly(e.request))
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

/**
 * A missing asset does not 404 here — Pages answers with the SPA shell, i.e.
 * **HTML with status 200**. Caching that under a .js/.css URL poisons the entry
 * permanently, because cacheFirst never revalidates. That is exactly what took
 * the Tables page down: a stylesheet entry holding an HTML document, so the
 * route's dynamic import rejected and the screen stayed blank.
 *
 * So: never store an HTML response for a request that did not ask for a page.
 */
function isSpaFallback(req, res) {
  if (req.mode === 'navigate' || req.destination === 'document') return false
  const type = res.headers.get('Content-Type') || ''
  return type.includes('text/html')
}

async function cacheFirst(req) {
  // Defense in depth: the fetch handler already routes non-GET requests away
  // from here, but the Cache API spec rejects anything but GET with a
  // TypeError. If a future change reopens that path, this guard keeps the SW
  // from crashing mid-shift instead of leaving the cashier on a blank screen.
  if (req.method !== 'GET') {
    try { return await fetch(req) } catch { return new Response('Offline', { status: 503 }) }
  }
  const cached = await caches.match(req)
  // Self-heal: if a previous version stored a fallback page here, drop it and
  // go back to the network rather than serving HTML as a script or stylesheet.
  if (cached) {
    if (!isSpaFallback(req, cached)) return cached
    const cache = await caches.open(CACHE)
    await cache.delete(req)
  }
  try {
    const res = await fetch(req)
    if (res.ok && !isSpaFallback(req, res)) {
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
