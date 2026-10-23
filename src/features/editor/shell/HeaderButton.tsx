'use client';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import type { ComponentProps, ReactNode } from 'react';

/** ⌘⇧ on Apple devices, Ctrl+Shift+ elsewhere; read only once a tooltip opens. */
function modifiers(shift: boolean): string {
  const apple = /Mac|iPhone|iPad/.test(navigator.userAgent);
  if (apple) return shift ? '⌘⇧' : '⌘';
  return shift ? 'Ctrl+Shift+' : 'Ctrl+';
}

/**
 * An icon button in the editor header with a tooltip naming it and its shortcut: `keys`
 * follows the platform's modifier keys, so "Z" shows as ⌘Z or Ctrl+Z.
 */
export function HeaderButton({
  label,
  keys,
  shift = false,
  children,
  ...props
}: {
  label: string;
  keys?: string;
  shift?: boolean;
  children: ReactNode;
} & ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="leading-relaxed">
        {label}
        {keys && (
          <kbd className="ml-2 font-sans opacity-70">
            {modifiers(shift)}
            {keys}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
