import type { Point } from '../types';

export interface GlyphRequest {
  char: string;
  fontKey: string;
  size: number;
  x: number;
  y: number;
}

export interface FontOutlineAdapter {
  getContours(char: string, fontKey: string, size: number): Point[][];
}

export interface GlyphPlan {
  kind: 'outline' | 'fallback-box';
  char: string;
  fontKey: string;
  size: number;
  origin: Point;
  parts: Point[][];
}

export function simplifyPolygon(points: Point[], minDistance: number): Point[] {
  return points.filter((point, index) => {
    if (index === 0 || index === points.length - 1) return true;
    const previous = points[index - 1];
    const next = points[index + 1];
    const distanceFromPrevious = Math.hypot(point.x - previous.x, point.y - previous.y);
    const changesDirection =
      Math.sign(point.x - previous.x) !== Math.sign(next.x - point.x) ||
      Math.sign(point.y - previous.y) !== Math.sign(next.y - point.y);
    return distanceFromPrevious >= minDistance || changesDirection;
  });
}

export function createGlyphPlan(adapter: FontOutlineAdapter, request: GlyphRequest): GlyphPlan {
  const contours = adapter
    .getContours(request.char, request.fontKey, request.size)
    .map((contour) => simplifyPolygon(contour, Math.max(3, request.size / 24)))
    .filter((contour) => contour.length >= 3);

  if (contours.length === 0) {
    const halfWidth = request.size / 2;
    return {
      kind: 'fallback-box',
      char: request.char,
      fontKey: request.fontKey,
      size: request.size,
      origin: { x: request.x, y: request.y },
      parts: [
        [
          { x: -halfWidth, y: -request.size },
          { x: halfWidth, y: -request.size },
          { x: halfWidth, y: 0 },
          { x: -halfWidth, y: 0 },
        ],
      ],
    };
  }

  return {
    kind: 'outline',
    char: request.char,
    fontKey: request.fontKey,
    size: request.size,
    origin: { x: request.x, y: request.y },
    parts: contours,
  };
}
