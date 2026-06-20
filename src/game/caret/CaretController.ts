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
  moveBy(delta: Point): void;
  changeSizeFromWheel(deltaY: number): void;
  advanceInline(distance: number): void;
  snapshot(): CaretSnapshot;
}

const MIN_SIZE = 10;
const MAX_SIZE = 144;
const SIZE_STEP = 4;

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
    moveBy(delta) {
      state.position = {
        x: clamp(state.position.x + delta.x, 0, bounds.width),
        y: clamp(state.position.y + delta.y, 0, bounds.height),
      };
    },
    changeSizeFromWheel(deltaY) {
      const direction = deltaY < 0 ? 1 : -1;
      state.glyphSize = clamp(state.glyphSize + direction * SIZE_STEP, MIN_SIZE, MAX_SIZE);
    },
    advanceInline(distance) {
      state.position = {
        x: clamp(state.position.x + Math.round(distance), 0, bounds.width),
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
