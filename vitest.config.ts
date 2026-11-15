import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // Only used by unit tests that import app runtime code directly (test/useVatCheck.test.ts).
      '#imports': fileURLToPath(new URL('./test/shims/imports.ts', import.meta.url)),
    },
  },
  define: {
    'import.meta.client': 'true',
  },
})
