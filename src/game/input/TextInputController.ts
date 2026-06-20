export type GameTextIntent =
  | { type: 'glyph'; value: string }
  | { type: 'space' }
  | { type: 'release' }
  | { type: 'undo' }
  | { type: 'start' }
  | { type: 'selectAll' }
  | { type: 'caretMove'; dx: number; dy: number }
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
      const commandModifier = event.ctrlKey || event.metaKey;
      const key = event.key;
      const movement = getCaretMovement(key);

      if (event.ctrlKey && key === ' ') return { type: 'space' };
      if (event.ctrlKey && key.toLowerCase() === 'a') return { type: 'selectAll' };
      if (!commandModifier && !composing && movement) return { type: 'caretMove', ...movement };

      if (event.repeat) return none;
      if (key === 'Backspace') return { type: 'undo' };
      if (event.ctrlKey && key.toLowerCase() === 'r') return { type: 'start' };
      if (composing) return none;
      if (commandModifier) return none;
      if (key === ' ') return { type: 'space' };
      if (key === 'Enter') return { type: 'release' };

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

function getCaretMovement(key: string): { dx: number; dy: number } | undefined {
  const normalized = key.toLowerCase();

  if (normalized === 'arrowleft' || normalized === 'a') return { dx: -1, dy: 0 };
  if (normalized === 'arrowright' || normalized === 'd') return { dx: 1, dy: 0 };
  if (normalized === 'arrowup' || normalized === 'w') return { dx: 0, dy: -1 };
  if (normalized === 'arrowdown' || normalized === 's') return { dx: 0, dy: 1 };

  return undefined;
}
