import test from 'node:test';
import assert from 'node:assert/strict';
import { createTuplet, deleteMeasures, insertBlankMeasure, newScore, openScore, resizeNote, tickEnd, tupletUnit, writeNote } from '../dist/score.js';
import { notation, rhythmAlignment } from '../dist/notation.js';
import { appearanceKey, engrave } from '../dist/engrave.js';
import { exportMusicXML } from '../dist/musicxml-export.js';
import { scoreTones } from '../dist/playback.js';

const cursor = { lane: 'S', at: 0 };
const pitch = { degree: 1, octave: 4, alter: 0 };

test('tuplets round in the chosen direction without changing duration and do not cross the bar', () => {
  assert.equal(tupletUnit(96, 0, 3), 48);
  assert.equal(tupletUnit(144, 1, 2), 48);
  assert.equal(tupletUnit(144, 1, 4), 24);
  assert.equal(tupletUnit(168, 2, 3), 48);
  assert.equal(tupletUnit(96, 0, 19), 6);
  const score = newScore();
  assert.throws(() => createTuplet(score, cursor, 6, 0, 3), /六十四/);
  assert.throws(() => createTuplet(score, { ...cursor, at: 360 }, 96, 0, 3), /小节/);
  writeNote(score, cursor, [pitch], 96, 0);
  const group = createTuplet(score, cursor, 96, 0, 7, score.notes[0]);
  const rendered = notation(score).byLane.get('S').filter(token => token.tuplet);
  assert.equal(rendered.length, 7);
  assert.equal(tickEnd(rendered.at(-1)), 96);
  assert.deepEqual(rendered.map(token => token.bars), Array(7).fill(2));
  assert.equal(scoreTones(score).length, 1);
  assert.equal(scoreTones(score)[0].end, tickEnd(score.notes[0]));
  assert.equal(openScore(JSON.stringify(score)).tuplets[0].id, group.id);
  const { xml } = exportMusicXML(score);
  assert.match(xml, /<divisions>672<\/divisions>/);
  assert.match(xml, /<actual-notes>7<\/actual-notes><normal-notes>4<\/normal-notes>/);
});

test('nested ratios, duration edits, repeated filling and four reduction lines remain separate', () => {
  const score = newScore();
  const outer = createTuplet(score, cursor, 96, 0, 5);
  const inner = createTuplet(score, cursor, 24, 0, 3, score.notes[0]);
  assert.equal(inner.parent, outer.id);
  let at = 0;
  for (let index = 0; index < 3; index++) at = writeNote(score, { ...cursor, at }, [pitch], inner.unit, 0);
  assert.equal(at, 19.2);
  assert.equal(notation(score).byLane.get('S').filter(token => token.tuplet?.id === inner.id).length, 3);
  resizeNote(score, score.notes.find(note => note.at === 19.2), 24, 1);
  assert.throws(() => resizeNote(score, score.notes.find(note => note.at === 76.8), 48, 0), /边界/);
  assert.match(engrave(score, cursor, null).pages, /tuplet-arc/);
  assert.equal(openScore(JSON.stringify(score)).tuplets.length, 2);
  const ordinary = newScore();
  writeNote(ordinary, cursor, [pitch], 6, 2);
  const note = notation(ordinary).byLane.get('S')[0];
  assert.equal(note.bars, 4);
  assert.equal(note.dots, 2);
  assert.equal(note.length, 10.5);
  assert.match(exportMusicXML(ordinary).xml, /<type>64th<\/type><dot\/><dot\/>/);
});

test('nested tuplets and their precise notes follow inserted measures and disappear with a removed measure', () => {
  const score = newScore();
  const outer = createTuplet(score, cursor, 96, 0, 7);
  createTuplet(score, cursor, 24, 0, 3, score.notes[0]);
  insertBlankMeasure(score, 0, false);
  assert.equal(score.tuplets[0].id, outer.id);
  assert.equal(score.tuplets[0].at, 384);
  assert.equal(score.notes[0].at, 384);
  assert.equal(openScore(JSON.stringify(score)).tuplets.length, 2);
  deleteMeasures(score, [1]);
  assert.equal(score.tuplets.length, 0);
});

function centers(score) {
  const drawn = engrave(score, cursor, null).pages;
  const result = new Map();
  for (const note of score.notes) {
    const match = [...drawn.matchAll(/data-element="([^"]+)"[^>]*><text x="([^"]+)"[^>]*class="digit"/g)]
      .find(([, data]) => data.includes('&quot;id&quot;:&quot;' + note.id + '&quot;') && data.includes('&quot;at&quot;:' + note.at + ','));
    if (match) result.set(note.lane + ':' + note.at, +match[2]);
  }
  return result;
}

test('3+3+2 is locally half-aligned; a detached digit moves without dragging the other voice', () => {
  const score = newScore();
  for (const at of [0, 72]) writeNote(score, { lane: 'S', at }, [pitch], 48, 1);
  writeNote(score, { lane: 'S', at: 144 }, [pitch], 48, 0);
  for (const at of [0, 48, 96, 144]) writeNote(score, { lane: 'A', at }, [pitch], 48, 0);
  const prep = notation(score);
  const notes = prep.byLane.get('S').slice(0, 3);
  assert.deepEqual(notes.map(token => rhythmAlignment(score, prep.measures[0], token)), ['full', 'half', 'full']);
  const key = appearanceKey({ kind: 'pitch', id: notes[1].note.id, at: 72, index: 0 });
  const relaxed = centers(score);
  assert.equal(relaxed.get('S:144'), relaxed.get('A:144'));
  assert.ok(relaxed.get('A:48') <= relaxed.get('S:72') && relaxed.get('S:72') <= relaxed.get('A:96'));
  score.appearance = { [key]: { alignment: 'full' } };
  const strict = centers(score);
  assert.ok(strict.get('A:96') - strict.get('A:48') > relaxed.get('A:96') - relaxed.get('A:48'));
  score.appearance[key] = { alignment: 'none', placement: { x: 15 } };
  const detached = centers(score);
  delete score.appearance[key].placement;
  const neutral = centers(score);
  assert.notEqual(detached.get('S:72'), neutral.get('S:72'));
  assert.equal(detached.get('A:96'), neutral.get('A:96'));
});
