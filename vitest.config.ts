import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['apps/api/src/**/*.test.ts', 'apps/web/src/lib/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 180000,
    fileParallelism: false,
  },
});
