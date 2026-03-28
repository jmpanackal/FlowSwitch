const js = require('@eslint/js');
const globals = require('globals');
module.exports = [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.cursor/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // The current codebase has known legacy unused vars;
      // keep lint usable while we incrementally clean these up.
      'no-unused-vars': 'warn',
    },
  },
];
