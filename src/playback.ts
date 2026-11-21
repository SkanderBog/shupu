import { beatStarts, boundaryAt, dotted, DYNAMIC_STEPS, endingRange, endsRepeat, GRACE_SIDES, measureTable, QUARTER, sound, startsRepeat, tickEnd, tupletAt } from './score.js';
import type { Note, Score } from './score.js';
import type { tempoClock } from './tempo.js';
import { isSwing } from './tempo.js';
import { notation } from './notation.js';
import type { Ornament, OrnamentKind } from './score.js';

export interface Tone { lane: string; midi: number; start: number; end: number; level: number; levels?: { at: number; level: number }[]; percussion?: boolean; bendTo?: number }
export interface MixChannel { volume: number; muted: boolean; solo: boolean }
export interface PlaybackRange { start: number; end: number; loop: boolean; loopStart?: number }
export interface Click { at: number; weight: 0 | 1 | 2 }
const CLICK_LANE = '__metronome';
export function metronome(score: Score, segments: { start: number; end: number; at: number }[], subdivisions: boolean) {
  const measures = measureTable(score);
  return segments.flatMap(segment => measures.filter(bar => bar.start < segment.end && bar.end > segment.start).flatMap(bar => {
    const meter = bar.pickup ? bar.meter : bar.actualMeter ?? bar.meter;
    const points = beatStarts(score, bar);
    const unit = QUARTER * 4 / meter.denominator;
    const start = bar.pickup ? bar.end - meter.numerator * unit : bar.start;
    const beats = subdivisions ? Array.from({ length: meter.numerator }, (_, index) => start + index * unit) : points;
    return beats.filter(at => at >= Math.max(bar.start, segment.start) && at < Math.min(bar.end, segment.end))
      .map(at => ({ at: segment.at + at - segment.start,
        weight: (at === start ? 2 : points.includes(at) ? 1 : 0) as Click['weight'] }));
  }));
}
export function preCount(meter: ReturnType<typeof measureTable>[number]['meter'], bars: number, bpm: number, subdivisions: boolean) {
  const unit = 240 / meter.denominator / bpm;
  const groupStarts: number[] = [];
  let offset = 0;
  for (const size of meter.groups) { groupStarts.push(offset); offset += size; }
  const points = subdivisions ? Array.from({ length: meter.numerator }, (_, i) => i) : groupStarts;
  return { seconds: unit * meter.numerator * bars, clicks: Array.from({ length: bars }, (_, bar) => points.map(at => ({
    at: (bar * meter.numerator + at) * unit, weight: (at === 0 ? 2 : groupStarts.includes(at) ? 1 : 0) as Click['weight']
  }))).flat() };
}
const dynamics: Record<string, number> = { ppp: .28, pp: .38, p: .48, mp: .60, mf: .74, f: .86, ff: 1, fff: 1, sfz: 1 };
const dynamicLevel = (value?: string) => (value ?? '').trim().toLowerCase().split(/\s+/).reverse().map(mark => dynamics[mark])
  .find(level => typeof level === 'number');
function playsMark(score: Score, note: Note, name: string, ornament?: string) {
  return score.appearance?.[JSON.stringify(['mark', note.id, name, null, null, ...(ornament ? [ornament] : [])])]?.playback !== false;
}
function dynamicPlan(score: Score, notes: Map<string, Note>) {
  const byLane = new Map<string, { at: number; level: number; end?: number; target?: number }[]>();
  for (const lane of score.lanes) {
    const marks = new Map<number, number>();
    for (const note of score.notes) if (note.lane === lane.id) {
      const level = playsMark(score, note, 'dynamic') ? dynamicLevel(note.dynamic) : undefined;
      if (level !== undefined) marks.set(note.at, level);
    }
    const ramps = score.spans.flatMap(span => {
      if (span.appearance?.playback === false || span.kind !== 'crescendo' && span.kind !== 'diminuendo') return [];
      const from = notes.get(span.from), to = notes.get(span.to);
      if (from?.lane !== lane.id || !to) return [];
      return [{ at: span.fromAt ?? from.at, end: span.toAt ?? to.at, span }];
    });
    const events = [...new Set([...marks.keys(), ...ramps.map(ramp => ramp.at)])].sort((a, b) => a - b);
    const curve: NonNullable<ReturnType<typeof byLane.get>> = [];
    for (const at of events) {
      const prior = curve.at(-1);
      const level = marks.get(at) ?? (prior ? sampleDynamic(prior, at) : .72);
      const ramp = ramps.find(item => item.at === at && item.end > at);
      if (!ramp) { curve.push({ at, level }); continue; }
      const steps = DYNAMIC_STEPS.map(mark => dynamics[mark]);
      const nearest = steps.reduce((best, step, index) => Math.abs(step - level) < Math.abs(steps[best] - level) ? index : best, 0);
      const index = nearest + (ramp.span.kind === 'crescendo' ? 1 : -1);
      const auto = steps[Math.max(0, Math.min(steps.length - 1, index))];
      curve.push({ at, level, end: ramp.end, target: (ramp.span.dynamicTarget ? dynamics[ramp.span.dynamicTarget] : marks.get(ramp.end)) ?? auto });
    }
    byLane.set(lane.id, curve);
  }
  return byLane;
}
function sampleDynamic(event: { at: number; level: number; end?: number; target?: number }, at: number) {
  if (event.end === undefined || event.target === undefined) return event.level;
  return event.level + (event.target - event.level) * Math.max(0, Math.min(1, (at - event.at) / (event.end - event.at)));
}
const tremoloUnit = (strokes = 3) => QUARTER / 2 ** (strokes + 1);
function attackSeries(tone: Tone, unit: number, pitches: number[], limit = Math.ceil((tone.end - tone.start) / unit)) {
  const count = Math.max(1, Math.min(256, limit));
  const step = (tone.end - tone.start) / count;
  return Array.from({ length: count }, (_, i) => ({ ...tone,
    midi: pitches[i % pitches.length], start: tone.start + i * step, end: tone.start + (i + 1) * step }));
}
function ornamentTones(tone: Tone, kind: OrnamentKind, item: Ornament, upper: number, lower: number): Tone[] {
  if (kind === 'tremolo') return attackSeries(tone, tremoloUnit(item.strokes), [tone.midi]);
  if (kind === 'trill') {
    const pair = item.fromUpper ? [upper, tone.midi] : [tone.midi, upper];
    return attackSeries(tone, QUARTER / 8, pair);
  }
  const mordent = kind.endsWith('mordent');
  const notes = mordent ? [tone.midi, kind === 'upper-mordent' ? upper : lower, tone.midi] :
    [kind === 'turn' ? upper : lower, tone.midi, kind === 'turn' ? lower : upper, tone.midi];
  const length = Math.min((tone.end - tone.start) / 2, QUARTER / 3);
  const start = item.delayed ? tone.start + (tone.end - tone.start) / 2 : tone.start;
  const attacks = attackSeries({ ...tone, start, end: start + length }, 1, notes, notes.length);
  attacks.at(-1)!.end = tone.end;
  if (start > tone.start) attacks.unshift({ ...tone, end: start });
  return attacks;
}

export function graceBudgets(note: Note, beforeAllowed = true, afterAllowed = true) {
  const amount = (side: 'before' | 'after', allowed: boolean) => {
    const group = note.grace?.[side];
    if (!allowed || !group?.notes.length) return 0;
    return group.borrow === undefined ? Math.min(note.length / 2, QUARTER / 16 * group.notes.length) : note.length * group.borrow / 100;
  };
  const before = amount('before', beforeAllowed), after = amount('after', afterAllowed);
  const maximum = note.grace?.before?.borrow !== undefined || note.grace?.after?.borrow !== undefined ? .95 : .5;
  const ratio = before + after > note.length * maximum ? note.length * maximum / (before + after) : 1;
  return { before: before * ratio, after: after * ratio };
}

function swingPairs(score: Score, measures: ReturnType<typeof measureTable>) {
  const marks = (score.tempoMarks ?? []).filter(mark => mark.appearance?.playback !== false && isSwing(mark)).sort((a, b) => a.at - b.at);
  const result = new Map<string, { start: number; unit: number; middle: number }[]>();
  if (!marks.some(mark => mark.kind === 'swing')) return result;
  const groups = new Map<string, Map<number, Note>>();
  for (const note of score.notes) {
    const byTime = groups.get(note.lane) ?? new Map<number, Note>();
    byTime.set(note.at, note);
    groups.set(note.lane, byTime);
  }
  for (const [lane, byTime] of groups) {
    const pairs = [];
    let bar = 0, index = -1;
    for (const note of [...byTime.values()].sort((a, b) => a.at - b.at)) {
      const start = note.at;
      while (bar + 1 < measures.length && start >= measures[bar].end) bar++;
      while (marks[index + 1]?.at <= start) index++;
      const mark = marks[index];
      if (mark?.kind !== 'swing') continue;
      const unit = mark.swingUnit, end = start + 2 * unit;
      const next = byTime.get(start + unit);
      if (start < measures[bar].start || (start - measures[bar].start) % (2 * unit) ||
        end > measures[bar].end || marks[index + 1]?.at < end || note.length !== unit || next?.length !== unit ||
        tupletAt(score, lane, start) || tupletAt(score, lane, start + unit)) continue;
      pairs.push({ start, unit, middle: 2 * unit * mark.ratio / (mark.ratio + 1) });
    }
    if (pairs.length) result.set(lane, pairs);
  }
  return result;
}

export function scoreTones(score: Score): Tone[] {
  const measures = measureTable(score);
  const notes = new Map(score.notes.map(note => [note.id, note]));
  const incoming = new Map<string, string>();
  const outgoing = new Map<string, string>();
  const pitchKey = (id: string, index: number) => id + ':' + index;
  for (const span of score.spans) if (span.kind === 'tie' && span.appearance?.playback !== false) {
    const from = notes.get(span.from);
    const to = notes.get(span.to);
    if (from && to && !from.unpitched && !to.unpitched && from.lane === to.lane && tickEnd(from) === to.at &&
      from.pitches[span.pitch!] && to.pitches[span.targetPitch!]) {
      const first = pitchKey(from.id, span.pitch!);
      const last = pitchKey(to.id, span.targetPitch!);
      if (!outgoing.has(first) && !incoming.has(last)) {
        outgoing.set(first, last);
        incoming.set(last, first);
      }
    }
  }
  const byPitch = new Map<string, Tone>();
  const instructions = new Map<string, { note: Note; index: number }>();
  const withOrnaments = score.notes.some(note => note.ornaments && Object.keys(note.ornaments).length);
  const context = withOrnaments ? notation(score) : undefined;
  const before = new Map(context?.tokens.filter(token => !token.continuation).map(token => [token.note.id, context.accidentals.before.get(token)]));
  const slides = new Map(score.spans.filter(span => span.kind === 'slide' && span.appearance?.playback !== false).map(span => [pitchKey(span.from, span.pitch ?? 0), span]));
  const pairs = new Map(score.spans.filter(span => span.kind === 'tremolo' && span.appearance?.playback !== false).map(span => [pitchKey(span.from, 0), span]));
  const seconds = new Set([...pairs.values()].map(span => pitchKey(span.to, 0)));
  const volume = dynamicPlan(score, notes);
  const graces: Tone[] = [];
  let measure = 0;
  for (const note of [...score.notes].sort((left, right) => left.at - right.at)) {
    while (measure + 1 < measures.length && note.at >= measures[measure].end) measure++;
    if (note.unpitched && !note.unpitchedContinuation) {
      const hit = { lane: note.lane, midi: 38, start: note.at, end: tickEnd(note), percussion: true, level: .7 };
      const tremolo = playsMark(score, note, 'ornament', 'tremolo') ? note.ornaments?.tremolo : undefined;
      const hits = tremolo ? attackSeries(hit, tremoloUnit(tremolo.strokes), [38]) : [hit];
      graces.push(...hits.map(tone => ({ ...tone, end: tone.start + Math.min(tone.end - tone.start, QUARTER / 12) })));
    }
    const budget = graceBudgets(note, note.unpitched || note.pitches.some((_, index) => !incoming.has(pitchKey(note.id, index))),
      note.unpitched || note.pitches.some((_, index) => !outgoing.has(pitchKey(note.id, index))));
    for (const side of GRACE_SIDES) {
      const group = note.grace?.[side];
      const events = group?.notes;
      if (!events?.length || !budget[side]) continue;
      const written = events.reduce((sum, event) => sum + dotted(event.value, event.dots ?? 0), 0);
      let start = side === 'before' ? note.at : tickEnd(note) - budget.after;
      const ties = (group?.links ?? []).filter(link => link.kind === 'tie');
      const previous = new Map<string, Tone>();
      for (const event of events) {
        const end = start + budget[side] * dotted(event.value, event.dots ?? 0) / written;
        event.pitches.forEach((pitch, index) => {
          const midi = sound(pitch, measures[measure].tonic);
          const link = ties.find(link => link.to === event.id && link.toPitch === index);
          const continued = link && previous.get(pitchKey(link.from, link.fromPitch));
          const next = ties.some(link => link.from === event.id && link.fromPitch === index);
          if (continued && continued.midi === midi) {
            continued.end = end;
            previous.set(pitchKey(event.id, index), continued);
          } else {
            const tone = { lane: note.lane, midi, start, end: event.staccato && !next ? start + (end - start) * .53 : end,
              level: event.accent ? 1.22 : 1 };
            graces.push(tone);
            previous.set(pitchKey(event.id, index), tone);
          }
        });
        start = end;
      }
    }
    if (!note.unpitched) note.pitches.forEach((pitch, index) => {
      const key = pitchKey(note.id, index);
      instructions.set(key, { note, index });
      const held = outgoing.has(key) || incoming.has(key);
      const start = note.at + (incoming.has(key) ? 0 : budget.before);
      const end = tickEnd(note) - (outgoing.has(key) ? 0 : budget.after);
      byPitch.set(key, {
        lane: note.lane, midi: sound(pitch, measures[measure].tonic), start,
        end: note.staccato && playsMark(score, note, 'staccato') && !held ? start + (end - start) * .53 : end,
        level: note.accent && playsMark(score, note, 'accent') ? 1.22 : 1
      });
    });
  }
  const tones: Tone[] = [];
  for (const [key, initial] of byPitch) {
    if (incoming.has(key) || seconds.has(key)) continue;
    const tone = { ...initial };
    let next = outgoing.get(key);
    while (next) {
      tone.end = byPitch.get(next)!.end;
      next = outgoing.get(next);
    }
    const pair = pairs.get(key);
    const second = pair && byPitch.get(pitchKey(pair.to, 0));
    if (second) {
      tones.push(...attackSeries({ ...tone, end: second.end }, tremoloUnit(pair.strokes), [tone.midi, second.midi]));
      continue;
    }
    const slide = slides.get(key);
    const destination = slide && byPitch.get(pitchKey(slide.to, slide.targetPitch ?? 0));
    const { note, index } = instructions.get(key)!;
    const mark = Object.entries(note.ornaments ?? {}).find(([kind]) => playsMark(score, note, 'ornament', kind)) as [OrnamentKind, Ornament] | undefined;
    const slideAt = destination ? Math.max(tone.start, tone.end - QUARTER / 2) : tone.end;
    if (mark && slideAt > tone.start) {
      const [kind, item] = mark, pitch = note.pitches[index], tonic = tonicAtNote(note.at, measures);
      const adjacent = (direction: number, override?: number) => {
        const raw = pitch.degree + direction, degree = (raw + 6) % 7 + 1;
        return sound({ degree, octave: pitch.octave + (raw < 1 ? -1 : raw > 7 ? 1 : 0),
          alter: override ?? before.get(note.id)?.get(degree) ?? 0 }, tonic);
      };
      tones.push(...ornamentTones({ ...tone, end: slideAt }, kind, item, adjacent(1, item.upper), adjacent(-1, item.lower)));
    } else if (slideAt > tone.start) tones.push({ ...tone, end: slideAt });
    if (destination) tones.push({ ...tone, start: slideAt, bendTo: destination.midi });
  }
  const swing = swingPairs(score, measures);
  const arranged = [...tones, ...graces].map(tone => {
    const curve = volume.get(tone.lane) ?? [];
    const factor = tone.level;
    const levelAt = (at: number) => {
      const event = curve.filter(event => event.at <= at).at(-1);
      return Math.min(1, factor * (event ? sampleDynamic(event, at) : .72));
    };
    const overlapping = curve.filter(event => event.end !== undefined && event.at < tone.end && event.end > tone.start);
    const points = [...new Set([...overlapping.flatMap(event => [event.at, event.end!])
      .filter(at => at > tone.start && at < tone.end), tone.end])].sort((a, b) => a - b);
    const time = (at: number) => {
      const pairs = swing.get(tone.lane);
      if (!pairs) return at;
      let first = 0, end = pairs.length;
      while (first < end) {
        const middle = (first + end) >>> 1;
        if (pairs[middle].start <= at) first = middle + 1;
        else end = middle;
      }
      const pair = pairs[first - 1];
      if (!pair || at >= pair.start + pair.unit * 2) return at;
      const x = (at - pair.start) / pair.unit;
      return pair.start + (x <= 1 ? x * pair.middle : pair.middle + (x - 1) * (2 * pair.unit - pair.middle));
    };
    return { ...tone, start: time(tone.start), end: time(tone.end), level: levelAt(tone.start),
      levels: overlapping.length ? points.map(at => ({ at: time(at), level: levelAt(at === tone.end ? at - 1e-7 : at) })) : undefined };
  }).sort((a, b) => a.start - b.start);
  return normalizeVoiceVolume(score, arranged);
}
function normalizeVoiceVolume(score: Score, tones: Tone[]) {
  const byId = new Map(score.lanes.map(lane => [lane.id, lane]));
  const groups = new Map<string, Tone[]>();
  for (const tone of tones) {
    const lane = byId.get(tone.lane);
    const parent = byId.get(lane?.parent ?? tone.lane);
    if (!parent || parent.fullNoteVolume) continue;
    const group = groups.get(parent.id) ?? [];
    group.push(tone);
    groups.set(parent.id, group);
  }
  for (const group of groups.values()) {
    const changes = new Map<number, Map<string, number>>();
    const record = (at: number, lane: string, delta: number) => {
      const event = changes.get(at) ?? new Map<string, number>();
      event.set(lane, (event.get(lane) ?? 0) + delta);
      changes.set(at, event);
    };
    for (const tone of group) {
      record(tone.start, tone.lane, 1);
      record(tone.end, tone.lane, -1);
    }
    const active = new Map<string, number>();
    const times = [...changes.keys()].sort((a, b) => a - b);
    const indexes = new Map(times.map((at, index) => [at, index]));
    const snapshots = times.map(at => {
      for (const [lane, delta] of changes.get(at)!) {
        const count = (active.get(lane) ?? 0) + delta;
        if (count > 0) active.set(lane, count);
        else active.delete(lane);
      }
      return new Map(active);
    });
    for (const tone of group) {
      const points = [{ at: tone.start, level: tone.level }, ...tone.levels ?? [], { at: tone.end, level: tone.levels?.at(-1)?.level ?? tone.level }];
      const levelAt = (at: number) => {
        const right = points.findIndex(point => point.at >= at);
        if (right <= 0) return points[0].level;
        const a = points[right - 1], b = points[right];
        return a.level + (b.level - a.level) * (at - a.at) / (b.at - a.at);
      };
      const startIndex = indexes.get(tone.start)!, stopIndex = indexes.get(tone.end)!;
      // Split power equally across sounding rows, then across pitches within each row.
      const divisorAt = (index: number) => {
        const rows = snapshots[index];
        return Math.sqrt(Math.max(1, rows.size) * (rows.get(tone.lane) ?? 1));
      };
      const events = times.slice(startIndex + 1, stopIndex).filter(at => {
        const index = indexes.get(at)!;
        return divisorAt(index) !== divisorAt(index - 1);
      });
      const initialDivisor = divisorAt(startIndex);
      if (initialDivisor === 1 && !events.length) continue;
      const updates = [...new Set([...points.slice(1).map(point => point.at), ...events, ...events.map(at => Math.max(tone.start, at - .01))])]
        .filter(at => at > tone.start).sort((a, b) => a - b);
      let divisor = initialDivisor;
      const eventSet = new Set(events);
      tone.level = levelAt(tone.start) / divisor;
      tone.levels = updates.map(at => {
        if (eventSet.has(at)) divisor = divisorAt(indexes.get(at)!);
        return { at, level: levelAt(at) / divisor };
      });
    }
  }
  return tones;
}
function tonicAtNote(at: number, measures: ReturnType<typeof measureTable>) {
  return measures.find(measure => at < measure.end)?.tonic ?? measures.at(-1)!.tonic;
}

export function clipTones(tones: Tone[], start: number, end: number) {
  return tones.filter(tone => tone.start < end && tone.end > start)
    .map(tone => {
      const first = Math.max(start, tone.start), last = Math.min(end, tone.end);
      const bend = tone.bendTo;
      const points = [{ at: tone.start, level: tone.level }, ...tone.levels ?? []];
      const level = (at: number) => {
        const i = points.findIndex(point => point.at >= at);
        if (i < 1) return i === 0 ? points[0].level : points.at(-1)!.level;
        const a = points[i - 1], b = points[i];
        return a.level + (b.level - a.level) * (at - a.at) / (b.at - a.at);
      };
      const result = { ...tone, start: first - start, end: last - start, level: level(first),
        levels: tone.levels && [...points.filter(point => point.at > first && point.at < last).map(point => ({ ...point, at: point.at - start })),
          { at: last - start, level: level(last) }] };
      if (bend === undefined) return result;
      const at = (tick: number) => tone.midi + (bend - tone.midi) * (tick - tone.start) / (tone.end - tone.start);
      return { ...result, midi: at(first), bendTo: at(last) };
    })
    .sort((left, right) => left.start - right.start);
}

interface PlayedInterval { index: number; start: number; end: number }

export function repeatIntervals(score: Score, first: number, last: number) {
  const measures = measureTable(score);
  const endings = (score.endings ?? []).filter(ending => ending.appearance?.playback !== false).map(ending => ({ ending, ...endingRange(ending, measures) })).sort((a, b) => a.from - b.from);
  const order: PlayedInterval[] = [];
  const initial = measures[first].start;
  const limit = measures[last].end;
  const stack: { start: number; pass: number }[] = [];
  const taken = new Set<string>();
  let returning: 'fine' | 'coda' | 'plain' | undefined;
  let skipRepeats = false;
  let repeatStart = initial;
  const repeatStyle = (index: number) => {
    const boundary = boundaryAt(score, index);
    return boundary.appearance?.playback === false ? 'normal' : boundary.style;
  };
  const targets = measures.flatMap(bar => (bar.route ?? []).filter(mark => score.appearance?.[JSON.stringify(['route', mark.id])]?.playback !== false && (mark.kind === 'segno' || mark.kind === 'coda'))
    .map(mark => ({ bar, mark })));
  let lastPass = 1;
  for (let at = initial, steps = 0; at < limit && steps < 9600; steps++) {
    const measure = measures.find(item => at < item.end)!;
    const item = endings.find(item => at >= item.from && at < item.to);
    let active = stack.at(-1);
    let pass = active?.pass ?? lastPass;
    if (item && skipRepeats) {
      let end = item.to;
      pass = Math.max(...item.ending.passes);
      for (const following of endings) if (following.from >= item.to && following.from <= end) {
        end = Math.max(end, following.to);
        pass = Math.max(pass, ...following.ending.passes);
      }
    }
    if (item && !item.ending.passes.includes(pass)) {
      if (active && measures[item.ending.end].end === item.to && endsRepeat(repeatStyle(item.ending.end + 1))) {
        lastPass = active.pass;
        stack.pop();
      }
      at = item.to;
      continue;
    }
    if (!skipRepeats && at === measure.start && startsRepeat(repeatStyle(measure.index)) && active?.start !== at) {
      active = { start: at, pass: 1 };
      stack.push(active);
      lastPass = 1;
    }
    const next = Math.min(measure.end, endings.find(item => item.from > at)?.from ?? limit);
    const prior = order.at(-1);
    if (prior?.index === measure.index && prior.end === at) prior.end = next;
    else order.push({ index: measure.index, start: at, end: next });
    at = next;
    if (next !== measure.end) continue;
    const boundary = boundaryAt(score, measure.index + 1);
    if (!skipRepeats && endsRepeat(repeatStyle(measure.index + 1))) {
      const repeated = active ?? { start: repeatStart, pass: 1 };
      if (repeated.pass <= (boundary.repeats ?? 0)) {
        if (!active) stack.push(repeated);
        repeated.pass++;
        at = repeated.start;
        continue;
      } else {
        lastPass = repeated.pass;
        if (active) stack.pop();
      }
    }
    for (const mark of measure.route ?? []) {
      if (score.appearance?.[JSON.stringify(['route', mark.id])]?.playback === false) continue;
      if (mark.kind === 'fine' && returning === 'fine') return order;
      if (taken.has(mark.id)) continue;
      const destination = mark.kind === 'dc' ? measures[0] :
        mark.kind === 'ds' ? targets.find(({ bar, mark: target }) =>
          target.kind === 'segno' && target.target === mark.target && bar.start < at)?.bar :
        mark.kind === 'tocoda' && (returning === 'coda' || returning === 'plain') ? targets.find(({ bar, mark: target }) =>
          target.kind === 'coda' && target.target === mark.target && bar.start >= at)?.bar : undefined;
      if (!destination || destination.start >= limit) continue;
      taken.add(mark.id);
      returning = mark.kind === 'tocoda' ? 'plain' : mark.until ?? 'plain';
      skipRepeats = mark.kind !== 'tocoda' && !mark.repeat;
      stack.length = 0;
      lastPass = 1;
      at = repeatStart = destination.start;
      break;
    }
  }
  return order;
}

export function repeatOrder(score: Score, first: number, last: number) {
  return repeatIntervals(score, first, last).map(item => item.index);
}

export function arrangePlayback(score: Score, tones: Tone[], order: (number | PlayedInterval)[]) {
  const measures = measureTable(score);
  const segments: { start: number; end: number; at: number }[] = [];
  let length = 0;
  for (const index of order) {
    const measure = typeof index === 'number' ? measures[index] : index;
    const previous = segments.at(-1);
    if (previous?.end === measure.start) previous.end = measure.end;
    else segments.push({ start: measure.start, end: measure.end, at: length });
    length += measure.end - measure.start;
  }
  return {
    tones: segments.flatMap(segment => clipTones(tones, segment.start, segment.end)
      .map(tone => ({ ...tone, start: tone.start + segment.at, end: tone.end + segment.at,
        levels: tone.levels?.map(point => ({ ...point, at: point.at + segment.at })) }))),
    length, segments,
    positionAt(tick: number) {
      const segment = segments.find(item => tick >= item.at && tick < item.at + item.end - item.start);
      return segment ? tick - segment.at + segment.start : (segments.at(-1)?.end ?? 0);
    }
  };
}

export function channelLevel(channel: MixChannel, anySolo: boolean) {
  return channel.muted || anySolo && !channel.solo ? 0 : channel.volume;
}

export class Player {
  private context?: AudioContext;
  private master?: GainNode;
  private compressor?: DynamicsCompressorNode;
  private buses = new Map<string, GainNode>();
  private voices = new Map<OscillatorNode, GainNode>();
  private timer?: ReturnType<typeof setInterval>;
  private frame?: number;
  private sampleTick?: () => number;
  private generation = 0;
  private playing = false;
  private clickMix = { volume: .55, muted: true };
  private previewVoices: OscillatorNode[] = [];
  private previewRequest = 0;

  async preview(pitches: number[], divide: boolean, seconds = .5, volume = 1) {
    if (this.playing || !pitches.length || volume <= 0) return;
    const request = ++this.previewRequest;
    try {
      const context = this.context ??= new AudioContext();
      await context.resume();
      if (request !== this.previewRequest || this.playing) return;
      for (const oscillator of this.previewVoices) oscillator.stop();
      const start = context.currentTime;
      const end = start + seconds;
      const level = .11 * volume / (divide ? Math.sqrt(pitches.length) : 1);
      this.previewVoices = pitches.map(midi => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'triangle';
        oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(level, start + .015);
        gain.gain.setValueAtTime(level, end - .05);
        gain.gain.linearRampToValueAtTime(0, end);
        oscillator.connect(gain).connect(context.destination);
        oscillator.onended = () => {
          this.previewVoices = this.previewVoices.filter(voice => voice !== oscillator);
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(start);
        oscillator.stop(end);
        return oscillator;
      });
    } catch { /* A browser can deny audio until it receives a user gesture. */ }
  }

  setClick(volume: number, enabled: boolean) {
    this.clickMix = { volume, muted: !enabled };
    const bus = this.buses.get(CLICK_LANE);
    if (bus && this.context) bus.gain.setTargetAtTime(enabled ? volume : 0, this.context.currentTime, .01);
  }

  constructor(private readonly position: (tick: number | null, bpm?: number, arranged?: number) => void) {}

  get active() { return this.playing; }
  get currentTick() { return this.sampleTick?.(); }

  async start(tones: Tone[], range: PlaybackRange, bpm: number, mix: Map<string, MixChannel>, positionAt = (tick: number) => tick,
    tempo?: ReturnType<typeof tempoClock>, clicks: Click[] = [], count?: ReturnType<typeof preCount>) {
    this.stop();
    this.previewRequest++;
    for (const oscillator of this.previewVoices) oscillator.stop();
    this.previewVoices = [];
    const generation = this.generation;
    const context = this.context ??= new AudioContext();
    await context.resume();
    if (generation !== this.generation) return;
    const secondsPerTick = 60 / bpm / QUARTER;
    const secondsAt = tempo?.secondsAt ?? ((tick: number) => tick * secondsPerTick);
    const tickAt = tempo?.tickAt ?? ((seconds: number) => seconds / secondsPerTick);
    const rangeStart = secondsAt(range.start);
    const duration = secondsAt(range.end) - rangeStart;
    if (duration <= 0) return;
    const loopTick = range.loopStart ?? range.start;
    const loopSeconds = secondsAt(loopTick);
    const loopDuration = secondsAt(range.end) - loopSeconds;
    const master = this.master = context.createGain();
    master.gain.value = .16 / Math.sqrt(Math.max(1, mix.size));
    const compressor = this.compressor = context.createDynamicsCompressor();
    master.connect(compressor);
    compressor.connect(context.destination);
    for (const lane of mix.keys()) {
      const bus = context.createGain();
      bus.connect(master);
      this.buses.set(lane, bus);
    }
    this.applyMix(mix, true);
    const clickBus = context.createGain();
    clickBus.connect(master);
    clickBus.gain.value = this.clickMix.muted ? 0 : this.clickMix.volume;
    this.buses.set(CLICK_LANE, clickBus);
    const countLane = '__count-in';
    const countBus = context.createGain();
    countBus.connect(master);
    countBus.gain.value = this.clickMix.volume;
    this.buses.set(countLane, countBus);
    const clickTone = (lane: string, weight: number) => ({ lane, midi: [83, 88, 95][weight], start: 0, end: .035,
      level: [.40, .6, .82][weight] });
    let index = 0;
    let cycle = 0;
    const opening = context.currentTime + .05;
    const origin = opening + (count?.seconds ?? 0);
    for (const click of count?.clicks ?? []) this.playTone(clickTone(countLane, click.weight), opening + click.at, opening + click.at + .035);
    const buildClip = (from: number) => {
      const base = secondsAt(from);
      const clip: Tone[] = clipTones(tones, from, range.end).map(tone => ({ ...tone,
        levels: tone.levels?.map(point => ({ ...point, at: secondsAt(from + point.at) - base })),
        start: secondsAt(from + tone.start) - base, end: secondsAt(from + tone.end) - base }));
      for (const click of clicks) if (click.at >= from && click.at < range.end) {
        const at = secondsAt(click.at) - base;
        clip.push({ ...clickTone(CLICK_LANE, click.weight), start: at, end: Math.min(secondsAt(range.end) - base, at + .035) });
      }
      return clip.sort((a, b) => a.start - b.start);
    };
    const initialClip = buildClip(range.start);
    const loopClip = range.loop && loopTick !== range.start ? buildClip(loopTick) : initialClip;
    this.playing = true;
    this.sampleTick = () => {
      const elapsed = Math.max(0, context.currentTime - origin);
      return tickAt(range.loop && elapsed >= duration ? loopSeconds + (elapsed - duration) % loopDuration :
        rangeStart + Math.min(duration, elapsed));
    };
    const display = () => {
      if (!this.playing || !this.sampleTick) return;
      const tick = this.sampleTick();
      this.position(context.currentTime < origin && count?.seconds ? null : positionAt(tick), tempo?.bpmAt(tick), tick);
      this.frame = requestAnimationFrame(display);
    };
    const schedule = () => {
      const now = context.currentTime;
      if (!range.loop && now >= origin + duration) { this.stop(); return; }
      const elapsed = Math.max(0, now - origin);
      const cycleNow = elapsed < duration ? 0 : 1 + Math.floor((elapsed - duration) / loopDuration);
      if (range.loop && cycleNow > cycle) { cycle = cycleNow; index = 0; }
      const horizon = now + .14;
      while (cycle === 0 || range.loop) {
        const clip = cycle === 0 ? initialClip : loopClip;
        if (!clip.length) { if (cycle === 0 && range.loop && loopClip.length) { cycle++; continue; } break; }
        const tone = clip[index];
        const offset = origin + (cycle ? duration + (cycle - 1) * loopDuration : 0);
        const start = offset + tone.start;
        const end = offset + tone.end;
        if (start > horizon) break;
        if (end > now + .004) this.playTone(tone, Math.max(start, now), end);
        if (++index === clip.length) { index = 0; cycle++; }
      }
    };
    this.timer = setInterval(schedule, 35);
    schedule();
    display();
  }

  private playTone(tone: Tone, start: number, end: number) {
    const bus = this.buses.get(tone.lane);
    if (!bus) return;
    const context = this.context!;
    const oscillator = context.createOscillator();
    oscillator.type = tone.percussion ? 'square' : 'triangle';
    oscillator.frequency.setValueAtTime(440 * 2 ** ((tone.midi - 69) / 12), start);
    if (tone.bendTo !== undefined) oscillator.frequency.exponentialRampToValueAtTime(440 * 2 ** ((tone.bendTo - 69) / 12), end);
    const envelope = context.createGain();
    const attack = Math.min(.015, (end - start) / 3);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(tone.level, start + attack);
    const release = Math.max(start + attack, end - .035);
    if (tone.levels?.length) {
      for (const point of tone.levels) envelope.gain.linearRampToValueAtTime(point.level, Math.max(start + attack, Math.min(release, end + point.at - tone.end)));
    } else envelope.gain.setValueAtTime(tone.level, release);
    envelope.gain.linearRampToValueAtTime(0, end);
    oscillator.connect(envelope);
    envelope.connect(bus);
    this.voices.set(oscillator, envelope);
    oscillator.onended = () => { this.voices.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
    oscillator.start(start);
    oscillator.stop(end);
  }

  applyMix(mix: Map<string, MixChannel>, immediate = false) {
    const time = this.context?.currentTime ?? 0;
    const solo = [...mix.values()].some(channel => channel.solo);
    for (const [lane, channel] of mix) {
      const gain = this.buses.get(lane)?.gain;
      if (!gain) continue;
      if (immediate) gain.value = channelLevel(channel, solo);
      else gain.setTargetAtTime(channelLevel(channel, solo), time, .012);
    }
  }

  stop() {
    this.generation++;
    this.playing = false;
    clearInterval(this.timer);
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.sampleTick = undefined;
    for (const [voice, envelope] of this.voices) {
      voice.onended = null;
      voice.stop();
      voice.disconnect();
      envelope.disconnect();
    }
    this.voices.clear();
    for (const bus of this.buses.values()) bus.disconnect();
    this.buses.clear();
    this.master?.disconnect();
    this.master = undefined;
    this.compressor?.disconnect();
    this.compressor = undefined;
    this.position(null);
  }
}
