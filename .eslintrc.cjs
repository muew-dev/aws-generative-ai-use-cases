module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
  ],
  ignorePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/cdk.out/**',
    '**/custom-resources/**',
    '.eslintrc.cjs',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: [
      './packages/web/tsconfig.json',
      './packages/cdk/tsconfig.json',
      './packages/common/tsconfig.json',
    ],
  },
  plugins: ['@typescript-eslint', '@shopify'],
  rules: {
    '@typescript-eslint/no-namespace': 'off',
    '@shopify/jsx-no-hardcoded-content': 'warn',
  },
  overrides: [
    // Web package specific configuration
    {
      files: ['packages/web/**/*.{ts,tsx,js,jsx}'],
      env: { browser: true, es2020: true },
      extends: [
        'plugin:react-hooks/recommended',
        'plugin:tailwindcss/recommended',
      ],
      plugins: ['react-refresh', 'react-hooks', 'tailwindcss'],
      rules: {
        'react-refresh/only-export-components': [
          'warn',
          { allowConstantExport: true },
        ],
        'tailwindcss/classnames-order': 'off',
        'tailwindcss/enforces-shorthand': 'off',
      },
      settings: {
        tailwindcss: {
          whitelist: ['w-', 'h-'],
        },
      },
    },
    // YAML configuration for web package
    {
      files: ['packages/web/**/*.{yaml,yml}'],
      extends: ['plugin:yml/standard'],
      parser: 'yaml-eslint-parser',
      plugins: ['yml'],
      rules: {
        'yml/sort-keys': 'error',
        'yml/quotes': ['error', { prefer: 'single', avoidEscape: true }],
      },
    },
  ],
};