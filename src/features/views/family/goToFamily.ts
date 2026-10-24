import { editorSearch } from '@/features/editor/shell/urlState';
import type { ID } from '@/lib/domain/types';
import { uiStore } from '@/stores/uiStore';

/**
 * Opens someone's family in the Family card (FC-02): a browser history entry, so Back
 * returns. They are selected too, so the other views centre on them (FC-06).
 */
export function goToFamily(personId: ID): void {
  const ui = uiStore.getState();
  if (personId === ui.familyId) return;
  const search = editorSearch(window.location.search, 'family', ui.focusId, personId);
  window.history.pushState(null, '', `${window.location.pathname}${search}`);
  ui.openFamily(personId);
}
