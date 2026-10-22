import { describe, expect, it } from 'vitest';

import { ancestorIds, buildGraph, descendantIds, spouseLinksOf } from '../graph';
import { PersonDetailsSchema } from '../schemas';
import { generateFamily } from './generate';

describe('generateFamily', () => {
  it.each([10, 150, 500, 2000])('makes exactly %i valid people with a clean graph', (size) => {
    const { persons, relationships, rootId } = generateFamily({ size });
    expect(persons).toHaveLength(size);
    expect(persons[0]!.id).toBe(rootId);
    const g = buildGraph(persons, relationships);
    expect(g.issues).toEqual([]);
    expect(g.links.size).toBe(relationships.length);
    for (const person of persons) {
      const {
        id: _id,
        createdAt: _a,
        createdBy: _b,
        updatedAt: _c,
        updatedBy: _d,
        schemaVersion: _e,
        ...details
      } = person;
      expect(PersonDetailsSchema.safeParse(details).success, person.id).toBe(true);
    }
  });

  it('includes the hard cases from 150 people up', () => {
    const { persons, relationships, rootId } = generateFamily({ size: 150 });
    const g = buildGraph(persons, relationships);
    const bloodline = descendantIds(g, rootId);
    // several wives
    expect(persons.some((p) => spouseLinksOf(g, p.id).length >= 2)).toBe(true);
    // a cousin marriage: both partners descend from the root and share a grandparent
    const cousins = relationships.filter(
      (r) => r.type === 'spouse' && r.personIds.every((id) => bloodline.has(id)),
    );
    expect(cousins.length).toBeGreaterThanOrEqual(1);
    const [a, b] = cousins[0]!.type === 'spouse' ? cousins[0]!.personIds : ['', ''];
    const shared = [...ancestorIds(g, a)].filter((id) => ancestorIds(g, b).has(id));
    expect(shared).toContain(rootId);
    // adoption
    expect(relationships.some((r) => r.type === 'parent' && r.kind === 'adoptive')).toBe(true);
    // long names, single-language names
    expect(
      persons.some((p) => (p.names.en?.length ?? 0) >= 40 && (p.names.bn?.length ?? 0) >= 30),
    ).toBe(true);
    expect(persons.some((p) => p.names.bn && !p.names.en)).toBe(true);
    expect(persons.some((p) => p.names.en && !p.names.bn)).toBe(true);
    // every kind of partial date
    const dates = persons.flatMap((p) => (p.birth?.date ? [p.birth.date] : []));
    expect(dates.some((d) => d.month === undefined)).toBe(true);
    expect(dates.some((d) => d.approximate)).toBe(true);
    expect(dates.some((d) => d.month !== undefined && d.day === undefined)).toBe(true);
    expect(dates.some((d) => d.day !== undefined)).toBe(true);
    expect(persons.some((p) => !p.birth)).toBe(true);
    expect(persons.some((p) => !p.isLiving && p.death)).toBe(true);
  });

  it('is repeatable for a seed and differs between seeds', () => {
    expect(generateFamily({ size: 60, seed: 7 })).toEqual(generateFamily({ size: 60, seed: 7 }));
    expect(generateFamily({ size: 60, seed: 7 })).not.toEqual(
      generateFamily({ size: 60, seed: 8 }),
    );
  });

  it('still reaches the size when time runs out for new generations', () => {
    const { persons } = generateFamily({ size: 40, startYear: 2005 });
    expect(persons).toHaveLength(40);
  });
});
