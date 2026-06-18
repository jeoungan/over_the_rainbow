import type { StageDefinition, VehicleKey, VehicleTuning } from './types';

export const VEHICLES: Record<VehicleKey, VehicleTuning> = {
  walking: {
    key: 'walking',
    label: 'Walking',
    maxSpeed: 2.2,
    acceleration: 0.012,
    climbingForce: 0.8,
    stability: 1.0,
    mass: 1.0,
  },
  bicycle: {
    key: 'bicycle',
    label: 'Bicycle',
    maxSpeed: 4.0,
    acceleration: 0.018,
    climbingForce: 1.2,
    stability: 0.74,
    mass: 1.15,
  },
  smallCar: {
    key: 'smallCar',
    label: 'Small car',
    maxSpeed: 5.4,
    acceleration: 0.026,
    climbingForce: 1.75,
    stability: 0.52,
    mass: 1.55,
  },
  racingCar: {
    key: 'racingCar',
    label: 'Racing car',
    maxSpeed: 7.2,
    acceleration: 0.038,
    climbingForce: 2.35,
    stability: 0.32,
    mass: 1.85,
  },
};

export const STAGES: StageDefinition[] = [
  {
    id: 'tutorial',
    title: 'First letters',
    hint: 'Place a gentle support and walk over the rainbow.',
    vehicleKey: 'walking',
    spawn: { x: 130, y: 610 },
    rainbow: { centerX: 520, centerY: 360, width: 180, height: 120, passTopY: 318 },
    allowLiveTyping: false,
  },
  {
    id: 'stage-1',
    title: 'Fast little dream',
    hint: 'A racing car can climb a short steep word, but it flips easily.',
    vehicleKey: 'racingCar',
    spawn: { x: 130, y: 610 },
    rainbow: { centerX: 610, centerY: 340, width: 180, height: 120, passTopY: 300 },
    allowLiveTyping: false,
  },
  {
    id: 'stage-2',
    title: 'Ordinary engine',
    hint: 'Balance force and stability with a smoother glyph ramp.',
    vehicleKey: 'smallCar',
    spawn: { x: 130, y: 610 },
    rainbow: { centerX: 650, centerY: 350, width: 190, height: 120, passTopY: 310 },
    allowLiveTyping: true,
  },
  {
    id: 'stage-3',
    title: 'Quiet bicycle',
    hint: 'The bicycle needs a careful gentle path over a close rainbow.',
    vehicleKey: 'bicycle',
    spawn: { x: 130, y: 610 },
    rainbow: { centerX: 590, centerY: 350, width: 190, height: 120, passTopY: 310 },
    allowLiveTyping: true,
  },
];

export function getStage(id: StageDefinition['id']): StageDefinition {
  const stage = STAGES.find((candidate) => candidate.id === id);
  if (!stage) {
    throw new Error(`Unknown stage: ${id}`);
  }
  return stage;
}
