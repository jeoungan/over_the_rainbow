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
      ['stage-4', 'smallCar'],
    ]);
  });

  it('labels the playable stages by stage number', () => {
    expect(STAGES.map((stage) => stage.title)).toEqual(['Stage 1', 'Stage 2', 'Stage 3', 'Stage 4']);
  });

  it('allows text summoning after movement in every stage', () => {
    expect(STAGES.every((stage) => stage.allowLiveTyping)).toBe(true);
  });

  it('keeps the first three challenges low and close', () => {
    for (const stage of STAGES.slice(0, 3)) {
      expect(stage.rainbow.centerY).toBeGreaterThanOrEqual(250);
      expect(stage.rainbow.centerX - stage.spawn.x).toBeLessThanOrEqual(680);
    }
  });

  it('makes the bicycle stage the closest low rainbow challenge', () => {
    const stage2 = getStage('stage-2');
    const stage3 = getStage('stage-3');

    expect(stage3.vehicleKey).toBe('bicycle');
    expect(stage3.rainbow.centerX - stage3.spawn.x).toBeLessThan(stage2.rainbow.centerX - stage2.spawn.x);
    expect(stage3.rainbow.centerY).toBeGreaterThanOrEqual(250);
  });

  it('adds a canyon gap as explicit stage 4 terrain', () => {
    const stage4 = getStage('stage-4');
    const [leftGround, rightGround] = stage4.groundSegments;

    expect(stage4.rainbow.centerY).toBeLessThan(300);
    expect(stage4.rainbow.centerX - stage4.spawn.x).toBeGreaterThan(680);
    expect(stage4.groundSegments).toHaveLength(2);
    expect(rightGround.x - rightGround.width / 2).toBeGreaterThan(leftGround.x + leftGround.width / 2);
    expect(rightGround.x - rightGround.width / 2 - (leftGround.x + leftGround.width / 2)).toBeGreaterThanOrEqual(320);
  });

  it('retrieves a stage by id', () => {
    expect(getStage('stage-2').vehicleKey).toBe('smallCar');
  });
});
