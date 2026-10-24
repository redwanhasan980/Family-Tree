import { describe, expect, it } from 'vitest';

import { editorSearch, readEditorParams } from './urlState';

const allowed = ['tree', 'family', 'circle', 'list'] as const;

describe('editor URL state', () => {
  it('reads a known view and a valid focus person', () => {
    expect(readEditorParams('?view=list&focus=p1', allowed)).toEqual({
      view: 'list',
      focusId: 'p1',
      allowed,
    });
    expect(readEditorParams('?view=album&focus=../x', allowed)).toEqual({ allowed });
    expect(readEditorParams('', allowed)).toEqual({ allowed });
  });

  it('writes the view and focus, keeping other parameters', () => {
    expect(editorSearch('?utm=x', 'circle', 'p2')).toBe('?utm=x&view=circle&focus=p2');
    expect(editorSearch('?view=tree&focus=p2', 'list', null)).toBe('?view=list');
  });

  it('keeps the Family card’s person, only in the Family card (FC-02)', () => {
    expect(readEditorParams('?view=family&person=p3', allowed)).toEqual({
      view: 'family',
      familyId: 'p3',
      allowed,
    });
    expect(readEditorParams('?view=tree&person=p3', allowed)).toEqual({ view: 'tree', allowed });
    expect(editorSearch('?view=tree', 'family', null, 'p3')).toBe('?view=family&person=p3');
    expect(editorSearch('?view=family&person=p3', 'tree', null, 'p3')).toBe('?view=tree');
  });
});
