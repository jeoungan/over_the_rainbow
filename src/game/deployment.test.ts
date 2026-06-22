import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

function runRootIndexScript(url: string): { appendedScripts: string[]; replacedWith?: string } {
  const html = readFileSync('index.html', 'utf8');
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  if (!script) throw new Error('Root index.html has no inline bootstrap script.');

  const location = new URL(url) as URL & { replace: (nextUrl: string) => void };
  let replacedWith: string | undefined;
  const appendedScripts: string[] = [];
  location.replace = (nextUrl: string) => {
    replacedWith = nextUrl;
  };

  vm.runInNewContext(script, {
    URL,
    window: { location },
    document: {
      createElement: () => ({ type: '', src: '' }),
      body: {
        appendChild: (node: { src?: string }) => {
          if (node.src) appendedScripts.push(node.src);
        },
      },
    },
  });

  return { appendedScripts, replacedWith };
}

describe('static deployment entry', () => {
  it('redirects GitHub Pages project URLs to the built dist entry', () => {
    const result = runRootIndexScript('https://jeoungan.github.io/over_the_rainbow/');

    expect(result.replacedWith).toBe('https://jeoungan.github.io/over_the_rainbow/dist/index.html');
    expect(result.appendedScripts).toEqual([]);
  });

  it('keeps localhost on the Vite TypeScript entry for development', () => {
    const result = runRootIndexScript('http://127.0.0.1:5173/');

    expect(result.replacedWith).toBeUndefined();
    expect(result.appendedScripts).toEqual(['/src/main.ts']);
  });

  it('keeps dist available for branch-based GitHub Pages deployments', () => {
    const ignoredPatterns = readFileSync('.gitignore', 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim());

    expect(ignoredPatterns).not.toContain('dist/');
  });
});
