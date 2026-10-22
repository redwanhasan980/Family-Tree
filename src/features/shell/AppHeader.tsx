'use client';

import { AppName } from '@/components/app/AppName';
import { LanguageSwitch } from '@/components/app/LanguageSwitch';
import { ThemeToggle } from '@/components/app/ThemeToggle';
import { Link } from '@/i18n/navigation';

import type { ReactNode } from 'react';

/** Shared header for app and account pages; `actions` holds the account controls. */
export function AppHeader({ homeHref, actions }: { homeHref: string; actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4 sm:px-6">
        <Link href={homeHref} className="flex items-center gap-1.5 text-lg">
          <span aria-hidden>🌳</span>
          <AppName />
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <LanguageSwitch compact />
          {/* Theme is also in Settings, so very narrow phones keep room for the account controls. */}
          <div className="hidden min-[400px]:block">
            <ThemeToggle />
          </div>
          {actions}
        </div>
      </div>
    </header>
  );
}
