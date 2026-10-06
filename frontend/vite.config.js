import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
  },
  // Production optimizations for faster Vercel loads
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/lucide-react')) return 'lucide';
          if (id.includes('node_modules/axios')) return 'axios';
        },
      },
    },
    // Reduce chunk size warning threshold
    chunkSizeWarningLimit: 600,
  },
})
