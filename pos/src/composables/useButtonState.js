import { ref } from 'vue'

/**
 * Composable for managing button action states (loading → success → error → reset)
 */
export function useButtonState(options = {}) {
  const successDuration = options.successDuration || 2000

  const state = ref('idle')
  const errorMessage = ref('')

  const isIdle = () => state.value === 'idle'
  const isLoading = () => state.value === 'loading'
  const isSuccess = () => state.value === 'success'
  const isError = () => state.value === 'error'
  const isBusy = () => state.value === 'loading'

  let resetTimer = null

  function setLoading() {
    clearTimeout(resetTimer)
    state.value = 'loading'
    errorMessage.value = ''
  }

  function setSuccess() {
    state.value = 'success'
    resetTimer = setTimeout(() => { state.value = 'idle' }, successDuration)
  }

  function setError(msg) {
    state.value = 'error'
    errorMessage.value = msg || 'Action failed'
  }

  function reset() {
    clearTimeout(resetTimer)
    state.value = 'idle'
    errorMessage.value = ''
  }

  async function wrap(fn, opts = {}) {
    if (isBusy()) return
    setLoading()
    try {
      const result = await fn()
      setSuccess()
      return result
    } catch (e) {
      setError(e?.message || opts.errorMessage || 'Action failed')
      throw e
    }
  }

  function getLabel(idleText, labels = {}) {
    switch (state.value) {
      case 'loading': return labels.loading || `${idleText.replace(/e?$/, '')}ing...`
      case 'success': return labels.success || `${idleText}ed ✓`
      case 'error': return labels.error || 'Try Again'
      default: return idleText
    }
  }

  return {
    state, errorMessage, isIdle, isLoading, isSuccess, isError, isBusy,
    setLoading, setSuccess, setError, reset, wrap, getLabel
  }
}