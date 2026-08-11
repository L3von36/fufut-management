<template>
  <router-view />
  <ToastContainer />
</template>

<script setup>
import { provide } from 'vue'
import { useToast } from './composables/useToast'
import ToastContainer from './components/ToastContainer.vue'
const { toast } = useToast()
provide('toast', toast)
</script>
