import Phaser from 'phaser';
import { createCaretController } from '../caret/CaretController';
import { installGameDevtools } from '../devtools';
import { createGlyphPlan } from '../glyph/GlyphPhysicsFactory';
import type { GlyphPlan } from '../glyph/GlyphPhysicsFactory';
import { didPassOverRainbow } from '../goal/GoalDetector';
import { createTextInputController } from '../input/TextInputController';
import { STAGES, VEHICLES } from '../stages';
import type { StageDefinition, VehicleKey } from '../types';
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
  private caretGraphic?: Phaser.GameObjects.Rectangle;
  private stageLabel?: Phaser.GameObjects.Text;

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
    this.drawHud();

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

    this.drawHud();
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
    this.createGeneratedTexture('vehicle-walking', 48, 68, (graphics) => {
      graphics.fillStyle(0xfff2c2, 1);
      graphics.fillCircle(24, 14, 10);
      graphics.lineStyle(6, 0x2d3e6f, 1);
      graphics.lineBetween(24, 27, 24, 45);
      graphics.lineBetween(24, 34, 12, 42);
      graphics.lineBetween(24, 34, 36, 42);
      graphics.lineBetween(24, 45, 14, 62);
      graphics.lineBetween(24, 45, 35, 62);
    });

    this.createGeneratedTexture('vehicle-bicycle', 88, 48, (graphics) => {
      graphics.lineStyle(5, 0x27365f, 1);
      graphics.strokeCircle(22, 33, 13);
      graphics.strokeCircle(66, 33, 13);
      graphics.lineStyle(4, 0x4fb0a0, 1);
      graphics.lineBetween(22, 33, 42, 16);
      graphics.lineBetween(42, 16, 66, 33);
      graphics.lineBetween(22, 33, 47, 33);
      graphics.lineBetween(47, 33, 42, 16);
      graphics.lineStyle(4, 0x27365f, 1);
      graphics.lineBetween(42, 16, 40, 8);
      graphics.lineBetween(55, 15, 68, 15);
    });

    this.createGeneratedTexture('vehicle-smallCar', 96, 48, (graphics) => {
      graphics.fillStyle(0xf5f7ff, 1);
      graphics.fillRoundedRect(12, 16, 72, 22, 8);
      graphics.fillStyle(0x6dbdd6, 1);
      graphics.fillRoundedRect(34, 7, 28, 18, 6);
      graphics.fillStyle(0x253252, 1);
      graphics.fillCircle(28, 39, 8);
      graphics.fillCircle(70, 39, 8);
      graphics.fillStyle(0xffc857, 1);
      graphics.fillCircle(83, 25, 4);
    });

    this.createGeneratedTexture('vehicle-racingCar', 112, 44, (graphics) => {
      graphics.fillStyle(0xf26b8a, 1);
      graphics.fillTriangle(10, 31, 48, 10, 102, 31);
      graphics.fillRoundedRect(28, 18, 64, 16, 7);
      graphics.fillStyle(0xfff4c7, 1);
      graphics.fillTriangle(54, 13, 72, 20, 44, 22);
      graphics.fillStyle(0x232b48, 1);
      graphics.fillCircle(34, 34, 7);
      graphics.fillCircle(82, 34, 7);
      graphics.fillStyle(0xffffff, 0.7);
      graphics.fillRect(102, 25, 6, 3);
    });
  }

  private createGeneratedTexture(
    key: string,
    width: number,
    height: number,
    draw: (graphics: Phaser.GameObjects.Graphics) => void,
  ): void {
    if (this.textures.exists(key)) return;

    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    draw(graphics);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }

  private drawBackground(): void {
    this.add.rectangle(WORLD.width / 2, WORLD.height / 2, WORLD.width, WORLD.height, 0xdcecff);
    this.add.rectangle(WORLD.width / 2, 515, WORLD.width, 360, 0xf7d6df, 0.22);
    this.add.ellipse(260, 536, 640, 150, 0x98c8aa, 0.34);
    this.add.ellipse(760, 550, 720, 180, 0xf3d58a, 0.25);
    this.add.ellipse(1110, 528, 580, 140, 0x7fb8c8, 0.28);
    this.add.ellipse(240, 170, 280, 80, 0xffffff, 0.55);
    this.add.ellipse(360, 190, 210, 64, 0xffffff, 0.38);
    this.add.ellipse(870, 120, 360, 90, 0xffffff, 0.45);
    this.add.ellipse(980, 145, 260, 70, 0xffffff, 0.34);
    this.add.rectangle(WORLD.width / 2, 660, WORLD.width, 120, 0x8fc89d);
    this.add.rectangle(WORLD.width / 2, 628, WORLD.width, 24, 0xfff4c7, 0.35);
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
    this.player = this.matter.add.image(this.stage.spawn.x, this.stage.spawn.y, `vehicle-${vehicle.key}`, undefined, {
      label: `vehicle:${vehicle.key}`,
      mass: vehicle.mass,
      friction: 0.9,
      frictionAir: 0.015,
    });
    const displaySize = this.getVehicleDisplaySize(vehicle.key);
    this.player.setDisplaySize(displaySize.width, displaySize.height);
    this.previousPlayerPosition = { x: this.stage.spawn.x, y: this.stage.spawn.y };

    this.drawRainbow();
  }

  private getVehicleDisplaySize(vehicleKey: VehicleKey): { width: number; height: number } {
    if (vehicleKey === 'walking') return { width: 38, height: 54 };
    if (vehicleKey === 'bicycle') return { width: 76, height: 42 };
    if (vehicleKey === 'smallCar') return { width: 76, height: 38 };
    return { width: 88, height: 34 };
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

  private drawHud(): void {
    const vehicle = VEHICLES[this.stage.vehicleKey];
    const label = `${this.stage.title} / ${vehicle.label}`;

    if (!this.stageLabel) {
      this.stageLabel = this.add.text(24, 72, label, {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '18px',
        color: '#223047',
        stroke: '#ffffff',
        strokeThickness: 3,
      });
      this.stageLabel.setScrollFactor(0);
      this.stageLabel.setDepth(20);
    } else {
      this.stageLabel.setText(label);
    }

    const caret = this.caret.snapshot();
    if (!this.caretGraphic) {
      this.caretGraphic = this.add.rectangle(caret.position.x, caret.position.y, 3, caret.glyphSize, 0x223047, 0.9);
      this.caretGraphic.setDepth(18);
    }

    this.caretGraphic.setPosition(caret.position.x, caret.position.y - caret.glyphSize / 2);
    this.caretGraphic.setSize(3, caret.glyphSize);
  }

  private drawRainbow(): void {
    this.rainbowGraphics?.destroy();
    this.passLine?.destroy();

    const { rainbow } = this.stage;
    const graphics = this.add.graphics();
    const colors = [0xf26b8a, 0xffc857, 0x63c77a, 0x5aa7ff, 0x9b6bff];
    const radius = rainbow.width / 2;
    colors.forEach((color, index) => {
      graphics.lineStyle(8, color, 0.95);
      graphics.beginPath();
      graphics.arc(
        rainbow.centerX,
        rainbow.centerY + index * 6,
        radius - index * 3,
        Phaser.Math.DegToRad(205),
        Phaser.Math.DegToRad(335),
        false,
      );
      graphics.strokePath();
    });
    this.rainbowGraphics = graphics;
    this.passLine = this.add.rectangle(rainbow.centerX, rainbow.passTopY, rainbow.width, 4, 0xffffff, 0.45);
  }
}
