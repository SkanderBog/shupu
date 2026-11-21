import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';

const read = file => readFile(new URL(file, import.meta.url), 'utf8');
const hash = contents => `'sha256-${createHash('sha256').update(contents).digest('base64')}'`;
// HTML parsing normalizes line endings before checking inline CSP hashes.
const inlineText = contents => contents.replace(/\r\n?/g, '\n');
const modules = await Promise.all(['score', 'chord-symbol', 'roadmap', 'line-layout', 'linked-parts', 'tempo', 'notation',
  'ornament-outlines', 'accidental-outline', 'engrave', 'sample', 'musicxml', 'musicxml-export', 'playback', 'lyric-input',
  'workbench', 'shortcuts', 'manual-content', 'help-pages', 'voice-conversion', 'sheet-output', 'app'].map(async name => {
  const source = ts.transpileModule(await read(`src/${name}.ts`), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText.replace(/<\/script/gi, '<\\/script');
  return `modules['./${name}.js'] = (exports, require) => {\n${source}\n};`;
}));
const script = inlineText(`(() => {
const modules = Object.create(null), cache = Object.create(null);
${modules.join('\n')}
function load(id) {
  if (!cache[id]) modules[id](cache[id] = {}, load);
  return cache[id];
}
try { load('./app.js'); }
catch (error) {
  document.getElementById('status').textContent = '工作台启动失败：' + error.message;
  throw error;
}
})();`);
const styles = inlineText(await read('styles.css'));
const outlineLicense = await read('Bravura-OFL.txt');
const license = await read('LICENSE');
const notice = await read('NOTICE');
const html = (await read('index.html'))
  .replace("default-src 'self';", `default-src 'none'; script-src ${hash(script)}; style-src ${hash(styles)};`)
  .replace('<link rel="stylesheet" href="./styles.css">', () => `<style>${styles}</style>`)
  .replace('<script type="module" src="./dist/app.js"></script>', '')
  .replace('</body>', () => `<script>${script}</script>\n<!--\n${notice}\n${license}\n${outlineLicense}-->\n</body>`);
await writeFile(new URL('数谱-简谱工作台-1.0.html', import.meta.url), html);
