import createMiddleware from 'next-intl/middleware';

import { routing } from './i18n/routing';

// Next.js 16 "proxy" (formerly middleware): locale detection and redirects.
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next internals, the Firebase auth handler (/__/auth) and files.
  matcher: ['/((?!api|_next|_vercel|__|.*\\..*).*)'],
};
