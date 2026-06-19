import { describe, expect, it } from 'vitest';
import { createGlyphPlan, simplifyPolygon } from './GlyphPhysicsFactory';
import type { FontOutlineAdapter } from './GlyphPhysicsFactory';

const adapter: FontOutlineAdapter = {
  getContours() {
    return [
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
      ],
    ];
  },
};

describe('GlyphPhysicsFactory', () => {
  it('creates an outline glyph plan when contour data exists', () => {
    const plan = createGlyphPlan(adapter, { char: 'A', fontKey: 'serif', size: 72, x: 100, y: 200 });
    expect(plan.kind).toBe('outline');
    expect(plan.parts).toHaveLength(1);
    expect(plan.parts[0].length).toBeGreaterThanOrEqual(4);
  });

  it('falls back to a box when contour data is missing', () => {
    const emptyAdapter: FontOutlineAdapter = { getContours: () => [] };
    const plan = createGlyphPlan(emptyAdapter, { char: '한', fontKey: 'serif', size: 72, x: 100, y: 200 });
    expect(plan.kind).toBe('fallback-box');
    expect(plan.parts[0]).toEqual([
      { x: -36, y: -72 },
      { x: 36, y: -72 },
      { x: 36, y: 0 },
      { x: -36, y: 0 },
    ]);
  });

  it('creates a sloped fallback for ramp-like letters', () => {
    const emptyAdapter: FontOutlineAdapter = { getContours: () => [] };
    const plan = createGlyphPlan(emptyAdapter, { char: 'A', fontKey: 'serif', size: 72, x: 100, y: 200 });

    expect(plan.parts[0]).toEqual([
      { x: -36, y: 0 },
      { x: 0, y: -72 },
      { x: 36, y: 0 },
    ]);
  });

  it('creates a slanted fallback for slash letters', () => {
    const emptyAdapter: FontOutlineAdapter = { getContours: () => [] };
    const plan = createGlyphPlan(emptyAdapter, { char: '/', fontKey: 'serif', size: 72, x: 100, y: 200 });

    expect(plan.parts[0]).toEqual([
      { x: -72, y: 0 },
      { x: -60, y: 0 },
      { x: 72, y: -72 },
      { x: 60, y: -72 },
    ]);
  });

  it('simplifies dense polygons while keeping corners', () => {
    const simplified = simplifyPolygon(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      4,
    );
    expect(simplified).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
  });
});
