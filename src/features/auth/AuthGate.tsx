'use client';

import { WifiOffIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { hasUser } from '@/lib/domain/auth/session';

import { useSession } from './SessionProvider';

/**
 * Renders its children only once a user exists, creating a guest when nobody is signed in
 * (AUTH-01). Shows a skeleton while restoring, and a friendly notice while offline.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const t = useTranslations('session');
  const { session, requireSession } = useSession();

  useEffect(() => {
    requireSession();
  }, [requireSession]);

  if (hasUser(session)) return <>{children}</>;

  if (session.status === 'offline' || session.status === 'error') {
    const offline = session.status === 'offline';
    return (
      <div
        role="alert"
        className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center"
      >
        {offline && <WifiOffIcon className="size-8 text-muted-foreground" aria-hidden />}
        <h1 className="text-xl font-semibold">{t(offline ? 'offlineTitle' : 'errorTitle')}</h1>
        <p className="text-muted-foreground">{t(offline ? 'offlineBody' : 'errorBody')}</p>
        {!offline && <Button onClick={() => window.location.reload()}>{t('retry')}</Button>}
      </div>
    );
  }

  return <SessionSkeleton />;
}

/** Placeholder shown while the session is being restored or created. */
export function SessionSkeleton() {
  const t = useTranslations('session');
  return (
    <div aria-busy="true" className="mx-auto w-full max-w-3xl space-y-4 px-4 py-10">
      <span className="sr-only">{t('loading')}</span>
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
