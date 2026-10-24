'use client';

import { PlusIcon, SproutIcon, UserRoundIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/features/auth/SessionProvider';
import { wizardDoneHere } from '@/features/onboarding/progress';
import { Link, useRouter } from '@/i18n/navigation';
import { APP_NAME } from '@/lib/brand';
import { hasUser } from '@/lib/domain/auth/session';
import { LIMITS } from '@/lib/domain/schemas';
import type { Tree } from '@/lib/domain/types';
import { logger } from '@/lib/logger';
import { completeOnboarding } from '@/lib/repositories/users';

import { CreateTreeDialog } from './CreateTreeDialog';
import { DeleteTreeDialog } from './DeleteTreeDialog';
import { TreeCard } from './TreeCard';
import { TreeDetailsDialog } from './TreeDetailsDialog';
import { useMyTrees } from './useMyTrees';

type OpenDialog = { kind: 'create' } | { kind: 'details' | 'delete'; tree: Tree } | null;

function GuestNotice() {
  const t = useTranslations('guest');
  return (
    <section
      aria-labelledby="guest-notice"
      className="flex flex-col gap-4 rounded-2xl border border-highlight/50 bg-highlight/10 p-5 sm:flex-row sm:items-center"
    >
      <UserRoundIcon className="size-8 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <h2 id="guest-notice" className="font-semibold">
          {t('title', { appName: APP_NAME })}
        </h2>
        <p className="text-sm text-muted-foreground">{t('body')}</p>
      </div>
      <Button asChild className="shrink-0">
        <Link href="/signup">{t('cta')}</Link>
      </Button>
    </section>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const t = useTranslations('trees');
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed bg-card px-6 py-10 text-center sm:py-14">
      <span className="flex size-16 items-center justify-center rounded-full bg-highlight/20">
        <SproutIcon className="size-8" aria-hidden />
      </span>
      <h2 className="text-xl font-semibold">{t('emptyTitle')}</h2>
      <p className="max-w-md text-muted-foreground">{t('emptyBody')}</p>
      <Button size="lg" className="h-12 px-6 text-base" onClick={onCreate}>
        <PlusIcon aria-hidden /> {t('emptyCta')}
      </Button>
    </div>
  );
}

function LoadingCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-36 rounded-2xl" />
      ))}
    </div>
  );
}

/** The dashboard (TREE-01..03): the user's trees, live, with create, rename and delete. */
export function TreesHome() {
  const t = useTranslations();
  const { session, profile } = useSession();
  const router = useRouter();
  const uid = hasUser(session) ? session.user.uid : null;
  const trees = useMyTrees(uid);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const closeDialog = (open: boolean) => {
    if (!open) setDialog(null);
  };

  const count = trees.status === 'ready' ? trees.trees.length : 0;
  // Someone new, with no tree yet, starts with the wizard (ONB-02).
  const newcomer =
    trees.status === 'ready' &&
    count === 0 &&
    profile !== null &&
    !profile.onboardingCompleted &&
    !wizardDoneHere();
  useEffect(() => {
    if (newcomer) router.replace('/start');
  }, [newcomer, router]);
  // Done in this browser but not yet in the profile (an older version, or offline then):
  // record it, so other devices don't offer the wizard again.
  const unrecorded = profile !== null && !profile.onboardingCompleted && wizardDoneHere();
  useEffect(() => {
    if (!unrecorded || !uid) return;
    completeOnboarding(uid, session.status === 'guest').catch((error: unknown) =>
      logger.error('onboarding.complete', error),
    );
  }, [unrecorded, uid, session.status]);
  const atLimit = count >= LIMITS.treesPerUser;
  const create = () => setDialog({ kind: 'create' });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{t('trees.title')}</h1>
        {count > 0 && (
          <Button className="h-11" onClick={create} disabled={atLimit}>
            <PlusIcon aria-hidden /> {t('trees.newTree')}
          </Button>
        )}
      </div>
      {atLimit && (
        <p className="text-sm text-muted-foreground">
          {t('trees.limitReached', { max: LIMITS.treesPerUser })}
        </p>
      )}

      {trees.status === 'loading' && <LoadingCards />}
      {trees.status === 'error' && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center"
        >
          <p className="flex-1">{t('trees.loadError')}</p>
          <Button variant="outline" onClick={trees.retry}>
            {t('common.retry')}
          </Button>
        </div>
      )}
      {trees.status === 'ready' && count === 0 && !newcomer && <EmptyState onCreate={create} />}
      {trees.status === 'ready' && count > 0 && uid && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trees.trees.map((tree) => (
            <li key={tree.id} className="flex">
              <TreeCard
                tree={tree}
                uid={uid}
                onDetails={() => setDialog({ kind: 'details', tree })}
                onDelete={() => setDialog({ kind: 'delete', tree })}
              />
            </li>
          ))}
        </ul>
      )}

      {session.status === 'guest' && <GuestNotice />}

      <CreateTreeDialog open={dialog?.kind === 'create'} onOpenChange={closeDialog} />
      {dialog?.kind === 'details' && (
        <TreeDetailsDialog tree={dialog.tree} open onOpenChange={closeDialog} />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteTreeDialog tree={dialog.tree} open onOpenChange={closeDialog} />
      )}
    </div>
  );
}
