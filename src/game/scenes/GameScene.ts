import Phaser from 'phaser';
import { createCaretController, type CaretSnapshot } from '../caret/CaretController';
import { installGameDevtools } from '../devtools';
import { createGlyphPlan } from '../glyph/GlyphPhysicsFactory';
import type { GlyphPlan } from '../glyph/GlyphPhysicsFactory';
import { didPassOverRainbow } from '../goal/GoalDetector';
import { createTextInputController } from '../input/TextInputController';
import { STAGES, VEHICLES } from '../stages';
import type { Point, StageDefinition, VehicleKey } from '../types';
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
const PLAY_LIMIT_MS = 15_000;

export class GameScene extends Phaser.Scene {
  private stageIndex = 0;
  private stage: StageDefinition = STAGES[0];
  private readonly caret = createCaretController(WORLD);
  private readonly inputController = createTextInputController();
  private previousPlayerPosition = { x: 0, y: 0 };
  private glyphCount = 0;
  private goalState: 'editing' | 'playing' | 'won' | 'failed' = 'editing';
  private player?: Phaser.Physics.Matter.Image;
  private playerVisual?: Phaser.GameObjects.Image;
  private rainbowGraphics?: Phaser.GameObjects.Graphics;
  private passLine?: Phaser.GameObjects.Rectangle;
  private glyphs: Phaser.GameObjects.Text[] = [];
  private readonly pendingGlyphs = new Set<Phaser.GameObjects.Text>();
  private readonly glyphPlans = new Map<Phaser.GameObjects.Text, GlyphPlan>();
  private readonly glyphCaretStarts = new Map<Phaser.GameObjects.Text, Point>();
  private readonly selectedGlyphs = new Set<Phaser.GameObjects.Text>();
  private uiRoot?: HTMLDivElement;
  private textCapture?: HTMLTextAreaElement;
  private caretGraphic?: Phaser.GameObjects.Rectangle;
  private textBoxGraphic?: Phaser.GameObjects.Graphics;
  private stageLabel?: Phaser.GameObjects.Text;
  private logoGroup?: Phaser.GameObjects.Container;
  private groundGraphics?: Phaser.GameObjects.Graphics;
  private groundBodies: MatterJS.BodyType[] = [];
  private startButton?: HTMLButtonElement;
  private undoButton?: HTMLButtonElement;
  private resetButton?: HTMLButtonElement;
  private nextStageButton?: HTMLButtonElement;
  private replayButton?: HTMLButtonElement;
  private closeButton?: HTMLButtonElement;
  private endOverlay?: HTMLDivElement;
  private endOverlayTitle?: HTMLDivElement;
  private suppressNextTextInput?: string;
  private isComposingText = false;
  private rainbowReveal = 1;
  private playElapsedMs = 0;
  private endOverlayDismissed = false;

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
            const bounds = glyph.getBounds();
            return {
              char: glyph.text,
              x: glyph.x,
              y: glyph.y,
              left: bounds.left,
              right: bounds.right,
              top: bounds.top,
              bottom: bounds.bottom,
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
          playTimeRemainingMs: this.getPlayTimeRemainingMs(),
        };
      },
      (ms) => {
        const steps = Math.max(1, Math.round(ms / (1000 / 60)));
        for (let i = 0; i < steps; i += 1) {
          this.update(undefined, 1000 / 60);
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

  update(_time?: number, delta = 1000 / 60): void {
    if (!this.player) return;

    const previous = { ...this.previousPlayerPosition };
    this.previousPlayerPosition = { x: this.player.x, y: this.player.y };
    this.updateVehicleArt();

    if (this.goalState === 'playing') {
      this.playElapsedMs = Math.min(PLAY_LIMIT_MS, this.playElapsedMs + delta);
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
      this.finishStage('won');
    }

    if (this.goalState === 'playing' && this.didFailStage()) {
      this.finishStage('failed');
    }

    if (this.goalState === 'playing' && this.playElapsedMs >= PLAY_LIMIT_MS) {
      this.finishStage('failed');
    }

    this.drawHud();
  }

  private setupInput(): void {
    this.createTextCapture();

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.canEditWorld()) return;

      this.placeCaretAt({ x: pointer.worldX, y: pointer.worldY });
      this.clearGlyphSelection();
      this.refocusTextCaptureAfterPointer();
    });

    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: unknown[], _dx: number, dy: number) => {
      if (!this.canEditWorld()) return;

      this.caret.changeSizeFromWheel(dy);
      this.constrainCaretToStage();
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

    this.startButton = this.createButton('Start', this.handleStartClick);
    this.undoButton = this.createButton('Undo', this.handleUndoClick);
    this.resetButton = this.createButton('Reset', this.handleResetClick);

    uiRoot.append(this.startButton, this.undoButton, this.resetButton);

    const endOverlay = document.createElement('div');
    endOverlay.className = 'end-overlay';
    endOverlay.hidden = true;

    const endOverlayTitle = document.createElement('div');
    endOverlayTitle.className = 'end-overlay-title';

    const endOverlayActions = document.createElement('div');
    endOverlayActions.className = 'end-overlay-actions';

    this.nextStageButton = this.createButton('Next Stage', this.handleNextStageClick);
    this.nextStageButton.className = 'next-stage-button';
    this.replayButton = this.createButton('Replay', this.handleReplayClick);
    this.closeButton = this.createButton('Close', this.handleCloseOverlayClick);

    endOverlayActions.append(this.nextStageButton, this.replayButton, this.closeButton);
    endOverlay.append(endOverlayTitle, endOverlayActions);

    host.append(uiRoot);
    host.append(endOverlay);
    this.uiRoot = uiRoot;
    this.endOverlay = endOverlay;
    this.endOverlayTitle = endOverlayTitle;
    this.refreshUi();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.uiRoot?.remove();
      this.endOverlay?.remove();
      this.uiRoot = undefined;
      this.endOverlay = undefined;
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

  private refocusTextCaptureAfterPointer(): void {
    this.focusTextCapture();
    window.setTimeout(() => this.focusTextCapture(), 0);
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

  private readonly handleReplayClick = (): void => {
    this.resetStage();
  };

  private readonly handleCloseOverlayClick = (): void => {
    this.endOverlayDismissed = true;
    this.refreshUi();
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
    if (!this.canEditWorld() && intent.type !== 'none') return;
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
    if (!this.canEditWorld()) {
      this.clearTextCaptureValue();
      return;
    }

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

  private canEditWorld(): boolean {
    return this.goalState === 'editing' || this.goalState === 'playing';
  }

  private getPlayTimeRemainingMs(): number {
    if (this.goalState === 'editing') return PLAY_LIMIT_MS;
    return Math.max(0, Math.ceil(PLAY_LIMIT_MS - this.playElapsedMs));
  }

  private placeCaretAt(point: Point): void {
    this.caret.placeAt(this.clampCaretPointToStage(point));
  }

  private constrainCaretToStage(): void {
    const caret = this.caret.snapshot();
    this.placeCaretAt(caret.position);
  }

  private clampCaretPointToStage(point: Point): Point {
    const x = Phaser.Math.Clamp(point.x, 0, WORLD.width);
    const y = Phaser.Math.Clamp(point.y, 0, this.getCaretFloorY(x));
    return { x, y };
  }

  private getCaretFloorY(x: number): number {
    const segmentTops = this.stage.groundSegments.map((segment) => segment.y - segment.height / 2);
    const containingSegments = this.stage.groundSegments.filter((segment) => {
      const left = segment.x - segment.width / 2;
      const right = segment.x + segment.width / 2;
      return x >= left && x <= right;
    });
    const activeTops = containingSegments.length > 0 ? containingSegments.map((segment) => segment.y - segment.height / 2) : segmentTops;
    return Math.max(0, Math.min(...activeTops));
  }

  private insertText(value: string): void {
    if (!this.canEditWorld()) return;

    for (const char of Array.from(value)) {
      if (char === ' ') {
        this.moveCaretBySpace();
      } else if (char !== '\n' && char !== '\r' && char !== '\t') {
        this.createGlyph(char);
      }
    }
  }

  private ensureGeneratedTextures(): void {
    for (let frame = 0; frame < 4; frame += 1) {
      this.createGeneratedTexture(`vehicle-walking-${frame}`, 80, 92, (graphics) => this.drawWalkingVehicleTexture(graphics, frame));
      this.createGeneratedTexture(`vehicle-bicycle-${frame}`, 126, 76, (graphics) => this.drawBicycleVehicleTexture(graphics, frame));
      this.createGeneratedTexture(`vehicle-smallCar-${frame}`, 122, 70, (graphics) => this.drawSmallCarVehicleTexture(graphics, frame));
      this.createGeneratedTexture(`vehicle-racingCar-${frame}`, 146, 66, (graphics) => this.drawRacingCarVehicleTexture(graphics, frame));
    }

    this.createGeneratedTexture('vehicle-walking', 80, 92, (graphics) => this.drawWalkingVehicleTexture(graphics, 0));
    this.createGeneratedTexture('vehicle-bicycle', 126, 76, (graphics) => this.drawBicycleVehicleTexture(graphics, 0));
    this.createGeneratedTexture('vehicle-smallCar', 122, 70, (graphics) => this.drawSmallCarVehicleTexture(graphics, 0));
    this.createGeneratedTexture('vehicle-racingCar', 146, 66, (graphics) => this.drawRacingCarVehicleTexture(graphics, 0));
    this.createGeneratedTexture('vehicle-hitbox', 64, 40, (graphics) => {
      graphics.fillStyle(0xffffff, 1);
      graphics.fillRoundedRect(0, 0, 64, 40, 8);
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

  private drawWalkingVehicleTexture(graphics: Phaser.GameObjects.Graphics, frame: number): void {
    const step = Math.sin((frame / 4) * Math.PI * 2);
    const opposite = Math.sin(((frame + 2) / 4) * Math.PI * 2);
    const hip = { x: 42, y: 58 };

    graphics.fillStyle(0x1b2948, 0.2);
    graphics.fillEllipse(42, 84, 46, 10);
    graphics.fillStyle(0x7a4b2a, 1);
    graphics.fillRoundedRect(18, 29, 18, 32, 7);
    graphics.fillStyle(0x3a2418, 1);
    graphics.fillRoundedRect(22, 25, 19, 34, 8);
    graphics.fillStyle(0xf6c18b, 1);
    graphics.fillCircle(40, 19, 12);
    graphics.fillStyle(0x5b321e, 1);
    graphics.fillCircle(36, 12, 9);
    graphics.fillCircle(45, 12, 7);
    graphics.fillStyle(0x143f75, 1);
    graphics.fillRoundedRect(28, 30, 28, 32, 10);
    graphics.fillStyle(0x2e83c7, 1);
    graphics.fillRoundedRect(31, 32, 21, 27, 7);
    graphics.lineStyle(4, 0xf6c18b, 1);
    graphics.lineBetween(31, 40, 22 - step * 7, 53 + step * 2);
    graphics.lineBetween(53, 40, 62 + step * 7, 52 - step * 2);
    graphics.lineStyle(6, 0x26334f, 1);
    graphics.lineBetween(hip.x - 3, hip.y, 28 - step * 13, 77);
    graphics.lineBetween(hip.x + 3, hip.y, 56 - opposite * 13, 77);
    graphics.lineStyle(5, 0xc24132, 1);
    graphics.lineBetween(25 - step * 13, 80, 38 - step * 13, 80);
    graphics.lineBetween(53 - opposite * 13, 80, 66 - opposite * 13, 80);
  }

  private drawBicycleVehicleTexture(graphics: Phaser.GameObjects.Graphics, frame: number): void {
    this.drawWheel(graphics, 30, 53, 18, frame);
    this.drawWheel(graphics, 96, 53, 18, frame + 1);
    graphics.lineStyle(5, 0x0d5b9d, 1);
    graphics.lineBetween(30, 53, 58, 27);
    graphics.lineBetween(58, 27, 96, 53);
    graphics.lineBetween(30, 53, 67, 53);
    graphics.lineBetween(67, 53, 58, 27);
    graphics.lineStyle(4, 0x16294d, 1);
    graphics.lineBetween(58, 27, 56, 15);
    graphics.lineBetween(76, 26, 101, 21);
    graphics.lineBetween(73, 25, 81, 16);
    graphics.fillStyle(0x26334f, 1);
    graphics.fillRoundedRect(48, 9, 21, 7, 4);
    graphics.fillStyle(0xffffff, 0.55);
    graphics.fillCircle(64, 48, 5);
  }

  private drawSmallCarVehicleTexture(graphics: Phaser.GameObjects.Graphics, frame: number): void {
    graphics.fillStyle(0x1b2948, 0.2);
    graphics.fillEllipse(62, 62, 86, 12);
    graphics.fillStyle(0xf6c04f, 1);
    graphics.fillRoundedRect(16, 29, 90, 27, 12);
    graphics.fillStyle(0xffd879, 1);
    graphics.fillRoundedRect(39, 14, 37, 25, 10);
    graphics.fillStyle(0x9ed8f0, 0.9);
    graphics.fillRoundedRect(45, 18, 24, 18, 6);
    graphics.fillStyle(0xf08a38, 1);
    graphics.fillCircle(103, 40, 5);
    this.drawWheel(graphics, 36, 55, 11, frame);
    this.drawWheel(graphics, 87, 55, 11, frame + 1);
    graphics.lineStyle(2, 0x9a641c, 0.45);
    graphics.strokeRoundedRect(18, 31, 85, 23, 10);
  }

  private drawRacingCarVehicleTexture(graphics: Phaser.GameObjects.Graphics, frame: number): void {
    graphics.fillStyle(0x1b2948, 0.2);
    graphics.fillEllipse(72, 58, 104, 10);
    graphics.fillStyle(0xd6283b, 1);
    graphics.fillTriangle(9, 47, 62, 20, 137, 46);
    graphics.fillRoundedRect(30, 32, 87, 18, 8);
    graphics.fillStyle(0xff5968, 1);
    graphics.fillTriangle(37, 31, 65, 14, 95, 31);
    graphics.fillStyle(0x9ed8f0, 0.85);
    graphics.fillTriangle(63, 18, 87, 31, 49, 31);
    graphics.fillStyle(0x1f2746, 1);
    graphics.fillTriangle(106, 29, 131, 20, 125, 33);
    this.drawWheel(graphics, 43, 51, 10, frame);
    this.drawWheel(graphics, 104, 51, 10, frame + 1);
    graphics.fillStyle(0xffffff, 0.78);
    graphics.fillRoundedRect(130, 41, 8, 4, 2);
  }

  private drawWheel(graphics: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, frame: number): void {
    graphics.fillStyle(0x151a2c, 1);
    graphics.fillCircle(x, y, radius);
    graphics.fillStyle(0x4a536b, 1);
    graphics.fillCircle(x, y, radius * 0.68);
    graphics.fillStyle(0xdde8f0, 1);
    graphics.fillCircle(x, y, radius * 0.26);
    graphics.lineStyle(2, 0xf7fbff, 0.75);
    for (let index = 0; index < 4; index += 1) {
      const angle = ((frame + index) / 4) * Math.PI * 2;
      graphics.lineBetween(x, y, x + Math.cos(angle) * radius * 0.62, y + Math.sin(angle) * radius * 0.62);
    }
  }

  private drawBackground(): void {
    const graphics = this.add.graphics();
    graphics.setDepth(-18);
    graphics.fillStyle(0xb8e7ff, 0.1);
    graphics.fillRect(0, 0, WORLD.width, WORLD.height);
    graphics.fillStyle(0xffffff, 0.18);
    graphics.fillEllipse(640, 640, 1100, 120);
    graphics.fillStyle(0x8dd28b, 0.18);
    graphics.fillEllipse(280, 675, 640, 120);
    graphics.fillEllipse(1000, 670, 680, 130);
    this.drawLogo();
  }

  private drawLogo(): void {
    this.logoGroup?.destroy(true);

    const group = this.add.container(WORLD.width / 2, 34);
    group.setDepth(18);

    const halo = this.add.graphics();
    halo.fillStyle(0xffffff, 0.34);
    halo.fillRoundedRect(-270, -22, 540, 54, 18);
    halo.lineStyle(4, 0xffffff, 0.46);
    halo.beginPath();
    halo.arc(-152, 35, 46, Phaser.Math.DegToRad(205), Phaser.Math.DegToRad(335), false);
    halo.strokePath();
    halo.lineStyle(4, 0xf26b8a, 0.8);
    halo.beginPath();
    halo.arc(152, 35, 46, Phaser.Math.DegToRad(205), Phaser.Math.DegToRad(335), false);
    halo.strokePath();

    const shadow = this.add
      .text(3, 4, 'OVER THE RAINBOW', {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '31px',
        fontStyle: 'bold',
        color: '#7c3d2a',
        stroke: '#ffffff',
        strokeThickness: 5,
      })
      .setOrigin(0.5, 0.5)
      .setAlpha(0.38);
    const title = this.add
      .text(0, 0, 'OVER THE RAINBOW', {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '31px',
        fontStyle: 'bold',
        color: '#ffd75a',
        stroke: '#8a4730',
        strokeThickness: 5,
      })
      .setOrigin(0.5, 0.5);

    group.add([halo, shadow, title]);
    this.logoGroup = group;
  }

  private loadStage(index: number): void {
    this.stageIndex = index;
    this.stage = STAGES[this.stageIndex];
    this.goalState = 'editing';
    this.playElapsedMs = 0;
    this.endOverlayDismissed = false;
    this.glyphCount = 0;
    this.player?.destroy();
    this.playerVisual?.destroy();
    this.drawStageTerrain();
    this.constrainCaretToStage();

    const vehicle = VEHICLES[this.stage.vehicleKey];
    this.player = this.matter.add.image(this.stage.spawn.x, this.stage.spawn.y, 'vehicle-hitbox', undefined, {
      label: `vehicle:${vehicle.key}`,
      isStatic: true,
      mass: vehicle.mass,
      friction: 0.12,
      frictionAir: 0.004,
      restitution: 0.08,
    });
    const displaySize = this.getVehicleDisplaySize(vehicle.key);
    this.player.setDisplaySize(displaySize.width, displaySize.height);
    this.player.setRectangle(displaySize.width, displaySize.height, {
      label: `vehicle:${vehicle.key}`,
      isStatic: true,
      mass: vehicle.mass,
      friction: 0.12,
      frictionAir: 0.004,
      restitution: 0.08,
    });
    this.player.setAlpha(0);
    this.player.setDepth(8);
    this.playerVisual = this.add.image(this.stage.spawn.x, this.stage.spawn.y, `vehicle-${vehicle.key}-0`);
    this.playerVisual.setDisplaySize(displaySize.width, displaySize.height);
    this.playerVisual.setDepth(8);
    this.previousPlayerPosition = { x: this.stage.spawn.x, y: this.stage.spawn.y };

    this.drawRainbow();
    this.drawHud();
  }

  private getVehicleDisplaySize(vehicleKey: VehicleKey): { width: number; height: number } {
    if (vehicleKey === 'walking') return { width: 44, height: 58 };
    if (vehicleKey === 'bicycle') return { width: 86, height: 50 };
    if (vehicleKey === 'smallCar') return { width: 84, height: 48 };
    return { width: 104, height: 44 };
  }

  private updateVehicleArt(): void {
    if (!this.player || !this.playerVisual) return;

    const body = this.player.body as MatterJS.BodyType | undefined;
    const speed = Math.abs(body?.velocity.x ?? 0);
    const isMoving = this.goalState === 'playing' && speed > 0.12;
    const frameDuration = this.stage.vehicleKey === 'walking' ? 150 : 90;
    const frame = isMoving ? Math.floor((this.time.now + this.player.x * 18) / frameDuration) % 4 : 0;
    const key = `vehicle-${this.stage.vehicleKey}-${frame}`;

    if (this.textures.exists(key) && this.playerVisual.texture.key !== key) {
      const displaySize = this.getVehicleDisplaySize(this.stage.vehicleKey);
      this.playerVisual.setTexture(key);
      this.playerVisual.setDisplaySize(displaySize.width, displaySize.height);
    }

    this.playerVisual.setPosition(this.player.x, this.player.y);
    this.playerVisual.setRotation(this.player.rotation);
  }

  private drawStageTerrain(): void {
    this.groundGraphics?.destroy();
    this.groundBodies.forEach((body) => this.matter.world.remove(body));
    this.groundBodies = [];

    const graphics = this.add.graphics();
    graphics.setDepth(1);
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
      this.drawGroundSegmentDetails(graphics, left, top, segment.width, isCanyon, isTerrace || isBrokenBridge);

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

  private drawGroundSegmentDetails(
    graphics: Phaser.GameObjects.Graphics,
    left: number,
    top: number,
    width: number,
    isCanyon: boolean,
    isDry: boolean,
  ): void {
    graphics.lineStyle(4, isCanyon ? 0x8f6c42 : isDry ? 0x9d7a3e : 0x5fa974, 0.55);
    graphics.lineBetween(left, top + 3, left + width, top + 3);

    for (let x = left + 16; x < left + width - 8; x += 34) {
      const sway = Math.sin(x * 0.05) * 4;
      const grassColor = isCanyon ? 0x9baa60 : isDry ? 0xa9a85f : 0x5aae6e;
      graphics.lineStyle(2, grassColor, 0.62);
      graphics.lineBetween(x, top + 7, x + sway, top - 9);
      graphics.lineBetween(x + 5, top + 9, x + 2 + sway * 0.6, top - 5);

      if (!isCanyon && x % 68 < 35) {
        graphics.fillStyle(x % 3 === 0 ? 0xffe47a : 0xf68db4, 0.78);
        graphics.fillCircle(x + 10, top - 5, 3);
        graphics.fillStyle(0xffffff, 0.66);
        graphics.fillCircle(x + 14, top - 7, 2);
      }
    }

    graphics.fillStyle(isCanyon ? 0x56413a : 0x6d7b4a, 0.22);
    for (let x = left + 26; x < left + width - 18; x += 82) {
      graphics.fillEllipse(x, top + 36 + Math.sin(x) * 4, 24, 9);
    }
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
    const advanceWidth = this.estimateGlyphWidth(char, caret.glyphSize);
    const physicsWidth = this.estimateGlyphPhysicsWidth(char, caret.glyphSize, advanceWidth);
    const plan = createGlyphPlan(
      { getContours: () => [] },
      {
        char,
        fontKey: 'system-serif',
        size: caret.glyphSize,
        width: physicsWidth,
        x: caret.position.x + physicsWidth / 2,
        y: caret.position.y,
      },
    );

    this.spawnGlyphFromPlan(plan, advanceWidth, caret.position);
  }

  private spawnGlyphFromPlan(plan: GlyphPlan, visualWidth: number, caretStart: Point): void {
    const text = this.add.text(plan.origin.x, plan.origin.y - plan.size / 2, plan.char, {
      fontFamily: '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", Georgia, serif',
      fontSize: `${plan.size}px`,
      color: '#29395f',
      stroke: '#ffffff',
      strokeThickness: 4,
    });
    const originX = text.width > 0 ? (plan.origin.x - caretStart.x) / text.width : 0.5;
    text.setOrigin(originX, 0.5);
    this.glyphs.push(text);
    this.pendingGlyphs.add(text);
    this.glyphPlans.set(text, plan);
    this.glyphCaretStarts.set(text, { ...caretStart });
    this.glyphCount = this.glyphs.length;
    this.caret.advanceInline(visualWidth + Math.max(2, plan.size * LETTER_GAP_RATIO));
    this.constrainCaretToStage();
  }

  private estimateGlyphWidth(char: string, size: number): number {
    if (char === '/' || char === '\\') return size * 0.42;
    if (char === 'A' || char === 'V' || char === 'v' || char === '^') return size;
    if (/[\u3130-\u318f\uac00-\ud7a3]/u.test(char)) return size * 0.92;
    if (/[ilI1|.,'!:;]/u.test(char)) return size * 0.3;
    if (/[mwMW@#%&]/u.test(char)) return size * 0.82;
    if (/[A-Z0-9]/u.test(char)) return size * 0.62;
    return size * 0.54;
  }

  private estimateGlyphPhysicsWidth(char: string, size: number, advanceWidth: number): number {
    if (char === '/' || char === '\\') return size * 2;
    return advanceWidth;
  }

  private releasePendingGlyphs(): void {
    if (!this.canEditWorld()) return;

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
    this.constrainCaretToStage();
  }

  private moveCaretFromKeyboard(dx: number, dy: number): void {
    const caret = this.caret.snapshot();
    const step = Math.max(4, Math.round(caret.glyphSize * CARET_KEY_STEP_RATIO));
    this.clearGlyphSelection();
    this.placeCaretAt({ x: caret.position.x + dx * step, y: caret.position.y + dy * step });
  }

  private startVehicle(): void {
    if (this.goalState === 'editing') {
      const vehicle = VEHICLES[this.stage.vehicleKey];
      this.playElapsedMs = 0;
      this.endOverlayDismissed = false;
      this.goalState = 'playing';
      this.setPlayerStatic(false);
      this.player?.setVelocity(vehicle.maxSpeed * LAUNCH_SPEED_SCALE, -0.25);
      this.player?.setAngularVelocity(LAUNCH_ANGULAR_SPEED);
    }
  }

  private finishStage(nextState: 'won' | 'failed'): void {
    if (this.goalState === nextState) return;

    this.goalState = nextState;
    this.playElapsedMs = nextState === 'failed' ? PLAY_LIMIT_MS : this.playElapsedMs;
    this.endOverlayDismissed = false;
    this.freezeStagePhysics();
  }

  private freezeStagePhysics(): void {
    this.freezeBody(this.player);

    for (const glyph of this.glyphs) {
      if (glyph.body) this.freezeBody(glyph);
    }
  }

  private freezeBody(gameObject?: Phaser.Physics.Matter.Image | Phaser.GameObjects.Text): void {
    const body = gameObject?.body as MatterJS.BodyType | undefined;
    if (!body) return;

    this.matter.body.setVelocity(body, { x: 0, y: 0 });
    this.matter.body.setAngularVelocity(body, 0);
    this.matter.body.setStatic(body, true);
    this.wakeBody(body);
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
      const caretStart = this.glyphCaretStarts.get(glyph);
      this.pendingGlyphs.delete(glyph);
      this.glyphPlans.delete(glyph);
      this.glyphCaretStarts.delete(glyph);
      glyph.destroy();
      if (caretStart) this.placeCaretAt(caretStart);
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
    const firstSelected = this.glyphs.find((glyph) => selected.has(glyph));
    const caretStart = firstSelected ? this.glyphCaretStarts.get(firstSelected) : undefined;

    this.glyphs = this.glyphs.filter((glyph) => {
      if (!selected.has(glyph)) return true;

      this.pendingGlyphs.delete(glyph);
      this.glyphPlans.delete(glyph);
      this.glyphCaretStarts.delete(glyph);
      glyph.destroy();
      return false;
    });
    this.selectedGlyphs.clear();
    this.glyphCount = this.glyphs.length;
    if (caretStart) this.placeCaretAt(caretStart);
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
    this.updateVehicleArt();
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
    this.glyphCaretStarts.clear();
    this.selectedGlyphs.clear();
    this.glyphCount = 0;
  }

  private drawHud(): void {
    this.refreshUi();

    const vehicle = VEHICLES[this.stage.vehicleKey];
    const label = `${this.stage.title} / ${vehicle.label}`;

    if (!this.stageLabel) {
      this.stageLabel = this.add.text(20, 66, label, {
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

  private refreshUi(): void {
    const isEnded = this.goalState === 'won' || this.goalState === 'failed';

    if (this.startButton) this.startButton.disabled = this.goalState !== 'editing';
    if (this.undoButton) this.undoButton.disabled = isEnded;
    if (this.resetButton) this.resetButton.disabled = isEnded;

    if (!this.endOverlay || !this.endOverlayTitle || !this.nextStageButton || !this.replayButton || !this.closeButton) return;

    const shouldShowOverlay = isEnded && !this.endOverlayDismissed;
    this.endOverlay.hidden = !shouldShowOverlay;
    this.endOverlayTitle.textContent = this.goalState === 'won' ? 'Clear! Over the Rainbow!' : 'Time up!';

    const canAdvance = this.goalState === 'won';
    this.nextStageButton.hidden = !canAdvance;
    this.nextStageButton.disabled = !canAdvance;
    this.replayButton.hidden = false;
    this.replayButton.disabled = !isEnded;
    this.closeButton.hidden = this.goalState !== 'failed';
    this.closeButton.disabled = this.goalState !== 'failed';
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
    graphics.setDepth(5);
    this.rainbowGraphics = graphics;
    this.passLine = this.add.rectangle(rainbow.centerX, rainbow.passTopY, rainbow.width, 3, 0xffffff, 0.35).setDepth(4);
    this.rainbowReveal = 0;
    this.renderRainbow(0);
    this.tweens.killTweensOf(this);
    this.tweens.add({
      targets: this,
      rainbowReveal: 1,
      duration: 980,
      ease: 'Cubic.easeOut',
      onUpdate: () => this.renderRainbow(this.rainbowReveal),
      onComplete: () => this.renderRainbow(1),
    });
  }

  private renderRainbow(reveal: number): void {
    const graphics = this.rainbowGraphics;
    if (!graphics) return;

    const { rainbow } = this.stage;
    const radius = rainbow.width * 0.82;
    const baseY = rainbow.centerY + rainbow.height * 0.27;
    const centerAngle = 270;
    const span = 180 * Phaser.Math.Clamp(reveal, 0, 1);
    const startAngle = Phaser.Math.DegToRad(centerAngle - span / 2);
    const endAngle = Phaser.Math.DegToRad(centerAngle + span / 2);
    const colors = [0xf34d6a, 0xff8a3d, 0xffd84f, 0x63d76e, 0x46c5ff, 0x597cff, 0x9b65ff];

    graphics.clear();
    graphics.lineStyle(34, 0xffffff, 0.18 * reveal);
    graphics.beginPath();
    graphics.arc(rainbow.centerX, baseY, radius + 8, startAngle, endAngle, false);
    graphics.strokePath();

    colors.forEach((color, index) => {
      graphics.lineStyle(10, color, 0.96);
      graphics.beginPath();
      graphics.arc(rainbow.centerX, baseY, radius - index * 7, startAngle, endAngle, false);
      graphics.strokePath();
    });

    if (reveal > 0.82) {
      const cloudAlpha = Phaser.Math.Clamp((reveal - 0.82) / 0.18, 0, 1);
      this.drawRainbowCloud(graphics, rainbow.centerX - radius, baseY, cloudAlpha);
      this.drawRainbowCloud(graphics, rainbow.centerX + radius, baseY, cloudAlpha);
    }

    const sparkleAlpha = 0.45 * reveal;
    graphics.fillStyle(0xffffff, sparkleAlpha);
    for (const sparkle of [
      { x: -0.42, y: -0.2, size: 5 },
      { x: -0.18, y: -0.46, size: 3 },
      { x: 0.24, y: -0.42, size: 4 },
      { x: 0.45, y: -0.08, size: 3 },
    ]) {
      const x = rainbow.centerX + sparkle.x * radius;
      const y = baseY - radius * 0.66 + sparkle.y * rainbow.height;
      graphics.fillTriangle(x, y - sparkle.size * 1.6, x + sparkle.size, y, x, y + sparkle.size * 1.6);
      graphics.fillTriangle(x, y - sparkle.size * 1.6, x - sparkle.size, y, x, y + sparkle.size * 1.6);
    }
  }

  private drawRainbowCloud(graphics: Phaser.GameObjects.Graphics, x: number, y: number, alpha: number): void {
    graphics.fillStyle(0xffffff, 0.86 * alpha);
    graphics.fillCircle(x - 28, y + 4, 22);
    graphics.fillCircle(x, y - 5, 29);
    graphics.fillCircle(x + 31, y + 6, 22);
    graphics.fillEllipse(x, y + 17, 82, 28);
    graphics.fillStyle(0xbcd7ee, 0.3 * alpha);
    graphics.fillEllipse(x + 8, y + 20, 62, 12);
  }
}
