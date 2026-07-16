import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,        // Listen on 0.0.0.0 — makes it accessible from mobile/other devices
    allowedHosts: true,
  },
})
