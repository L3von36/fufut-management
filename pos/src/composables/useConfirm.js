import { ref } from 'vue'

const visible = ref(false)
const title = ref('Confirm')
const message = ref('')
let resolveRef = null

function showConfirm(msg, opts = {}) {
  title.value = opts.title || 'Confirm'
  message.value = msg
  visible.value = true
  return new Promise(resolve => {
    resolveRef = resolve
  })
}

function handleConfirm() {
  visible.value = false
  if (resolveRef) resolveRef(true)
}

function handleCancel() {
  visible.value = false
  if (resolveRef) resolveRef(false)
}

export function useConfirm() {
  return {
    visible,
    title,
    message,
    showConfirm,
    handleConfirm,
    handleCancel
  }
}
