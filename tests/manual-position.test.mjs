import test from 'node:test';
import assert from 'node:assert/strict';
import { appearanceKey, engrave, moveColumns, wedgeClearance } from '../dist/engrave.js';
import { exportMusicXML } from '../dist/musicxml-export.js';
import { arrangePlayback, repeatIntervals, scoreTones } from '../dist/playback.js';
import { newScore, openScore, setBoundaryStyle, setEndingRange, writeNote } from '../dist/score.js';

const cursor = { lane: 'S', at: 0 };
const pitch = { degree: 1, octave: 4, alter: 0 };

test('moving a column pushes only the neighbors needed for clearance and stops at the boundary', () => {
  const points = [0, 10, 20, 30, 50];
  const minimums = [6, 8, 8, 9];
  assert.deepEqual(moveColumns(points, minimums, [0, 6]), [0, 16, 24, 32, 50]);
  assert.deepEqual(moveColumns(points, minimums, [0, 900]), [0, 25, 33, 41, 50]);
  assert.deepEqual(moveColumns(points, minimums, [0, 0, -18]), [0, 6, 14, 30, 50]);
});

function digitX(score, at) {
  const html = engrave(score, cursor, null).pages;
  const digit = html.match(new RegExp(`&quot;at&quot;:${at},&quot;index&quot;:0}[^>]*><text x="([^"]+)"`));
  assert.ok(digit);
  return Number(digit[1]);
}

test('accidentals leave room for their ink once and aligned columns can still close the gap', () => {
  const score = newScore();
  for (let at = 0; at < 384; at += 24) writeNote(score, { ...cursor, at }, [pitch], 24, 0);
  score.notes.find(note => note.at === 168).pitches[0].alter = 1;
  const before = digitX(score, 168) - digitX(score, 144);
  assert.ok(before < 48, `a single accidental opened a ${before}-unit gap`);
  score.columns = { 168: -5 };
  assert.ok(digitX(score, 168) - digitX(score, 144) < before);
});

test('lyric clearance applies to words in the same voice and verse, including across intermediate columns', () => {
  const score = newScore();
  for (const lane of ['S', 'A']) for (let at = 0; at < 384; at += 24) writeNote(score, { lane, at }, [pitch], 24, 0);
  const alto = score.notes.find(note => note.lane === 'A' && note.at === 168);
  const soprano = score.notes.find(note => note.lane === 'S' && note.at === 192);
  alto.lyric = 'bong...';
  const before = digitX(score, 192) - digitX(score, 168);
  soprano.lyric = 'Bong...';
  assert.equal(digitX(score, 192) - digitX(score, 168), before);
  score.notes.find(note => note.lane === 'A' && note.at === 216).lyric = 'Bong...';
  score.columns = { 192: -5, 216: -100 };
  assert.ok(digitX(score, 216) - digitX(score, 168) >= 60 - 1e-7);
  assert.ok(digitX(score, 192) > digitX(score, 168));
});

test('wedge clearance checks intervening ink and the opening at its own horizontal position', () => {
  const mark = { top: -21, bottom: -8 };
  const away = wedgeClearance(-10, 10, 110, 0, 4, [{ ...mark, left: 120, right: 140 }]);
  const nearTip = wedgeClearance(-10, 10, 110, 0, 4, [{ ...mark, left: 24, right: 28 }]);
  const nearOpening = wedgeClearance(-10, 10, 110, 0, 4, [{ ...mark, left: 86, right: 90 }]);
  assert.equal(away, 0);
  assert.ok(nearOpening < nearTip && nearTip < -13);
});

test('adjacent measures with tied chords keep the lower long curve low and leave the upper curve separate', () => {
  const score = newScore(3, 4);
  const chord = [{ ...pitch, degree: 6 }, { ...pitch, octave: 5 }];
  for (const at of [0, 288, 576]) writeNote(score, { ...cursor, at }, chord, 288, 0);
  const [first, middle, last] = score.notes;
  for (const [from, to] of [[first, middle], [middle, last]]) for (const index of [0, 1])
    score.spans.push({ kind: 'tie', from: from.id, to: to.id, pitch: index, targetPitch: index });
  const html = engrave(score, cursor, null).pages;
  const curves = [...html.matchAll(/<path d="M[\d.]+ (-?[\d.]+) A[\d.]+ ([\d.]+) [^"]+" class="arc tie"/g)];
  assert.equal(curves.length, 4);
  for (const [, start, rise] of curves) assert.ok(Math.abs(+rise - 8) < 1e-7, `unexpected rise from ${start}`);
  const starts = curves.map(([, start]) => +start);
  assert.equal(new Set(starts).size, 2);
  assert.ok(Math.max(...starts) - Math.min(...starts) > 8);
});

test('words before a note reserve a shared time-column gap that grows when dragged', () => {
  const score = newScore();
  for (const lane of ['S', 'A']) for (const at of [0, 96, 192, 288]) writeNote(score, { lane, at }, [pitch], 96, 0);
  const note = score.notes.find(note => note.at === 96 && note.lane === 'S');
  const pick = { kind: 'mark', id: note.id, field: 'interNoteText' };
  const key = appearanceKey(pick);
  const distance = () => digitX(score, 96) - digitX(score, 0);
  const without = distance();
  note.interNoteText = '(sotto voce)';
  const natural = distance();
  assert.ok(natural > without + 20);
  score.appearance = { [key]: { placement: { x: 30 } } };
  assert.ok(distance() > natural);
  score.columns = { 96: -999 };
  const pages = engrave(score, cursor, null, pick).pages;
  const textX = +pages.match(/&quot;field&quot;:&quot;interNoteText&quot;[^}]*}[^>]*>(?:<g[^>]*>)?<text x="([^"]+)"/)[1];
  const digits = [...pages.matchAll(/&quot;at&quot;:96,&quot;index&quot;:0}[^>]*><text x="([^"]+)"/g)];
  assert.equal(digits.length, score.lanes.length);
  assert.equal(new Set(digits.map(match => +match[1])).size, 1);
  assert.ok(digitX(score, 0) < textX && textX < +digits[0][1]);
  score.appearance[key].layout = false;
  const turnedOff = distance();
  delete note.interNoteText;
  assert.equal(turnedOff, distance());
  note.interNoteText = '(sotto voce)';
  assert.equal(openScore(JSON.stringify(score)).notes.find(item => item.id === note.id).interNoteText, note.interNoteText);
  assert.match(exportMusicXML(score).xml, /<words>\(sotto voce\)<\/words>/);
});

test('the double-sharp is one musical symbol and a visual end offset leaves the other end and anchors fixed', () => {
  const score = newScore();
  writeNote(score, cursor, [{ ...pitch, alter: 2 }], 96, 0);
  writeNote(score, { ...cursor, at: 192 }, [pitch], 96, 0);
  const [from, to] = score.notes;
  score.spans.push({ kind: 'crescendo', from: from.id, to: to.id });
  const pick = { kind: 'span', index: 0 };
  const positions = html => Object.fromEntries([...html.matchAll(/data-endpoint="(from|to)" x="([^"]+)"/g)].map(([, end, x]) => [end, +x]));
  const render = () => engrave(score, cursor, null, pick).pages;
  const before = render();
  assert.match(before, /<path class="accidental solid double-sharp" aria-label="𝄪"/u);
  score.spans[0].appearance = { placement: { to: 5, edge: 'to' } };
  const after = positions(render());
  assert.equal(after.from, positions(before).from);
  assert.equal(after.to, positions(before).to + 5);
  assert.equal(openScore(JSON.stringify(score)).spans[0].to, to.id);
});

test('inter-note text stops at its outer limit without shifting digits on either side', () => {
  const score = newScore();
  for (const at of [0, 96, 192, 288]) writeNote(score, { ...cursor, at }, [pitch], 96, 0);
  const note = score.notes.find(note => note.at === 96);
  note.interNoteText = 'solo';
  const key = appearanceKey({ kind: 'mark', id: note.id, field: 'interNoteText' });
  const render = () => engrave(score, cursor, null).pages;
  for (const [noteSide, sign] of [['left', -1], ['right', 1]]) {
    const look = { noteSide, placement: { x: 0 } };
    score.appearance = { [key]: look };
    const pages = render();
    const textX = +pages.match(/<text x="([^"]+)"[^>]*>solo<\/text>/)[1];
    assert.ok(sign * (textX - digitX(score, 96)) > 0);
    const original = [0, 96, 192].map(at => digitX(score, at));
    look.placement.x = sign * 900;
    assert.deepEqual([0, 96, 192].map(at => digitX(score, at)), original);
    const atEdge = render();
    look.placement.x = sign * 1200;
    assert.equal(render(), atEdge);
    assert.equal(openScore(JSON.stringify(score)).appearance[key].noteSide, noteSide);
  }
});

test('lowered inter-note words only displace lyrics they actually overlap', () => {
  const score = newScore();
  for (const at of [0, 96, 192, 288]) writeNote(score, { ...cursor, at }, [pitch], 96, 0);
  const note = score.notes.find(note => note.at === 96);
  note.lyric = 'longer lyric';
  score.notes.find(note => note.at === 288).lyric = 'far';
  note.interNoteText = 'word';
  const key = appearanceKey({ kind: 'mark', id: note.id, field: 'interNoteText' });
  const baseline = word => +engrave(score, cursor, null).pages.match(new RegExp(`<text x="[^"]+" y="([^"]+)"[^>]*class="lyric">${word}</text>`))[1];
  const near = baseline('longer lyric');
  const far = baseline('far');
  score.appearance = { [key]: { placement: { y: near + 2 } } };
  assert.ok(baseline('longer lyric') > near);
  assert.equal(baseline('far'), far);
});

test('each of the three text marks can attach to a separate extension without splitting the sound', () => {
  const score = newScore();
  writeNote(score, cursor, [pitch], 384, 0);
  const note = score.notes[0];
  note.extensionText = { 96: { interNoteText: 'inner', text: 'gentle' }, 192: { rehearsal: 'Section' } };
  const mark = { kind: 'mark', id: note.id, field: 'interNoteText', extension: 96 };
  score.appearance = { [appearanceKey(mark)]: { noteSide: 'right' } };
  const restored = openScore(JSON.stringify(score));
  assert.equal(restored.notes.length, 1);
  const html = engrave(restored, cursor, null, mark).pages;
  for (const [offset, word] of [[96, 'inner'], [96, 'gentle'], [192, 'Section']])
    assert.match(html, new RegExp(`&quot;extension&quot;:${offset}[^>]*>[^]*?>${word}</text>`));
  const xml = exportMusicXML(restored).xml;
  assert.match(xml, /<!-- Choral Jianpu extension-text IDs/);
  assert.match(xml, /id="shupu-extension-interNoteText-right-\d+"/);
  assert.match(xml, /<words>gentle<\/words><\/direction-type><offset>96<\/offset>/);
  assert.match(xml, /<rehearsal>Section<\/rehearsal><\/direction-type><offset>192<\/offset>/);
});

test('partial first ending includes its terminal note and preserves the surrounding music on the second pass', () => {
  const score = newScore();
  for (let at = 0; at < 384; at += 96) writeNote(score, { ...cursor, at }, [pitch], 96, 0);
  setBoundaryStyle(score, 0, 'repeat-start');
  setBoundaryStyle(score, 1, 'repeat-end');
  score.boundaries[1].repeats = 1;
  const ending = { start: 0, end: 0, passes: [1] };
  setEndingRange(score, ending, 96, 288);
  score.endings = [ending];
  const restored = openScore(JSON.stringify(score));
  const order = repeatIntervals(restored, 0, 0);
  assert.deepEqual(order.map(item => [item.start, item.end]), [[0, 384], [0, 96], [288, 384]]);
  const plan = arrangePlayback(restored, scoreTones(restored), order);
  assert.equal(plan.length, 576);
  assert.equal(plan.positionAt(480), 288);
  assert.match(exportMusicXML(restored).xml, /<barline location="middle"><bar-style>none<\/bar-style><ending number="1" type="start"\/>/);
});
