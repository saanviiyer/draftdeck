import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The dev client proxies /api to the backend so the browser never needs to
// know the server port (and credentials stay server-side).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  test: {
    environment: 'node',
    include: ['server/**/*.test.js'],
  },
})
