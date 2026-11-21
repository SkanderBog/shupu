import test from 'node:test';
import assert from 'node:assert/strict';
import { engrave } from '../dist/engrave.js';
import { exportMusicXML } from '../dist/musicxml-export.js';
import { notation } from '../dist/notation.js';
import { scoreTones } from '../dist/playback.js';
import { newScore, openScore, writeNote } from '../dist/score.js';

const cursor = { lane: 'S', at: 0 };
const pitch = { degree: 5, octave: 4, alter: 0 };
const grace = (id, value, degree = 4, octave = 4) => ({ id, value, pitches: [{ ...pitch, degree, octave }] });

test('both grace groups borrow from their principal without moving the other voice or the next onset', () => {
  const score = newScore();
  writeNote(score, cursor, [pitch], 96, 0);
  const main = score.notes[0];
  main.grace = { before: { notes: [grace('a', 48), grace('b', 24)] }, after: { notes: [grace('c', 24)] } };
  writeNote(score, { lane: 'S', at: 96 }, [pitch], 96, 0);
  writeNote(score, { lane: 'A', at: 0 }, [pitch], 96, 0);
  const tones = scoreTones(score);
  assert.deepEqual(tones.filter(tone => tone.lane === 'S').map(({ start, end }) => [start, end]),
    [[0, 8], [8, 12], [12, 90], [90, 96], [96, 192]]);
  assert.deepEqual(tones.filter(tone => tone.lane === 'A').map(({ start, end }) => [start, end]), [[0, 96]]);
  assert.equal(notation(score).byLane.get('S')[0].length, 96);
  const restored = openScore(JSON.stringify(score));
  assert.deepEqual(restored.notes.find(note => note.id === main.id).grace, main.grace);
  const xml = exportMusicXML(restored).xml;
  assert.match(xml, /<grace slash="yes" steal-time-following="12.5"\/>/);
  assert.match(xml, /<grace slash="yes" steal-time-previous="6.25"\/>/);
  assert.equal([...xml.matchAll(/<grace\b/g)].length, 3);
});

test('the grace connector leaves the group center vertically below lower dots and reaches the neighbor horizontally', () => {
  const score = newScore();
  writeNote(score, cursor, [pitch], 96, 0);
  score.notes[0].grace = { before: { notes: [grace('a', 48, 4, 3), grace('b', 24, 3, 3)] } };
  const { pages } = engrave(score, cursor, null);
  const digits = [...pages.matchAll(/<text x="([^"]+)" y="[^"]+" text-anchor="middle" class="grace-digit"/g)].map(match => +match[1]);
  const [, startX, startY, controlX, , , endControlY, , endY] = pages.match(
    /<path d="M([^ ]+) ([^ ]+) C([^ ]+) ([^ ]+) ([^ ]+) ([^ ]+) ([^ ]+) ([^"]+)" class="grace-arc"/);
  assert.equal(+startX, (digits[0] + digits[1]) / 2);
  assert.equal(startX, controlX);
  assert.equal(endY, endControlY);
  const lowerDots = [...pages.matchAll(/<circle cx="[^"]+" cy="([^"]+)" r="1"\/>/g)].map(match => +match[1]);
  assert.ok(+startY > Math.max(...lowerDots) + 1);
  assert.equal([...pages.matchAll(/class="grace-beam"/g)].length, 3);
});

test('grace spacing settings are separate from the principal and grace beams and ties affect only the group', () => {
  const score = newScore();
  writeNote(score, cursor, [pitch], 96, 0);
  const group = { notes: [grace('first', 48), { ...grace('last', 48), dots: 1, beam: 'break', staccato: true }] };
  score.notes[0].grace = { before: group };
  function measure() {
    const { pages } = engrave(score, cursor, null);
    const digits = [...pages.matchAll(/<text x="([^"]+)" y="([^"]+)"[^>]*class="grace-digit"/g)];
    const principal = +pages.match(/<text x="([^"]+)" y="[^"]+"[^>]*class="digit">5<\/text>/)[1];
    const dot = +pages.match(/class="grace-dot" cx="[^"]+" cy="([^"]+)"/)[1];
    return { digits: digits.map(match => +match[1]), principal, dot, baseline: +digits[1][2], pages };
  }
  const compact = measure();
  score.engravingStyle = { graceBefore: 6, graceBetween: 5, graceDotLift: 4 };
  const spread = measure();
  assert.ok(spread.principal - spread.digits[1] > compact.principal - compact.digits[1]);
  assert.ok(spread.digits[1] - spread.digits[0] > compact.digits[1] - compact.digits[0]);
  assert.ok(spread.baseline - spread.dot > compact.baseline - compact.dot);
  assert.match(spread.pages, /grace-articulation/);
  assert.equal(scoreTones(score).length, 3);
  group.links = [{ id: 'link', kind: 'tie', from: 'first', to: 'last', fromPitch: 0, toPitch: 0 }];
  assert.match(measure().pages, /grace-inner-tie/);
  assert.equal(scoreTones(score).length, 2);
  const xml = exportMusicXML(openScore(JSON.stringify(score))).xml;
  assert.match(xml, /cj-grace-before-\d+-break/);
  assert.match(xml, /<tied type="start"\/>/);
  assert.match(xml, /<articulations><staccato\/><\/articulations>/);
});
