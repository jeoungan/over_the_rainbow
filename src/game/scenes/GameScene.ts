import Phaser from 'phaser';
import { createCaretController, type CaretSnapshot } from '../caret/CaretController';
import { installGameDevtools } from '../devtools';
import { createGlyphPlan } from '../glyph/GlyphPhysicsFactory';
import type { GlyphPlan } from '../glyph/GlyphPhysicsFactory';
import { didPassOverRainbow } from '../goal/GoalDetector';
import { createTextInputController } from '../input/TextInputController';
import { STAGES, VEHICLES } from '../stages';
import type { StageDefinition, VehicleKey } from '../types';
import { getVehicleDrive } from '../vehicle/VehicleController';
import { estimateSlopeDegrees } from '../vehicle/SlopeEstimator';

const WORLD = { width: 1280, height: 720 };
const E2E_QUERY_FLAG = 'e2e';
const CARET_KEY_STEP_RATIO = 0.35;
const SPACE_ADVANCE_RATIO = 0.42;
const LETTER_GAP_RATIO = 0.06;
const LAUNCH_SPEED_SCALE = 2.2;
const LAUNCH_ANGULAR_SPEED = 0.12;
const AUTO_DRIVE_FORCE_SCALE = 3.2;

export class GameScene extends Phaser.Scene {
  private stageIndex = 0;
  private stage: StageDefinition = STAGES[0];
  private readonly caret = createCaretController(WORLD);
  private readonly inputController = createTextInputController();
  private previousPlayerPosition = { x: 0, y: 0 };
  private glyphCount = 0;
  private goalState: 'editing' | 'playing' | 'won' | 'failed' = 'editing';
  private player?: Phaser.Physics.Matter.Image;
  private rainbowGraphics?: Phaser.GameObjects.Graphics;
  private passLine?: Phaser.GameObjects.Rectangle;
  private glyphs: Phaser.GameObjects.Text[] = [];
  private readonly pendingGlyphs = new Set<Phaser.GameObjects.Text>();
  private readonly glyphPlans = new Map<Phaser.GameObjects.Text, GlyphPlan>();
  private readonly selectedGlyphs = new Set<Phaser.GameObjects.Text>();
  private uiRoot?: HTMLDivElement;
  private textCapture?: HTMLTextAreaElement;
  private caretGraphic?: Phaser.GameObjects.Rectangle;
  private textBoxGraphic?: Phaser.GameObjects.Graphics;
  private stageLabel?: Phaser.GameObjects.Text;
  private statusLabel?: Phaser.GameObjects.Text;
  private hintLabel?: Phaser.GameObjects.Text;
  private groundGraphics?: Phaser.GameObjects.Graphics;
  private groundBodies: MatterJS.BodyType[] = [];
  private nextStageButton?: HTMLButtonElement;
  private suppressNextTextInput?: string;
  private isComposingText = false;

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
          glyphs: this.glyphs.map((glyph) => {
            const body = glyph.body as MatterJS.BodyType | undefined;
            const hasPhysics = Boolean(body);
            return {
              char: glyph.text,
              x: glyph.x,
              y: glyph.y,
              size: this.glyphPlans.get(glyph)?.size ?? glyph.height,
              rotation: glyph.rotation,
              hasPhysics,
              isStatic: Boolean(body?.isStatic),
              isPending: this.pendingGlyphs.has(glyph),
              isSelected: this.selectedGlyphs.has(glyph),
            };
          }),
          glyphCount: this.glyphCount,
          selectedGlyphCount: this.selectedGlyphs.size,
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
      this.shouldInstallTestControls()
        ? {
            goToStage: (stageIndex) => this.changeStageTo(stageIndex),
            placePlayer: (pose) => this.placePlayerForTest(pose),
          }
        : undefined,
    );
  }

  update(): void {
    if (!this.player) return;

    const previous = { ...this.previousPlayerPosition };
    this.previousPlayerPosition = { x: this.player.x, y: this.player.y };

    if (this.goalState === 'playing') {
      const vehicle = VEHICLES[this.stage.vehicleKey];
      const drive = getVehicleDrive(vehicle, 'right', estimateSlopeDegrees(this.player.rotation), true);
      const body = this.player.body as MatterJS.BodyType;
      const minimumForce = vehicle.acceleration * vehicle.climbingForce * 0.72;
      const forceX = Math.max(drive.forceX, minimumForce);

      this.wakeBody(body);
      this.player.applyForce(new Phaser.Math.Vector2(forceX * AUTO_DRIVE_FORCE_SCALE, 0));
      this.player.setAngularVelocity(body.angularVelocity * (1 - drive.angularDamping));

      if (Math.abs(body.velocity.x) > drive.maxSpeed * LAUNCH_SPEED_SCALE) {
        this.player.setVelocityX(Math.sign(body.velocity.x) * drive.maxSpeed * LAUNCH_SPEED_SCALE);
      }
    }

    if (
      this.goalState === 'playing' &&
      didPassOverRainbow(previous, { x: this.player.x, y: this.player.y }, this.stage.rainbow)
    ) {
      this.goalState = 'won';
    }

    if (this.goalState === 'playing' && this.didFailStage()) {
      this.goalState = 'failed';
    }

    this.drawHud();
  }

  private setupInput(): void {
    this.createTextCapture();

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.caret.placeAt({ x: pointer.worldX, y: pointer.worldY });
      this.clearGlyphSelection();
      this.focusTextCapture();
    });

    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: unknown[], _dx: number, dy: number) => {
      this.caret.changeSizeFromWheel(dy);
    });

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', this.handleKeyDown);
      window.removeEventListener('keyup', this.handleKeyUp);
      this.textCapture?.removeEventListener('beforeinput', this.handleBeforeInput);
      this.textCapture?.removeEventListener('input', this.handleTextInput);
      this.textCapture?.removeEventListener('compositionstart', this.handleCompositionStart);
      this.textCapture?.removeEventListener('compositionend', this.handleCompositionEnd);
      this.textCapture?.remove();
      this.textCapture = undefined;
    });
  }

  private buildUi(): void {
    this.uiRoot?.remove();

    const host = document.querySelector<HTMLElement>('#game-root');
    if (!host) return;

    const uiRoot = document.createElement('div');
    uiRoot.className = 'game-ui';

    this.nextStageButton = this.createButton('Next Stage', this.handleNextStageClick);
    this.nextStageButton.className = 'next-stage-button';

    uiRoot.append(
      this.createButton('Start', this.handleStartClick),
      this.createButton('Undo', this.handleUndoClick),
      this.createButton('Reset', this.handleResetClick),
      this.nextStageButton,
    );

    host.append(uiRoot);
    this.uiRoot = uiRoot;
    this.refreshUi();

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

  private createTextCapture(): void {
    const host = document.querySelector<HTMLElement>('#game-root');
    if (!host) return;

    this.textCapture?.removeEventListener('beforeinput', this.handleBeforeInput);
    this.textCapture?.removeEventListener('input', this.handleTextInput);
    this.textCapture?.removeEventListener('compositionstart', this.handleCompositionStart);
    this.textCapture?.removeEventListener('compositionend', this.handleCompositionEnd);
    this.textCapture?.remove();

    const capture = document.createElement('textarea');
    capture.className = 'text-capture';
    capture.setAttribute('aria-label', 'Text input');
    capture.autocapitalize = 'off';
    capture.autocomplete = 'off';
    capture.spellcheck = false;
    capture.addEventListener('beforeinput', this.handleBeforeInput);
    capture.addEventListener('input', this.handleTextInput);
    capture.addEventListener('compositionstart', this.handleCompositionStart);
    capture.addEventListener('compositionend', this.handleCompositionEnd);
    host.append(capture);
    this.textCapture = capture;
    this.focusTextCapture();
  }

  private focusTextCapture(): void {
    if (!this.textCapture || document.activeElement === this.textCapture) return;

    this.textCapture.focus({ preventScroll: true });
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

  private readonly handleNextStageClick = (): void => {
    if (this.goalState === 'won') {
      this.changeStage(1);
    }
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    this.focusTextCapture();

    const intent = this.inputController.keyDown({
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      repeat: event.repeat,
    });

    if (intent.type !== 'none') event.preventDefault();
    if (intent.type === 'glyph') this.createGlyph(intent.value);
    if (intent.type === 'space') this.moveCaretBySpace();
    if (intent.type === 'release') this.releasePendingGlyphs();
    if (intent.type === 'undo') this.undoGlyph();
    if (intent.type === 'start') this.startVehicle();
    if (intent.type === 'selectAll') this.selectAllGlyphs();
    if (intent.type === 'caretMove') this.moveCaretFromKeyboard(intent.dx, intent.dy);
  };

  private readonly handleKeyUp = (_event: KeyboardEvent): void => {};

  private readonly handleCompositionStart = (event: CompositionEvent): void => {
    if (event.target !== this.textCapture) return;

    this.isComposingText = true;
    this.inputController.compositionStart();
  };

  private readonly handleCompositionEnd = (event: CompositionEvent): void => {
    if (event.target !== this.textCapture) return;

    this.isComposingText = false;
    this.inputController.compositionEnd('');
    this.commitCapturedText(this.textCapture?.value || event.data);
  };

  private readonly handleBeforeInput = (event: InputEvent): void => {
    if (event.target !== this.textCapture) return;

    const data = event.data;
    if (!data || this.isComposingText || event.inputType === 'insertCompositionText' || event.isComposing) return;

    event.preventDefault();

    if (this.suppressNextTextInput === data) {
      this.suppressNextTextInput = undefined;
      this.clearTextCaptureValue();
      return;
    }

    this.insertText(data);
    this.clearTextCaptureValue();
  };

  private readonly handleTextInput = (event: Event): void => {
    if (event.target !== this.textCapture || this.isComposingText) return;

    this.commitCapturedText(this.textCapture?.value ?? '');
  };

  private commitCapturedText(value: string): void {
    if (!value) {
      this.clearTextCaptureValue();
      return;
    }

    if (this.suppressNextTextInput === value) {
      this.suppressNextTextInput = undefined;
      this.clearTextCaptureValue();
      return;
    }

    this.suppressNextTextInput = value;
    window.setTimeout(() => {
      if (this.suppressNextTextInput === value) this.suppressNextTextInput = undefined;
    }, 50);
    this.insertText(value);
    this.clearTextCaptureValue();
  }

  private clearTextCaptureValue(): void {
    if (this.textCapture) this.textCapture.value = '';
  }

  private insertText(value: string): void {
    for (const char of Array.from(value)) {
      if (char === ' ') {
        this.moveCaretBySpace();
      } else if (char !== '\n' && char !== '\r' && char !== '\t') {
        this.createGlyph(char);
      }
    }
  }

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
    this.add.rectangle(WORLD.width / 2, 160, WORLD.width, 320, 0xd7e9fb);
    this.add.rectangle(WORLD.width / 2, 430, WORLD.width, 220, 0xe8edf5);
    this.add.rectangle(WORLD.width / 2, 640, WORLD.width, 160, 0xcfe6d2);

    const graphics = this.add.graphics();
    graphics.fillStyle(0x8aa7b7, 0.18);
    graphics.fillTriangle(40, 640, 260, 430, 480, 640);
    graphics.fillTriangle(350, 640, 620, 390, 900, 640);
    graphics.fillTriangle(760, 640, 1040, 410, 1280, 640);
    graphics.fillStyle(0x5f7f8f, 0.12);
    graphics.fillTriangle(0, 640, 180, 505, 340, 640);
    graphics.fillTriangle(520, 640, 760, 500, 980, 640);
    graphics.fillTriangle(930, 640, 1155, 500, 1280, 640);
    graphics.lineStyle(2, 0xffffff, 0.35);
    graphics.lineBetween(0, 372, WORLD.width, 372);

    this.drawCloudCluster(240, 125, 1);
    this.drawCloudCluster(900, 92, 1.2);
    this.drawCloudCluster(1110, 162, 0.7);
  }

  private drawCloudCluster(x: number, y: number, scale: number): void {
    const cloudColor = 0xffffff;
    this.add.ellipse(x, y, 185 * scale, 48 * scale, cloudColor, 0.55);
    this.add.ellipse(x + 72 * scale, y + 10 * scale, 150 * scale, 42 * scale, cloudColor, 0.42);
    this.add.ellipse(x - 58 * scale, y + 8 * scale, 120 * scale, 36 * scale, cloudColor, 0.38);
  }

  private loadStage(index: number): void {
    this.stageIndex = index;
    this.stage = STAGES[this.stageIndex];
    this.goalState = 'editing';
    this.glyphCount = 0;
    this.player?.destroy();
    this.drawStageTerrain();

    const vehicle = VEHICLES[this.stage.vehicleKey];
    this.player = this.matter.add.image(this.stage.spawn.x, this.stage.spawn.y, `vehicle-${vehicle.key}`, undefined, {
      label: `vehicle:${vehicle.key}`,
      isStatic: true,
      mass: vehicle.mass,
      friction: 0.12,
      frictionAir: 0.004,
      restitution: 0.08,
    });
    const displaySize = this.getVehicleDisplaySize(vehicle.key);
    this.player.setDisplaySize(displaySize.width, displaySize.height);
    this.previousPlayerPosition = { x: this.stage.spawn.x, y: this.stage.spawn.y };

    this.drawRainbow();
    this.drawHud();
  }

  private getVehicleDisplaySize(vehicleKey: VehicleKey): { width: number; height: number } {
    if (vehicleKey === 'walking') return { width: 38, height: 54 };
    if (vehicleKey === 'bicycle') return { width: 76, height: 42 };
    if (vehicleKey === 'smallCar') return { width: 76, height: 38 };
    return { width: 88, height: 34 };
  }

  private drawStageTerrain(): void {
    this.groundGraphics?.destroy();
    this.groundBodies.forEach((body) => this.matter.world.remove(body));
    this.groundBodies = [];

    const graphics = this.add.graphics();
    const isCanyon = this.stage.terrainTheme === 'canyon';
    const isTerrace = this.stage.terrainTheme === 'terrace';
    const isBrokenBridge = this.stage.terrainTheme === 'brokenBridge';
    const groundColor = isCanyon ? 0xb9c98f : isTerrace || isBrokenBridge ? 0xc9b16f : 0x8fc89d;
    const topColor = isCanyon ? 0xffe0a6 : isTerrace || isBrokenBridge ? 0xf8d88d : 0xfff4c7;

    if (isCanyon) {
      this.drawCanyonGaps(graphics);
    }

    if (isTerrace) {
      this.drawTerraceBackdrop(graphics);
      this.drawTerraceGaps(graphics);
    }

    if (isBrokenBridge) {
      this.drawBrokenBridgeBackdrop(graphics);
      this.drawBrokenBridgeGaps(graphics);
    }

    for (const segment of this.stage.groundSegments) {
      const left = segment.x - segment.width / 2;
      const top = segment.y - segment.height / 2;
      graphics.fillStyle(groundColor, 1);
      graphics.fillRect(left, top, segment.width, WORLD.height - top);
      graphics.fillStyle(topColor, 0.45);
      graphics.fillRect(left, top, segment.width, 24);

      if (isTerrace) {
        this.drawTerraceFace(graphics, left, top, segment.width);
      }

      if (isBrokenBridge) {
        this.drawBridgePier(graphics, left, top, segment.width);
      }

      const body = this.matter.add.rectangle(segment.x, segment.y, segment.width, segment.height, {
        isStatic: true,
        label: `ground:${this.stage.id}`,
      }) as MatterJS.BodyType;
      this.groundBodies.push(body);
    }

    this.groundGraphics = graphics;
  }

  private drawTerraceBackdrop(graphics: Phaser.GameObjects.Graphics): void {
    graphics.fillStyle(0xb7cc9a, 0.2);
    graphics.fillTriangle(100, 650, 420, 420, 740, 650);
    graphics.fillTriangle(610, 650, 930, 390, 1250, 650);
    graphics.fillStyle(0x93b8bd, 0.12);
    graphics.fillTriangle(380, 650, 650, 500, 920, 650);
  }

  private drawBrokenBridgeBackdrop(graphics: Phaser.GameObjects.Graphics): void {
    graphics.fillStyle(0x7aa0b6, 0.13);
    graphics.fillTriangle(110, 650, 420, 455, 720, 650);
    graphics.fillTriangle(680, 650, 995, 430, 1280, 650);
    graphics.lineStyle(5, 0x7e6746, 0.18);
    graphics.lineBetween(320, 600, 460, 560);
    graphics.lineBetween(565, 575, 710, 530);
    graphics.lineBetween(870, 520, 1010, 575);
  }

  private drawCanyonGaps(graphics: Phaser.GameObjects.Graphics): void {
    const sortedSegments = [...this.stage.groundSegments].sort((a, b) => a.x - b.x);
    for (let index = 0; index < sortedSegments.length - 1; index += 1) {
      const leftSegment = sortedSegments[index];
      const rightSegment = sortedSegments[index + 1];
      const gapLeft = leftSegment.x + leftSegment.width / 2;
      const gapRight = rightSegment.x - rightSegment.width / 2;
      const gapWidth = gapRight - gapLeft;

      if (gapWidth <= 0) continue;

      const top = Math.min(leftSegment.y - leftSegment.height / 2, rightSegment.y - rightSegment.height / 2);
      graphics.fillStyle(0x27314d, 0.48);
      graphics.fillRect(gapLeft, top, gapWidth, WORLD.height - top);
      graphics.fillStyle(0x111a31, 0.26);
      graphics.fillTriangle(gapLeft, top, gapLeft + gapWidth * 0.46, WORLD.height, gapLeft, WORLD.height);
      graphics.fillTriangle(gapRight, top, gapRight, WORLD.height, gapLeft + gapWidth * 0.54, WORLD.height);
      graphics.lineStyle(4, 0x566378, 0.45);
      graphics.lineBetween(gapLeft, top, gapLeft, WORLD.height);
      graphics.lineBetween(gapRight, top, gapRight, WORLD.height);
    }
  }

  private drawTerraceGaps(graphics: Phaser.GameObjects.Graphics): void {
    const sortedSegments = [...this.stage.groundSegments].sort((a, b) => a.x - b.x);
    for (let index = 0; index < sortedSegments.length - 1; index += 1) {
      const leftSegment = sortedSegments[index];
      const rightSegment = sortedSegments[index + 1];
      const gapLeft = leftSegment.x + leftSegment.width / 2;
      const gapRight = rightSegment.x - rightSegment.width / 2;
      const gapWidth = gapRight - gapLeft;

      if (gapWidth <= 0) continue;

      const top = Math.min(leftSegment.y - leftSegment.height / 2, rightSegment.y - rightSegment.height / 2);
      graphics.fillStyle(0x5f7891, 0.2);
      graphics.fillRect(gapLeft, top, gapWidth, WORLD.height - top);
      graphics.fillStyle(0xffffff, 0.18);
      graphics.fillTriangle(gapLeft, top, gapRight, top, gapLeft + gapWidth / 2, top + 72);
      graphics.lineStyle(3, 0x7e6746, 0.34);
      graphics.lineBetween(gapLeft, top, gapLeft + gapWidth * 0.18, WORLD.height);
      graphics.lineBetween(gapRight, top, gapRight - gapWidth * 0.18, WORLD.height);
    }
  }

  private drawBrokenBridgeGaps(graphics: Phaser.GameObjects.Graphics): void {
    const sortedSegments = [...this.stage.groundSegments].sort((a, b) => a.x - b.x);
    for (let index = 0; index < sortedSegments.length - 1; index += 1) {
      const leftSegment = sortedSegments[index];
      const rightSegment = sortedSegments[index + 1];
      const gapLeft = leftSegment.x + leftSegment.width / 2;
      const gapRight = rightSegment.x - rightSegment.width / 2;
      const gapWidth = gapRight - gapLeft;

      if (gapWidth <= 0) continue;

      const top = Math.min(leftSegment.y - leftSegment.height / 2, rightSegment.y - rightSegment.height / 2);
      graphics.fillStyle(0x3b4d68, 0.22);
      graphics.fillRect(gapLeft, top, gapWidth, WORLD.height - top);
      graphics.lineStyle(2, 0xffefd0, 0.32);
      graphics.lineBetween(gapLeft + 8, top + 10, gapLeft + gapWidth * 0.34, top + 30);
      graphics.lineBetween(gapRight - 8, top + 10, gapRight - gapWidth * 0.34, top + 30);
    }
  }

  private drawTerraceFace(graphics: Phaser.GameObjects.Graphics, left: number, top: number, width: number): void {
    graphics.lineStyle(2, 0x7a5f38, 0.2);
    for (let y = top + 38; y < WORLD.height; y += 30) {
      graphics.lineBetween(left + 14, y, left + width - 14, y - 6);
    }

    graphics.lineStyle(2, 0xfff2bc, 0.26);
    graphics.lineBetween(left + 8, top + 16, left + width - 8, top + 10);
  }

  private drawBridgePier(graphics: Phaser.GameObjects.Graphics, left: number, top: number, width: number): void {
    graphics.fillStyle(0x7e6746, 0.26);
    const pierWidth = Math.min(42, Math.max(22, width / 5));
    graphics.fillRect(left + 18, top + 22, pierWidth, WORLD.height - top);
    graphics.fillRect(left + width - 18 - pierWidth, top + 22, pierWidth, WORLD.height - top);
    graphics.lineStyle(2, 0xfff2bc, 0.28);
    graphics.lineBetween(left + 10, top + 14, left + width - 10, top + 10);
  }

  private didFailStage(): boolean {
    if (!this.player) return false;

    const fellToWorldBottom = this.player.y > WORLD.height - 48;
    return fellToWorldBottom;
  }

  private createGlyph(char: string): void {
    if (this.selectedGlyphs.size > 0) this.deleteSelectedGlyphs();

    const caret = this.caret.snapshot();
    const visualWidth = this.estimateGlyphWidth(char, caret.glyphSize);
    const plan = createGlyphPlan(
      { getContours: () => [] },
      {
        char,
        fontKey: 'system-serif',
        size: caret.glyphSize,
        width: visualWidth,
        x: caret.position.x + visualWidth / 2,
        y: caret.position.y,
      },
    );

    this.spawnGlyphFromPlan(plan, visualWidth);
  }

  private spawnGlyphFromPlan(plan: GlyphPlan, visualWidth: number): void {
    const text = this.add.text(plan.origin.x, plan.origin.y - plan.size / 2, plan.char, {
      fontFamily: '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", Georgia, serif',
      fontSize: `${plan.size}px`,
      color: '#29395f',
      stroke: '#ffffff',
      strokeThickness: 4,
    });
    text.setOrigin(0.5, 0.5);
    this.glyphs.push(text);
    this.pendingGlyphs.add(text);
    this.glyphPlans.set(text, plan);
    this.glyphCount = this.glyphs.length;
    this.caret.advanceInline(visualWidth + Math.max(2, plan.size * LETTER_GAP_RATIO));
  }

  private estimateGlyphWidth(char: string, size: number): number {
    if (char === '/' || char === '\\') return size * 1.75;
    if (char === 'A' || char === 'V' || char === 'v' || char === '^') return size;
    if (/[\u3130-\u318f\uac00-\ud7a3]/u.test(char)) return size * 0.92;
    if (/[ilI1|.,'!:;]/u.test(char)) return size * 0.3;
    if (/[mwMW@#%&]/u.test(char)) return size * 0.82;
    if (/[A-Z0-9]/u.test(char)) return size * 0.62;
    return size * 0.54;
  }

  private releasePendingGlyphs(): void {
    for (const glyph of Array.from(this.pendingGlyphs)) {
      if (glyph.body) {
        this.pendingGlyphs.delete(glyph);
        continue;
      }

      const plan = this.glyphPlans.get(glyph);
      if (!plan) {
        this.pendingGlyphs.delete(glyph);
        continue;
      }

      this.matter.add.gameObject(glyph, {
        shape: this.createGlyphMatterShape(plan),
        isStatic: false,
        friction: 0.42,
        frictionStatic: 0.72,
        frictionAir: 0.008,
        restitution: 0.28,
        density: 0.0016,
        label: `glyph:${plan.char}`,
      });
      this.pendingGlyphs.delete(glyph);
    }
    this.clearGlyphSelection();
  }

  private createGlyphMatterShape(plan: GlyphPlan): Phaser.Types.Physics.Matter.MatterSetBodyConfig {
    const vertices = plan.parts[0].map((point) => ({
      x: point.x,
      y: point.y + plan.size / 2,
    }));

    return {
      type: 'fromVerts',
      verts: vertices,
      flagInternal: true,
      removeCollinear: 0.01,
      minimumArea: 12,
    };
  }

  private moveCaretBySpace(): void {
    const caret = this.caret.snapshot();
    this.clearGlyphSelection();
    this.caret.advanceInline(Math.max(5, caret.glyphSize * SPACE_ADVANCE_RATIO));
  }

  private moveCaretFromKeyboard(dx: number, dy: number): void {
    const caret = this.caret.snapshot();
    const step = Math.max(4, Math.round(caret.glyphSize * CARET_KEY_STEP_RATIO));
    this.clearGlyphSelection();
    this.caret.moveBy({ x: dx * step, y: dy * step });
  }

  private startVehicle(): void {
    if (this.goalState === 'editing') {
      const vehicle = VEHICLES[this.stage.vehicleKey];
      this.goalState = 'playing';
      this.setPlayerStatic(false);
      this.player?.setVelocity(vehicle.maxSpeed * LAUNCH_SPEED_SCALE, -0.25);
      this.player?.setAngularVelocity(LAUNCH_ANGULAR_SPEED);
    }
  }

  private setPlayerStatic(isStatic: boolean): void {
    const body = this.player?.body as MatterJS.BodyType | undefined;
    if (!body) return;

    this.matter.body.setStatic(body, isStatic);
    this.wakeBody(body);
  }

  private wakeBody(body: MatterJS.BodyType): void {
    body.isSleeping = false;
  }

  private undoGlyph(): void {
    if (this.selectedGlyphs.size > 0) {
      this.deleteSelectedGlyphs();
      return;
    }

    const glyph = this.glyphs.pop();
    if (glyph) {
      this.pendingGlyphs.delete(glyph);
      this.glyphPlans.delete(glyph);
      glyph.destroy();
    }
    this.glyphCount = this.glyphs.length;
  }

  private selectAllGlyphs(): void {
    this.selectedGlyphs.clear();
    this.glyphs.forEach((glyph) => this.selectedGlyphs.add(glyph));
    this.refreshGlyphSelectionStyles();
  }

  private clearGlyphSelection(): void {
    if (this.selectedGlyphs.size === 0) return;

    this.selectedGlyphs.clear();
    this.refreshGlyphSelectionStyles();
  }

  private deleteSelectedGlyphs(): void {
    const selected = new Set(this.selectedGlyphs);
    this.glyphs = this.glyphs.filter((glyph) => {
      if (!selected.has(glyph)) return true;

      this.pendingGlyphs.delete(glyph);
      this.glyphPlans.delete(glyph);
      glyph.destroy();
      return false;
    });
    this.selectedGlyphs.clear();
    this.glyphCount = this.glyphs.length;
  }

  private refreshGlyphSelectionStyles(): void {
    for (const glyph of this.glyphs) {
      glyph.setBackgroundColor(this.selectedGlyphs.has(glyph) ? '#b7dcff' : 'transparent');
    }
  }

  private resetStage(): void {
    this.clearGlyphs();
    this.loadStage(this.stageIndex);
  }

  private changeStage(direction: -1 | 1): void {
    this.changeStageTo(this.stageIndex + direction);
  }

  private changeStageTo(index: number): void {
    const truncatedIndex = Number.isFinite(index) ? Math.trunc(index) : 0;
    const nextIndex = ((truncatedIndex % STAGES.length) + STAGES.length) % STAGES.length;
    this.clearGlyphs();
    this.loadStage(nextIndex);
  }

  private placePlayerForTest(pose: {
    x: number;
    y: number;
    previousX?: number;
    previousY?: number;
    vx?: number;
    vy?: number;
    rotation?: number;
  }): void {
    if (!this.player) return;

    this.player.setPosition(pose.x, pose.y);
    this.player.setVelocity(pose.vx ?? 0, pose.vy ?? 0);
    this.player.setRotation(pose.rotation ?? 0);
    this.player.setAngularVelocity(0);
    this.previousPlayerPosition = {
      x: pose.previousX ?? pose.x,
      y: pose.previousY ?? pose.y,
    };
  }

  private clearGlyphs(): void {
    this.glyphs.forEach((glyph) => glyph.destroy());
    this.glyphs = [];
    this.pendingGlyphs.clear();
    this.glyphPlans.clear();
    this.selectedGlyphs.clear();
    this.glyphCount = 0;
  }

  private drawHud(): void {
    this.refreshUi();

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

    const statusText = this.getStatusText();
    if (!this.statusLabel) {
      this.statusLabel = this.add.text(24, 100, statusText, {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '16px',
        color: '#34415f',
        stroke: '#ffffff',
        strokeThickness: 3,
      });
      this.statusLabel.setScrollFactor(0);
      this.statusLabel.setDepth(20);
    } else {
      this.statusLabel.setText(statusText);
    }

    const hintText = this.goalState === 'editing' ? this.stage.hint : '';
    if (!this.hintLabel) {
      this.hintLabel = this.add.text(24, 126, hintText, {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '14px',
        color: '#46536f',
        stroke: '#ffffff',
        strokeThickness: 3,
      });
      this.hintLabel.setScrollFactor(0);
      this.hintLabel.setDepth(20);
    } else {
      this.hintLabel.setText(hintText);
    }

    const caret = this.caret.snapshot();
    if (!this.caretGraphic) {
      this.caretGraphic = this.add.rectangle(caret.position.x, caret.position.y, 3, caret.glyphSize, 0x223047, 0.9);
      this.caretGraphic.setDepth(18);
    }

    this.caretGraphic.setPosition(caret.position.x, caret.position.y - caret.glyphSize / 2);
    this.caretGraphic.setSize(3, caret.glyphSize);
    this.drawTextBoxFrame(caret);
  }

  private drawTextBoxFrame(caret: CaretSnapshot): void {
    if (!this.textBoxGraphic) {
      this.textBoxGraphic = this.add.graphics();
      this.textBoxGraphic.setDepth(16);
    }

    const pendingBounds = Array.from(this.pendingGlyphs).map((glyph) => glyph.getBounds());
    const left = Math.min(caret.position.x, ...pendingBounds.map((bounds) => bounds.left));
    const right = Math.max(caret.position.x + Math.max(20, caret.glyphSize * 0.35), ...pendingBounds.map((bounds) => bounds.right));
    const top = Math.min(caret.position.y - caret.glyphSize - 8, ...pendingBounds.map((bounds) => bounds.top - 6));
    const bottom = Math.max(caret.position.y + 8, ...pendingBounds.map((bounds) => bounds.bottom + 6));
    const width = Math.max(26, right - left);
    const height = Math.max(24, bottom - top);

    this.textBoxGraphic.clear();
    this.textBoxGraphic.fillStyle(0xffffff, 0.16);
    this.textBoxGraphic.fillRoundedRect(left - 8, top, width + 16, height, 6);
    this.textBoxGraphic.lineStyle(2, 0x223047, 0.45);
    this.textBoxGraphic.strokeRoundedRect(left - 8, top, width + 16, height, 6);
  }

  private getStatusText(): string {
    if (this.goalState === 'editing') return 'Place letters, then Start';
    if (this.goalState === 'playing') return 'Driving';
    if (this.goalState === 'won') return 'Cleared - Next Stage';
    return 'Failed - Reset to retry';
  }

  private refreshUi(): void {
    if (!this.nextStageButton) return;

    const canAdvance = this.goalState === 'won';
    this.nextStageButton.hidden = !canAdvance;
    this.nextStageButton.disabled = !canAdvance;
  }

  private shouldInstallTestControls(): boolean {
    const params = new URLSearchParams(window.location.search);
    return import.meta.env.DEV && params.get(E2E_QUERY_FLAG) === '1';
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
