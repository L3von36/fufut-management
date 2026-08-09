import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiGet, apiPost, ROLE_PERMISSIONS, ROLE_DEFAULT_VIEW } from '../api'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const roleKey = ref('')
  const loading = ref(false)
  // Set when this account is carrying a password a manager issued. The server
  // refuses everything except changing it, so the app must send the person
  // straight there rather than onto a dashboard that then 403s every request.
  const mustChangePassword = ref(false)

  const isAuthenticated = computed(() => !!user.value)
  const permissions = computed(() => (ROLE_PERMISSIONS && ROLE_PERMISSIONS[roleKey.value]) || [])
  const defaultView = computed(() => (ROLE_DEFAULT_VIEW && ROLE_DEFAULT_VIEW[roleKey.value]) || 'dashboard')

  function hasPermission(view) {
    return Array.isArray(permissions.value) && permissions.value.includes(view)
  }

  async function login(staffId, password) {
    loading.value = true
    try {
      const res = await apiPost('auth/login', { staffId, password })
      if (!res.ok) throw new Error(res.error || 'Login failed')
      user.value = res.user
      roleKey.value = (res.role || '').toLowerCase().replace(/\s+/g, '-')
      mustChangePassword.value = res.mustChangePassword === true
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
      mustChangePassword.value = res.mustChangePassword === true
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
    } catch (e) {
      console.warn('Session check failed:', e.message)
    }
    return false
  }

  async function logout() {
    try { await apiPost('auth/logout', {}) } catch (e) {
      console.warn('Logout request failed:', e.message)
    }
    user.value = null
    roleKey.value = ''
    mustChangePassword.value = false
  }

  /**
   * Replace the current password. Clears the flag on success, which is what
   * releases the rest of the app - the server is refusing everything else until
   * this succeeds.
   */
  async function changePassword(currentPassword, newPassword) {
    const res = await apiPost('auth/change-password', { currentPassword, newPassword })
    if (!res.ok) throw new Error(res.error || 'Could not change password')
    mustChangePassword.value = false
    return res
  }

  return { user, roleKey, loading, mustChangePassword, isAuthenticated, permissions, defaultView, hasPermission, login, loginWithEmail, checkSession, logout, changePassword }
})
