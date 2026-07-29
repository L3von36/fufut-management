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
        roleKey.value = res.role
        return true
      }
    } catch {}
    return false
  }

  async function logout() {
    try { await apiPost('auth/logout', {}) } catch {}
    user.value = null
    roleKey.value = ''
  }

  return { user, roleKey, loading, isAuthenticated, permissions, defaultView, hasPermission, login, loginWithEmail, checkSession, logout }
})
