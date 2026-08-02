import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Cache-busting plugin: appends ?v=<timestamp> to JS and CSS assets in the
// built HTML so browsers fetch the latest bundle after each deploy.
function cacheBust() {
  return {
    name: 'cache-bust',
    transformIndexHtml(html) {
      const v = Date.now()
      return html
        .replace(/(src="[^"]+\.js)"/g, `$1?v=${v}"`)
        .replace(/(href="[^"]+\.css)"/g, `$1?v=${v}"`)
    }
  }
}

export default defineConfig({
  plugins: [vue(), cacheBust()],
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
