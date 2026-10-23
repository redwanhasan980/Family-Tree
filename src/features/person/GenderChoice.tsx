'use client';

import { useTranslations } from 'next-intl';
import { forwardRef, useId, type ComponentProps } from 'react';

import { cn } from '@/lib/utils';

type Props = Omit<ComponentProps<'input'>, 'type' | 'value'> & { legend: string; error?: string };

const OPTIONS = ['male', 'female'] as const;

/** Man or woman as two large toggle buttons (native radios, so keyboards just work). */
export const GenderChoice = forwardRef<HTMLInputElement, Props>(function GenderChoice(
  { legend, error, className, ...props },
  ref,
) {
  const t = useTranslations('person');
  const id = useId();
  return (
    <fieldset
      className={cn('space-y-1.5', className)}
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <legend className="text-sm leading-none font-medium">{legend}</legend>
      <div className="grid grid-cols-2 gap-2 pt-1.5">
        {OPTIONS.map((value) => (
          <label
            key={value}
            className="flex h-11 cursor-pointer items-center justify-center rounded-md border bg-background text-base font-medium transition-colors hover:bg-accent has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50"
          >
            <input ref={ref} type="radio" value={value} className="sr-only" {...props} />
            {t(value)}
          </label>
        ))}
      </div>
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
});
