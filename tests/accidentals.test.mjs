import test from 'node:test';
import assert from 'node:assert/strict';
import { engrave } from '../dist/engrave.js';
import { notation } from '../dist/notation.js';
import { exportMusicXML } from '../dist/musicxml-export.js';
import { newScore, openScore, writeNote } from '../dist/score.js';
import { scoreTones } from '../dist/playback.js';

const pitch = { degree: 5, octave: 4, alter: 0 };
const cursor = { lane: 'S', at: 0 };
const signsFor = (score, lane = 'S') => {
  const prepared = notation(score);
  return prepared.byLane.get(lane).filter(token => token.note.pitches.length).map(token => prepared.accidentals.signs.get(token));
};

test('accidentals carry across octaves in a voice, stop at the bar, and preserve later pitches when re-engraved', () => {
  const score = newScore();
  for (const at of [0, 96, 192, 288, 384]) writeNote(score, { ...cursor, at },
    [{ ...pitch, octave: at === 96 ? 5 : 4, alter: at < 192 || at >= 288 ? 1 : 0 }], 96, 0);
  writeNote(score, { lane: 'A', at: 96 }, [{ ...pitch, alter: 1 }], 96, 0);
  assert.deepEqual(signsFor(score), [[1], [undefined], [0], [1], [1]]);
  assert.deepEqual(signsFor(score, 'A'), [[1]]);
  const first = score.notes.find(note => note.lane === 'S');
  const later = scoreTones(score).filter(tone => tone.start > 0);
  first.pitches[0].alter = 0;
  assert.deepEqual(signsFor(score), [[undefined], [1], [0], [1], [1]]);
  assert.deepEqual(scoreTones(score).filter(tone => tone.start > 0), later);
});

test('cross-bar ties do not carry the accidental; altered unisons and courtesy signs are explicit', () => {
  const score = newScore();
  for (const at of [288, 384, 480]) writeNote(score, { ...cursor, at }, [{ ...pitch, alter: 1 }], 96, 0);
  const [head, tail] = score.notes;
  score.spans.push({ kind: 'tie', from: head.id, to: tail.id, pitch: 0, targetPitch: 0 });
  writeNote(score, { ...cursor, at: 576 }, [{ ...pitch, alter: 1 }, { ...pitch, octave: 5 }], 96, 0);
  writeNote(score, { ...cursor, at: 672 }, [pitch], 48, 0);
  writeNote(score, { ...cursor, at: 720 }, [{ ...pitch, courtesy: true }], 48, 0);
  assert.deepEqual(signsFor(score), [[1], [undefined], [1], [1, 0], [0], [0]]);
  assert.match(exportMusicXML(score).xml, /<accidental cautionary="yes">natural<\/accidental>/);
  assert.deepEqual(signsFor(openScore(JSON.stringify(score))), signsFor(score));
});

test('a local articulation clears a horizontal hairpin without raising a mark elsewhere', () => {
  const score = newScore();
  for (const at of [0, 96, 192, 288]) writeNote(score, { ...cursor, at }, [pitch], 96, 0);
  const [first, inside, last, far] = score.notes;
  inside.staccato = far.staccato = true;
  const height = note => {
    const pattern = new RegExp(`&quot;field&quot;:&quot;staccato&quot;,&quot;id&quot;:&quot;${note.id}&quot;[^>]*>(?:<g transform="translate\\([^ ]+ ([^)]*)\\)">)?<path class="solid" d="M[^ ]+ ([^h]+)h`);
    const [, dy, y] = engrave(score, cursor, null).pages.match(pattern);
    return +(dy ?? 0) + +y + 6;
  };
  const nearY = height(inside), farY = height(far);
  score.spans.push({ kind: 'crescendo', from: first.id, to: last.id });
  assert.ok(height(inside) < nearY);
  assert.equal(height(far), farY);
});
