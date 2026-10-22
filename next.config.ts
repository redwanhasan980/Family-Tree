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
  // 'self': with the app domain as authDomain, the auth iframe is served from /__/auth (§9.5).
  "frame-src 'self' https://*.firebaseapp.com https://www.google.com",
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

/**
 * Firebase's sign-in helper, served from the app's own origin so Google redirects keep
 * working in browsers that partition third-party storage (DESIGN §9.5). The handler also
 * reads /__/firebase/init.json. Without a project ID (emulators) there is nothing to proxy.
 */
const firebaseProject = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const authHelperRewrites = firebaseProject
  ? ['auth', 'firebase'].map((dir) => ({
      source: `/__/${dir}/:path*`,
      destination: `https://${firebaseProject}.firebaseapp.com/__/${dir}/:path*`,
    }))
  : [];

const nextConfig: NextConfig = {
  // The Docker image runs Next.js as a standalone Node server (DESIGN §27.4).
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    // /__/ is Firebase's helper, which is framed by the SDK; it keeps Firebase's own headers.
    return [{ source: '/((?!__/).*)', headers: securityHeaders }];
  },
  async rewrites() {
    return authHelperRewrites;
  },
};

export default withNextIntl(nextConfig);
