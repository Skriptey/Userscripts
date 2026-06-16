// Flat ESLint config. Lints the Node tooling and the browser userscripts, each
// with the right globals. Formatting is owned by Prettier (.prettierrc.json);
// eslint-config-prettier (listed last) turns off any rules that would conflict.
import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['site/**', 'node_modules/**'] },

  js.configs.recommended,

  // Node ESM tooling under tools/ (and this config file itself).
  {
    files: ['tools/**/*.mjs', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  // Userscripts run in the page with userscript-manager APIs available.
  // They are classic scripts (IIFE), not modules.
  {
    files: ['scripts/**/*.user.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.greasemonkey },
    },
    rules: {
      'no-unused-vars': 'warn',
    },
  },

  prettier,
];
