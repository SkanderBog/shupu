import test from 'node:test';
import assert from 'node:assert/strict';
import { engrave } from '../dist/engrave.js';
import { linePlanner } from '../dist/line-layout.js';
import { capturePartPresentation, editablePart, ensurePartAnchors, independentPart, mergePartEdit, partScore } from '../dist/linked-parts.js';
import { exportMusicXML } from '../dist/musicxml-export.js';
import { repeatOrder, scoreTones } from '../dist/playback.js';
import { routeIssues } from '../dist/roadmap.js';
import { boundaryAt, insertBlankMeasure, newScore, openScore, setBoundaryBreak, setKeySignature, writeNote } from '../dist/score.js';

const pitch = { degree: 1, octave: 4, alter: 0 };
const bars = count => Array.from({ length: count }, () => ({ length: 384 }));
const systems = score => [...engrave(score, { lane: 'S', at: 0 }, null).pages
  .matchAll(/data-system-first="(\d+)" data-system-last="(\d+)"/g)].map(([, first, last]) => [Number(first), Number(last)]);

test('printed-number breaks use the first occurrence and cross omitted thresholds once', () => {
  const score = newScore();
  score.measures = [1, 2, 2, 5, 3, 6, 7, 7, 8].map(number => ({ length: 384, number: String(number) }));
  score.lineRule = { start: 1, count: 3, by: 'number', overflow: 'continue' };
  const plan = linePlanner(score);
  assert.deepEqual(score.measures.flatMap((_, i) => plan(i) === 'rule' ? [i] : []), [3, 6]);
  score.lineRule.start = 2;
  const startAtFirst = linePlanner(score);
  assert.equal(startAtFirst(1), 'explicit');
  assert.equal(startAtFirst(2), 'auto');
});

test('width overflow can keep the original cadence or restart it and a locked line is retained', () => {
  const score = newScore();
  score.lanes = score.lanes.slice(0, 1);
  score.paper = { width: 120, height: 150 };
  score.measures = bars(12);
  for (let at = 0; at < 384; at += 24) writeNote(score, { lane: 'S', at }, [pitch], 24, 0);
  score.lineRule = { start: 1, count: 4, by: 'position', overflow: 'continue' };
  assert.deepEqual(systems(score).slice(0, 4), [[0, 0], [1, 3], [4, 6], [7, 7]]);
  score.lineRule.overflow = 'restart';
  assert.deepEqual(systems(score).slice(0, 4), [[0, 0], [1, 3], [4, 6], [7, 9]]);
  score.measures[0].keepWithNext = score.measures[1].keepWithNext = true;
  score.measures[2].lockLineEnd = true;
  assert.deepEqual(systems(score)[0], [0, 2]);
  assert.match(engrave(score, { lane: 'S', at: 0 }, null).warnings.join(), /锁定谱行超出/);
});

test('D.S. al Coda and D.C. al Fine follow separate destinations and export playback directives', () => {
  const score = newScore();
  score.measures = bars(6);
  score.measures[1].route = [{ id: 's', kind: 'segno', target: 'A' }];
  score.measures[2].route = [{ id: 't', kind: 'tocoda', target: 'B' }];
  score.measures[3].route = [{ id: 'j', kind: 'ds', target: 'A', until: 'coda' }];
  score.measures[5].route = [{ id: 'c', kind: 'coda', target: 'B' }];
  assert.deepEqual(repeatOrder(score, 0, 5), [0, 1, 2, 3, 1, 2, 5]);
  assert.deepEqual(routeIssues(score.measures), []);
  const xml = exportMusicXML(score).xml;
  for (const entry of ['segno="A"', 'dalsegno="A"', 'tocoda="B"', 'coda="B"']) assert.ok(xml.includes(entry));
  score.measures[5].route = [{ id: 'dc', kind: 'dc', target: '1', until: 'fine' }];
  score.measures[2].route = [{ id: 'f', kind: 'fine', target: '1' }];
  delete score.measures[3].route;
  assert.deepEqual(repeatOrder(score, 0, 5), [0, 1, 2, 3, 4, 5, 0, 1, 2]);
});

test('linked parts track source edits while their independent breaks and harmony remain separate from notes', () => {
  const score = newScore();
  const part = { id: 'solo', name: '独奏', lanes: ['S'], scalePercent: 120 };
  score.linkedParts = [part];
  writeNote(score, { lane: 'S', at: 0 }, [pitch, { ...pitch, degree: 3 }], 96, 0);
  score.chordSymbols = [{ id: 'a', lane: 'S', at: 0, text: 'G/B' }, { id: 'b', lane: 'S', at: 96, text: '5/7' }];
  setBoundaryBreak(score, 1, 'line');
  score.measures[2].partBreaks = { solo: 'page' };
  const projected = partScore(score, part);
  assert.equal(boundaryAt(projected, 1).break, undefined);
  assert.equal(boundaryAt(projected, 2).break, 'page');
  assert.equal(boundaryAt(score, 1).break, 'line');
  assert.deepEqual(projected.lanes.map(lane => lane.id), ['S']);
  assert.equal(scoreTones(projected).length, 2);
  setKeySignature(score, 0, { degree: 1, fifths: 2 }, false, true);
  assert.deepEqual(partScore(score, part).chordSymbols.map(symbol => symbol.text), ['A/C#', '5/7']);
  assert.match(exportMusicXML(score).xml, /<numeral><numeral-root>5<\/numeral-root>/);
  insertBlankMeasure(score, 0, false);
  const restored = openScore(JSON.stringify(score));
  assert.equal(restored.chordSymbols[0].at, 384);
  assert.equal(boundaryAt(partScore(restored, restored.linkedParts[0]), 3).break, 'page');
});

test('editing a part shares music and retains separate layout after the master inserts a bar', () => {
  const master = newScore();
  const part = { id: 'solo', name: '分谱', lanes: ['S'], showLyrics: false };
  master.linkedParts = [part];
  writeNote(master, { lane: 'S', at: 384 }, [pitch], 96, 0);
  writeNote(master, { lane: 'A', at: 384 }, [pitch], 96, 0);
  ensurePartAnchors(master);
  part.presentation = capturePartPresentation(editablePart(master, part));
  const view = editablePart(master, part);
  view.notes[0].pitches[0].degree = 3;
  view.notes[0].lyric = '词';
  view.columns = { 384: 3 };
  view.scalePercent = 108;
  setBoundaryBreak(view, 1, 'page');
  const result = mergePartEdit(master, part.id, view);
  assert.equal(result.notes.find(note => note.lane === 'S').pitches[0].degree, 3);
  assert.equal(result.notes.find(note => note.lane === 'A').pitches[0].degree, 1);
  assert.equal(result.scalePercent, undefined);
  assert.equal(boundaryAt(result, 1).break, undefined);
  insertBlankMeasure(result, 0, false);
  ensurePartAnchors(result);
  const reopened = editablePart(result, result.linkedParts[0]);
  assert.equal(reopened.columns[768], 3);
  assert.equal(reopened.scalePercent, 108);
  assert.equal(boundaryAt(reopened, 2).break, 'page');
  const independent = independentPart(result, result.linkedParts[0]);
  assert.equal(independent.linkedParts, undefined);
  assert.equal(independent.notes[0].lyric, '词');
  assert.equal(independent.appearance[JSON.stringify(['mark', independent.notes[0].id, 'lyric', null, 1])].visible, false);
});
