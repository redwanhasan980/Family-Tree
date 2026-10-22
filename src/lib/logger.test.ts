import { afterEach, describe, expect, it, vi } from 'vitest';

import { logger } from './logger';

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs only the error code, not the message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('auth.link', { code: 'auth/x', message: 'secret@example.com' }, { step: 1 });
    expect(spy).toHaveBeenCalledWith('[শিকড়] auth.link', { step: 1, code: 'auth/x' });
  });

  it('uses the error name for plain errors and nothing for other values', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('a', new TypeError('details'));
    logger.error('b', 'text');
    logger.error('c', { code: 7 });
    expect(spy.mock.calls.map((c) => c[1])).toEqual([
      { code: 'TypeError' },
      { code: undefined },
      { code: undefined },
    ]);
  });

  it('warns with context', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('offline', { attempt: 2 });
    expect(spy).toHaveBeenCalledWith('[শিকড়] offline', { attempt: 2 });
  });
});
