<template>
  <button
    :class="btnClasses"
    :disabled="disabled || state.isBusy()"
    :aria-busy="state.isBusy() ? 'true' : undefined"
    :aria-disabled="disabled || state.isBusy() ? 'true' : undefined"
    :aria-label="ariaLabel || computedLabel"
    @click="handleClick"
  >
    <span v-if="state.isBusy() && showSpinner" class="btn-spinner" aria-hidden="true"></span>
    <span v-else-if="state.isSuccess() && showCheck" class="btn-check" aria-hidden="true">✓</span>
    <span v-else-if="state.isError() && showErrorIcon" class="btn-error-icon" aria-hidden="true">!</span>
    <span v-else-if="$slots.icon" class="btn-icon-slot"><slot name="icon" /></span>
    <span class="btn-text"><slot>{{ displayLabel }}</slot></span>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import { useButtonState } from '../composables/useButtonState'

const props = defineProps({
  text: { type: String, default: '' },
  loadingLabel: { type: String, default: '' },
  successLabel: { type: String, default: '' },
  errorLabel: { type: String, default: '' },
  variant: { type: String, default: '' },
  extraClass: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  showSpinner: { type: Boolean, default: true },
  showCheck: { type: Boolean, default: true },
  showErrorIcon: { type: Boolean, default: true },
  ariaLabel: { type: String, default: '' },
  onClick: { type: Function, default: null },
  successDuration: { type: Number, default: 2000 },
  externalState: { type: Object, default: null }
})

const emit = defineEmits(['click', 'success', 'error'])

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