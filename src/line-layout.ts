import { boundaryAt, measureTable } from './score.js';
import type { Score } from './score.js';

export interface LineRule {
  start: number;
  count: number;
  by: 'position' | 'number';
  overflow: 'continue' | 'restart';
}
export type SectionLineRule = Omit<LineRule, 'start'> & { id: string };

export function linePlanner(score: Score, bars = measureTable(score)) {
  const rule = score.lineRule;
  const seen = new Set<number>();
  const numbers = bars.map(bar => {
    const label = String(bar.number);
    const number = /^-?\d+$/.test(label) ? Number(label) : NaN;
    if (!Number.isSafeInteger(number) || seen.has(number)) return undefined;
    seen.add(number);
    return number;
  });
  const firstInSection: number[] = [];
  const ordinal = bars.map(bar => bar.index + 1);
  const marks = rule?.by === 'number' ? numbers : ordinal;
  for (const [index, bar] of bars.entries()) firstInSection[index] = bar.lineSection &&
    bars[index - 1]?.lineSection?.id === bar.lineSection.id ? firstInSection[index - 1] : index;
  const previous: (number | undefined)[] = [];
  let last: number | undefined;
  for (const value of numbers) {
    previous.push(last);
    last = value ?? last;
  }
  const exact = rule ? marks.indexOf(rule.start) : -1;
  const start = !rule ? -1 : exact >= 0 ? exact : marks.findIndex(value => value !== undefined && value >= rule.start);
  return (index: number, restartFrom = -1) => {
    if (boundaryAt(score, index).break) return 'explicit';
    if (score.measures[index - 1]?.keepWithNext) return 'keep';
    if (score.measures[index]?.keepWithNext || score.measures[index]?.lockLineEnd ||
      score.measures[index - 1]?.lockLineEnd) return 'explicit';
    const section = bars[index]?.lineSection;
    const priorSection = bars[index - 1]?.lineSection;
    if (section?.id !== priorSection?.id) return 'explicit';
    const active = section ?? rule;
    const begin = section ? firstInSection[index] : start;
    if (!active || begin < 0 || index < begin) return 'auto';
    if (index === begin) return 'explicit';
    const values = active.by === 'number' ? numbers : ordinal;
    const value = values[index];
    if (value === undefined) return 'auto';
    const closest = (position: number) => active.by === 'position' ? ordinal[position - 1] : previous[position];
    const base = section ? values[begin] ?? values.slice(begin, index + 1).find(number => number !== undefined) ?? value : rule!.start;
    const sameSection = section?.id === bars[restartFrom]?.lineSection?.id;
    const restart = active.overflow === 'restart' && restartFrom >= begin && sameSection;
    const first = restart ? values[restartFrom] ?? closest(restartFrom) ?? base : base;
    if (value <= first) return 'auto';
    const prior = active.by === 'position' ? Math.max(first, ordinal[index - 1] ?? first) :
      values.slice(restart ? restartFrom : begin, index).reduce<number>((largest, n) => Math.max(largest, n ?? first), first);
    return Math.floor((value - first) / active.count) > Math.floor((prior - first) / active.count) ? 'rule' : 'auto';
  };
}
