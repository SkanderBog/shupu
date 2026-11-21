import { measureTable, noteVerses, openScore, removeLanes, setBoundaryBreak, tick, uid } from './score.js';
import type { Appearance, Boundary, Lane, Measure, Note, Score, TempoLine } from './score.js';
import type { LineRule } from './line-layout.js';

export interface LinkedPart {
  id: string;
  name: string;
  lanes: string[];
  scalePercent?: number;
  lineRule?: LineRule;
  showNames?: boolean;
  showLyrics?: boolean;
  showDynamics?: boolean;
  copyBreaks?: boolean;
  presentation?: PartPresentation;
}

function legacyPart(score: Score, part: LinkedPart) {
  const view = structuredClone(score);
  delete view.linkedParts;
  const lanes = new Set(part.lanes);
  removeLanes(view, new Set(view.lanes.filter(lane => !lanes.has(lane.parent ?? lane.id)).map(lane => lane.id)));
  for (const lane of view.lanes) lane.display = 'show';
  view.scalePercent = part.scalePercent ?? view.scalePercent;
  view.lineRule = part.lineRule;
  delete view.pageLayouts;
  delete view.columns;
  for (const [index, bar] of view.measures.entries()) {
    const cut = score.measures[index].partBreaks?.[part.id];
    delete bar.keepWithNext;
    delete bar.lockLineEnd;
    delete bar.lineSection;
    if (bar.layout) delete bar.layout.visibility;
    if (index > 0 && (cut || !part.copyBreaks)) setBoundaryBreak(view, index, cut);
  }
  return view;
}

const styles = ['spacing', 'justifyBottom', 'scalePercent', 'measureNumbers', 'brackets', 'pageLayouts',
  'lineRule', 'titleSignatures', 'textStyles', 'engravingStyle', 'paper', 'folio'] as const;
const measureFields = ['system', 'meterHidden', 'keyHidden', 'keyAppearance', 'meterAppearance', 'numberDisplay',
  'numberAppearance', 'layout', 'localNames', 'highlights', 'keepWithNext', 'lockLineEnd', 'lineSection'] as const;
const laneFields = ['octave', 'displayOctave', 'display', 'nameText', 'shortNameText', 'sharedNamePlacement'] as const;
const boundaryFields = ['appearance', 'break', 'breakAppearance', 'fermataAppearance'] as const;
const lineFields = ['dashVisible', 'dashLayout', 'appearance'] as const;

type PartPresentation = {
  version: 1;
  order?: string[];
  style: Pick<Score, typeof styles[number]>;
  measures: Record<string, Pick<Measure, typeof measureFields[number]>>;
  boundaries: Record<string, Pick<Boundary, typeof boundaryFields[number]>>;
  lanes: Record<string, Pick<Lane, typeof laneFields[number]>>;
  appearances: Record<string, Appearance>;
  marks: Record<string, Appearance>;
  columns: Record<string, number>;
  lines: Record<string, Pick<TempoLine, typeof lineFields[number]>>;
  grace: Record<string, NonNullable<NonNullable<Note['grace']>['before']>['layout']>;
};

function pick<T, K extends keyof T>(record: T | undefined, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.flatMap(key => record?.[key] === undefined ? [] : [[key, record[key]]])) as Pick<T, K>;
}
function apply<T, K extends keyof T>(record: T, from: Pick<T, K> | undefined, keys: readonly K[]) {
  for (const key of keys) {
    if (from?.[key] === undefined) delete record[key];
    else record[key] = structuredClone(from[key]);
  }
}

export function ensurePartAnchors(score: Score) {
  for (const list of [score.measures, score.spans, score.endings ?? []]) {
    const ids = new Set<string>();
    for (const item of list) {
      if (typeof item.id !== 'string' || !item.id || ids.has(item.id)) item.id = uid();
      ids.add(item.id);
    }
  }
}

function anchors(score: Score) {
  const bars = measureTable(score);
  const ids = score.measures.map((bar, i) => bar.id ?? String(i));
  const boundary = (index: number) => index === bars.length ? '$end' : ids[index];
  const boundaryIndex = (id: string) => id === '$end' ? bars.length : ids.indexOf(id);
  const at = (position: number) => {
    if (position === bars.at(-1)!.end) return '$end';
    const bar = bars.find(bar => position >= bar.start && position < bar.end);
    return bar && JSON.stringify([ids[bar.index], tick(position - bar.start)]);
  };
  const position = (id: string) => {
    if (id === '$end') return bars.at(-1)!.end;
    const [bar, offset] = JSON.parse(id) as [string, number];
    const index = ids.indexOf(bar);
    return index >= 0 && offset >= 0 && offset < bars[index].length ? tick(bars[index].start + offset) : undefined;
  };
  return { boundary, boundaryIndex, at, position };
}

function mapAppearanceKey<T, U>(key: string, time: (value: T) => unknown, bar: (value: U) => unknown) {
  const fields = JSON.parse(key);
  if (!Array.isArray(fields)) return;
  let converted: unknown;
  if (['pitch', 'extension', 'generated-tie', 'divisi-brace', 'lane-name'].includes(fields[0])) {
    if (fields[0] === 'lane-name' && fields[3] === 'name') return key;
    converted = time(fields[2]);
    if (converted === undefined) return;
    fields[2] = converted;
  } else if (['staff-guide', 'staff-bracket'].includes(fields[0])) {
    const slot = fields[0] === 'staff-bracket' ? 2 : 1;
    converted = bar(fields[slot]);
    if (converted === undefined || converted === -1) return;
    fields[slot] = converted;
  }
  return JSON.stringify(fields);
}

const appearanceCollections = ['spans', 'endings', 'tempoMarks'] as const;
function identityRecords(score: Score) {
  return appearanceCollections.flatMap(group => (score[group] ?? []).flatMap(item => item.id ? [[group + ':' + item.id, item] as const] : []));
}

export function capturePartPresentation(score: Score): PartPresentation {
  const map = anchors(score);
  const style = pick(score, styles);
  const entries = <T>(pairs: [string | undefined, T][]) =>
    Object.fromEntries(pairs.flatMap(([key, value]) => key === undefined || value === undefined ? [] : [[key, value]]));
  return structuredClone({
    version: 1, style, order: score.lanes.map(lane => lane.id),
    measures: entries(score.measures.map((bar, i) => [map.boundary(i), pick(bar, measureFields)])),
    boundaries: entries(Object.entries(score.boundaries ?? {}).map(([i, item]) => [map.boundary(Number(i)), pick(item, boundaryFields)])),
    lanes: entries(score.lanes.map(lane => [lane.id, pick(lane, laneFields)])),
    appearances: entries(Object.entries(score.appearance ?? {}).map(([key, value]) => [mapAppearanceKey(key, map.at, map.boundary), value])),
    columns: entries(Object.entries(score.columns ?? {}).map(([key, value]) => [map.at(Number(key)), value])),
    marks: entries(identityRecords(score).flatMap(([key, item]) => item.appearance ? [[key, item.appearance]] : [])),
    lines: entries((score.tempoLines ?? []).map(line => [line.id, pick(line, lineFields)])),
    grace: entries(score.notes.flatMap(note => (['before', 'after'] as const).flatMap(side => {
      const layout = note.grace?.[side]?.layout;
      return layout ? [[note.id + ':' + side, layout] as [string, typeof layout]] : [];
    })))
  });
}

function applyPresentation(view: Score, presentation: PartPresentation) {
  const map = anchors(view);
  apply(view, presentation.style, styles);
  for (const [i, bar] of view.measures.entries()) apply(bar, presentation.measures[map.boundary(i)], measureFields);
  for (let i = 0; i <= view.measures.length; i++) {
    const content = view.boundaries?.[i], look = presentation.boundaries[map.boundary(i)];
    if (!content && !look) continue;
    const boundary = content ?? ((view.boundaries ??= {})[i] = {});
    apply(boundary, look, boundaryFields);
    if (!Object.keys(boundary).length) delete view.boundaries![i];
  }
  for (const lane of view.lanes) {
    const saved = presentation.lanes[lane.id];
    if (saved) apply(lane, { ...saved, octave: saved.octave ?? lane.octave }, laneFields);
  }
  if (presentation.order) {
    const rank = new Map(presentation.order.map((id, index) => [id, index]));
    view.lanes.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
  }
  for (const [key, item] of identityRecords(view)) item.appearance = presentation.marks[key];
  for (const line of view.tempoLines ?? []) apply(line, presentation.lines[line.id], lineFields);
  for (const note of view.notes) for (const side of ['before', 'after'] as const) {
    const group = note.grace?.[side];
    if (group) group.layout = presentation.grace[note.id + ':' + side];
  }
  view.appearance = Object.fromEntries(Object.entries(presentation.appearances).flatMap(([key, value]) => {
    const rewritten = mapAppearanceKey(key, map.position, map.boundaryIndex);
    return rewritten ? [[rewritten, value]] : [];
  }));
  view.columns = Object.fromEntries(Object.entries(presentation.columns).flatMap(([key, value]) => {
    const at = map.position(key);
    return at === undefined ? [] : [[at, value]];
  }));
  // Project saved layout to the voice set again after a master voice has been removed.
  removeLanes(view, new Set());
}

export function editablePart(score: Score, part: LinkedPart) {
  const view = legacyPart(score, part);
  return part.presentation ? openScore(JSON.stringify(applyPartAppearance(view, part.presentation))) : view;
}
function applyPartAppearance(view: Score, presentation: PartPresentation) {
  applyPresentation(view, structuredClone(presentation));
  return view;
}

export function partScore(score: Score, part: LinkedPart) {
  const view = editablePart(score, part);
  view.subtitle = [score.subtitle, part.name].filter(Boolean).join(' · ').slice(0, 300);
  if (part.showNames === false) {
    for (const lane of view.lanes) lane.name = lane.shortName = '';
    for (const bar of view.measures) delete bar.localNames;
  }
  for (const note of view.notes) {
    if (part.showLyrics === false) { delete note.lyric; delete note.verses; }
    if (part.showDynamics === false) delete note.dynamic;
  }
  if (part.showDynamics === false) view.spans = view.spans.filter(span => span.kind !== 'crescendo' && span.kind !== 'diminuendo');
  return view;
}

export function independentPart(score: Score, part: LinkedPart) {
  const view = editablePart(score, part);
  view.subtitle = [score.subtitle, part.name].filter(Boolean).join(' · ').slice(0, 300);
  const hidden = { visible: false, layout: false };
  const hide = (parts: (string | number | null)[]) => {
    const key = JSON.stringify(parts);
    (view.appearance ??= {})[key] = { ...view.appearance?.[key], ...hidden };
  };
  if (part.showNames === false) for (const bar of measureTable(view)) for (const lane of view.lanes)
    for (const field of ['name', 'shortName']) hide(['lane-name', lane.id, bar.start, field]);
  for (const note of view.notes) {
    if (part.showLyrics === false) for (const verse of noteVerses(note)) {
      hide(['mark', note.id, 'lyric', null, verse.number]);
      hide(['mark', note.id, 'lyric-extension', null, verse.number]);
    }
    if (part.showDynamics === false && note.dynamic) hide(['mark', note.id, 'dynamic', null, null]);
  }
  if (part.showDynamics === false) for (const span of view.spans)
    if (span.kind === 'crescendo' || span.kind === 'diminuendo') span.appearance = { ...span.appearance, ...hidden };
  return view;
}

function withLooks<T, K extends keyof T>(after: T, previous: T | undefined, keys: readonly K[]) {
  const result = structuredClone(after);
  apply(result, previous, keys);
  return result;
}

export function mergePartEdit(master: Score, partId: string, view: Score): Score {
  const result = structuredClone(master);
  const part = result.linkedParts!.find(item => item.id === partId)!;
  const roots = new Set(part.lanes);
  const includes = (lane: Lane) => roots.has(lane.parent ?? lane.id);
  const lanes = new Set(master.lanes.filter(includes).map(lane => lane.id));
  const signature = (source: Score) => JSON.stringify([
    source.key, source.tonic, source.numerator, source.denominator, source.groups,
    source.measures.map(bar => [bar.id, bar.length, bar.meter, bar.actualMeter, bar.key, bar.tonic, bar.pickup])
  ]);
  if (view.lanes.length !== lanes.size || view.lanes.some(lane => !lanes.has(lane.id)) || signature(view) !== signature(master))
    throw Error('请在主谱中增删声部或小节、调整调号拍号。');

  ensurePartAnchors(view);
  part.presentation = capturePartPresentation(view);
  part.scalePercent = view.scalePercent;
  part.lineRule = view.lineRule;
  const laneById = new Map(view.lanes.map(lane => [lane.id, lane]));
  result.lanes = result.lanes.map(lane => {
    const edited = laneById.get(lane.id);
    return edited ? { ...lane, name: edited.name, shortName: edited.shortName } : lane;
  });
  const originalNotes = new Map(result.notes.map(note => [note.id, note]));
  const partNotes = new Set(result.notes.filter(note => lanes.has(note.lane)).map(note => note.id));
  const committedNotes = view.notes.map(note => {
    const next = structuredClone(note), previous = originalNotes.get(note.id);
    for (const side of ['before', 'after'] as const) {
      const group = next.grace?.[side];
      if (group) group.layout = previous?.grace?.[side]?.layout;
    }
    return next;
  });
  result.notes = [...result.notes.filter(note => !lanes.has(note.lane)), ...committedNotes]
    .sort((a, b) => a.at - b.at || a.lane.localeCompare(b.lane));
  const combine = <T extends { id?: string }, K extends keyof T>(before: T[], after: T[], keys: readonly K[], owns: (item: T) => boolean = () => true) => {
    const edits = new Map(after.map(item => [item.id, item]));
    const originals = new Set(before.map(item => item.id));
    return [...before.flatMap(item => {
      const updated = edits.get(item.id);
      return updated ? [withLooks(updated, item, keys)] : owns(item) ? [] : [item];
    }), ...after.filter(item => !originals.has(item.id)).map(item => withLooks(item, undefined, keys))];
  };
  result.spans = combine(result.spans, view.spans, ['appearance'], span => partNotes.has(span.from) && partNotes.has(span.to));
  result.tuplets = combine(result.tuplets ?? [], view.tuplets ?? [], [], group => lanes.has(group.lane));
  result.chordSymbols = combine(result.chordSymbols ?? [], view.chordSymbols ?? [], [], item => lanes.has(item.lane));
  result.endings = combine(result.endings ?? [], view.endings ?? [], ['appearance']);
  result.tempoMarks = combine(result.tempoMarks ?? [], view.tempoMarks ?? [], ['appearance']);
  result.tempoLines = combine(result.tempoLines ?? [], view.tempoLines ?? [], lineFields);
  for (const key of ['title', 'subtitle', 'credit', 'composer', 'lyricist', 'arranger', 'copyright', 'tempo'] as const)
    Object.assign(result, { [key]: view[key] });
  for (const [i, bar] of result.measures.entries()) {
    const edited = view.measures[i];
    bar.route = edited.route;
    for (const field of ['number', 'numberStep', 'numberLabel'] as const) Object.assign(bar, { [field]: edited[field] });
    const cut = view.boundaries?.[i]?.break;
    if (cut) (bar.partBreaks ??= {})[partId] = cut;
    else if (bar.partBreaks) delete bar.partBreaks[partId];
  }
  for (let i = 0; i <= result.measures.length; i++) {
    const previous = result.boundaries?.[i], edited = view.boundaries?.[i];
    if (!previous && !edited) continue;
    const next = { ...previous };
    apply(next, edited, ['style', 'repeats', 'fermata']);
    if (Object.keys(next).length) (result.boundaries ??= {})[i] = next;
    else if (result.boundaries) delete result.boundaries[i];
  }
  return openScore(JSON.stringify(result));
}
