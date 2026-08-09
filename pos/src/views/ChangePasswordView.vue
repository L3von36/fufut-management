<template>
  <div class="cp-page">
    <div class="cp-box">
      <h2>Choose your own password</h2>
      <p class="cp-sub">
        {{ auth.mustChangePassword
          ? 'This account is using a password somebody else issued. Choose your own before carrying on.'
          : 'Change the password you use to sign in.' }}
      </p>

      <form @submit.prevent="submit">
        <div class="form-group">
          <label for="cp-current">Current password</label>
          <input id="cp-current" v-model="currentPassword" type="password" autocomplete="current-password" :disabled="busy" />
        </div>

        <div class="form-group">
          <label for="cp-new">New password</label>
          <input id="cp-new" v-model="newPassword" type="password" autocomplete="new-password" :disabled="busy" />
          <span class="cp-hint">At least 8 characters, including a letter and a number.</span>
        </div>

        <div class="form-group">
          <label for="cp-confirm">Repeat new password</label>
          <input id="cp-confirm" v-model="confirmPassword" type="password" autocomplete="new-password" :disabled="busy" />
        </div>

        <!-- Shown in the form rather than as a toast: the fix is to retype
             something here, and a toast disappears before it has been read. -->
        <div v-if="error" class="cp-error">{{ error }}</div>

        <button class="btn btn-primary cp-submit" type="submit" :disabled="busy">
          {{ busy ? 'Saving…' : 'Set password' }}
        </button>
      </form>

      <!-- Always reachable. Somebody who cannot remember their current password
           must be able to get out and ask a manager to reset it. -->
      <button class="btn btn-ghost cp-signout" :disabled="busy" @click="signOut">Sign out</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const error = ref('')
const busy = ref(false)

/**
 * Checked here as well as on the server. The server is the authority; this only
 * saves a round trip and tells the person what is wrong while they are still
 * looking at the field.
 */
const localProblem = computed(() => {
  if (!currentPassword.value) return 'Enter your current password'
  if (newPassword.value.length < 8) return 'New password must be at least 8 characters'
  if (!/[a-zA-Z]/.test(newPassword.value) || !/[0-9]/.test(newPassword.value)) {
    return 'New password must contain at least one letter and one number'
  }
  if (newPassword.value !== confirmPassword.value) return 'The two new passwords do not match'
  if (newPassword.value === currentPassword.value) return 'Choose a password different from the current one'
  return ''
})

async function submit() {
  error.value = localProblem.value
  if (error.value || busy.value) return

  busy.value = true
  try {
    await auth.changePassword(currentPassword.value, newPassword.value)
    // Straight to whatever this role normally opens on; the app was refusing
    // every other request until now.
    router.replace({ name: auth.defaultView })
  } catch (e) {
    error.value = e.message || 'Could not change password'
  } finally {
    busy.value = false
  }
}

async function signOut() {
  await auth.logout()
  router.replace('/login')
}
</script>

<style scoped>
.cp-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--bg);
}
.cp-box {
  width: 100%;
  max-width: 420px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 28px 24px;
  box-shadow: var(--shadow-md);
}
.cp-box h2 { font-size: 1.25rem; color: var(--text-heading); margin-bottom: 6px; }
.cp-sub { font-size: .88rem; color: var(--text-muted); margin-bottom: 20px; line-height: 1.5; }
.cp-hint { display: block; font-size: .78rem; color: var(--text-muted); margin-top: 4px; }
.cp-error {
  margin: 4px 0 12px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--red-50, #FEF2F2);
  border: 1.5px solid var(--danger);
  color: var(--danger-text);
  font-size: .82rem;
  font-weight: 500;
}
.cp-submit { width: 100%; justify-content: center; min-height: 44px; margin-top: 8px; }
.cp-signout { width: 100%; justify-content: center; min-height: 44px; margin-top: 10px; }
</style>
