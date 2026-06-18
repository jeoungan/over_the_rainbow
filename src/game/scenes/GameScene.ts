import Phaser from 'phaser';
import { createCaretController } from '../caret/CaretController';
import { installGameDevtools } from '../devtools';
import { createGlyphPlan } from '../glyph/GlyphPhysicsFactory';
import type { GlyphPlan } from '../glyph/GlyphPhysicsFactory';
import { didPassOverRainbow } from '../goal/GoalDetector';
import { createTextInputController } from '../input/TextInputController';
import { STAGES, VEHICLES } from '../stages';
import type { StageDefinition } from '../types';
import { getVehicleDrive } from '../vehicle/VehicleController';

const WORLD = { width: 1280, height: 720 };

export class GameScene extends Phaser.Scene {
  private stageIndex = 0;
  private stage: StageDefinition = STAGES[0];
  private readonly caret = createCaretController(WORLD);
  private readonly inputController = createTextInputController();
  private readonly activeKeys = { left: false, right: false };
  private previousPlayerPosition = { x: 0, y: 0 };
  private glyphCount = 0;
  private goalState: 'editing' | 'playing' | 'won' | 'failed' = 'editing';
  private player?: Phaser.Physics.Matter.Image;
  private rainbowGraphics?: Phaser.GameObjects.Graphics;
  private passLine?: Phaser.GameObjects.Rectangle;
  private glyphs: Phaser.GameObjects.Text[] = [];
  private uiRoot?: HTMLDivElement;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.matter.world.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.ensureGeneratedTextures();
    this.drawBackground();
    this.loadStage(0);
    this.setupInput();
    this.buildUi();

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
          this.update();
          this.matter.world.step(1000 / 60);
        }
      },
    );
  }

  update(): void {
    if (!this.player) return;

    const previous = { ...this.previousPlayerPosition };
    this.previousPlayerPosition = { x: this.player.x, y: this.player.y };

    if (this.goalState === 'playing') {
      const vehicle = VEHICLES[this.stage.vehicleKey];
      const direction = this.activeKeys.right ? 'right' : this.activeKeys.left ? 'left' : 'none';
      const drive = getVehicleDrive(vehicle, direction, 0);
      const body = this.player.body as MatterJS.BodyType;

      this.player.applyForce(new Phaser.Math.Vector2(drive.forceX, 0));
      this.player.setAngularVelocity(body.angularVelocity * (1 - drive.angularDamping));

      if (Math.abs(body.velocity.x) > drive.maxSpeed) {
        this.player.setVelocityX(Math.sign(body.velocity.x) * drive.maxSpeed);
      }
    }

    if (
      this.goalState === 'playing' &&
      didPassOverRainbow(previous, { x: this.player.x, y: this.player.y }, this.stage.rainbow)
    ) {
      this.goalState = 'won';
    }
  }

  private setupInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.caret.placeAt({ x: pointer.worldX, y: pointer.worldY });
    });

    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: unknown[], _dx: number, dy: number) => {
      this.caret.changeSizeFromWheel(dy);
    });

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('compositionstart', this.handleCompositionStart);
    window.addEventListener('compositionend', this.handleCompositionEnd);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', this.handleKeyDown);
      window.removeEventListener('keyup', this.handleKeyUp);
      window.removeEventListener('compositionstart', this.handleCompositionStart);
      window.removeEventListener('compositionend', this.handleCompositionEnd);
    });
  }

  private buildUi(): void {
    this.uiRoot?.remove();

    const host = document.querySelector<HTMLElement>('#game-root');
    if (!host) return;

    const uiRoot = document.createElement('div');
    uiRoot.className = 'game-ui';

    uiRoot.append(
      this.createButton('Start', this.handleStartClick),
      this.createButton('Undo', this.handleUndoClick),
      this.createButton('Reset', this.handleResetClick),
    );

    host.append(uiRoot);
    this.uiRoot = uiRoot;

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.uiRoot?.remove();
      this.uiRoot = undefined;
    });
  }

  private createButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  private readonly handleStartClick = (): void => {
    this.startVehicle();
  };

  private readonly handleUndoClick = (): void => {
    this.undoGlyph();
  };

  private readonly handleResetClick = (): void => {
    this.resetStage();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const movementKey = event.key.toLowerCase();
    if (this.goalState === 'playing' && movementKey === 'a') {
      this.activeKeys.left = true;
      event.preventDefault();
      return;
    }
    if (this.goalState === 'playing' && movementKey === 'd') {
      this.activeKeys.right = true;
      event.preventDefault();
      return;
    }

    const intent = this.inputController.keyDown({
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      repeat: event.repeat,
    });

    if (intent.type !== 'none') event.preventDefault();
    if (intent.type === 'glyph') this.createGlyph(intent.value);
    if (intent.type === 'space') this.moveCaretBySpace();
    if (intent.type === 'undo') this.undoGlyph();
    if (intent.type === 'start') this.startVehicle();
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (key === 'a') this.activeKeys.left = false;
    if (key === 'd') this.activeKeys.right = false;
  };

  private readonly handleCompositionStart = (): void => {
    this.inputController.compositionStart();
  };

  private readonly handleCompositionEnd = (event: CompositionEvent): void => {
    const intent = this.inputController.compositionEnd(event.data);
    if (intent.type === 'glyph') this.createGlyph(intent.value);
  };

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
    this.activeKeys.left = false;
    this.activeKeys.right = false;
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
    this.previousPlayerPosition = { x: this.stage.spawn.x, y: this.stage.spawn.y };

    this.drawRainbow();
  }

  private createGlyph(char: string): void {
    const caret = this.caret.snapshot();
    const plan = createGlyphPlan(
      { getContours: () => [] },
      {
        char,
        fontKey: 'system-serif',
        size: caret.glyphSize,
        x: caret.position.x,
        y: caret.position.y,
      },
    );

    this.spawnGlyphFromPlan(plan);
  }

  private spawnGlyphFromPlan(plan: GlyphPlan): void {
    const text = this.add.text(plan.origin.x, plan.origin.y - plan.size / 2, plan.char, {
      fontFamily: 'Georgia, serif',
      fontSize: `${plan.size}px`,
      color: '#29395f',
      stroke: '#ffffff',
      strokeThickness: 4,
    });
    text.setOrigin(0.5, 0.5);
    this.matter.add.gameObject(text, {
      shape: {
        type: 'rectangle',
        width: plan.size,
        height: plan.size,
      },
      friction: 0.82,
      restitution: 0.05,
      label: `glyph:${plan.char}`,
    });
    this.glyphs.push(text);
    this.glyphCount = this.glyphs.length;
  }

  private moveCaretBySpace(): void {
    const caret = this.caret.snapshot();
    this.caret.placeAt({ x: caret.position.x + caret.glyphSize, y: caret.position.y });
  }

  private startVehicle(): void {
    if (this.goalState === 'editing') {
      this.goalState = 'playing';
    }
  }

  private undoGlyph(): void {
    const glyph = this.glyphs.pop();
    glyph?.destroy();
    this.glyphCount = this.glyphs.length;
  }

  private resetStage(): void {
    this.glyphs.forEach((glyph) => glyph.destroy());
    this.glyphs = [];
    this.glyphCount = 0;
    this.loadStage(this.stageIndex);
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
