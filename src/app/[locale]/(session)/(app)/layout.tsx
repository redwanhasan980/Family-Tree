import { AccountMenu } from '@/features/auth/AccountMenu';
import { AuthGate } from '@/features/auth/AuthGate';
import { VerifyEmailBanner } from '@/features/auth/VerifyEmailBanner';
import { AppHeader } from '@/features/shell/AppHeader';

import type { ReactNode } from 'react';

// App pages need a user: <AuthGate> creates a guest when nobody is signed in (AUTH-01).
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader homeHref="/trees" actions={<AccountMenu />} />
      <VerifyEmailBanner />
      <main id="main" className="flex-1">
        <AuthGate>{children}</AuthGate>
      </main>
    </div>
  );
}
