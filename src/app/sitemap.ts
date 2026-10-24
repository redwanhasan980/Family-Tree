import { localizedUrls } from '@/lib/site';

import type { MetadataRoute } from 'next';

/** The public pages, in both languages (I18N-06, P8-01). App pages are private. */
const PAGES = ['/', '/help', '/privacy'] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.flatMap((path) => {
    const urls = localizedUrls(path);
    return (['bn', 'en'] as const).map((locale) => ({
      url: urls[locale],
      changeFrequency: 'monthly' as const,
      priority: path === '/' ? 1 : 0.5,
      alternates: { languages: { bn: urls.bn, en: urls.en } },
    }));
  });
}
