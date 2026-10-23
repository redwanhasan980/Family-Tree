import type { ViewKind } from '@/lib/domain/types';

/**
 * Staged views and outputs (ADR-014). Their code can merge early while production users
 * see only released features. Previews can switch them on with a comma-separated list in
 * NEXT_PUBLIC_FEATURES, for example "album,timeline".
 */
export type Feature = 'album' | 'timeline' | 'familyBook';

const RELEASED: Record<Feature, boolean> = {
  album: false, // R2 (v1.1)
  timeline: false, // R3 (v1.2)
  familyBook: false, // R3 (v1.2)
};

function overrides(): Set<string> {
  // Read statically so Next.js inlines it into the browser bundle.
  return new Set((process.env.NEXT_PUBLIC_FEATURES ?? '').split(',').map((f) => f.trim()));
}

export function isEnabled(feature: Feature): boolean {
  return RELEASED[feature] || overrides().has(feature);
}

/** Views in navigation order (DESIGN §13.10). */
const VIEWS: { view: ViewKind; feature?: Feature }[] = [
  { view: 'tree' },
  { view: 'family' },
  { view: 'circle' },
  { view: 'list' },
  { view: 'album', feature: 'album' },
  { view: 'timeline', feature: 'timeline' },
];

export function enabledViews(): ViewKind[] {
  return VIEWS.filter((v) => !v.feature || isEnabled(v.feature)).map((v) => v.view);
}
