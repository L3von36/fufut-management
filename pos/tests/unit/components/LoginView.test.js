import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import LoginView from '../../../src/views/LoginView.vue'

// Mock auth store
const mockLoginWithEmail = vi.fn()
vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    user: null,
    roleKey: '',
    loginWithEmail: mockLoginWithEmail,
    defaultView: 'dashboard',
    isAuthenticated: false
  }))
}))

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', component: LoginView },
      { path: '/app/dashboard', component: { template: '<div>Dashboard</div>' } }
    ]
  })
}

describe('LoginView', () => {
  let router, wrapper

  beforeEach(async () => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    router = createTestRouter()
    await router.push('/login')
  })

  it('should render the login form with email and password fields', () => {
    wrapper = mount(LoginView, {
      global: {
        plugins: [router],
        provide: { toast: vi.fn() }
      }
    })

    expect(wrapper.find('#email').exists()).toBe(true)
    expect(wrapper.find('#password').exists()).toBe(true)
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true)
  })

  it('should show "Welcome back" heading', () => {
    wrapper = mount(LoginView, {
      global: {
        plugins: [router],
        provide: { toast: vi.fn() }
      }
    })

    expect(wrapper.find('h2').text()).toBe('Welcome back')
  })

  it('should show "FU FUT" brand title', () => {
    wrapper = mount(LoginView, {
      global: {
        plugins: [router],
        provide: { toast: vi.fn() }
      }
    })

    expect(wrapper.find('.brand-title').text()).toBe('FU FUT')
  })

  it('should show error message when login fails', async () => {
    mockLoginWithEmail.mockRejectedValue(new Error('Invalid credentials'))

    wrapper = mount(LoginView, {
      global: {
        plugins: [router],
        provide: { toast: vi.fn() }
      }
    })

    await wrapper.find('#email').setValue('test@fufut.coffee')
    await wrapper.find('#password').setValue('wrong')
    await wrapper.find('form').trigger('submit.prevent')

    await new Promise(r => setTimeout(r, 50))
    expect(wrapper.find('.form-error').exists()).toBe(true)
    expect(wrapper.find('.form-error').text()).toContain('Invalid credentials')
  })

  it('should call loginWithEmail with form values on submit', async () => {
    mockLoginWithEmail.mockResolvedValue({
      ok: true,
      user: { firstName: 'Abebe' },
      role: 'manager'
    })

    wrapper = mount(LoginView, {
      global: {
        plugins: [router],
        provide: { toast: vi.fn() }
      }
    })

    await wrapper.find('#email').setValue('abebe@fufut.coffee')
    await wrapper.find('#password').setValue('secret')
    await wrapper.find('form').trigger('submit.prevent')

    expect(mockLoginWithEmail).toHaveBeenCalledWith('abebe@fufut.coffee', 'secret')
  })

  it('should disable submit button while loading', async () => {
    let resolveLogin
    const loginPromise = new Promise(r => { resolveLogin = r })
    mockLoginWithEmail.mockReturnValue(loginPromise)

    wrapper = mount(LoginView, {
      global: {
        plugins: [router],
        provide: { toast: vi.fn() }
      }
    })

    await wrapper.find('#email').setValue('test@test.com')
    await wrapper.find('#password').setValue('pass')
    await wrapper.find('form').trigger('submit.prevent')

    const btn = wrapper.find('button[type="submit"]')
    expect(btn.attributes('disabled')).toBeDefined()
    expect(btn.text()).toContain('Signing in')

    resolveLogin({ ok: true, user: { firstName: 'Test' }, role: 'manager' })
    await new Promise(r => setTimeout(r, 50))
  })

  it('should have email input with correct type and placeholder', () => {
    wrapper = mount(LoginView, {
      global: {
        plugins: [router],
        provide: { toast: vi.fn() }
      }
    })

    const emailInput = wrapper.find('#email')
    expect(emailInput.attributes('type')).toBe('email')
    expect(emailInput.attributes('placeholder')).toBe('you@fufut.coffee')
    expect(emailInput.attributes('required')).toBeDefined()
  })

  it('should have password input with type password', () => {
    wrapper = mount(LoginView, {
      global: {
        plugins: [router],
        provide: { toast: vi.fn() }
      }
    })

    const pwdInput = wrapper.find('#password')
    expect(pwdInput.attributes('type')).toBe('password')
    expect(pwdInput.attributes('required')).toBeDefined()
  })

  it('should show "Powered by FU FUT COFFEE" footer', () => {
    wrapper = mount(LoginView, {
      global: {
        plugins: [router],
        provide: { toast: vi.fn() }
      }
    })

    const footer = wrapper.find('.form-footer')
    expect(footer.exists()).toBe(true)
    expect(footer.text()).toContain('FU FUT COFFEE')
  })
})
