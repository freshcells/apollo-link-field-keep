module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'import'],
  env: {
    browser: true,
    node: true,
    es6: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  rules: {
    'import/order': ['error', { groups: ['builtin', 'external', 'parent', 'sibling', 'index'] }],
    '@typescript-eslint/member-delimiter-style': 'off',
    '@typescript-eslint/ban-ts-ignore': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/camelcase': 'off'
  },
  settings: {
    react: {
      version: 'detect',
    },
    'import/external-module-folders': ['.yarn']
  },
}
