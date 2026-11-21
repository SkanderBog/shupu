import test from 'node:test';
import assert from 'node:assert/strict';
import { engrave } from '../dist/engrave.js';
import { lyricPlainText } from '../dist/lyric-input.js';
import { exportMusicXML } from '../dist/musicxml-export.js';
import { addSideLane, beatStarts, boundaryAt, deleteMeasures, insertBlankMeasure, keyName, measureTable, newScore, openScore, removeLanes, setBoundaryBreak, setBoundaryStyle, setKeySignature, setMeasureLength, sound, tonicAt, writeNote } from '../dist/score.js';

const cursor = { lane: 'S', at: 0 };
const pitch = { degree: 1, octave: 4, alter: 0 };

test('inserting from the bar template leaves the new interval empty and rebases boundary objects', () => {
  const score = newScore();
  const side = addSideLane(score, 'S', 288, 720);
  setMeasureLength(score, 1, 144, false);
  const formerEnd = side.end;
  Object.assign(score.measures[1], { actualMeter: { numerator: 3, denominator: 8, groups: [3] },
    numberDisplay: 'show', numberStep: 0, highlights: { [side.id]: { color: '#112233', opacity: 40 } } });
  setBoundaryStyle(score, 1, 'repeat-both');
  setBoundaryBreak(score, 1, 'line');
  score.endings = [{ start: 1, end: 1, passes: [1] }];
  writeNote(score, { lane: 'S', at: 288 }, [pitch], 192, 0);
  score.notes[0].beams = { 288: 'auto', 384: 'break' };
  assert.equal(insertBlankMeasure(score, 1, false), 1);
  const loaded = openScore(JSON.stringify(score));
  const bars = measureTable(loaded);
  assert.deepEqual(bars.slice(0, 3).map(bar => [bar.length, bar.number]), [[384, 1], [144, 1], [144, 1]]);
  assert.deepEqual(loaded.measures[1].highlights, loaded.measures[2].highlights);
  assert.deepEqual(loaded.notes.map(note => [note.at, note.length, note.beams]), [
    [288, 96, { 288: 'auto' }], [528, 96, { 528: 'break' }]
  ]);
  assert.deepEqual([boundaryAt(loaded, 1).style, boundaryAt(loaded, 2).style, boundaryAt(loaded, 2).break],
    ['repeat-end', 'repeat-start', 'line']);
  assert.equal(loaded.endings[0].start, 2);
  assert.equal(loaded.lanes.find(lane => lane.id === side.id).end, formerEnd + 144);
  assert.equal(loaded.spans.length, 0);
});

test('deleting consecutive and separated measures carries the first removed numbers and the survivor tonal context', () => {
  const score = newScore();
  score.measures.push({ length: 384 }, { length: 384 });
  score.measures[1].number = '2a';
  score.measures[1].key = { fifths: -1, degree: 1 };
  const side = addSideLane(score, 'S', 384, 768);
  writeNote(score, { lane: side.id, at: 384 }, [pitch], 96, 0);
  for (const at of [672, 1152, 1920]) writeNote(score, { lane: 'S', at }, [pitch], 96, 0);
  score.endings = [{ start: 1, end: 3, passes: [1] }];
  assert.equal(deleteMeasures(score, [4, 1, 2, 2]), 1);
  const loaded = openScore(JSON.stringify(score));
  assert.deepEqual(measureTable(loaded).map(bar => [bar.number, bar.key.fifths]), [[1, 0], ['2a', -1], [3, -1]]);
  assert.deepEqual(loaded.notes.map(note => note.at), [384, 768]);
  assert.equal(loaded.lanes.some(lane => lane.id === side.id), false);
  assert.deepEqual([loaded.endings[0].start, loaded.endings[0].end], [1, 1]);
});

test('deleting every measure leaves only the former last measure with empty music', () => {
  const score = newScore();
  score.measures[3].number = '11b';
  setMeasureLength(score, 3, 144, false);
  score.measures[3].actualMeter = { numerator: 3, denominator: 8, groups: [3] };
  score.measures[3].highlights = { S: { color: '#234567', opacity: 45 } };
  writeNote(score, cursor, [pitch], 96, 0);
  setBoundaryStyle(score, 0, 'repeat-start');
  deleteMeasures(score, [0, 1, 2, 3]);
  const loaded = openScore(JSON.stringify(score));
  assert.deepEqual(measureTable(loaded).map(bar => [bar.length, bar.number, bar.actualMeter.numerator]), [[144, '11b', 3]]);
  assert.equal(loaded.measures[0].highlights.S.opacity, 45);
  assert.equal(loaded.notes.length, 0);
  assert.equal(boundaryAt(loaded, 0).style, 'normal');
});

test('breath variants round-trip as standard shapes and the global number visibility leaves volta labels', () => {
  const score = newScore();
  writeNote(score, cursor, [{ ...pitch, alter: 2 }, { ...pitch, degree: 3 }], 96, 0);
  writeNote(score, { ...cursor, at: 96 }, [pitch], 96, 0);
  score.notes[0].breath = true;
  score.notes[1].breath = 'comma';
  score.measures[1].numberDisplay = 'show';
  score.measureNumbers = 'hide';
  score.endings = [{ start: 1, end: 1, passes: [1] }];
  const loaded = openScore(JSON.stringify(score));
  const drawing = engrave(loaded, cursor, null).pages;
  assert.doesNotMatch(drawing, /class="measure-number"/);
  assert.match(drawing, /class="ending-pass-number">1\./);
  assert.match(drawing, /scale\(0\.82\)[^>]*><path class="accidental solid double-sharp" aria-label="𝄪"/u);
  assert.match(drawing, /class="breath-upbow"/);
  assert.match(drawing, /class="solid breath-comma"/);
  assert.match(exportMusicXML(loaded).xml, /<breath-mark>upbow<\/breath-mark>[\s\S]*<breath-mark>comma<\/breath-mark>/);
});

test('renumbering starts at the edited bar and number visibility leaves the music timeline intact', () => {
  const score = newScore();
  score.measures.forEach((measure, i) => { measure.number = String(i + 10); });
  Object.assign(score.measures[1], { numberStep: 0, numberDisplay: 'show' });
  Object.assign(score.measures[2], { numberStep: -2, numberDisplay: 'hide' });
  setBoundaryBreak(score, 2, 'line');
  const loaded = openScore(JSON.stringify(score));
  const bars = measureTable(loaded);
  assert.deepEqual(bars.map(bar => [bar.number, bar.start]), [['10', 0], [10, 384], [8, 768], [9, 1152]]);
  const drawing = engrave(loaded, cursor, null).pages;
  assert.deepEqual([...drawing.matchAll(/class="measure-number">([^<]+)/g)].map(mark => mark[1]), ['10', '10']);
  assert.match(exportMusicXML(loaded).xml, /<measure number="8">/);
});

test('highlights are attached to the selected voice and removed with a deleted divisi lane', () => {
  const score = newScore();
  const side = addSideLane(score, 'S', 384, 768);
  score.measures[1].highlights = { [side.id]: { color: '#123456', opacity: 35 } };
  const restored = openScore(JSON.stringify(score));
  const drawing = engrave(restored, cursor, null).pages;
  const highlights = [...drawing.matchAll(/class="measure-highlight" data-highlight-lane="([^"]+)" data-highlight-measure="(\d+)"[^>]*fill="([^"]+)" fill-opacity="([^"]+)"/g)];
  assert.deepEqual(highlights.map(match => match.slice(1)), [[side.id, '1', '#123456', '0.35']]);
  removeLanes(restored, new Set([side.id]));
  assert.equal(restored.measures[1].highlights, undefined);
});

test('actual pickup meter and printed meter stay independent and survive project and XML export', () => {
  const score = newScore();
  const printed = { numerator: 6, denominator: 8, groups: [3, 3] };
  const actual = { numerator: 1, denominator: 8, groups: [1] };
  Object.assign(score.measures[0], { meter: printed, actualMeter: actual, pickup: true });
  setMeasureLength(score, 0, 48, true);
  score.measures[1].meter = { numerator: 4, denominator: 4, groups: [1, 1, 1, 1] };
  const loaded = openScore(JSON.stringify(score));
  const [pickup, full] = measureTable(loaded);
  assert.deepEqual([pickup.number, pickup.end, pickup.meter.numerator, pickup.actualMeter.numerator, full.number], [0, 48, 6, 1, 1]);
  assert.deepEqual(beatStarts(score, pickup), []);
  assert.match(engrave(loaded, cursor, null).pages, /class="signature-meter">6<\/text><line[^>]*class="signature-fraction"\/><text[^>]*class="signature-meter">8<\/text>/);
  assert.match(exportMusicXML(loaded).xml, /shupu-bar-settings/);
});

test('preserving music in a shortened bar inserts its overflow and keeps the following hard boundary', () => {
  const score = newScore();
  writeNote(score, { ...cursor, at: 288 }, [pitch], 96, 0);
  setBoundaryBreak(score, 1, 'line');
  setMeasureLength(score, 0, 192, true);
  const restored = openScore(JSON.stringify(score));
  assert.deepEqual(restored.measures.slice(0, 3).map(bar => bar.length), [192, 192, 384]);
  assert.equal(restored.notes[0].at, 288);
  assert.equal(boundaryAt(restored, 2).break, 'line');
});

test('relative minor and enharmonic key spelling preserve sounding pitches and encode the exact fifths', () => {
  const score = newScore();
  writeNote(score, cursor, [pitch], 96, 0);
  setKeySignature(score, 0, { degree: 6, fifths: 7 }, true);
  const table = measureTable(score);
  assert.equal(keyName(table[0].key), '6=A♯');
  assert.equal(table[1].key.fifths, 0);
  assert.equal(sound(score.notes[0].pitches[0], tonicAt(score, 0)), 60);
  assert.match(exportMusicXML(score).xml, /<key><fifths>7<\/fifths><mode>minor<\/mode><\/key>/);
});

test('adjacent ties share their roof level and each system gets the curved choir bracket', () => {
  const score = newScore();
  for (const at of [0, 96, 192]) writeNote(score, { ...cursor, at }, [pitch], 96, 0);
  const [a, b, c] = score.notes;
  score.spans.push({ kind: 'tie', from: a.id, to: b.id, pitch: 0, targetPitch: 0 },
    { kind: 'tie', from: b.id, to: c.id, pitch: 0, targetPitch: 0 });
  setBoundaryBreak(score, 1, 'line');
  const html = engrave(score, cursor, null).pages;
  const control = [...html.matchAll(/Q[\d.]+ (-[\d.]+) [^"<]*" class="arc tie"/g)].map(match => match[1]);
  assert.equal(control.length, 2);
  assert.equal(control[0], control[1]);
  assert.equal((html.match(/class="solid choral-bracket"/g) ?? []).length, 2);
});

test('overlapping temporary voices have shared curly ends and chord pitches stack upward', () => {
  const score = newScore();
  const lower = addSideLane(score, 'S', 96, 288);
  addSideLane(score, 'S', 96, 288);
  writeNote(score, cursor, [pitch, { ...pitch, degree: 5 }], 96, 0);
  writeNote(score, { lane: lower.id, at: 96 }, [pitch], 96, 0);
  const loaded = openScore(JSON.stringify(score));
  const html = engrave(loaded, cursor, null).pages;
  assert.equal((html.match(/class="divisi-bracket"/g) ?? []).length, 2);
  const chord = [...html.matchAll(/scale\(1 0\.75\)"><text[^>]+y="(-?[\d.]+)"[^>]*>([15])<\/text>/g)];
  assert.deepEqual(chord.map(glyph => glyph[2]), ['5', '1']);
  assert.ok(Number(chord[0][1]) < Number(chord[1][1]));
});

test('a temporary voice can insert a sibling directly below itself and its notes split at stack boundaries', () => {
  const score = newScore();
  const first = addSideLane(score, 'S', 96, 384);
  const second = addSideLane(score, 'S', 96, 384);
  const between = addSideLane(score, second.id, 192, 480);
  assert.deepEqual(score.lanes.slice(0, 4).map(lane => lane.id), ['S', second.id, between.id, first.id]);
  assert.deepEqual([between.parent, between.start, between.end], ['S', 192, 384]);
  writeNote(score, { lane: second.id, at: 96 }, [pitch], 192, 0);
  const drawing = engrave(openScore(JSON.stringify(score)), cursor, null).pages;
  assert.equal((drawing.match(/class="arc tie"/g) ?? []).length, 1);
});

test('plain lyrics keep Chinese punctuation tight and join English syllables without losing literal hyphens', () => {
  const words = [{ text: '月' }, { text: '光' }, { text: '，' }, { text: 'Hal', syllabicNext: true }, { text: 'le', syllabicNext: true },
    { text: 'lujah' }, { text: ',' }, { text: 'well-known' }, { text: '!' }];
  assert.equal(lyricPlainText(words), '月光，Hallelujah, well-known!');
});

test('a cross-page crescendo opens the end of the first fragment without altering its continuation', () => {
  const score = newScore();
  writeNote(score, { ...cursor, at: 288 }, [pitch], 96, 0);
  writeNote(score, { ...cursor, at: 1152 }, [pitch], 96, 0);
  score.spans.push({ kind: 'crescendo', from: score.notes[0].id, to: score.notes[1].id });
  setBoundaryBreak(score, 1, 'page');
  const svg = engrave(score, cursor, null).pages;
  const first = svg.split('</svg>')[0];
  const second = svg.split('</svg>')[1];
  const opening = fragment => fragment.match(/d="M[^ ]+ ([\d.-]+)L[^ ]+ ([\d.-]+)M[^ ]+ ([\d.-]+)L[^ ]+ ([\d.-]+)" class="wedge"/).slice(1).map(Number);
  const a = opening(first), b = opening(second);
  assert.equal(a[0], a[2]);
  assert.equal(a[3] - a[1], 3);
  assert.ok(b[2] - b[0] < 3);
});
