import { describe, expect, it } from 'vitest';
import { createGameStateSnapshot, serializeGameState } from './devtools';

describe('devtools state', () => {
  it('serializes concise gameplay state', () => {
    const text = serializeGameState(
      createGameStateSnapshot({
        stageId: 'stage-1',
        vehicleType: 'racingCar',
        player: { x: 120, y: 500, vx: 1.5, vy: -0.2 },
        caret: { x: 300, y: 240, glyphSize: 64 },
        glyphCount: 3,
        goalState: 'playing',
      }),
    );

    expect(JSON.parse(text)).toEqual({
      stageId: 'stage-1',
      vehicleType: 'racingCar',
      player: { x: 120, y: 500, vx: 1.5, vy: -0.2 },
      caret: { x: 300, y: 240, glyphSize: 64 },
      glyphCount: 3,
      goalState: 'playing',
    });
  });
});
