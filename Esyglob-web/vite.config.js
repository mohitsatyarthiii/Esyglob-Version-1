import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'https://api.esyglob.in',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'https://api.esyglob.in',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
  },
})
