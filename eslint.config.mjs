// @ts-check

import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**/*', '**/dist/**/*', '**/coverage/**/*'],
  },
  {
    files: ['**/*.{ts,tsx}'],

    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      eslintPluginPrettierRecommended,
    ],

    languageOptions: {
      parserOptions: {
        project: true,
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],

    rules: {
      // When implementing an interface, certain (possibly synchronously implemented) methods must
      // return a promise, and it is more convenient to mark them as async than to return
      // Promise.resolve()/Promise.reject() explicitly.
      '@typescript-eslint/require-await': 'off',

      '@typescript-eslint/no-unnecessary-condition': [
        'error',
        {
          // 'while(true)' is commonly used in e.g. generators. I don't understand why this is not true by default.
          allowConstantLoopConditions: true,
        },
      ],

      // We do want to error when snake case is used in order to enforce a consistent style,
      // especially when working with systems that use other conventions.
      camelcase: 'off',
      '@typescript-eslint/naming-convention': [
        'error',
        // Default TSESLint naming conventions:
        {
          selector: 'default',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allow',
        },

        {
          selector: 'import',
          format: ['camelCase', 'PascalCase'],
        },

        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allow',
        },

        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },

        // Allow any format if quoted:
        {
          selector: ['property'],
          format: null,
          modifiers: ['requiresQuotes'],
        },

        // PascalCase for enum members:
        {
          selector: 'enumMember',
          format: ['PascalCase'],
        },
      ],

      '@typescript-eslint/unified-signatures': [
        'error',
        {
          // If named differently, the parameters have different semantics, so this is not a problem,
          // and union-ing the types would make the code less readable. I don't understand why this is not true by default.
          ignoreDifferentlyNamedParameters: true,
        },
      ],

      '@typescript-eslint/no-invalid-void-type': [
        'error',
        {
          // '@typescript-eslint/unbound-method' requires methods be annotated with 'this: void' for safe
          // unbound use. I don't understand why this is not true by default.
          allowAsThisParameter: true,
        },
      ],

      // This is a fine interpolation that's commonly used
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: true,
        },
      ],

      '@typescript-eslint/no-empty-interface': [
        'error',
        {
          // Not sure why this is off by default. An interface with extends does very well have a semantic purpose.
          allowSingleExtends: true,
        },
      ],

      // This seems like a useful rule to reduce confusion, wonder why it's not on by default.
      '@typescript-eslint/no-shadow': 'error',

      // Makes all functions show up in stack traces
      '@typescript-eslint/return-await': ['error', 'always'],

      // Stylistic choices made by me
      'func-style': ['error', 'declaration'],
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
  {
    files: [
      '**/__tests__/**/*',
      '**/__utils__/**/*',
      '**/*.spec.{ts,tsx}',
      '**/*.fake.{ts,tsx}',
      '**/__utils__.{ts,tsx}',
    ],

    rules: {
      // Using 'any' is fine in tests.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'off',

      // It is very common to use 'expect(mock.mockMethod).toX()' in tests, for which jest
      // makes sure that 'this' is no problem.
      '@typescript-eslint/unbound-method': 'off',

      // Safety is less important in tests.
      '@typescript-eslint/no-non-null-assertion': 'off',

      // When mocking a system that uses a different naming convention, it may be necessary to name things weirdly.
      '@typescript-eslint/naming-convention': 'off',

      // For mocks, empty callbacks, etc. it's common to have empty functions.
      '@typescript-eslint/no-empty-function': 'off',

      // When calling `mock.calls[0][0]`, destructuring is less readable, imo.
      '@typescript-eslint/prefer-destructuring': 'off',

      // Shadowing is fine in tests and often used to shadow a "global" beforeEach implementation in a single test case
      '@typescript-eslint/no-shadow': 'off',
    },
  },
);
