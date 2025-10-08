import js from '@eslint/js';
import globals from 'globals';
import shopify from '@shopify/eslint-plugin';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tailwindcss from 'eslint-plugin-tailwindcss';
import yml from 'eslint-plugin-yml';
import yamlParser from 'yaml-eslint-parser';

export default [
  // Base configuration
  js.configs.recommended,
  {
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: [
          './packages/web/tsconfig.json',
          './packages/cdk/tsconfig.json',
          './packages/common/tsconfig.json',
        ],
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      '@shopify': shopify,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      '@typescript-eslint/no-namespace': 'off',
      '@shopify/jsx-no-hardcoded-content': 'warn',
    },
  },
  // Web package specific configuration
  {
    files: ['packages/web/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-refresh': reactRefresh,
      'react-hooks': reactHooks,
      tailwindcss: tailwindcss,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
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
    languageOptions: {
      parser: yamlParser,
    },
    plugins: {
      yml: yml,
    },
    rules: {
      ...yml.configs.standard.rules,
      'yml/sort-keys': 'error',
      'yml/quotes': ['error', { prefer: 'single', avoidEscape: true }],
    },
  },
  // Test files configuration
  {
    files: ['**/*.test.{ts,js}', '**/*.spec.{ts,js}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
  },
  // Global ignores
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cdk.out/**',
      '**/custom-resources/**',
      'eslint.config.js',
    ],
  },
];
