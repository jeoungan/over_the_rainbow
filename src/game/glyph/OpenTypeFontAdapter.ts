import opentype from 'opentype.js';
import type { Point } from '../types';
import type { FontOutlineAdapter } from './GlyphPhysicsFactory';

export class OpenTypeFontAdapter implements FontOutlineAdapter {
  private readonly fonts = new Map<string, opentype.Font>();

  register(fontKey: string, font: opentype.Font): void {
    this.fonts.set(fontKey, font);
  }

  getContours(char: string, fontKey: string, size: number): Point[][] {
    const font = this.fonts.get(fontKey);
    if (!font) return [];

    const glyph = font.charToGlyph(char);
    const path = glyph.getPath(0, 0, size);
    const contours: Point[][] = [];
    let current: Point[] = [];

    for (const command of path.commands) {
      if (command.type === 'M') {
        if (current.length > 0) contours.push(current);
        current = [{ x: command.x, y: command.y }];
      } else if (command.type === 'L') {
        current.push({ x: command.x, y: command.y });
      } else if (command.type === 'Q') {
        current.push({ x: command.x1, y: command.y1 });
        current.push({ x: command.x, y: command.y });
      } else if (command.type === 'C') {
        current.push({ x: command.x1, y: command.y1 });
        current.push({ x: command.x2, y: command.y2 });
        current.push({ x: command.x, y: command.y });
      } else if (command.type === 'Z') {
        if (current.length > 0) contours.push(current);
        current = [];
      }
    }

    if (current.length > 0) contours.push(current);
    return contours;
  }
}
