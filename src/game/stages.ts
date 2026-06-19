import type { GroundSegment, StageDefinition, VehicleKey, VehicleTuning } from './types';

function fullGround(): GroundSegment[] {
  return [{ x: 640, y: 660, width: 1280, height: 60 }];
}

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
    id: 'stage-1',
    title: 'Stage 1',
    hint: 'A racing car can climb a short steep word, but it flips easily.',
    vehicleKey: 'racingCar',
    terrainTheme: 'meadow',
    spawn: { x: 130, y: 610 },
    rainbow: { centerX: 610, centerY: 340, width: 180, height: 120, passTopY: 300 },
    groundSegments: fullGround(),
    allowLiveTyping: true,
  },
  {
    id: 'stage-2',
    title: 'Stage 2',
    hint: 'Balance force and stability with a smoother glyph ramp.',
    vehicleKey: 'smallCar',
    terrainTheme: 'meadow',
    spawn: { x: 130, y: 610 },
    rainbow: { centerX: 650, centerY: 350, width: 190, height: 120, passTopY: 310 },
    groundSegments: fullGround(),
    allowLiveTyping: true,
  },
  {
    id: 'stage-3',
    title: 'Stage 3',
    hint: 'The bicycle needs a careful gentle path over a close rainbow.',
    vehicleKey: 'bicycle',
    terrainTheme: 'meadow',
    spawn: { x: 130, y: 610 },
    rainbow: { centerX: 590, centerY: 350, width: 190, height: 120, passTopY: 310 },
    groundSegments: fullGround(),
    allowLiveTyping: true,
  },
  {
    id: 'stage-4',
    title: 'Stage 4',
    hint: 'Bridge the canyon before climbing toward a higher rainbow.',
    vehicleKey: 'smallCar',
    terrainTheme: 'canyon',
    spawn: { x: 130, y: 610 },
    rainbow: { centerX: 930, centerY: 285, width: 220, height: 150, passTopY: 230 },
    groundSegments: [
      { x: 210, y: 660, width: 420, height: 60 },
      { x: 1040, y: 660, width: 480, height: 60 },
    ],
    allowLiveTyping: true,
  },
  {
    id: 'stage-5',
    title: 'Stage 5',
    hint: 'Walking is stable but weak: build long gentle letter terraces.',
    vehicleKey: 'walking',
    terrainTheme: 'terrace',
    spawn: { x: 130, y: 610 },
    rainbow: { centerX: 1010, centerY: 260, width: 220, height: 150, passTopY: 205 },
    groundSegments: [
      { x: 220, y: 660, width: 440, height: 60 },
      { x: 620, y: 620, width: 250, height: 52 },
      { x: 1060, y: 660, width: 440, height: 60 },
    ],
    allowLiveTyping: true,
  },
  {
    id: 'stage-6',
    title: 'Stage 6',
    hint: 'Link the broken bridge with steady slash ramps for the bicycle.',
    vehicleKey: 'bicycle',
    terrainTheme: 'brokenBridge',
    spawn: { x: 130, y: 610 },
    rainbow: { centerX: 1125, centerY: 245, width: 220, height: 150, passTopY: 200 },
    groundSegments: [
      { x: 200, y: 660, width: 400, height: 60 },
      { x: 520, y: 635, width: 150, height: 52 },
      { x: 790, y: 595, width: 170, height: 52 },
      { x: 1120, y: 660, width: 320, height: 60 },
    ],
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
