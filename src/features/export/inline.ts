/**
 * What a picture needs to stand on its own (P7-03): the app's fonts as data URLs, the
 * colour tokens as values, and photos as data URLs. A standalone SVG or a cloned page
 * can't load anything else when it is drawn into a canvas.
 */

/** Weights the views draw with; other faces aren't embedded. */
const WEIGHTS = new Set(['400', '500', '600']);

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('read'));
    reader.readAsDataURL(blob);
  });

/** Every CSS rule of the page's own style sheets (others can't be read, and needn't be). */
function* pageRules(): Generator<CSSRule> {
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    // Depth first: layers and media rules hold others, and so do style rules (nesting).
    const stack = [...Array.from(rules)];
    while (stack.length > 0) {
      const rule = stack.shift()!;
      yield rule;
      if ('cssRules' in rule) stack.unshift(...Array.from((rule as CSSGroupingRule).cssRules));
    }
  }
}

const unquote = (name: string) => name.trim().replace(/^["']|["']$/g, '');

/** Whether a face's weight (one value, or a variable range like "100 900") is drawn with. */
function usedWeight(weight: string): boolean {
  const [low, high] = weight.split(/\s+/);
  if (!high) return WEIGHTS.has(low ?? '400') || low === 'normal' || !low;
  return [...WEIGHTS].some((w) => Number(w) >= Number(low) && Number(w) <= Number(high));
}

let fontCss: Promise<string> | null = null;

/**
 * The @font-face rules of the families in `family` (a CSS font-family list), with their
 * files inlined. Fetched once per session.
 */
export function embeddedFonts(family: string): Promise<string> {
  fontCss ??= (async () => {
    const wanted = new Set(family.split(',').map(unquote));
    const faces = [...pageRules()].filter(
      (rule): rule is CSSFontFaceRule =>
        rule instanceof CSSFontFaceRule &&
        wanted.has(unquote(rule.style.getPropertyValue('font-family'))) &&
        usedWeight(rule.style.getPropertyValue('font-weight')),
    );
    const files = new Map<string, Promise<string>>();
    const css = await Promise.all(
      faces.map(async (face) => {
        let text = face.cssText;
        for (const [, url] of text.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
          if (!url || url.startsWith('data:')) continue;
          const absolute = new URL(url, document.baseURI).href;
          if (!files.has(absolute)) {
            files.set(
              absolute,
              fetch(absolute)
                .then((response) => response.blob())
                .then(toDataUrl),
            );
          }
          text = text.replace(url, await files.get(absolute)!);
        }
        return text;
      }),
    );
    return css.join('\n');
  })().catch((error: unknown) => {
    fontCss = null;
    throw error;
  });
  return fontCss;
}

/** The colour tokens' values on `element`, as a rule for a standalone SVG's root. */
export function themeCss(element: Element): string {
  const names = new Set<string>();
  for (const rule of pageRules()) {
    if (!(rule instanceof CSSStyleRule) || !rule.selectorText.includes(':root')) continue;
    for (const property of Array.from(rule.style)) {
      if (property.startsWith('--')) names.add(property);
    }
  }
  const style = getComputedStyle(element);
  const declarations = [...names]
    .map((name) => [name, style.getPropertyValue(name).trim()] as const)
    .filter(([, value]) => value && !value.includes('var('))
    .map(([name, value]) => `${name}:${value}`);
  return `:root{${declarations.join(';')}}`;
}

const images = new Map<string, Promise<string | null>>();

/** A photo as a data URL, kept for the session; null if it can't be fetched. */
export function imageData(url: string, signal?: AbortSignal): Promise<string | null> {
  let image = images.get(url);
  if (!image) {
    image = fetch(url, { mode: 'cors', signal })
      .then((response) => (response.ok ? response.blob() : Promise.reject(new Error('image'))))
      .then(toDataUrl)
      .catch(() => {
        images.delete(url);
        return null;
      });
    images.set(url, image);
  }
  return image;
}

/**
 * Replaces each `<image>` in an SVG with its data; one that can't be fetched is removed,
 * so the initials under it show instead of a broken picture (DESIGN §14).
 */
export async function inlineSvgImages(svg: Element, signal?: AbortSignal): Promise<void> {
  await Promise.all(
    Array.from(svg.querySelectorAll('image')).map(async (image) => {
      const href = image.getAttribute('href') ?? image.getAttribute('xlink:href');
      if (!href || href.startsWith('data:')) return;
      const data = await imageData(href, signal);
      if (data) image.setAttribute('href', data);
      else image.remove();
    }),
  );
  signal?.throwIfAborted();
}

/** Forgets fetched fonts and photos (tests). */
export function clearInlineCache(): void {
  fontCss = null;
  images.clear();
}
