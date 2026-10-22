import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const FIREBASE_CLIENT = {
  group: ['firebase', 'firebase/*', '@firebase/*'],
  message: 'Access Firestore only through src/lib/repositories (CLAUDE.md rule 3).',
};
// Privacy (NFR-PRIV-04): the app never loads Google Analytics, even though the project has it linked.
const FIREBASE_ANALYTICS = {
  group: ['firebase/analytics', '@firebase/analytics'],
  message: 'Google Analytics is not used (NFR-PRIV-04).',
};
const FIREBASE_ADMIN = {
  group: ['firebase-admin', 'firebase-admin/*'],
  message:
    'firebase-admin is server-only: use it in src/lib/firebase/admin.ts, src/lib/server or src/app/api.',
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'next-env.d.ts',
  ]),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'type'],
          pathGroups: [{ pattern: '@/**', group: 'internal' }],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  // Layering: only repositories, the Firebase modules and server code may touch Firebase SDKs.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/lib/firebase/**',
      'src/lib/repositories/**',
      'src/lib/server/**',
      'src/app/api/**',
    ],
    rules: {
      'no-restricted-imports': ['error', { patterns: [FIREBASE_CLIENT, FIREBASE_ADMIN] }],
    },
  },
  // Code allowed to use Firebase SDKs still may not load Google Analytics.
  {
    files: [
      'src/lib/firebase/**/*.{ts,tsx}',
      'src/lib/server/**/*.{ts,tsx}',
      'src/app/api/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': ['error', { patterns: [FIREBASE_ANALYTICS] }],
    },
  },
  // Client-side Firebase code must never pull in the Admin SDK.
  {
    files: ['src/lib/firebase/client.ts', 'src/lib/repositories/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [FIREBASE_ADMIN, FIREBASE_ANALYTICS] }],
    },
  },
  // The domain layer is pure TypeScript (CLAUDE.md rule 5).
  {
    files: ['src/lib/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react/*',
                'react-dom',
                'react-dom/*',
                'next',
                'next/*',
                'firebase',
                'firebase/*',
                '@firebase/*',
                'firebase-admin',
                'firebase-admin/*',
                '@/features/*',
                '@/components/*',
                '@/stores/*',
                '@/lib/firebase/*',
                '@/lib/repositories/*',
                '@/lib/server/*',
              ],
              message: 'src/lib/domain must stay pure TypeScript (CLAUDE.md rule 5).',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'localStorage',
        'sessionStorage',
        'navigator',
      ],
    },
  },
]);
