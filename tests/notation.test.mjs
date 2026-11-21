import test from 'node:test';
import assert from 'node:assert/strict';
import { addSideLane, beatStarts, DEFAULT_SPACING, editTiedPitch, editTiedPitches, isolateFragment, measureTable, moveSpanEnd, newScore, openScore, pruneTies, resizeNote, sound, swapTemporaryVoices, temporaryStack, tonicAt, writeNote } from '../dist/score.js';
import { arcGeometry, arcPath, connected, notation, shortArcRise } from '../dist/notation.js';
import { engrave, localCeiling } from '../dist/engrave.js';
import { exampleScore } from '../dist/sample.js';

const pitch = [{ degree: 5, octave: 4, alter: 0 }];
const insert = (score, at, value, dots = 0, pitches = pitch, lane = 'S') =>
  writeNote(score, { lane, at }, pitches, value, dots);
const soprano = score => notation(score).byLane.get('S');

test('a batch transposition raises each tied pitch once', () => {
  const score = newScore();
  insert(score, 0, 96); insert(score, 96, 96); insert(score, 192, 96);
  const [first, second, third] = score.notes;
  score.spans = [{ kind: 'tie', from: first.id, to: second.id, pitch: 0, targetPitch: 0 }];
  editTiedPitches(score, [first, second, third].map(note => ({ note, index: 0 })), pitch => { pitch.octave++; });
  assert.deepEqual(score.notes.map(note => note.pitches[0].octave), [5, 5, 5]);
});

test('swapping temporary voices moves whole lines and confines the main voice exchange to the side interval', () => {
  const score = newScore();
  const upper = addSideLane(score, 'S', 96, 384);
  const lower = addSideLane(score, upper.id, 192, 384);
  insert(score, 0, 192); insert(score, 192, 96); insert(score, 288, 96); insert(score, 384, 96);
  insert(score, 96, 96, 0, [{ ...pitch[0], degree: 2 }], upper.id);
  insert(score, 192, 96, 0, [{ ...pitch[0], degree: 3 }], lower.id);
  score.notes.find(note => note.lane === upper.id).dynamic = 'p';
  const group = { lane: 'S', at: 192 };
  swapTemporaryVoices(score, group, 2, 3);
  assert.deepEqual(temporaryStack(score, group).map(lane => lane.id), ['S', lower.id, upper.id]);
  swapTemporaryVoices(score, group, 1, 3);
  const reopened = openScore(JSON.stringify(score));
  assert.deepEqual(reopened.notes.filter(note => note.lane === 'S').map(note => [note.at, note.pitches[0].degree, note.dynamic]),
    [[0, 5, undefined], [96, 2, 'p'], [384, 5, undefined]]);
  assert.deepEqual(reopened.notes.filter(note => note.lane === upper.id).map(note => note.at), [96, 192, 288]);
  assert.equal(reopened.notes.find(note => note.lane === lower.id).pitches[0].degree, 3);
});

test('double-dotted half writes a dotted-half extension and tied eighth', () => {
  const score = newScore();
  insert(score, 0, 192, 2);
  const { links } = notation(score);
  const tokens = soprano(score).filter(token => token.note.pitches.length);
  assert.deepEqual(tokens.map(token => [token.at, token.length, token.dots, token.bars, token.tail]), [
    [0, 288, 0, 0, [96, 192]], [288, 48, 0, 1, []]
  ]);
  assert.equal(links[0].short, false);
});

test('offbeat long note takes the opening partial beat first', () => {
  const score = newScore();
  insert(score, 48, 192);
  const { links } = notation(score);
  const tokens = soprano(score).filter(token => token.note.pitches.length);
  assert.deepEqual(tokens.map(token => [token.at, token.length, token.tail]), [[48, 48, []], [96, 144, []]]);
  assert.equal(links[0].short, true);
});

test('6/8 groups by two compound beats and never puts an extension off beat', () => {
  const score = newScore(6, 8);
  insert(score, 0, 192, 1);
  const { measures } = notation(score);
  const tokens = soprano(score).filter(token => token.note.pitches.length);
  assert.deepEqual(beatStarts(score, measures[0]), [0, 144]);
  assert.deepEqual(tokens.map(token => [token.at, token.length, token.dots, token.tail]), [[0, 144, 1, []], [144, 144, 1, []]]);
});

test('rests share the beam rule with notes and never use extensions', () => {
  const score = newScore();
  insert(score, 0, 48, 1);
  insert(score, 72, 24, 0, []);
  insert(score, 96, 192, 0, []);
  const tokens = soprano(score).filter(token => token.at < 288);
  assert.equal(connected(tokens[0], tokens[1], 1), true);
  assert.equal(connected(tokens[0], tokens[1], 2), false);
  assert.deepEqual(tokens.slice(2).map(token => [token.at, token.length, token.tail]), [[96, 96, []], [192, 96, []]]);
});

test('weak pickup is not silently turned into a full measure', () => {
  const score = newScore(4, 4, 48);
  const measures = measureTable(score);
  assert.deepEqual([measures[0].number, measures[1].start, measures[1].number], [0, 48, 1]);
  assert.deepEqual(beatStarts(score, measures[0]), []);
  assert.deepEqual(beatStarts(score, measures[1]), [48, 144, 240, 336]);
});

test('short tie spans a measure boundary; long path uses circular shoulders', () => {
  const score = newScore();
  insert(score, 336, 96);
  const { links } = notation(score);
  assert.equal(links[0].short, true);
  assert.match(arcPath([20, 40], [100, 42], true, 30), / Q/);
  assert.equal(arcPath([20, 40], [100, 42], false, 30), 'M20 40 A10 10 0 0 1 30 30 H88 A12 12 0 0 1 100 42');
  assert.equal(arcPath([20, 30], [100, 30], false, 30, false, false), 'M20 30 H100');
});

test('overwriting a main lane does not move the side lane or other singers', () => {
  const score = newScore();
  const side = addSideLane(score, 'S', 48, 192);
  insert(score, 0, 192);
  insert(score, 48, 96, 0, pitch, side.id);
  insert(score, 0, 96, 0, pitch, 'A');
  insert(score, 48, 48);
  assert.deepEqual(score.notes.filter(note => note.lane === 'S').map(note => note.at), [0, 48, 96]);
  assert.deepEqual(score.notes.filter(note => note.lane !== 'S').map(note => note.at), [0, 48]);
  assert.deepEqual(openScore(JSON.stringify(score)), JSON.parse(JSON.stringify(score)));
});

test('layout uses one shared horizontal position and escapes project text', () => {
  const score = newScore();
  insert(score, 0, 96);
  insert(score, 0, 96, 0, [{ ...pitch[0], degree: 6 }], 'A');
  score.title = '<script>';
  score.notes[0].lyric = '较长的歌词';
  const { pages } = engrave(score, { lane: 'S', at: 0 }, null);
  const digits = [...pages.matchAll(/<text x="([^"]+)" y="[^"]+" text-anchor="middle" class="digit">([56])<\/text>/g)];
  assert.equal(digits.length, 2);
  assert.equal(digits[0][1], digits[1][1]);
  assert.ok(pages.includes('&lt;script&gt;'));
});

test('sample round-trips and a forced page break preserves both arc fragments', () => {
  const score = openScore(JSON.stringify(exampleScore()));
  const lane = score.lanes[0].id;
  const boundary = measureTable(score)[1].start;
  const notes = score.notes.filter(note => note.lane === lane && note.pitches.length);
  score.spans.push({ kind: 'slur', from: notes.find(note => note.at < boundary).id, to: notes.find(note => note.at >= boundary + 96).id });
  score.measures[1].system = 'page';
  const { count, pages } = engrave(score, { lane, at: 0 }, null);
  assert.ok(count >= 2);
  const [first, second] = pages.split('</svg>');
  assert.ok(first.includes('class="arc slur"'));
  assert.ok(second.includes('class="arc slur"'));
});

test('dynamic clearance ignores obstacles outside its horizontal interval', () => {
  const boxes = [{ left: 40, right: 65, top: 70 }, { left: 120, right: 145, top: 44 }];
  assert.equal(localCeiling(92, 45, 56, boxes), 70);
  assert.equal(localCeiling(92, 75, 105, boxes), 92);
  assert.equal(localCeiling(92, 67, 130, boxes), 44);
});

test('shortening fills the released duration without moving later notes', () => {
  const score = newScore();
  insert(score, 0, 96);
  insert(score, 96, 96);
  const [first, second] = score.notes;
  const id = first.id;
  resizeNote(score, first, 48, 0);
  assert.deepEqual([first.id, first.at, first.length, second.at], [id, 0, 48, 96]);
  const rest = soprano(score).find(token => token.at === 48);
  assert.equal(rest.length, 48);
  assert.equal(rest.note.pitches.length, 0);
});

test('lengthening covers later notes and keeps the uncovered tail at its true time', () => {
  const score = newScore();
  insert(score, 0, 96);
  insert(score, 96, 48);
  insert(score, 144, 96);
  insert(score, 96, 96, 0, pitch, 'A');
  const first = score.notes.find(note => note.lane === 'S');
  score.notes.find(note => note.at === 144).lyric = '旧起音';
  resizeNote(score, first, 192, 0);
  const notes = score.notes.filter(note => note.lane === 'S');
  assert.deepEqual(notes.map(note => [note.at, note.length, note.lyric]), [[0, 192, undefined], [192, 48, undefined]]);
  assert.equal(score.notes.find(note => note.lane === 'A').at, 96);
});

test('empty measures fill by beat, including compound pickup and bounded side lane', () => {
  const score = newScore(6, 8, 48);
  const side = addSideLane(score, 'S', 96, 240);
  const { byLane } = notation(score);
  const rests = byLane.get('S');
  assert.equal(rests[0].length, 48);
  assert.ok(rests.some(token => token.at === 96));
  assert.ok(rests.some(token => token.at === 240));
  assert.deepEqual(rests.filter(token => token.at >= 336 && token.at < 624).map(token => [token.at, token.length, token.dots]), [
    [336, 144, 1], [480, 144, 1]
  ]);
  assert.equal(byLane.get(side.id)[0].at, 96);
  assert.equal(byLane.get(side.id).reduce((sum, token) => sum + token.length, 0), 144);
  for (const lane of byLane.values()) assert.ok(lane.every(token => !token.note.pitches.length && !token.tail.length));
});

test('editing a split digit can replace only that piece while preserving later pitches', () => {
  const score = newScore(3, 4);
  insert(score, 192, 384);
  const tokens = soprano(score).filter(token => token.note.pitches.length);
  assert.deepEqual(tokens.map(token => [token.at, token.length]), [[192, 96], [288, 288]]);
  const first = isolateFragment(score, tokens[0].note, tokens[0].at, tokens[0].length);
  first.pitches = [];
  pruneTies(score);
  const kept = score.notes.find(note => note.at === 288);
  assert.equal(kept.pitches[0].degree, 5);
  assert.equal(kept.length, 288);
  assert.equal(notation(score).links.length, 0);
});

test('isolating and deleting the middle of a long note preserves both ends without tying across a rest', () => {
  const score = newScore(2, 4);
  insert(score, 96, 384, 1);
  const [first, middle] = soprano(score).filter(token => token.note.pitches.length);
  isolateFragment(score, middle.note, middle.at, middle.length).pitches = [];
  pruneTies(score);
  assert.equal(soprano(score).find(token => token.at === first.at).note.pitches[0].degree, 5);
  assert.equal(soprano(score).find(token => token.at === middle.at).note.pitches.length, 0);
  assert.equal(soprano(score).find(token => token.at === middle.at + middle.length).note.pitches[0].degree, 5);
  assert.ok(notation(score).links.every(link => link.to.at <= middle.at || link.from.at >= middle.at + middle.length));
});

test('repitch follows the tied pitch in a chord without changing its neighbours', () => {
  const score = newScore();
  const other = { degree: 2, octave: 4, alter: 0 };
  insert(score, 0, 96, 0, [{ ...pitch[0] }, { ...other }]);
  insert(score, 96, 96, 0, [{ ...other }, { ...pitch[0] }]);
  insert(score, 192, 96, 0, [{ ...pitch[0] }]);
  const [first, second, third] = score.notes;
  score.spans.push(
    { kind: 'tie', from: first.id, to: second.id, pitch: 0, targetPitch: 1 },
    { kind: 'tie', from: second.id, to: third.id, pitch: 1, targetPitch: 0 }
  );
  editTiedPitch(score, second, 1, item => { item.degree = 6; item.octave = 5; item.alter = -1; });
  assert.deepEqual(score.notes.map(note => note.pitches.map(item => [item.degree, item.octave, item.alter])), [
    [[6, 5, -1], [2, 4, 0]], [[2, 4, 0], [6, 5, -1]], [[6, 5, -1]]
  ]);
  assert.equal(openScore(JSON.stringify(score)).spans.length, 2);
});

test('a manual roof stays fixed while very tight short arcs flatten automatically', () => {
  const controlHeight = geometry => Number(geometry.match(/Q[\d.]+ ([\d.-]+)/)?.[1]);
  assert.equal(controlHeight(arcPath([20, 40], [35, 40], true, 31)), 22);
  assert.equal(controlHeight(arcPath([20, 40], [105, 40], true, 31)), 22);
  assert.match(arcPath([20, 40], [105, 40], false, 30), /A10 10.*H95 A10 10/);
  assert.ok(shortArcRise(12, 16) < 3 && shortArcRise(20, 16) > shortArcRise(12, 16));
  assert.equal(shortArcRise(30, 16), shortArcRise(70, 16));
  const compact = arcGeometry([20, 40], [37, 44], false, 22);
  assert.equal(compact.middle[1], 22);
  assert.match(compact.path, / A\S+ 18 .* H\S+ A\S+ 22 /);
});

test('an extension has its own selection without becoming an input digit', () => {
  const score = newScore();
  insert(score, 0, 192);
  const cursor = { lane: 'S', at: 0 };
  const normal = engrave(score, cursor, null).pages;
  const input = engrave(score, cursor, null, null, true).pages;
  assert.doesNotMatch(normal, /class="(selection|hit|input-cursor)"/);
  assert.match(normal, /class="score-element picked"/);
  assert.equal((input.match(/class="input-cursor"/g) ?? []).length, 1);
  assert.doesNotMatch(input, /class="score-element picked"/);
  const atTail = score.notes[0].id + '&quot;,&quot;at&quot;:96';
  assert.match(normal, new RegExp('&quot;extension&quot;,&quot;id&quot;:&quot;' + atTail));
  assert.doesNotMatch(normal, new RegExp('&quot;pitch&quot;,&quot;id&quot;:&quot;' + atTail));
});

test('line endpoint changes stay in the voice and cannot reverse the line', () => {
  const score = newScore();
  for (const at of [0, 96, 192]) insert(score, at, 96);
  const [first, second, third] = score.notes;
  score.spans.push({ kind: 'crescendo', from: first.id, to: second.id });
  moveSpanEnd(score, 0, 'to', 1);
  assert.equal(score.spans[0].to, third.id);
  assert.throws(() => moveSpanEnd(score, 0, 'to', 1), /端点/);
});

test('layout parameters persist and change both horizontal and vertical placement', () => {
  const score = newScore();
  score.justifyBottom = false;
  insert(score, 0, 96);
  insert(score, 0, 96, 0, pitch, 'A');
  const coordinates = project => [...engrave(project, { lane: 'S', at: 0 }, null).pages
    .matchAll(/<text x="([^"]+)" y="([^"]+)" text-anchor="middle" class="digit">5</g)]
    .map(match => [Number(match[1]), Number(match[2])]);
  const rows = project => [...engrave(project, { lane: 'S', at: 0 }, null).pages
    .matchAll(/class="voice-row" transform="translate\(0 ([^)]+)\)"/g)].map(match => Number(match[1]));
  const before = coordinates(score);
  const beforeRows = rows(score);
  score.spacing = { ...DEFAULT_SPACING, note: 22, voice: 22, marginX: 78 };
  const after = coordinates(openScore(JSON.stringify(score)));
  assert.ok(after[0][0] > before[0][0]);
  const afterRows = rows(openScore(JSON.stringify(score)));
  assert.equal(afterRows[1] - afterRows[0] - (beforeRows[1] - beforeRows[0]), 13);
});

test('4/4 groups four eighths by beat and joins sixteenths through rests within a beat', () => {
  const score = newScore();
  for (const at of [192, 240, 288, 336]) insert(score, at, 48);
  for (const at of [96, 120, 144, 168]) insert(score, at, 24, 0, at === 96 || at === 168 ? [] : pitch, 'A');
  const { byLane } = notation(score);
  const eighths = byLane.get('S').filter(token => token.at >= 192 && token.at < 384);
  const sixteenths = byLane.get('A').filter(token => token.at >= 96 && token.at < 192);
  assert.deepEqual(eighths.slice(1).map((token, index) => connected(eighths[index], token, 1)), [true, false, true]);
  for (const level of [1, 2]) assert.ok(sixteenths.slice(1).every((token, index) => connected(sixteenths[index], token, level)));
});

test('bare adjacent digits can approach a 12-unit centre distance', () => {
  const score = newScore();
  score.spacing = { ...DEFAULT_SPACING, note: 6 };
  for (let at = 0; at < 3 * 384; at += 24) insert(score, at, 24);
  const positions = [...engrave(score, { lane: 'S', at: 0 }, null).pages
    .matchAll(/<text x="([^"]+)" y="[^"]+" text-anchor="middle" class="digit">5/g)];
  const distance = Number(positions[1][1]) - Number(positions[0][1]);
  assert.ok(distance >= 12 && distance < 13);
});

test('meter changes govern beats and splitting at a modulation preserves actual pitch', () => {
  const score = newScore();
  score.measures[1] = { length: 192, tonic: 2, meter: { numerator: 2, denominator: 4, groups: [1, 1] } };
  insert(score, 288, 192);
  const token = soprano(score).find(item => item.at === 384);
  const continued = isolateFragment(score, token.note, token.at, token.length);
  assert.equal(sound(continued.pitches[0], tonicAt(score, 384)), sound(pitch[0], 0));
  assert.equal(openScore(JSON.stringify(score)).spans.length, 1);
  assert.deepEqual(beatStarts(score, measureTable(score)[1]), [384, 480]);
});
