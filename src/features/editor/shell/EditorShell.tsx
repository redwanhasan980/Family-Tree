'use client';

import { ChartColumnIcon, Settings2Icon, TriangleAlertIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/features/auth/SessionProvider';
import { AddRelativeFlows } from '@/features/person/AddRelativeFlows';
import { TreeView } from '@/features/views/tree/TreeView';
import { Link } from '@/i18n/navigation';
import { APP_NAME } from '@/lib/brand';
import { hasUser } from '@/lib/domain/auth/session';
import type { ID, ViewKind } from '@/lib/domain/types';
import { enabledViews } from '@/lib/features';
import { useTree } from '@/stores/treeStore';
import { uiStore, useUi } from '@/stores/uiStore';

import { EditorProvider } from '../EditorProvider';
import { useTreeSession } from '../useTreeSession';
import { DetailsContainer } from './DetailsContainer';
import { EditorHeader } from './EditorHeader';
import { EmptyTree } from './EmptyTree';
import { SelectionBar } from './SelectionBar';
import { StatisticsList } from './Statistics';
import { TreeSettingsDialog } from './TreeSettingsDialog';
import { editorSearch, readEditorParams } from './urlState';
import { BottomNav } from './ViewNav';
import { ViewPlaceholder } from './ViewPlaceholder';
import { PRIMARY_VIEWS, VIEW_ICONS } from './views';

/** Opens the UI state for this tree once its settings are known, and mirrors it in the URL. */
function useEditorUrlState(treeId: ID, defaultView: ViewKind | undefined): void {
  const opened = useUi((s) => s.treeId === treeId);
  const view = useUi((s) => s.view);
  const focusId = useUi((s) => s.focusId);

  useEffect(() => {
    if (!defaultView || uiStore.getState().treeId === treeId) return;
    const allowed = enabledViews();
    uiStore
      .getState()
      .openTree(treeId, defaultView, readEditorParams(window.location.search, allowed));
  }, [treeId, defaultView]);

  useEffect(() => () => uiStore.getState().closeTree(), [treeId]);

  useEffect(() => {
    if (!opened) return;
    const search = editorSearch(window.location.search, view, focusId);
    if (search !== window.location.search) {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}`);
    }
  }, [opened, view, focusId]);
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
      {children}
    </div>
  );
}

function EditorSkeleton() {
  const t = useTranslations('editor');
  return (
    <div aria-busy="true" className="flex h-dvh flex-col">
      <span className="sr-only">{t('loading')}</span>
      <div className="flex h-14 items-center gap-3 border-b px-4">
        <Skeleton className="h-8 w-48" />
      </div>
      <div className="flex-1 p-6">
        <Skeleton className="mx-auto h-40 w-full max-w-2xl rounded-2xl" />
      </div>
    </div>
  );
}

/** The "More" sheet on phones: staged views when enabled, settings and statistics. */
function MoreSheet({
  open,
  onOpenChange,
  onSettings,
  onStatistics,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettings: () => void;
  onStatistics: () => void;
}) {
  const t = useTranslations();
  const extra = enabledViews().filter((view) => !PRIMARY_VIEWS.includes(view));
  const item = 'flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-accent';
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>{t('editor.more')}</DrawerTitle>
          <DrawerDescription className="sr-only">{t('editor.menu')}</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-1 px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {extra.map((view) => {
            const Icon = VIEW_ICONS[view];
            return (
              <button
                key={view}
                type="button"
                className={item}
                onClick={() => {
                  uiStore.getState().setView(view);
                  onOpenChange(false);
                }}
              >
                <Icon className="size-5" aria-hidden /> {t(`views.name.${view}`)}
              </button>
            );
          })}
          <button type="button" className={item} onClick={onSettings}>
            <Settings2Icon className="size-5" aria-hidden /> {t('treeSettings.title')}
          </button>
          <button type="button" className={item} onClick={onStatistics}>
            <ChartColumnIcon className="size-5" aria-hidden /> {t('statistics.title')}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** The view area: the empty-tree start, or the current view. */
function ViewArea() {
  const view = useUi((s) => s.view);
  const count = useTree((s) => s.persons.size);
  const expected = useTree((s) => s.tree?.personCount ?? 0);
  if (count === 0 && expected === 0) return <EmptyTree />;
  if (count === 0) {
    return <Skeleton className="mx-auto mt-6 h-40 w-[calc(100%-2rem)] max-w-2xl rounded-2xl" />;
  }
  if (view === 'tree') return <TreeView />;
  return <ViewPlaceholder view={view} />;
}

/**
 * The editor frame for one tree (P3-03): header, the current view, the details panel and,
 * on phones, the bottom bar. Views themselves arrive in P4 (Tree) and P6 (the others).
 */
export function EditorShell({ treeId }: { treeId: ID }) {
  const t = useTranslations();
  const { session } = useSession();
  const { status, errorCode } = useTreeSession(treeId);
  const tree = useTree((s) => s.tree);
  const [panel, setPanel] = useState<'settings' | 'statistics' | 'more' | null>(null);
  useEditorUrlState(treeId, tree?.settings.defaultView);

  const name = tree?.name;
  useEffect(() => {
    if (name) document.title = `${name} · ${APP_NAME}`;
  }, [name]);

  if (!hasUser(session)) return null;
  const unavailable = status === 'missing' || errorCode === 'permission-denied';
  if (unavailable || (status === 'error' && !tree)) {
    return (
      <Centered>
        <TriangleAlertIcon className="size-8 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold">
          {t(unavailable ? 'editor.missingTitle' : 'editor.errorTitle')}
        </h1>
        <p className="text-muted-foreground">
          {t(unavailable ? 'editor.missingBody' : 'editor.errorBody')}
        </p>
        <div className="flex gap-2">
          {!unavailable && (
            <Button variant="outline" onClick={() => window.location.reload()}>
              {t('common.retry')}
            </Button>
          )}
          <Button asChild>
            <Link href="/trees">{t('editor.allTrees')}</Link>
          </Button>
        </div>
      </Centered>
    );
  }
  if (!tree) return <EditorSkeleton />;

  const open = (next: typeof panel) => setPanel(next);
  const close = (isOpen: boolean) => {
    if (!isOpen) setPanel(null);
  };

  return (
    <EditorProvider actorId={session.user.uid}>
      <div className="flex h-dvh flex-col">
        <EditorHeader
          tree={tree}
          uid={session.user.uid}
          onSettings={() => open('settings')}
          onStatistics={() => open('statistics')}
        />
        <div className="flex min-h-0 flex-1">
          <main id="main" className="min-w-0 flex-1 overflow-y-auto">
            <ViewArea />
          </main>
          <DetailsContainer />
        </div>
        <SelectionBar className="lg:hidden" />
        <BottomNav className="lg:hidden" onMore={() => open('more')} />
      </div>

      <AddRelativeFlows />
      <TreeSettingsDialog tree={tree} open={panel === 'settings'} onOpenChange={close} />
      <MoreSheet
        open={panel === 'more'}
        onOpenChange={close}
        onSettings={() => open('settings')}
        onStatistics={() => open('statistics')}
      />
      <Drawer open={panel === 'statistics'} onOpenChange={close}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{t('statistics.title')}</DrawerTitle>
            <DrawerDescription className="sr-only">{tree.name}</DrawerDescription>
          </DrawerHeader>
          <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <StatisticsList />
          </div>
        </DrawerContent>
      </Drawer>
    </EditorProvider>
  );
}
