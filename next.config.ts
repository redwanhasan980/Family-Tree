import createNextIntlPlugin from 'next-intl/plugin';

import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Content Security Policy (DESIGN §24). Report-only until P8-08, when it is tightened
 * with nonces and enforced; violations show up in the browser console meanwhile.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://res.cloudinary.com https://lh3.googleusercontent.com",
  "font-src 'self'",
  [
    "connect-src 'self'",
    'https://*.googleapis.com',
    'https://*.firebaseio.com',
    'https://api.cloudinary.com',
    'https://res.cloudinary.com',
    'https://www.google.com',
    ...(isDev ? ['http://127.0.0.1:*', 'ws://127.0.0.1:*', 'ws://localhost:*'] : []),
  ].join(' '),
  'frame-src https://*.firebaseapp.com https://www.google.com',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Camera stays available to this site for taking person photos (MED-01).
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
  { key: 'Content-Security-Policy-Report-Only', value: csp },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
