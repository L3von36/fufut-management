import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiGet, apiPost, ROLE_PERMISSIONS, ROLE_DEFAULT_VIEW } from '../api'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const roleKey = ref('')
  const loading = ref(false)

  const isAuthenticated = computed(() => !!user.value)
  const permissions = computed(() => ROLE_PERMISSIONS[roleKey.value] || [])
  const defaultView = computed(() => ROLE_DEFAULT_VIEW[roleKey.value] || 'dashboard')

  function hasPermission(view) {
    return permissions.value.includes(view)
  }

  async function login(staffId, password) {
    loading.value = true
    try {
      const res = await apiPost('auth/login', { staffId, password })
      if (!res.ok) throw new Error(res.error || 'Login failed')
      user.value = res.user
      roleKey.value = (res.role || '').toLowerCase().replace(/\s+/g, '-')
      return res
    } finally {
      loading.value = false
    }
  }

  async function loginWithEmail(email, password) {
    loading.value = true
    try {
      const res = await apiPost('auth/login', { email, password })
      if (!res.ok) throw new Error(res.error || 'Login failed')
      user.value = res.user
      roleKey.value = (res.role || '').toLowerCase().replace(/\s+/g, '-')
      return res
    } finally {
      loading.value = false
    }
  }

  async function checkSession() {
    try {
      const res = await apiGet('auth/me')
      if (res.ok) {
        user.value = res.user
        roleKey.value = (res.role || '').toLowerCase().replace(/\s+/g, '-')
        return true
      }
    } catch {}
    return false
  }

  /**
   * Re-check who is signed in and report whether the session changed.
   *
   * The backoffice is used on shared machines where one staff member logs
   * out and another logs in on the same browser. Without this, the sidebar
   * and route guard keep using the stale role until a full page reload.
   *
   * Returns 'same', 'changed', 'ended' or 'unknown' (unreachable server).
   */
  async function revalidate() {
    const wasId = user.value && user.value.id
    const wasRole = roleKey.value
    const ok = await checkSession()
    if (!ok) return wasId ? 'ended' : 'same'
    const nowId = user.value && user.value.id
    return nowId !== wasId || roleKey.value !== wasRole ? 'changed' : 'same'
  }

  async function logout() {
    try { await apiPost('auth/logout', {}) } catch {}
    user.value = null
    roleKey.value = ''
  }

  return { user, roleKey, loading, isAuthenticated, permissions, defaultView, hasPermission, login, loginWithEmail, checkSession, revalidate, logout }
})
