import js from '@eslint/js';
import globals from 'globals';
import hooks from 'eslint-plugin-react-hooks';
import refresh from 'eslint-plugin-react-refresh';

export default [
  {
    ignores: [
      '.cache/**',
      '.tools/**',
      '.venv/**',
      'models/**',
      'results/**',
      'storage/**',
      'node_modules/**',
      'dist/**',
      '**/dist/**',
    ],
  },
  {
    files: ['**/*.mjs'],
    ...js.configs.recommended,
    languageOptions: { globals: globals.node },
  },
  {
    files: ['frontend/src/**/*.{jsx,mjs}'],
    ...js.configs.recommended,
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': hooks, 'react-refresh': refresh },
    rules: {
      ...js.configs.recommended.rules,
      ...hooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'error',
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ['frontend/public/audio-worker.js'],
    ...js.configs.recommended,
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ['frontend/test/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
