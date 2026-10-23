'use client';

import { CheckIcon, CloudOffIcon, LoaderCircleIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

import { useSaveStatus } from '../useTreeSession';

const ICONS = { saving: LoaderCircleIcon, saved: CheckIcon, offline: CloudOffIcon } as const;

/** "Saving…", "Saved" or "Offline: changes will sync" for the open tree (TREE-07, PWA-03). */
export function SaveStatus({ className }: { className?: string }) {
  const t = useTranslations('editor');
  const status = useSaveStatus();
  const Icon = ICONS[status];
  return (
    <span
      role="status"
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground',
        status === 'offline' && 'text-warning',
        className,
      )}
    >
      <Icon className={cn('size-4 shrink-0', status === 'saving' && 'animate-spin')} aria-hidden />
      <span className="truncate">{t(status)}</span>
    </span>
  );
}
