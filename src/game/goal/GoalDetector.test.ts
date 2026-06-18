import { describe, expect, it } from 'vitest';
import { didPassOverRainbow } from './GoalDetector';
import type { RainbowTarget } from '../types';

const rainbow: RainbowTarget = {
  centerX: 600,
  centerY: 350,
  width: 180,
  height: 120,
  passTopY: 310,
};

describe('GoalDetector', () => {
  it('succeeds only after crossing from left to right above the rainbow', () => {
    expect(didPassOverRainbow({ x: 480, y: 290 }, { x: 705, y: 285 }, rainbow)).toBe(true);
  });

  it('succeeds when crossing the right edge incrementally above the rainbow', () => {
    expect(didPassOverRainbow({ x: 688, y: 285 }, { x: 696, y: 285 }, rainbow)).toBe(true);
  });

  it('does not succeed when the vehicle merely touches the rainbow side', () => {
    expect(didPassOverRainbow({ x: 480, y: 340 }, { x: 705, y: 340 }, rainbow)).toBe(false);
  });

  it('does not succeed before the vehicle exits the right side', () => {
    expect(didPassOverRainbow({ x: 480, y: 290 }, { x: 620, y: 285 }, rainbow)).toBe(false);
  });
});
