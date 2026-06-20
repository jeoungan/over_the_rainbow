import { describe, expect, it } from 'vitest';
import { createTextInputController } from './TextInputController';

describe('TextInputController', () => {
  it('maps only arrow keys to caret movement', () => {
    const controller = createTextInputController();
    expect(controller.keyDown({ key: 'A', ctrlKey: false, metaKey: false, repeat: false })).toEqual({ type: 'none' });
    expect(controller.keyDown({ key: 'w', ctrlKey: false, metaKey: false, repeat: false })).toEqual({ type: 'none' });
    expect(controller.keyDown({ key: 'ArrowRight', ctrlKey: false, metaKey: false, repeat: true })).toEqual({
      type: 'caretMove',
      dx: 1,
      dy: 0,
    });
    expect(controller.keyDown({ key: 'ArrowUp', ctrlKey: false, metaKey: false, repeat: false })).toEqual({
      type: 'caretMove',
      dx: 0,
      dy: -1,
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
    expect(controller.keyDown({ key: ' ', ctrlKey: false, metaKey: false, repeat: false })).toEqual({ type: 'space' });
  });

  it('maps Enter to releasing the current typed glyphs', () => {
    const controller = createTextInputController();
    expect(controller.keyDown({ key: 'Enter', ctrlKey: false, metaKey: false, repeat: false })).toEqual({
      type: 'release',
    });
  });

  it('maps Backspace to undo, Ctrl+R to start, and Ctrl+A to select all', () => {
    const controller = createTextInputController();
    expect(controller.keyDown({ key: 'Backspace', ctrlKey: false, metaKey: false, repeat: false })).toEqual({ type: 'undo' });
    expect(controller.keyDown({ key: 'r', ctrlKey: true, metaKey: false, repeat: false })).toEqual({ type: 'start' });
    expect(controller.keyDown({ key: 'a', ctrlKey: true, metaKey: false, repeat: false })).toEqual({ type: 'selectAll' });
  });

  it('leaves ordinary text input to the browser text capture', () => {
    const controller = createTextInputController();
    expect(controller.keyDown({ key: 'L', ctrlKey: false, metaKey: false, repeat: false })).toEqual({ type: 'none' });
    expect(controller.keyDown({ key: 'B', ctrlKey: true, metaKey: false, repeat: false })).toEqual({ type: 'none' });
  });
});
