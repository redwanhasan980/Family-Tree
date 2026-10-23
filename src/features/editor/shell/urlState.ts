import { isValidId } from '@/lib/domain/ids';
import type { ID, ViewKind } from '@/lib/domain/types';
import type { InitialUi } from '@/stores/uiStore';

/**
 * The editor keeps the view and the focus person in the URL (`?view=list&focus=abc`), so
 * links and reloads land in the same place (P3-03). Unknown values are ignored.
 */
export function readEditorParams(search: string, allowed: readonly ViewKind[]): InitialUi {
  const params = new URLSearchParams(search);
  const view = params.get('view');
  const focus = params.get('focus');
  return {
    ...(view && (allowed as readonly string[]).includes(view) && { view: view as ViewKind }),
    ...(focus && isValidId(focus) && { focusId: focus }),
    allowed,
  };
}

/** The query string for a view and focus, keeping any other parameters. */
export function editorSearch(current: string, view: ViewKind, focusId: ID | null): string {
  const params = new URLSearchParams(current);
  params.set('view', view);
  if (focusId) params.set('focus', focusId);
  else params.delete('focus');
  return `?${params.toString()}`;
}
