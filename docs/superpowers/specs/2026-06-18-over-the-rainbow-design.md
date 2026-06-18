# Over the Rainbow Design

## Purpose

`over the rainbow` is a 2D physics puzzle game about turning typed letters into physical objects. The player rides a stage-specific vehicle and must get over a rainbow floating in the sky. The player does not solve the stage by jumping directly. Instead, they place an insertion caret anywhere in the game world, type Korean or English characters, and use the resulting physical glyphs as ramps, supports, platforms, and obstacles.

The first version should feel like a puzzle game with room for playful experimentation. The central loop is:

1. Start a stage.
2. Move the caret to a useful world position.
3. Adjust glyph size with the mouse wheel.
4. Type one character at a time to create physical glyph objects.
5. Press the on-screen Start button with the cursor, or press `Ctrl+R`, to activate the vehicle.
6. Move the vehicle left and right with `A` and `D`.
7. Get the player and vehicle over the rainbow target area.
8. Retry, undo, or reset if the structure fails.

The tone is a dreamlike sky road: pastel sky, soft clouds, readable physical letters, and a rainbow goal that feels like a destination rather than a plain checkpoint.

## First Version Scope

The first playable version includes a tutorial plus three short stages.

- Tutorial: walking vehicle, very low and close rainbow. Teaches caret placement, typing glyphs, Start, and gentle ramp/support construction.
- Stage 1: racing car, low and close rainbow. Gives an early success experience with strong climbing force and high speed.
- Stage 2: small ordinary car, low and close rainbow. Teaches the balance between climbing force and stability.
- Stage 3: bicycle, low and close rainbow. Hardest of the first set because the bicycle has weaker climbing force and needs careful ramp design.

Later versions can add random stage generation, more vehicles, more fonts, and harder rainbow placements.

## Difficulty Model

Difficulty is controlled by four variables:

- Vehicle speed and climbing force: `walking < bicycle < small car < racing car`.
- Vehicle stability: `walking > bicycle > small car > racing car`.
- Rainbow height: a higher rainbow requires taller ramps or launch structures.
- Rainbow distance: with the same height, a farther rainbow allows a gentler ramp; a closer rainbow forces a shorter and steeper structure.

In this game, vehicle speed is not only horizontal movement speed. It also represents how much force the vehicle has to climb a slope. A racing car can climb steeper glyph ramps but is likely to flip or launch dangerously. A bicycle is more controlled, but it cannot push up steep ramps and may roll backward under gravity. A high, close rainbow is dangerous because it pressures the player into building a steep ramp in little space.

## Controls

The player controls both a physical vehicle and a separate insertion caret.

Vehicle controls:

- `A`: move the vehicle left.
- `D`: move the vehicle right.

Caret and glyph controls:

- Mouse click or drag: place or move the caret anywhere in the game world.
- Mouse wheel: change the size of newly typed glyphs.
- Korean or English character input: create one physical glyph at the caret position.
- `Ctrl+Space`: insert spacing behavior instead of relying on the browser's normal space behavior.
- `Backspace`: remove the most recently created glyph.

Stage controls:

- On-screen Start button: pressed with the cursor to activate the vehicle.
- `Ctrl+R`: Start shortcut while the game canvas has focus.
- Reset button: separate UI action for restarting the current stage.
- Undo button: visible counterpart to `Backspace`.

The caret can be placed on the ground, on existing glyphs, or in the sky. A glyph created in the sky appears at that location and falls under gravity.

## Glyph Physics

The intended identity of the game is that the letters themselves matter physically. The implementation should use real font outline data where practical, while automatically simplifying outlines for stable physics.

Glyph creation pipeline:

1. Receive a completed Korean or English character input.
2. Render the glyph visually with the selected font and size.
3. Extract the matching font outline.
4. Sample and simplify the outline.
5. Convert the simplified outline into a Matter.js body, using a compound body when needed.
6. Fall back to a simple box or approximate shape if conversion fails or the glyph is too complex.

Fallbacks should keep the game playable. A failed glyph conversion should not crash the stage. A small debug indicator can mark fallback glyphs during development.

## Technical Approach

Use Phaser 3 with Matter.js. Phaser provides scenes, rendering, input, camera, and UI structure. Matter.js provides the physics simulation for vehicles, glyphs, terrain, and goal detection.

Core modules:

- `TextInputController`: handles Korean and English text input, composition, `Ctrl+Space`, and `Backspace`.
- `CaretController`: handles world-space caret position, blinking, current glyph size, and mouse interaction.
- `GlyphPhysicsFactory`: converts font outlines into Matter.js bodies with simplification and fallbacks.
- `StageManager`: loads tutorial and stage data, including rainbow placement and vehicle type.
- `VehicleController`: manages activation, `A`/`D` movement, vehicle speed, climbing force, and stability.
- `GoalDetector`: confirms the player and vehicle have passed over the rainbow target, not merely touched it.
- `GameUi`: displays stage info, vehicle info, glyph size, font selection, Start, Reset, and Undo.

The first version should keep the game immediately playable on the first screen rather than presenting a landing page.

## Visual Direction

The visual direction is a dreamlike sky road.

- Background: pastel sky, soft cloud layers, gentle depth.
- Goal: a readable rainbow in the sky, clearly tied to the success zone.
- Glyphs: readable physical letters with outlines and subtle shadows so they do not blend into the sky.
- UI: compact and clear, focused on repeated play rather than marketing-style presentation.
- Feedback: short hints after failure or success, such as suggesting a gentler ramp or warning that large glyphs are heavy.

The visual style should support experimentation. The player should be able to quickly read which objects are physical, where the caret is, and where the rainbow success area begins.

## Testing And Verification

The implementation should be testable from the start.

Unit-level tests should cover:

- Stage difficulty data ordering.
- Vehicle speed, climbing force, and stability values.
- Input handling for normal characters, Korean composition, `Ctrl+Space`, `Backspace`, and `Ctrl+R`.
- Caret placement, glyph size changes, and world-bound clamping.
- Glyph conversion success and fallback behavior.
- Goal detection requiring the player and vehicle to pass over the rainbow target area.

Browser verification should cover:

- The game canvas renders and is not blank.
- The caret is visible and can be moved with the mouse.
- Typing creates visible physical glyphs.
- Sky-created glyphs fall under gravity.
- The Start button and `Ctrl+R` activate the vehicle.
- `A` and `D` move the vehicle left and right.
- At least one stage can be completed by crossing over the rainbow.

The game should expose `window.render_game_to_text()` with concise state for automated checks: current stage, vehicle type, player position, player velocity, caret position, glyph count, and goal state. When practical, expose `window.advanceTime(ms)` for deterministic stepping in tests.

## Out Of Scope For The First Version

- Full random stage generation.
- Every Unicode character and emoji.
- Online sharing or leaderboards.
- Mobile touch controls beyond basic mouse-compatible behavior.
- Perfect physics fidelity for every glyph in every font.
- A large campaign or level editor.
