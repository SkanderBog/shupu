import { dotted, measureTable, QUARTER } from './score.js';
import type { Score, TempoLine, TempoMark } from './score.js';

export const TEMPO_PRESETS = { Grave: 40, Largo: 48, Lento: 52, Larghetto: 56, Adagio: 60, Andante: 80, Andantino: 92, Moderato: 108,
  Allegretto: 116, Allegro: 132, Vivace: 156, Presto: 184, Prestissimo: 208 };
export const TEMPO_GLYPHS: Record<number, string> = { 384: '𝅝', 192: '𝅗𝅥', 96: '♩', 48: '♪', 24: '𝅘𝅥𝅯', 12: '𝅘𝅥𝅰' };
export const RHYTHM_TEMPO = [[96, 0, 96, 1], [96, 1, 96, 0], [192, 0, 96, 0], [96, 0, 192, 0],
  [48, 0, 48, 0], [96, 0, 96, 0], [48, 1, 96, 0]];
export const isSwing = (mark: TempoMark): mark is Extract<TempoMark, { kind: 'swing' | 'straight' }> =>
  mark.kind === 'swing' || mark.kind === 'straight';
export const defaultTempoPercent = (line: Pick<TempoLine, 'kind'>) => line.kind === 'accel.' ? 133 : 75;
export function tempoLabel(mark: TempoMark) {
  if (mark.kind === 'metronome') return `${mark.label ? mark.label + '  ' : ''}${TEMPO_GLYPHS[mark.unit]}${'·'.repeat(mark.dots)} = ${mark.writtenRate ?? mark.bpm}`;
  if (mark.kind === 'modulation') return `${TEMPO_GLYPHS[mark.unit]}${'·'.repeat(mark.dots)} = ${TEMPO_GLYPHS[mark.rightUnit]}${'·'.repeat(mark.rightDots)}`;
  if (mark.kind === 'swing' || mark.kind === 'straight') return mark.label || (mark.kind === 'swing' ? 'Swing' : 'Straight');
  return mark.label || (mark.kind === 'restore' ? 'a tempo' : mark.kind === 'primo' ? 'Tempo primo' : 'Moderato');
}
function fixedTempo(mark?: TempoMark) {
  return mark?.override ?? (mark?.kind === 'metronome' ? mark.bpm * dotted(mark.unit, mark.dots) / QUARTER :
    mark?.kind === 'word' ? mark.bpm : undefined);
}
export const titleTempo = (score: Score) => fixedTempo(score.tempoMarks?.find(mark => mark.at === 0 && mark.appearance?.playback !== false && !isSwing(mark))) ?? score.tempo;

export interface TempoSegment { start: number; end: number; at: number }
type Ramp = { from: number; to: number; initial: number; final: number };
type State = { bpm: number; before: number; ramp?: Ramp };
type ClockSegment = { at: number; end: number; seconds: number; lastSeconds: number; bpm: number; slope: number };
const slopeOf = (ramp: Ramp) => (ramp.final - ramp.initial) / (ramp.to - ramp.from);
const speedAt = (state: State, at: number) => {
  const ramp = state.ramp;
  return ramp ? ramp.initial + slopeOf(ramp) * (Math.min(ramp.to, Math.max(ramp.from, at)) - ramp.from) : state.bpm;
};

function tempoLinesOverlap(a: TempoLine, b: TempoLine) {
  return a.from < b.to && b.from < a.to;
}

export function placeTempoLine(score: Score, line: TempoLine) {
  const lines = score.tempoLines ??= [];
  line.playback = !lines.some(other => other.playback !== false && tempoLinesOverlap(line, other));
  lines.push(line);
}

export function setTempoLinePlayback(score: Score, line: TempoLine, enabled: boolean) {
  line.playback = enabled;
  if (enabled) for (const other of score.tempoLines ?? []) {
    if (other !== line && tempoLinesOverlap(line, other)) other.playback = false;
  }
}

export function tempoLineEnd(score: Score, line: TempoLine) {
  return Math.min(line.to, ...(score.tempoMarks ?? []).filter(mark => mark.appearance?.playback !== false && !isSwing(mark) && mark.at > line.from && mark.at < line.to).map(mark => mark.at),
    ...(score.tempoLines ?? []).filter(other => other.playback !== false && other.from > line.from && other.from < line.to).map(other => other.from));
}

function tempoEvents(score: Score) {
  const initial = titleTempo(score);
  const marks = new Map((score.tempoMarks ?? []).filter(mark => mark.appearance?.playback !== false && !isSwing(mark)).map(mark => [mark.at, mark]));
  const starts = new Map((score.tempoLines ?? []).filter(line => line.playback !== false).map(line => [line.from, line]));
  const ends = new Map([...starts.values()].map(line => [line.id, tempoLineEnd(score, line)]));
  const positions = [...new Set([...marks.keys(), ...starts.keys(), ...ends.values()])].sort((a, b) => a - b);
  const apply = (state: State, at: number): State => {
    let { bpm, before, ramp } = state;
    if (ramp && ramp.to <= at) { bpm = speedAt(state, at); ramp = undefined; }
    const mark = marks.get(at);
    if (mark) {
      const previous = ramp ? speedAt(state, at) : bpm;
      bpm = fixedTempo(mark) ?? (mark.kind === 'modulation' ?
        previous * dotted(mark.rightUnit, mark.rightDots) / dotted(mark.unit, mark.dots) : mark.kind === 'restore' ? before : initial);
      if (Math.abs(bpm - previous) > 1e-9) before = previous;
      ramp = undefined;
    }
    const line = starts.get(at);
    const to = line && ends.get(line.id)!;
    if (line && to !== undefined && to > at) {
      if (ramp) bpm = speedAt(state, at);
      const wanted = line.target ?? bpm * (line.percent ?? defaultTempoPercent(line)) / 100;
      const final = bpm + (wanted - bpm) * (to - at) / (line.to - at);
      if (Math.abs(final - bpm) > 1e-9) {
        before = bpm;
        ramp = { from: at, to, initial: bpm, final };
      }
    }
    return { bpm, before, ramp };
  };
  const snapshots: State[] = [];
  let state: State = { bpm: initial, before: initial };
  for (const tick of positions) { state = apply(state, tick); snapshots.push(state); }
  return { positions, apply, before(at: number) {
    const i = search(positions, tick => tick < at) - 1;
    return snapshots[i] ?? { bpm: initial, before: initial };
  } };
}

function search<T>(items: T[], before: (item: T) => boolean) {
  let a = 0, b = items.length;
  while (a < b) {
    const middle = (a + b) >>> 1;
    if (before(items[middle])) a = middle + 1;
    else b = middle;
  }
  return a;
}

export function scoreTempoAt(score: Score, at: number) {
  return scoreTempoMap(score)(at);
}

export function scoreTempoMap(score: Score) {
  const events = tempoEvents(score);
  return (at: number, inclusive = true) => speedAt(inclusive ? events.apply(events.before(at), at) : events.before(at), at);
}

export function tempoClock(score: Score, segments: TempoSegment[], speed = 1) {
  const events = tempoEvents(score);
  const boundaries = measureTable(score).map(bar => bar.start);
  const positions = [...new Set([...events.positions, ...boundaries])].sort((a, b) => a - b);
  const snapshots = new Map<number, State>();
  const clock: ClockSegment[] = [];
  let seconds = 0;
  let state: State | undefined;
  let priorEnd: number | undefined;
  const factor = 60 / (QUARTER * speed);
  const duration = (bpm: number, slope: number, ticks: number) => factor * (Math.abs(slope) < 1e-10 ? ticks / bpm : Math.log1p(slope * ticks / bpm) / slope);
  for (const segment of segments) {
    const { start, end, at } = segment;
    if (!state || priorEnd === undefined || start < priorEnd) state = snapshots.get(start) ?? events.before(start);
    else if (start > priorEnd) {
      const bpm = speedAt(state, priorEnd);
      const ramp: Ramp | undefined = state.ramp && state.ramp.to > start ? { ...state.ramp, from: start, initial: bpm } : undefined;
      state = { bpm, before: state.before, ramp };
    }
    const first = search(positions, tick => tick <= start);
    const last = search(positions, tick => tick < end);
    const cuts = [start, ...positions.slice(first, last), end];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const tick = cuts[i], next = cuts[i + 1];
      if (!snapshots.has(tick)) snapshots.set(tick, state);
      state = events.apply(state, tick);
      const bpm = speedAt(state, tick);
      const slope = state.ramp ? slopeOf(state.ramp) : 0;
      const lastSeconds = seconds + duration(bpm, slope, next - tick);
      clock.push({ at: at + tick - start, end: at + next - start, seconds, lastSeconds, bpm, slope });
      seconds = lastSeconds;
    }
    priorEnd = end;
  }
  const sliceAt = (tick: number) => clock[Math.min(clock.length - 1, search(clock, item => item.end <= tick))];
  return {
    secondsAt(tick: number) {
      const item = sliceAt(tick);
      return item ? item.seconds + duration(item.bpm, item.slope, Math.max(0, Math.min(item.end, tick) - item.at)) : 0;
    },
    tickAt(seconds: number) {
      const item = clock[Math.min(clock.length - 1, search(clock, item => item.lastSeconds <= seconds))];
      if (!item) return 0;
      const elapsed = Math.max(0, Math.min(seconds, item.lastSeconds) - item.seconds) / factor;
      return item.at + (Math.abs(item.slope) < 1e-10 ? elapsed * item.bpm : Math.expm1(elapsed * item.slope) * item.bpm / item.slope);
    },
    bpmAt(tick: number) {
      const item = sliceAt(tick);
      return item ? item.bpm + item.slope * (tick - item.at) : titleTempo(score);
    }
  };
}
