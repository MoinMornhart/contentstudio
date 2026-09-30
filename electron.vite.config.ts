import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = { '@shared': resolve(__dirname, 'src/shared') }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
    build: {
      rollupOptions: {
        // Der MCP-Server (mcp.js, eigener Einstieg für MCP-fähige Desktop-Apps) kommt mit ROADMAP M3 dazu.
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: { alias: { ...shared, '@renderer': resolve(__dirname, 'src/renderer/src') } },
    plugins: [react()],
    build: {
      minify: true,
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') }
    }
  }
})
