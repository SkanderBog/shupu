import test from 'node:test';
import assert from 'node:assert/strict';
import { engrave } from '../dist/engrave.js';
import { exportMusicXML } from '../dist/musicxml-export.js';
import { arrangePlayback, repeatIntervals, scoreTones } from '../dist/playback.js';
import { deleteMeasures, insertBlankMeasure, newScore, openScore, setBoundaryBreak, setBoundaryStyle, writeNote } from '../dist/score.js';
import { scoreTempoAt, tempoClock, tempoLineEnd } from '../dist/tempo.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('written beat units, last-speed restoration, title restoration and overrides drive playback', () => {
  const score = newScore();
  score.tempoMarks = [
    { id: 'initial', at: 0, kind: 'metronome', unit: 48, dots: 1, bpm: 120 },
    { id: 'word', at: 96, kind: 'word', label: 'Moderato', bpm: 108 },
    { id: 'restore', at: 336, kind: 'restore' },
    { id: 'fixed', at: 432, kind: 'restore', override: 72 },
    { id: 'primo', at: 480, kind: 'primo' },
    { id: 'slow-primo', at: 576, kind: 'primo', override: 64 }
  ];
  score.tempoLines = [{ id: 'rit', from: 192, to: 288, kind: 'rit.' }];
  assert.deepEqual([0, 96, 192, 240, 288, 336, 432, 480, 576].map(at => scoreTempoAt(score, at)),
    [90, 108, 108, 94.5, 81, 108, 72, 90, 64]);
  assert.deepEqual(openScore(JSON.stringify(score)), score);
  const faster = tempoClock(score, [{ start: 0, end: 768, at: 0 }], 2);
  const normal = tempoClock(score, [{ start: 0, end: 768, at: 0 }]);
  for (const at of [0, 12, 96, 211, 287, 288, 400, 576, 767, 768]) {
    close(normal.tickAt(normal.secondsAt(at)), at);
    close(normal.secondsAt(at), faster.secondsAt(at) * 2);
  }
  const xml = exportMusicXML(score).xml;
  assert.match(xml, /<beat-unit>eighth<\/beat-unit><beat-unit-dot\/><per-minute>120<\/per-minute><\/metronome><\/direction-type><sound tempo="90"/);
  assert.match(xml, /<dashes type="start"/);
  assert.match(xml, /shupu-tempo/);
});

test('repeat playback resumes the entrance tempo and ignores skipped first-ending changes', () => {
  const score = newScore();
  score.tempo = 100;
  setBoundaryStyle(score, 1, 'repeat-start');
  setBoundaryStyle(score, 3, 'repeat-end');
  score.boundaries[3].repeats = 1;
  score.endings = [{ start: 2, end: 2, passes: [1] }];
  score.tempoLines = [{ id: 'rit', from: 384, to: 768, kind: 'rit.' }];
  score.tempoMarks = [{ id: 'first-ending', at: 864, kind: 'word', label: 'Presto', bpm: 200 }];
  const order = repeatIntervals(score, 0, 3);
  assert.deepEqual(order.map(item => item.index), [0, 1, 2, 1, 3]);
  const playback = arrangePlayback(score, [], order);
  const clock = tempoClock(score, playback.segments);
  assert.equal(clock.bpmAt(1000), 200);
  assert.equal(clock.bpmAt(1152), 100);
  assert.equal(clock.bpmAt(1536), 75);
  assert.equal(playback.positionAt(clock.tickAt(clock.secondsAt(1164))), 396);
});

test('a swing instruction shares a position with metric modulation and survives a measure edit', () => {
  const score = newScore();
  score.tempo = 80;
  score.tempoMarks = [
    { id: 'metric', at: 384, kind: 'modulation', unit: 96, dots: 0, rightUnit: 96, rightDots: 1 },
    { id: 'swing', at: 384, kind: 'swing', swingUnit: 48, ratio: 2 },
    { id: 'straight', at: 480, kind: 'straight', swingUnit: 48, ratio: 1 }
  ];
  for (const at of [384, 432, 480, 528]) writeNote(score, { lane: 'S', at }, [{ degree: 1, octave: 4, alter: 0 }], 48, 0);
  insertBlankMeasure(score, 1, false);
  assert.deepEqual(score.tempoMarks.map(mark => mark.at), [768, 768, 864]);
  assert.equal(scoreTempoAt(score, 768), 120);
  assert.deepEqual(scoreTones(score).map(({ start, end }) => [start, end]), [[768, 832], [832, 864], [864, 912], [912, 960]]);
  const xml = exportMusicXML(score).xml;
  assert.match(xml, /<metronome><beat-unit>quarter<\/beat-unit><beat-unit>quarter<\/beat-unit><beat-unit-dot\/><\/metronome>/);
  assert.match(xml, /<swing><first>2<\/first><second>1<\/second><swing-type>eighth<\/swing-type><\/swing>/);
});

test('a discrete mark cuts a ramp and hidden cross-page dashes keep their own layout setting', () => {
  const score = newScore();
  score.tempoMarks = [{ id: 'cut', at: 576, kind: 'word', label: 'Allegro', bpm: 132 }];
  score.tempoLines = [{ id: 'line', from: 0, to: 768, kind: 'rit.', dashVisible: false, dashLayout: false }];
  setBoundaryBreak(score, 1, 'page');
  assert.equal(tempoLineEnd(score, score.tempoLines[0]), 576);
  close(scoreTempoAt(score, 384), 77);
  assert.equal(scoreTempoAt(score, 576), 132);
  const { pages } = engrave(score, { lane: 'S', at: 0 }, null, { kind: 'tempo-line', id: 'line' });
  assert.equal((pages.match(/class="tempo-dashes"/g) ?? []).length, 2);
  assert.match(pages, /class="score-invisible"><line[^>]+class="tempo-dashes"/);
  assert.equal((pages.match(/data-endpoint="from"/g) ?? []).length, 1);
  assert.equal((pages.match(/data-endpoint="to"/g) ?? []).length, 1);
  assert.doesNotMatch(exportMusicXML(score).xml, /<dashes/);
  insertBlankMeasure(score, 1, false);
  assert.equal(score.tempoMarks[0].at, 960);
  assert.equal(score.tempoLines[0].to, 1152);
  deleteMeasures(score, [1]);
  assert.equal(score.tempoMarks[0].at, 576);
  assert.equal(score.tempoLines[0].to, 768);
});
