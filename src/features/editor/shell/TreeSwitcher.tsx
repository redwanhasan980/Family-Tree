'use client';

import { CheckIcon, ChevronDownIcon, LayoutGridIcon, PlusIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CreateTreeDialog } from '@/features/trees/CreateTreeDialog';
import { useMyTrees } from '@/features/trees/useMyTrees';
import { Link } from '@/i18n/navigation';
import { scriptOf } from '@/lib/domain/names';
import type { ID, Tree } from '@/lib/domain/types';
import { cn } from '@/lib/utils';

/** The open tree's name; opens a list of the user's other trees (P3-01). */
export function TreeSwitcher({
  tree,
  uid,
  className,
}: {
  tree: Tree;
  uid: ID;
  className?: string;
}) {
  const t = useTranslations();
  const trees = useMyTrees(uid);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              'h-10 min-w-0 justify-start gap-1 px-2 text-base font-semibold',
              className,
            )}
            aria-label={t('editor.switchTree', { name: tree.name })}
          >
            <span lang={scriptOf(tree.name)} className="truncate">
              {tree.name}
            </span>
            <ChevronDownIcon className="size-4 shrink-0 opacity-70" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 max-w-[calc(100vw-2rem)]">
          {trees.status === 'ready' &&
            trees.trees.map((other) => (
              <DropdownMenuItem key={other.id} asChild>
                <Link href={`/trees/${other.id}`} className="min-h-10">
                  <CheckIcon className={cn(other.id !== tree.id && 'invisible')} aria-hidden />
                  <span lang={scriptOf(other.name)} className="truncate">
                    {other.name}
                  </span>
                </Link>
              </DropdownMenuItem>
            ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/trees" className="min-h-10">
              <LayoutGridIcon aria-hidden /> {t('editor.allTrees')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-10" onSelect={() => setCreating(true)}>
            <PlusIcon aria-hidden /> {t('trees.newTree')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateTreeDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
