// Default to a same-origin path so the Pages Function (functions/api/[[path]].js)
// proxies the request server-side. This keeps the session cookie first-party and
// avoids third-party cookie blocking in modern browsers. VITE_API_URL can still
// override at build time for local dev (vite.config.js has a /api proxy) or for
// pointing at a different API host during debugging.
export const API = import.meta.env.VITE_API_URL || ''

export async function apiGet(endpoint) {
  const r = await fetch(`${API}/api/${endpoint}`, { credentials: 'include' })
  if (!r.ok) throw new Error(`GET ${endpoint} ${r.status}`)
  return r.json()
}
export async function apiPost(endpoint, data) {
  const r = await fetch(`${API}/api/${endpoint}`, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body:JSON.stringify(data) })
  if (!r.ok) throw new Error(`POST ${endpoint} ${r.status}`)
  return r.json()
}
export async function apiPut(endpoint, data) {
  const r = await fetch(`${API}/api/${endpoint}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'include', body:JSON.stringify(data) })
  if (!r.ok) throw new Error(`PUT ${endpoint} ${r.status}`)
  return r.json()
}
export async function apiDelete(endpoint) {
  const r = await fetch(`${API}/api/${endpoint}`, { method:'DELETE', headers:{'Content-Type':'application/json'}, credentials:'include' })
  if (!r.ok) throw new Error(`DELETE ${endpoint} ${r.status}`)
  return r.json()
}
/**
 * Upload a file to /api/upload with real progress via XHR (fetch can't observe
 * upload progress). onProgress receives a percentage 0–100.
 */
export function apiUpload(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const form = new FormData()
    form.append('file', file)

    xhr.open('POST', `${API}/api/upload`)
    xhr.withCredentials = true

    if (typeof onProgress === 'function' && xhr.upload) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress((e.loaded / e.total) * 100)
        }
      })
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) // { ok, url, key }
          if (data.url && data.url.includes('images.futfutcoffee.com')) {
            const key = data.key || data.url.split('images.futfutcoffee.com/')[1]
            data.url = `${API}/api/images/${key}`
          }
          resolve(data)
        } catch (e) {
          reject(new Error('Invalid response from server'))
        }
      } else {
        let msg = `Upload failed ${xhr.status}`
        try {
          const err = JSON.parse(xhr.responseText)
          if (err.error) msg = err.error
        } catch {}
        reject(new Error(msg))
      }
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.onabort = () => reject(new Error('Upload aborted'))
    xhr.send(form)
  })
}

export const NAV_ITEMS = [
  { view: 'orders', label: 'Orders', icon: 'clipboard', section: 'Sales' },
  { view: 'reservations', label: 'Reservations', icon: 'calendar', section: 'Sales' },
  { view: 'landing', label: 'Landing Page', icon: 'layout', section: 'Content' },
  { view: 'menu', label: 'Menu', icon: 'book', section: 'Content' },
  { view: 'reviews', label: 'Reviews', icon: 'star', section: 'Content' },
  { view: 'gallery', label: 'Gallery', icon: 'image', section: 'Content' },
  { view: 'settings', label: 'Settings', icon: 'settings', section: 'System' }
]