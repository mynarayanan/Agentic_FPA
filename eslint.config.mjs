import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// "The LLM never does math" is enforced here: the engine may not import I/O, DB or LLM libraries.
const ENGINE_FORBIDDEN = [
  'node:*',
  'fs',
  'http',
  'https',
  'net',
  'child_process',
  'pg',
  '@neondatabase/*',
  'drizzle-orm*',
  '@anthropic-ai/*',
  'ai',
  'openai',
  'next*',
  'react*',
  'axios',
  'undici',
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/coverage/**',
      'data/fixtures/**',
      'apps/web/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['packages/engine/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ENGINE_FORBIDDEN }],
      'no-restricted-globals': ['error', 'fetch', 'process', 'Date'],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Engine must be deterministic.' },
        { object: 'Date', property: 'now', message: 'Engine must be deterministic.' },
      ],
    },
  },
);
