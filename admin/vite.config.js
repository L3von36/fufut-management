import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/',
  build: {
    rollupOptions: {
      output: {
        // Fixed filenames — no content hashes — so deployments never break
        // the live site by serving HTML that references a not-yet-uploaded file.
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  },
  server: {
    port: 5174,
    host: '0.0.0.0',
    proxy: {
      '/api': { target: 'https://fufut-api.fufutcoffee.workers.dev', changeOrigin: true },
    }
  }
})
