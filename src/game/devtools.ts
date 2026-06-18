import type { StageDefinition, VehicleKey } from './types';

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => void;
  }
}

export type GoalState = 'editing' | 'playing' | 'won' | 'failed';

export interface GameStateSnapshotInput {
  stageId: StageDefinition['id'];
  vehicleType: VehicleKey;
  player: { x: number; y: number; vx: number; vy: number };
  caret: { x: number; y: number; glyphSize: number };
  glyphCount: number;
  goalState: GoalState;
}

export type GameStateSnapshot = GameStateSnapshotInput;

export function createGameStateSnapshot(input: GameStateSnapshotInput): GameStateSnapshot {
  return {
    stageId: input.stageId,
    vehicleType: input.vehicleType,
    player: { ...input.player },
    caret: { ...input.caret },
    glyphCount: input.glyphCount,
    goalState: input.goalState,
  };
}

export function serializeGameState(snapshot: GameStateSnapshot): string {
  return JSON.stringify(snapshot);
}

export function installGameDevtools(getSnapshot: () => GameStateSnapshot, advanceTime: (ms: number) => void): void {
  Object.assign(window, {
    render_game_to_text: () => serializeGameState(getSnapshot()),
    advanceTime,
  });
}
