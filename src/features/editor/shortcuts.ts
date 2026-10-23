/** What a key press asks the editor to do (TV-09, UX-01/03). */
export type EditorShortcut =
  'undo' | 'redo' | 'search' | 'addChild' | 'addSpouse' | 'addParent' | 'delete' | 'fit';

type KeyPress = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;

/**
 * The letter a key press means for shortcuts. A Bangla keyboard layout types a Bangla
 * letter on the K key, so letters fall back to the physical key.
 */
export function shortcutKey(event: Pick<KeyboardEvent, 'key' | 'code'>): string {
  if (/^[a-z]$/i.test(event.key)) return event.key.toLowerCase();
  const letter = /^Key([A-Z])$/.exec(event.code);
  if (letter) return letter[1]!.toLowerCase();
  if (event.code === 'Slash') return '/';
  return event.key;
}

export function editorShortcut(event: KeyPress): EditorShortcut | null {
  const key = shortcutKey(event);
  if (event.altKey) return null;
  if (event.ctrlKey || event.metaKey) {
    if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
    if (key === 'y' && !event.shiftKey) return 'redo';
    if (key === 'k') return 'search';
    return null;
  }
  switch (key) {
    case '/':
      return 'search';
    case 'c':
      return 'addChild';
    case 's':
      return 'addSpouse';
    case 'p':
      return 'addParent';
    case 'f':
      return 'fit';
    // The Mac key labelled "delete" sends Backspace.
    case 'Delete':
    case 'Backspace':
      return 'delete';
    default:
      return null;
  }
}

const TYPING = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const OVERLAY = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

/**
 * Shortcuts stay out of the way while someone types (Ctrl+Z then undoes their typing)
 * or works in a dialog or menu.
 */
export function acceptsShortcuts(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return !target.closest(TYPING) && !target.closest(OVERLAY);
}
