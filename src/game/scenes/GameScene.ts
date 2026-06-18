import Phaser from 'phaser';
import { createCaretController } from '../caret/CaretController';
import { installGameDevtools } from '../devtools';
import { STAGES, VEHICLES } from '../stages';
import type { StageDefinition } from '../types';

const WORLD = { width: 1280, height: 720 };

export class GameScene extends Phaser.Scene {
  private stageIndex = 0;
  private stage: StageDefinition = STAGES[0];
  private readonly caret = createCaretController(WORLD);
  private glyphCount = 0;
  private goalState: 'editing' | 'playing' | 'won' | 'failed' = 'editing';
  private player?: Phaser.Physics.Matter.Image;
  private rainbowGraphics?: Phaser.GameObjects.Graphics;
  private passLine?: Phaser.GameObjects.Rectangle;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.matter.world.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.ensureGeneratedTextures();
    this.drawBackground();
    this.loadStage(0);

    installGameDevtools(
      () => {
        const body = this.player?.body as MatterJS.BodyType | undefined;
        const caret = this.caret.snapshot();
        return {
          stageId: this.stage.id,
          vehicleType: this.stage.vehicleKey,
          player: {
            x: this.player?.x ?? this.stage.spawn.x,
            y: this.player?.y ?? this.stage.spawn.y,
            vx: body?.velocity.x ?? 0,
            vy: body?.velocity.y ?? 0,
          },
          caret: { x: caret.position.x, y: caret.position.y, glyphSize: caret.glyphSize },
          glyphCount: this.glyphCount,
          goalState: this.goalState,
        };
      },
      (ms) => {
        const steps = Math.max(1, Math.round(ms / (1000 / 60)));
        for (let i = 0; i < steps; i += 1) {
          this.matter.world.step(1000 / 60);
        }
      },
    );
  }

  private ensureGeneratedTextures(): void {
    if (this.textures.exists('vehicle-rect')) return;
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(0xffffff, 1);
    graphics.fillRoundedRect(0, 0, 80, 40, 8);
    graphics.generateTexture('vehicle-rect', 80, 40);
    graphics.destroy();
  }

  private drawBackground(): void {
    this.add.rectangle(WORLD.width / 2, WORLD.height / 2, WORLD.width, WORLD.height, 0xdcecff);
    this.add.ellipse(240, 170, 280, 80, 0xffffff, 0.55);
    this.add.ellipse(870, 120, 360, 90, 0xffffff, 0.45);
    this.add.rectangle(WORLD.width / 2, 660, WORLD.width, 120, 0x95d0a8);
    this.matter.add.rectangle(WORLD.width / 2, 660, WORLD.width, 60, { isStatic: true, label: 'ground' });
  }

  private loadStage(index: number): void {
    this.stageIndex = index;
    this.stage = STAGES[this.stageIndex];
    this.goalState = 'editing';
    this.glyphCount = 0;
    this.player?.destroy();

    const vehicle = VEHICLES[this.stage.vehicleKey];
    this.player = this.matter.add.image(this.stage.spawn.x, this.stage.spawn.y, 'vehicle-rect', undefined, {
      label: `vehicle:${vehicle.key}`,
      mass: vehicle.mass,
      friction: 0.9,
      frictionAir: 0.015,
    });
    this.player.setDisplaySize(72, 34);
    this.player.setTint(0x334c7d);

    this.drawRainbow();
  }

  private drawRainbow(): void {
    this.rainbowGraphics?.destroy();
    this.passLine?.destroy();

    const { rainbow } = this.stage;
    const graphics = this.add.graphics();
    const colors = [0xf26b8a, 0xffc857, 0x63c77a, 0x5aa7ff, 0x9b6bff];
    colors.forEach((color, index) => {
      graphics.lineStyle(8, color, 0.95);
      graphics.strokeEllipse(rainbow.centerX, rainbow.centerY + index * 6, rainbow.width, rainbow.height);
    });
    this.rainbowGraphics = graphics;
    this.passLine = this.add.rectangle(rainbow.centerX, rainbow.passTopY, rainbow.width, 4, 0xffffff, 0.45);
  }
}
