import { formatYear } from '@/lib/domain/dates';
import { dAboville, type DescNode, type DescPartner } from '@/lib/domain/graph';
import type { ID, Locale } from '@/lib/domain/types';

/** One row of the List view's outline (LV-01, DESIGN §13.5). */
export interface OutlineRow {
  /** The descendant node's path key, unique per occurrence. */
  key: string;
  personId: ID;
  /** 0 = the person the outline starts from. */
  depth: number;
  /** d'Aboville number: 1, 1.1, 1.1.2 … */
  number: string;
  partners: readonly DescPartner[];
  /** Has descendants, shown or not. */
  expandable: boolean;
  expanded: boolean;
  /** Descendants hidden under a collapsed row. */
  hiddenCount: number;
  /** A repeated person (VIS-09): the row links to their first one. */
  isRef: boolean;
  parentKey: string | null;
  parentId: ID | null;
  /** The other parent the child is listed under, when the parent has one. */
  viaPartnerId: ID | null;
  /** Whether the parent has children with more than one partner (or an unknown one). */
  parentHasFamilies: boolean;
  /** 1-based position among the parent's rows, and how many there are (ARIA). */
  position: number;
  setSize: number;
}

/** The outline in reading order: each person, then their children, depth first. */
export function flattenOutline(root: DescNode): OutlineRow[] {
  const numbers = dAboville(root);
  const rows: OutlineRow[] = [];
  const visit = (
    node: DescNode,
    parent: DescNode | null,
    via: ID | null,
    position: number,
    setSize: number,
  ) => {
    const families = parent ? new Set(parent.children.map((c) => c.viaPartnerId)) : null;
    rows.push({
      key: node.key,
      personId: node.personId,
      depth: node.depth,
      number: numbers.get(node.key)!,
      partners: node.partners,
      expandable: !node.isRef && (node.children.length > 0 || node.hiddenCount > 0),
      expanded: node.children.length > 0,
      hiddenCount: node.hiddenCount,
      isRef: node.isRef,
      parentKey: parent?.key ?? null,
      parentId: parent?.personId ?? null,
      viaPartnerId: via,
      parentHasFamilies: families !== null && families.size > 1,
      position,
      setSize,
    });
    node.children.forEach((child, index) =>
      visit(child, node, child.viaPartnerId, index + 1, node.children.length),
    );
  };
  visit(root, null, null, 1, 1);
  return rows;
}

/**
 * The children of the row's parent that share its other parent, in order: the group a
 * sibling can move within (LV-03). Empty for the first row.
 */
export function familyOf(rows: readonly OutlineRow[], row: OutlineRow): ID[] {
  if (row.parentKey === null) return [];
  return rows
    .filter((r) => r.parentKey === row.parentKey && r.viaPartnerId === row.viaPartnerId)
    .map((r) => r.personId);
}

/** The family's order after moving `personId` by `by` places, or null when it can't move. */
export function movedOrder(family: readonly ID[], personId: ID, by: number): ID[] | null {
  const from = family.indexOf(personId);
  const to = from + by;
  if (from < 0 || to < 0 || to >= family.length || by === 0) return null;
  const next = [...family];
  next.splice(from, 1);
  next.splice(to, 0, personId);
  return next;
}

/** The family's order after dropping `personId` just before `beforeId` (null = at the end). */
export function droppedOrder(
  family: readonly ID[],
  personId: ID,
  beforeId: ID | null,
): ID[] | null {
  if (!family.includes(personId) || (beforeId !== null && !family.includes(beforeId))) return null;
  const next = family.filter((id) => id !== personId);
  const at = beforeId === null ? next.length : next.indexOf(beforeId);
  if (at < 0) return null;
  next.splice(at, 0, personId);
  return next.every((id, i) => id === family[i]) ? null : next;
}

/** Arrow-key targets in the outline (WAI-ARIA tree pattern, LV-06). */
export type OutlineKey = 'up' | 'down' | 'left' | 'right' | 'home' | 'end';

export type OutlineStep =
  | { type: 'move'; index: number }
  | { type: 'expand'; key: string }
  | { type: 'collapse'; key: string };

/**
 * What an arrow key does from row `index`: move to the previous or next row, expand a
 * collapsed row or step into it, collapse an open row or step out to its parent.
 */
export function outlineStep(
  rows: readonly OutlineRow[],
  index: number,
  key: OutlineKey,
): OutlineStep | null {
  const row = rows[index];
  if (!row) return null;
  switch (key) {
    case 'up':
      return index > 0 ? { type: 'move', index: index - 1 } : null;
    case 'down':
      return index < rows.length - 1 ? { type: 'move', index: index + 1 } : null;
    case 'home':
      return index > 0 ? { type: 'move', index: 0 } : null;
    case 'end':
      return index < rows.length - 1 ? { type: 'move', index: rows.length - 1 } : null;
    case 'right':
      if (!row.expandable) return null;
      return row.expanded ? { type: 'move', index: index + 1 } : { type: 'expand', key: row.key };
    case 'left': {
      if (row.expandable && row.expanded) return { type: 'collapse', key: row.key };
      const parent = row.parentKey === null ? -1 : rows.findIndex((r) => r.key === row.parentKey);
      return parent >= 0 ? { type: 'move', index: parent } : null;
    }
    default:
      key satisfies never;
      return null;
  }
}

/** The arrow-key meaning of a key name, or null. */
export function outlineKeyOf(key: string): OutlineKey | null {
  switch (key) {
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    case 'Home':
      return 'home';
    case 'End':
      return 'end';
    default:
      return null;
  }
}

/** A d'Aboville number in the locale's digits: "১.২.১". */
export function localNumber(number: string, locale: Locale): string {
  return number
    .split('.')
    .map((part) => formatYear(Number(part), locale))
    .join('.');
}
