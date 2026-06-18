import './styles.css';

const root = document.querySelector<HTMLDivElement>('#game-root');

if (!root) {
  throw new Error('Missing #game-root');
}

root.textContent = 'over the rainbow is loading...';
