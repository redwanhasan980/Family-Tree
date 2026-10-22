// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ERROR_STATUS, errorResponse, HttpError, json, readJson, route } from './http';

function post(body: string): Request {
  return new Request('http://localhost/api/test', { method: 'POST', body });
}

describe('HttpError', () => {
  it('takes its status from the error code', () => {
    expect(new HttpError('guest_not_allowed').status).toBe(403);
    expect(new HttpError('rate_limited').status).toBe(429);
    expect(new HttpError('not_found', 'No such tree').message).toBe('No such tree');
  });

  it('maps every code to a 4xx or 5xx status', () => {
    for (const status of Object.values(ERROR_STATUS)) expect(status).toBeGreaterThanOrEqual(400);
  });
});

describe('responses', () => {
  it('sends JSON that is never cached', async () => {
    const response = json({ ok: true }, { status: 201 });
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ ok: true });
  });

  it('formats errors as { error: { code, message } }', async () => {
    const response = errorResponse(new HttpError('forbidden', 'Not an editor'));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: 'forbidden', message: 'Not an editor' },
    });
  });
});

describe('readJson', () => {
  const Schema = z.strictObject({ treeId: z.string().min(1) });

  it('returns the validated body', async () => {
    await expect(readJson(post('{"treeId":"t1"}'), Schema)).resolves.toEqual({ treeId: 't1' });
  });

  it('rejects a body that is not JSON', async () => {
    await expect(readJson(post('not json'), Schema)).rejects.toMatchObject({
      code: 'invalid_request',
      message: 'Body must be JSON.',
    });
  });

  it('rejects unknown keys and names the bad fields, not their values', async () => {
    const error = await readJson(post('{"treeId":"","extra":"secret@example.com"}'), Schema).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).message).toContain('treeId');
    expect((error as HttpError).message).not.toContain('secret@example.com');
  });

  it('reports a wrong root type', async () => {
    await expect(readJson(post('[]'), Schema)).rejects.toMatchObject({
      message: 'Invalid fields: (root)',
    });
  });
});

describe('route', () => {
  afterEach(() => vi.restoreAllMocks());

  it('passes successful responses through', async () => {
    const handler = route('test', () => Promise.resolve(json({ ok: true })));
    expect((await handler(post('{}'), {})).status).toBe(200);
  });

  it('turns an HttpError into its error response', async () => {
    const handler = route('test', () => Promise.reject(new HttpError('not_found')));
    const response = await handler(post('{}'), {});
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: 'not_found', message: 'not_found' } });
  });

  it('hides unexpected errors behind "internal" and logs only the code', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handler = route('test', () => Promise.reject(new Error('db password is hunter2')));
    const response = await handler(post('{}'), {});
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('internal');
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(JSON.stringify(log.mock.calls)).not.toContain('hunter2');
  });
});
