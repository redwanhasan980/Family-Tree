// Pure domain types shared by client, server, import/export and tests (DESIGN §6).

export type ID = string;
export type Locale = 'bn' | 'en';
export type ThemePreference = 'system' | 'light' | 'dark';
export type Gender = 'male' | 'female' | 'unknown';
export type Role = 'owner' | 'editor' | 'viewer';
export type ViewKind = 'tree' | 'family' | 'circle' | 'list' | 'album' | 'timeline';

/** Who wrote a document and when. Every person, relationship and tree carries these. */
export interface Stamps {
  createdAt: Date;
  createdBy: ID;
  updatedAt: Date;
  updatedBy: ID;
}

/** Year only, year and month, or a full date. People often know only the year. */
export interface PartialDate {
  year: number;
  /** 1–12 */
  month?: number;
  /** 1–31, valid for the month; only with a month. */
  day?: number;
  /** "circa": the date is a guess. */
  approximate?: boolean;
}

/** A person's name in English and/or Bangla; at least one is non-empty. */
export interface LocalizedName {
  en?: string;
  bn?: string;
}

export interface LifeEvent {
  date?: PartialDate;
  place?: string;
}

/** A Cloudinary image. URLs are derived from it and never stored (DESIGN §15.1). */
export interface PhotoRef {
  /** shikor/{env}/{treeId}/{personId}/{random} */
  publicId: string;
  /** Cloudinary version, for cache-busting. */
  version: number;
  width: number;
  height: number;
}

export interface CustomField {
  id: string;
  label: string;
  value: string;
}

export interface Addresses {
  present?: string;
  permanent?: string;
}

/** The fields a person's details can hold (PER-02, PER-03), without the stamps. */
export interface PersonDetails {
  names: LocalizedName;
  /** ডাকনাম */
  nickname?: string;
  gender: Gender;
  isLiving: boolean;
  birth?: LifeEvent;
  death?: LifeEvent;
  profession?: string;
  education?: string;
  addresses?: Addresses;
  phones?: string[];
  email?: string;
  description?: string;
  photo?: PhotoRef | null;
  customFields?: CustomField[];
  /** Sibling sort key (fractional index). Falls back to birth date, then createdAt. */
  childOrder?: number;
}

/** trees/{treeId}/persons/{personId} */
export interface Person extends PersonDetails, Stamps {
  id: ID;
  schemaVersion: 1;
}

export type ParentKind = 'biological' | 'adoptive' | 'step' | 'foster';
export type SpouseStatus = 'married' | 'divorced' | 'separated' | 'widowed';

export type ParentLinkId = `p_${string}_${string}`;
export type SpouseLinkId = `s_${string}_${string}`;

/** trees/{treeId}/relationships/p_{parentId}_{childId} */
export interface ParentLink extends Stamps {
  id: ParentLinkId;
  type: 'parent';
  parentId: ID;
  childId: ID;
  kind: ParentKind;
  schemaVersion: 1;
}

/** trees/{treeId}/relationships/s_{minId}_{maxId} */
export interface SpouseLink extends Stamps {
  id: SpouseLinkId;
  type: 'spouse';
  /** Sorted ascending, so a couple always has the same document. */
  personIds: [ID, ID];
  status: SpouseStatus;
  marriageDate?: PartialDate;
  /** Marriage order when dates are unknown (1 = first marriage). */
  sequence?: number;
  schemaVersion: 1;
}

export type Relationship = ParentLink | SpouseLink;

export type NameDisplay = 'auto' | 'en' | 'bn' | 'both';
export type ColorBy = 'branch' | 'gender' | 'generation' | 'none';
export type KinshipStyle = 'bd' | 'wb';

export interface TreeSettings {
  /** auto = the UI language, falling back to the other. */
  nameDisplay: NameDisplay;
  colorBy: ColorBy;
  showPhotos: boolean;
  showDates: boolean;
  defaultView: ViewKind;
  /** Bangladesh or West Bengal kinship terms (R4). */
  kinshipStyle: KinshipStyle;
}

/** trees/{treeId} */
export interface Tree {
  id: ID;
  name: string;
  description?: string;
  ownerId: ID;
  /** For array-contains queries; always the keys of `roles`. */
  memberIds: ID[];
  /** Authoritative roles. */
  roles: Record<ID, Role>;
  rootPersonId?: ID;
  /** Maintained with increment() in the same batch as person creation and deletion. */
  personCount: number;
  settings: TreeSettings;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: ID;
  schemaVersion: 1;
}

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

/** A problem found by validation. The UI maps `code` to a message (DESIGN §12.5). */
export interface Issue {
  severity: 'error' | 'warning';
  code: string;
  params?: Record<string, string | number>;
}
