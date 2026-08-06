import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/*.smoke.test.ts', '**/node_modules/**'],
  },
})
