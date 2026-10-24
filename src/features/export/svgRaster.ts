import { embeddedFonts, inlineSvgImages, themeCss } from './inline';

import type { Rect } from './geometry';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A scene ready to draw any part of (ADR-006): the stage's SVG cloned with its fonts,
 * colours and photos inside, so the browser shapes Bangla itself (EXP-05). No
 * foreignObject, so Safari draws it reliably.
 */
export interface PreparedSvg {
  /** The SVG source showing `area`, drawn at `width` × `height` pixels. */
  source: (area: Rect, width: number, height: number) => string;
}

export async function prepareSvg(svg: SVGSVGElement, signal?: AbortSignal): Promise<PreparedSvg> {
  const family = getComputedStyle(svg).fontFamily;
  const fonts = await embeddedFonts(family);
  signal?.throwIfAborted();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  // Nothing interactive survives: names for screen readers and focus aren't drawn.
  for (const element of Array.from(clone.querySelectorAll('[role],[tabindex],[aria-label]'))) {
    element.removeAttribute('role');
    element.removeAttribute('tabindex');
    element.removeAttribute('aria-label');
  }
  await inlineSvgImages(clone, signal);
  const style = document.createElementNS(SVG_NS, 'style');
  style.textContent = `${fonts}\n${themeCss(svg)}\nsvg{font-family:${family};}`;
  clone.insertBefore(style, clone.firstChild);
  // Serialized once: each page only swaps the root's viewBox and size.
  for (const name of ['viewBox', 'width', 'height']) clone.removeAttribute(name);
  const text = new XMLSerializer().serializeToString(clone);
  const open = text.indexOf('<svg') + '<svg'.length;
  return {
    source: (area, width, height) =>
      `${text.slice(0, open)} viewBox="${area.x} ${area.y} ${area.w} ${area.h}" width="${width}" height="${height}"${text.slice(open)}`,
  };
}

/** Draws SVG source into a new canvas on a white page. */
export async function svgToCanvas(
  source: string,
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    signal?.throwIfAborted();
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A canvas as a file's bytes. */
export function canvasBlob(
  canvas: HTMLCanvasElement,
  type: 'image/png' | 'image/jpeg',
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('blob'))), type, quality),
  );
}

/** Frees a canvas's memory at once (iOS keeps it otherwise). */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}
