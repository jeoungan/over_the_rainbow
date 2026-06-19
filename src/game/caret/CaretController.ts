import type { Point } from '../types';

export interface WorldBounds {
  width: number;
  height: number;
}

export interface CaretSnapshot {
  position: Point;
  glyphSize: number;
}

export interface CaretController {
  placeAt(point: Point): void;
  changeSizeFromWheel(deltaY: number): void;
  advanceInline(): void;
  snapshot(): CaretSnapshot;
}

const MIN_SIZE = 24;
const MAX_SIZE = 144;
const SIZE_STEP = 8;
const INLINE_ADVANCE_RATIO = 0.85;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function createCaretController(bounds: WorldBounds): CaretController {
  const state: CaretSnapshot = {
    position: { x: 240, y: 420 },
    glyphSize: 56,
  };

  return {
    placeAt(point) {
      state.position = {
        x: clamp(point.x, 0, bounds.width),
        y: clamp(point.y, 0, bounds.height),
      };
    },
    changeSizeFromWheel(deltaY) {
      const direction = deltaY < 0 ? 1 : -1;
      state.glyphSize = clamp(state.glyphSize + direction * SIZE_STEP, MIN_SIZE, MAX_SIZE);
    },
    advanceInline() {
      state.position = {
        x: clamp(state.position.x + Math.round(state.glyphSize * INLINE_ADVANCE_RATIO), 0, bounds.width),
        y: state.position.y,
      };
    },
    snapshot() {
      return {
        position: { ...state.position },
        glyphSize: state.glyphSize,
      };
    },
  };
}
