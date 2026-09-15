import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'packages/tokens/dist/**',
      'apps/api/prisma/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // An unused argument is usually a signature being honoured, so allow the
      // underscore convention rather than forcing a lint disable comment.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
    },
  },
  {
    // Seed and build scripts are operator tools; printing is the point.
    files: [
      '**/seed.mjs',
      'apps/api/scripts/**/*.mjs',
      'packages/tokens/src/build.mjs',
      '**/*.config.{js,mjs}',
    ],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.spec.ts'],
    languageOptions: { globals: { ...globals.jest } },
  },
  prettier,
);
