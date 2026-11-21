import test from 'node:test';
import assert from 'node:assert/strict';
import { searchSymbols } from '../dist/workbench.js';

test('palette matches Chinese aliases and English search keywords', () => {
  assert.deepEqual(searchSymbols('渐弱').flatMap(group => group.entries.map(entry => entry.command)), ['diminuendo-text', 'diminuendo']);
  assert.deepEqual(searchSymbols('  crescendo  楔形 ').flatMap(group => group.entries.map(entry => entry.command)), ['crescendo']);
  assert.deepEqual(searchSymbols('跳音').flatMap(group => group.entries.map(entry => entry.command)), ['staccato']);
});

test('exact dynamics do not find unrelated items and empty searches show all groups', () => {
  assert.deepEqual(searchSymbols('P').flatMap(group => group.entries.map(entry => entry.command)), ['dynamic:p']);
  assert.deepEqual(searchSymbols('不存在的符号'), []);
  assert.ok(searchSymbols(' ').some(group => group.title === '调号与拍号'));
});
