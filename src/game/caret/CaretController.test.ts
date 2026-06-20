import { describe, expect, it } from 'vitest';
import { createCaretController } from './CaretController';

describe('CaretController', () => {
  it('places the caret inside world bounds', () => {
    const caret = createCaretController({ width: 1200, height: 720 });
    caret.placeAt({ x: 300, y: 250 });
    expect(caret.snapshot().position).toEqual({ x: 300, y: 250 });
  });

  it('clamps the caret to the world', () => {
    const caret = createCaretController({ width: 1200, height: 720 });
    caret.placeAt({ x: -20, y: 900 });
    expect(caret.snapshot().position).toEqual({ x: 0, y: 720 });
  });

  it('changes glyph size with wheel deltas', () => {
    const caret = createCaretController({ width: 1200, height: 720 });
    caret.changeSizeFromWheel(-120);
    expect(caret.snapshot().glyphSize).toBe(60);
    caret.changeSizeFromWheel(120);
    expect(caret.snapshot().glyphSize).toBe(56);
  });

  it('keeps glyph size in readable bounds', () => {
    const caret = createCaretController({ width: 1200, height: 720 });
    for (let i = 0; i < 30; i += 1) caret.changeSizeFromWheel(-120);
    expect(caret.snapshot().glyphSize).toBe(144);
    for (let i = 0; i < 40; i += 1) caret.changeSizeFromWheel(120);
    expect(caret.snapshot().glyphSize).toBe(10);
  });

  it('advances horizontally after a typed glyph', () => {
    const caret = createCaretController({ width: 1200, height: 720 });
    caret.placeAt({ x: 300, y: 250 });
    caret.advanceInline(32);
    expect(caret.snapshot().position).toEqual({ x: 332, y: 250 });
  });

  it('moves the caret by keyboard deltas', () => {
    const caret = createCaretController({ width: 1200, height: 720 });
    caret.placeAt({ x: 300, y: 250 });
    caret.moveBy({ x: -20, y: 12 });
    expect(caret.snapshot().position).toEqual({ x: 280, y: 262 });
  });
});
