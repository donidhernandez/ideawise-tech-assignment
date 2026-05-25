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
  // Transform any file under node_modules that mentions react-native / expo /
  // workspace packages in its full path. The negative lookahead approach
  // handles both flat node_modules and pnpm's `.pnpm/<pkg>+<ver>/...` layout.
  transformIgnorePatterns: [
    'node_modules/(?!.*(?:react-native|expo|@unimodules|@react-native-async-storage|@repo)).*',
  ],
};
