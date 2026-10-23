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
});
