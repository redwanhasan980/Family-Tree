import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';

export type Messages = { [key: string]: string | Messages };

/** Flattens nested message objects into dotted keys: { a: { b: 'x' } } → { 'a.b': 'x' }. */
export function flatten(messages: Messages, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

/** Collects ICU argument names ({name}, {count, plural, …}, <tag>) used by a message. */
export function argumentsOf(message: string): string[] {
  const names = new Set<string>();
  const walk = (elements: MessageFormatElement[]) => {
    for (const el of elements) {
      switch (el.type) {
        case TYPE.argument:
        case TYPE.number:
        case TYPE.date:
        case TYPE.time:
          names.add(el.value);
          break;
        case TYPE.plural:
        case TYPE.select:
          names.add(el.value);
          for (const option of Object.values(el.options)) walk(option.value);
          break;
        case TYPE.tag:
          names.add(`<${el.value}>`);
          walk(el.children);
          break;
        default:
          break;
      }
    }
  };
  walk(parse(message, { requiresOtherClause: true }));
  return [...names].sort();
}

export interface Problem {
  key: string;
  issue: string;
}

/** Compares a locale's messages with the reference locale's messages. */
export function compareMessages(
  reference: Messages,
  other: Messages,
  otherName: string,
): Problem[] {
  const ref = flatten(reference);
  const cmp = flatten(other);
  const problems: Problem[] = [];

  for (const key of Object.keys(ref)) {
    if (!(key in cmp)) problems.push({ key, issue: `missing in ${otherName}` });
  }
  for (const key of Object.keys(cmp)) {
    if (!(key in ref)) problems.push({ key, issue: `only in ${otherName}` });
  }
  for (const [key, message] of Object.entries(ref)) {
    const translated = cmp[key];
    if (translated === undefined) continue;
    try {
      const a = argumentsOf(message).join(', ');
      const b = argumentsOf(translated).join(', ');
      if (a !== b)
        problems.push({ key, issue: `arguments differ: [${a}] vs [${b}] in ${otherName}` });
    } catch (error) {
      problems.push({ key, issue: `invalid ICU message: ${(error as Error).message}` });
    }
  }
  return problems;
}
