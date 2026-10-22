// Pure domain types shared by client, server and tests (DESIGN §6).
// Tree, person and relationship types are added in Phase 2.

export type ID = string;
export type Locale = 'bn' | 'en';
export type ThemePreference = 'system' | 'light' | 'dark';

/** users/{uid} — one per Firebase Auth user, guests included. */
export interface UserProfile {
  uid: ID;
  isGuest: boolean;
  displayName?: string;
  email?: string;
  photoURL?: string;
  locale: Locale;
  theme: ThemePreference;
  /** treeId → personId marked "This is me" (PER-10). */
  selfPersonIds: Record<ID, ID>;
  onboardingCompleted: boolean;
  createdAt: Date;
  /** Written at most once a day; drives guest retention (AUTH-14). */
  lastActiveAt: Date;
  schemaVersion: 1;
}
