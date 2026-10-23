'use client';

import { useUi } from '@/stores/uiStore';

import { DirectoryView } from './DirectoryView';
import { OutlineView } from './OutlineView';

/** The List view (DESIGN §13.5): family lines (LV-01..03) or everyone (LV-04). */
export function ListView() {
  const mode = useUi((s) => s.listMode);
  return mode === 'directory' ? <DirectoryView /> : <OutlineView />;
}
