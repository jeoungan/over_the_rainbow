import type { Point, RainbowTarget } from '../types';

export function didPassOverRainbow(previous: Point, current: Point, rainbow: RainbowTarget): boolean {
  const leftEdge = rainbow.centerX - rainbow.width / 2;
  const rightEdge = rainbow.centerX + rainbow.width / 2;
  const crossedFromLeft = previous.x < leftEdge && current.x > rightEdge;
  const stayedAbovePassLine = previous.y <= rainbow.passTopY && current.y <= rainbow.passTopY;
  return crossedFromLeft && stayedAbovePassLine;
}
