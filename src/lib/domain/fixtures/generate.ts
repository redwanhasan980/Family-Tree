import { makeParentLink, makePerson, makeSpouseLink, stamps } from './factories';

import type {
  Gender,
  ID,
  LifeEvent,
  LocalizedName,
  PartialDate,
  Person,
  Relationship,
} from '../types';

/**
 * Generated family trees for tests, performance checks and local demo data (P2-10).
 * Deterministic for a given seed. Every tree of 30+ people includes the hard cases the
 * views must handle: several wives, a cousin marriage, an adoption, very long names,
 * names in only one language, and every kind of partial date.
 */

export interface Fixture {
  persons: Person[];
  relationships: Relationship[];
  rootId: ID;
}

export interface FixtureOptions {
  size: number;
  seed?: number;
  /** Birth year of the root ancestor (default: earlier for bigger trees). */
  startYear?: number;
  /** "This year", so fixtures don't change as time passes. */
  thisYear?: number;
}

const MEN: [string, string][] = [
  ['আব্দুল করিম', 'Abdul Karim'],
  ['মোহাম্মদ রহিম', 'Mohammad Rahim'],
  ['আবুল কাশেম', 'Abul Kashem'],
  ['সালাম মিয়া', 'Salam Mia'],
  ['জসিম উদ্দিন', 'Jasim Uddin'],
  ['নজরুল ইসলাম', 'Nazrul Islam'],
  ['রফিকুল হাসান', 'Rafiqul Hasan'],
  ['তানভীর আহমেদ', 'Tanvir Ahmed'],
  ['সাকিব হোসেন', 'Sakib Hossain'],
  ['আরিফ রহমান', 'Arif Rahman'],
  ['মাহমুদুল হক', 'Mahmudul Haque'],
  ['শফিকুর রহমান', 'Shafiqur Rahman'],
];
const WOMEN: [string, string][] = [
  ['রহিমা খাতুন', 'Rahima Khatun'],
  ['ফাতেমা বেগম', 'Fatema Begum'],
  ['আয়েশা সিদ্দিকা', 'Ayesha Siddika'],
  ['নাসরিন আক্তার', 'Nasrin Akter'],
  ['সালমা বেগম', 'Salma Begum'],
  ['শাহানা পারভীন', 'Shahana Parvin'],
  ['রুমানা ইয়াসমিন', 'Rumana Yasmin'],
  ['তাহমিনা হক', 'Tahmina Haque'],
  ['সুমাইয়া ইসলাম', 'Sumaiya Islam'],
  ['জান্নাতুল ফেরদৌস', 'Jannatul Ferdous'],
  ['নুসরাত জাহান', 'Nusrat Jahan'],
  ['মরিয়ম আক্তার', 'Moriom Akter'],
];
const LONG: Record<'male' | 'female', [string, string]> = {
  male: ['মোহাম্মদ আবুল কালাম আজাদ চৌধুরী সিদ্দিকী', 'Mohammad Abul Kalam Azad Chowdhury Siddiqui'],
  female: ['সৈয়দা নূরজাহান বেগম চৌধুরানী সিদ্দিকা', 'Syeda Nurjahan Begum Chowdhurani Siddika'],
};
const PROFESSIONS = [
  'কৃষক',
  'শিক্ষক',
  'ব্যবসায়ী',
  'ডাক্তার',
  'প্রকৌশলী',
  'গৃহিণী',
  'Engineer',
  'Teacher',
];
const PLACES = ['শিবগঞ্জ, চাঁপাইনবাবগঞ্জ', 'রাজশাহী', 'ঢাকা', 'চট্টগ্রাম', 'সিলেট', 'Dhaka'];

/** mulberry32: a small, fast, seeded random number generator. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bigger trees need more generations, so their root ancestor is born earlier. */
function defaultStartYear(size: number): number {
  return size <= 200 ? 1900 : size <= 600 ? 1875 : 1840;
}

export function generateFamily({
  size,
  seed = 1,
  startYear = defaultStartYear(size),
  thisYear = 2026,
}: FixtureOptions): Fixture {
  const rand = random(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
  const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

  const persons: Person[] = [];
  const relationships: Relationship[] = [];
  const birthYear = new Map<ID, number>();
  const generation = new Map<ID, number>();
  /** The root's child each bloodline person descends from (for cousins). */
  const branch = new Map<ID, ID>();
  const spouses = new Map<ID, ID[]>();
  const familiesDone = new Set<string>();
  const covered = { long: false, bnOnly: false, enOnly: false, adoption: false, cousins: false };
  let count = 0;

  const full = () => persons.length >= size;

  const date = (year: number, kind: number): PartialDate => {
    if (kind < 0.4) return { year, ...(rand() < 0.4 && { approximate: true }) };
    if (kind < 0.7) return { year, month: between(1, 12) };
    const month = between(1, 12);
    return { year, month, day: between(1, 28) };
  };

  const add = (gender: 'male' | 'female', year: number, gen: number, from?: ID): ID => {
    count += 1;
    const id = `f${count}`;
    const [bn, en] =
      !covered.long && gen === 3 ? LONG[gender] : pick(gender === 'male' ? MEN : WOMEN);
    covered.long ||= gen === 3;
    const roll = rand();
    const names: LocalizedName = roll < 0.1 ? { bn } : roll < 0.2 ? { en } : { bn, en };
    covered.bnOnly ||= !names.en;
    covered.enOnly ||= !names.bn;
    const kind = count === 1 ? 0 : count === 2 ? 0.5 : count === 3 ? 0.9 : rand();
    const birth: LifeEvent | undefined =
      count > 3 && rand() < 0.15
        ? undefined
        : { date: date(year, kind), ...(rand() < 0.5 && { place: pick(PLACES) }) };
    const age = thisYear - year;
    const isLiving = age < 75 && !(age > 50 && rand() < 0.2);
    const death: LifeEvent | undefined =
      !isLiving && rand() < 0.8
        ? { date: date(Math.min(thisYear, year + between(45, 90)), rand()) }
        : undefined;
    persons.push(
      makePerson(id, {
        names,
        gender: gender as Gender,
        isLiving,
        ...(birth && { birth }),
        ...(death && { death }),
        ...(rand() < 0.4 && { profession: pick(PROFESSIONS) }),
        ...stamps(count),
      }),
    );
    birthYear.set(id, year);
    generation.set(id, gen);
    if (from) branch.set(id, gen === 2 ? id : branch.get(from)!);
    return id;
  };

  const marry = (a: ID, b: ID, sequence: number) => {
    relationships.push(makeSpouseLink(a, b, { sequence, ...stamps(count) }));
    spouses.set(a, [...(spouses.get(a) ?? []), b]);
    spouses.set(b, [...(spouses.get(b) ?? []), a]);
  };

  const genderOf = (id: ID) => persons.find((p) => p.id === id)!.gender as 'male' | 'female';
  const opposite = (g: 'male' | 'female') => (g === 'male' ? 'female' : 'male');

  const rootId = add('male', startYear, 1);
  const queue: ID[] = [rootId];

  while (queue.length > 0 && !full()) {
    const id = queue.shift()!;
    const gen = generation.get(id)!;
    const year = birthYear.get(id)!;
    if (year + 18 > thisYear) continue;

    // A cousin marriage: two grandchildren of different branches marry each other.
    if (!covered.cousins && gen === 3 && !spouses.has(id)) {
      const cousin = queue.find(
        (other) =>
          generation.get(other) === 3 &&
          !spouses.has(other) &&
          branch.get(other) !== branch.get(id) &&
          genderOf(other) !== genderOf(id),
      );
      if (cousin) {
        marry(id, cousin, 1);
        covered.cousins = true;
      }
    }
    if (!spouses.has(id) && (gen === 1 || rand() < 0.85) && !full()) {
      marry(
        id,
        add(
          opposite(genderOf(id)),
          year + between(-2, 8) * (genderOf(id) === 'male' ? 1 : -1),
          gen,
        ),
        1,
      );
      // Some men in older generations had a second wife.
      if (genderOf(id) === 'male' && (gen === 1 || rand() < 0.12) && year < 1960 && !full()) {
        marry(id, add('female', year + between(5, 15), gen), 2);
      }
    }

    for (const partner of [...(spouses.get(id) ?? []), null]) {
      const key = partner ? [id, partner].sort().join('+') : `${id}+`;
      if (familiesDone.has(key)) continue;
      familiesDone.add(key);
      const children = partner ? between(gen === 1 ? 3 : 1, 5) : rand() < 0.05 ? 1 : 0;
      for (let i = 0; i < children && !full(); i++) {
        const childYear = Math.min(thisYear, year + between(20, 32) + i * 2);
        const child = add(rand() < 0.5 ? 'male' : 'female', childYear, gen + 1, id);
        const adopted = !covered.adoption && gen === 2 && i === children - 1;
        covered.adoption ||= adopted;
        relationships.push(
          makeParentLink(id, child, adopted ? 'adoptive' : 'biological', stamps(count)),
        );
        if (partner)
          relationships.push(
            makeParentLink(partner, child, adopted ? 'adoptive' : 'biological', stamps(count)),
          );
        queue.push(child);
      }
    }
  }

  // Small sizes may run out of room before the queue empties; tall chains may too.
  while (!full()) {
    const parent = persons[persons.length - 1]!.id;
    const child = add(
      rand() < 0.5 ? 'male' : 'female',
      Math.min(thisYear, birthYear.get(parent)! + 25),
      generation.get(parent)! + 1,
      parent,
    );
    relationships.push(makeParentLink(parent, child, 'biological', stamps(count)));
  }

  return { persons, relationships, rootId };
}
