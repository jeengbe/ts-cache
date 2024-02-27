// @ts-check

/**
 * @type {import('jest').Config}
 */
const config = {
  coverageReporters: ['lcov', 'text', 'cobertura'],
  verbose: true,
  transform: {
    '^.+\\.ts?$': '@swc/jest',
  },
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['<rootDir>/src/**/*.ts', '!**/__utils__/**/*'],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*',
    '!**/__utils__/**/*',
    '!**/__snapshots__/**/*',
  ],
};

module.exports = config;
