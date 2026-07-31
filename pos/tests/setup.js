import { vi } from 'vitest'
import { config } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Global Pinia setup
const pinia = createPinia()
setActivePinia(pinia)
config.global.plugins = [pinia]

// Mock IndexedDB
class MockIDBRequest {
  constructor(result) {
    this.result = result
    this.onsuccess = null
    this.onerror = null
    // Auto-resolve after a microtask
    Promise.resolve().then(() => this.onsuccess?.({ target: this }))
  }
}

class MockObjectStore {
  constructor(name) {
    this._name = name
    this._data = new Map()
  }
  getAll() {
    const req = new MockIDBRequest(Array.from(this._data.values()))
    return req
  }
  get(key) {
    const req = new MockIDBRequest(this._data.get(key) || undefined)
    return req
  }
  put(item) {
    const key = item.id || item.timestamp
    this._data.set(key, item)
    return new MockIDBRequest(key)
  }
  delete(key) {
    this._data.delete(key)
    return new MockIDBRequest(undefined)
  }
  clear() {
    this._data.clear()
  }
  add(item) {
    const id = this._data.size + 1
    this._data.set(id, { ...item, id })
    return new MockIDBRequest(id)
  }
  createIndex() {}
}

class MockTransaction {
  constructor(store, mode) {
    this._store = store
    this._mode = mode
    this.oncomplete = null
    this.onerror = null
  }
  get objectStore() {
    return this._store
  }
}

class MockIDBDatabase {
  constructor() {
    this._stores = {}
    this.objectStoreNames = { contains: (name) => name in this._stores }
  }
  transaction(storeName, mode) {
    if (!this._stores[storeName]) {
      this._stores[storeName] = new MockObjectStore(storeName)
    }
    return new MockTransaction(this._stores[storeName], mode)
  }
  createObjectStore(name, opts) {
    const store = new MockObjectStore(name)
    if (opts?.keyPath) store._keyPath = opts.keyPath
    this._stores[name] = store
    return store
  }
}

const mockDB = new MockIDBDatabase()

vi.stubGlobal('indexedDB', {
  open: vi.fn(() => {
    const req = new MockIDBRequest(mockDB)
    req.onupgradeneeded = null
    Promise.resolve().then(() => req.onsuccess?.({ target: { result: mockDB } }))
    return req
  })
})

// Mock navigator.onLine
definePropertyCompat(document, 'onLine', true)

// Mock localStorage
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, val) => { store[key] = String(val) }),
    removeItem: vi.fn((key) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
    get length() { return Object.keys(store).length },
    key: vi.fn((i) => Object.keys(store)[i] || null)
  }
})()
vi.stubGlobal('localStorage', localStorageMock)

// Mock matchMedia
vi.stubGlobal('matchMedia', vi.fn((query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn()
})))
window.matchMedia = vi.fn((query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn()
}))

// Mock AudioContext
vi.stubGlobal('AudioContext', vi.fn().mockImplementation(() => ({
  state: 'running',
  createOscillator: vi.fn(() => ({
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    type: 'sine'
  })),
  createGain: vi.fn(() => ({
    connect: vi.fn(),
    gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }
  })),
  resume: vi.fn().mockResolvedValue(),
  destination: {}
})))
vi.stubGlobal('webkitAudioContext', vi.fn())

// Mock performance.now
vi.stubGlobal('performance', { now: vi.fn(() => Date.now()) })

// Mock requestAnimationFrame/cancelAnimationFrame
vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => setTimeout(cb, 16)))
vi.stubGlobal('cancelAnimationFrame', vi.fn(clearTimeout))

// Mock window.addEventListener/removeEventListener for online/offline
const listeners = {}
vi.spyOn(window, 'addEventListener').mockImplementation((event, cb) => {
  if (!listeners[event]) listeners[event] = []
  listeners[event].push(cb)
})
vi.spyOn(window, 'removeEventListener').mockImplementation((event, cb) => {
  if (listeners[event]) listeners[event] = listeners[event].filter(f => f !== cb)
})

function definePropertyCompat(obj, prop, value) {
  try {
    Object.defineProperty(obj, prop, { value, writable: true, configurable: true })
  } catch {
    obj[prop] = value
  }
}