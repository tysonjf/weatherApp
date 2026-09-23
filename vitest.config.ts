import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'virtual:pwa-register/react': fileURLToPath(new URL('./src/test/pwa-register.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    // Engine tests run in Node; UI tests opt into jsdom with a `@vitest-environment jsdom` comment.
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
  },
})
