import type { ID, Person } from './types';

/**
 * Search text normalization (DESIGN §16.5, I18N-04): Unicode NFC, lower case, no
 * zero-width characters (Bangla keyboards insert ZWJ/ZWNJ), single spaces.
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[​-‍﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 0 = exact, 1 = prefix, 2 = a word starts with it, 3 = contains it. */
export type MatchRank = 0 | 1 | 2 | 3;

function rankOf(text: string, query: string): MatchRank | null {
  if (!text) return null;
  if (text === query) return 0;
  if (text.startsWith(query)) return 1;
  if (text.split(' ').some((word) => word.startsWith(query))) return 2;
  return text.includes(query) ? 3 : null;
}

export interface SearchHit {
  personId: ID;
  rank: MatchRank;
  /** Which name matched best. */
  field: 'en' | 'bn' | 'nickname';
}

/**
 * Finds people by English name, Bangla name or nickname, best matches first, at most
 * `limit` results. Ties keep the input order, so callers can pre-sort (for example by
 * generation).
 */
export function searchPersons(persons: Iterable<Person>, query: string, limit = 20): SearchHit[] {
  const q = normalizeSearchText(query);
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const person of persons) {
    let best: SearchHit | null = null;
    for (const field of ['en', 'bn', 'nickname'] as const) {
      const value = field === 'nickname' ? person.nickname : person.names[field];
      const rank = rankOf(normalizeSearchText(value ?? ''), q);
      if (rank !== null && (!best || rank < best.rank)) best = { personId: person.id, rank, field };
    }
    if (best) hits.push(best);
  }
  // Array.prototype.sort is stable, so equal ranks keep their input order.
  return hits.sort((a, b) => a.rank - b.rank).slice(0, limit);
}
