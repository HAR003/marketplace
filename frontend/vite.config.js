import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The backend's FRONTEND_URL (CORS origin and email links) expects exactly this port
  server: { port: 5173, strictPort: true },
})
