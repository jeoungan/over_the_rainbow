import type { Point, RainbowTarget } from '../types';

export function didPassOverRainbow(previous: Point, current: Point, rainbow: RainbowTarget): boolean {
  const rightEdge = rainbow.centerX + rainbow.width / 2;
  const crossedRightEdge = previous.x <= rightEdge && current.x > rightEdge;
  const stayedAbovePassLine = previous.y <= rainbow.passTopY && current.y <= rainbow.passTopY;
  return crossedRightEdge && stayedAbovePassLine;
}
