import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {},
  },
  resolve: {
    alias: {
      // Alias to browser-compatible modules
      '@': path.resolve(__dirname, './src'),
      path: 'path-browserify',
      url: 'url',
      'source-map': 'source-map-js',
    },
  },
  optimizeDeps: {
    include: ['path-browserify', 'url', 'source-map-js'], // Include the browser-compatible versions for Vite to handle
  },
  build: {
    outDir: '../AI_model_server_Flask/static',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
