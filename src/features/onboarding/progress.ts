'use client';

import type { ViewKind } from '@/lib/domain/types';

/**
 * What this browser remembers about getting started (ONB-02, ONB-03): that the wizard is
 * done (so it doesn't flash while the profile loads; the profile keeps it for good) and
 * which views' tips were seen. A convenience only: storage may be blocked or cleared.
 */
const WIZARD_KEY = 'shikor:onboarding';
const TIPS_KEY = 'shikor:tips';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not remembered this time.
  }
}

export const wizardDoneHere = () => read(WIZARD_KEY) === 'done';
export const markWizardDoneHere = () => write(WIZARD_KEY, 'done');

export function tipsSeen(): ViewKind[] {
  try {
    const seen: unknown = JSON.parse(read(TIPS_KEY) ?? '[]');
    return Array.isArray(seen) ? (seen as ViewKind[]) : [];
  } catch {
    return [];
  }
}

export function markTipsSeen(view: ViewKind): void {
  const seen = new Set(tipsSeen());
  seen.add(view);
  write(TIPS_KEY, JSON.stringify([...seen]));
}

/**
 * The tree the wizard just made (ONB-02 ③④): the editor opens "Add children" and the
 * tips for it. In memory only, so a reload doesn't start the welcome again.
 */
let welcomeTree: string | null = null;
export const welcomeTo = (treeId: string) => {
  welcomeTree = treeId;
};
export const isWelcome = (treeId: string) => welcomeTree === treeId;
export const welcomeDone = () => {
  welcomeTree = null;
};
