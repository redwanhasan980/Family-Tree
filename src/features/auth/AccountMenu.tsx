'use client';

import { LogOutIcon, SettingsIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Link, useRouter } from '@/i18n/navigation';
import { graphemes } from '@/lib/domain/text';
import { logger } from '@/lib/logger';
import { signOutUser } from '@/lib/repositories/auth';

import { GuestChip } from './GuestChip';
import { useSession } from './SessionProvider';

function initials(name: string | null, email: string | null): string {
  const source = (name ?? '').trim() || (email ?? '').trim();
  const words = source.split(/\s+/).filter(Boolean).slice(0, 2);
  return (
    words
      .map((w) => graphemes(w)[0] ?? '')
      .join('')
      .toUpperCase() || '?'
  );
}

export function AccountMenu() {
  const t = useTranslations();
  const { session, releaseSession } = useSession();
  const router = useRouter();

  if (session.status === 'guest') {
    return (
      <div className="flex items-center gap-2">
        <GuestChip />
        <Button asChild size="sm" className="hidden rounded-full sm:inline-flex">
          <Link href="/signup">{t('nav.signUp')}</Link>
        </Button>
      </div>
    );
  }
  if (session.status !== 'registered') return null;

  const { user } = session;
  const logOut = async () => {
    // Signing out leaves nobody signed in: without this, the app page would create a
    // fresh guest before the landing page loads (DESIGN §9.6).
    releaseSession();
    router.replace('/');
    try {
      await signOutUser();
      toast(t('account.loggedOut'));
    } catch (error) {
      logger.error('auth.sign_out', error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 rounded-full"
          aria-label={t('account.menu')}
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {initials(user.displayName, user.email)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-xs text-muted-foreground">{t('account.signedInAs')}</span>
          {user.displayName && (
            <span className="block truncate font-medium">{user.displayName}</span>
          )}
          {user.email && <span className="block truncate text-sm">{user.email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <SettingsIcon aria-hidden /> {t('nav.settings')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void logOut()}>
          <LogOutIcon aria-hidden /> {t('nav.logOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
