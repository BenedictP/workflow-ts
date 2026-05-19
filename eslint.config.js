import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

// Base config for all files
const baseConfig = {
  rules: {
    ...js.configs.recommended.rules,
    'no-undef': 'off', // TypeScript handles this
    'no-unused-vars': 'off', // TypeScript handles this
    'no-redeclare': 'off', // TypeScript handles this
  },
};

// TypeScript files config
const tsConfig = {
  files: ['**/*.ts', '**/*.tsx'],
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      project: './tsconfig.base.json',
    },
    globals: {
      ...globals.node,
      ...globals.es2022,
      ...globals.browser,
    },
  },
  plugins: {
    '@typescript-eslint': tsPlugin,
    import: importPlugin,
  },
  rules: {
    // TypeScript strict rules
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': [
      'error',
      {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
      },
    ],
    '@typescript-eslint/explicit-module-boundary-types': 'error',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/no-unnecessary-condition': 'warn',
    '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
    '@typescript-eslint/prefer-nullish-coalescing': 'warn',
    '@typescript-eslint/prefer-optional-chain': 'error',
    '@typescript-eslint/strict-boolean-expressions': [
      'warn',
      {
        allowString: true,
        allowNumber: true,
        allowNullableObject: true,
      },
    ],
    '@typescript-eslint/no-unsafe-assignment': 'warn',
    '@typescript-eslint/no-unsafe-member-access': 'warn',
    '@typescript-eslint/no-unsafe-call': 'warn',
    '@typescript-eslint/no-unsafe-return': 'warn',
    '@typescript-eslint/restrict-template-expressions': [
      'error',
      {
        allowNumber: true,
      },
    ],
    '@typescript-eslint/no-confusing-void-expression': 'warn',
    '@typescript-eslint/no-empty-function': 'warn',
    '@typescript-eslint/require-await': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],

    // Import rules
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc' },
      },
    ],
    'import/no-duplicates': 'error',

    // General rules
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    eqeqeq: ['error', 'always'],
    'prefer-const': 'error',
    'prefer-template': 'error',
  },
  settings: {
    'import/resolver': {
      typescript: {},
    },
  },
};

// Test files config
const testConfig = {
  files: ['**/*.test.ts'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-unnecessary-condition': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/require-await': 'off',
    '@typescript-eslint/no-confusing-void-expression': 'off',
    '@typescript-eslint/restrict-template-expressions': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
  },
};

// MJS files config
const mjsConfig = {
  files: ['**/*.mjs'],
  languageOptions: {
    globals: globals.node,
  },
};

// Ignores
const ignoresConfig = {
  ignores: [
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    '**/*.config.js',
    '**/*.config.mjs',
    '**/*.config.cjs',
  ],
};

export default [
  ignoresConfig,
  baseConfig,
  tsConfig,
  testConfig,
  mjsConfig,
  { rules: prettier.rules },
];
