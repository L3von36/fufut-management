import { config } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import BaseButton from '../src/components/BaseButton.vue'

/**
 * Shared test setup for the backoffice.
 *
 * Deliberately smaller than the POS equivalent: the backoffice has no IndexedDB
 * offline cache to stub, because it is a desk application on a fixed connection
 * rather than a floor tablet.
 */

const pinia = createPinia()
setActivePinia(pinia)
config.global.plugins = [pinia]

// Several views use <base-button> without importing it locally, exactly as the
// POS setup does. Without this they render an unresolved component and every
// assertion about their buttons silently passes against nothing.
config.global.components = { BaseButton }

// jsdom implements neither, and the CSV export uses both.
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:mock'
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => {}
}
