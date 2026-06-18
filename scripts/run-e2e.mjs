import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { createServer } from 'vite';

const server = await createServer({
  root: process.cwd(),
  configFile: false,
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
});

await server.listen();

try {
  const cliPath = join(process.cwd(), 'node_modules', '@playwright', 'test', 'cli.js');
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, 'test', ...process.argv.slice(2)], {
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });

  process.exitCode = exitCode;
} finally {
  await server.close();
}
