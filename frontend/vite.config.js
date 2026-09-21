import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],

  build: {
    rollupOptions: {
      output: {
        // Leaflet and Recharts are the two heavy dependencies and they
        // change far less often than application code. Splitting them out
        // keeps the app chunk small and lets browsers reuse the vendor
        // chunks across deploys.
        manualChunks: {
          react: ['react', 'react-dom'],
          charts: ['recharts'],
          maps: ['leaflet', 'react-leaflet'],
        },
      },
    },
  },
})
