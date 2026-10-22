import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['bn', 'en'],
  // Browsers asking for Bangla get `bn`; everyone else starts in English (SRS Q3).
  defaultLocale: 'en',
  localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];
