import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ChangePasswordView from '../../../src/views/ChangePasswordView.vue'

const mockChangePassword = vi.fn()
const mockLogout = vi.fn()
let mustChange = true

vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    get mustChangePassword() { return mustChange },
    defaultView: 'kitchen',
    changePassword: (...a) => mockChangePassword(...a),
    logout: (...a) => mockLogout(...a)
  }))
}))

const mockReplace = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: mockReplace })
}))

const globalConfig = { global: { provide: { toast: vi.fn() } } }

/** [current, new, confirm] */
function fields(w) {
  return w.findAll('input')
}

async function fill(w, current, next, confirm = next) {
  const [a, b, c] = fields(w)
  await a.setValue(current)
  await b.setValue(next)
  await c.setValue(confirm)
}

const submit = (w) => w.find('form').trigger('submit')

describe('ChangePasswordView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mustChange = true
    mockChangePassword.mockResolvedValue({ ok: true })
  })

  it('explains why the person is here when a manager issued the password', () => {
    const w = mount(ChangePasswordView, globalConfig)
    expect(w.text()).toContain('somebody else issued')
  })

  it('changes the password and moves on to the role\'s own screen', async () => {
    const w = mount(ChangePasswordView, globalConfig)
    await fill(w, 'temp1234', 'kitchen42')
    await submit(w)
    await flushPromises()

    expect(mockChangePassword).toHaveBeenCalledWith('temp1234', 'kitchen42')
    expect(mockReplace).toHaveBeenCalledWith({ name: 'kitchen' })
  })

  it('refuses a password that is too short, without calling the server', async () => {
    const w = mount(ChangePasswordView, globalConfig)
    await fill(w, 'temp1234', 'abc12')
    await submit(w)
    await flushPromises()

    expect(mockChangePassword).not.toHaveBeenCalled()
    expect(w.text()).toContain('at least 8 characters')
  })

  it('refuses a password with no number', async () => {
    const w = mount(ChangePasswordView, globalConfig)
    await fill(w, 'temp1234', 'allletters')
    await submit(w)
    await flushPromises()
    expect(mockChangePassword).not.toHaveBeenCalled()
    expect(w.text()).toContain('letter and one number')
  })

  it('catches a mistyped confirmation before sending anything', async () => {
    const w = mount(ChangePasswordView, globalConfig)
    await fill(w, 'temp1234', 'kitchen42', 'kitchen43')
    await submit(w)
    await flushPromises()

    expect(mockChangePassword).not.toHaveBeenCalled()
    expect(w.text()).toContain('do not match')
  })

  it('refuses reusing the current password', async () => {
    const w = mount(ChangePasswordView, globalConfig)
    await fill(w, 'kitchen42', 'kitchen42')
    await submit(w)
    await flushPromises()

    expect(mockChangePassword).not.toHaveBeenCalled()
    expect(w.text()).toContain('different from the current one')
  })

  it('shows the server\'s reason when it refuses, and stays put', async () => {
    mockChangePassword.mockRejectedValue(new Error('Current password is incorrect'))
    const w = mount(ChangePasswordView, globalConfig)
    await fill(w, 'wrongpass1', 'kitchen42')
    await submit(w)
    await flushPromises()

    expect(w.text()).toContain('Current password is incorrect')
    expect(mockReplace).not.toHaveBeenCalled()
  })

  // Somebody who cannot remember their current password has to be able to get
  // out and ask a manager to reset it, rather than being stuck on this screen.
  it('always offers a way to sign out', async () => {
    const w = mount(ChangePasswordView, globalConfig)
    const out = w.findAll('button').find(b => b.text() === 'Sign out')
    expect(out).toBeDefined()

    await out.trigger('click')
    await flushPromises()
    expect(mockLogout).toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/login')
  })

  it('reads as an ordinary change when nothing is being forced', () => {
    mustChange = false
    const w = mount(ChangePasswordView, globalConfig)
    expect(w.text()).not.toContain('somebody else issued')
  })
})
