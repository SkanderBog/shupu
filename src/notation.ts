import { beatStarts, dotted, measureTable, pitchAtSound, QUARTER, sound, tick, tickEnd, tonicAt, tupletScale, VALUES } from './score.js';
import type { GraceNote, Meter, Note, Pitch, RhythmAlignment, Score, Span, Tuplet } from './score.js';

export function graceRhythm(notes: GraceNote[], meter: Meter) {
  let position = 0, beat = 0;
  const unit = QUARTER * 4 / meter.denominator;
  let boundary = (meter.groups[0] ?? 1) * unit;
  return notes.map(event => {
    while (position >= boundary) {
      beat++;
      boundary += (meter.groups[beat % meter.groups.length] ?? 1) * unit;
    }
    position += dotted(event.value, event.dots ?? 0);
    return { beat, bars: Math.max(0, Math.log2(QUARTER / event.value)), beam: event.beam };
  });
}
export function graceConnected(first: ReturnType<typeof graceRhythm>[number] | undefined, second: typeof first, level: number) {
  if (!first || !second || first.bars < level || second.bars < level || first.beam === 'isolated') return false;
  switch (second.beam) {
    case 'isolated': case 'break': return false;
    case 'one': return level <= 1;
    case 'two': return level <= 2;
    case 'three': return level <= 3;
    case 'join': return true;
    default: return first.beat === second.beat;
  }
}

export interface Token {
  id: string; note: Note; at: number; length: number; bars: number; dots: number; continuation: boolean;
  tail: number[]; measure: number; beat: number; exact: boolean;
  written?: number; tuplet?: Tuplet;
}
export interface Link {
  from: Token; to: Token; pitch?: number; targetPitch?: number; kind: Span['kind']; short: boolean; source?: number;
  fromAt?: number; toAt?: number; strokes?: number;
}

const shortValues = [...VALUES.filter(value => value <= QUARTER), 3]
  .flatMap(value => [0, 1, 2].map(dots => ({
    length: dotted(value, dots), bars: Math.log2(QUARTER / value), dots
  }))).sort((first, second) => second.length - first.length);

export function displayedDuration(token: Token) {
  if (!token.tail.length) return { value: QUARTER / 2 ** token.bars, dots: token.dots };
  if (token.tail.length === 2) return { value: QUARTER * 2, dots: 1 };
  return { value: token.written ?? token.length, dots: 0 };
}

export function rhythmAlignment(score: Score, measure: ReturnType<typeof measureTable>[number], token: Token, at = token.at): RhythmAlignment {
  if (token.tuplet) return 'half';
  if (at !== token.at) return 'half';
  const meter = measure.pickup ? measure.meter : measure.actualMeter ?? measure.meter;
  const unit = QUARTER * 4 / meter.denominator;
  const pulse = beatStarts(score, measure);
  if (pulse.includes(at)) return 'full';
  const length = token.tail.length ? QUARTER : token.length;
  const end = tick(at + length);
  if (pulse.some(beat => beat > at && beat < end)) return 'half';
  const origin = measure.pickup ? measure.end - meter.numerator * unit : measure.start;
  for (let grid = unit; grid >= 6; grid /= 2) {
    const next = tick(origin + Math.ceil((at - origin) / grid) * grid);
    if (next === at) break;
    if (next > at && next < end) return 'half';
  }
  return 'full';
}

function withRests(score: Score, end: number) {
  const lanes = new Map<string, Note[]>();
  for (const note of score.notes) {
    if (!lanes.has(note.lane)) lanes.set(note.lane, []);
    lanes.get(note.lane)!.push(note);
  }
  const events = [...score.notes];
  for (const lane of score.lanes) {
    let at = lane.start ?? 0;
    const fill = (until: number) => {
      if (at < until) events.push({
        id: `rest:${lane.id}:${at}`, lane: lane.id, at, length: until - at, pitches: []
      });
    };
    for (const note of (lanes.get(lane.id) ?? []).sort((first, second) => first.at - second.at)) {
      fill(note.at);
      at = tickEnd(note);
    }
    fill(lane.end ?? end);
  }
  return events.sort((first, second) => first.at - second.at);
}

export function notation(score: Score) {
  const measures = measureTable(score);
  const beats = measures.map(measure => beatStarts(score, measure));
  const tokens: Token[] = [];
  const links: Link[] = [];
  const divisionCuts = new Map<string, number[]>();
  for (const lane of score.lanes) if (lane.parent) {
    const existing = divisionCuts.get(lane.parent) ?? [];
    existing.push(lane.start!, lane.end!);
    divisionCuts.set(lane.parent, existing);
  }
  for (const [parent, cuts] of divisionCuts) divisionCuts.set(parent, [...new Set(cuts)].sort((a, b) => a - b));
  const parents = new Map(score.lanes.map(lane => [lane.id, lane.parent ?? lane.id]));
  const byNote = new Map<string, Token[]>();
  const byLane = new Map<string, Token[]>(score.lanes.map(lane => [lane.id, []]));
  const groups = new Map<string, Tuplet[]>();
  for (const group of score.tuplets ?? []) groups.set(group.lane, [...(groups.get(group.lane) ?? []), group]);
  for (const note of withRests(score, measures.at(-1)!.end)) {
    const pieces: Token[] = [];
    let at = note.at;
    const end = tickEnd(note);
    while (at < end) {
      const measure = measures.find(item => at >= item.start && at < item.end)!;
      const grid = beats[measure.index];
      const limit = Math.min(end, measure.end, divisionCuts.get(parents.get(note.lane)!)?.find(cut => cut > at) ?? Infinity);
      const nextBeat = grid.find(beat => beat > at) ?? measure.end;
      const relevant = groups.get(note.lane) ?? [];
      const inside = relevant.filter(group => group.at <= at && at < tickEnd(group));
      const ancestors = new Set(inside.map(group => group.parent));
      const tuplet = inside.find(group => !ancestors.has(group.id));
      const nextGroup = Math.min(...relevant.filter(group => group.at > at && group.at < limit).map(group => group.at));
      const stop = Math.min(limit, tuplet ? tickEnd(tuplet) : Infinity, nextGroup);
      const remaining = tick(stop - at);
      const scale = tupletScale(tuplet);
      const allowance = remaining / scale;
      const maxLength = at === note.at && note.length > dotted(QUARTER, 2) && !grid.includes(at)
        ? Math.min(remaining, nextBeat - at) : !note.pitches.length && !note.unpitched
          ? Math.min(remaining, nextBeat - at) : remaining;
      const candidates = shortValues.filter(value => value.length <= (tuplet ? allowance + 1e-6 : maxLength));
      const preferred = at === note.at && note.value !== undefined && note.value <= QUARTER
        && dotted(note.value, note.dots ?? 0) === note.length
        ? candidates.find(candidate => candidate.length === note.length) : undefined;
      let picked: (typeof shortValues)[number] | undefined = preferred ?? candidates[0];
      const tail: number[] = [];
      if (tuplet) {
        if (at === note.at && note.value && note.value <= QUARTER)
          picked = candidates.find(candidate => Math.abs(remaining - dotted(note.value!, note.dots ?? 0) * scale) < 1e-6 &&
            candidate.length === dotted(note.value!, note.dots ?? 0)) ?? picked;
        const local = (at - tuplet.at) / scale;
        const onBeat = Math.abs(local - Math.round(local / QUARTER) * QUARTER) < 1e-6;
        if ((note.pitches.length || note.unpitched) && onBeat && allowance >= QUARTER * 2 - 1e-6) {
          const steps = Math.floor((allowance + 1e-6) / QUARTER);
          for (let step = 1; step < steps; step++) tail.push(tick(at + step * QUARTER * scale));
          picked = { length: steps * QUARTER, bars: 0, dots: 0 };
        }
      } else if (!preferred && (note.pitches.length || note.unpitched) && grid.includes(at)) {
        for (let tick = at + QUARTER; tick + QUARTER <= limit && grid.includes(tick); tick += QUARTER)
          tail.push(tick);
        if (tail.length) picked = { length: QUARTER * (tail.length + 1), bars: 0, dots: 0 };
        else if (remaining > dotted(QUARTER, 2))
          picked = candidates.find(candidate => candidate.length <= nextBeat - at);
      }
      const duration = picked ? picked.length * scale : tuplet ? remaining : maxLength;
      const actual = Math.abs(remaining - duration) < 1e-7 ? remaining : Math.min(remaining, tick(duration));
      const token = {
        id: note.id + ':' + at, note, at, length: actual || remaining, bars: picked?.bars ?? 0,
        dots: picked?.dots ?? 0, continuation: at > note.at, tail, measure: measure.index,
        beat: tuplet?.at ?? grid.filter(beat => beat <= at).at(-1) ?? measure.start, exact: !!picked,
        written: tuplet ? picked?.length ?? allowance : undefined, tuplet
      };
      if (pieces.length) note.pitches.forEach((_, pitch) => links.push({
        from: pieces.at(-1)!, to: token, pitch, targetPitch: pitch, kind: 'tie',
        short: pieces.at(-1)!.tail.length === 0
      }));
      pieces.push(token);
      tokens.push(token);
      byLane.get(note.lane)!.push(token);
      at = tickEnd(token);
    }
    byNote.set(note.id, pieces);
  }
  for (const lane of byLane.values()) lane.sort((first, second) => first.at - second.at);
  for (const [source, span] of score.spans.entries()) {
    const fromPieces = byNote.get(span.from);
    const toPieces = byNote.get(span.to);
    if (!fromPieces?.length || !toPieces?.length) continue;
    const from = span.kind === 'tie' ? fromPieces.at(-1)! : fromPieces[0];
    const to = toPieces[0];
    const lane = byLane.get(from.note.lane)!;
    links.push({ ...span, source, from, to, short: lane[lane.indexOf(from) + 1] === to && !from.tail.length });
  }
  return { measures, tokens, links, byLane, accidentals: accidentalContext(score, measures, byLane, links) };
}

export function pitchInMeasure(score: Score, token: Token, tonic: number, pitch: Pitch) {
  if (token.note.at === token.at) return pitch;
  const original = tonicAt(score, token.note.at);
  return original === tonic ? pitch : pitchAtSound(sound(pitch, original), tonic);
}

type BeforeNote = (note: Note, alters: ReadonlyMap<number, number | null>) => void;
export function editInAccidentalOrder(score: Score, prepared: ReturnType<typeof notation>, edit: BeforeNote) {
  accidentalContext(score, prepared.measures, prepared.byLane, prepared.links, edit);
}
function accidentalContext(score: Score, measures: ReturnType<typeof measureTable>, byLane: Map<string, Token[]>, links: Link[], edit?: BeforeNote) {
  const ties = new Map<Token, Set<number>>();
  for (const link of links) if (link.kind === 'tie') {
    const pitches = ties.get(link.to) ?? new Set<number>();
    pitches.add(link.targetPitch ?? 0);
    ties.set(link.to, pitches);
  }
  const signs = new Map<Token, (number | undefined)[]>();
  const graces = new Map<GraceNote, (number | undefined)[]>();
  const before = new Map<Token, ReadonlyMap<number, number | null>>();
  for (const tokens of byLane.values()) {
    let bar = -1;
    let state = new Map<number, number | null>();
    for (const token of tokens) {
      if (bar !== token.measure) { bar = token.measure; state = new Map(); }
      before.set(token, state);
      const scan = (sounding: { pitch: Pitch; courtesy?: boolean; tied?: boolean; continuation?: boolean }[]) => {
        if (!sounding.length) return [];
        const pitches = new Map<number, Set<number>>();
        for (const { pitch } of sounding) {
          const alterations = pitches.get(pitch.degree) ?? new Set<number>();
          alterations.add(pitch.alter);
          pitches.set(pitch.degree, alterations);
        }
        const next = new Map(state);
        const printed = sounding.map(({ pitch, courtesy, tied, continuation }) => {
          const conflict = pitches.get(pitch.degree)!.size > 1;
          const previous = state.has(pitch.degree) ? state.get(pitch.degree) : 0;
          if (!tied) next.set(pitch.degree, conflict ? null : pitch.alter);
          if (pitch.signStyle === 'hide') return undefined;
          return courtesy || !continuation && (pitch.signStyle === 'show' || pitch.natural) ||
            !tied && (conflict || pitch.alter !== previous) ? pitch.alter : undefined;
        });
        state = next;
        return printed;
      };
      const scanGrace = (event: GraceNote) => graces.set(event, scan(event.pitches.map(pitch =>
        ({ pitch: pitchInMeasure(score, token, measures[bar].tonic, pitch), courtesy: pitch.courtesy }))));
      if (!token.continuation) token.note.grace?.before?.notes.forEach(scanGrace);
      if (!token.continuation) edit?.(token.note, state);
      signs.set(token, scan((token.note.unpitched ? [] : token.note.pitches).map((pitch, index) =>
        ({ pitch: pitchInMeasure(score, token, measures[bar].tonic, pitch), courtesy: !token.continuation && pitch.courtesy,
          continuation: token.continuation, tied: ties.get(token)?.has(index) || token.continuation }))));
      if (tickEnd(token) === tickEnd(token.note)) token.note.grace?.after?.notes.forEach(scanGrace);
    }
  }
  return { signs, before, graces };
}

export function connected(first: Token, second: Token, level: number) {
  if (first.bars < level || second.bars < level || first.measure !== second.measure ||
    tickEnd(first) !== second.at || first.tuplet?.id !== second.tuplet?.id || beamMode(first) === 'isolated') return false;
  switch (beamMode(second)) {
    case 'isolated': case 'break': return false;
    case 'one': return level <= 1;
    case 'two': return level <= 2;
    case 'three': return level <= 3;
    case 'join': return true;
    case 'auto': {
      if (second.note.beams?.[second.at] === 'auto') return first.beat === second.beat;
      const mask = second.note.xmlBeams?.[second.at];
      if (mask !== undefined) return !!(mask & (1 << (level - 1)));
      return first.note.beam !== 'break' && (first.beat === second.beat || first.note.beam === 'join');
    }
  }
}

export const beamMode = (token: Token) => token.note.beams?.[token.at] ?? 'auto';

export function pitchOrder(note: Note, tonic: number) {
  return note.pitches.map((pitch, index) => ({ pitch, index }))
    .sort((first, second) => sound(second.pitch, tonic) - sound(first.pitch, tonic));
}

export type Point = [number, number];

export function shortArcRise(width: number, digitSize: number) {
  const scale = digitSize / 16;
  const span = Math.max(0, width) / scale;
  return scale * Math.min(6.2, .24 * span, 6.2 * Math.sqrt(span / 30));
}

export function arcGeometry(start: Point, end: Point, short: boolean, roof: number, head = true, tail = true) {
  const [left, startY] = start;
  const [right, endY] = end;
  const width = right - left;
  const x = (left + right) / 2;
  if (width <= 0) return { path: '', middle: [x, roof] as Point, top: roof, yAt: (_x: number) => roof };
  if (short) {
    if (!head && !tail) return { path: `M${left} ${roof} H${right}`, middle: [x, roof] as Point, top: roof, yAt: (_x: number) => roof };
    const a = head ? startY : roof, b = tail ? endY : roof;
    const control = head && tail ? roof * 2 - (startY + endY) / 2 : roof;
    const along = (t: number) => (1 - t) ** 2 * a + 2 * t * (1 - t) * control + t ** 2 * b;
    const extremum = (a - control) / (a - 2 * control + b);
    const top = extremum > 0 && extremum < 1 ? Math.min(a, b, along(extremum)) : Math.min(a, b);
    return { path: `M${left} ${a} Q${x} ${control} ${right} ${b}`, middle: [x, along(.5)] as Point, top,
      yAt: (x: number) => along(Math.min(1, Math.max(0, (x - left) / width))) };
  }
  const leftRadius = head ? Math.max(0, startY - roof) : 0;
  const rightRadius = tail ? Math.max(0, endY - roof) : 0;
  const compression = Math.min(1, Math.max(width * .8, width - 2) / Math.max(1e-6, leftRadius + rightRadius));
  const leftWidth = leftRadius * compression, rightWidth = rightRadius * compression;
  const first = head
    ? `M${left} ${startY}${leftRadius ? ` A${leftWidth} ${leftRadius} 0 0 1 ${left + leftWidth} ${roof}` : ''}`
    : `M${left} ${roof}`;
  const yAt = (x: number) => {
    const shoulder = (end: number, radius: number, ratio: number) => end - radius * Math.sqrt(Math.max(0, 1 - ratio ** 2));
    if (leftWidth && x < left + leftWidth) return shoulder(startY, leftRadius, (left + leftWidth - x) / leftWidth);
    if (rightWidth && x > right - rightWidth) return shoulder(endY, rightRadius, (x - right + rightWidth) / rightWidth);
    return roof;
  };
  return { path: `${first} H${right - rightWidth}${rightRadius
    ? ` A${rightWidth} ${rightRadius} 0 0 1 ${right} ${endY}` : ''}`,
    middle: [(left + leftWidth + right - rightWidth) / 2, roof] as Point, top: roof, yAt };
}

export function arcPath(start: Point, end: Point, short: boolean, roof: number, head = true, tail = true) {
  return arcGeometry(start, end, short, roof, head, tail).path;
}
