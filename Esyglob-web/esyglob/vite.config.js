import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'https://api.esyglob.in'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: true,
        },
        '/socket.io': {
          target: proxyTarget,
          changeOrigin: true,
          secure: true,
          ws: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      target: 'es2020',
      cssCodeSplit: true,
      sourcemap: false,
    },
  }
})
