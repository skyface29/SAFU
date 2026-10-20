import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Мини-приложение: собирается в dist/webapp, сервер раздаёт его сам. В разработке /api проксируется на сервер
export default defineConfig({
  root: 'webapp',
  plugins: [react()],
  build: { outDir: '../dist/webapp', emptyOutDir: true, chunkSizeWarningLimit: 800 },
  server: { port: 5174, proxy: { '/api': 'http://localhost:8080' } }
})
