/**
 * Fails when messages/bn.json and messages/en.json drift apart: missing or extra keys,
 * different ICU arguments, or invalid ICU syntax (NFR-L10N-01). English is the reference.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { compareMessages, type Messages } from './lib/i18n-compare';

const load = (locale: string): Messages =>
  JSON.parse(readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8')) as Messages;

const problems = [
  ...compareMessages(load('en'), load('bn'), 'bn'),
  ...compareMessages(load('en'), load('en'), 'en'), // validates the reference's own ICU syntax
];

if (problems.length > 0) {
  console.error(`i18n check failed with ${problems.length} problem(s):`);
  for (const { key, issue } of problems) console.error(`  ${key}: ${issue}`);
  process.exit(1);
}
console.warn('i18n check passed: bn and en messages match.');
