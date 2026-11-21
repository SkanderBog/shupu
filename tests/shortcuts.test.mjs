import assert from 'node:assert/strict';
import test from 'node:test';
import { bindingsFile, parseBindings, shortcutKeys, shortcutMatches, specialShortcuts } from '../dist/shortcuts.js';

const entry = { id: 'lyrics', name: '开始编辑歌词', scopes: ['edit'], defaults: ['L'] };
const entries = new Map([[entry.id, entry]]);
const key = (value, settings = {}) => shortcutKeys({ key: value, code: '', ctrlKey: false, altKey: false, shiftKey: false,
  metaKey: false, getModifierState: () => false, ...settings });

test('shortcut matching uses every word across the title and all bindings', () => {
  assert.ok(shortcutMatches(entry.name, ['L', 'Ctrl+Shift+Delete'], 'control  歌词   del'));
  assert.ok(shortcutMatches('只有菜单动作', [], ''));
  assert.ok(!shortcutMatches(entry.name, ['Ctrl+Shift+Delete'], '歌词 alt'));
  assert.deepEqual(key('?', { code: 'Slash', shiftKey: true }), ['?']);
  assert.deepEqual(key('+', { code: 'NumpadAdd' }), ['NumAdd', '+']);
});

test('bindings files preserve a deliberate empty list and report unknown commands', () => {
  const loaded = parseBindings(bindingsFile({ lyrics: [], removed: ['F6'] }), entries);
  assert.deepEqual(loaded.bindings.lyrics, []);
  assert.deepEqual(loaded.unknown, ['removed']);
});

test('fixed shortcut slots can be rebound without removing a step or its required modifier', () => {
  const slots = new Map(specialShortcuts.map(entry => [entry.id, entry]));
  const loaded = parseBindings(bindingsFile({ 'accidental-down-main': ['J'], 'tuplet-prefix': ['Ctrl+8'],
    'tuplet-digit-3': ['Ctrl+K'] }), slots);
  assert.deepEqual(loaded.bindings['accidental-down-main'], ['J']);
  assert.deepEqual(loaded.bindings['tuplet-digit-3'], ['Ctrl+K']);
  assert.throws(() => parseBindings(bindingsFile({ 'accidental-down-main': [] }), slots));
  assert.throws(() => parseBindings(bindingsFile({ 'accidental-up-main': ['Ctrl+J'] }), slots));
  assert.throws(() => parseBindings(bindingsFile({ 'tuplet-prefix': ['J'] }), slots));
});
