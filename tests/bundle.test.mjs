import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

// `npm test` builds this file first. These checks guard the artifact users
// actually download: if an inlining replacement stops matching, the build
// silently emits a page that is either broken offline or blocked by its CSP.
const bundle = await readFile(new URL('../数谱-简谱工作台-1.0.html', import.meta.url), 'utf8');
// HTML parsing normalizes line endings before checking inline CSP hashes.
const normalize = text => text.replace(/\r\n?/g, '\n');
const sha256 = text => createHash('sha256').update(normalize(text)).digest('base64');

test('the single-file build inlines its script and style with matching CSP hashes', () => {
  assert.doesNotMatch(bundle, /<link\b[^>]*\brel=["']?stylesheet/i, 'stylesheet link was not inlined');
  assert.doesNotMatch(bundle, /<script\b[^>]*\bsrc=/i, 'external script was not inlined');
  const csp = bundle.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/i)?.[1];
  assert.ok(csp, 'CSP meta tag is missing');
  assert.match(csp, /default-src 'none'/);
  const script = bundle.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  const style = bundle.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  assert.ok(script, 'inline script is missing');
  assert.ok(style, 'inline style is missing');
  const scriptHash = csp.match(/script-src 'sha256-([^']+)'/)?.[1];
  const styleHash = csp.match(/style-src 'sha256-([^']+)'/)?.[1];
  assert.equal(sha256(script), scriptHash, 'script CSP hash does not match the inlined script');
  assert.equal(sha256(style), styleHash, 'style CSP hash does not match the inlined style');
});

test('the single-file build bundles every TypeScript module', async () => {
  const sources = (await readdir(new URL('../src/', import.meta.url)))
    .filter(name => name.endsWith('.ts')).sort();
  const bundled = [...bundle.matchAll(/modules\['\.\/([a-z0-9-]+)\.js'\]/g)]
    .map(match => `${match[1]}.ts`).sort();
  assert.deepEqual(bundled, sources, 'bundle.mjs module list is out of sync with src/');
});
