import { describe, expect, it } from 'vitest';
import { estimateSlopeDegrees } from './SlopeEstimator';

describe('SlopeEstimator', () => {
  it('treats a level vehicle as flat ground', () => {
    expect(estimateSlopeDegrees(0)).toBe(0);
  });

  it('converts vehicle rotation into an absolute slope angle', () => {
    expect(estimateSlopeDegrees(Math.PI / 6)).toBeCloseTo(30, 4);
    expect(estimateSlopeDegrees(-Math.PI / 4)).toBeCloseTo(45, 4);
  });

  it('normalizes rotations past vertical back toward the nearest surface angle', () => {
    expect(estimateSlopeDegrees((170 * Math.PI) / 180)).toBeCloseTo(10, 4);
  });

  it('caps extreme readings so drive tuning stays stable', () => {
    expect(estimateSlopeDegrees(Math.PI / 2)).toBe(75);
  });
});
