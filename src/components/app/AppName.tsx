import { APP_NAME } from '@/lib/brand';
import { cn } from '@/lib/utils';

/**
 * Renders the product name. `lang="bn"` makes screen readers use Bangla pronunciation
 * on English pages, and `translate="no"` stops page translators from changing it.
 */
export function AppName({ className }: { className?: string }) {
  return (
    <span lang="bn" translate="no" className={cn('font-semibold', className)}>
      {APP_NAME}
    </span>
  );
}
