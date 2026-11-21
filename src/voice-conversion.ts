import { addSideLane, noteVerses, sound, tickEnd, tonicAt, uid } from './score.js';
import type { Note, Score, Span, Tuplet } from './score.js';

export interface VoiceRange { lanes: string[]; start: number; end: number }
type Destination = { note: Note; index: number };
const play = (note: Note) => note.pitches.length > 0 || !!note.unpitched;
const finish = (note: Note) => tickEnd(note);
const describe = (note: Note) => `${note.lane}，第 ${1 + Math.round(note.at / 96 * 100) / 100} 拍（自谱首）`;

function selectedNotes(score: Score, range: VoiceRange) {
  if (range.start >= range.end) throw Error('请选择有效的音符范围。');
  const notes = score.notes.filter(note => range.lanes.includes(note.lane) && note.at < range.end && finish(note) > range.start);
  if (notes.some(note => note.at < range.start || finish(note) > range.end))
    throw Error('请把选区扩展到边缘音符的完整时值，再转换声部。');
  if (score.tuplets?.some(group => range.lanes.includes(group.lane) && group.at < range.end && tickEnd(group) > range.start &&
    (group.at < range.start || tickEnd(group) > range.end))) throw Error('选区边缘切进了多连音组，请选择完整多连音。');
  return notes;
}

function migrate(score: Score, notes: Map<string, Destination[]>, common: Map<string, Note>) {
  const lookup = new Map<string, Note>(score.notes.map(note => [note.id, note]));
  const endpoint = (span: Span, field: 'from' | 'to') => {
    const id = span[field];
    const slot = field === 'from' ? 'pitch' : 'targetPitch';
    const index = span[slot];
    const mapped = index === undefined ? undefined : notes.get(id)?.[index];
    const note = mapped?.note ?? common.get(id) ?? lookup.get(id);
    if (!note) throw Error('有记号锚定在将被移除的休止上。');
    if (mapped) span[slot] = mapped.index;
    span[field] = note.id;
    return note.lane;
  };
  for (const span of score.spans) {
    if (endpoint(span, 'from') !== endpoint(span, 'to'))
      throw Error('有连线在转换后会跨到另一声部，请扩大选区或先处理该连线。');
    if (span.from === span.to && span.toAt === undefined) throw Error('转换会把一个范围记号的两个端点合到同一音符。');
  }
  if (!score.appearance) return;
  const appearance = { ...score.appearance };
  for (const [key, look] of Object.entries(score.appearance)) {
    const parts: unknown[] = JSON.parse(key);
    const [kind, id, field] = parts;
    if (typeof id !== 'string' || (!notes.has(id) && !common.has(id))) continue;
    if (!['pitch', 'extension', 'generated-tie', 'mark'].includes(String(kind))) continue;
    const pitchSlot = kind === 'pitch' || kind === 'generated-tie' || kind === 'mark' && field === 'accidental' ? 3 : undefined;
    const target = pitchSlot !== undefined ? notes.get(id)?.[Number(parts[pitchSlot])] : undefined;
    parts[1] = target?.note.id ?? common.get(id)?.id ?? id;
    if (target && pitchSlot !== undefined) parts[pitchSlot] = target.index;
    delete appearance[key];
    appearance[JSON.stringify(parts)] = structuredClone(look);
  }
  score.appearance = appearance;
}

const noteTargets = (event: Note) => event.pitches.map((_, index) => ({ note: event, index }));
const groupKey = (group: Tuplet) => JSON.stringify([group.at, group.length, group.count, group.unit, group.written, group.ratio]);
const inside = (group: Tuplet, range: VoiceRange) => range.lanes.includes(group.lane) && group.at >= range.start && tickEnd(group) <= range.end;

export function splitChords(score: Score, range: VoiceRange) {
  if (range.lanes.length !== 1) throw Error('每次请选中一条声部线上的叠音。');
  const events = selectedNotes(score, range);
  const lane = score.lanes.find(item => item.id === range.lanes[0])!;
  const count = Math.max(1, ...events.map(note => note.pitches.length));
  if (count < 2) throw Error('选区内没有叠音。');
  const destinations = [lane];
  for (let n = 1; n < count; n++) destinations.push(addSideLane(score, destinations.at(-1)!.id, range.start, range.end));
  const groups = (score.tuplets ?? []).filter(group => inside(group, range));
  for (const side of destinations.slice(1)) {
    const ids = new Map(groups.map(group => [group.id, uid()]));
    if (groups.length) (score.tuplets ??= []).push(...groups.map(group => ({ ...group, id: ids.get(group.id)!, lane: side.id, parent: group.parent && ids.get(group.parent) })));
  }
  const moved = new Map<string, Destination[]>();
  const common = new Map<string, Note>();
  const assigned = new Map<string, number[]>();
  const ties = new Map<string, Span[]>();
  for (const span of score.spans) if (span.kind === 'tie') ties.set(span.to, [...(ties.get(span.to) ?? []), span]);
  for (const note of events.sort((a, b) => a.at - b.at)) {
    const pitches = note.pitches;
    if (!pitches.length) continue;
    const tonic = tonicAt(score, note.at);
    const ranks = pitches.map((_, index) => index).sort((a, b) => sound(pitches[b], tonic) - sound(pitches[a], tonic));
    const occupied = new Set<number>();
    const allocation = pitches.map(() => -1);
    for (const tie of ties.get(note.id) ?? []) {
      const rank = assigned.get(tie.from)?.[tie.pitch!] ?? (events.some(item => item.id === tie.from) ? -1 : 0);
      if (rank >= 0 && !occupied.has(rank)) {
        allocation[tie.targetPitch!] = rank;
        occupied.add(rank);
      }
    }
    for (const index of ranks) if (allocation[index] < 0) {
      const rank = destinations.findIndex((_, rank) => !occupied.has(rank));
      occupied.add(rank);
      allocation[index] = rank;
    }
    assigned.set(note.id, allocation);
    const entries = pitches.map((pitch, index) => {
      const rank = allocation[index];
      if (!rank) { note.pitches = [pitch]; return { note, index: 0 }; }
      const side: Note = { id: uid(), lane: destinations[rank].id, at: note.at, length: note.length, pitches: [pitch],
        value: note.value, dots: note.dots, beams: structuredClone(note.beams), xmlBeams: structuredClone(note.xmlBeams) };
      score.notes.push(side);
      return { note: side, index: 0 };
    });
    if (!occupied.has(0)) note.pitches = [];
    if (!note.pitches.length && note.grace) throw Error('倚音的主音因同音线只能在副线，请先处理该处倚音。');
    moved.set(note.id, entries);
    common.set(note.id, note);
  }
  migrate(score, moved, common);
  score.notes.sort((a, b) => a.at - b.at);
  return lane.id;
}

const shared = ['dynamic', 'text', 'interNoteText', 'rehearsal', 'extensionText', 'accent', 'staccato', 'tenuto', 'breath', 'fermata', 'grace', 'ornaments'] as const;
export function mergeVoices(score: Score, range: VoiceRange) {
  if (range.lanes.length < 2) throw Error('请选择至少两条声部线。');
  const destination = score.lanes.find(item => item.id === range.lanes[0])!;
  if (range.start < (destination.start ?? 0) || range.end > (destination.end ?? Infinity))
    throw Error('目标声部无法容纳整个选区。');
  const all = selectedNotes(score, range);
  const events = all.filter(play).sort((a, b) => a.at - b.at);
  if (!events.length) throw Error('选区内没有发声音符。');
  const groups = (score.tuplets ?? []).filter(group => inside(group, range));
  const unique = new Map<string, Tuplet>();
  const groupsOf = (note: Note) => groups.filter(group => group.lane === note.lane && group.at <= note.at && tickEnd(group) >= finish(note))
    .sort((a, b) => b.length - a.length).map(groupKey).join(':');
  for (const group of groups) unique.set(groupKey(group), group);
  const folded = new Map<string, Destination[]>();
  const common = new Map<string, Note>();
  const result: Note[] = [];
  for (let i = 0; i < events.length;) {
    const start = i, anchor = events[i++];
    while (i < events.length && events[i].at === anchor.at) i++;
    const chord = events.slice(start, i);
    if ((events[i]?.at ?? Infinity) < finish(anchor) || chord.some(note => finish(note) !== finish(anchor) || groupsOf(note) !== groupsOf(anchor)))
      throw Error('同时发声的音必须起止一致且使用相同的多连音结构。' + describe(anchor));
    if (chord.length > 1 && chord.some(note => note.unpitched)) throw Error('节奏音符 X 不能和其他音叠放。');
    if (chord.reduce((sum, note) => sum + note.pitches.length, 0) > 8) throw Error('一个叠音最多八个数字。');
    const primary = chord.find(note => note.lane === destination.id) ?? anchor;
    const combined = { ...primary, lane: destination.id, pitches: [] } as Note;
    for (const note of chord) {
      const slots = noteTargets(note).map(({ index }) => ({ note: combined, index: combined.pitches.push(note.pitches[index]) - 1 }));
      folded.set(note.id, slots);
      common.set(note.id, combined);
      const verses = noteVerses(note).filter(item => item.text || item.extend);
      if (verses.length) {
        const saved = noteVerses(combined);
        if (verses.some(verse => saved.some(item => item.number === verse.number && JSON.stringify(item) !== JSON.stringify(verse))))
          throw Error('多个声部在同歌词行使用了不同的词。' + describe(note));
        combined.lyric = undefined;
        combined.verses = [...saved, ...verses.filter(verse => !saved.some(item => item.number === verse.number))];
      }
      for (const key of shared) {
        if (note[key] === undefined) continue;
        if (combined[key] !== undefined && JSON.stringify(combined[key]) !== JSON.stringify(note[key]))
          throw Error('声部之间有不同的文字或奏法。' + describe(note));
        Object.assign(combined, { [key]: note[key] });
      }
    }
    result.push(combined);
  }
  const ids = new Map(groups.map(group => [group.id, unique.get(groupKey(group))!.id]));
  if (score.tuplets) score.tuplets = [
    ...score.tuplets.filter(group => !groups.includes(group)),
    ...[...unique.values()].map(group => ({ ...group, lane: destination.id, parent: group.parent && ids.get(group.parent) }))
  ];
  migrate(score, folded, common);
  score.notes = [...score.notes.filter(note => !all.includes(note)), ...result].sort((a, b) => a.at - b.at);
  const noteIds = new Set(score.notes.map(note => note.id));
  if (score.spans.some(span => !noteIds.has(span.from) || !noteIds.has(span.to)))
    throw Error('选区内有仍被引用的休止或范围记号。');
  for (const symbol of score.chordSymbols ?? []) if (range.lanes.includes(symbol.lane) && symbol.at >= range.start && symbol.at < range.end)
    symbol.lane = destination.id;
  score.lanes = score.lanes.filter(lane => lane.id === destination.id || !range.lanes.includes(lane.id) || !lane.parent ||
    lane.start! < range.start || lane.end! > range.end || score.notes.some(note => note.lane === lane.id) ||
    score.tuplets?.some(group => group.lane === lane.id));
  return destination.id;
}
