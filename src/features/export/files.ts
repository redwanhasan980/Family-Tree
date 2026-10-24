/** What an export is of; the Latin slug goes into file names. */
export type ExportView = 'tree' | 'family' | 'circle' | 'list';

/** Characters file systems refuse, and control characters. */

const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;
const MAX_GRAPHEMES = 80;

/** A tree's name made safe for a file name, Bangla kept, cut by graphemes (rule 9). */
export function safeName(name: string): string {
  const cleaned = name
    .replace(ILLEGAL, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '');
  const graphemes = [
    ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(cleaned),
  ];
  const cut = graphemes
    .slice(0, MAX_GRAPHEMES)
    .map((g) => g.segment)
    .join('')
    .trim();
  return cut.replace(/ /g, '-') || 'shikor';
}

/** `YYYY-MM-DD` in local time: the day the person exported on. */
export function localDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `{treeName}-{view}-{YYYY-MM-DD}.{ext}` (DESIGN §14). */
export function exportFileName(
  treeName: string,
  what: ExportView | 'backup',
  date: Date,
  ext: 'png' | 'pdf' | 'json',
): string {
  return `${safeName(treeName)}-${what}-${localDate(date)}.${ext}`;
}

/**
 * Hands a file over (EXP-07): the share sheet where the browser can share files (phones,
 * straight to WhatsApp), else a download. Resolves false when the person closed the sheet.
 */
export async function deliverFile(file: File, title: string): Promise<boolean> {
  const share = typeof navigator !== 'undefined' ? navigator : null;
  if (share?.canShare?.({ files: [file] }) && share.share) {
    try {
      await share.share({ files: [file], title });
      return true;
    } catch (error) {
      // Cancelled: nothing to do. Anything else falls back to a download.
      if (error instanceof DOMException && error.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before the address goes.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/** Lets the page paint and answer input between heavy steps (EXP-08); throws if cancelled. */
export async function yieldToMain(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (scheduler?.yield) await scheduler.yield();
  else await new Promise((resolve) => setTimeout(resolve, 0));
  signal?.throwIfAborted();
}
