import { routing, type Locale } from '@/i18n/routing';

/** The site's public address, for canonical links, the sitemap and social cards. */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);

/** A path in every language, for `alternates.languages` and the sitemap (I18N-06). */
export function localizedUrls(path: string): Record<Locale | 'x-default', string> {
  const suffix = path === '/' ? '' : path;
  const urls = Object.fromEntries(
    routing.locales.map((locale) => [locale, `${SITE_URL}/${locale}${suffix}`]),
  ) as Record<Locale, string>;
  return { ...urls, 'x-default': urls[routing.defaultLocale] };
}
