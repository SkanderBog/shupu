import test from 'node:test';
import assert from 'node:assert/strict';
import { addSideLane, newScore, openScore, writeNote } from '../dist/score.js';
import { arrangePlayback, channelLevel, clipTones, repeatOrder, scoreTones } from '../dist/playback.js';
import { engrave } from '../dist/engrave.js';

const pitch = degree => ({ degree, octave: 4, alter: 0 });

test('text and wedge dynamics use endpoint marks and preserve the envelope when clipped', () => {
  const score = newScore();
  for (const at of [0, 96, 192]) writeNote(score, { lane: 'S', at }, [pitch(1)], 96, 0);
  const [start, , end] = score.notes;
  start.dynamic = 'p'; end.dynamic = 'f';
  score.spans.push({ kind: 'crescendo', from: start.id, to: end.id, dynamicText: 'poco a poco' });
  const tones = scoreTones(score);
  assert.ok(Math.abs(tones[1].level - .67) < 1e-6);
  assert.equal(tones[2].level, .86);
  assert.ok(Math.abs(clipTones(tones, 144, 192)[0].level - .765) < 1e-6);
  score.spans[0].dynamicText = undefined;
  score.spans[0].dynamicTarget = 'mp';
  assert.ok(Math.abs(scoreTones(score)[1].level - .54) < 1e-6);
  delete score.spans[0].dynamicTarget;
  delete end.dynamic;
  assert.equal(scoreTones(score)[2].level, .60);
});

test('cross-bar ties sustain only their matching pitch and an independent side lane stays separate', () => {
  const score = newScore();
  const side = addSideLane(score, 'S', 336, 480);
  writeNote(score, { lane: 'S', at: 336 }, [pitch(5), pitch(3)], 48, 0);
  writeNote(score, { lane: 'S', at: 384 }, [pitch(5), pitch(4)], 96, 0);
  const [first, next] = score.notes;
  score.spans.push({ kind: 'tie', from: first.id, to: next.id, pitch: 0, targetPitch: 0 });
  writeNote(score, { lane: side.id, at: 336 }, [pitch(1)], 96, 0);
  const tones = scoreTones(score);
  assert.deepEqual(tones.filter(tone => tone.lane === 'S' && tone.midi === 67).map(tone => [tone.start, tone.end]), [[336, 480]]);
  assert.deepEqual(tones.filter(tone => tone.lane === side.id).map(tone => [tone.start, tone.end]), [[336, 432]]);
  assert.equal(tones.filter(tone => tone.lane === 'S').length, 3);
  assert.deepEqual(clipTones(tones.filter(tone => tone.midi === 67), 384, 450).map(tone => [tone.start, tone.end]), [[0, 66]]);
});

test('there is silence for rests, and articulation shortens an untied staccato only', () => {
  const score = newScore();
  writeNote(score, { lane: 'S', at: 0 }, [], 96, 0);
  writeNote(score, { lane: 'S', at: 96 }, [pitch(3)], 96, 0);
  writeNote(score, { lane: 'S', at: 192 }, [pitch(5)], 192, 0);
  score.notes[1].staccato = true;
  const [short, held] = scoreTones(score);
  assert.ok(short.start === 96 && short.end < 192);
  assert.deepEqual([held.start, held.end], [192, 384]);
});

test('mute wins over solo, and solo leaves other lanes silent', () => {
  assert.equal(channelLevel({ muted: true, solo: true, volume: 1 }, true), 0);
  assert.equal(channelLevel({ muted: false, solo: false, volume: .8 }, true), 0);
  assert.equal(channelLevel({ muted: false, solo: true, volume: .4 }, true), .4);
  assert.equal(channelLevel({ muted: false, solo: false, volume: .7 }, false), .7);
});

test('one and two endings play in order and do not duplicate contiguous sustained tones', () => {
  const score = newScore();
  score.measures[0].repeatStart = true;
  score.measures[1].repeatEnd = 2;
  score.endings = [{ start: 1, end: 1, passes: [1] }, { start: 2, end: 2, passes: [2] }];
  assert.deepEqual(repeatOrder(score, 0, 3), [0, 1, 0, 2, 3]);
  const plan = arrangePlayback(score, [{ lane: 'S', start: 300, end: 450, midi: 60, level: .5 }], [0, 1, 0]);
  assert.deepEqual(plan.tones.map(tone => [tone.start, tone.end]), [[300, 450], [1068, 1152]]);
  assert.equal(plan.positionAt(788), 20);
});

test('multiple verses, lyric extensions and repeat endings appear in saved and rendered scores', () => {
  const score = newScore();
  score.measures[0].repeatStart = true;
  score.measures[1].repeatEnd = 2;
  score.endings = [{ start: 0, end: 1, passes: [1] }];
  writeNote(score, { lane: 'S', at: 0 }, [pitch(1)], 96, 0);
  writeNote(score, { lane: 'S', at: 96 }, [pitch(2)], 96, 0);
  score.notes[0].verses = [{ number: 1, text: '啊', extend: 'start' }, { number: 2, text: '晨' }];
  score.notes[0].breath = score.notes[0].tenuto = true;
  score.notes[1].verses = [{ number: 1, extend: 'stop' }];
  const restored = openScore(JSON.stringify(score));
  assert.deepEqual(restored, JSON.parse(JSON.stringify(score)));
  const { pages } = engrave(restored, { lane: 'S', at: 0 }, null);
  assert.match(pages, />啊<\/text>/);
  assert.match(pages, />晨<\/text>/);
  assert.match(pages, /class="lyric-extension"/);
  assert.match(pages, /class="tenuto"/);
  assert.match(pages, /&quot;breath&quot;/);
  assert.match(pages, />1\.<\/text>/);
});
