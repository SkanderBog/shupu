import test from 'node:test';
import assert from 'node:assert/strict';
import { appearanceKey, engrave } from '../dist/engrave.js';
import { insertLyrics, lyricGroups, lyricStops } from '../dist/lyric-input.js';
import { notation } from '../dist/notation.js';
import { newScore, openScore, setSpanEnd, setSpanTime, writeNote } from '../dist/score.js';

const pitch = degree => ({ degree, octave: 4, alter: 0 });
test('a sung hyphen is a separate mark at the midpoint after moving a syllable', () => {
  const score = newScore();
  for (const at of [0, 96]) writeNote(score, { lane: 'S', at }, [pitch(1)], 96, 0);
  score.notes[0].verses = [{ number: 1, text: 'la', syllabicNext: true }];
  score.notes[1].verses = [{ number: 1, text: 'la' }];
  const right = appearanceKey({ kind: 'mark', id: score.notes[1].id, field: 'lyric', verse: 1 });
  score.appearance = { [right]: { placement: { x: 6 } } };
  const html = engrave(score, { lane: 'S', at: 0 }, null).pages;
  const words = [...html.matchAll(/<text x="([^"]+)"[^>]*class="lyric">la<\/text>/g)].map(match => +match[1]);
  const dash = +html.match(/<text x="([^"]+)"[^>]*class="lyric lyric-hyphen">-<\/text>/)[1];
  assert.equal(words.length, 2);
  assert.ok(Math.abs(dash - (words[0] + words[1] + 6) / 2) < 1e-6);
});
function demo() {
  const score = newScore();
  for (const at of [0, 96, 192, 288, 384]) writeNote(score, { lane: 'S', at }, at === 288 ? [] : [pitch(at === 384 ? 6 : 5)], 96, 0);
  const [first, middle, last] = score.notes;
  score.spans.push(
    { kind: 'tie', from: first.id, to: middle.id, pitch: 0, targetPitch: 0 },
    { kind: 'tie', from: middle.id, to: last.id, pitch: 0, targetPitch: 0 }
  );
  return score;
}

test('a whole tie chain expands and contracts for the active verse, never counting rests', () => {
  const score = demo();
  const prepared = notation(score);
  const tokens = prepared.byLane.get('S');
  const groups = lyricGroups(score, prepared, 'S');
  assert.deepEqual(groups[0].sources, [0, 1]);
  const words = new Map([[0, '啊']]);
  assert.deepEqual(lyricStops(tokens, groups, words), [0, 384]);
  assert.deepEqual(lyricStops(tokens, groups, words, 192), [0, 96, 192, 384]);
  words.set(192, '哦');
  assert.deepEqual(lyricStops(tokens, groups, words), [0, 96, 192, 384]);
  words.delete(192);
  assert.deepEqual(lyricStops(tokens, groups, words), [0, 384]);
});

test('an automatic slur and a forced first-only tie apply independently', () => {
  const score = demo();
  score.spans[0].lyricFlow = score.spans[1].lyricFlow = 'first';
  score.spans.push({ kind: 'slur', from: score.notes[0].id, to: score.notes[4].id });
  const prepared = notation(score);
  const tokens = prepared.byLane.get('S');
  const groups = lyricGroups(score, prepared, 'S');
  const words = new Map([[192, '字']]);
  assert.deepEqual(lyricStops(tokens, groups, words), [0, 384]);
  assert.deepEqual(lyricStops(tokens, groups, words, 192), [0, 96, 192, 384]);
  assert.equal(words.get(192), '字');
});

test('Chinese advances, initial punctuation appends to the previous word without moving the caret, and Tab pins it', () => {
  const words = new Map();
  const caret = { at: 0, offset: 0 };
  const next = at => [0, 96, 384].find(item => item > at);
  insertLyrics('你好！', words, caret, false, next);
  assert.deepEqual([...words], [[0, '你'], [96, '好！']]);
  assert.deepEqual(caret, { at: 384, offset: 0 });
  insertLyrics(',?', words, caret, false, next);
  assert.equal(words.get(96), '好！,?');
  assert.deepEqual(caret, { at: 384, offset: 0 });
  Object.assign(caret, { at: 96, offset: words.get(96).length });
  insertLyrics('世界, x', words, caret, true, next);
  assert.equal(words.get(96), '好！,?世界,x');
  insertLyrics(' hello.', words, caret, false, next);
  assert.equal(words.get(384), 'hello.');
});

test('an empty verse being edited appears below all preceding rows at the same beat', () => {
  const score = demo();
  const cursor = { at: 0, lane: 'S' };
  const anchor = verse => engrave(score, cursor, null, null, false, notation(score),
    { ...cursor, verse, rows: [1, 2, 3] }).pages.match(/class="lyric-anchor" cx="([^"]+)" cy="([^"]+)"/)?.slice(1).map(Number);
  const first = anchor(1);
  const last = anchor(3);
  assert.equal(last[0], first[0]);
  assert.equal(last[1] - first[1], 34);
});

test('a gradual dynamic endpoint can land inside a rest and round-trip', () => {
  const score = demo();
  score.spans.push({ kind: 'crescendo', from: score.notes[0].id, to: score.notes[4].id });
  setSpanTime(score, 2, 'to', 312);
  assert.equal(openScore(JSON.stringify(score)).spans[2].toAt, 312);
  assert.throws(() => setSpanTime(score, 2, 'from', 350));
  assert.throws(() => setSpanEnd(score, 0, 'to', score.notes[4], 0), /同音线/);
});

test('cross-page lines expose only their two real handles and an empty rest has an inline lyric anchor', () => {
  const score = demo();
  score.measures[1].system = 'page';
  score.spans.push({ kind: 'slur', from: score.notes[0].id, to: score.notes[4].id });
  const result = engrave(score, { at: 288, lane: 'S' }, null, { kind: 'span', index: 2 },
    false, notation(score), { lane: 'S', at: 288, verse: 2 });
  const [first, second] = result.pages.split('</svg>');
  assert.match(first, /data-endpoint="from"/);
  assert.doesNotMatch(first, /data-endpoint="to"/);
  assert.match(second, /data-endpoint="to"/);
  assert.doesNotMatch(second, /data-endpoint="from"/);
  assert.match(first, /class="lyric-anchor"/);
});
