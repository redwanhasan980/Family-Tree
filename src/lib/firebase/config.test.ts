import { describe, expect, it } from 'vitest';

import { EMULATOR_PROJECT_ID, parseFirebaseConfig } from './config';

describe('parseFirebaseConfig', () => {
  it('falls back to the demo project when emulators are on', () => {
    const { config, useEmulators } = parseFirebaseConfig({ NEXT_PUBLIC_USE_EMULATORS: 'true' });
    expect(useEmulators).toBe(true);
    expect(config.projectId).toBe(EMULATOR_PROJECT_ID);
  });

  it('uses the provided values', () => {
    const { config, useEmulators } = parseFirebaseConfig({
      NEXT_PUBLIC_FIREBASE_API_KEY: 'key',
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'shikor.app',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'shikor-prod',
      NEXT_PUBLIC_FIREBASE_APP_ID: '1:2:web:3',
    });
    expect(useEmulators).toBe(false);
    expect(config).toEqual({
      apiKey: 'key',
      authDomain: 'shikor.app',
      projectId: 'shikor-prod',
      appId: '1:2:web:3',
    });
  });

  it('names the missing variables when not using emulators', () => {
    expect(() => parseFirebaseConfig({ NEXT_PUBLIC_FIREBASE_API_KEY: 'key' })).toThrow(
      /authDomain, projectId, appId/,
    );
  });
});
