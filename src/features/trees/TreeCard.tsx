'use client';

import { MoreVerticalIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { useFormatter, useLocale, useNow, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar } from '@/features/media/Avatar';
import { Link } from '@/i18n/navigation';
import { displayName, scriptOf } from '@/lib/domain/names';
import type { ID, Locale, Tree } from '@/lib/domain/types';

import { useRootPerson } from './useMyTrees';

/**
 * One tree on the dashboard (TREE-02): cover, name, root person, people count, last
 * change and the user's role. The whole card opens the tree; the menu sits above it.
 */
export function TreeCard({
  tree,
  uid,
  onDetails,
  onDelete,
}: {
  tree: Tree;
  uid: ID;
  onDetails: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('trees');
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const root = useRootPerson(tree);
  const role = tree.roles[uid] ?? 'viewer';
  const rootName = root ? displayName(root.names, tree.settings.nameDisplay, locale) : null;
  const treeLang = scriptOf(tree.name);
  const cover = rootName?.text ? rootName : { text: tree.name, lang: treeLang };

  return (
    <article className="relative flex w-full flex-col gap-4 rounded-2xl border bg-card p-4 transition-shadow focus-within:ring-[3px] focus-within:ring-ring/50 hover:shadow-md sm:p-5">
      <div className="flex items-start gap-3">
        <Avatar
          name={cover}
          photo={tree.settings.showPhotos ? root?.photo : null}
          className="size-12 text-lg"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg leading-snug font-semibold">
            <Link
              href={`/trees/${tree.id}`}
              lang={treeLang}
              className="line-clamp-2 outline-none after:absolute after:inset-0 after:rounded-2xl"
            >
              {tree.name}
            </Link>
          </h2>
          {rootName?.text && (
            <p className="truncate text-sm text-muted-foreground">
              {t.rich('startsWith', {
                name: rootName.text,
                person: (chunks) => <span lang={rootName.lang}>{chunks}</span>,
              })}
            </p>
          )}
        </div>
        {role !== 'viewer' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative z-10 -mt-1 -mr-1 size-11 shrink-0"
                aria-label={t('options', { name: tree.name })}
              >
                <MoreVerticalIcon className="size-5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={onDetails}>
                <PencilIcon aria-hidden /> {t('details')}
              </DropdownMenuItem>
              {role === 'owner' && (
                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  <Trash2Icon aria-hidden /> {t('delete')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">
          {t('people', { count: tree.personCount })}
        </span>
        <span>
          {t('updated', { time: format.relativeTime(tree.updatedAt, { now, style: 'long' }) })}
        </span>
        <span className="ml-auto rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
          <span className="sr-only">{t('role', { role: t(`roles.${role}`) })}</span>
          <span aria-hidden>{t(`roles.${role}`)}</span>
        </span>
      </div>
    </article>
  );
}
