import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/** Echte Durchläufe mit Claude-Abo und Blender (lange Laufzeit, nur von Hand): npx vitest run -c vitest.echt.config.ts */
export default defineConfig({
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  test: {
    include: ['tests/echt/**/*.test.ts'],
    environment: 'node',
    testTimeout: 6 * 60 * 60 * 1000
  }
})
