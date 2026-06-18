import type { VehicleTuning } from '../types';

export type DriveDirection = 'left' | 'right' | 'none';

export interface VehicleDrive {
  forceX: number;
  maxSpeed: number;
  angularDamping: number;
}

export function getVehicleDrive(vehicle: VehicleTuning, direction: DriveDirection, slopeDegrees: number): VehicleDrive {
  if (direction === 'none') {
    return {
      forceX: 0,
      maxSpeed: vehicle.maxSpeed,
      angularDamping: vehicle.stability * 0.08,
    };
  }

  const sign = direction === 'right' ? 1 : -1;
  const slopePenalty = Math.max(0.22, 1 - Math.max(0, slopeDegrees) / (vehicle.climbingForce * 42));

  return {
    forceX: sign * vehicle.acceleration * vehicle.climbingForce * slopePenalty,
    maxSpeed: vehicle.maxSpeed,
    angularDamping: vehicle.stability * 0.08,
  };
}
