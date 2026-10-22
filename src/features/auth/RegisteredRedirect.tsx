'use client';

import { useEffect, type ReactNode } from 'react';

import { useRouter } from '@/i18n/navigation';

import { SessionSkeleton } from './AuthGate';
import { useSession } from './SessionProvider';

/**
 * The sign-up and log-in pages are for guests and visitors. Registered users go straight
 * to their trees. Unlike `<AuthGate>`, this never creates a guest: sign-up works without one.
 */
export function RegisteredRedirect({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const router = useRouter();
  const registered = session.status === 'registered';

  useEffect(() => {
    if (registered) router.replace('/trees');
  }, [registered, router]);

  if (session.status === 'restoring' || registered) return <SessionSkeleton />;
  return <>{children}</>;
}
