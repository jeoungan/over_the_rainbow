# Over the Rainbow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first playable browser version of `over the rainbow`: a Phaser 3 + Matter.js physics puzzle where Korean and English glyphs become physical objects that help a vehicle pass over a rainbow.

**Architecture:** Keep game rules in small TypeScript modules with unit tests, then wire them into a Phaser scene. The Phaser scene owns rendering and Matter bodies; pure modules own stage data, input intents, caret state, vehicle tuning, glyph planning, goal checks, and test hooks.

**Tech Stack:** TypeScript, Vite, Phaser 3, Matter.js through Phaser, opentype.js, poly-decomp, Vitest, Playwright.

---

## Scope Check

The approved spec is one coherent first playable version, not multiple independent products. This plan creates a single game with a tutorial, three stages, typed glyph physics, vehicle movement, Start/Reset/Undo UI, test hooks, and browser verification.

## File Structure

- `package.json`: scripts and dependencies.
- `tsconfig.json`: TypeScript compiler settings.
- `vite.config.ts`: local dev server and build settings.
- `vitest.config.ts`: unit test settings.
- `playwright.config.ts`: browser test settings.
- `index.html`: single game mount.
- `src/main.ts`: Phaser boot entry.
- `src/styles.css`: page-level layout and canvas host styling.
- `src/game/types.ts`: shared game types.
- `src/game/stages.ts`: vehicle and stage data.
- `src/game/input/TextInputController.ts`: DOM keyboard event to game intent translation.
- `src/game/caret/CaretController.ts`: caret position and glyph-size state.
- `src/game/goal/GoalDetector.ts`: rainbow crossing success logic.
- `src/game/vehicle/VehicleController.ts`: vehicle tuning and input force helpers.
- `src/game/glyph/GlyphPhysicsFactory.ts`: glyph outline planning, simplification, and fallback descriptors.
- `src/game/glyph/OpenTypeFontAdapter.ts`: opentype.js outline adapter.
- `src/game/scenes/GameScene.ts`: Phaser scene, rendering, Matter bodies, controls, stage loop.
- `src/game/devtools.ts`: `window.render_game_to_text()` and `window.advanceTime(ms)` wiring.
- `src/game/**/*.test.ts`: unit tests beside the module they cover.
- `tests/e2e/game-smoke.spec.ts`: Playwright smoke test for visible gameplay.

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/styles.css`

- [ ] **Step 1: Create package scripts and dependencies**

Create `package.json`:

```json
{
  "name": "over-the-rainbow",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "verify": "npm run test && npm run build && npm run e2e"
  },
  "dependencies": {
    "opentype.js": "^1.3.4",
    "phaser": "^3.90.0",
    "poly-decomp": "^0.3.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.54.0",
    "@types/opentype.js": "^1.3.8",
    "typescript": "^5.6.3",
    "vite": "^5.4.19",
    "vitest": "^2.1.9"
  }
}
```

- [ ] **Step 2: Create compiler and test config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "moduleResolution": "Bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "tests", "*.config.ts"]
}
```

Create `vite.config.ts`:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: true,
  },
});
```

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

- [ ] **Step 3: Create the game mount**

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>over the rainbow</title>
  </head>
  <body>
    <div id="game-root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Create `src/styles.css`:

```css
:root {
  color: #223047;
  background: #dcecff;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

html,
body,
#game-root {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
}

body {
  min-width: 320px;
}

canvas {
  display: block;
}
```

Create `src/main.ts`:

```ts
import './styles.css';

const root = document.querySelector<HTMLDivElement>('#game-root');

if (!root) {
  throw new Error('Missing #game-root');
}

root.textContent = 'over the rainbow is loading...';
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`

Expected: dependencies install and `package-lock.json` is created.

- [ ] **Step 5: Verify the scaffold**

Run: `npm run build`

Expected: TypeScript and Vite complete without errors and create `dist/`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts playwright.config.ts index.html src/main.ts src/styles.css
git commit -m "chore: scaffold phaser game project"
```

---

### Task 2: Stage And Vehicle Data

**Files:**
- Create: `src/game/types.ts`
- Create: `src/game/stages.ts`
- Create: `src/game/stages.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/game/stages.test.ts`:

```ts
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
      ['tutorial', 'walking'],
      ['stage-1', 'racingCar'],
      ['stage-2', 'smallCar'],
      ['stage-3', 'bicycle'],
    ]);
  });

  it('keeps the first three challenges low and close', () => {
    const playableStages = STAGES.slice(1);
    for (const stage of playableStages) {
      expect(stage.rainbow.centerY).toBeGreaterThanOrEqual(250);
      expect(stage.rainbow.centerX - stage.spawn.x).toBeLessThanOrEqual(680);
    }
  });

  it('retrieves a stage by id', () => {
    expect(getStage('stage-2').vehicleKey).toBe('smallCar');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/game/stages.test.ts`

Expected: FAIL with a module resolution error for `./stages`.

- [ ] **Step 3: Add shared types**

Create `src/game/types.ts`:

```ts
export type VehicleKey = 'walking' | 'bicycle' | 'smallCar' | 'racingCar';

export interface VehicleTuning {
  key: VehicleKey;
  label: string;
  maxSpeed: number;
  acceleration: number;
  climbingForce: number;
  stability: number;
  mass: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface RainbowTarget {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  passTopY: number;
}

export interface StageDefinition {
  id: 'tutorial' | 'stage-1' | 'stage-2' | 'stage-3';
  title: string;
  hint: string;
  vehicleKey: VehicleKey;
  spawn: Point;
  rainbow: RainbowTarget;
  allowLiveTyping: boolean;
}
```

- [ ] **Step 4: Add stage data**

Create `src/game/stages.ts`:

```ts
import type { StageDefinition, VehicleKey, VehicleTuning } from './types';

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
    id: 'tutorial',
    title: 'First letters',
    hint: 'Place a gentle support and walk over the rainbow.',
    vehicleKey: 'walking',
    spawn: { x: 130, y: 610 },
    rainbow: { centerX: 520, centerY: 360, width: 180, height: 120, passTopY: 318 },
    allowLiveTyping: false,
  },
  {
    id: 'stage-1',
    title: 'Fast little dream',
    hint: 'A racing car can climb a short steep word, but it flips easily.',
    vehicleKey: 'racingCar',
    spawn: { x: 130, y: 610 },
    rainbow: { centerX: 610, centerY: 340, width: 180, height: 120, passTopY: 300 },
    allowLiveTyping: false,
  },
  {
    id: 'stage-2',
    title: 'Ordinary engine',
    hint: 'Balance force and stability with a smoother glyph ramp.',
    vehicleKey: 'smallCar',
    spawn: { x: 130, y: 610 },
    rainbow: { centerX: 650, centerY: 350, width: 190, height: 120, passTopY: 310 },
    allowLiveTyping: true,
  },
  {
    id: 'stage-3',
    title: 'Quiet bicycle',
    hint: 'The bicycle needs a careful gentle path over a close rainbow.',
    vehicleKey: 'bicycle',
    spawn: { x: 130, y: 610 },
    rainbow: { centerX: 590, centerY: 350, width: 190, height: 120, passTopY: 310 },
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/game/stages.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/types.ts src/game/stages.ts src/game/stages.test.ts
git commit -m "feat: add stage and vehicle data"
```

---

### Task 3: Text Input Controller

**Files:**
- Create: `src/game/input/TextInputController.ts`
- Create: `src/game/input/TextInputController.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/game/input/TextInputController.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTextInputController } from './TextInputController';

describe('TextInputController', () => {
  it('turns a completed English key into a glyph intent', () => {
    const controller = createTextInputController();
    expect(controller.keyDown({ key: 'A', ctrlKey: false, metaKey: false, repeat: false })).toEqual({
      type: 'glyph',
      value: 'A',
    });
  });

  it('turns Korean composition end into one glyph intent', () => {
    const controller = createTextInputController();
    controller.compositionStart();
    expect(controller.keyDown({ key: 'Process', ctrlKey: false, metaKey: false, repeat: false })).toEqual({ type: 'none' });
    expect(controller.compositionEnd('한')).toEqual({ type: 'glyph', value: '한' });
  });

  it('maps Ctrl+Space to spacing', () => {
    const controller = createTextInputController();
    expect(controller.keyDown({ key: ' ', ctrlKey: true, metaKey: false, repeat: false })).toEqual({ type: 'space' });
  });

  it('maps Backspace to undo and Ctrl+R to start', () => {
    const controller = createTextInputController();
    expect(controller.keyDown({ key: 'Backspace', ctrlKey: false, metaKey: false, repeat: false })).toEqual({ type: 'undo' });
    expect(controller.keyDown({ key: 'r', ctrlKey: true, metaKey: false, repeat: false })).toEqual({ type: 'start' });
  });

  it('ignores repeat and modified text keys', () => {
    const controller = createTextInputController();
    expect(controller.keyDown({ key: 'B', ctrlKey: false, metaKey: false, repeat: true })).toEqual({ type: 'none' });
    expect(controller.keyDown({ key: 'B', ctrlKey: true, metaKey: false, repeat: false })).toEqual({ type: 'none' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/game/input/TextInputController.test.ts`

Expected: FAIL with a module resolution error for `./TextInputController`.

- [ ] **Step 3: Add the controller**

Create `src/game/input/TextInputController.ts`:

```ts
export type GameTextIntent =
  | { type: 'glyph'; value: string }
  | { type: 'space' }
  | { type: 'undo' }
  | { type: 'start' }
  | { type: 'none' };

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  repeat: boolean;
}

export interface TextInputController {
  keyDown(event: KeyLike): GameTextIntent;
  compositionStart(): void;
  compositionEnd(value: string): GameTextIntent;
}

const none: GameTextIntent = { type: 'none' };

export function createTextInputController(): TextInputController {
  let composing = false;

  return {
    keyDown(event) {
      if (event.repeat) return none;

      const commandModifier = event.ctrlKey || event.metaKey;
      const key = event.key;

      if (event.ctrlKey && key === ' ') return { type: 'space' };
      if (key === 'Backspace') return { type: 'undo' };
      if (event.ctrlKey && key.toLowerCase() === 'r') return { type: 'start' };
      if (composing) return none;
      if (commandModifier) return none;
      if (key.length === 1 && key !== ' ') return { type: 'glyph', value: key };

      return none;
    },
    compositionStart() {
      composing = true;
    },
    compositionEnd(value) {
      composing = false;
      return value ? { type: 'glyph', value } : none;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/game/input/TextInputController.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/input/TextInputController.ts src/game/input/TextInputController.test.ts
git commit -m "feat: add text input controller"
```

---

### Task 4: Caret Controller

**Files:**
- Create: `src/game/caret/CaretController.ts`
- Create: `src/game/caret/CaretController.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/game/caret/CaretController.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createCaretController } from './CaretController';

describe('CaretController', () => {
  it('places the caret inside world bounds', () => {
    const caret = createCaretController({ width: 1200, height: 720 });
    caret.placeAt({ x: 300, y: 250 });
    expect(caret.snapshot().position).toEqual({ x: 300, y: 250 });
  });

  it('clamps the caret to the world', () => {
    const caret = createCaretController({ width: 1200, height: 720 });
    caret.placeAt({ x: -20, y: 900 });
    expect(caret.snapshot().position).toEqual({ x: 0, y: 720 });
  });

  it('changes glyph size with wheel deltas', () => {
    const caret = createCaretController({ width: 1200, height: 720 });
    caret.changeSizeFromWheel(-120);
    expect(caret.snapshot().glyphSize).toBe(64);
    caret.changeSizeFromWheel(120);
    expect(caret.snapshot().glyphSize).toBe(56);
  });

  it('keeps glyph size in readable bounds', () => {
    const caret = createCaretController({ width: 1200, height: 720 });
    for (let i = 0; i < 20; i += 1) caret.changeSizeFromWheel(-120);
    expect(caret.snapshot().glyphSize).toBe(144);
    for (let i = 0; i < 40; i += 1) caret.changeSizeFromWheel(120);
    expect(caret.snapshot().glyphSize).toBe(24);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/game/caret/CaretController.test.ts`

Expected: FAIL with a module resolution error for `./CaretController`.

- [ ] **Step 3: Add the controller**

Create `src/game/caret/CaretController.ts`:

```ts
import type { Point } from '../types';

export interface WorldBounds {
  width: number;
  height: number;
}

export interface CaretSnapshot {
  position: Point;
  glyphSize: number;
}

export interface CaretController {
  placeAt(point: Point): void;
  changeSizeFromWheel(deltaY: number): void;
  snapshot(): CaretSnapshot;
}

const MIN_SIZE = 24;
const MAX_SIZE = 144;
const SIZE_STEP = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function createCaretController(bounds: WorldBounds): CaretController {
  const state: CaretSnapshot = {
    position: { x: 240, y: 420 },
    glyphSize: 56,
  };

  return {
    placeAt(point) {
      state.position = {
        x: clamp(point.x, 0, bounds.width),
        y: clamp(point.y, 0, bounds.height),
      };
    },
    changeSizeFromWheel(deltaY) {
      const direction = deltaY < 0 ? 1 : -1;
      state.glyphSize = clamp(state.glyphSize + direction * SIZE_STEP, MIN_SIZE, MAX_SIZE);
    },
    snapshot() {
      return {
        position: { ...state.position },
        glyphSize: state.glyphSize,
      };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/game/caret/CaretController.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/caret/CaretController.ts src/game/caret/CaretController.test.ts
git commit -m "feat: add caret controller"
```

---

### Task 5: Goal Detector

**Files:**
- Create: `src/game/goal/GoalDetector.ts`
- Create: `src/game/goal/GoalDetector.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/game/goal/GoalDetector.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { didPassOverRainbow } from './GoalDetector';
import type { RainbowTarget } from '../types';

const rainbow: RainbowTarget = {
  centerX: 600,
  centerY: 350,
  width: 180,
  height: 120,
  passTopY: 310,
};

describe('GoalDetector', () => {
  it('succeeds only after crossing from left to right above the rainbow', () => {
    expect(didPassOverRainbow({ x: 480, y: 290 }, { x: 705, y: 285 }, rainbow)).toBe(true);
  });

  it('does not succeed when the vehicle merely touches the rainbow side', () => {
    expect(didPassOverRainbow({ x: 480, y: 340 }, { x: 705, y: 340 }, rainbow)).toBe(false);
  });

  it('does not succeed before the vehicle exits the right side', () => {
    expect(didPassOverRainbow({ x: 480, y: 290 }, { x: 620, y: 285 }, rainbow)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/game/goal/GoalDetector.test.ts`

Expected: FAIL with a module resolution error for `./GoalDetector`.

- [ ] **Step 3: Add the detector**

Create `src/game/goal/GoalDetector.ts`:

```ts
import type { Point, RainbowTarget } from '../types';

export function didPassOverRainbow(previous: Point, current: Point, rainbow: RainbowTarget): boolean {
  const leftEdge = rainbow.centerX - rainbow.width / 2;
  const rightEdge = rainbow.centerX + rainbow.width / 2;
  const crossedFromLeft = previous.x < leftEdge && current.x > rightEdge;
  const stayedAbovePassLine = previous.y <= rainbow.passTopY && current.y <= rainbow.passTopY;
  return crossedFromLeft && stayedAbovePassLine;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/game/goal/GoalDetector.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/goal/GoalDetector.ts src/game/goal/GoalDetector.test.ts
git commit -m "feat: add rainbow goal detector"
```

---

### Task 6: Vehicle Controller

**Files:**
- Create: `src/game/vehicle/VehicleController.ts`
- Create: `src/game/vehicle/VehicleController.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/game/vehicle/VehicleController.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/game/vehicle/VehicleController.test.ts`

Expected: FAIL with a module resolution error for `./VehicleController`.

- [ ] **Step 3: Add drive helper**

Create `src/game/vehicle/VehicleController.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/game/vehicle/VehicleController.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/vehicle/VehicleController.ts src/game/vehicle/VehicleController.test.ts
git commit -m "feat: add vehicle drive tuning"
```

---

### Task 7: Glyph Physics Planning

**Files:**
- Create: `src/game/glyph/GlyphPhysicsFactory.ts`
- Create: `src/game/glyph/GlyphPhysicsFactory.test.ts`
- Create: `src/game/glyph/OpenTypeFontAdapter.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/game/glyph/GlyphPhysicsFactory.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createGlyphPlan, simplifyPolygon } from './GlyphPhysicsFactory';
import type { FontOutlineAdapter } from './GlyphPhysicsFactory';

const adapter: FontOutlineAdapter = {
  getContours() {
    return [
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
      ],
    ];
  },
};

describe('GlyphPhysicsFactory', () => {
  it('creates an outline glyph plan when contour data exists', () => {
    const plan = createGlyphPlan(adapter, { char: 'A', fontKey: 'serif', size: 72, x: 100, y: 200 });
    expect(plan.kind).toBe('outline');
    expect(plan.parts).toHaveLength(1);
    expect(plan.parts[0].length).toBeGreaterThanOrEqual(4);
  });

  it('falls back to a box when contour data is missing', () => {
    const emptyAdapter: FontOutlineAdapter = { getContours: () => [] };
    const plan = createGlyphPlan(emptyAdapter, { char: '한', fontKey: 'serif', size: 72, x: 100, y: 200 });
    expect(plan.kind).toBe('fallback-box');
    expect(plan.parts[0]).toEqual([
      { x: -36, y: -72 },
      { x: 36, y: -72 },
      { x: 36, y: 0 },
      { x: -36, y: 0 },
    ]);
  });

  it('simplifies dense polygons while keeping corners', () => {
    const simplified = simplifyPolygon(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      4,
    );
    expect(simplified).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/game/glyph/GlyphPhysicsFactory.test.ts`

Expected: FAIL with a module resolution error for `./GlyphPhysicsFactory`.

- [ ] **Step 3: Add glyph planning**

Create `src/game/glyph/GlyphPhysicsFactory.ts`:

```ts
import type { Point } from '../types';

export interface GlyphRequest {
  char: string;
  fontKey: string;
  size: number;
  x: number;
  y: number;
}

export interface FontOutlineAdapter {
  getContours(char: string, fontKey: string, size: number): Point[][];
}

export interface GlyphPlan {
  kind: 'outline' | 'fallback-box';
  char: string;
  fontKey: string;
  size: number;
  origin: Point;
  parts: Point[][];
}

export function simplifyPolygon(points: Point[], minDistance: number): Point[] {
  return points.filter((point, index) => {
    if (index === 0 || index === points.length - 1) return true;
    const previous = points[index - 1];
    const next = points[index + 1];
    const distanceFromPrevious = Math.hypot(point.x - previous.x, point.y - previous.y);
    const changesDirection = Math.sign(point.x - previous.x) !== Math.sign(next.x - point.x)
      || Math.sign(point.y - previous.y) !== Math.sign(next.y - point.y);
    return distanceFromPrevious >= minDistance || changesDirection;
  });
}

export function createGlyphPlan(adapter: FontOutlineAdapter, request: GlyphRequest): GlyphPlan {
  const contours = adapter
    .getContours(request.char, request.fontKey, request.size)
    .map((contour) => simplifyPolygon(contour, Math.max(3, request.size / 24)))
    .filter((contour) => contour.length >= 3);

  if (contours.length === 0) {
    const halfWidth = request.size / 2;
    return {
      kind: 'fallback-box',
      char: request.char,
      fontKey: request.fontKey,
      size: request.size,
      origin: { x: request.x, y: request.y },
      parts: [[
        { x: -halfWidth, y: -request.size },
        { x: halfWidth, y: -request.size },
        { x: halfWidth, y: 0 },
        { x: -halfWidth, y: 0 },
      ]],
    };
  }

  return {
    kind: 'outline',
    char: request.char,
    fontKey: request.fontKey,
    size: request.size,
    origin: { x: request.x, y: request.y },
    parts: contours,
  };
}
```

- [ ] **Step 4: Add opentype adapter**

Create `src/game/glyph/OpenTypeFontAdapter.ts`:

```ts
import opentype from 'opentype.js';
import type { Point } from '../types';
import type { FontOutlineAdapter } from './GlyphPhysicsFactory';

export class OpenTypeFontAdapter implements FontOutlineAdapter {
  private readonly fonts = new Map<string, opentype.Font>();

  register(fontKey: string, font: opentype.Font): void {
    this.fonts.set(fontKey, font);
  }

  getContours(char: string, fontKey: string, size: number): Point[][] {
    const font = this.fonts.get(fontKey);
    if (!font) return [];

    const glyph = font.charToGlyph(char);
    const path = glyph.getPath(0, 0, size);
    const contours: Point[][] = [];
    let current: Point[] = [];

    for (const command of path.commands) {
      if (command.type === 'M') {
        if (current.length > 0) contours.push(current);
        current = [{ x: command.x, y: command.y }];
      } else if (command.type === 'L') {
        current.push({ x: command.x, y: command.y });
      } else if (command.type === 'Q') {
        current.push({ x: command.x1, y: command.y1 });
        current.push({ x: command.x, y: command.y });
      } else if (command.type === 'C') {
        current.push({ x: command.x1, y: command.y1 });
        current.push({ x: command.x2, y: command.y2 });
        current.push({ x: command.x, y: command.y });
      } else if (command.type === 'Z') {
        if (current.length > 0) contours.push(current);
        current = [];
      }
    }

    if (current.length > 0) contours.push(current);
    return contours;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/game/glyph/GlyphPhysicsFactory.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/glyph/GlyphPhysicsFactory.ts src/game/glyph/GlyphPhysicsFactory.test.ts src/game/glyph/OpenTypeFontAdapter.ts
git commit -m "feat: add glyph physics planning"
```

---

### Task 8: Devtools State Hook

**Files:**
- Create: `src/game/devtools.ts`
- Create: `src/game/devtools.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/game/devtools.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createGameStateSnapshot, serializeGameState } from './devtools';

describe('devtools state', () => {
  it('serializes concise gameplay state', () => {
    const text = serializeGameState(createGameStateSnapshot({
      stageId: 'stage-1',
      vehicleType: 'racingCar',
      player: { x: 120, y: 500, vx: 1.5, vy: -0.2 },
      caret: { x: 300, y: 240, glyphSize: 64 },
      glyphCount: 3,
      goalState: 'playing',
    }));

    expect(JSON.parse(text)).toEqual({
      stageId: 'stage-1',
      vehicleType: 'racingCar',
      player: { x: 120, y: 500, vx: 1.5, vy: -0.2 },
      caret: { x: 300, y: 240, glyphSize: 64 },
      glyphCount: 3,
      goalState: 'playing',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/game/devtools.test.ts`

Expected: FAIL with a module resolution error for `./devtools`.

- [ ] **Step 3: Add state serialization**

Create `src/game/devtools.ts`:

```ts
import type { StageDefinition, VehicleKey } from './types';

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => void;
  }
}

export type GoalState = 'editing' | 'playing' | 'won' | 'failed';

export interface GameStateSnapshotInput {
  stageId: StageDefinition['id'];
  vehicleType: VehicleKey;
  player: { x: number; y: number; vx: number; vy: number };
  caret: { x: number; y: number; glyphSize: number };
  glyphCount: number;
  goalState: GoalState;
}

export type GameStateSnapshot = GameStateSnapshotInput;

export function createGameStateSnapshot(input: GameStateSnapshotInput): GameStateSnapshot {
  return {
    stageId: input.stageId,
    vehicleType: input.vehicleType,
    player: { ...input.player },
    caret: { ...input.caret },
    glyphCount: input.glyphCount,
    goalState: input.goalState,
  };
}

export function serializeGameState(snapshot: GameStateSnapshot): string {
  return JSON.stringify(snapshot);
}

export function installGameDevtools(getSnapshot: () => GameStateSnapshot, advanceTime: (ms: number) => void): void {
  Object.assign(window, {
    render_game_to_text: () => serializeGameState(getSnapshot()),
    advanceTime,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/game/devtools.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/devtools.ts src/game/devtools.test.ts
git commit -m "feat: add game devtools serialization"
```

---

### Task 9: Phaser Scene Shell

**Files:**
- Modify: `src/main.ts`
- Create: `src/game/scenes/GameScene.ts`

- [ ] **Step 1: Write the first browser smoke test**

Create `tests/e2e/game-smoke.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('renders the game canvas and exposes text state', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  const textState = await page.evaluate(() => window.render_game_to_text());
  const state = JSON.parse(textState);
  expect(state.stageId).toBe('tutorial');
  expect(state.vehicleType).toBe('walking');
  expect(state.goalState).toBe('editing');
});
```

- [ ] **Step 2: Run browser test to verify it fails**

Run: `npm run e2e -- tests/e2e/game-smoke.spec.ts`

Expected: FAIL because no Phaser canvas is mounted yet.

- [ ] **Step 3: Create the scene shell**

Create `src/game/scenes/GameScene.ts`:

```ts
import Phaser from 'phaser';
import { createCaretController } from '../caret/CaretController';
import { installGameDevtools } from '../devtools';
import { STAGES, VEHICLES } from '../stages';
import type { StageDefinition } from '../types';

const WORLD = { width: 1280, height: 720 };

export class GameScene extends Phaser.Scene {
  private stageIndex = 0;
  private stage: StageDefinition = STAGES[0];
  private caret = createCaretController(WORLD);
  private glyphCount = 0;
  private goalState: 'editing' | 'playing' | 'won' | 'failed' = 'editing';
  private player?: Phaser.Physics.Matter.Image;

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
        this.matter.world.engine.timing.timestamp += ms;
        this.game.loop.step();
      },
    );
  }

  private ensureGeneratedTextures(): void {
    if (this.textures.exists('vehicle-rect')) return;
    const graphics = this.make.graphics({ x: 0, y: 0, add: false });
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
    const { rainbow } = this.stage;
    const graphics = this.add.graphics();
    const colors = [0xf26b8a, 0xffc857, 0x63c77a, 0x5aa7ff, 0x9b6bff];
    colors.forEach((color, index) => {
      graphics.lineStyle(8, color, 0.95);
      graphics.strokeEllipse(rainbow.centerX, rainbow.centerY + index * 6, rainbow.width, rainbow.height);
    });
    this.add.rectangle(rainbow.centerX, rainbow.passTopY, rainbow.width, 4, 0xffffff, 0.45);
  }
}
```

- [ ] **Step 4: Boot Phaser**

Replace `src/main.ts` with:

```ts
import Phaser from 'phaser';
import './styles.css';
import { GameScene } from './game/scenes/GameScene';

const root = document.querySelector<HTMLDivElement>('#game-root');

if (!root) {
  throw new Error('Missing #game-root');
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: root,
  width: 1280,
  height: 720,
  backgroundColor: '#dcecff',
  physics: {
    default: 'matter',
    matter: {
      gravity: { y: 1.15 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [GameScene],
});
```

- [ ] **Step 5: Run browser test to verify it passes**

Run: `npm run e2e -- tests/e2e/game-smoke.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/game/scenes/GameScene.ts src/game/devtools.ts tests/e2e/game-smoke.spec.ts
git commit -m "feat: boot playable scene shell"
```

---

### Task 10: Gameplay Integration

**Files:**
- Modify: `src/game/scenes/GameScene.ts`
- Modify: `tests/e2e/game-smoke.spec.ts`

- [ ] **Step 1: Extend browser test for typing, Start, and movement**

Replace `tests/e2e/game-smoke.spec.ts` with:

```ts
import { expect, test } from '@playwright/test';

test('renders the game canvas and exposes text state', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();

  const textState = await page.evaluate(() => window.render_game_to_text());
  const state = JSON.parse(textState);
  expect(state.stageId).toBe('tutorial');
  expect(state.vehicleType).toBe('walking');
  expect(state.goalState).toBe('editing');
});

test('creates a glyph, starts the vehicle, and moves right', async ({ page }) => {
  await page.goto('/');
  await page.mouse.click(360, 360);
  await page.keyboard.press('A');

  let state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.glyphCount).toBe(1);

  await page.keyboard.press('Control+R');
  await page.keyboard.down('d');
  await page.evaluate(() => window.advanceTime(600));
  await page.keyboard.up('d');

  state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.goalState).toBe('playing');
  expect(state.player.x).toBeGreaterThan(130);
});
```

- [ ] **Step 2: Run browser test to verify it fails**

Run: `npm run e2e -- tests/e2e/game-smoke.spec.ts`

Expected: FAIL because typing and movement are not wired into `GameScene`.

- [ ] **Step 3: Wire input and simple glyph bodies**

In `src/game/scenes/GameScene.ts`, add imports:

```ts
import { createTextInputController } from '../input/TextInputController';
import { createGlyphPlan } from '../glyph/GlyphPhysicsFactory';
import type { GlyphPlan } from '../glyph/GlyphPhysicsFactory';
import { getVehicleDrive } from '../vehicle/VehicleController';
import { didPassOverRainbow } from '../goal/GoalDetector';
```

Add fields:

```ts
private inputController = createTextInputController();
private activeKeys = { left: false, right: false };
private previousPlayerPosition = { x: 0, y: 0 };
private glyphs: Phaser.GameObjects.Text[] = [];
```

Add this helper method:

```ts
private createGlyph(char: string): void {
  const caret = this.caret.snapshot();
  const plan = createGlyphPlan({ getContours: () => [] }, {
    char,
    fontKey: 'system-serif',
    size: caret.glyphSize,
    x: caret.position.x,
    y: caret.position.y,
  });
  this.spawnGlyphFromPlan(plan);
}

private spawnGlyphFromPlan(plan: GlyphPlan): void {
  const text = this.add.text(plan.origin.x, plan.origin.y - plan.size, plan.char, {
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
```

Add this input setup in `create()` after `this.loadStage(0)`:

```ts
this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
  this.caret.placeAt({ x: pointer.worldX, y: pointer.worldY });
});
this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: unknown[], _dx: number, dy: number) => {
  this.caret.changeSizeFromWheel(dy);
});
window.addEventListener('keydown', (event) => {
  const intent = this.inputController.keyDown({
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    repeat: event.repeat,
  });
  if (intent.type !== 'none') event.preventDefault();
  if (intent.type === 'glyph') this.createGlyph(intent.value);
  if (intent.type === 'space') this.caret.placeAt({ x: this.caret.snapshot().position.x + this.caret.snapshot().glyphSize, y: this.caret.snapshot().position.y });
  if (intent.type === 'undo') this.undoGlyph();
  if (intent.type === 'start') this.startVehicle();
  if (event.key.toLowerCase() === 'a') this.activeKeys.left = true;
  if (event.key.toLowerCase() === 'd') this.activeKeys.right = true;
});
window.addEventListener('keyup', (event) => {
  if (event.key.toLowerCase() === 'a') this.activeKeys.left = false;
  if (event.key.toLowerCase() === 'd') this.activeKeys.right = false;
});
```

Add methods:

```ts
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
```

Add update loop:

```ts
update(): void {
  if (!this.player) return;

  const previous = { ...this.previousPlayerPosition };
  this.previousPlayerPosition = { x: this.player.x, y: this.player.y };

  if (this.goalState === 'playing') {
    const vehicle = VEHICLES[this.stage.vehicleKey];
    const direction = this.activeKeys.right ? 'right' : this.activeKeys.left ? 'left' : 'none';
    const drive = getVehicleDrive(vehicle, direction, 0);
    this.player.applyForce({ x: drive.forceX, y: 0 });
    this.player.setAngularVelocity(this.player.body.angularVelocity * (1 - drive.angularDamping));
    if (Math.abs(this.player.body.velocity.x) > drive.maxSpeed) {
      this.player.setVelocityX(Math.sign(this.player.body.velocity.x) * drive.maxSpeed);
    }
  }

  if (this.goalState === 'playing' && didPassOverRainbow(previous, { x: this.player.x, y: this.player.y }, this.stage.rainbow)) {
    this.goalState = 'won';
  }
}
```

In `loadStage`, after creating `this.player`, set:

```ts
this.previousPlayerPosition = { x: this.stage.spawn.x, y: this.stage.spawn.y };
```

- [ ] **Step 4: Run tests to verify integration**

Run: `npm run test && npm run e2e -- tests/e2e/game-smoke.spec.ts`

Expected: unit tests PASS and browser smoke tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/scenes/GameScene.ts tests/e2e/game-smoke.spec.ts
git commit -m "feat: wire glyph typing and vehicle movement"
```

---

### Task 11: UI Buttons, Reset, And Stage Loop

**Files:**
- Modify: `src/game/scenes/GameScene.ts`
- Modify: `tests/e2e/game-smoke.spec.ts`

- [ ] **Step 1: Extend browser test for Start button, Undo, and Reset**

Append to `tests/e2e/game-smoke.spec.ts`:

```ts
test('supports visible Start, Undo, and Reset controls', async ({ page }) => {
  await page.goto('/');
  await page.mouse.click(360, 360);
  await page.keyboard.press('H');
  await page.getByText('Undo').click();
  let state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.glyphCount).toBe(0);

  await page.mouse.click(360, 360);
  await page.keyboard.press('H');
  await page.getByText('Start').click();
  state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.goalState).toBe('playing');

  await page.getByText('Reset').click();
  state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.goalState).toBe('editing');
  expect(state.glyphCount).toBe(0);
});
```

- [ ] **Step 2: Run browser test to verify it fails**

Run: `npm run e2e -- tests/e2e/game-smoke.spec.ts`

Expected: FAIL because visible UI buttons do not exist.

- [ ] **Step 3: Add UI buttons**

In `GameScene`, add fields:

```ts
private uiButtons: Phaser.GameObjects.Text[] = [];
```

Add this method:

```ts
private buildUi(): void {
  this.uiButtons.forEach((button) => button.destroy());
  this.uiButtons = [];

  const makeButton = (label: string, x: number, action: () => void) => {
    const button = this.add.text(x, 28, label, {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: '18px',
      color: '#223047',
      backgroundColor: '#ffffff',
      padding: { x: 12, y: 8 },
    });
    button.setInteractive({ useHandCursor: true });
    button.on('pointerdown', action);
    button.setScrollFactor(0);
    this.uiButtons.push(button);
  };

  makeButton('Start', 24, () => this.startVehicle());
  makeButton('Undo', 112, () => this.undoGlyph());
  makeButton('Reset', 198, () => this.resetStage());
}
```

Add reset method:

```ts
private resetStage(): void {
  this.glyphs.forEach((glyph) => glyph.destroy());
  this.glyphs = [];
  this.glyphCount = 0;
  this.loadStage(this.stageIndex);
  this.buildUi();
}
```

Call `this.buildUi();` after `this.loadStage(0);` in `create()`.

- [ ] **Step 4: Run tests to verify buttons pass**

Run: `npm run e2e -- tests/e2e/game-smoke.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/scenes/GameScene.ts tests/e2e/game-smoke.spec.ts
git commit -m "feat: add visible stage controls"
```

---

### Task 12: Visual Polish And Final Verification

**Files:**
- Modify: `src/game/scenes/GameScene.ts`
- Modify: `src/styles.css`
- Modify: `tests/e2e/game-smoke.spec.ts`

- [ ] **Step 1: Add screenshot verification to browser test**

Append to `tests/e2e/game-smoke.spec.ts`:

```ts
test('gameplay screenshot is nonblank after glyph creation', async ({ page }) => {
  await page.goto('/');
  await page.mouse.click(420, 340);
  await page.keyboard.press('O');
  await page.evaluate(() => window.advanceTime(500));
  const screenshot = await page.screenshot();
  expect(screenshot.length).toBeGreaterThan(20_000);
});
```

- [ ] **Step 2: Run screenshot test to verify current baseline**

Run: `npm run e2e -- tests/e2e/game-smoke.spec.ts`

Expected: PASS if the canvas renders visible content, FAIL if the scene is visually blank.

- [ ] **Step 3: Add caret and stage labels**

In `GameScene`, add fields:

```ts
private caretGraphic?: Phaser.GameObjects.Rectangle;
private stageLabel?: Phaser.GameObjects.Text;
```

Add this method:

```ts
private drawHud(): void {
  this.stageLabel?.destroy();
  this.stageLabel = this.add.text(24, 78, `${this.stage.title} / ${VEHICLES[this.stage.vehicleKey].label}`, {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: '18px',
    color: '#223047',
  });
  this.stageLabel.setScrollFactor(0);

  const caret = this.caret.snapshot();
  if (!this.caretGraphic) {
    this.caretGraphic = this.add.rectangle(caret.position.x, caret.position.y, 3, caret.glyphSize, 0x223047, 0.9);
  }
  this.caretGraphic.setPosition(caret.position.x, caret.position.y - caret.glyphSize / 2);
  this.caretGraphic.setSize(3, caret.glyphSize);
}
```

Call `this.drawHud();` at the end of `create()` and at the end of `update()`.

- [ ] **Step 4: Add dreamlike sky details**

In `drawBackground()`, replace the background body with:

```ts
this.add.rectangle(WORLD.width / 2, WORLD.height / 2, WORLD.width, WORLD.height, 0xdcecff);
this.add.rectangle(WORLD.width / 2, 520, WORLD.width, 400, 0xf6e7ff, 0.18);
this.add.ellipse(240, 170, 280, 80, 0xffffff, 0.55);
this.add.ellipse(360, 190, 210, 64, 0xffffff, 0.38);
this.add.ellipse(870, 120, 360, 90, 0xffffff, 0.45);
this.add.ellipse(980, 145, 260, 70, 0xffffff, 0.34);
this.add.rectangle(WORLD.width / 2, 660, WORLD.width, 120, 0x95d0a8);
this.add.rectangle(WORLD.width / 2, 628, WORLD.width, 24, 0xfff4c7, 0.35);
this.matter.add.rectangle(WORLD.width / 2, 660, WORLD.width, 60, { isStatic: true, label: 'ground' });
```

- [ ] **Step 5: Run final verification**

Run: `npm run verify`

Expected: unit tests PASS, build PASS, browser tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/scenes/GameScene.ts src/styles.css tests/e2e/game-smoke.spec.ts
git commit -m "feat: polish first playable game"
```

---

## Self-Review

- Spec coverage: Tasks cover scaffold, stage data, vehicle force/stability, caret movement and wheel sizing, Korean/English text input, glyph physics planning and fallback, Phaser scene, Start/Reset/Undo, `A`/`D` movement, rainbow crossing, test hooks, and browser verification.
- First version limits: The plan keeps random generation, all Unicode, online features, mobile-specific controls, perfect glyph fidelity, and a large campaign outside this implementation.
- Type consistency: Shared names are `VehicleKey`, `StageDefinition`, `RainbowTarget`, `VehicleTuning`, `createGlyphPlan`, `createCaretController`, `createTextInputController`, `getVehicleDrive`, and `didPassOverRainbow` throughout the plan.
- Verification path: Each behavior module has a failing unit test before implementation. Browser behavior is added with failing Playwright tests before scene work.
