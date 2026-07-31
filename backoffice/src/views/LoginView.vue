<template>
  <div class="pos-login">
    <div class="pos-login-inner">
      <!-- Left: Brand Panel -->
      <div class="login-brand">
        <div class="brand-circle">
          <img src="/assets/logo.webp" alt="FU FUT" />
        </div>
        <h1 class="brand-title">FU FUT</h1>
        <p class="brand-sub">COFFEE · BACKOFFICE</p>
        <div class="brand-divider"></div>
        <p class="brand-tagline">Authentic Ethiopian Coffee<br/>& Restaurant Management</p>
      </div>

      <!-- Right: Form -->
      <div class="login-form-panel">
        <div class="form-header">
          <h2>Welcome back</h2>
          <p>Sign in to your account</p>
        </div>
        <form @submit.prevent="handleLogin" class="login-form">
          <div class="field-group">
            <label for="email">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              Email
            </label>
            <input id="email" v-model="email" type="email" placeholder="you@fufut.coffee" required autofocus />
          </div>
          <div class="field-group">
            <label for="password">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Password
            </label>
            <input id="password" v-model="password" type="password" placeholder="Enter your password" required />
          </div>
          <p v-if="error" class="form-error">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {{ error }}
          </p>
          <button type="submit" class="login-submit" :disabled="btnState.isBusy()" :aria-busy="btnState.isBusy() ? 'true' : undefined">
            <span v-if="btnState.isBusy()" class="spinner"></span>
            <svg v-else-if="btnState.isSuccess()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:18px;height:18px"><polyline points="20 6 9 17 4 12"/></svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
            {{ btnState.isBusy() ? 'Signing in...' : btnState.isSuccess() ? 'Signed In ✓' : 'Sign In' }}
          </button>
        </form>
        <div class="form-footer">
          <span>Powered by</span>
          <strong>FU FUT COFFEE</strong>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, inject } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useButtonState } from '../composables/useButtonState'

const router = useRouter()
const auth = useAuthStore()
const toast = inject('toast')
const email = ref('')
const password = ref('')
const error = ref('')
const btnState = useButtonState({ successDuration: 2000 })

async function handleLogin() {
  error.value = ''
  btnState.setLoading()
  try {
    const res = await auth.loginWithEmail(email.value, password.value)
    toast('Welcome, ' + (auth.user?.firstName || ''))
    btnState.setSuccess()
    setTimeout(() => router.push('/app/dashboard'), 800)
  } catch (e) {
    error.value = e.message || 'Login failed'
    btnState.setError(e.message || 'Login failed')
  }
}
</script>

<style scoped>
.pos-login{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--teal-50),var(--teal-100));padding:20px;font-family:var(--font-body)}
.pos-login-inner{display:flex;background:var(--surface);border-radius:24px;box-shadow:var(--shadow-lg);overflow:hidden;max-width:800px;width:100%;min-height:480px}

/* Left brand panel */
.login-brand{width:40%;background:linear-gradient(160deg,var(--teal-700),var(--teal-800));color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 28px;text-align:center}
.brand-circle{width:80px;height:80px;border-radius:50%;border:3px solid rgba(255,255,255,.2);overflow:hidden;margin-bottom:16px;box-shadow:0 8px 24px rgba(0,0,0,.2)}
.brand-circle img{width:100%;height:100%;object-fit:cover}
.brand-title{font-family:var(--font-display);font-size:1.6rem;font-weight:700;letter-spacing:.04em;line-height:1}
.brand-sub{font-size:.7rem;text-transform:uppercase;letter-spacing:.2em;opacity:.7;margin-top:4px;font-weight:500}
.brand-divider{width:40px;height:2px;background:rgba(255,255,255,.25);margin:16px 0;border-radius:2px}
.brand-tagline{font-size:.78rem;opacity:.6;line-height:1.5}

/* Right form panel */
.login-form-panel{width:60%;padding:44px 40px;display:flex;flex-direction:column;justify-content:center}
.form-header{margin-bottom:28px}
.form-header h2{font-size:1.3rem;font-weight:700;color:var(--text-heading);margin-bottom:4px}
.form-header p{font-size:.85rem;color:var(--text-muted)}

.login-form{display:flex;flex-direction:column;gap:16px}
.field-group{display:flex;flex-direction:column;gap:6px}
.field-group label{display:flex;align-items:center;gap:6px;font-size:.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em}
.field-group label svg{width:14px;height:14px;color:var(--accent)}
.field-group input{padding:12px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:.92rem;color:var(--text-heading);background:var(--bg);transition:all .2s;font-family:var(--font-body)}
.field-group input:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px rgba(15,123,120,.1);background:var(--surface)}
.field-group input::placeholder{color:var(--neutral-400)}

.form-error{display:flex;align-items:center;gap:6px;font-size:.78rem;color:var(--danger);margin:0}
.form-error svg{width:16px;height:16px;flex-shrink:0}

.login-submit{display:flex;align-items:center;justify-content:center;gap:8px;padding:13px 20px;border:none;border-radius:10px;background:var(--primary);color:#fff;font-size:.92rem;font-weight:600;cursor:pointer;transition:all .2s;font-family:var(--font-body);margin-top:4px}
.login-submit:hover{background:var(--primary-hover);transform:translateY(-1px);box-shadow:0 4px 14px rgba(15,123,120,.2)}
.login-submit:active{transform:translateY(0)}
.login-submit svg{width:18px;height:18px}
.login-submit:disabled{opacity:.6;cursor:not-allowed;transform:none}

@keyframes spin{to{transform:rotate(360deg)}}
.spinner{width:18px;height:18px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite}

.form-footer{margin-top:24px;font-size:.7rem;color:var(--text-muted);text-align:center;letter-spacing:.04em}
.form-footer strong{color:var(--text-heading);font-weight:600}

@media(max-width:600px){
  .pos-login-inner{flex-direction:column;max-width:400px}
  .login-brand{width:100%;padding:32px 20px;min-height:auto}
  .brand-circle{width:60px;height:60px}
  .brand-title{font-size:1.3rem}
  .login-form-panel{width:100%;padding:32px 24px}
}
</style>
