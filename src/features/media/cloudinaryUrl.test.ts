import { describe, expect, it } from 'vitest';

import { photosEnabled, photoUrl } from './cloudinaryUrl';

const photo = { publicId: 'shikor/prod/t1/p1/abcdefgh1234', version: 17, width: 900, height: 900 };

describe('photoUrl (DESIGN §15.3)', () => {
  it('builds versioned delivery URLs per size', () => {
    expect(photoUrl(photo, 'thumb', 'family')).toBe(
      'https://res.cloudinary.com/family/image/upload/c_fill,g_face,w_192,h_192/f_auto,q_auto/v17/shikor/prod/t1/p1/abcdefgh1234',
    );
    expect(photoUrl(photo, 'full', 'family')).toContain(
      '/c_limit,w_1600,h_1600/f_auto,q_auto/v17/',
    );
    expect(photoUrl(photo, 'export', 'family')).toContain('/f_jpg,q_85/');
  });

  it('gives nothing when photos are not set up', () => {
    expect(photoUrl(photo, 'thumb', '')).toBeNull();
    expect(photosEnabled('')).toBe(false);
    expect(photosEnabled('family')).toBe(true);
  });
});
