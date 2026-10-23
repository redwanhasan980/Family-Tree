'use client';

import {
  ArrowLeftIcon,
  ChartColumnIcon,
  EllipsisVerticalIcon,
  LanguagesIcon,
  LogOutIcon,
  Redo2Icon,
  SearchIcon,
  Settings2Icon,
  Undo2Icon,
  UserCogIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { AppName } from '@/components/app/AppName';
import { LanguageSwitch, LOCALE_LABELS, useSwitchLocale } from '@/components/app/LanguageSwitch';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AccountMenu, useLogOut } from '@/features/auth/AccountMenu';
import { GuestChip } from '@/features/auth/GuestChip';
import { useSession } from '@/features/auth/SessionProvider';
import { Link } from '@/i18n/navigation';
import type { ID, Locale, Tree } from '@/lib/domain/types';
import { uiStore } from '@/stores/uiStore';

import { useUndoRedo } from '../useUndoRedo';
import { HeaderButton } from './HeaderButton';
import { SaveStatus } from './SaveStatus';
import { StatisticsList } from './Statistics';
import { TreeSwitcher } from './TreeSwitcher';
import { ViewTabs } from './ViewNav';

/** The phone menu: redo, tree settings, statistics, language, account settings, log out. */
function MobileMenu({
  onSettings,
  onStatistics,
}: {
  onSettings: () => void;
  onStatistics: () => void;
}) {
  const t = useTranslations();
  const { session } = useSession();
  const logOut = useLogOut();
  const locale = useLocale() as Locale;
  const other: Locale = locale === 'bn' ? 'en' : 'bn';
  const { switchTo } = useSwitchLocale();
  const { redo, redoLabel } = useUndoRedo();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11" aria-label={t('editor.menu')}>
          <EllipsisVerticalIcon className="size-5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem className="min-h-11" disabled={!redoLabel} onSelect={redo}>
          <Redo2Icon aria-hidden />{' '}
          {redoLabel ? t('editor.redoWhat', { action: redoLabel }) : t('editor.redo')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-11" onSelect={onSettings}>
          <Settings2Icon aria-hidden /> {t('treeSettings.title')}
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-11" onSelect={onStatistics}>
          <ChartColumnIcon aria-hidden /> {t('statistics.title')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-11" onSelect={() => switchTo(other)}>
          <LanguagesIcon aria-hidden /> <span lang={other}>{LOCALE_LABELS[other]}</span>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="min-h-11">
          <Link href="/settings">
            <UserCogIcon aria-hidden /> {t('nav.settings')}
          </Link>
        </DropdownMenuItem>
        {session.status === 'registered' && (
          <DropdownMenuItem className="min-h-11" onSelect={() => void logOut()}>
            <LogOutIcon aria-hidden /> {t('nav.logOut')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The editor's header (P3-01, DESIGN §21.6). Desktop: logo, tree switcher, view tabs,
 * save status, statistics, settings, language and account. Phone: back, tree switcher
 * with the save status under it, and a menu.
 */
export function EditorHeader({
  tree,
  uid,
  onSettings,
  onStatistics,
}: {
  tree: Tree;
  uid: ID;
  onSettings: () => void;
  onStatistics: () => void;
}) {
  const t = useTranslations();
  const { session } = useSession();
  const guest = session.status === 'guest';
  const { undo, redo, undoLabel, redoLabel } = useUndoRedo();
  const search = () => uiStore.getState().setSearchOpen(true);

  return (
    <TooltipProvider delayDuration={400}>
      <header className="z-40 border-b bg-background/95 backdrop-blur">
        <div className="flex min-h-14 items-center gap-1 px-1 py-1 sm:px-2 lg:gap-2 lg:px-4">
          <Button asChild variant="ghost" size="icon" className="size-11 shrink-0 lg:hidden">
            <Link href="/trees" aria-label={t('editor.allTrees')}>
              <ArrowLeftIcon className="size-5" aria-hidden />
            </Link>
          </Button>
          <Link
            href="/trees"
            className="mr-1 hidden shrink-0 items-center gap-1.5 text-lg lg:flex"
            aria-label={t('editor.allTrees')}
          >
            <span aria-hidden>🌳</span>
            <AppName />
          </Link>

          <div className="flex min-w-0 flex-1 flex-col lg:max-w-72 lg:flex-none">
            <TreeSwitcher tree={tree} uid={uid} className="h-9 lg:h-10" />
            <div className="flex min-w-0 items-center gap-2 px-2 lg:hidden">
              <SaveStatus className="text-xs" />
              {guest && <GuestChip className="min-h-6 px-2 text-xs" />}
            </div>
          </div>

          <ViewTabs className="hidden lg:flex" />

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <HeaderButton
              label={t('editor.search')}
              keys="K"
              aria-keyshortcuts="Control+K Meta+K /"
              className="size-11 lg:size-10"
              onClick={search}
            >
              <SearchIcon className="size-5" aria-hidden />
            </HeaderButton>
            <HeaderButton
              label={undoLabel ? t('editor.undoWhat', { action: undoLabel }) : t('editor.undo')}
              keys="Z"
              aria-keyshortcuts="Control+Z Meta+Z"
              className="size-11 lg:size-10"
              disabled={!undoLabel}
              onClick={undo}
            >
              <Undo2Icon className="size-5" aria-hidden />
            </HeaderButton>
            <HeaderButton
              label={redoLabel ? t('editor.redoWhat', { action: redoLabel }) : t('editor.redo')}
              keys="Z"
              shift
              aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
              className="hidden size-10 lg:inline-flex"
              disabled={!redoLabel}
              onClick={redo}
            >
              <Redo2Icon className="size-5" aria-hidden />
            </HeaderButton>
            <SaveStatus className="mx-2 hidden lg:inline-flex" />
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden size-10 lg:inline-flex"
                  aria-label={t('statistics.title')}
                >
                  <ChartColumnIcon className="size-5" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72">
                <p className="mb-1 font-semibold">{t('statistics.title')}</p>
                <StatisticsList />
              </PopoverContent>
            </Popover>
            <Button
              variant="ghost"
              size="icon"
              className="hidden size-10 lg:inline-flex"
              aria-label={t('treeSettings.title')}
              onClick={onSettings}
            >
              <Settings2Icon className="size-5" aria-hidden />
            </Button>
            <LanguageSwitch compact className="mx-1 hidden lg:inline-flex" />
            {/* Phones keep the room for the tree's name; the menu has the account items. */}
            <div className="hidden lg:block">
              <AccountMenu />
            </div>
            <div className="lg:hidden">
              <MobileMenu onSettings={onSettings} onStatistics={onStatistics} />
            </div>
          </div>
        </div>
      </header>
    </TooltipProvider>
  );
}
