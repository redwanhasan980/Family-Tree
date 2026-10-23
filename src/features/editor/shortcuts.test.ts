import { describe, expect, it } from 'vitest';

import { acceptsShortcuts, editorShortcut, shortcutKey } from './shortcuts';

const press = (key: string, extra: Partial<KeyboardEvent> = {}) => ({
  key,
  code: '',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...extra,
});

describe('editor shortcuts (TV-09)', () => {
  it('maps letters, whatever the keyboard layout', () => {
    expect(shortcutKey({ key: 'C', code: 'KeyC' })).toBe('c');
    // A Bangla layout on the K key.
    expect(shortcutKey({ key: 'ক', code: 'KeyK' })).toBe('k');
    expect(shortcutKey({ key: '/', code: 'Slash' })).toBe('/');
    expect(shortcutKey({ key: '্', code: 'Slash' })).toBe('/');
    expect(shortcutKey({ key: 'Delete', code: 'Delete' })).toBe('Delete');
  });

  it('knows undo, redo and search with Ctrl or ⌘', () => {
    expect(editorShortcut(press('z', { ctrlKey: true }))).toBe('undo');
    expect(editorShortcut(press('z', { metaKey: true }))).toBe('undo');
    expect(editorShortcut(press('Z', { metaKey: true, shiftKey: true }))).toBe('redo');
    expect(editorShortcut(press('y', { ctrlKey: true }))).toBe('redo');
    expect(editorShortcut(press('k', { ctrlKey: true }))).toBe('search');
    expect(editorShortcut(press('ক', { code: 'KeyK', metaKey: true }))).toBe('search');
    expect(editorShortcut(press('c', { ctrlKey: true }))).toBeNull();
    expect(editorShortcut(press('z', { ctrlKey: true, altKey: true }))).toBeNull();
  });

  it('knows the single keys', () => {
    expect(editorShortcut(press('/'))).toBe('search');
    expect(editorShortcut(press('c'))).toBe('addChild');
    expect(editorShortcut(press('S', { shiftKey: true }))).toBe('addSpouse');
    expect(editorShortcut(press('p'))).toBe('addParent');
    expect(editorShortcut(press('f'))).toBe('fit');
    expect(editorShortcut(press('Delete'))).toBe('delete');
    expect(editorShortcut(press('Backspace'))).toBe('delete');
    expect(editorShortcut(press('x'))).toBeNull();
    expect(editorShortcut(press('Enter'))).toBeNull();
  });

  it('stays out of the way of typing, dialogs and menus', () => {
    document.body.innerHTML = `
      <input id="name" />
      <div contenteditable="true"><span id="rich"></span></div>
      <div role="dialog"><button id="in-dialog"></button></div>
      <div role="menu"><div id="in-menu"></div></div>
      <svg><g id="card"></g></svg>
      <button id="plain"></button>`;
    const el = (id: string) => document.getElementById(id);
    expect(acceptsShortcuts(el('name'))).toBe(false);
    expect(acceptsShortcuts(el('rich'))).toBe(false);
    expect(acceptsShortcuts(el('in-dialog'))).toBe(false);
    expect(acceptsShortcuts(el('in-menu'))).toBe(false);
    expect(acceptsShortcuts(el('card'))).toBe(true);
    expect(acceptsShortcuts(el('plain'))).toBe(true);
    expect(acceptsShortcuts(document.body)).toBe(true);
    expect(acceptsShortcuts(null)).toBe(true);
  });
});
