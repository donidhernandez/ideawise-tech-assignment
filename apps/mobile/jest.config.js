/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testMatch: ['<rootDir>/test/**/*.test.ts', '<rootDir>/test/**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Map upload-core's `.js`-extension imports onto its TS sources, same trick
    // we use in metro.config.js. Jest needs its own resolver hint.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!.*(?:react-native|expo|@unimodules|@react-native-async-storage|@repo)).*',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    // Layout/wiring shells and visual components — bridge code we cover
    // lives in src/lib + src/hooks + src/store.
    '!src/app/**',
    '!src/components/**',
    '!src/constants/**',
    '!src/hooks/use-color-scheme*',
    '!src/hooks/use-theme.ts',
    // useUpload is the React/UploadHandle bridge; unit-testing it in
    // isolation degenerates into asserting mocks. Covered by E2E.
    '!src/hooks/use-upload.ts',
    // Singleton wiring over upload-core; pure env reads.
    '!src/lib/manager.ts',
    // expo-file-system FileHandle is not mockable end-to-end under Jest.
    '!src/lib/expoFileSource.ts',
    // Native binary-upload transport; ditto.
    '!src/lib/expoUploadAdapter.ts',
    '!**/*.d.ts',
  ],
  coverageReporters: ['text', 'html', 'json-summary'],
  coverageThreshold: {
    global: {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    },
  },
};
