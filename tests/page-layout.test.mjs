import test from 'node:test';
import assert from 'node:assert/strict';
import { engrave } from '../dist/engrave.js';
import { DEFAULT_SPACING, insertBlankMeasure, newScore, openScore, pageLayout, setBoundaryBreak, systemBrackets, systemVisibility, writeNote } from '../dist/score.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const pages = score => engrave(score, { lane: 'S', at: 0 }, null).pages.split('</svg>').filter(Boolean);
const systems = page => page.split('<g class="score-system"').slice(1).map(html => {
  const top = Number(html.match(/transform="translate\(0 ([^)]+)\)"/)[1]);
  const inset = Number(html.match(/data-system-inset="([^"]+)"/)?.[1] ?? 0);
  const bars = [...html.matchAll(/data-play-measure="(\d+)" hidden="" x="([^"]+)" y="12" width="([^"]+)" height="([^"]+)"/g)];
  const baselines = [...html.matchAll(/class="voice-row" transform="translate\(0 ([^)]+)\)"/g)].map(match => +match[1]);
  const [, index, x, width, height] = bars.at(-1);
  return { top, inset, baselines, right: +x + +width, bottom: top + inset + 12 + +height, last: +index, html };
});

test('local row settings follow the covered bars across splits, merges, and insertion', () => {
  const score = newScore();
  const square = { id: 'choir', type: 'square', top: 'S', bottom: 'B' };
  for (const bar of score.measures.slice(0, 2)) bar.layout = { visibility: { S: 'hide' }, brackets: { choir: square } };
  score.measures[2].layout = { visibility: { S: 'show' } };
  const visible = (first, last) => systemVisibility(score, first, last, first * 384, (last + 1) * 384, () => false).visible.map(lane => lane.id);
  assert.equal(visible(0, 0).includes('S'), false);
  assert.equal(visible(1, 1).includes('S'), false);
  assert.equal(visible(0, 2).includes('S'), true);
  assert.equal(systemBrackets(score, 1, 1).items[0].type, 'square');
  assert.equal(systemBrackets(score, 0, 2).items[0].type, 'bracket');
  assert.deepEqual(systemBrackets(score, 0, 2).conflicts, ['choir']);
  insertBlankMeasure(score, 1, false);
  assert.deepEqual(openScore(JSON.stringify(score)).measures[1].layout, { visibility: { S: 'hide' }, brackets: { choir: square } });
  assert.equal(systemBrackets(score, 0, 2).items[0].type, 'square');
});

test('a fully silent system preserves markings on rests and always retains at least one voice', () => {
  const score = newScore();
  for (const lane of score.lanes) lane.display = 'rest';
  assert.deepEqual(systemVisibility(score, 0, 1, 0, 768, () => false).visible.map(lane => lane.id), ['S']);
  writeNote(score, { lane: 'A', at: 0 }, [], 96, 0);
  score.notes[0].dynamic = 'mf';
  const html = pages(score)[0];
  assert.match(html, /data-system-visible="\[&quot;A&quot;\]"/);
  assert.match(html, /class="dynamic">mf/);
  assert.doesNotMatch(html, /class="choral-bracket-guide"/);
});

test('a measure number follows the ink near its own horizontal position', () => {
  const score = newScore();
  score.justifyBottom = false;
  writeNote(score, { lane: 'S', at: 768 }, [{ degree: 1, octave: 4, alter: 0 }], 96, 0);
  score.notes[0].text = 'lontano';
  const gap = () => {
    const row = systems(pages(score)[0])[0];
    const number = Number(row.html.match(/<text[^>]*y="([^"]+)"[^>]*class="measure-number">1<\/text>/)[1]);
    return row.baselines[0] + 5.5 - number;
  };
  const before = gap();
  score.appearance = { [JSON.stringify(['mark', score.notes[0].id, 'text', null, null])]: { placement: { y: -45 } } };
  close(gap(), before);
  score.measures[0].numberAppearance = { placement: { y: -10 } };
  close(gap(), before + 10);
});

test('all systems, including a short last system, use the right margin with unchanged glyph sizes', () => {
  const score = newScore();
  setBoundaryBreak(score, 1, 'line');
  const rows = systems(pages(score)[0]);
  assert.equal(rows.length, 2);
  for (const row of rows) {
    close(row.right, 794 - DEFAULT_SPACING.marginX);
    const strokes = [...row.html.matchAll(/<line x1="([\d.]+)" y1="-13" x2="[\d.]+" y2="9" class="(final)?"\/>/g)];
    close(Math.max(...strokes.map(([, x, style]) => +x + (style ? 1 : 0.5))), row.right);
    assert.match(row.html, /y="5\.5" text-anchor="middle" class="digit"/);
  }
});

test('page justification scales voice and system gaps together and preserves the pagination', () => {
  const score = newScore();
  setBoundaryBreak(score, 1, 'line');
  score.justifyBottom = false;
  const minimum = systems(pages(score)[0]);
  score.justifyBottom = true;
  const justified = systems(pages(score)[0]);
  assert.deepEqual(justified.map(row => row.last), minimum.map(row => row.last));
  const systemGap = justified[1].top - justified[0].bottom;
  const voiceIncrease = justified[0].baselines[1] - justified[0].baselines[0] -
    (minimum[0].baselines[1] - minimum[0].baselines[0]);
  close(systemGap / DEFAULT_SPACING.system, 1 + voiceIncrease / DEFAULT_SPACING.voice);
  close(justified[1].bottom, 1123 - DEFAULT_SPACING.marginY);
  assert.ok(minimum[1].bottom < justified[1].bottom);
});

test('page overrides persist, inherit missing options, and reflow systems within that page', () => {
  const score = newScore();
  score.measures.push(...Array.from({ length: 6 }, () => ({ length: 384 })));
  setBoundaryBreak(score, 2, 'page');
  score.pageLayouts = {
    2: { spacing: { note: 19, marginX: 96, marginY: 100 }, justifyBottom: false },
    3: { spacing: { marginX: 42 } }
  };
  const loaded = openScore(JSON.stringify(score));
  assert.deepEqual(pageLayout(loaded, 2), {
    spacing: { ...DEFAULT_SPACING, note: 19, marginX: 96, marginY: 100, marginLeft: 96, marginRight: 96, marginTop: 100, marginBottom: 100 }, justifyBottom: false
  });
  const before = pages(loaded).map(systems);
  assert.equal(before[0][0].last, 1);
  assert.equal(before[1][0].top, 100);
  close(before[1][0].right, 794 - 96);
  assert.ok(before[1].at(-1).bottom < 1123 - 100);
  delete loaded.pageLayouts[2];
  const after = pages(loaded).map(systems);
  assert.equal(after[0][0].last, 1);
  assert.ok(after[1][0].last > before[1][0].last);
  close(after[1].at(-1).bottom, 1123 - DEFAULT_SPACING.marginY);
});

test('sheet scaling leaves physical page edges intact and supports independent legacy and zero margins', () => {
  const score = newScore();
  score.scalePercent = 75;
  score.spacing = { ...DEFAULT_SPACING, marginTop: 32, marginRight: 12, marginBottom: 60 };
  score.pageLayouts = { 2: { spacing: { marginX: 75, marginLeft: 0, marginRight: 0, marginTop: 0 } } };
  setBoundaryBreak(score, 1, 'page');
  const loaded = openScore(JSON.stringify(score));
  const [first, second] = pages(loaded);
  assert.match(first, /viewBox="0 0 794 1123"/);
  assert.match(first, /class="score-scale" transform="scale\(0\.75\)"/);
  close(systems(first)[0].right * .75, 794 - 12);
  close(systems(second)[0].right * .75, 794);
  close(systems(second)[0].top, 0);
  close(systems(second).at(-1).bottom * .75, 1123 - 60);
  assert.equal(pageLayout(loaded, 2).spacing.marginLeft, 0);
});

test('the final lyric line stretches with the page and can set its lower edge', () => {
  const score = newScore();
  writeNote(score, { lane: 'B', at: 0 }, [{ degree: 1, octave: 3, alter: 0 }], 96, 0);
  score.notes[0].verses = [{ number: 1, text: 'sing' }, { number: 2, text: 'deep' }];
  const row = systems(pages(score)[0])[0];
  const [, offset, baseline] = row.html.match(/translate\(0 ([^)]+)\)"><g[^>]+><text x="[^"]+" y="([^"]+)" text-anchor="middle" class="lyric">deep/);
  close(row.top + row.inset + row.baselines.at(-1) + Number(offset) + Number(baseline) + 4, 1123 - DEFAULT_SPACING.marginY);
});
