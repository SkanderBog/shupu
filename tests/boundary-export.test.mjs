import test from 'node:test';
import assert from 'node:assert/strict';
import { addSideLane, boundaryAt, insertBlankMeasure, newScore, openScore, setBoundaryBreak, setBoundaryStyle, writeNote } from '../dist/score.js';
import { appearanceKey, engrave } from '../dist/engrave.js';
import { connected, notation } from '../dist/notation.js';
import { repeatOrder } from '../dist/playback.js';
import { exportMusicXML } from '../dist/musicxml-export.js';

const pitch = degree => ({ degree, octave: 4, alter: 0 });
const place = (score, lane, at, length, pitches) => writeNote(score, { lane, at }, pitches, length, 0);

test('a barline fermata stays selectable and follows the boundary into MusicXML after bar insertion', () => {
  const score = newScore();
  score.boundaries = { 2: { fermata: true, fermataAppearance: { placement: { y: 2 } } } };
  insertBlankMeasure(score, 2, false);
  const restored = openScore(JSON.stringify(score));
  assert.equal(boundaryAt(restored, 2).fermata, undefined);
  assert.equal(boundaryAt(restored, 3).fermata, true);
  setBoundaryBreak(restored, 3, 'line');
  const svg = engrave(restored, { lane: 'S', at: 0 }, null).pages;
  assert.equal((svg.match(/&quot;bar-fermata&quot;/g) ?? []).length, 1);
  assert.match(exportMusicXML(restored).xml, /<barline location="right"><fermata\/><\/barline>/);
});

test('combined boundary preserves the left repeat and uses additional rather than total counts', () => {
  const score = newScore();
  score.measures[1].repeatEnd = 3;
  setBoundaryStyle(score, 2, 'repeat-start', true);
  setBoundaryStyle(score, 4, 'repeat-end');
  assert.deepEqual([boundaryAt(score, 2).style, boundaryAt(score, 2).repeats], ['repeat-both', 2]);
  assert.equal(boundaryAt(score, 4).repeats, 0);
  setBoundaryBreak(score, 2, 'page');
  const restored = openScore(JSON.stringify(score));
  assert.deepEqual(repeatOrder(restored, 0, 3), [0, 1, 0, 1, 0, 1, 2, 3]);
  assert.equal(boundaryAt(restored, 2).break, 'page');
  setBoundaryBreak(restored, 2);
  assert.equal(boundaryAt(restored, 2).break, undefined);
});

test('a beam command operates on the incoming connection, one layer at a time', () => {
  const score = newScore();
  for (const at of [0, 12, 24]) place(score, 'S', at, 12, at === 12 ? [] : [pitch(5)]);
  const tokens = () => notation(score).byLane.get('S');
  const middle = score.notes[1];
  middle.beams = { 12: 'one' };
  let [first, second, third] = tokens();
  assert.deepEqual([1, 2, 3].map(level => connected(first, second, level)), [true, false, false]);
  assert.ok(connected(second, third, 3));
  middle.beams[12] = 'isolated';
  [first, second, third] = tokens();
  assert.ok(!connected(first, second, 1) && !connected(second, third, 1));
});

test('visibility changes drawing without affecting layout until collision participation is disabled', () => {
  const score = newScore();
  score.justifyBottom = false;
  place(score, 'A', 0, 96, [pitch(5)]);
  const note = score.notes[0];
  note.dynamic = 'mp';
  const mark = { kind: 'mark', id: note.id, field: 'dynamic' };
  const render = () => engrave(score, { lane: 'A', at: 0 }, null, mark).pages;
  const positions = pages => [...pages.matchAll(/class="voice-row" transform="translate\(0 ([\d.]+)\)"/g)].slice(0, 2).map(match => +match[1]);
  const initial = positions(render());
  score.appearance = { [appearanceKey(mark)]: { visible: false } };
  assert.match(render(), /class="score-element picked score-invisible"/);
  assert.deepEqual(positions(render()), initial);
  score.appearance[appearanceKey(mark)].layout = false;
  assert.ok(positions(render())[1] < initial[1]);
  assert.equal(openScore(JSON.stringify(score)).notes[0].dynamic, 'mp');
});

test('MusicXML exports compatible repeat count, paired boundary, break, chord and independent voice', () => {
  const score = newScore(4, 4, 48);
  score.title = '甲 & <乙>';
  const side = addSideLane(score, 'S', 288, 384);
  place(score, 'S', 0, 96, [pitch(1), pitch(3)]);
  place(score, side.id, 288, 96, [pitch(5)]);
  setBoundaryStyle(score, 2, 'repeat-both');
  score.boundaries[2].repeats = 0;
  setBoundaryBreak(score, 2, 'page');
  const { xml } = exportMusicXML(score);
  assert.match(xml, /甲 &amp; &lt;乙&gt;/);
  assert.match(xml, /implicit="yes"/);
  assert.match(xml, /<chord\/>/);
  assert.match(xml, /<backup><duration>/);
  assert.match(xml, /<voice>2<\/voice>/);
  assert.match(xml, /<tie type="start"\/>/);
  assert.match(xml, /direction="backward" times="1"/);
  assert.match(xml, /<print new-page="yes"\/><barline location="left"><bar-style>heavy-light<\/bar-style><repeat direction="forward"\/>/);
});
