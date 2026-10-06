import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      // Dev only: forward /api to the backend so the browser sees a single origin.
      proxy: {
        '/api': {
          target: env.VITE_DEV_API_PROXY ?? 'http://localhost:4000',
          changeOrigin: true,
        },
      },
    },
  }
})
