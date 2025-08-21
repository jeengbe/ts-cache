// @ts-check

/**
 * @type {import('jest').Config}
 */
const config = {
  coverageReporters: ['lcov', 'text', 'cobertura'],
  verbose: true,
  transform: {
    '^.+\\.ts?$': [
      '@swc/jest',
      {
        jsc: {
          parser: {
            syntax: 'typescript',
            decorators: true,
          },
        },
      },
    ],
  },
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    '<rootDir>/src/**/*.{ts,tsx}',
    '!**/__utils__/**/*',
    '!**/*.fake.ts',
    '!**/__utils__.ts',
  ],
  testMatch: [
    '<rootDir>/src/**/*.spec.{ts,tsx}',
    '!**/__utils__/**/*',
    '!**/__snapshots__/**/*',
  ],
};

module.exports = config;
