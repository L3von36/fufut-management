import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/',
  server: {
    port: 5174,
    host: '0.0.0.0',
    proxy: {
      '/api': { target: 'https://fufut-api.fufutcoffee.workers.dev', changeOrigin: true },
    }
  }
})
