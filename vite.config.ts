import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/frontend/components'),
      '@pages': path.resolve(__dirname, './src/frontend/pages'),
      '@providers': path.resolve(__dirname, './src/frontend/providers'),
      '@services': path.resolve(__dirname, './src/frontend/services'),
      '@types': path.resolve(__dirname, './src/frontend/types'),
      '@utils': path.resolve(__dirname, './src/frontend/utils')
    }
  },
  server: {
    port: 3000,
    open: true,
    host: true
  }
}) 