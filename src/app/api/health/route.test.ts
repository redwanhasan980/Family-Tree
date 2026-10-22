// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

describe('GET /api/health', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports ok with the build version and is never cached', async () => {
    vi.stubEnv('APP_VERSION', 'abc1234');
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok', version: 'abc1234' });
  });

  it('falls back to "dev" outside a release build', async () => {
    vi.stubEnv('APP_VERSION', undefined);
    expect(await GET().json()).toEqual({ status: 'ok', version: 'dev' });
  });
});
