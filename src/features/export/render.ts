import { yieldToMain } from './files';
import {
  canvasLimits,
  clampScale,
  fitScale,
  MARGIN_MM,
  MIN_READABLE_PT,
  MM_PER_PX,
  pageSize,
  planTiles,
  printableArea,
  printedPt,
  rasterScale,
  type Size,
} from './geometry';
import { embeddedFonts } from './inline';
import { canvasBlob, prepareSvg, releaseCanvas, svgToCanvas } from './svgRaster';

import type { ExportOptions } from './options';
import type { SceneHandle } from './scenes/scene';
import type { jsPDF } from 'jspdf';

export interface ExportResult {
  blob: Blob;
  /** Names on paper when below MIN_READABLE_PT, to suggest full size. */
  smallPt: number | null;
  /** The PNG was drawn smaller than asked, to stay inside the canvas limits (EXP-06). */
  reduced: boolean;
}

export interface RenderControl {
  signal: AbortSignal;
  /** Steps done of all steps; pages for a PDF. */
  onProgress: (done: number, total: number) => void;
  title: string;
  creator: string;
}

/** Print resolution for each quality step (EXP-03). */
const DPI = { 1: 100, 2: 200, 3: 300 } as const;

function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iP(hone|ad|od)/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1);
}

function isSafari(): boolean {
  return /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
}

/** A page of a PDF: a picture placed at `place` (mm) on a page of `page` (mm). */
interface PdfPage {
  canvas: HTMLCanvasElement;
  page: Size;
  place: { x: number; y: number; w: number; h: number };
  cropMarks: boolean;
}

/** Writes pages one by one into a PDF, releasing each canvas once it is in (low memory). */
async function writePdf(pages: AsyncGenerator<PdfPage>, control: RenderControl): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  let doc: InstanceType<typeof jsPDF> | null = null;
  for await (const { canvas, page, place, cropMarks } of pages) {
    const orientation = page.w > page.h ? 'landscape' : 'portrait';
    const format: [number, number] = [page.w, page.h];
    if (doc) doc.addPage(format, orientation);
    else doc = new jsPDF({ unit: 'mm', format, orientation, compress: true });
    // JPEG keeps a page to a few hundred KB; the drawing is on white, so nothing is lost.
    doc.addImage(canvas, 'JPEG', place.x, place.y, place.w, place.h, undefined, 'FAST');
    if (cropMarks) drawCropMarks(doc, place);
    releaseCanvas(canvas);
    await yieldToMain(control.signal);
  }
  if (!doc) throw new Error('empty');
  doc.setProperties({ title: control.title, creator: control.creator });
  return doc.output('blob');
}

/** Corner marks around a tile, to cut and join the pages (DESIGN §14). */
function drawCropMarks(doc: jsPDF, { x, y, w, h }: PdfPage['place']): void {
  const m = 4;
  doc.setDrawColor(150);
  doc.setLineWidth(0.1);
  for (const [cx, cy, dx, dy] of [
    [x, y, -1, -1],
    [x + w, y, 1, -1],
    [x, y + h, -1, 1],
    [x + w, y + h, 1, 1],
  ] as const) {
    doc.line(cx, cy, cx + dx * m, cy);
    doc.line(cx, cy, cx, cy + dy * m);
  }
}

/** Centres `size` (mm) in the printable area of `page`. */
function centred(page: Size, size: Size): PdfPage['place'] {
  const area = printableArea(page);
  return {
    x: MARGIN_MM + (area.w - size.w) / 2,
    y: MARGIN_MM + (area.h - size.h) / 2,
    w: size.w,
    h: size.h,
  };
}

/** Tree and Circle: one picture, or PDF pages from parts of the same SVG (P7-04). */
async function renderSvg(
  scene: Extract<SceneHandle, { kind: 'svg' }>,
  options: ExportOptions,
  control: RenderControl,
): Promise<ExportResult> {
  const { size } = scene;
  const limits = canvasLimits(isIOS());
  const whole = { x: 0, y: 0, ...size };
  const prepared = await prepareSvg(scene.svg, control.signal);

  if (options.format === 'png') {
    control.onProgress(0, 1);
    const scale = clampScale(size, options.quality, limits);
    const canvas = await svgToCanvas(
      prepared.source(whole, size.w * scale, size.h * scale),
      size.w * scale,
      size.h * scale,
      control.signal,
    );
    const blob = await canvasBlob(canvas, 'image/png');
    releaseCanvas(canvas);
    control.onProgress(1, 1);
    return { blob, smallPt: null, reduced: scale < options.quality && scale < 1 };
  }

  const page = pageSize(options.paper, options.orientation, size);
  const dpi = DPI[options.quality];
  if (options.pages === 'tiles' && options.paper !== 'fit') {
    const tiles = planTiles(size, page);
    const area = printableArea(page);
    const first = tiles[0]!;
    const scale = clampScale(first, rasterScale(first.w, area.w, dpi, options.quality), limits);
    // A row of tiles is drawn in strips as wide as the canvas allows, then cut into pages:
    // far fewer drawings of the whole scene than one per page.
    const perStrip = Math.max(
      1,
      Math.floor(
        Math.min(limits.maxSide, limits.maxPixels / (first.h * scale)) / (first.w * scale),
      ),
    );
    async function* pages(): AsyncGenerator<PdfPage> {
      let done = 0;
      const rows = tiles.at(-1)!.row + 1;
      for (let row = 0; row < rows; row++) {
        const rowTiles = tiles.filter((tile) => tile.row === row);
        for (let start = 0; start < rowTiles.length; start += perStrip) {
          const group = rowTiles.slice(start, start + perStrip);
          const left = group[0]!;
          const right = group.at(-1)!;
          const strip = { x: left.x, y: left.y, w: right.x + right.w - left.x, h: left.h };
          const stripCanvas = await svgToCanvas(
            prepared.source(strip, strip.w * scale, strip.h * scale),
            strip.w * scale,
            strip.h * scale,
            control.signal,
          );
          for (const tile of group) {
            control.onProgress(done++, tiles.length);
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(tile.w * scale);
            canvas.height = Math.round(tile.h * scale);
            canvas
              .getContext('2d')!
              .drawImage(
                stripCanvas,
                Math.round((tile.x - strip.x) * scale),
                0,
                canvas.width,
                canvas.height,
                0,
                0,
                canvas.width,
                canvas.height,
              );
            yield {
              canvas,
              page,
              place: { x: MARGIN_MM, y: MARGIN_MM, ...area },
              cropMarks: tiles.length > 1,
            };
          }
          releaseCanvas(stripCanvas);
        }
      }
      control.onProgress(tiles.length, tiles.length);
    }
    return { blob: await writePdf(pages(), control), smallPt: null, reduced: false };
  }

  const mmPerPx =
    options.paper === 'fit' ? Math.min(MM_PER_PX, fitScale(size, page)) : fitScale(size, page);
  const placedMm = { w: size.w * mmPerPx, h: size.h * mmPerPx };
  const scale = clampScale(size, rasterScale(size.w, placedMm.w, dpi, options.quality), limits);
  async function* single(): AsyncGenerator<PdfPage> {
    control.onProgress(0, 1);
    const canvas = await svgToCanvas(
      prepared.source(whole, size.w * scale, size.h * scale),
      size.w * scale,
      size.h * scale,
      control.signal,
    );
    yield { canvas, page, place: centred(page, placedMm), cropMarks: false };
    control.onProgress(1, 1);
  }
  const pt = printedPt(scene.namePx, mmPerPx);
  return {
    blob: await writePdf(single(), control),
    smallPt: pt < MIN_READABLE_PT ? Math.round(pt * 10) / 10 : null,
    reduced: false,
  };
}

/**
 * Family card and List (HTML): html-to-image clones the elements into an SVG
 * foreignObject. Safari can miss fonts on the first pass, so it draws twice (ADR-006).
 */
async function htmlCanvas(
  element: HTMLElement,
  pixelRatio: number,
  signal: AbortSignal,
): Promise<HTMLCanvasElement> {
  const { toCanvas } = await import('html-to-image');
  const fontEmbedCSS = await embeddedFonts(getComputedStyle(element).fontFamily);
  const draw = () =>
    toCanvas(element, { pixelRatio, backgroundColor: '#ffffff', fontEmbedCSS, cacheBust: false });
  if (isSafari()) releaseCanvas(await draw());
  signal.throwIfAborted();
  const canvas = await draw();
  signal.throwIfAborted();
  return canvas;
}

async function renderHtml(
  scene: Extract<SceneHandle, { kind: 'html' }>,
  options: ExportOptions,
  control: RenderControl,
): Promise<ExportResult> {
  const limits = canvasLimits(isIOS());
  const sizeOf = (element: HTMLElement) => ({ w: element.offsetWidth, h: element.offsetHeight });

  if (options.format === 'png') {
    control.onProgress(0, 1);
    const size = sizeOf(scene.whole);
    const scale = clampScale(size, options.quality, limits);
    const canvas = await htmlCanvas(scene.whole, scale, control.signal);
    const blob = await canvasBlob(canvas, 'image/png');
    releaseCanvas(canvas);
    control.onProgress(1, 1);
    return { blob, smallPt: null, reduced: scale < options.quality && scale < 1 };
  }

  const dpi = DPI[options.quality];
  const frames = scene.pages ?? [scene.whole];
  let smallPt: number | null = null;
  async function* pages(): AsyncGenerator<PdfPage> {
    for (const [index, frame] of frames.entries()) {
      control.onProgress(index, frames.length);
      const size = sizeOf(frame);
      const page = pageSize(options.paper, options.orientation, size);
      const mmPerPx = options.paper === 'fit' ? MM_PER_PX : fitScale(size, page);
      const placed = { w: size.w * mmPerPx, h: size.h * mmPerPx };
      const pt = printedPt(scene.namePx, mmPerPx);
      if (pt < MIN_READABLE_PT) smallPt = Math.round(pt * 10) / 10;
      const scale = clampScale(size, rasterScale(size.w, placed.w, dpi, options.quality), limits);
      const canvas = await htmlCanvas(frame, scale, control.signal);
      yield { canvas, page, place: centred(page, placed), cropMarks: false };
    }
    control.onProgress(frames.length, frames.length);
  }
  const blob = await writePdf(pages(), control);
  return { blob, smallPt, reduced: false };
}

/** Turns a rendered scene into the file the options ask for (P7-04). */
export function renderExport(
  scene: SceneHandle,
  options: ExportOptions,
  control: RenderControl,
): Promise<ExportResult> {
  return scene.kind === 'svg'
    ? renderSvg(scene, options, control)
    : renderHtml(scene, options, control);
}
