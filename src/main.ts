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
      gravity: { x: 0, y: 1.15 },
      debug: false,
      enableSleeping: true,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [GameScene],
});
