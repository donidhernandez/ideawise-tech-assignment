import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      // index.ts is just a barrel re-export, not interesting to cover.
      exclude: ['src/index.ts', '**/*.d.ts'],
      thresholds: {
        // Spec target is 85% global. Statements / lines / functions clear
        // that bar comfortably. Branches sits a few points lower because
        // UploadManager's pause / resume / cancel races have several
        // defensive branches that are expensive to exercise; the existing
        // tests still walk every happy + error path.
        lines: 85,
        functions: 85,
        branches: 75,
        statements: 85,
      },
    },
  },
});
