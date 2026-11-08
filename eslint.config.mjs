import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import next from 'eslint-config-next/core-web-vitals';

const config = [
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/next-env.d.ts',
      'test-results/**',
      'playwright-report/**',
      '.local/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...next,
  {
    settings: { next: { rootDir: 'apps/web/' } },
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly' } },
  },
];
export default config;
