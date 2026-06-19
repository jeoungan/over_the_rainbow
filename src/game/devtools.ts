import type { StageDefinition, VehicleKey } from './types';

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => void;
    overTheRainbowTest?: GameTestControls;
  }
}

export type GoalState = 'editing' | 'playing' | 'won' | 'failed';

export interface GameStateSnapshotInput {
  stageId: StageDefinition['id'];
  vehicleType: VehicleKey;
  player: { x: number; y: number; vx: number; vy: number };
  caret: { x: number; y: number; glyphSize: number };
  glyphs: Array<{ char: string; x: number; y: number; rotation: number; isStatic: boolean }>;
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
    glyphs: input.glyphs.map((glyph) => ({ ...glyph })),
    glyphCount: input.glyphCount,
    goalState: input.goalState,
  };
}

export function serializeGameState(snapshot: GameStateSnapshot): string {
  return JSON.stringify(snapshot);
}

export interface TestPlayerPose {
  x: number;
  y: number;
  previousX?: number;
  previousY?: number;
  vx?: number;
  vy?: number;
  rotation?: number;
}

export interface GameTestControls {
  goToStage: (stageIndex: number) => void;
  placePlayer: (pose: TestPlayerPose) => void;
}

export function installGameDevtools(
  getSnapshot: () => GameStateSnapshot,
  advanceTime: (ms: number) => void,
  testControls?: GameTestControls,
): void {
  Object.assign(window, {
    render_game_to_text: () => serializeGameState(getSnapshot()),
    advanceTime,
  });

  if (testControls) {
    window.overTheRainbowTest = testControls;
  } else {
    delete window.overTheRainbowTest;
  }
}
