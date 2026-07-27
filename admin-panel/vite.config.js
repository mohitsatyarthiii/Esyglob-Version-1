import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '')
  if (mode === 'development' && !environment.ADMIN_API_PROXY) {
    throw new Error('ADMIN_API_PROXY is required for local development.')
  }

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: environment.ADMIN_API_PROXY,
          changeOrigin: true,
          secure: true,
        },
      },
    },
  }
})
