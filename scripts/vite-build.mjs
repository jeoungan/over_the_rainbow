import { build } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

await build({
  root: process.cwd(),
  configFile: false,
  base: './',
});

const distDir = resolve(process.cwd(), 'dist');
const indexPath = resolve(distDir, 'index.html');
let html = await readFile(indexPath, 'utf8');

html = await inlineStylesheets(html);
html = await inlineModuleScripts(html);

await writeFile(indexPath, html, 'utf8');

async function inlineStylesheets(source) {
  return replaceAsync(
    source,
    /<link\s+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
    async (_match, href) => {
      const css = await readAsset(href);
      return `<style>\n${css.replaceAll('</style', '<\\/style')}\n</style>`;
    },
  );
}

async function inlineModuleScripts(source) {
  return replaceAsync(
    source,
    /<script\s+type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,
    async (_match, src) => {
      const js = await readAsset(src);
      return `<script type="module">\n${js.replaceAll('</script', '<\\/script')}\n</script>`;
    },
  );
}

async function readAsset(assetPath) {
  const normalized = assetPath.replace(/^\.\//, '').replace(/^\//, '');
  return readFile(resolve(distDir, normalized), 'utf8');
}

async function replaceAsync(source, pattern, replacer) {
  const matches = Array.from(source.matchAll(pattern));
  let result = source;

  for (const match of matches.reverse()) {
    const replacement = await replacer(...match);
    result = `${result.slice(0, match.index)}${replacement}${result.slice((match.index ?? 0) + match[0].length)}`;
  }

  return result;
}
