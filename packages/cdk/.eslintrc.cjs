module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  ignorePatterns: ['cdk.out', '.eslintrc.cjs', 'custom-resources/**', 'dist'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint', '@shopify'],
  rules: {
    '@typescript-eslint/no-namespace': 'off',
    // Apply JSX rules
    '@shopify/jsx-no-hardcoded-content': 'warn',
  },
};
