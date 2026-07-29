<template>
  <router-view />
  <div class="toast-container" id="toastContainer"></div>
</template>

<script setup>
import { provide } from 'vue'
import { useToast } from './composables/useToast'
import { isOnline } from './api'

const { toast } = useToast()
provide('toast', toast)
provide('isOnline', isOnline)
</script>
