import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ToastContainer from '../../../src/components/ToastContainer.vue'
import { useToast } from '../../../src/composables/useToast'

describe('ToastContainer', () => {
  let wrapper
  const toastApi = useToast()

  beforeEach(() => {
    toastApi.dismissAll()
    wrapper = mount(ToastContainer, {
      attachTo: document.body
    })
  })

  afterEach(() => {
    toastApi.dismissAll()
    wrapper.unmount()
    document.body.innerHTML = ''
  })

  it('renders a toast when the store receives one', async () => {
    toastApi.toast('Order created', 'success')
    await nextTick()

    const el = document.querySelector('.toast-notification')
    expect(el).not.toBeNull()
    expect(el.className).toContain('toast-success')
    expect(el.textContent).toContain('Order created')
  })

  it('constrains the icon size inside the toast', async () => {
    toastApi.toast('Welcome back', 'success')
    await nextTick()

    const icon = document.querySelector('.toast-icon svg')
    expect(icon).not.toBeNull()
  })

  it('marks the container as a live region', () => {
    const container = document.querySelector('.toast-container')
    expect(container.getAttribute('aria-live')).toBe('polite')
  })

  it('renders an error toast with an alert role', async () => {
    toastApi.toast('Something broke', 'error')
    await nextTick()

    const el = document.querySelector('.toast-notification')
    expect(el.className).toContain('toast-error')
    expect(el.textContent).toContain('Something broke')
  })

  it('shows an options.title when provided', async () => {
    toastApi.toast('Saved', 'success', { title: 'Done' })
    await nextTick()

    const el = document.querySelector('.toast-notification')
    expect(el.textContent).toContain('Done')
    expect(el.textContent).toContain('Saved')
  })

  it('removes the element from the DOM on dismiss', async () => {
    const id = toastApi.toast('Bye', 'info')
    await nextTick()
    expect(document.querySelectorAll('.toast-notification').length).toBe(1)

    toastApi.dismiss(id)
    await nextTick()
    // TransitionGroup resolves the leave transition without needing
    // animationend — even in jsdom, which never fires CSS events.
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(document.querySelector('.toast-notification')).toBeNull()
  })

  it('removes all toasts on dismissAll', async () => {
    toastApi.toast('one', 'info')
    toastApi.toast('two', 'success')
    await nextTick()
    expect(document.querySelectorAll('.toast-notification').length).toBe(2)

    toastApi.dismissAll()
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(document.querySelector('.toast-notification')).toBeNull()
  })

  it('dismiss button calls dismiss on the store', async () => {
    toastApi.toast('Close me', 'warning')
    await nextTick()

    document.querySelector('.toast-dismiss').click()
    await nextTick()
    expect(toastApi.toasts.value.length).toBe(0)
  })
})
