import { compareParentLinks, sortSiblings } from './order';

import type { ID, ParentLink, Person, Relationship, SpouseLink } from '../types';

export type GraphIssueCode = 'danglingLink' | 'selfLink' | 'idMismatch' | 'duplicateLink' | 'cycle';

/** A stored relationship the graph had to skip or flag. The UI can offer repairs. */
export interface GraphIssue {
  code: GraphIssueCode;
  linkId: string;
}

/** The family as an indexed graph (DESIGN §12.1). Build it once per data change. */
export interface FamilyGraph {
  persons: ReadonlyMap<ID, Person>;
  /** child → links to their parents (biological first, then father before mother). */
  parentsOf: ReadonlyMap<ID, readonly ParentLink[]>;
  /** parent → links to their children, in sibling order. */
  childrenOf: ReadonlyMap<ID, readonly ParentLink[]>;
  /** person → links to their spouses. */
  spousesOf: ReadonlyMap<ID, readonly SpouseLink[]>;
  /** Every usable relationship by ID. */
  links: ReadonlyMap<string, Relationship>;
  /** Skipped or suspicious relationships. Cycles are reported but kept. */
  issues: readonly GraphIssue[];
}

const EMPTY: readonly never[] = Object.freeze([]);

function isPersonMap(
  input: Iterable<Person> | ReadonlyMap<ID, Person>,
): input is ReadonlyMap<ID, Person> {
  return input instanceof Map;
}

function push<V>(map: Map<ID, V[]>, key: ID, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * Indexes persons and relationships in O(V + E). It never throws on bad data: dangling,
 * self-referencing, duplicated or mislabelled relationships are skipped and reported
 * (NFR-REL-04), so one broken document can't stop a tree from opening.
 */
export function buildGraph(
  personsInput: Iterable<Person> | ReadonlyMap<ID, Person>,
  relationships: Iterable<Relationship>,
): FamilyGraph {
  const persons: ReadonlyMap<ID, Person> = isPersonMap(personsInput)
    ? personsInput
    : new Map(Array.from(personsInput, (p) => [p.id, p]));
  const parentsOf = new Map<ID, ParentLink[]>();
  const childrenOf = new Map<ID, ParentLink[]>();
  const spousesOf = new Map<ID, SpouseLink[]>();
  const links = new Map<string, Relationship>();
  const issues: GraphIssue[] = [];

  for (const link of relationships) {
    if (links.has(link.id)) {
      issues.push({ code: 'duplicateLink', linkId: link.id });
      continue;
    }
    if (link.type === 'parent') {
      const { parentId, childId } = link;
      if (parentId === childId) issues.push({ code: 'selfLink', linkId: link.id });
      else if (!persons.has(parentId) || !persons.has(childId))
        issues.push({ code: 'danglingLink', linkId: link.id });
      else if (link.id !== `p_${parentId}_${childId}`)
        issues.push({ code: 'idMismatch', linkId: link.id });
      else {
        links.set(link.id, link);
        push(parentsOf, childId, link);
        push(childrenOf, parentId, link);
      }
    } else {
      const [a, b] = link.personIds;
      if (a === b) issues.push({ code: 'selfLink', linkId: link.id });
      else if (!persons.has(a) || !persons.has(b))
        issues.push({ code: 'danglingLink', linkId: link.id });
      else if (link.id !== `s_${a}_${b}` || a > b)
        issues.push({ code: 'idMismatch', linkId: link.id });
      else {
        links.set(link.id, link);
        push(spousesOf, a, link);
        push(spousesOf, b, link);
      }
    }
  }

  for (const [parentId, list] of childrenOf) {
    const order = new Map(
      sortSiblings(list.map((l) => persons.get(l.childId)!)).map((p, i) => [p.id, i]),
    );
    childrenOf.set(
      parentId,
      list.sort((x, y) => order.get(x.childId)! - order.get(y.childId)!),
    );
  }
  for (const list of parentsOf.values()) {
    list.sort((x, y) => compareParentLinks(x, y, persons));
  }

  const graph: FamilyGraph = { persons, parentsOf, childrenOf, spousesOf, links, issues };
  issues.push(...findCycles(graph));
  return graph;
}

/** Relationships that close a loop (someone being their own ancestor). Iterative DFS. */
function findCycles(g: FamilyGraph): GraphIssue[] {
  const state = new Map<ID, 1 | 2>(); // 1 = on the current path, 2 = finished
  const found: GraphIssue[] = [];
  for (const start of g.persons.keys()) {
    if (state.has(start)) continue;
    const stack: { id: ID; next: number }[] = [{ id: start, next: 0 }];
    state.set(start, 1);
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const children = g.childrenOf.get(top.id) ?? EMPTY;
      const link = children[top.next++];
      if (!link) {
        state.set(top.id, 2);
        stack.pop();
        continue;
      }
      const seen = state.get(link.childId);
      if (seen === 1) found.push({ code: 'cycle', linkId: link.id });
      else if (seen === undefined) {
        state.set(link.childId, 1);
        stack.push({ id: link.childId, next: 0 });
      }
    }
  }
  return found;
}

export function parentLinksOf(g: FamilyGraph, childId: ID): readonly ParentLink[] {
  return g.parentsOf.get(childId) ?? EMPTY;
}

export function childLinksOf(g: FamilyGraph, parentId: ID): readonly ParentLink[] {
  return g.childrenOf.get(parentId) ?? EMPTY;
}

export function spouseLinksOf(g: FamilyGraph, personId: ID): readonly SpouseLink[] {
  return g.spousesOf.get(personId) ?? EMPTY;
}

/** The other person in a spouse link. */
export function partnerIn(link: SpouseLink, personId: ID): ID {
  return link.personIds[0] === personId ? link.personIds[1] : link.personIds[0];
}
