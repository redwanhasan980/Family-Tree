import { makeParentLink, makePerson, makeSpouseLink, stamps } from './factories';

import type { Gender, PartialDate, Person, Relationship } from '../types';

/**
 * A small family exercising every structural case the views must handle:
 *
 * G (grandfather) married W1 (sequence 1) and W2 (sequence 2).
 *   G+W1 → S1 (1955), D1 (1958);  G+W2 → S2 (1965);  G+unknown → X (1970)
 * S1 married SW → SS;  D1 married H → DD;  SS married DD (cousins) → K
 * S2 adopted A;  X and P had Y without a marriage record;  O is not connected.
 */
export function testFamily(): { persons: Person[]; relationships: Relationship[] } {
  const person = (id: string, gender: Gender, year?: number, order = 0): Person =>
    makePerson(id, {
      names: { en: id },
      gender,
      ...(year && { birth: { date: { year } satisfies PartialDate } }),
      ...stamps(order),
    });
  const persons = [
    person('G', 'male', 1925),
    person('W1', 'female', 1930),
    person('W2', 'female', 1940),
    person('S1', 'male', 1955),
    person('D1', 'female', 1958),
    person('S2', 'male', 1965),
    person('X', 'male', 1970),
    person('SW', 'female', 1960),
    person('H', 'male', 1955),
    person('SS', 'male', 1985),
    person('DD', 'female', 1987),
    person('K', 'female', 2012),
    person('A', 'male', 1995),
    person('P', 'female', 1972),
    person('Y', 'male', 2000),
    person('O', 'unknown'),
  ];
  const relationships: Relationship[] = [
    makeSpouseLink('G', 'W2', { sequence: 2 }),
    makeSpouseLink('G', 'W1', { sequence: 1 }),
    makeParentLink('G', 'S1'),
    makeParentLink('W1', 'S1'),
    makeParentLink('G', 'D1'),
    makeParentLink('W1', 'D1'),
    makeParentLink('G', 'S2'),
    makeParentLink('W2', 'S2'),
    makeParentLink('G', 'X'),
    makeSpouseLink('S1', 'SW'),
    makeParentLink('S1', 'SS'),
    makeParentLink('SW', 'SS'),
    makeSpouseLink('D1', 'H'),
    makeParentLink('D1', 'DD'),
    makeParentLink('H', 'DD'),
    makeSpouseLink('SS', 'DD'),
    makeParentLink('SS', 'K'),
    makeParentLink('DD', 'K'),
    makeParentLink('S2', 'A', 'adoptive'),
    makeParentLink('X', 'Y'),
    makeParentLink('P', 'Y'),
  ];
  return { persons, relationships };
}
