'use client';

import { useLocale } from 'next-intl';
import { useTheme } from 'next-themes';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { usePathname, useRouter } from '@/i18n/navigation';
import { isOfflineError, errorCode } from '@/lib/domain/auth/errors';
import { isActivityStale } from '@/lib/domain/auth/prompts';
import {
  hasUser,
  INITIAL_SESSION,
  retryDelayMs,
  sessionReducer,
  type SessionState,
} from '@/lib/domain/auth/session';
import type { Locale, ThemePreference, UserProfile } from '@/lib/domain/types';
import { logger } from '@/lib/logger';
import { completeRedirectSignIn, createGuest, observeAuth } from '@/lib/repositories/auth';
import {
  createProfile,
  subscribeProfile,
  syncAccount,
  touchLastActive,
  updateSettings,
} from '@/lib/repositories/users';

interface SessionContextValue {
  session: SessionState;
  profile: UserProfile | null;
  /** App pages call this: it creates a guest when nobody is signed in (AUTH-01). */
  requireSession: () => void;
  /** Called after an explicit sign-in so the account's language and theme are applied. */
  markSignedIn: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}

function isTheme(value: string | undefined): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, dispatch] = useReducer(sessionReducer, INITIAL_SESSION);
  // Keyed by uid, so a previous user's profile is never shown after switching accounts.
  const [loaded, setLoaded] = useState<{ uid: string; profile: UserProfile | null } | null>(null);
  const [wantsSession, setWantsSession] = useState(false);
  const justSignedIn = useRef(false);
  const touchedFor = useRef<string | null>(null);
  const locale = useLocale() as Locale;
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  // Auth state, and finishing a Google redirect sign-in after the page reloads.
  useEffect(() => {
    const stop = observeAuth((user) => dispatch({ type: 'AUTH_CHANGED', user }));
    completeRedirectSignIn().catch((error: unknown) => logger.error('auth.redirect', error));
    return stop;
  }, []);

  // Guest creation with retries (DESIGN §9.2).
  useEffect(() => {
    if (!wantsSession) return;
    if (session.status === 'signedOut') {
      dispatch({ type: 'GUEST_REQUESTED' });
      return;
    }
    if (session.status === 'creatingGuest') {
      createGuest().catch((error: unknown) => {
        logger.warn('auth.guest_failed', { code: errorCode(error) });
        dispatch({
          type: 'GUEST_FAILED',
          offline: isOfflineError(error) || !navigator.onLine,
          code: errorCode(error),
        });
      });
      return;
    }
    if (session.status === 'offline') {
      const retry = () => dispatch({ type: 'GUEST_REQUESTED' });
      const timer = window.setTimeout(retry, retryDelayMs(session.attempt));
      window.addEventListener('online', retry);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener('online', retry);
      };
    }
  }, [wantsSession, session]);

  const uid = hasUser(session) ? session.user.uid : null;
  const isGuest = session.status === 'guest';
  const profile = loaded && loaded.uid === uid ? loaded.profile : null;

  // Profile subscription: create it on first use, keep account facts in sync.
  useEffect(() => {
    if (!uid) return;
    return subscribeProfile(
      uid,
      (next, { fromCache }) => {
        setLoaded({ uid, profile: next });
        if (!next && !fromCache) {
          createProfile(uid, { isGuest, locale, theme: isTheme(theme) ? theme : 'system' }).catch(
            (error: unknown) => logger.error('profile.create', error),
          );
        }
      },
      (error) => logger.error('profile.subscribe', error),
    );
    // Recreate the subscription only when the user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Copy guest/registered state, email, name and photo from Auth into the profile.
  const account = hasUser(session) ? session.user : null;
  useEffect(() => {
    if (!account || !profile) return;
    const next = {
      isGuest: account.isAnonymous,
      email: account.email ?? undefined,
      displayName: account.displayName ?? undefined,
      photoURL: account.photoURL ?? undefined,
    };
    const differs =
      profile.isGuest !== next.isGuest ||
      (next.email !== undefined && profile.email !== next.email) ||
      (next.displayName !== undefined && profile.displayName !== next.displayName) ||
      (next.photoURL !== undefined && profile.photoURL !== next.photoURL);
    if (differs)
      syncAccount(account.uid, next).catch((e: unknown) => logger.error('profile.sync', e));

    if (touchedFor.current !== account.uid && isActivityStale(profile.lastActiveAt, new Date())) {
      touchedFor.current = account.uid;
      touchLastActive(account.uid, account.isAnonymous).catch((e: unknown) =>
        logger.error('profile.touch', e),
      );
    }
  }, [account, profile]);

  // Language and theme: after a sign-in the account's choice wins; otherwise the latest
  // choice made in this browser is saved to the profile (I18N-01, AUTH-11).
  useEffect(() => {
    if (!account || !profile) return;
    if (justSignedIn.current) {
      justSignedIn.current = false;
      if (profile.theme !== theme) setTheme(profile.theme);
      if (profile.locale !== locale) router.replace(pathname, { locale: profile.locale });
      return;
    }
    const changes: { locale?: Locale; theme?: ThemePreference } = {};
    if (profile.locale !== locale) changes.locale = locale;
    if (isTheme(theme) && profile.theme !== theme) changes.theme = theme;
    if (changes.locale || changes.theme) {
      updateSettings(account.uid, account.isAnonymous, changes).catch((e: unknown) =>
        logger.error('profile.settings', e),
      );
    }
  }, [account, profile, locale, theme, setTheme, router, pathname]);

  const requireSession = useCallback(() => setWantsSession(true), []);
  const markSignedIn = useCallback(() => {
    justSignedIn.current = true;
  }, []);

  const value = useMemo(
    () => ({ session, profile, requireSession, markSignedIn }),
    [session, profile, requireSession, markSignedIn],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
