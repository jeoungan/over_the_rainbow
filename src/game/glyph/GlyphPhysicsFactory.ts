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
  kind: 'outline' | 'fallback-box' | 'fallback-shape';
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
    const fallback = createFallbackParts(request.char, request.size);
    return {
      kind: fallback.kind,
      char: request.char,
      fontKey: request.fontKey,
      size: request.size,
      origin: { x: request.x, y: request.y },
      parts: fallback.parts,
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

function createFallbackParts(char: string, size: number): Pick<GlyphPlan, 'kind' | 'parts'> {
  const halfWidth = size / 2;
  const slashOuter = size * 0.35;
  const slashInner = size * 0.05;

  if (char === 'A' || char === '^') {
    return {
      kind: 'fallback-shape',
      parts: [
        [
          { x: -halfWidth, y: 0 },
          { x: 0, y: -size },
          { x: halfWidth, y: 0 },
        ],
      ],
    };
  }

  if (char === 'V' || char === 'v') {
    return {
      kind: 'fallback-shape',
      parts: [
        [
          { x: -halfWidth, y: -size },
          { x: halfWidth, y: -size },
          { x: 0, y: 0 },
        ],
      ],
    };
  }

  if (char === '/') {
    return {
      kind: 'fallback-shape',
      parts: [
        [
          { x: -slashOuter, y: 0 },
          { x: -slashInner, y: 0 },
          { x: slashOuter, y: -size },
          { x: slashInner, y: -size },
        ],
      ],
    };
  }

  if (char === '\\') {
    return {
      kind: 'fallback-shape',
      parts: [
        [
          { x: slashInner, y: 0 },
          { x: slashOuter, y: 0 },
          { x: -slashInner, y: -size },
          { x: -slashOuter, y: -size },
        ],
      ],
    };
  }

  return {
    kind: 'fallback-box',
    parts: [
      [
        { x: -halfWidth, y: -size },
        { x: halfWidth, y: -size },
        { x: halfWidth, y: 0 },
        { x: -halfWidth, y: 0 },
      ],
    ],
  };
}
