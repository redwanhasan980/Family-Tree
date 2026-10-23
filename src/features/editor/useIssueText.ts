'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import type { Issue } from '@/lib/domain/types';

/**
 * Turns command issues into sentences (DESIGN §12.5): graph and command codes live in
 * `issues`, form validation codes in `validation`.
 */
export function useIssueText(): (issue: Issue) => string {
  const t = useTranslations();
  return useCallback(
    (issue: Issue) => {
      const values = (issue.params ?? {}) as Record<string, string | number>;
      if (t.has(`issues.${issue.code}` as never))
        return t(`issues.${issue.code}` as never, values as never);
      if (t.has(`validation.${issue.code}` as never)) return t(`validation.${issue.code}` as never);
      return t('issues.unknown');
    },
    [t],
  );
}
