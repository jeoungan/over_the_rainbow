import { describe, expect, it } from 'vitest';
import { getVehicleDrive } from './VehicleController';
import { VEHICLES } from '../stages';

describe('VehicleController', () => {
  it('returns stronger drive for stronger vehicles on the same slope', () => {
    const bicycle = getVehicleDrive(VEHICLES.bicycle, 'right', 24);
    const racingCar = getVehicleDrive(VEHICLES.racingCar, 'right', 24);
    expect(racingCar.forceX).toBeGreaterThan(bicycle.forceX);
  });

  it('penalizes steep slopes when climbing force is weak', () => {
    const shallow = getVehicleDrive(VEHICLES.bicycle, 'right', 8);
    const steep = getVehicleDrive(VEHICLES.bicycle, 'right', 38);
    expect(steep.forceX).toBeLessThan(shallow.forceX);
  });

  it('uses stability to damp rotation', () => {
    expect(getVehicleDrive(VEHICLES.walking, 'right', 0).angularDamping).toBeGreaterThan(
      getVehicleDrive(VEHICLES.racingCar, 'right', 0).angularDamping,
    );
  });

  it('returns no horizontal force without direction input', () => {
    expect(getVehicleDrive(VEHICLES.smallCar, 'none', 0).forceX).toBe(0);
  });

  it('returns no horizontal force while airborne', () => {
    expect(getVehicleDrive(VEHICLES.bicycle, 'right', 0, false).forceX).toBe(0);
  });
});
