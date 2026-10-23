import { describe, expect, it } from 'vitest';

import {
  decisionFor,
  DeleteAccountRequestSchema,
  isRecentLogin,
  MergeRequestSchema,
  parsePendingMerge,
  RECENT_LOGIN_MS,
} from './account';

const now = new Date('2026-10-23T12:00:00Z');
const pending = {
  ticketId: 'ticket1',
  expiresAt: '2026-10-24T11:00:00.000Z',
  guestUid: 'guest1',
  trees: [{ id: 'tree1', name: 'করিম পরিবার', personCount: 12 }],
};

describe('parsePendingMerge', () => {
  it('reads a stored pending merge until it expires', () => {
    expect(parsePendingMerge(JSON.stringify(pending), now)).toEqual(pending);
    expect(parsePendingMerge(JSON.stringify(pending), new Date('2026-10-24T11:00:00Z'))).toBe(null);
  });

  it('ignores missing, broken and malformed values', () => {
    expect(parsePendingMerge(null, now)).toBe(null);
    expect(parsePendingMerge('{not json', now)).toBe(null);
    expect(parsePendingMerge(JSON.stringify({ ...pending, trees: [] }), now)).toBe(null);
    expect(parsePendingMerge(JSON.stringify({ ...pending, ticketId: '../x' }), now)).toBe(null);
    expect(parsePendingMerge(JSON.stringify({ ...pending, expiresAt: 'soon' }), now)).toBe(null);
  });
});

describe('request schemas', () => {
  it('accepts merge decisions and rejects unknown keys or bad IDs', () => {
    const body = { ticketId: 'ticket1', decisions: [{ treeId: 'tree1', action: 'discard' }] };
    expect(MergeRequestSchema.safeParse(body).success).toBe(true);
    expect(MergeRequestSchema.safeParse({ ...body, extra: 1 }).success).toBe(false);
    expect(
      MergeRequestSchema.safeParse({ ...body, decisions: [{ treeId: 'a/b', action: 'move' }] })
        .success,
    ).toBe(false);
    expect(
      MergeRequestSchema.safeParse({ ...body, decisions: [{ treeId: 'a', action: 'keep' }] })
        .success,
    ).toBe(false);
  });

  it('needs an explicit confirmation to delete an account', () => {
    expect(DeleteAccountRequestSchema.safeParse({ confirm: true }).success).toBe(true);
    expect(DeleteAccountRequestSchema.safeParse({ confirm: 'yes' }).success).toBe(false);
    expect(DeleteAccountRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('helpers', () => {
  it('treats a sign-in within five minutes as recent', () => {
    const seconds = (ms: number) => Math.floor(ms / 1000);
    expect(isRecentLogin(seconds(now.getTime() - RECENT_LOGIN_MS), now)).toBe(true);
    expect(isRecentLogin(seconds(now.getTime() - RECENT_LOGIN_MS - 1000), now)).toBe(false);
  });

  it('moves trees without a decision', () => {
    const decisions = [{ treeId: 'a', action: 'discard' as const }];
    expect(decisionFor(decisions, 'a')).toBe('discard');
    expect(decisionFor(decisions, 'b')).toBe('move');
  });
});
