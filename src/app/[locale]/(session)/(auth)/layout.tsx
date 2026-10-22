import { AppHeader } from '@/features/shell/AppHeader';

import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader homeHref="/" />
      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  );
}
