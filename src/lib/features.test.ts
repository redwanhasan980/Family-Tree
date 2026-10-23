import { afterEach, describe, expect, it, vi } from 'vitest';

import { enabledViews, isEnabled } from './features';

afterEach(() => vi.unstubAllEnvs());

describe('feature flags (ADR-014)', () => {
  it('hides the staged views by default', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURES', '');
    expect(isEnabled('album')).toBe(false);
    expect(enabledViews()).toEqual(['tree', 'family', 'circle', 'list']);
  });

  it('lets previews switch them on', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURES', 'timeline, familyBook');
    expect(isEnabled('timeline')).toBe(true);
    expect(isEnabled('familyBook')).toBe(true);
    expect(enabledViews()).toEqual(['tree', 'family', 'circle', 'list', 'timeline']);
  });
});
