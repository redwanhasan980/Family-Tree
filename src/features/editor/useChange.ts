'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';

import { useEditor } from './EditorProvider';
import { useIssueText } from './useIssueText';

import type { BuildResult, CommandContext } from './commands';

/** Runs a change and explains a refusal in a toast; returns whether it ran. */
export function useChange(): (build: (ctx: CommandContext) => BuildResult) => boolean {
  const editor = useEditor();
  const issueText = useIssueText();
  return useCallback(
    (build: (ctx: CommandContext) => BuildResult) => {
      const result = editor.run(build);
      if (!result.ok && !result.issues.every((i) => i.code === 'noChanges')) {
        toast.error(issueText(result.issues[0]!));
      }
      return result.ok;
    },
    [editor, issueText],
  );
}
