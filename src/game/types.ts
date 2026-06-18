export type VehicleKey = 'walking' | 'bicycle' | 'smallCar' | 'racingCar';
export type StageId = `stage-${number}`;

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

export interface StageDefinition {
  id: StageId;
  title: string;
  hint: string;
  vehicleKey: VehicleKey;
  spawn: Point;
  rainbow: RainbowTarget;
  allowLiveTyping: boolean;
}
