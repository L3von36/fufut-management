<template>
  <button
    :class="btnClasses"
    :disabled="disabled || state.isBusy()"
    :aria-busy="state.isBusy() ? 'true' : undefined"
    :aria-disabled="disabled || state.isBusy() ? 'true' : undefined"
    :aria-label="ariaLabel || computedLabel"
    @click="handleClick"
  >
    <!-- Loading spinner -->
    <span v-if="state.isBusy() && showSpinner" class="btn-spinner" aria-hidden="true"></span>
    <!-- Success checkmark -->
    <span v-else-if="state.isSuccess() && showCheck" class="btn-check" aria-hidden="true">✓</span>
    <!-- Error icon -->
    <span v-else-if="state.isError() && showErrorIcon" class="btn-error-icon" aria-hidden="true">!</span>
    <!-- Default icon slot -->
    <span v-else-if="$slots.icon" class="btn-icon-slot">
      <slot name="icon" />
    </span>

    <span class="btn-text">
      <slot>{{ displayLabel }}</slot>
    </span>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import { useButtonState } from '../composables/useButtonState'

const props = defineProps({
  /** The default button text (used for auto-label generation) */
  text: { type: String, default: '' },
  /** Custom labels for each state */
  loadingLabel: { type: String, default: '' },
  successLabel: { type: String, default: '' },
  errorLabel: { type: String, default: '' },
  /** CSS classes to apply (btn-primary, btn-secondary, etc.) */
  variant: { type: String, default: '' },
  /** Additional CSS classes */
  extraClass: { type: String, default: '' },
  /** Whether the button is disabled */
  disabled: { type: Boolean, default: false },
  /** Show spinner during loading */
  showSpinner: { type: Boolean, default: true },
  /** Show checkmark on success */
  showCheck: { type: Boolean, default: true },
  /** Show error icon on error */
  showErrorIcon: { type: Boolean, default: true },
  /** ARIA label override */
  ariaLabel: { type: String, default: '' },
  /** Async click handler */
  onClick: { type: Function, default: null },
  /** Duration (ms) to show success state before resetting */
  successDuration: { type: Number, default: 2000 },
  /** Use external button state (for sharing state between buttons) */
  externalState: { type: Object, default: null }
})

const emit = defineEmits(['click', 'success', 'error'])

// Use external or internal state
const state = props.externalState || useButtonState({ successDuration: props.successDuration })

const computedLabel = computed(() => {
  if (state.isLoading()) {
    return props.loadingLabel || (props.text ? `${props.text.replace(/e?$/, '')}ing...` : 'Loading...')
  }
  if (state.isSuccess()) {
    return props.successLabel || (props.text ? `${props.text}ed ✓` : 'Done ✓')
  }
  if (state.isError()) {
    return props.errorLabel || 'Try Again'
  }
  return props.text
})

const displayLabel = computed(() => {
  // If there's a slot, don't auto-generate labels
  if (props.text) return computedLabel.value
  return ''
})

const btnClasses = computed(() => {
  const classes = ['btn']
  if (props.variant) classes.push(props.variant)
  if (props.extraClass) classes.push(props.extraClass)
  if (state.isLoading()) classes.push('btn-loading')
  if (state.isSuccess()) classes.push('btn-success-state')
  if (state.isError()) classes.push('btn-error-state')
  return classes
})

async function handleClick(e) {
  if (state.isBusy() || props.disabled) return
  if (props.onClick) {
    try {
      state.setLoading()
      await props.onClick(e)
      state.setSuccess()
      emit('success')
    } catch (err) {
      state.setError(err?.message || 'Action failed')
      emit('error', err)
    }
  } else {
    emit('click', e)
  }
}
</script>