import { SITE_URL } from '@/lib/site';

import type { MetadataRoute } from 'next';

/** Search engines see the public pages only: trees and accounts are private (NFR-PRIV-01). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/__/', '/*/trees', '/*/settings', '/*/login', '/*/signup', '/*/s/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
