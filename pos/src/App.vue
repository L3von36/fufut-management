<template>
  <router-view />
  <div class="toast-container" id="toastContainer"></div>

  <!-- Global Confirm Dialog -->
  <div v-if="confirmState.visible.value" class="modal-overlay" @click.self="confirmState.handleCancel">
    <div class="modal confirm-modal" style="width:380px">
      <h3>{{ confirmState.title.value }}</h3>
      <p style="margin-top:8px;color:var(--text-body);font-size:.88rem">{{ confirmState.message.value }}</p>
      <div class="modal-actions" style="margin-top:20px">
        <button class="btn btn-secondary" @click="confirmState.handleCancel">Cancel</button>
        <button class="btn btn-primary" @click="confirmState.handleConfirm">Confirm</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { provide } from 'vue'
import { useToast } from './composables/useToast'
import { useConfirm } from './composables/useConfirm'
import { isOnline } from './api'

const { toast } = useToast()
provide('toast', toast)
provide('isOnline', isOnline)

const confirmState = useConfirm()
provide('confirm', confirmState.showConfirm)
</script>

<style scoped>
.confirm-modal {
  animation: modalIn 0.2s ease;
}
@keyframes modalIn {
  from { opacity: 0; transform: scale(0.95) translateY(-10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
</style>
