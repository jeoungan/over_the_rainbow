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

  it('maps Enter to releasing the current typed glyphs', () => {
    const controller = createTextInputController();
    expect(controller.keyDown({ key: 'Enter', ctrlKey: false, metaKey: false, repeat: false })).toEqual({
      type: 'release',
    });
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
