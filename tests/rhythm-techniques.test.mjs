import test from 'node:test';
import assert from 'node:assert/strict';
import { alignmentOf, appearanceKey, engrave } from '../dist/engrave.js';
import { notation } from '../dist/notation.js';
import { exportMusicXML } from '../dist/musicxml-export.js';
import { metronome, preCount, scoreTones } from '../dist/playback.js';
import { addSideLane, newScore, openScore, paperSize, pitchAtSound, writeNote } from '../dist/score.js';
import { mergeVoices, splitChords } from '../dist/voice-conversion.js';
import { pageRange } from '../dist/sheet-output.js';

const cursor = { lane: 'S', at: 0 };
const pitch = { degree: 1, octave: 4, alter: 0 };

test('augmentation dashes default to half alignment and retain explicit overrides', () => {
  const score = newScore();
  writeNote(score, cursor, [pitch], 192, 0);
  const prepared = notation(score);
  const token = prepared.byLane.get('S')[0];
  assert.equal(alignmentOf(score, prepared.measures[0], token, token.at), 'full');
  assert.equal(alignmentOf(score, prepared.measures[0], token, token.tail[0]), 'half');
  score.appearance = { [appearanceKey({ kind: 'extension', id: token.note.id, at: token.tail[0] })]: { alignment: 'full' } };
  assert.equal(alignmentOf(score, prepared.measures[0], token, token.tail[0]), 'full');
});

test('changing an existing event to X keeps its mark anchors and grace without playing the underlying chord', () => {
  const score = newScore();
  writeNote(score, cursor, [pitch, { ...pitch, degree: 3 }], 96, 0);
  const note = score.notes[0];
  note.lyric = '字';
  note.dynamic = 'p';
  note.unpitched = true;
  note.grace = { before: { notes: [{ id: 'cue', pitches: [{ ...pitch, degree: 2 }], value: 48 }] } };
  const reopened = openScore(JSON.stringify(score));
  const markup = engrave(reopened, cursor, null).pages;
  assert.match(markup, /class="digit">X<\/text>/);
  assert.match(markup, /class="grace-digit">2<\/text>/);
  assert.match(markup, />字<\/text>/);
  assert.ok(!scoreTones(reopened).some(tone => tone.midi === 60 || tone.midi === 64));
  assert.match(exportMusicXML(reopened).xml, /<unpitched\/>/);
  assert.deepEqual(reopened.notes[0].pitches, note.pitches);
});

test('explicit sign overrides survive save and an unfinished slur is only drawn in input mode', () => {
  const score = newScore();
  for (const at of [0, 96, 192]) writeNote(score, { ...cursor, at }, [{ ...pitch, alter: 1 }], 96, 0);
  score.notes[1].pitches[0].signStyle = 'show';
  score.notes[2].pitches[0].signStyle = 'hide';
  const reopened = openScore(JSON.stringify(score));
  const pending = { ...cursor, id: score.notes[0].id };
  const draw = (input) => engrave(reopened, cursor, null, null, input, undefined, undefined, undefined, undefined, pending).pages;
  assert.equal([...draw(true).matchAll(/class="accidental">♯/g)].length, 2);
  assert.match(draw(true), /class="arc pending-slur"/);
  assert.doesNotMatch(draw(false), /pending-slur/);
  assert.equal(reopened.spans.length, 0);
});

test('X keeps long durations and makes one attack; ornaments and slides have distinct acoustic plans', () => {
  const score = newScore();
  const add = (at, length, pitches, x = false) => writeNote(score, { ...cursor, at }, pitches, length, 0, x);
  add(0, 192, [], true);
  add(192, 48, [pitch]);
  add(240, 48, [{ ...pitch, degree: 3 }]);
  add(288, 48, [pitch]);
  add(336, 48, [{ ...pitch, degree: 3 }]);
  add(384, 96, [{ ...pitch, degree: 2 }]);
  const [x, a, b, c, d, e] = score.notes;
  e.ornaments = { 'lower-mordent': { lower: 1 } };
  score.spans.push({ kind: 'tremolo', from: a.id, to: b.id, strokes: 2 }, { kind: 'slide', from: c.id, to: d.id, pitch: 0, targetPitch: 0 });
  assert.equal(openScore(JSON.stringify(score)).notes[0].unpitched, true);
  const tones = scoreTones(score);
  assert.equal(tones.filter(tone => tone.percussion).length, 1);
  assert.deepEqual(tones.filter(tone => tone.start >= 192 && tone.start < 288).slice(0, 3).map(tone => tone.midi), [60, 64, 60]);
  assert.equal(tones.find(tone => tone.start === 288).bendTo, 64);
  assert.deepEqual(tones.filter(tone => tone.start >= 384).map(tone => tone.midi), [62, 61, 62]);
  const html = engrave(score, cursor, null).pages;
  assert.match(html, /class="digit">X<\/text>/);
  assert.match(html, new RegExp(`&quot;kind&quot;:&quot;extension&quot;,&quot;id&quot;:&quot;${x.id}`));
  assert.match(html, /class="slide-mark"/);
  const { xml } = exportMusicXML(score);
  for (const shape of ['<unpitched/>', '<notehead>x</notehead>', '<tremolo type="start">2</tremolo>',
    '<tremolo type="stop">2</tremolo>', '<slide type="start"', '<mordent/>']) assert.ok(xml.includes(shape), shape);
  assert.deepEqual(pitchAtSound(61, 0, true), { degree: 2, octave: 4, alter: -1 });
  assert.deepEqual(pitchAtSound(61, 0), { degree: 1, octave: 4, alter: 1 });
});

test('splitting and merging preserve duplicate unisons and per-pitch ties', () => {
  const score = newScore();
  for (const at of [0, 96]) writeNote(score, { ...cursor, at }, [pitch, pitch], 96, 0);
  const [a, b] = score.notes;
  a.lyric = '唱';
  for (const pitch of [0, 1]) score.spans.push({ kind: 'tie', from: a.id, to: b.id, pitch, targetPitch: pitch });
  splitChords(score, { lanes: ['S'], start: 0, end: 192 });
  assert.equal(score.notes.filter(note => note.pitches.length === 1).length, 4);
  assert.equal(new Set(score.spans.map(span => span.from)).size, 2);
  assert.equal(score.notes.find(note => note.lyric === '唱').lane, 'S');
  const side = score.lanes.find(lane => lane.parent === 'S');
  mergeVoices(score, { lanes: ['S', side.id], start: 0, end: 192 });
  assert.equal(score.lanes.some(lane => lane.parent === 'S'), false);
  assert.deepEqual(score.notes.map(note => note.pitches.length), [2, 2]);
  assert.equal(new Set(score.spans.map(span => span.pitch)).size, 2);
  assert.doesNotThrow(() => openScore(JSON.stringify(score)));
});

test('preview has physical paper size and folio; pickup clicks retain the compound beat', () => {
  const score = newScore(6, 8, 48);
  score.paper = { width: 150, height: 240 };
  score.folio = { start: 11, first: true, position: 'top', align: 'outside' };
  const { pixelWidth, pixelHeight } = paperSize(score);
  assert.ok(engrave(score, cursor, null).pages.includes(`viewBox="0 0 ${pixelWidth} ${pixelHeight}"`));
  assert.match(engrave(score, cursor, null).pages, /class="folio">11<\/text>/);
  const clicks = metronome(score, [{ start: 0, end: 336, at: 0 }], true);
  assert.deepEqual(clicks.slice(0, 3), [{ at: 0, weight: 0 }, { at: 48, weight: 2 }, { at: 96, weight: 0 }]);
  const count = preCount({ numerator: 6, denominator: 8, groups: [3, 3] }, 1, 60, false);
  assert.equal(count.seconds, 3);
  assert.deepEqual(count.clicks, [{ at: 0, weight: 2 }, { at: 1.5, weight: 1 }]);
  assert.deepEqual(pageRange('1，3-4, 3', 5), [1, 3, 4]);
  assert.throws(() => pageRange('1-6', 5));
});

test('divisi braces follow their own boundary and are independent of edge digit nudges', () => {
  const score = newScore();
  for (const at of [0, 384, 768, 1152]) writeNote(score, { ...cursor, at }, [pitch], 384, 0);
  const side = addSideLane(score, 'S', 384, 768);
  for (const at of [384, 480, 576, 672]) writeNote(score, { lane: side.id, at }, [pitch], 96, 0);
  const state = () => {
    const html = engrave(score, cursor, null).pages;
    const braces = [...html.matchAll(/data-brace-x="([^"]+)" data-limits="([^"]+)"/g)]
      .map(([, x, limits]) => ({ x: Number(x), limits: limits.split(',').map(Number) }));
    const bar = index => Number(html.match(new RegExp(`data-bar-move="${index}"[^>]*>(?:<g[^>]*>)?<line x1="([^"]+)"`))?.[1]);
    const digit = at => Number(html.match(new RegExp(`&quot;at&quot;:${at},&quot;index&quot;:0}[^>]*><text x="([^"]+)"`))?.[1]);
    return { braces, left: bar(1), right: bar(2), digit: digit(384) };
  };
  const original = state();
  assert.ok(Number.isFinite(original.left) && Number.isFinite(original.right));
  assert.ok(original.digit - original.braces[0].x < 25);
  assert.ok(Math.abs((original.braces[0].x - original.left) - (original.right - original.braces[1].x)) < .1);
  score.columns = { 384: 5 };
  const digitMoved = state();
  assert.deepEqual(digitMoved.braces, original.braces);
  assert.ok(digitMoved.digit > original.digit);
  const start = appearanceKey({ kind: 'divisi-brace', lane: 'S', at: 384, side: 'start' });
  score.appearance = { [start]: { placement: { x: 5 } } };
  const braceMoved = state();
  assert.equal(braceMoved.left, original.left);
  assert.ok(braceMoved.braces[0].x > original.braces[0].x);
  score.boundaries = { 1: { appearance: { placement: { x: 4 } } } };
  const barMoved = state();
  assert.ok(barMoved.left > braceMoved.left);
  assert.ok(Math.abs((barMoved.braces[0].x - barMoved.left) - (braceMoved.braces[0].x - braceMoved.left)) < .01);
  score.appearance[start].placement.x = 20;
  score.boundaries[1].appearance.placement.x = 0;
  const widerGap = state();
  score.boundaries[1].appearance.placement.x = 500;
  const atLimit = state();
  assert.ok(Math.abs((atLimit.braces[0].x - atLimit.left) - (widerGap.braces[0].x - widerGap.left)) < .01);
});
