import { isValidId } from '@/lib/domain/ids';
import type { ID, ViewKind } from '@/lib/domain/types';
import type { InitialUi } from '@/stores/uiStore';

/**
 * The editor keeps the view and the focus person in the URL (`?view=list&focus=abc`), and
 * the Family card's person (`&person=abc`), so links, reloads and Back land in the same
 * place (P3-03, FC-02). Unknown values are ignored.
 */
export function readEditorParams(search: string, allowed: readonly ViewKind[]): InitialUi {
  const params = new URLSearchParams(search);
  const view = params.get('view');
  const focus = params.get('focus');
  const person = params.get('person');
  const usable = view && (allowed as readonly string[]).includes(view);
  return {
    ...(usable && { view: view as ViewKind }),
    ...(focus && isValidId(focus) && { focusId: focus }),
    ...(usable && view === 'family' && person && isValidId(person) && { familyId: person }),
    allowed,
  };
}

/** The query string for a view and focus, keeping any other parameters. */
export function editorSearch(
  current: string,
  view: ViewKind,
  focusId: ID | null,
  familyId: ID | null = null,
): string {
  const params = new URLSearchParams(current);
  params.set('view', view);
  if (focusId) params.set('focus', focusId);
  else params.delete('focus');
  if (view === 'family' && familyId) params.set('person', familyId);
  else params.delete('person');
  return `?${params.toString()}`;
}
