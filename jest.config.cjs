module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
    transform: {
      '^.+\.ts
$': 'ts-jest',
  },
  moduleNameMapper: {
    '^(\.{1,2}/.*)\.js$': '$1',
  },
};
