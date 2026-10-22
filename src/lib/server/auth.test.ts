// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { verifyRequest } from './auth';

const admin = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  verifyAppCheck: vi.fn(),
  emulated: false,
}));

vi.mock('@/lib/firebase/admin', () => ({
  usesEmulators: () => admin.emulated,
  getAdminAuth: () => ({ verifyIdToken: admin.verifyIdToken }),
  getAdminAppCheck: () => ({ verifyToken: admin.verifyAppCheck }),
}));

function request(headers: Record<string, string>): Request {
  return new Request('http://localhost/api/test', { method: 'POST', headers });
}

function decoded(uid: string, provider: string) {
  return { uid, firebase: { sign_in_provider: provider } };
}

const AUTH = { authorization: 'Bearer id-token' };

beforeEach(() => {
  admin.emulated = false;
  admin.verifyIdToken.mockResolvedValue(decoded('user-1', 'password'));
  admin.verifyAppCheck.mockResolvedValue({ appId: 'app' });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('verifyRequest: ID token', () => {
  it('accepts a registered user and checks revocation', async () => {
    const result = await verifyRequest(request(AUTH));
    expect(result).toMatchObject({ uid: 'user-1', isGuest: false });
    expect(admin.verifyIdToken).toHaveBeenCalledWith('id-token', true);
  });

  it.each<Record<string, string>>([
    {},
    { authorization: 'Basic abc' },
    { authorization: 'Bearer ' },
  ])('rejects a missing or malformed Authorization header (%j)', async (headers) => {
    await expect(verifyRequest(request(headers))).rejects.toMatchObject({
      code: 'unauthenticated',
      status: 401,
    });
    expect(admin.verifyIdToken).not.toHaveBeenCalled();
  });

  it.each(['auth/id-token-expired', 'auth/id-token-revoked', 'auth/argument-error'])(
    'rejects a bad token (%s) with 401',
    async (code) => {
      admin.verifyIdToken.mockRejectedValue({ code });
      await expect(verifyRequest(request(AUTH))).rejects.toMatchObject({ code: 'unauthenticated' });
    },
  );

  it('lets infrastructure failures surface as server errors', async () => {
    const failure = { code: 'app/network-error' };
    admin.verifyIdToken.mockRejectedValue(failure);
    await expect(verifyRequest(request(AUTH))).rejects.toBe(failure);
  });

  it('refuses guests unless the route allows them', async () => {
    admin.verifyIdToken.mockResolvedValue(decoded('guest-1', 'anonymous'));
    await expect(verifyRequest(request(AUTH))).rejects.toMatchObject({
      code: 'guest_not_allowed',
      status: 403,
    });
    await expect(verifyRequest(request(AUTH), { allowGuest: true })).resolves.toMatchObject({
      uid: 'guest-1',
      isGuest: true,
    });
  });
});

describe('verifyRequest: App Check', () => {
  it('is skipped with the emulators', async () => {
    admin.emulated = true;
    vi.stubEnv('NEXT_PUBLIC_RECAPTCHA_SITE_KEY', 'site-key');
    await expect(verifyRequest(request(AUTH))).resolves.toMatchObject({ uid: 'user-1' });
    expect(admin.verifyAppCheck).not.toHaveBeenCalled();
  });

  it('is optional until the client has a reCAPTCHA key', async () => {
    vi.stubEnv('NEXT_PUBLIC_RECAPTCHA_SITE_KEY', '');
    await expect(verifyRequest(request(AUTH))).resolves.toMatchObject({ uid: 'user-1' });
  });

  it('is required once the client has a reCAPTCHA key', async () => {
    vi.stubEnv('NEXT_PUBLIC_RECAPTCHA_SITE_KEY', 'site-key');
    await expect(verifyRequest(request(AUTH))).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(admin.verifyIdToken).not.toHaveBeenCalled();
  });

  it('accepts a valid token', async () => {
    vi.stubEnv('NEXT_PUBLIC_RECAPTCHA_SITE_KEY', 'site-key');
    const headers = { ...AUTH, 'x-firebase-appcheck': 'app-check-token' };
    await expect(verifyRequest(request(headers))).resolves.toMatchObject({ uid: 'user-1' });
    expect(admin.verifyAppCheck).toHaveBeenCalledWith('app-check-token');
  });

  it('rejects an invalid token, even before enforcement', async () => {
    admin.verifyAppCheck.mockRejectedValue(new Error('bad'));
    const headers = { ...AUTH, 'x-firebase-appcheck': 'forged' };
    await expect(verifyRequest(request(headers))).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });
});
