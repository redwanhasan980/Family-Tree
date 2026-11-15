import { afterEach, describe, expect, it, vi } from 'vitest';

async function siteWith(appUrl: string) {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', appUrl);
  vi.resetModules();
  return import('./site');
}

describe('SITE_URL', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('falls back to localhost when the build argument is empty (Docker without a value)', async () => {
    const { SITE_URL } = await siteWith('');
    expect(SITE_URL).toBe('http://localhost:3000');
    expect(() => new URL(SITE_URL)).not.toThrow();
  });

  it('uses the configured domain without a trailing slash', async () => {
    const { SITE_URL, localizedUrls } = await siteWith('https://shikor.example/');
    expect(SITE_URL).toBe('https://shikor.example');
    expect(localizedUrls('/help')).toMatchObject({
      bn: 'https://shikor.example/bn/help',
      en: 'https://shikor.example/en/help',
    });
  });
});
