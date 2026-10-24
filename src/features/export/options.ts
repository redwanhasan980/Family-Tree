import type { ExportView } from './files';
import type { Orientation, Paper } from './geometry';

export type ExportFormat = 'png' | 'pdf';
/** PDF only: shrink the scene onto one page, or print it at its natural size across pages. */
export type PdfPages = 'one' | 'tiles';

/** Everything the export dialog asks (EXP-03, EXP-04). */
export interface ExportOptions {
  format: ExportFormat;
  view: ExportView;
  paper: Paper;
  orientation: Orientation;
  pages: PdfPages;
  /** Empty means the tree's name. */
  title: string;
  subtitle: string;
  photos: boolean;
  legend: boolean;
  date: boolean;
  quality: 1 | 2 | 3;
  /** Draw everyone, folded branches too (EXP-04). */
  expandAll: boolean;
}

export const DEFAULT_OPTIONS: ExportOptions = {
  format: 'png',
  view: 'tree',
  paper: 'a4',
  orientation: 'auto',
  pages: 'one',
  title: '',
  subtitle: '',
  photos: true,
  legend: true,
  date: true,
  quality: 2,
  expandAll: false,
};

/** What is remembered between exports: the choices, not the per-tree texts or view. */
type Remembered = Omit<ExportOptions, 'title' | 'subtitle' | 'view'>;

const pick = <T extends string | number | boolean>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T => (allowed.includes(value as T) ? (value as T) : fallback);

/** Reads remembered options, ignoring anything unknown or broken. */
export function readRemembered(raw: string | null): Partial<ExportOptions> {
  let saved: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') saved = parsed as Record<string, unknown>;
  } catch {
    return {};
  }
  const d = DEFAULT_OPTIONS;
  const bools = [true, false] as const;
  return {
    format: pick(saved.format, ['png', 'pdf'] as const, d.format),
    paper: pick(saved.paper, ['a4', 'a3', 'letter', 'fit'] as const, d.paper),
    orientation: pick(saved.orientation, ['auto', 'portrait', 'landscape'] as const, d.orientation),
    pages: pick(saved.pages, ['one', 'tiles'] as const, d.pages),
    photos: pick(saved.photos, bools, d.photos),
    legend: pick(saved.legend, bools, d.legend),
    date: pick(saved.date, bools, d.date),
    quality: pick(saved.quality, [1, 2, 3] as const, d.quality),
    expandAll: pick(saved.expandAll, bools, d.expandAll),
  };
}

export function toRemembered(options: ExportOptions): string {
  const { title: _title, subtitle: _subtitle, view: _view, ...rest } = options;
  return JSON.stringify(rest satisfies Remembered);
}

/** Which views can export (EXP-01/02); Album and Timeline join when they ship. */
export const EXPORT_VIEWS: readonly ExportView[] = ['tree', 'family', 'circle', 'list'];

/** Folding applies to the Tree and List; the Circle shows its rings, the card one family. */
export const canExpand = (view: ExportView) => view === 'tree' || view === 'list';
