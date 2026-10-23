'use client';

import { useTranslations } from 'next-intl';
import { forwardRef, useId, type ComponentProps } from 'react';

import { cn } from '@/lib/utils';

type Props = Omit<ComponentProps<'input'>, 'type' | 'value'> & {
  legend: string;
  error?: string;
  /** Words for the two choices, such as Father/Mother (REL-12). Default: Man/Woman. */
  labels?: { male: string; female: string };
  /** Controlled use: the chosen value (with `onChange`); leave out with react-hook-form. */
  selected?: 'male' | 'female' | null;
};

const OPTIONS = ['male', 'female'] as const;

/**
 * Man or woman as two large toggle buttons (native radios, so keyboards just work), or
 * the relationship words for them.
 */
export const GenderChoice = forwardRef<HTMLInputElement, Props>(function GenderChoice(
  { legend, error, labels, selected, className, ...props },
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
            <input
              ref={ref}
              type="radio"
              value={value}
              className="sr-only"
              {...(selected !== undefined && { checked: selected === value })}
              {...props}
            />
            {labels ? labels[value] : t(value)}
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
