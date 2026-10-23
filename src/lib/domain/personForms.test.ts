import { describe, expect, it } from 'vitest';

import { QuickPersonFormSchema, quickPersonInput } from './personForms';

describe('QuickPersonFormSchema', () => {
  it('needs a name and man or woman', () => {
    const messages = (form: unknown) =>
      QuickPersonFormSchema.safeParse(form).error?.issues.map((i) => i.message);
    expect(messages({ name: ' ', gender: 'male' })).toEqual(['nameRequired']);
    expect(messages({ name: 'Karim', gender: null })).toEqual(['genderRequired']);
    expect(messages({ name: 'x'.repeat(121), gender: 'female' })).toEqual(['nameTooLong']);
  });

  it('stores the name under the language it was typed in', () => {
    const form = QuickPersonFormSchema.parse({ name: ' রহিমা বেগম ', gender: 'female' });
    expect(quickPersonInput(form)).toEqual({ names: { bn: 'রহিমা বেগম' }, gender: 'female' });
  });
});
