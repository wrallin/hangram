import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // PIN checks run scrypt at N=2^17. The vault integration test does several of
    // them and misses the 5s default on a slow Windows runner.
    testTimeout: 60_000
  }
})
