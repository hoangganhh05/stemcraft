import js from '@eslint/js';
import globals from 'globals';

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
    ],
  },
  {
    files: ['**/*.mjs'],
    ...js.configs.recommended,
    languageOptions: { globals: globals.node },
  },
];
