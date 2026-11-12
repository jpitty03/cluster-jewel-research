import { defineConfig } from 'vitest/config'

// Vitest owns the TypeScript suites. The .mjs suites under scripts/test and
// poe2-crafting-engine/test are written against node:test and run by
// `npm run test:node`; left to its default glob, vitest loads them and reports
// "No test suite found" for each.
export default defineConfig({
  test: {
    include: ['crafting-engine/test/**/*.test.ts', 'src/**/*.test.{ts,tsx}', 'quality-lab/**/*.test.ts'],
  },
})
