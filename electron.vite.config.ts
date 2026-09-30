import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

const alias = { '@shared': resolve(__dirname, 'src/shared') }

export default defineConfig({
  main: { resolve: { alias } },
  preload: { resolve: { alias } },
  renderer: {
    resolve: { alias },
    plugins: [react()],
    build: { target: 'chrome140', minify: 'esbuild' }
  }
})
