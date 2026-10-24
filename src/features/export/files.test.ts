import { afterEach, describe, expect, it, vi } from 'vitest';

import { deliverFile, exportFileName, localDate, safeName, yieldToMain } from './files';

describe('file names (DESIGN §14)', () => {
  it('keeps Bangla, drops what file systems refuse', () => {
    const date = new Date(2026, 9, 4);
    expect(exportFileName('করিম পরিবার', 'tree', date, 'png')).toBe(
      'করিম-পরিবার-tree-2026-10-04.png',
    );
    expect(exportFileName('a/b: "c"?', 'circle', date, 'pdf')).toBe('a-b-c-circle-2026-10-04.pdf');
    expect(exportFileName('...', 'backup', date, 'json')).toBe('shikor-backup-2026-10-04.json');
    expect(localDate(new Date(2026, 0, 9))).toBe('2026-01-09');
  });

  it('cuts long names between graphemes, never inside a conjunct', () => {
    const name = 'ক্ষ'.repeat(100);
    const cut = safeName(name);
    expect(cut).toBe('ক্ষ'.repeat(80));
  });
});

describe('deliverFile (EXP-07)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shares where the browser can share files', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { canShare: () => true, share });
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    await expect(deliverFile(file, 'Tree')).resolves.toBe(true);
    expect(share).toHaveBeenCalledWith({ files: [file], title: 'Tree' });
  });

  it('reports a closed share sheet, and downloads otherwise', async () => {
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: () => Promise.reject(new DOMException('no', 'AbortError')),
    });
    const file = new File(['x'], 'a.png');
    await expect(deliverFile(file, 'Tree')).resolves.toBe(false);

    vi.stubGlobal('navigator', {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    await expect(deliverFile(file, 'Tree')).resolves.toBe(true);
    expect(click).toHaveBeenCalled();
  });
});

describe('yieldToMain (EXP-08)', () => {
  it('stops when cancelled', async () => {
    await expect(yieldToMain()).resolves.toBeUndefined();
    const controller = new AbortController();
    controller.abort();
    await expect(yieldToMain(controller.signal)).rejects.toThrow();
  });
});
