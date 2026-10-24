import { describe, expect, it } from 'vitest';

import { FRAME, layoutFrame, type FrameText } from './frame';

// Every character 10 px wide: easy to reason about.
const measure = (text: string) => text.length * 10;

const text = (overrides: Partial<FrameText> = {}): FrameText => ({
  title: 'Karim family',
  subtitle: '',
  date: '24 October 2026',
  credit: 'Made with শিকড়',
  legend: [],
  ...overrides,
});

describe('layoutFrame (P7-02)', () => {
  it('puts the title above the drawing and the footer below it', () => {
    const frame = layoutFrame({ w: 800, h: 600 }, text(), measure, 'sans-serif');
    expect(frame.w).toBe(800 + 2 * FRAME.pad);
    expect(frame.title).toEqual({ x: FRAME.pad, y: FRAME.pad + FRAME.title.size });
    expect(frame.subtitle).toBeNull();
    expect(frame.content.y).toBeGreaterThan(frame.title!.y);
    expect(frame.footer.y).toBeGreaterThan(frame.content.y + 600);
    expect(frame.h).toBeGreaterThan(frame.footer.y);
    expect(frame.footer.creditX).toBe(frame.w - FRAME.pad);
  });

  it('grows for a long title and centres a narrow drawing', () => {
    const frame = layoutFrame({ w: 200, h: 100 }, text({ title: 'x'.repeat(70) }), measure, 'f');
    expect(frame.w).toBe(700 + 2 * FRAME.pad);
    expect(frame.content.x).toBe(FRAME.pad + (700 - 200) / 2);
  });

  it('wraps the legend onto more rows', () => {
    const legend = Array.from({ length: 6 }, (_, i) => ({
      key: `k${i}`,
      label: 'Branch of Rahim',
    }));
    const frame = layoutFrame({ w: 500, h: 100 }, text({ legend }), measure, 'f');
    const rows = new Set(frame.legend.map((entry) => entry.y));
    expect(rows.size).toBeGreaterThan(1);
    expect(frame.legend.every((entry) => entry.x >= FRAME.pad)).toBe(true);
    expect(frame.content.y).toBeGreaterThan(Math.max(...frame.legend.map((entry) => entry.y)));
  });

  it('starts with the drawing when there is no header', () => {
    const frame = layoutFrame({ w: 600, h: 100 }, text({ title: '' }), measure, 'f');
    expect(frame.title).toBeNull();
    expect(frame.content.y).toBe(FRAME.pad);
  });
});
