export type VehicleKey = 'walking' | 'bicycle' | 'smallCar' | 'racingCar';
export type StageId = `stage-${number}`;
export type TerrainTheme = 'meadow' | 'canyon' | 'terrace';

export interface VehicleTuning {
  key: VehicleKey;
  label: string;
  maxSpeed: number;
  acceleration: number;
  climbingForce: number;
  stability: number;
  mass: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface RainbowTarget {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  passTopY: number;
}

export interface GroundSegment {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StageDefinition {
  id: StageId;
  title: string;
  hint: string;
  vehicleKey: VehicleKey;
  terrainTheme: TerrainTheme;
  spawn: Point;
  rainbow: RainbowTarget;
  groundSegments: GroundSegment[];
  allowLiveTyping: boolean;
}
