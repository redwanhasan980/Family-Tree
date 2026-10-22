import { describe, expect, it } from 'vitest';

import { argumentsOf, compareMessages, flatten } from './i18n-compare';

describe('flatten', () => {
  it('produces dotted keys', () => {
    expect(flatten({ a: { b: 'x', c: { d: 'y' } }, e: 'z' })).toEqual({
      'a.b': 'x',
      'a.c.d': 'y',
      e: 'z',
    });
  });
});

describe('argumentsOf', () => {
  it('finds simple, plural and tag arguments but not plural branch text', () => {
    expect(
      argumentsOf('Hi {name}, <b>{count, plural, one {# child} other {children}}</b>'),
    ).toEqual(['<b>', 'count', 'name']);
  });
});

describe('compareMessages', () => {
  const en = { landing: { title: 'Welcome to {appName}', cta: 'Start' } };

  it('accepts a complete translation', () => {
    const bn = { landing: { title: '{appName}-এ স্বাগতম', cta: 'শুরু করুন' } };
    expect(compareMessages(en, bn, 'bn')).toEqual([]);
  });

  it('reports missing and extra keys', () => {
    const bn = { landing: { title: '{appName}-এ স্বাগতম', extra: 'অতিরিক্ত' } };
    expect(compareMessages(en, bn, 'bn')).toEqual([
      { key: 'landing.cta', issue: 'missing in bn' },
      { key: 'landing.extra', issue: 'only in bn' },
    ]);
  });

  it('reports mismatched arguments', () => {
    const bn = { landing: { title: 'স্বাগতম', cta: 'শুরু করুন' } };
    expect(compareMessages(en, bn, 'bn')).toEqual([
      { key: 'landing.title', issue: 'arguments differ: [appName] vs [] in bn' },
    ]);
  });

  it('reports invalid ICU syntax', () => {
    const bn = { landing: { title: '{appName', cta: 'শুরু করুন' } };
    expect(compareMessages(en, bn, 'bn')[0]?.issue).toMatch(/^invalid ICU message/);
  });
});
