import { describe, expect, it } from 'vitest';

import { DEFAULT_OPTIONS, readRemembered, toRemembered } from './options';

describe('remembered export options (P7-01)', () => {
  it('remembers the choices, not the titles or the view', () => {
    const options = {
      ...DEFAULT_OPTIONS,
      format: 'pdf' as const,
      paper: 'a3' as const,
      quality: 3 as const,
      title: 'Karim family',
      view: 'circle' as const,
    };
    const raw = toRemembered(options);
    expect(raw).not.toContain('Karim');
    expect(readRemembered(raw)).toEqual({
      ...DEFAULT_OPTIONS,
      format: 'pdf',
      paper: 'a3',
      quality: 3,
      title: undefined,
      subtitle: undefined,
      view: undefined,
    });
  });

  it('ignores broken or unknown values', () => {
    expect(readRemembered('{')).toEqual({});
    expect(readRemembered(null).format).toBe('png');
    expect(readRemembered('"text"').paper).toBe('a4');
    expect(
      readRemembered(JSON.stringify({ quality: 9, paper: 'b5', photos: 'yes' })),
    ).toMatchObject({
      quality: 2,
      paper: 'a4',
      photos: true,
    });
  });
});
