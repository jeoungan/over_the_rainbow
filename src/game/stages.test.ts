import { describe, expect, it } from 'vitest';
import { STAGES, VEHICLES, getStage } from './stages';

describe('stage and vehicle data', () => {
  it('orders climbing force from walking to racing car', () => {
    expect(VEHICLES.walking.climbingForce).toBeLessThan(VEHICLES.bicycle.climbingForce);
    expect(VEHICLES.bicycle.climbingForce).toBeLessThan(VEHICLES.smallCar.climbingForce);
    expect(VEHICLES.smallCar.climbingForce).toBeLessThan(VEHICLES.racingCar.climbingForce);
  });

  it('orders stability from walking down to racing car', () => {
    expect(VEHICLES.walking.stability).toBeGreaterThan(VEHICLES.bicycle.stability);
    expect(VEHICLES.bicycle.stability).toBeGreaterThan(VEHICLES.smallCar.stability);
    expect(VEHICLES.smallCar.stability).toBeGreaterThan(VEHICLES.racingCar.stability);
  });

  it('uses the approved first stage sequence', () => {
    expect(STAGES.map((stage) => [stage.id, stage.vehicleKey])).toEqual([
      ['stage-1', 'racingCar'],
      ['stage-2', 'smallCar'],
      ['stage-3', 'bicycle'],
    ]);
  });

  it('labels the playable stages by stage number', () => {
    expect(STAGES.map((stage) => stage.title)).toEqual(['Stage 1', 'Stage 2', 'Stage 3']);
  });

  it('keeps the first three challenges low and close', () => {
    for (const stage of STAGES) {
      expect(stage.rainbow.centerY).toBeGreaterThanOrEqual(250);
      expect(stage.rainbow.centerX - stage.spawn.x).toBeLessThanOrEqual(680);
    }
  });

  it('retrieves a stage by id', () => {
    expect(getStage('stage-2').vehicleKey).toBe('smallCar');
  });
});
