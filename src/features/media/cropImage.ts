import {
  MAX_PHOTO_BYTES,
  MIN_PHOTO_EDGE,
  PHOTO_EDGE,
  TARGET_PHOTO_BYTES,
} from '@/lib/domain/media';

/** A crop in the image's pixels, after rotation (as react-easy-crop reports it). */
export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Why a picked file can't be used: too large, or not a photo this browser can open. */
export class PhotoFileError extends Error {
  constructor(readonly code: 'tooBig' | 'notImage') {
    super(code);
    this.name = 'PhotoFileError';
  }
}

/**
 * Opens a picked file as an image (MED-01). HEIC opens where the browser can decode it
 * (Safari); elsewhere it reads as "not an image".
 */
export async function loadImage(file: Blob): Promise<{ image: HTMLImageElement; url: string }> {
  if (file.size > MAX_PHOTO_BYTES) throw new PhotoFileError('tooBig');
  if (file.type && !file.type.startsWith('image/')) throw new PhotoFileError('notImage');
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new PhotoFileError('notImage');
  }
  return { image, url };
}

function canvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  const context = element.getContext('2d');
  if (!context) throw new Error('canvas');
  return [element, context];
}

function encode(element: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    element.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas'))),
      'image/jpeg',
      quality,
    ),
  );
}

// Tried in order at each resolution; most photos land in the first step or two.
const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35];

/**
 * A JPEG of `source` at or under `maxBytes` (MED-03): steps quality down first, and if
 * even the lowest quality doesn't fit, shrinks the edge (never below `MIN_PHOTO_EDGE`)
 * and tries the quality ladder again. A busy, high-entropy photo that still doesn't fit
 * at the smallest size returns the best (smallest) attempt rather than failing the
 * upload, since the target is a goal, not a hard limit the app enforces.
 */
async function compressToBudget(
  source: HTMLCanvasElement,
  edge: number,
  maxBytes: number,
): Promise<Blob> {
  let element = source;
  let size = edge;
  let smallest: Blob | null = null;
  for (;;) {
    for (const quality of QUALITY_STEPS) {
      const blob = await encode(element, quality);
      if (!smallest || blob.size < smallest.size) smallest = blob;
      if (blob.size <= maxBytes) return blob;
    }
    if (size <= MIN_PHOTO_EDGE) return smallest!;
    size = Math.max(MIN_PHOTO_EDGE, Math.round(size * 0.75));
    const [shrunk, shrunkContext] = canvas(size, size);
    shrunkContext.imageSmoothingQuality = 'high';
    shrunkContext.drawImage(element, 0, 0, size, size);
    element = shrunk;
  }
}

/**
 * The square crop as a JPEG of at most `edge` pixels and `maxBytes` (MED-02/03). Rotation
 * is in quarter turns, so the rotated copy is never larger than the photo itself.
 */
export async function cropToBlob(
  image: HTMLImageElement,
  area: CropArea,
  rotation: number,
  edge: number = PHOTO_EDGE,
  maxBytes: number = TARGET_PHOTO_BYTES,
): Promise<Blob> {
  const turns = (((rotation / 90) % 4) + 4) % 4;
  const sideways = turns % 2 === 1;
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const [rotated, rotatedContext] = canvas(sideways ? h : w, sideways ? w : h);
  rotatedContext.translate(rotated.width / 2, rotated.height / 2);
  rotatedContext.rotate((turns * Math.PI) / 2);
  rotatedContext.drawImage(image, -w / 2, -h / 2);

  const size = Math.max(1, Math.min(edge, Math.round(area.width)));
  const [output, outputContext] = canvas(size, size);
  outputContext.imageSmoothingQuality = 'high';
  outputContext.drawImage(rotated, area.x, area.y, area.width, area.height, 0, 0, size, size);
  return compressToBudget(output, size, maxBytes);
}
