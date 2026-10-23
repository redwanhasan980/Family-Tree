'use client';

import { useEffect } from 'react';

import { uiStore, type AddKind } from '@/stores/uiStore';

import { acceptsShortcuts, editorShortcut, type EditorShortcut } from './shortcuts';
import { useUndoRedo } from './useUndoRedo';

const ADD: Partial<Record<EditorShortcut, AddKind>> = {
  addChild: 'child',
  addSpouse: 'spouse',
  addParent: 'parent',
};

/**
 * The editor's keyboard shortcuts (TV-09): undo and redo, search, and adding relatives
 * to or deleting the selected person. Views handle their own keys (arrows, F to fit).
 */
export function useEditorShortcuts(): void {
  const { undo, redo } = useUndoRedo();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || !acceptsShortcuts(event.target)) return;
      const shortcut = editorShortcut(event);
      const ui = uiStore.getState();
      // The person whose card has keyboard focus, else the selected one.
      const card =
        event.target instanceof Element ? event.target.closest('[data-person-id]') : null;
      const personId = card?.getAttribute('data-person-id') ?? ui.selectedId;
      switch (shortcut) {
        case 'undo':
          undo();
          break;
        case 'redo':
          redo();
          break;
        case 'search':
          ui.setSearchOpen(true);
          break;
        case 'addChild':
        case 'addSpouse':
        case 'addParent':
          if (!personId) return;
          ui.select(personId);
          ui.startAdd({ personId, kind: ADD[shortcut]! });
          break;
        case 'delete':
          if (!personId) return;
          ui.setDeleting(personId);
          break;
        case 'fit':
        case null:
          return;
        default:
          shortcut satisfies never;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);
}
