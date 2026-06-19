export type GameTextIntent =
  | { type: 'glyph'; value: string }
  | { type: 'space' }
  | { type: 'newline' }
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
      if (key === 'Enter') return { type: 'newline' };
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
