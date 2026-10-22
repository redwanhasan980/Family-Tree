import type { ReactNode } from 'react';

/** Centred card used by the sign-up, log-in and reset pages. */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-8 sm:py-14">
      <div className="space-y-6 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="space-y-1.5 text-center">
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
