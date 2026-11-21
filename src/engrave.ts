import { arcGeometry, connected, graceConnected, graceRhythm, notation, pitchInMeasure, pitchOrder, rhythmAlignment, shortArcRise } from './notation.js';
import { ORNAMENT_KINDS, paperSize } from './score.js';
import { ornamentVector } from './ornament-outlines.js';
import { doubleSharpPath } from './accidental-outline.js';
import type { OrnamentKind } from './score.js';
import type { Link, Token } from './notation.js';
import { boundaryAt, breathShape, endingRange, endsRepeat, ENGRAVING_STYLE, keyName, laneNameFormat, laneNameValue, measureTable, noteVerses, pageLayout, PAPER_HEIGHT, PAPER_WIDTH, pitchAtSound, sameKey, sound, startsRepeat, systemBrackets, systemVisibility, textFontStack, TEXT_STYLES, tonicAt } from './score.js';
import type { BracketType, Cursor, CurveHandle, Lane, Pitch, Placement, Score, Spacing, StyleRole, TextFace, TextFormat } from './score.js';
import { isSwing, tempoLabel, tempoLineEnd } from './tempo.js';
import { GRACE_SIDES, tickEnd, tupletScale, tupletWritten } from './score.js';
import type { GraceSide } from './score.js';
import { linePlanner } from './line-layout.js';
import { routeAtStart, routeCaption } from './roadmap.js';

const STROKE_RADIUS = 0.5;
const CHORAL_BRACKET_FLARE = { width: 14, height: 9 };
const escape = (text: unknown) => String(text).replace(/[<>&"']/g, char =>
  ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[char]!);
const line = (left: number, top: number, right: number, bottom: number, className = '') =>
  `<line x1="${left}" y1="${top}" x2="${right}" y2="${bottom}" class="${className}"/>`;
const text = (x: number, y: number, content: unknown, className = '', anchor = 'middle') =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" class="${className}">${escape(content)}</text>`;
const dot = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="1.48"/>`;
const path = (geometry: string, className = '') => `<path d="${geometry}" class="${className}"/>`;
const fermataShape = (x: number, y: number) => path(`M${x - 6} ${y}q6 -12 12 0`) + dot(x, y - 1);
const meterNumerator = (meter: { groups: number[]; numerator: number }) => new Set(meter.groups).size > 1 ? meter.groups.join('+') : String(meter.numerator);
const meterWidthOf = (numerator: string, denominator: number) => Math.max(numerator.length, String(denominator).length) * 9 + 7;
const meterShape = (x: number, y: number, width: number, numerator: string, denominator: number) =>
  text(x + width / 2, y - 2, numerator, 'signature-meter') + line(x + 2, y + 1, x + width - 2, y + 1, 'signature-fraction') +
  text(x + width / 2, y + 16, denominator, 'signature-meter');
const shift = (shape: string, x = 0, y = 0) => x || y ? `<g transform="translate(${x} ${y})">${shape}</g>` : shape;
const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high));
const accidentalSign = (alter: number) => ({ [-2]: '♭♭', [-1]: '♭', 0: '♮', 1: '♯', 2: '𝄪' })[alter];
const accidentalWidth = (pitch: Pitch) => pitch.alter === -2 ? 15 : pitch.alter < 0 ? 7 : 10;
function accidentalShape(x: number, y: number, sign: string | undefined, css: string, size = 10) {
  if (!sign) return '';
  if (sign !== '𝄪') return text(x, y, sign, css, 'end');
  return `<path class="${css} solid double-sharp" aria-label="𝄪" fill="currentColor" d="${doubleSharpPath}" transform="translate(${x - size} ${y - size * .5 + 1}) scale(${size / 10})"/>`;
}
const accidentalInk = (token: Token, pitch: Pitch, digitHalf: number) => {
  const chord = token.note.pitches.length > 1;
  const scale = chord ? .82 : 1;
  return { scale, gap: chord ? Math.max(3.9, digitHalf - 1.15) : Math.max(4.6, digitHalf - .85),
    width: accidentalWidth(pitch) * scale, raise: chord ? 1 : 3 };
};
const chordScale = .75;
const tokenScale = (token: Token) => token.note.pitches.length > 1 ? chordScale : 1;
interface InkBox { left: number; right: number; top: number; bottom: number }
const offsetBox = (box: InkBox, x: number, y: number) =>
  ({ left: box.left + x, right: box.right + x, top: box.top + y, bottom: box.bottom + y });
const intersectsX = (box: InkBox, left: number, right: number) => box.left < right && box.right > left;
function legalY(wanted: number, gaps: [number, number][]) {
  const allowed = (position: number) => gaps.every(([lo, hi]) => position <= lo || position >= hi);
  if (allowed(wanted)) return wanted;
  return gaps.flat().filter(allowed).sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted) || a - b)[0] ?? wanted;
}

function verticalClearance(upper: InkBox[], lower: InkBox[], left: number, right: number) {
  const below = lower.filter(box => intersectsX(box, left, right)).sort((a, b) => a.left - b.left);
  let clearance = 0;
  for (const above of upper) {
    const from = Math.max(left, above.left), to = Math.min(right, above.right);
    if (from >= to) continue;
    for (const box of below) {
      if (box.left >= to) break;
      if (box.right > from) clearance = Math.max(clearance, above.bottom - box.top);
    }
  }
  return clearance;
}

function curlyBrace(x: number, top: number, middle: number, bottom: number, direction: number, weight: number) {
  const xAt = (offset: number) => x + offset * direction;
  const upper = middle - top, lower = bottom - middle;
  const body = Math.min(4, weight * 2);
  const tip = Math.min(2, weight * .85);
  const cusp = Math.min(2.5, weight * 1.1);
  return `M${xAt(5)} ${top}` +
    `C${xAt(-4.8)} ${top + upper * .22} ${xAt(1.2)} ${top + upper * .42} ${xAt(-.8)} ${top + upper * .64}` +
    `C${xAt(-1.1)} ${top + upper * .79} ${xAt(-1.8)} ${middle - upper * .05} ${xAt(-5)} ${middle}` +
    `C${xAt(-1.8)} ${middle + lower * .05} ${xAt(-1.1)} ${bottom - lower * .79} ${xAt(-.8)} ${bottom - lower * .64}` +
    `C${xAt(1.2)} ${bottom - lower * .42} ${xAt(-4.8)} ${bottom - lower * .22} ${xAt(5)} ${bottom}` +
    `L${xAt(5)} ${bottom - tip}` +
    `C${xAt(-4.8 + body)} ${bottom - lower * .22} ${xAt(1.2 + body)} ${bottom - lower * .42} ${xAt(-.8 + cusp)} ${bottom - lower * .64}` +
    `C${xAt(-1.1 + cusp)} ${bottom - lower * .79} ${xAt(-1.8 + cusp)} ${middle + lower * .05} ${xAt(-5 + cusp)} ${middle}` +
    `C${xAt(-1.8 + cusp)} ${middle - upper * .05} ${xAt(-1.1 + cusp)} ${top + upper * .79} ${xAt(-.8 + cusp)} ${top + upper * .64}` +
    `C${xAt(1.2 + body)} ${top + upper * .42} ${xAt(-4.8 + body)} ${top + upper * .22} ${xAt(5)} ${top + tip}Z`;
}

function choralBracket(x: number, top: number, bottom: number) {
  const inner = x + 3.5, tip = x + CHORAL_BRACKET_FLARE.width;
  return `M${x} ${top}C${x + 6} ${top - 1} ${x + 11} ${top - 3} ${tip} ${top - CHORAL_BRACKET_FLARE.height}` +
    `Q${x + 12} ${top - 2} ${inner} ${top + .5}V${bottom - .5}` +
    `Q${x + 12} ${bottom + 2} ${tip} ${bottom + CHORAL_BRACKET_FLARE.height}` +
    `C${x + 11} ${bottom + 3} ${x + 6} ${bottom + 1} ${x} ${bottom}Z`;
}

type BracketProfile = { type: BracketType; y1: number; y2: number; offset?: number; layout: boolean };
function bracketEdges({ type, y1, y2 }: BracketProfile, y: number) {
  if (type === 'bracket') {
    const distance = Math.max(0, y1 - y, y - y2);
    if (!distance) return [0, 3.5];
    if (distance > CHORAL_BRACKET_FLARE.height) return;
    const fraction = distance / CHORAL_BRACKET_FLARE.height;
    return [CHORAL_BRACKET_FLARE.width * fraction ** .7, CHORAL_BRACKET_FLARE.width * (1 - (1 - fraction) ** 2) + 3.5 * (1 - fraction)];
  }
  if (y < y1 - .4 || y > y2 + .4) return;
  const fromEnd = Math.min(Math.abs(y - y1), Math.abs(y - y2));
  if (type === 'square') return [-.4, fromEnd <= .5 ? 5.4 : .4];
  const part = fromEnd / Math.max(1, (y2 - y1) / 2);
  if (part < .001) return [5, 5];
  if (part > .96) return [-5, -2];
  return [-1.9, 2.5 + 2.5 * Math.max(0, 1 - part * 6)];
}
function bracketPositions(profiles: BracketProfile[]) {
  const positions: number[] = [];
  for (const [index, profile] of profiles.entries()) {
    const base = profile.type === 'bracket' ? -9 : -10;
    let limit = Infinity;
    if (profile.layout) for (let j = 0; j < index; j++) {
      const inner = profiles[j];
      if (!inner.layout) continue;
      const top = Math.max(profile.y1 - 9, inner.y1 - 9), bottom = Math.min(profile.y2 + 9, inner.y2 + 9);
      if (top > bottom) continue;
      const samples = [...[profile, inner].flatMap(item => [item.y1, item.y2, (item.y1 + item.y2) / 2, item.y1 - 9, item.y2 + 9]),
        ...Array.from({ length: Math.ceil((bottom - top) / 3) + 1 }, (_, step) => Math.min(bottom, top + step * 3))];
      const gap = Math.max(-Infinity, ...samples.flatMap(y => {
        const outerEdge = bracketEdges(profile, y), innerEdge = bracketEdges(inner, y);
        return outerEdge && innerEdge ? [outerEdge[1] - innerEdge[0]] : [];
      }));
      if (Number.isFinite(gap)) limit = Math.min(limit, positions[j] - gap);
    }
    positions.push(Math.min(Math.min(base, limit - .55) + (profile.offset ?? 0), limit));
  }
  return positions;
}

export function wedgeClearance(center: number, left: number, right: number, first: number, last: number,
  obstacles: InkBox[], preferred?: number, padding = 2) {
  const gaps: [number, number][] = [];
  const opening = (x: number) => first + (last - first) * (x - left) / (right - left);
  for (const box of obstacles) if (intersectsX(box, left - STROKE_RADIUS, right + STROKE_RADIUS)) {
    const radius = Math.max(opening(clamp(box.left, left, right)), opening(clamp(box.right, left, right))) + padding;
    gaps.push([box.top - radius - center, box.bottom + radius - center]);
  }
  return preferred === undefined ? Math.min(0, ...gaps.map(([above]) => above)) : legalY(preferred, gaps);
}

interface ColumnGap { from: number; to: number; width: number }

function columnGeometry(minimums: number[], additional: ColumnGap[]) {
  const count = minimums.length + 1;
  const incoming: ColumnGap[][] = Array.from({ length: count }, () => []);
  const outgoing: ColumnGap[][] = Array.from({ length: count }, () => []);
  const add = (gap: ColumnGap) => {
    incoming[gap.to].push(gap);
    outgoing[gap.from].push(gap);
  };
  minimums.forEach((width, from) => add({ from, to: from + 1, width }));
  additional.forEach(add);
  const fromStart = [0];
  for (let to = 1; to < count; to++) fromStart.push(Math.max(...incoming[to].map(edge => fromStart[edge.from] + edge.width)));
  const toEnd = Array<number>(count).fill(0);
  for (let from = count - 2; from >= 0; from--) toEnd[from] = Math.max(...outgoing[from].map(edge => toEnd[edge.to] + edge.width));
  return { incoming, outgoing, fromStart, toEnd, width: fromStart[count - 1] };
}

export function moveColumns(points: number[], minimums: number[], offsets: (number | undefined)[], additional: ColumnGap[] = []) {
  const last = points.length - 1;
  if (!offsets.slice(1, last).some(Boolean)) return points;
  const result = [...points];
  const { incoming, outgoing, fromStart, toEnd } = columnGeometry(minimums, additional);
  for (let index = 1; index < last; index++) {
    if (!offsets[index]) continue;
    const wanted = clamp(points[index] + offsets[index]!, points[0] + fromStart[index], points[last] - toEnd[index]);
    const right = wanted >= result[index];
    result[index] = wanted;
    if (right) {
      for (let next = index + 1; next < last; next++)
        result[next] = Math.max(result[next], ...incoming[next].map(edge => result[edge.from] + edge.width));
    } else {
      for (let next = index - 1; next > 0; next--)
        result[next] = Math.min(result[next], ...outgoing[next].map(edge => result[edge.to] - edge.width));
    }
  }
  return result;
}

function glyphs(token: Token, lane: Lane, score: Score, tonic: number, fontSize: number) {
  if (token.note.unpitched) return [];
  const original = tonicAt(score, token.note.at);
  const ordered = pitchOrder(token.note, original).map(item => original === tonic ? item :
    { ...item, pitch: pitchAtSound(sound(item.pitch, original), tonic) });
  const parent = lane.parent ? score.lanes.find(parent => parent.id === lane.parent) : undefined;
  const center = parent?.displayOctave ?? lane.displayOctave ?? lane.octave;
  let y = 0;
  return ordered.map((item, depth) => ({ ...item, depth, y: 0, octave: item.pitch.octave - center })).reverse().map((item, index, stack) => {
    if (index) y -= (fontSize + 8) * chordScale + Math.max(0, stack[index - 1].octave) * 4 + Math.max(0, -item.octave) * 4;
    return { ...item, y };
  }).reverse();
}

export type ElementSelection =
  | { kind: 'barline'; index: number }
  | { kind: 'bar-fermata'; index: number }
  | { kind: 'break'; index: number }
  | { kind: 'ending'; index: number }
  | { kind: 'span'; index: number }
  | { kind: 'signature'; index: number; field: 'key' | 'meter'; header?: true }
  | { kind: 'measure-number'; index: number }
  | { kind: 'staff-bracket'; id: string; first: number; last: number }
  | { kind: 'tempo-mark'; id: string }
  | { kind: 'tempo-line'; id: string }
  | { kind: 'chord-symbol'; id: string }
  | { kind: 'route'; id: string; index: number }
  | { kind: 'tuplet'; id: string }
  | { kind: 'grace'; id: string; side: GraceSide; note: string; index: number }
  | { kind: 'grace-line'; id: string; side: GraceSide; link: string }
  | { kind: 'generated-tie'; id: string; at: number; pitch: number }
  | { kind: 'header'; field: 'title' | 'subtitle' | 'credit' | 'lyricist' | 'arranger' | 'composer' | 'copyright' | 'tempo' }
  | { kind: 'staff-guide'; index: number }
  | { kind: 'lane-name'; lane: string; at: number; field: 'name' | 'shortName' }
  | { kind: 'divisi-brace'; lane: string; at: number; side: 'start' | 'end' }
  | { kind: 'pitch'; id: string; at: number; index: number }
  | { kind: 'extension'; id: string; at: number }
  | { kind: 'mark'; id: string; field: 'lyric' | 'lyric-extension' | 'dynamic' | 'text' | 'interNoteText' | 'rehearsal' | 'staccato' | 'accent' | 'fermata' | 'tenuto' | 'breath' | 'accidental' | 'ornament'; pitch?: number; verse?: number; extension?: number; ornament?: OrnamentKind };

export function appearanceKey(element: ElementSelection) {
  if (element.kind === 'header') return JSON.stringify(['header', element.field]);
  if (element.kind === 'signature') return JSON.stringify([element.kind, element.index, element.field, ...(element.header ? ['header'] : [])]);
  if (element.kind === 'staff-bracket') return JSON.stringify([element.kind, element.id, element.first]);
  if (element.kind === 'tempo-mark' || element.kind === 'tempo-line' || element.kind === 'tuplet' ||
    element.kind === 'chord-symbol' || element.kind === 'route') return JSON.stringify([element.kind, element.id]);
  if (element.kind === 'grace') return JSON.stringify([element.kind, element.id, element.side, element.note, element.index]);
  if (element.kind === 'grace-line') return JSON.stringify([element.kind, element.id, element.side, element.link]);
  if (element.kind === 'lane-name') return JSON.stringify([element.kind, element.lane, element.at, element.field]);
  if (element.kind === 'divisi-brace') return JSON.stringify([element.kind, element.lane, element.at, element.side]);
  if (element.kind === 'pitch') return JSON.stringify(['pitch', element.id, element.at, element.index]);
  if (element.kind === 'extension') return JSON.stringify([element.kind, element.id, element.at]);
  if (element.kind === 'generated-tie') return JSON.stringify([element.kind, element.id, element.at, element.pitch]);
  if (element.kind === 'mark') return JSON.stringify(['mark', element.id, element.field, element.pitch, element.verse,
    ...(element.extension === undefined ? [] : [element.extension]), ...(element.ornament ? [element.ornament] : [])]);
  return JSON.stringify([element.kind, element.index]);
}

export function appearanceOf(score: Score, element: ElementSelection) {
  switch (element.kind) {
    case 'measure-number': return score.measures[element.index]?.numberAppearance;
    case 'staff-bracket': return systemBrackets(score, element.first, element.last).items.find(item => item.id === element.id)?.appearance;
    case 'tempo-mark': return score.tempoMarks?.find(mark => mark.id === element.id)?.appearance;
    case 'tempo-line': return score.tempoLines?.find(line => line.id === element.id)?.appearance;
    case 'lane-name': {
      const lane = score.lanes.find(row => row.id === element.lane);
      if (!lane) return undefined;
      const bar = element.field === 'shortName' ? measureTable(score).find(item => item.start === element.at) : undefined;
      const local = score.appearance?.[appearanceKey(element)];
      return { ...local, placement: local?.independentPosition === false ? lane.sharedNamePlacement : local?.placement,
        text: laneNameFormat(lane, element.field, bar) };
    }
    case 'signature': {
      const measure = score.measures[element.index];
      const appearance = measure?.[element.field === 'key' ? 'keyAppearance' : 'meterAppearance'];
      return element.header ? score.appearance?.[appearanceKey(element)] ??
        { ...appearance, ...score.appearance?.[JSON.stringify(['signature', 0, element.field])] } : appearance;
    }
    case 'barline': return score.boundaries?.[element.index]?.appearance;
    case 'bar-fermata': return score.boundaries?.[element.index]?.fermataAppearance;
    case 'break': return score.boundaries?.[element.index]?.breakAppearance;
    case 'ending': return score.endings?.[element.index]?.appearance;
    case 'span': return score.spans[element.index]?.appearance;
    default: return score.appearance?.[appearanceKey(element)];
  }
}

export const rhythmPick = (token: Token, at: number): Extract<ElementSelection, { kind: 'pitch' | 'extension' }> =>
  at === token.at ? { kind: 'pitch', id: token.note.id, at, index: 0 } : { kind: 'extension', id: token.note.id, at };

export function alignmentOf(score: Score, measure: ReturnType<typeof measureTable>[number], token: Token, at = token.at) {
  return appearanceOf(score, rhythmPick(token, at))?.alignment ?? rhythmAlignment(score, measure, token, at);
}

export function titleSignature(score: Score, field: 'key' | 'meter') {
  return !!score.titleSignatures?.[field] || !score.measures[0][field] &&
    !score.measures[0][field === 'key' ? 'keyHidden' : 'meterHidden'];
}

export function localCeiling(base: number, left: number, right: number,
  boxes: { left: number; right: number; top: number }[]) {
  return boxes.reduce((height, box) => left < box.right && right > box.left ? Math.min(height, box.top) : height, base);
}

export type GraceCaret = { id: string; side: GraceSide; gap: number };
export function engrave(score: Score, cursor: Cursor, range: Cursor | null,
  selection: ElementSelection | null = null, input = false, prepared = notation(score),
  lyricEdit?: { lane: string; at: number; verse: number; rows?: number[] }, selectedEnd?: CurveHandle, graceCaret?: GraceCaret,
  pendingSlur?: { id: string; at: number; lane: string },
  display?: { showLyrics?: boolean; showDynamics?: boolean; showNames?: boolean }) {
  const { measures, tokens, links, byLane, accidentals } = prepared;
  const signAt = (token: Token, index: number) => {
    const alter = accidentals.signs.get(token)?.[index];
    return alter === undefined ? '' : accidentalSign(alter);
  };
  const tempoLines = (score.tempoLines ?? []).map(line => ({ line, to: line.lane || line.playback === false ? line.to : tempoLineEnd(score, line) }));
  const scale = (score.scalePercent ?? 100) / 100;
  const paper = paperSize(score);
  const pageWidth = paper.pixelWidth / scale;
  const pageHeight = paper.pixelHeight / scale;
  const appearance = (element: ElementSelection) => {
    const current = appearanceOf(score, element);
    const dynamic = element.kind === 'span' && ['crescendo', 'diminuendo'].includes(score.spans[element.index]?.kind) ||
      element.kind === 'mark' && element.field === 'dynamic';
    const lyrics = element.kind === 'mark' && (element.field === 'lyric' || element.field === 'lyric-extension');
    if (display?.showDynamics === false && dynamic || display?.showLyrics === false && lyrics ||
      display?.showNames === false && element.kind === 'lane-name') return { ...current, visible: false, layout: false };
    return current;
  };
  const placement = (element: ElementSelection) => appearance(element)?.placement ?? {};
  const occupies = (element: ElementSelection) => appearance(element)?.layout !== false;
  const markOf = (token: Token, field: Extract<ElementSelection, { kind: 'mark' }>['field'], verse?: number, pitch?: number): ElementSelection =>
    ({ kind: 'mark', field, id: token.note.id, verse, pitch });
  const linkOf = (link: Link): ElementSelection => link.source === undefined
    ? { kind: 'generated-tie', id: link.from.note.id, at: link.from.at, pitch: link.pitch! }
    : { kind: 'span', index: link.source };
  const laneMap = new Map(score.lanes.map(lane => [lane.id, lane]));
  const style = { ...TEXT_STYLES, ...score.textStyles };
  const engraving = { ...ENGRAVING_STYLE, ...score.engravingStyle };
  const textParts = (word: string, format: TextFormat) => {
    const parts: { value: string; face: TextFace }[] = [];
    let from = 0;
    for (const run of format.runs ?? []) {
      if (run.from < from || run.from >= word.length) continue;
      if (run.from > from) parts.push({ value: word.slice(from, run.from), face: format });
      parts.push({ value: word.slice(run.from, run.to), face: { ...format, ...run.face } });
      from = run.to;
    }
    if (from < word.length) parts.push({ value: word.slice(from), face: format });
    return parts;
  };
  const formatted = (element: ElementSelection, x: number, y: number, word: string, css: string, anchor = 'middle') => {
    const face = appearance(element)?.text;
    if (!face) return text(x, y, word, css, anchor);
    const align = face.align ?? anchor;
    const parts = textParts(word, face).map(({ value, face: run }) => {
      const decoration = [run.underline ? 'underline' : '', run.strike ? 'line-through' : ''].filter(Boolean).join(' ');
      const attrs = [run.font && `font-family="${escape(run.font)}, serif"`, run.size && `font-size="${run.size}"`,
        run.bold !== undefined && `font-weight="${run.bold ? 'bold' : 'normal'}"`,
        run.italic !== undefined && `font-style="${run.italic ? 'italic' : 'normal'}"`, decoration && `text-decoration="${decoration}"`].filter(Boolean).join(' ');
      return attrs ? `<tspan ${attrs}>${escape(value)}</tspan>` : escape(value);
    }).join('');
    return `<text x="${x}" y="${y}" text-anchor="${align}" class="${css}">${parts}</text>`;
  };
  const digitHalf = style.digit.size * .32;
  const lyricMetrics = new Map<string, { half: number; descent: number }>();
  const metrics = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1).getContext('2d') : null;
  const lyricFont = `${style.lyric.size}px ${textFontStack(style.lyric.font, style.lyric.cjkFont ?? 'SimSun')}`;
  if (metrics) { metrics.font = lyricFont; metrics.textAlign = 'center'; }
  const lyricSize = (lyric: string) => {
    const cached = lyricMetrics.get(lyric);
    if (cached) return cached;
    const ink = metrics?.measureText(lyric);
    const size = { half: ink ? Math.max(ink.width / 2, ink.actualBoundingBoxLeft, ink.actualBoundingBoxRight) : widthOf(lyric) * style.lyric.size / 28,
      descent: ink?.actualBoundingBoxDescent ?? style.lyric.size * 2 / 7 };
    lyricMetrics.set(lyric, size);
    return size;
  };
  const measured = (word: string, role: StyleRole, face?: TextFormat) => {
    if (role === 'lyric' && !face) {
      const size = lyricSize(word);
      return { width: size.half * 2, ascent: style.lyric.size * .86, descent: size.descent };
    }
    let width = 0, ascent = 0, descent = 0;
    for (const part of textParts(word, face ?? {})) {
      const size = part.face.size ?? style[role].size;
      if (metrics) {
        const cjk = role === 'lyric' || role === 'expression' ? style[role].cjkFont ?? 'SimSun' : undefined;
        metrics.font = `${(part.face.italic ?? (role === 'dynamic' || !!style[role].italic)) ? 'italic ' : ''}${(part.face.bold ?? (role === 'title' || role === 'dynamic')) ? 'bold ' : ''}${size}px ${textFontStack(part.face.font ?? style[role].font, cjk)}`;
        const ink = metrics.measureText(part.value);
        width += Math.max(ink.width, ink.actualBoundingBoxLeft + ink.actualBoundingBoxRight);
        ascent = Math.max(ascent, ink.actualBoundingBoxAscent);
        descent = Math.max(descent, ink.actualBoundingBoxDescent);
      } else {
        width += widthOf(part.value) * size / 14;
        ascent = Math.max(ascent, size * .86);
        descent = Math.max(descent, size * .25);
      }
    }
    if (metrics) metrics.font = lyricFont;
    return { width, ascent, descent };
  };
  const textAnchors = (token: Token) => [
    ...(!token.continuation ? [{ at: token.at, words: token.note, extension: undefined }] : []),
    ...token.tail.flatMap(at => {
      const extension = at - token.note.at;
      const words = token.note.extensionText?.[extension];
      return words ? [{ at, words, extension }] : [];
    })
  ];
  const lyricEdges = new Map<string, { left: number; right: number; dx: number }>();
  const lyricSides = (word: string, width: number, face?: TextFormat) => {
    const key = JSON.stringify([word, face]);
    const cached = lyricEdges.get(key);
    if (cached) return cached;
    let advance = width, left = 0, right = width;
    if (metrics) {
      metrics.save();
      metrics.textAlign = 'left';
      advance = 0; left = Infinity; right = -Infinity;
      for (const { value, face: run } of textParts(word, face ?? {})) {
        metrics.font = `${run.italic ? 'italic ' : ''}${run.bold ? 'bold ' : ''}${run.size ?? style.lyric.size}px ` +
          (run.font ? `${JSON.stringify(run.font)}, serif` : textFontStack(style.lyric.font, style.lyric.cjkFont ?? 'SimSun'));
        const ink = metrics.measureText(value);
        left = Math.min(left, advance - ink.actualBoundingBoxLeft);
        right = Math.max(right, advance + ink.actualBoundingBoxRight);
        advance += ink.width;
      }
      metrics.restore();
    }
    const anchor = face?.align === 'start' ? 0 : face?.align === 'end' ? advance : advance / 2;
    const core = word.match(/^([\p{P}\s]*)([^\p{P}\s].*?[^\p{P}\s]|[^\p{P}\s])([\p{P}\s]*)$/us);
    const prefix = core?.[1] ? measured(core[1], 'lyric', face).width : 0;
    const suffix = core?.[3] ? measured(core[3], 'lyric', face).width : 0;
    const dx = face?.align === 'start' ? -prefix : face?.align === 'end' ? suffix : (suffix - prefix) / 2;
    const sides = { left: anchor - left - dx, right: right - anchor + dx, dx };
    lyricEdges.set(key, sides);
    return sides;
  };
  const hyphenRoom = measured('-', 'lyric').width + 4;
  const nextSyllable = new Map<string, number>();
  const followsHyphen = new Set<string>();
  for (const [, laneTokens] of byLane) {
    const previous = new Map<number, { key: string; joins?: boolean }>();
    for (const token of laneTokens) if (!token.continuation) for (const verse of noteVerses(token.note)) {
      if (!verse.text) continue;
      const element = markOf(token, 'lyric', verse.number);
      if (appearance(element)?.visible === false) continue;
      const key = appearanceKey(element);
      const prior = previous.get(verse.number);
      if (prior?.joins) { nextSyllable.set(prior.key, token.at); followsHyphen.add(key); }
      previous.set(verse.number, { key, joins: verse.syllabicNext });
    }
  }
  const textPick = (token: Token, field: 'interNoteText' | 'text' | 'rehearsal', extension?: number): ElementSelection =>
    ({ kind: 'mark', id: token.note.id, field, extension });
  const leadingText = (token: Token, value: string | undefined, extension?: number) => {
    if (!value) return;
    const pick = textPick(token, 'interNoteText', extension);
    const look = appearance(pick);
    const face = look?.text;
    return { value, pick, side: look?.noteSide === 'right' ? 1 : -1, align: face?.align ?? 'middle', ...measured(value, 'expression', face) };
  };
  const leadingGap = 3;
  const seenNames = new Set<string>();
  let previousSolo: string | undefined;
  const nameAt = (lane: Lane, at: number): Extract<ElementSelection, { kind: 'lane-name' }> =>
    ({ kind: 'lane-name', lane: lane.id, at, field: seenNames.has(lane.id) ? 'shortName' : 'name' });
  const barsByStart = new Map(measures.map(bar => [bar.start, bar]));
  const labelText = (lane: Lane, at: number) => laneNameValue(lane, nameAt(lane, at).field, barsByStart.get(at));
  const nameWidth = (lane: Lane, at: number) => measured(labelText(lane, at), 'lane', laneNameFormat(lane, nameAt(lane, at).field, barsByStart.get(at))).width;
  const labelWidth = (lane: Lane, at: number) => Math.min(105, nameWidth(lane, at));
  const labelGutter = (at: number, roots: Lane[], bracketWidth: number, positioned = true) => {
    const names = roots.filter(lane => occupies(nameAt(lane, at)));
    const natural = Math.max(25, ...names.map(lane => labelWidth(lane, at) + 23));
    return natural + bracketWidth + (positioned ? Math.max(0, ...names.map(lane => (placement(nameAt(lane, at)).x ?? 0) - 3)) : 0);
  };
  const divisionsAt = new Map<number, Set<string>>();
  const divisionGroups = new Map<number, Set<string>>();
  for (const lane of score.lanes) if (lane.parent) for (const side of ['start', 'end'] as const) {
    const at = lane[side]!;
    if (!occupies({ kind: 'divisi-brace', lane: lane.parent, at, side })) continue;
    const divisions = divisionsAt.get(at) ?? new Set<string>();
    divisions.add(side);
    divisionsAt.set(at, divisions);
    const groups = divisionGroups.get(at) ?? new Set<string>();
    groups.add(lane.parent);
    divisionGroups.set(at, groups);
  }
  const glyphMap = new Map(tokens.map(token => [token, glyphs(token, laneMap.get(token.note.lane)!, score, measures[token.measure].tonic, style.digit.size)]));
  const graceSize = style.digit.size * engraving.gracePercent / 100;
  const graceGap = (side: GraceSide) => side === 'before' ? engraving.graceBefore : engraving.graceAfter;
  const graceLayout = (token: Token, side: GraceSide) => {
    if ((!token.note.pitches.length && !token.note.unpitched) || (side === 'before' ? token.continuation : tickEnd(token) !== tickEnd(token.note))) return;
    const group = token.note.grace?.[side];
    const caret = graceCaret?.id === token.note.id && graceCaret.side === side ? graceCaret : undefined;
    if (!group?.notes.length && !caret) return;
    let width = 0;
    const notes = group?.notes ?? [];
    const measure = measures[token.measure];
    const rhythms = graceRhythm(notes, measure.pickup ? measure.meter : measure.actualMeter ?? measure.meter);
    const events = notes.map((event, index) => {
      const picks = event.pitches.map((_, index) => ({ kind: 'grace', id: token.note.id, side, note: event.id, index }) as const);
      const signs = accidentals.graces.get(event) ?? [];
      const left = graceSize * .32 + (signs.some(sign => sign !== undefined) ? graceSize * .74 : 0);
      const right = graceSize * .32 + (event.dots ?? 0) * 2.5;
      const center = width + left;
      width += left + right + (index < notes.length - 1 ? engraving.graceBetween : 0);
      return { event, picks, signs, center, left, right, ...rhythms[index] };
    });
    const nominal = Math.max(width, caret ? graceSize : 0);
    const alignment = side === 'before' ? -nominal : 0;
    let edge = -Infinity;
    for (const item of events) {
      item.center = Math.max(edge + item.left, item.center + alignment + (group?.layout?.x?.[item.event.id] ?? 0));
      edge = item.center + item.right + .5;
    }
    const extent = events.length ? side === 'before' ? Math.max(0, events[0].left - events[0].center) :
      Math.max(0, edge - .5) : nominal;
    return { events, width: extent, caret, nominal, dy: group?.layout?.y ?? 0 };
  };
  const byMeasure = new Map<number, Token[]>();
  for (const token of tokens) {
    if (!byMeasure.has(token.measure)) byMeasure.set(token.measure, []);
    byMeasure.get(token.measure)!.push(token);
  }
  const endingsWithTimes = (score.endings ?? []).map((ending, index) => ({ ending, index, ...endingRange(ending, measures) }));
  const extensions = lyricExtensions(prepared);
  const roomAt = new Map<number, { width: number; lane?: string }[]>();
  const reserveRoom = (at: number, width: number, lane?: string) => {
    const rooms = roomAt.get(at) ?? [];
    rooms.push({ width, lane });
    roomAt.set(at, rooms);
  };
  for (const { ending, from, to } of endingsWithTimes) if (ending.start === ending.end && to === measures[ending.end].end)
    reserveRoom(from, ending.passes.join(',').length * 7 + 16);
  for (const link of links) if (link.toAt !== undefined && link.toAt === measures[link.from.measure].end) {
    reserveRoom(link.fromAt ?? link.from.at, 16, link.from.note.lane);
  }
  const parentId = (lane: Lane) => lane.parent ?? lane.id;
  const printed = (element: ElementSelection) => appearance(element)?.visible !== false;
  const contentByMeasure = measures.map(bar => new Set((byMeasure.get(bar.index) ?? []).filter(token => {
    if (token.note.pitches.length || token.note.unpitched) return true;
    if (token.continuation) return false;
    const marks = ['dynamic', 'text', 'interNoteText', 'rehearsal', 'breath', 'staccato', 'tenuto', 'fermata', 'accent'] as const;
    return marks.some(field => token.note[field] && printed(markOf(token, field))) ||
      noteVerses(token.note).some(verse => (verse.text || verse.extend) && printed(markOf(token, 'lyric', verse.number)));
  }).map(token => token.note.lane)));
  const registerContent = (lane: string, from: number, to: number) => {
    for (const bar of measures) if (from < bar.end && to >= bar.start) contentByMeasure[bar.index].add(lane);
  };
  for (const link of links) if (printed(linkOf(link)))
    registerContent(link.from.note.lane, link.fromAt ?? link.from.at, link.toAt ?? link.to.at);
  for (const [lane, fragments] of extensions) for (const fragment of fragments)
    if (printed({ kind: 'mark', field: 'lyric-extension', id: fragment.id, verse: fragment.verse }))
      registerContent(lane, fragment.at, fragment.end);
  const primary = score.lanes.filter(lane => !lane.parent);
  function projection(first: number, last: number) {
    const start = measures[first].start, end = measures[last].end;
    const voice = systemVisibility(score, first, last, start, end, lane => {
      for (let i = first; i <= last; i++) if (contentByMeasure[i].has(lane.id)) return true;
      return false;
    });
    const visible = new Set(voice.visible.map(lane => lane.id));
    const ids = new Set(voice.visible.map(parentId));
    const roots = primary.filter(lane => ids.has(lane.id));
    const names = roots.length === 1 && previousSolo === roots[0].id ? [] : roots;
    const brackets = systemBrackets(score, first, last);
    const projected = (roots.length > 1 ? brackets.items : []).flatMap(item => {
      const a = primary.findIndex(lane => lane.id === item.top), b = primary.findIndex(lane => lane.id === item.bottom);
      if (a < 0 || b < 0) return [];
      const members = primary.slice(Math.min(a, b), Math.max(a, b) + 1).filter(lane => ids.has(lane.id));
      if (!members.length || item.id === 'choir' && members.length === 1 && item.top !== item.bottom) return [];
      return [{ item, top: roots.indexOf(members[0]), bottom: roots.indexOf(members.at(-1)!) }];
    });
    const profiles = projected.map(({ item, top, bottom }) => ({ type: item.type, y1: top * 28, y2: bottom * 28 + 23,
      layout: item.appearance?.layout !== false, offset: clamp(item.appearance?.placement?.x ?? 0, -3, 3) }));
    const slots = bracketPositions(profiles);
    const bracketWidth = Math.max(0, ...slots.map((x, i) => profiles[i].layout ? -x - (profiles[i].type === 'brace' ? 5 : 10) : 0));
    return { voice, visible, roots, names, projected, conflicts: brackets.conflicts, bracketWidth };
  }
  type SystemProjection = ReturnType<typeof projection>;
  function measureDiagram(measure: typeof measures[number], spacing: Spacing, shown: SystemProjection) {
    const local = (byMeasure.get(measure.index) ?? []).filter(token => shown.visible.has(token.note.lane));
    const braceGroups = (at: number) => new Set(shown.voice.visible.filter(lane => lane.parent &&
      (lane.start === at && occupies({ kind: 'divisi-brace', lane: lane.parent, at, side: 'start' }) ||
        lane.end === at && occupies({ kind: 'divisi-brace', lane: lane.parent, at, side: 'end' }))).map(lane => lane.parent));
    const visibleBraces = (at: number) => ({
      start: shown.voice.visible.some(lane => lane.parent && lane.start === at && occupies({ kind: 'divisi-brace', lane: lane.parent, at, side: 'start' })),
      end: shown.voice.visible.some(lane => lane.parent && lane.end === at && occupies({ kind: 'divisi-brace', lane: lane.parent, at, side: 'end' }))
    });
    const extents = new Map<number, { left: number; right: number }>();
    const rhythm = new Map<string, { at: number; lane?: string; mode: 'full' | 'half' | 'none'; left: number; right: number; fullLeft: number; fullRight: number; token: Token }>();
    const laneOrder = new Map<string, Map<string, { left: number; right: number }>>();
    const lyricLines = new Map<string, { at: number; anchor: string; left: number; right: number; joins: boolean; follows: boolean }[]>();
    const precedingBrace = new Set<string>();
    for (const tick of divisionGroups.keys()) if (tick > measure.start && tick <= measure.end) {
      const at = local.reduce((last, token) => {
        const final = token.tail.at(-1) ?? token.at;
        return final < tick ? Math.max(last, final) : token.at < tick ? Math.max(last, token.at) : last;
      }, -Infinity);
      if (Number.isFinite(at)) for (const parent of braceGroups(tick)) precedingBrace.add(parent + ':' + at);
    }
    const include = (token: Token, at: number, left: number, right: number) => {
      const lane = token.note.lane;
      const mode = alignmentOf(score, measure, token, at);
      const key = mode === 'none' ? JSON.stringify([lane, at]) : String(at);
      const item = rhythm.get(key) ?? { at, lane: mode === 'none' ? lane : undefined, mode, left: 0, right: 0, fullLeft: 0, fullRight: 0, token };
      item.left = Math.max(item.left, left); item.right = Math.max(item.right, right);
      if (mode === 'full') {
        item.mode = 'full'; item.fullLeft = Math.max(item.fullLeft, left); item.fullRight = Math.max(item.fullRight, right);
      }
      rhythm.set(key, item);
      const order = laneOrder.get(lane) ?? new Map();
      const extent = order.get(key);
      order.set(key, { left: Math.max(extent?.left ?? 0, left), right: Math.max(extent?.right ?? 0, right) });
      laneOrder.set(lane, order);
      const previous = extents.get(at);
      extents.set(at, { left: Math.max(previous?.left ?? 0, left), right: Math.max(previous?.right ?? 0, right) });
      return key;
    };
    const noteInk = new Map<Token, { left: number; right: number; graceLead: number; graceTrail: number }>();
    for (const token of local) {
      for (const at of [token.at, ...token.tail]) include(token, at, spacing.note, spacing.note);
      if (!token.continuation) for (const verse of noteVerses(token.note)) {
        const element = markOf(token, 'lyric', verse.number);
        if (!verse.text || !occupies(element)) continue;
        const x = placement(element).x ?? 0;
        const face = appearance(element)?.text;
        const sides = lyricSides(verse.text, measured(verse.text, 'lyric', face).width, face);
        const id = appearanceKey(element);
        const key = `${token.note.lane}:${verse.number}`;
        const words = lyricLines.get(key) ?? [];
        const anchor = include(token, token.at, 0, 0);
        words.push({ at: token.at, anchor, left: sides.left - x, right: sides.right + x,
          joins: nextSyllable.has(id), follows: followsHyphen.has(id) });
        lyricLines.set(key, words);
        const lane = laneMap.get(token.note.lane)!;
        const parent = lane.parent ?? lane.id;
        const before = divisionGroups.has(token.at) && braceGroups(token.at).has(parent);
        const after = precedingBrace.has(parent + ':' + token.at);
        if (before || after) include(token, token.at, before ? sides.left - x : 0, after ? sides.right + x : 0);
      }
      const accidentalLeft = Math.max(0, ...glyphMap.get(token)!.map(({ pitch, index }) => {
        const element = markOf(token, 'accidental', undefined, index);
        const ink = accidentalInk(token, pitch, digitHalf);
        return occupies(element) && signAt(token, index) ? ink.gap + ink.width - Math.min(0, placement(element).x ?? 0) : 0;
      }));
      const left = Math.max(spacing.note, accidentalLeft, digitHalf);
      const right = Math.max(spacing.note, digitHalf, token.dots ? 12 + (token.dots - 1) * 4 : 0);
      const graceLead = Math.max(digitHalf, accidentalLeft) + graceGap('before');
      const graceTrail = Math.max(digitHalf, token.dots ? 10.5 + (token.dots - 1) * 4 : 0) + graceGap('after');
      include(token, token.at, left, right);
      const beforeGrace = graceLayout(token, 'before');
      const afterGrace = graceLayout(token, 'after');
      const afterAt = token.tail.at(-1) ?? token.at;
      const leadingInk = beforeGrace ? Math.max(left, graceLead + beforeGrace.width) : left;
      const trailingInk = afterGrace && afterAt === token.at ?
        Math.max(right, graceTrail + afterGrace.width) : right;
      if (beforeGrace || afterGrace) include(token, token.at, leadingInk, trailingInk);
      if (afterGrace && afterAt !== token.at) include(token, afterAt, spacing.note, 5 + afterGrace.width + graceGap('after'));
      noteInk.set(token, { left: leadingInk, right: trailingInk, graceLead, graceTrail });
      for (const { at, words, extension } of textAnchors(token)) {
        const leading = leadingText(token, words.interNoteText, extension);
        if (!leading || !occupies(leading.pick)) continue;
        const extra = leading.width + 2 * leadingGap + Math.max(0, -leading.side * (placement(leading.pick).x ?? 0));
        const dash = Math.max(5, spacing.note);
        include(token, at, (extension === undefined ? leadingInk : dash) + (leading.side < 0 ? extra : 0),
          (extension === undefined ? trailingInk : Math.max(dash, 5 + (afterGrace && at === afterAt ? afterGrace.width + graceGap('after') : 0))) + (leading.side > 0 ? extra : 0));
      }
    }
    const ink = new Map([...extents].map(([at, extent]) => [at, extent.left]));
    for (const [at, extent] of extents) {
      const braces = divisionsAt.has(at) ? visibleBraces(at) : undefined;
      const count = Number(!!braces?.start) + Number(at !== measure.start && !!braces?.end);
      if (count) extent.left += at === measure.start ? 10 : 14 * count + 4;
    }
    const anchors = [...rhythm].sort(([, first], [, second]) => first.at - second.at);
    const columns = anchors.map(([, item]) => [item.at, { left: item.lane ? item.left : extents.get(item.at)!.left, right: item.right }] as const);
    const relaxed = anchors.some(([, item]) => item.mode !== 'full');
    const previous = measures[measure.index - 1];
    const showKey = !measure.keyHidden && (measure.index ? !sameKey(previous.key, measure.key) || !!score.measures[measure.index].key : !titleSignature(score, 'key') && !!score.measures[0].key);
    const showMeter = !measure.meterHidden && !!score.measures[measure.index].meter && (measure.index > 0 || !titleSignature(score, 'meter'));
    const keyLabel = showKey ? keyName(measure.key) : '';
    const meterLabel = showMeter ? meterNumerator(measure.meter) : '';
    const keyWidth = keyLabel ? keyInk(keyLabel).width + 7 : 0;
    const meterWidth = showMeter ? meterWidthOf(meterLabel, measure.meter.denominator) : 0;
    const left = boundaryAt(score, measure.index);
    const right = boundaryAt(score, measure.index + 1);
    const inset = spacing.bar + (measure.keyAppearance?.layout === false ? 0 : keyWidth) + (measure.meterAppearance?.layout === false ? 0 : meterWidth) +
      (startsRepeat(left.style) && left.appearance?.layout !== false ? 10 : 0);
    const rightSpace = right.appearance?.layout === false ? 0 : endsRepeat(right.style) ? 10 : right.style === 'double' || right.style === 'final' ? 3 : 0;
    const gaps = [inset, ...columns.map(([, extent]) => extent.right)];
    columns.forEach(([, extent], i) => { gaps[i] += extent.left; });
    const closingBraceGap = divisionsAt.has(measure.end) && visibleBraces(measure.end).end ? 10 : 0;
    gaps[gaps.length - 1] += spacing.bar + rightSpace + closingBraceGap;
    const last = gaps.length;
    const indexes = new Map(anchors.map(([key], i) => [key, i + 1]));
    const additional: ColumnGap[] = [];
    if (relaxed) {
      const endInset = spacing.bar + rightSpace + closingBraceGap;
      gaps.fill(-Infinity);
      let shared = 0;
      let strict = 0;
      let priorRight = 0;
      for (const [[, item], i] of anchors.map((item, index) => [item, index + 1] as const)) {
        const brace = (divisionsAt.has(item.at) ? visibleBraces(item.at) : undefined);
        const count = Number(!!brace?.start) + Number(item.at !== measure.start && !!brace?.end);
        const extra = !count ? 0 : item.at === measure.start ? 10 : 14 * count + 4;
        additional.push({ from: 0, to: i, width: inset + item.left + extra },
          { from: i, to: last, width: item.right + endInset });
        if (item.mode !== 'none') {
          if (shared) additional.push({ from: shared, to: i, width: extra });
          shared = i;
        }
        if (item.mode === 'full') {
          if (strict) additional.push({ from: strict, to: i, width: priorRight + item.fullLeft + extra });
          strict = i; priorRight = item.fullRight;
        }
      }
      for (const order of laneOrder.values()) {
        const sorted = [...order].sort(([a], [b]) => indexes.get(a)! - indexes.get(b)!);
        for (let i = 1; i < sorted.length; i++) {
          const [before, previous] = sorted[i - 1], [after, current] = sorted[i];
          additional.push({ from: indexes.get(before)!, to: indexes.get(after)!, width: previous.right + current.left });
        }
      }
      if (!anchors.length) additional.push({ from: 0, to: last, width: inset + endInset });
    }
    if (score.measureNumbers !== 'hide' && measure.numberDisplay !== 'hide') {
      const width = measured(String(measure.number), 'measureNumber').width;
      additional.push({ from: 0, to: last, width: width + 3 });
    }
    for (const words of lyricLines.values()) {
      words.sort((a, b) => a.at - b.at);
      for (const [i, word] of words.entries()) {
        const column = indexes.get(word.anchor)!;
        if (word.left > 0 || word.follows) additional.push({ from: 0, to: column, width: word.left + (!i && word.follows ? hyphenRoom / 2 : 2) });
        if (word.right > 0 || word.joins) additional.push({ from: column, to: last, width: word.right + (i === words.length - 1 && word.joins ? hyphenRoom : 2) });
        if (i) {
          const previous = words[i - 1];
          additional.push({ from: indexes.get(previous.anchor)!, to: column, width: previous.right + word.left +
            (previous.joins && word.follows ? hyphenRoom : 4) });
        }
      }
    }
    for (const [key, item] of anchors) for (const room of roomAt.get(item.at) ?? [])
      if (!room.lane || shown.visible.has(room.lane) && (!item.lane || item.lane === room.lane))
        additional.push({ from: indexes.get(key)!, to: last, width: room.width });
    const { width, fromStart, toEnd } = columnGeometry(gaps, additional);
    const centers = fromStart.map((first, i) => (first + width - toEnd[i]) / 2);
    const braces = [...new Map(shown.voice.visible.flatMap(lane => lane.parent ?
      (['start', 'end'] as const).flatMap(side => {
        const at = lane[side]!;
        if (at < measure.start || at > measure.end || side === 'start' && at === measure.end ||
          side === 'end' && at === measure.start) return [];
        const element = { kind: 'divisi-brace', lane: lane.parent!, at, side } as const;
        return [[appearanceKey(element), element] as const];
      }) : [])).values()];
    return { ...measure, width, columns, anchors, relaxed, laneOrder, ink, noteInk, keyLabel, keyWidth, meterLabel, meterWidth, gaps, additional, centers, fromStart, toEnd, braces, inset, rightSpace };
  }
  type Diagram = ReturnType<typeof measureDiagram>;
  const diagrams = new Map<string, Diagram>();
  function diagramAt(index: number, spacing: Spacing, shown: SystemProjection) {
    const key = JSON.stringify([index, spacing.note, spacing.bar, [...shown.visible]]);
    let diagram = diagrams.get(key);
    if (!diagram) {
      diagram = measureDiagram(measures[index], spacing, shown);
      diagrams.set(key, diagram);
    }
    return diagram;
  }
  const lineBreakAt = linePlanner(score, measures);
  let restartFrom = -1;
  function systemAt(from: number, spacing: Spacing, marginLeft: number, right: number) {
    const candidate = (last: number) => {
      const shown = projection(from, last);
      const left = marginLeft + Math.min(labelGutter(measures[from].start, shown.names, shown.bracketWidth), Math.max(25, right - marginLeft - 60));
      const group = measures.slice(from, last + 1).map(bar => diagramAt(bar.index, spacing, shown));
      return { group, shown, left, width: group.reduce((total, bar) => total + bar.width, left) };
    };
    let accepted = candidate(from);
    let overflow = false;
    for (let index = from + 1; index < measures.length; index++) {
      const action = lineBreakAt(index, restartFrom);
      if (action === 'explicit' || action === 'rule') break;
      const next = candidate(index);
      if (next.width > right && action !== 'keep') { overflow = true; break; }
      accepted = next;
    }
    return { ...accepted, overflow, overfull: accepted.width > right };
  }
  const wrap = (element: ElementSelection, shape: string, picked: boolean) =>
    `<g class="score-element${picked ? ' picked' : ''}${appearance(element)?.visible === false ? ' score-invisible' : ''}" data-element="${escape(JSON.stringify(element))}">${shape}</g>`;
  const signature = (index: number, field: 'key' | 'meter', shape: string, title = false) => {
    const pick = { kind: 'signature', index, field, header: title ? true : undefined } as const;
    return `<g class="signature${appearance(pick)?.visible === false ? ' score-invisible' : ''}" data-signature="${index}" data-signature-kind="${field}"${title ? ' data-title-signature=""' : ''}>${shape}</g>`;
  };
  function keyInk(value: string) {
    const accidental = /[♭♯]$/.test(value) ? value.at(-1)! : '';
    const base = accidental ? value.slice(0, -1) : value;
    if (!metrics) return { base, accidental, shift: base.length * 10, width: base.length * 10 + (accidental ? 10 : 0) };
    metrics.save();
    metrics.font = '700 17px Arial, sans-serif';
    metrics.textAlign = 'left';
    const letters = metrics.measureText(base);
    const symbol = accidental ? metrics.measureText(accidental) : undefined;
    metrics.restore();
    if (!symbol) return { base, accidental, shift: 0, width: letters.width };
    const shift = letters.actualBoundingBoxRight + .9 + symbol.actualBoundingBoxLeft;
    return { base, accidental, shift, width: shift + symbol.actualBoundingBoxRight };
  }
  function keyShape(x: number, y: number, value: string) {
    const { base, accidental, shift } = keyInk(value);
    return text(x, y, base, 'signature-key', 'start') +
      (accidental ? text(x + shift, y, accidental, 'signature-key', 'start') : '');
  }
  function pageHeading(top: number, left: number, right: number) {
    const boxes: InkBox[] = [];
    const placeHeading = (element: ElementSelection, box: InkBox, shape: string) => {
      const p = placement(element);
      const dx = clamp(p.x ?? 0, left - box.left, right - box.right);
      const related = boxes.filter(other => intersectsX(other, box.left + dx, box.right + dx));
      const limit = top - box.top;
      const gaps = related.map(other => [other.top - box.bottom - 2, other.bottom - box.top + 2] as [number, number]);
      const wanted = Math.max(limit, p.y ?? 0);
      const dy = legalY(wanted, [...gaps, [-Infinity, limit]]);
      if (occupies(element)) boxes.push(offsetBox(box, dx, dy));
      return shift(shape, dx, dy);
    };
    const add = (field: Extract<ElementSelection, { kind: 'header' }>['field'], value: string, x: number, y: number, css: string, height: number) => {
      const element = { kind: 'header', field } as const;
      const face = appearance(element)?.text;
      const role = field === 'title' ? 'title' : 'credit';
      if (face) height = Math.max(height, measured(value, role, face).ascent + 4);
      const width = face ? measured(value, role, face).width : widthOf(value) * height / 14;
      const align = face?.align ?? (css === 'meta' ? 'start' : field === 'title' || field === 'subtitle' ? 'middle' : 'end');
      if (face?.align) x = align === 'start' ? left : align === 'end' ? right : (left + right) / 2;
      const start = align === 'start' ? x : align === 'end' ? x - width : x - width / 2;
      const box = { left: start, right: start + width, top: y - height + 4, bottom: y + 4 };
      const shape = formatted(element, x, y, value, css, align);
      return wrap(element, placeHeading(element, box, shape), !input && selection?.kind === 'header' && selection.field === field);
    };
    const title = score.title || '未命名乐谱';
    const titleElement = { kind: 'header', field: 'title' } as const;
    const titleAscent = measured(title, 'title', appearance(titleElement)?.text).ascent;
    let y = top + (occupies(titleElement) ? Math.max(25, style.title.size - 6, titleAscent + 1) : 0);
    const center = (left + right) / 2;
    let drawing = add('title', title, center, y, 'score-title', style.title.size);
    for (const field of ['subtitle', 'lyricist', 'composer', 'arranger', 'credit'] as const) if (score[field]) {
      const baseline = y + Math.max(20, style.credit.size + 6);
      drawing += add(field, score[field], field === 'subtitle' ? center : right, baseline, 'credit', style.credit.size);
      if (occupies({ kind: 'header', field })) y = baseline;
    }
    y += 32;
    const initial = measures[0];
    const initialKey = titleSignature(score, 'key');
    const initialMeter = titleSignature(score, 'meter');
    const keyLabel = keyName(initial.key);
    const meterLabel = meterNumerator(initial.meter);
    const keyWidth = initialKey ? keyInk(keyLabel).width : 0;
    const meterWidth = initialMeter ? meterWidthOf(meterLabel, initial.meter.denominator) : 0;
    const mark = score.tempoMarks?.find(mark => mark.at === 0 && !isSwing(mark));
    const swing = score.tempoMarks?.find(mark => mark.at === 0 && isSwing(mark));
    const tempoCaption = mark ? tempoLabel(mark) : `♩=${score.tempo}`;
    const tempoWidth = mark ? measured(tempoCaption, 'expression', mark.appearance?.text).width : widthOf(tempoCaption);
    const gap = 19;
    const meterX = left + (initialKey ? keyWidth + gap : 0);
    const wanted = meterX + (initialMeter ? meterWidth + gap : 0);
    const wrapTempo = wanted + tempoWidth > right;
    const tempoX = wrapTempo ? left : wanted;
    const tempoY = y + (wrapTempo ? 34 : 0);
    if (mark) {
      const pick = { kind: 'tempo-mark', id: mark.id } as const;
      const value = tempoLabel(mark), size = measured(value, 'expression', appearance(pick)?.text);
      drawing += wrap(pick, placeHeading(pick, { left: tempoX, right: tempoX + size.width, top: tempoY + 5 - size.ascent, bottom: tempoY + 5 + size.descent },
        formatted(pick, tempoX, tempoY + 5, value, 'tempo-text', 'start')), !input && !!selection && appearanceKey(selection) === appearanceKey(pick));
    } else drawing += add('tempo', tempoCaption, tempoX, tempoY + 5, 'meta', 15);
    if (swing) {
      const pick = { kind: 'tempo-mark', id: swing.id } as const;
      const value = tempoLabel(swing), size = measured(value, 'expression', appearance(pick)?.text);
      const lastX = tempoX + tempoWidth + gap;
      const wraps = lastX + size.width > right;
      const x = wraps ? left : lastX, baseline = tempoY + (wraps ? 39 : 5);
      drawing += wrap(pick, placeHeading(pick, { left: x, right: x + size.width, top: baseline - size.ascent, bottom: baseline + size.descent },
        formatted(pick, x, baseline, value, 'tempo-text', 'start')), !input && !!selection && appearanceKey(selection) === appearanceKey(pick));
    }
    const addSignature = (field: 'key' | 'meter', x: number, width: number, ascent: number, descent: number, shape: string) =>
      signature(0, field, placeHeading({ kind: 'signature', index: 0, field, header: true }, { left: x, right: x + width, top: y - ascent, bottom: y + descent }, shape), true);
    if (initialKey) drawing += addSignature('key', left, Math.max(1, keyWidth), 11, 6, keyShape(left, y + 5, keyLabel));
    if (initialMeter) drawing += addSignature('meter', meterX, meterWidth - 1, 16, 17, meterShape(meterX, y, meterWidth, meterLabel, initial.meter.denominator));
    return { drawing, bottom: Math.max(y, ...boxes.map(box => box.bottom - 4)) };
  }
  const warnings = new Set<string>();
  type VoiceBand = { start: number; end: number; lanes: Lane[] };
  type DivisiOffsets = Map<VoiceBand, Map<string, number>>;
  function drawSystem(group: Diagram[], spacing: Spacing, marginLeft: number, LEFT: number, rightEdge: number, shown: SystemProjection,
    local?: { bands: Map<string, VoiceBand[]>; offsets: DivisiOffsets }) {

    const warnings = new Set<string>();
    const start = group[0].start;
    const end = group.at(-1)!.end;
    const active = shown.voice.visible;
    const hasDivisi = active.some(lane => lane.parent);
    const mainLanes = shown.roots;
    const groupLanes = new Map(mainLanes.map(parent => [parent.id, active.filter(lane => lane.parent === parent.id)]));
    const bands = local?.bands ?? new Map(mainLanes.map(parent => {
      const children = groupLanes.get(parent.id)!;
      const edges = [...new Set([start, end, ...children.flatMap(child => [Math.max(start, child.start!), Math.min(end, child.end!)])])]
        .sort((a, b) => a - b);
      return [parent.id, edges.slice(1).map((to, i): VoiceBand => {
        const from = edges[i];
        return { start: from, end: to, lanes: [...(shown.visible.has(parent.id) ? [parent] : []),
          ...children.filter(child => child.start! <= from && child.end! >= to)] };
      })] as const;
    }));
    const bandsFor = (lane: Lane) => bands.get(lane.parent ?? lane.id)!;
    const bandAt = (lane: Lane, tick: number, before = false) => {
      const slices = bandsFor(lane);
      if (tick <= start) return slices[0];
      if (tick >= end) return slices.at(-1)!;
      return slices.find(slice => before ? slice.start < tick && slice.end >= tick : slice.start <= tick && slice.end > tick)!;
    };
    const offset = (lane: Lane, tick: number, boundary = false) => {
      if (!local) return 0;
      const after = bandAt(lane, tick);
      if (!boundary) return local.offsets.get(after)?.get(lane.id) ?? 0;
      const before = bandAt(lane, tick, true);
      const continuing = after.lanes.filter(row => row.parent && row.start! < tick && tick < row.end!);
      if (!continuing.length) return 0;
      const offsets = local.offsets.get(tick === end ? before : after);
      if (!offsets) return 0;
      const center = ((offsets.get(lane.parent ?? lane.id) ?? 0) + (offsets.get(continuing.at(-1)!.id) ?? 0)) / 2;
      return (offsets.get(lane.id) ?? 0) - center;
    };
    const bracketed = mainLanes.length > 1;
    const localLinks = links.filter(link => (link.fromAt ?? link.from.at) < end && (link.toAt ?? link.to.at) >= start);
    const maximum = group.reduce((sum, measure) => sum + measure.width, 0);
    const width = rightEdge - LEFT;
    if (maximum > width) warnings.add('个别小节过密，当前已压缩横向间距。');
    const ratio = width / maximum;
    const positions = new Map<number, number>();
    const lanePositions = new Map<string, Map<number, number>>();
    const columnSlack = new Map<string, { left: number; right: number }>();
    const columnLimits = new Map<string, [number, number]>();
    const barLimits = new Map<number, [number, number]>();
    const divisiPositions = new Map<string, { x: number; min: number; max: number }>();
    const barPoints = [LEFT];
    for (const measure of group) barPoints.push(barPoints.at(-1)! + measure.width * ratio);
    barPoints[barPoints.length - 1] = rightEdge;
    const factor = Math.min(1, ratio);
    const braceGap = 8;
    const braceInk = 6;
    const barMinimums = group.map((measure, index) => {
      const edgeBraces = measure.braces.filter(brace => occupies(brace) &&
        (brace.side === 'start' ? brace.at === measure.start : brace.at === measure.end));
      if (!edgeBraces.length || !measure.anchors.length) return measure.width * factor;
      const last = measure.anchors.length + 1;
      const constraints = edgeBraces.flatMap(brace => {
        const head = brace.side === 'start';
        const slot = head ? 0 : last - 2;
        const at = measure.anchors[slot][1].at;
        const visibleInk = head ? measure.inset - spacing.bar : measure.rightSpace;
        const offset = Math.max(4, braceGap + (head ? 1 : -1) * (placement(brace).x ?? 0)) + visibleInk;
        return measure.anchors.flatMap(([, anchor], i) => anchor.at !== at ? [] : [head ?
          { from: 0, to: i + 1, width: offset + anchor.left * factor + braceInk } :
          { from: i + 1, to: last, width: offset + anchor.right * factor + braceInk }]);
      });
      const needed = columnGeometry(measure.gaps.map(gap => gap * factor), [
        ...measure.additional.map(gap => ({ ...gap, width: gap.width * factor })), ...constraints
      ]).width;
      return Math.min(needed, barPoints[index + 1] - barPoints[index]);
    });
    const barShifts = [0, ...group.map(measure => placement({ kind: 'barline', index: measure.index + 1 }).x)];
    const bars = moveColumns(barPoints, barMinimums, barShifts);
    const boundaries = bars.slice(1);
    let minimumBarDistance = 0;
    for (const [index, measure] of group.entries()) {
      minimumBarDistance += barMinimums[index];
      const point = barPoints[index + 1];
      const trailingMinimum = barMinimums.slice(index + 1).reduce((sum, item) => sum + item, 0);
      barLimits.set(measure.index + 1, [LEFT + minimumBarDistance - point, rightEdge - trailingMinimum - point]);
      const scale = (bars[index + 1] - bars[index]) / measure.width;
      const points = measure.centers.map(center => bars[index] + center * scale);
      const leftBar = bars[index], rightBar = bars[index + 1];
      const localConstraints = measure.additional.map(gap => ({ ...gap, width: gap.width * factor }));
      const lastColumn = points.length - 1;
      const ideals = [...points];
      for (const brace of measure.braces) {
        const previous = measure.anchors.map(([, anchor], i) => ({ anchor, column: i + 1 }))
          .filter(item => item.anchor.at < brace.at);
        const following = measure.anchors.map(([, anchor], i) => ({ anchor, column: i + 1 }))
          .filter(item => item.anchor.at >= brace.at);
        const before = previous.at(-1)?.anchor.at;
        const after = following[0]?.anchor.at;
        const left = previous.filter(item => item.anchor.at === before);
        const right = following.filter(item => item.anchor.at === after);
        const first = Math.abs(brace.at - measure.start) < 1e-7;
        const last = Math.abs(brace.at - measure.end) < 1e-7;
        let min = Math.max(leftBar + (first ? braceGap / 2 : braceGap), ...left.map(({ column, anchor }) =>
          leftBar + (measure.fromStart[column] + anchor.right) * factor + braceInk));
        let max = Math.min(rightBar - (last ? braceGap / 2 : braceGap), ...right.map(({ column, anchor }) =>
          rightBar - (measure.toEnd[column] + anchor.left) * factor - braceInk));
        // Boundary distance is measured from the ink of the adjacent bar or signature.
        const leftInk = leftBar + measure.inset - spacing.bar;
        const rightInk = rightBar - measure.rightSpace;
        if (first) min = Math.max(min, leftInk + braceGap / 2);
        if (last) max = Math.min(max, rightInk - braceGap / 2);
        if (min > max) min = max = (min + max) / 2;
        const beforeInk = Math.max(leftInk, ...left.map(({ column, anchor }) => points[column] + anchor.right * factor));
        const afterInk = Math.min(rightInk, ...right.map(({ column, anchor }) => points[column] - anchor.left * factor));
        const sharesBoundary = measure.braces.some(other => other.at === brace.at && other.side !== brace.side && other.lane === brace.lane);
        const natural = clamp(first ? leftInk + braceGap : last ? rightInk - braceGap :
          (beforeInk + afterInk) / 2 + (sharesBoundary ? brace.side === 'start' ? 5 : -5 : 0), min, max);
        const raw = placement(brace).x ?? 0;
        const x = clamp(natural + raw, min, max);
        divisiPositions.set(appearanceKey(brace), { x, min: min - natural, max: max - natural });
        if (!occupies(brace)) continue;
        for (const { column, anchor } of left)
          localConstraints.push({ from: column, to: lastColumn, width: rightBar - x + anchor.right * factor + braceInk });
        for (const { column, anchor } of right)
          localConstraints.push({ from: 0, to: column, width: x - leftBar + anchor.left * factor + braceInk });
        const delta = x - natural;
        const members = brace.side === 'start' ? following : previous;
        for (const { column } of members) {
          const distance = brace.side === 'start' ? (rightBar - points[column]) / Math.max(1, rightBar - natural) :
            (points[column] - leftBar) / Math.max(1, natural - leftBar);
          ideals[column] += delta * clamp(distance, 0, 1);
        }
        // Keep the edge notes close to the brace when fitting a system to the page.
        if (brace.side === 'start') for (const { column, anchor } of right)
          ideals[column] = Math.min(ideals[column], x + anchor.left * factor + braceInk + 1.5);
        else for (const { column, anchor } of left)
          ideals[column] = Math.max(ideals[column], x - anchor.right * factor - braceInk - 1.5);
      }
      const minimums = measure.gaps.map(gap => gap * factor);
      const geometry = measure.relaxed || measure.braces.length ? columnGeometry(minimums, localConstraints) : undefined;
      if (geometry && measure.braces.length) for (let column = 1; column < lastColumn; column++) {
        const earliest = Math.max(...geometry.incoming[column].map(edge => ideals[edge.from] + edge.width));
        ideals[column] = clamp(ideals[column], earliest, rightBar - geometry.toEnd[column]);
      }
      const moved = [...moveColumns(ideals, minimums,
        [0, ...measure.anchors.map(([, anchor]) => anchor.lane ? 0 : score.columns?.[anchor.at]), 0], localConstraints)];
      const freeRange = (i: number) => [
        Math.max(...geometry!.incoming[i].map(edge => moved[edge.from] + edge.width)),
        Math.min(...geometry!.outgoing[i].map(edge => moved[edge.to] - edge.width))
      ] as const;
      measure.anchors.forEach(([, anchor], index) => {
        if (anchor.lane) {
          const column = index + 1;
          moved[column] = clamp(ideals[column] + (placement(rhythmPick(anchor.token, anchor.at)).x ?? 0), ...freeRange(column));
        }
      });
      measure.anchors.forEach(([key, { at, lane }], i) => {
        if (lane) {
          const own = lanePositions.get(lane) ?? new Map();
          own.set(at, moved[i + 1]);
          lanePositions.set(lane, own);
        } else positions.set(at, moved[i + 1]);
        const previous = geometry ? Math.max(...geometry.incoming[i + 1].map(edge => moved[edge.from] + edge.width)) : moved[i] + measure.gaps[i] * factor;
        const next = geometry ? Math.min(...geometry.outgoing[i + 1].map(edge => moved[edge.to] - edge.width)) : moved[i + 2] - measure.gaps[i + 1] * factor;
        columnSlack.set(key, {
          left: Math.max(0, (moved[i + 1] - previous) / factor),
          right: Math.max(0, (next - moved[i + 1]) / factor)
        });
        columnLimits.set(key, lane ? [previous - ideals[i + 1], next - ideals[i + 1]] :
          [bars[index] + (geometry?.fromStart[i + 1] ?? measure.fromStart[i + 1] * factor) - ideals[i + 1],
            bars[index + 1] - (geometry?.toEnd[i + 1] ?? measure.toEnd[i + 1] * factor) - ideals[i + 1]]);
      });
    }
    const barEdge = (measure: number, fallback = rightEdge) => boundaries[measure - group[0].index] ?? fallback;
    const makeHandle = (name: CurveHandle, x: number, y: number, maxY?: number) => {
      const half = name === 'height' ? 2.5 : 3.5;
      return `<rect class="span-handle${selectedEnd === name ? ' endpoint-picked' : ''}" data-endpoint="${name}" x="${x - half}" y="${y - half}" width="${half * 2}" height="${half * 2}" rx="1"${maxY === undefined ? '' : ` data-max-offset-y="${maxY}"`}/>`;
    };
    const lineEnds = (left: number, right: number, head: boolean, tail: boolean, p: Placement, minimum: number) => {
      const x1 = head ? clamp(left + (p.from ?? 0), LEFT, rightEdge - 1) : left;
      const x2 = tail ? clamp(right + (p.to ?? 0), LEFT + 1, rightEdge) : right;
      const min = Math.min(right - left, minimum);
      if (x2 - x1 >= min) return [x1, x2] as const;
      return p.edge === 'from' ? [x2 - min, x2] as const : [x1, x1 + min] as const;
    };
    const relative = (at: number, lane?: string) => {
      if (at >= end) return rightEdge;
      if (at < start) return LEFT;
      const exact = (lane && lanePositions.get(lane)?.get(at)) || positions.get(at);
      if (exact !== undefined) return exact;
      const before = [...positions].filter(([tick]) => tick < at).at(-1) ?? [start, LEFT];
      const after = [...positions].find(([tick]) => tick > at) ?? [end, rightEdge];
      return before[1] + (after[1] - before[1]) * (at - before[0]) / (after[0] - before[0]);
    };
    const measureEdges = new Map(group.map((measure, index) => [measure.start, bars[index]]));
    const measureEndEdges = new Map(group.map((measure, index) => [measure.end, boundaries[index]]));
    const bandEdge = (at: number) => at === end ? rightEdge : measureEdges.get(at) ?? relative(at) - digitHalf - 2;
    const rows = active.map(lane => {
      const items = byLane.get(lane.id)!.filter(item => item.at >= start && item.at < end);
      const spans = localLinks.filter(link => link.from.note.lane === lane.id);
      return { lane, items, spans };
    });
    const numbered = group.map((measure, index) => score.measureNumbers !== 'hide' &&
      (measure.numberDisplay === 'show' || !index && measure.numberDisplay !== 'hide'));
    let systemDrawing = '';
    const systemInk: InkBox[] = [];
    const endings = endingsWithTimes.filter(({ from, to }) => from < end && to > start);
    let endingBottom = 12;
    for (const { ending, index, from, to } of endings) {
      const head = from >= start;
      const tail = to <= end;
      const element = { kind: 'ending', index } as const;
      const p = placement(element);
      const startX = !head ? LEFT : ending.fromAt === undefined ? barEdge(ending.start - 1, LEFT) : relative(from);
      const endX = !tail ? rightEdge : ending.toAt === undefined ? barEdge(ending.end) : relative(to);
      const [left, right] = lineEnds(startX, endX, head, tail, p, head ? ending.passes.length * 10 + 12 : 4);
      let shape = line(left, 15, right, 15) + line(left, 15, right, 15, 'line-hit');
      if (head) shape += line(left, 15, left, 28)
        + text(left + 5, 25, ending.passes.join(',') + '.', 'ending-pass-number', 'start');
      if (tail && !ending.open) shape += line(right, 15, right, 28);
      const picked = !input && selection?.kind === 'ending' && selection.index === index;
      if (picked) shape += (head ? makeHandle('from', left, 15) : '') + (tail ? makeHandle('to', right, 15) : '');
      const x = clamp(p.x ?? 0, marginLeft - left, rightEdge - right);
      const y = Math.max(-11, p.y ?? 0);
      if (occupies(element)) {
        endingBottom = Math.max(endingBottom, 28 + y);
        systemInk.push({ left: left + x, right: right + x, top: 14 + y, bottom: 29 + y });
      }
      systemDrawing += wrap(element, shift(shape, x, y), picked);
    }
    const endIndex = group.at(-1)!.index + 1;
    const manualBreak = boundaryAt(score, endIndex).break;
    if (manualBreak) systemDrawing += wrap({ kind: 'break', index: endIndex },
      shift(text(rightEdge - STROKE_RADIUS, 9, manualBreak === 'page' ? '⇥' : '↵', 'layout-mark'),
        placement({ kind: 'break', index: endIndex }).x, placement({ kind: 'break', index: endIndex }).y),
      selection?.kind === 'break' && selection.index === endIndex);
    let rowStart = endingBottom + 4;
    const voiceRows: { lane: Lane; baseline: number; weight: number; drawing: string; lyrics: Map<number, string>;
      highlights: string; ink: InkBox[] }[] = [];
    let weight = 0;
    for (const { lane, items, spans } of rows) {
      let drawing = '';
      let interactive = '';
      let lowest = lane.parent ? 14 + STROKE_RADIUS : bracketed ? 10 : 9;
      let lyricWeight = 0;
      const lyrics = new Map<number, string>();
      const minTick = Math.max(lane.start ?? start, start);
      const maxTick = Math.min(lane.end ?? end, end);
      const obstacles: InkBox[] = [];
      const reserve = (left: number, right: number, top: number, bottom = top + 8) => obstacles.push({ left, right, top, bottom });
      const root = laneMap.get(parentId(lane))!;
      if (shown.names.includes(root) && active.find(row => parentId(row) === root.id) === lane) {
        const element = nameAt(root, start);
        const name = labelText(root, start);
        const { width, ascent, descent } = measured(name, 'lane', appearance(element)?.text);
        const inkWidth = Math.min(width, labelWidth(root, start));
        const p = placement(element);
        const base = Math.min(LEFT, marginLeft + labelGutter(start, shown.names, shown.bracketWidth, false)) - 16 - shown.bracketWidth;
        const x = clamp(base + (p.x ?? 0), marginLeft + inkWidth, occupies(element) ? LEFT - 13 - shown.bracketWidth : rightEdge);
        const baseline = 5 + offset(root, start, true) + (p.y ?? 0);
        const label = formatted(element, x, baseline, name, 'lane-label', 'end');
        const shape = width > inkWidth ? label.replace('<text ', `<text textLength="${inkWidth}" lengthAdjust="spacingAndGlyphs" `) : label;
        drawing += wrap(element, shape, !input && !!selection && appearanceKey(selection) === appearanceKey(element));
        if (occupies(element)) reserve(x - inkWidth, x, baseline - ascent, baseline + descent);
      }
      const drawBar = (index: number, x: number, side: 'left' | 'right' | 'both', at: number) => {
        const dy = offset(lane, at, true);
        const { style } = boundaryAt(score, index);
        const head = side !== 'right' && startsRepeat(style);
        const tail = side !== 'left' && endsRepeat(style);
        const heavy = head || tail || style === 'final';
        const center = x === rightEdge ? x - (heavy ? 1 : STROKE_RADIUS) : x;
        const stroke = (x: number, heavy = false) => line(x, -13, x, 9, heavy ? 'final' : '');
        let shape = stroke(center, heavy);
        if (head) shape += stroke(center + 4) + dot(center + 8, -5) + dot(center + 8, 2);
        if (tail) shape += stroke(center - 4) + dot(center - 8, -5) + dot(center - 8, 2);
        if (!head && !tail && (style === 'double' || style === 'final')) shape += stroke(center - 4);
        if (occupies({ kind: 'barline', index })) reserve(center - (tail ? 10 : side !== 'left' && ['double', 'final'].includes(style) ? 5 : 1),
          center + (head ? 10 : 1), dy - 13, dy + 9);
        const move = side === 'both' ? 'movable-boundary' : 'position-fixed';
        const limits = side === 'both' ? ` data-bar-move="${index}" data-limits="${barLimits.get(index)}"` : '';
        drawing += wrap({ kind: 'barline', index }, `<g class="${move}"${limits}>${shift(shape + line(x, -14, x, 10, 'line-hit'), 0, dy)}</g>`,
          !input && selection?.kind === 'barline' && selection.index === index);
      };
      const firstMeasure = group[0];
      if (minTick === start && startsRepeat(boundaryAt(score, firstMeasure.index).style) && (!lane.parent || lane.start! < start))
        drawBar(firstMeasure.index, LEFT, 'left', start);
      group.forEach((measure, index) => {
        if (measure.end > minTick && (lane.parent ? measure.end < maxTick || measure.end === end && lane.end! > end : measure.end <= maxTick))
          drawBar(measure.index + 1, boundaries[index], index === group.length - 1 ? 'right' : 'both', measure.end);
        if (measure.start < minTick || measure.start >= maxTick || !measure.keyWidth && !measure.meterWidth) return;
        let x = (boundaries[index - 1] ?? LEFT) + spacing.bar + (startsRepeat(boundaryAt(score, measure.index).style) ? 10 : 0);
        const dy = offset(lane, measure.start);
        if (measure.keyLabel) {
          if (measure.keyAppearance?.layout !== false) reserve(x, x + measure.keyWidth, dy - 9, dy + 5);
          drawing += signature(measure.index, 'key', keyShape(x, dy + 5, measure.keyLabel));
        }
        x += measure.keyWidth;
        if (measure.meterWidth) {
          if (measure.meterAppearance?.layout !== false) reserve(x, x + measure.meterWidth, dy - 14, dy + 16);
          drawing += signature(measure.index, 'meter', meterShape(x, dy, measure.meterWidth, measure.meterLabel, measure.meter.denominator));
        }
      });
      const digitClearance = new Map<Token, number>();
      const picked = (element: ElementSelection) => !input && (element.kind !== 'pitch'
        ? !!selection && appearanceKey(element) === appearanceKey(selection)
        : cursor.lane === lane.id && (range?.lane === lane.id
          ? element.at >= Math.min(range.at, cursor.at) && element.at <= Math.max(range.at, cursor.at)
          : element.at === cursor.at && (selection
            ? selection.kind === 'pitch' && element.index === selection.index
            : element.index === (glyphMap.get(items.find(token => token.at === element.at)!)?.[0]?.index ?? 0))));
      const label = (element: ElementSelection, shape: string) =>
        wrap(element, shape, picked(element));
      const placed = (element: ElementSelection, shape: string, box: InkBox, right = rightEdge, reference = box, profile?: InkBox[], above = false) => {
        const p = placement(element);
        const dx = clamp(p.x ?? 0, marginLeft - reference.left, right - reference.right);
        const related = obstacles.filter(other => intersectsX(other, reference.left + dx, reference.right + dx));
        const dy = above ? Math.min(p.y ?? 0, ...related.map(other => other.top - box.bottom - 1.5))
          : p.x || p.y ? legalY(p.y ?? 0, related.map(other => [other.top - reference.bottom - 1, other.bottom - reference.top + 1])) : 0;
        const moved = offsetBox(box, dx, dy);
        if (occupies(element)) obstacles.push(...(profile ? profile.map(section => offsetBox(section, dx, dy)) : [moved]));
        return { drawing: label(element, shift(shape, dx, dy)), dx, dy, box: moved };
      };
      const dragging = selection?.kind === 'span'
        && score.notes.find(note => note.id === score.spans[selection.index]?.from)?.lane === lane.id;
      if (dragging) {
        const span = score.spans[selection.index];
        if (span.kind === 'crescendo' || span.kind === 'diminuendo') {
          const first = Math.ceil(minTick / 24) * 24;
          const anchors = new Set([minTick, maxTick, ...items.flatMap(token => [token.at, ...token.tail])]);
          for (let at = first; at < maxTick; at += 24) anchors.add(at);
          for (const at of anchors) drawing += `<circle class="span-target" data-at="${at}" cx="${relative(at, lane.id)}" cy="${offset(lane, at)}" r="0"/>`;
        }
      }
      const topOf = (token: Token, glyph?: { y: number; octave: number }) => {
        const scale = tokenScale(token);
        const at = offset(lane, token.at) + (glyph?.y ?? 0);
        const ink = (5.5 - style.digit.size * .8) * scale;
        return glyph && glyph.octave > 0 ? Math.min(at + ink, at - 10 * scale - 4 * (glyph.octave - 1) - 1.48) : at + ink;
      };
      for (const token of items) {
        const columns = glyphMap.get(token)!;
        const x = relative(token.at, lane.id);
        const dy = offset(lane, token.at);
        digitClearance.set(token, Math.min(...(columns.length ? columns.map(glyph => topOf(token, glyph)) : [topOf(token)])));
        for (const glyph of columns.length ? columns : [undefined]) {
          const bottom = dy + (glyph?.y ?? 0) + 6 * tokenScale(token);
          reserve(x - digitHalf, x + digitHalf, topOf(token, glyph), bottom);
        }
      }
      for (const token of items) for (const glyph of glyphMap.get(token)!) {
        const sign = signAt(token, glyph.index);
        if (!sign) continue;
        const { scale, gap, width, raise } = accidentalInk(token, glyph.pitch, digitHalf);
        const x = relative(token.at, lane.id) - gap;
        const baseline = offset(lane, token.at) + glyph.y - raise;
        const element = markOf(token, 'accidental', undefined, glyph.index);
        const shape = scale === 1 ? accidentalShape(x, baseline, sign, 'accidental') :
          `<g transform="translate(${x} ${baseline}) scale(${scale})">${accidentalShape(0, 0, sign, 'accidental')}</g>`;
        const result = placed(element, shape, { left: x - width, right: x, top: baseline - 11 * scale, bottom: baseline + 2 * scale });
        interactive += result.drawing;
      }
      for (const token of items) for (const side of GRACE_SIDES) {
        const layout = graceLayout(token, side);
        if (!layout) continue;
        const { events, width, caret, dy } = layout;
        const at = side === 'before' ? token.at : token.tail.at(-1) ?? token.at;
        const x = relative(at, lane.id), y = offset(lane, at);
        const ink = group[token.measure - group[0].index].noteInk.get(token);
        const left = side === 'before' ? x - (ink?.graceLead ?? graceGap(side) + digitHalf) :
          x + (at === token.at ? ink?.graceTrail ?? graceGap(side) + digitHalf : graceGap(side) + 5);
        const baseline = y - graceSize * .95 + dy;
        let bottom = baseline + graceSize * .24;
        const centerOctave = lane.displayOctave ?? laneMap.get(lane.parent ?? lane.id)?.displayOctave ?? lane.octave;
        const beamBase = baseline + engraving.graceBeamGap;
        const tops = new Map<string, number>();
        for (const [i, { event, picks, signs, center, left: inkLeft, right: inkRight, bars }] of events.entries()) {
          const cx = left + center;
          const everyPitch = event.pitches.map((pitch, index) => ({ pitch: pitchInMeasure(score, token, measures[token.measure].tonic, pitch), index }))
            .sort((a, b) => sound(a.pitch, measures[token.measure].tonic) - sound(b.pitch, measures[token.measure].tonic));
          let itemTop = baseline;
          for (const [rank, { pitch, index }] of everyPitch.entries()) {
            const py = baseline - rank * (graceSize + 3);
            const octave = pitch.octave - centerOctave;
            const sign = signs[index];
            let shape = text(cx, py, pitch.degree, 'grace-digit');
            if (sign !== undefined) shape += accidentalShape(cx - graceSize * .39, py - 1.5, accidentalSign(sign), 'grace-accidental', graceSize * .83);
            itemTop = Math.min(itemTop, py - graceSize * .8 - Math.max(0, octave) * 3);
            for (let point = 0; point < Math.abs(octave); point++) {
              const dotY = octave > 0 ? py - graceSize * .87 - point * 3
                : Math.max(py + graceSize * .33, rank === 0 && bars ? beamBase + (bars - 1) * 2.05 : -Infinity) + 2.4 + point * 3;
              shape += `<circle cx="${cx}" cy="${dotY}" r="1"/>`;
              bottom = Math.max(bottom, dotY + 1);
            }
            if (rank === 0) {
              for (let count = 0; count < (event.dots ?? 0); count++)
                shape += `<circle class="grace-dot" cx="${cx + graceSize * .40 + count * 2.5}" cy="${py - engraving.graceDotLift}" r=".85"/>`;
              for (let level = 0; level < bars; level++) {
                const next = events[i + 1];
                const beam = beamBase + level * 2.05;
                const endX = next && graceConnected(events[i], next, level + 1) ? left + next.center : cx + graceSize * .33;
                shape += line(cx - graceSize * .37, beam, endX, beam, 'grace-beam');
                bottom = Math.max(bottom, beam + .5);
              }
            }
            const metric = index === 0 ? `<g data-grace-metric="${center},${inkLeft},${inkRight}">${shape}</g>` : shape;
            interactive += label(picks[index], metric);
          }
          tops.set(event.id, itemTop);
          reserve(cx - inkLeft, cx + inkRight, itemTop, bottom);
        }
        const groupLinks = token.note.grace?.[side]?.links ?? [];
        for (const link of groupLinks) {
          const first = events.find(item => item.event.id === link.from), last = events.find(item => item.event.id === link.to);
          if (!first || !last) continue;
          const startX = left + first.center, endX = left + last.center;
          const startY = tops.get(link.from)! - 1.5, endY = tops.get(link.to)! - 1.5;
          const roof = Math.min(startY, endY, localCeiling(Infinity, startX + 1, endX - 1, obstacles) - 1) - (link.kind === 'tie' ? 2 : 3.5);
          const pick = { kind: 'grace-line', id: token.note.id, side, link: link.id } as const;
          const arc = arcGeometry([startX, startY], [endX, endY], appearance(pick)?.arcShape !== 'long', roof);
          interactive += label(pick, path(arc.path, 'grace-arc grace-inner-' + link.kind) + path(arc.path, 'line-hit'));
          if (occupies(pick)) reserve(startX, endX, arc.top, Math.max(startY, endY));
        }
        for (const { event, picks, center } of events) {
          const cx = left + center;
          let markY = localCeiling(tops.get(event.id)! - 2, cx - 3, cx + 3, obstacles) - 1.4;
          let shape = '';
          if (event.staccato) { shape += `<path class="solid" d="M${cx - 1.5} ${markY - 4}h3L${cx} ${markY}Z"/>`; markY -= 5; }
          if (event.accent) { shape += path(`M${cx - 3} ${markY - 4}l6 2-6 2`, 'grace-beam'); markY -= 5; }
          if (event.tenuto) { shape += line(cx - 2.8, markY, cx + 2.8, markY, 'grace-beam'); markY -= 4; }
          if (event.fermata) { shape += `<g transform="translate(${cx} ${markY}) scale(.6)">${fermataShape(0, 0)}</g>`; markY -= 5; }
          if (event.breath) {
            const sign = { upbow: 'M-3 -3L0 0L3 -3', comma: 'M0 -3q3 0-1 4', tick: 'M-1 0L1 -4', salzedo: 'M-3 -3L0 0L3 -3M-2 -4H2' }[event.breath];
            shape += shift(path(sign, 'grace-beam'), cx, markY);
            markY -= 5;
          }
          if (shape) {
            interactive += label(picks[0], `<g class="grace-articulation">${shape}</g>`);
            reserve(cx - 4, cx + 4, markY, tops.get(event.id)!);
          }
        }
        if (events.length) {
          const middle = left + (events[0].center + events.at(-1)!.center) / 2;
          const anchorY = bottom + 1.6;
          const finishX = side === 'before' ? left + 1 : left - 1;
          const finishY = y - 1;
          const reach = finishX - middle, drop = finishY - anchorY;
          const bend = .55228475;
          const shape = `M${middle} ${anchorY} C${middle} ${anchorY + drop * bend} ${finishX - reach * bend} ${finishY} ${finishX} ${finishY}`;
          interactive += path(shape, 'grace-arc');
          reserve(Math.min(middle, finishX), Math.max(middle, finishX), Math.min(anchorY, finishY), Math.max(anchorY, finishY) + .5);
        }
        if (caret) {
          const last = events.at(-1);
          const cx = left + (events[caret.gap] ? events[caret.gap].center - events[caret.gap].left - 1 :
            last ? last.center + last.right : side === 'before' ? -width + 1 : 1);
          interactive += line(cx, baseline - graceSize, cx, Math.max(baseline + 5, bottom), 'input-cursor grace-caret');
        }
      }
      const tuplets = (score.tuplets ?? []).filter(group => group.lane === lane.id && group.at >= start && tickEnd(group) <= end)
        .map(group => {
          const members = items.filter(item => item.at >= group.at && item.at < tickEnd(group));
          return { group, first: members[0], last: members.at(-1), members };
        }).filter(entry => entry.first && entry.last);
      const tupletRoofs = new Map<string, { top: number }>();
      const tupletInk = new Map<InkBox, typeof tuplets[number]>();
      const innerRoofs: { from: number; to: number; top: number }[] = [];
      const encloses = (link: Link, entry: typeof tuplets[number]) => link.from.at < entry.first.at && link.to.at > entry.last!.at;
      const lastAnchor = (entry: typeof tuplets[number]) => entry.last!.tail.at(-1) ?? entry.last!.at;
      const internalWedge = (link: Link, entry: typeof tuplets[number]) =>
        (link.kind === 'crescendo' || link.kind === 'diminuendo') &&
        (link.fromAt ?? link.from.at) >= entry.first.at && (link.toAt ?? link.to.at) <= lastAnchor(entry);
      const laidWedges = new Set<Link>();
      const emitTuplet = (entry: typeof tuplets[number]) => {
        if (tupletRoofs.has(entry.group.id)) return;
        const { group, first, last, members } = entry;
        const pick = { kind: 'tuplet', id: group.id } as const;
        const x1 = relative(first.at, lane.id) - 1.5;
        const x2 = relative(last!.tail.at(-1) ?? last!.at, lane.id) + 1.5;
        const children = tuplets.filter(item => item.group.parent === group.id);
        for (const child of children) emitTuplet(child);
        const top = Math.min(...members.map(item => digitClearance.get(item)!), ...innerRoofs
          .filter(ink => ink.from >= first.at && ink.to <= lastAnchor(entry)).map(ink => ink.top),
          ...children.map(child => tupletRoofs.get(child.group.id)!.top)) - 4 -
          (spans.some(link => internalWedge(link, entry) && !laidWedges.has(link)) ? 14 : 0);
        const mid = (x1 + x2) / 2;
        const parent = (score.tuplets ?? []).find(item => item.id === group.parent);
        const identity = Math.abs(group.length / tupletScale(parent) - tupletWritten(group)) < 1e-6;
        const caption = identity ? `${group.count}:${group.count}` : String(group.count);
        const half = Math.min((x2 - x1) / 2, measured(caption, 'expression').width * .37 + 2);
        const rise = Math.min(5, (x2 - x1) * .10);
        const bridge = (side: number) => `M${side < 0 ? x1 : x2} ${top} Q${mid + side * (x2 - x1) * .26} ${top - rise} ${mid + side * half} ${top - rise}`;
        const shape = bridge(-1) + ' ' + bridge(1);
        const box = { left: x1, right: x2, top: top - rise - 7, bottom: top + 1 };
        const result = placed(pick, path(shape, 'arc tuplet-arc') + path(shape, 'line-hit') +
          text(mid, top - rise + 3, caption, 'tuplet-number'), box);
        if (occupies(pick)) { tupletRoofs.set(group.id, { top: result.box.top }); tupletInk.set(result.box, entry); }
        else tupletRoofs.set(group.id, { top: Infinity });
        interactive += result.drawing;
      };
      const wedges: Link[] = [];
      const sortedSpans = [...spans].sort((first, second) =>
        (tuplets.length ? 0 : Number(first.kind !== 'tie') - Number(second.kind !== 'tie')) ||
        (first.to.at - first.from.at) - (second.to.at - second.from.at));
      const roofs: { start: number; end: number; y: number; from: number; to: number }[] = [];
      const endpointGlyph = (link: Link, head: boolean) => {
        const token = head ? link.from : link.to;
        const ordered = glyphMap.get(token)!;
        const index = head ? link.pitch : link.targetPitch;
        return ordered.find(item => item.index === index) ?? ordered[0];
      };
      const anchor = (link: Link, head: boolean): { point: [number, number]; maxY: number } => {
        const token = head ? link.from : link.to;
        const glyph = endpointGlyph(link, head);
        const top = topOf(token, glyph);
        const y = Math.min(top - 2, offset(lane, token.at) + (glyph?.y ?? 0) - 12 * tokenScale(token));
        return { point: [relative(token.at, lane.id) + (glyph?.depth ? (head ? digitHalf : -digitHalf) : 0), y], maxY: top - y - .5 };
      };
      if (input && pendingSlur?.lane === lane.id) {
        const startToken = items.find(item => item.note.id === pendingSlur.id && item.at === pendingSlur.at &&
          !item.note.unpitched && item.note.pitches.length);
        if (startToken) {
          const [x, y] = anchor({ from: startToken, to: startToken, kind: 'slur', short: true }, true).point;
          const edge = Math.min(rightEdge - 1, x + 23);
          if (edge > x) {
            const roof = localCeiling(y - 5, x + 2, edge, obstacles);
            interactive += path(arcGeometry([x, y], [edge, roof], false, roof, true, false).path, 'arc pending-slur');
            reserve(x, edge, roof, y);
          }
        }
      }
      for (const link of sortedSpans) {
        const head = link.from.at >= start;
        const tail = link.to.at < end;
        if (link.kind === 'tie' || link.kind === 'slur') {
          const below = tuplets.filter(entry => encloses(link, entry));
          for (const entry of below) emitTuplet(entry);
          const headAnchor = head ? anchor(link, true) : undefined, tailAnchor = tail ? anchor(link, false) : undefined;
          const from: [number, number] = headAnchor?.point ?? [LEFT + 3, offset(lane, minTick) - 24];
          const to: [number, number] = tailAnchor?.point ?? [rightEdge - 4, offset(lane, Math.max(minTick, maxTick - 1)) - 24];
          const element = linkOf(link);
          const mode = appearance(element)?.arcShape;
          const short = mode ? mode === 'short' : link.short;
          const p = placement(element);
          const enclosed = items.filter(token => token.at >= link.from.at && token.at <= link.to.at);
          const innerTie = link.kind === 'tie' && !!endpointGlyph(link, true)?.depth && !!endpointGlyph(link, false)?.depth;
          const overlaps = roofs.filter(item => from[0] < item.end - .5 && to[0] > item.start + .5 &&
            (link.from.at !== item.to && link.to.at !== item.from));
          const initialFrom = [...from] as [number, number], initialTo = [...to] as [number, number];
          if (headAnchor) from[1] += Math.min(p.fromY ?? 0, headAnchor.maxY);
          if (tailAnchor) to[1] += Math.min(p.toY ?? 0, tailAnchor.maxY);
          [from[0], to[0]] = lineEnds(from[0], to[0], head, tail, p, short ? 5 : 6);
          const localCeiling = Math.min(offset(lane, Math.max(minTick, link.from.at)), offset(lane, Math.min(maxTick - 1, link.to.at))) - 9;
          const blockingDigits = enclosed.filter(token => token !== link.from && token !== link.to).map(token => digitClearance.get(token)! - 3);
          const blockingRoof = Math.min(...blockingDigits, ...overlaps.map(item => item.y - 4),
            ...below.map(entry => tupletRoofs.get(entry.group.id)!.top - 3));
          const roofAt = (a: typeof from, b: typeof to, height = 0) => {
            const room = [head ? a[1] : Infinity, tail ? b[1] : Infinity];
            const available = innerTie ? Infinity : blockingRoof;
            if (short) {
              const baseline = head && tail ? (a[1] + b[1]) / 2 : Math.min(localCeiling, ...room);
              return Math.min(baseline - Math.max(1, shortArcRise(b[0] - a[0], style.digit.size) + height), available);
            }
            const innerCeiling = offset(lane, minTick) + (endpointGlyph(link, true)?.y ?? 0) - 12 * tokenScale(link.from);
            const base = (innerTie ? Math.min(...(head || tail ? room : [innerCeiling])) :
              Math.min(localCeiling, ...room, ...enclosed.map(token => digitClearance.get(token)!))) - 8;
            return Math.min(base - height, available, ...room.map(y => y - .5));
          };
          const roof = roofAt(from, to, p.height);
          const geometry = arcGeometry(from, to, short, roof, head, tail);
          const shape = path(geometry.path, `arc ${link.kind}`);
          const handles = picked(element) ? (head ? makeHandle('from', ...from, headAnchor?.maxY) : '') + (tail ? makeHandle('to', ...to, tailAnchor?.maxY) : '') +
            makeHandle('height', ...geometry.middle) : '';
          const referenceRoof = roofAt(initialFrom, initialTo);
          const reference = arcGeometry(initialFrom, initialTo, short, referenceRoof, head, tail);
          const points = [from[0], geometry.middle[0], to[0], ...Array.from(
            { length: Math.floor((to[0] - from[0]) / 5) }, (_, i) => from[0] + (i + 1) * 5)].sort((a, b) => a - b);
          const stroke = engraving.arc / 2;
          const profile = points.slice(1).map((x, i) => {
            const left = points[i], heights = [geometry.yAt(left), geometry.yAt(x), geometry.yAt((left + x) / 2)];
            return { left: left - stroke, right: x + stroke, top: Math.min(...heights) - stroke, bottom: Math.max(...heights) + stroke };
          });
          const result = placed(element, shape + path(geometry.path, 'line-hit') + handles,
            { left: from[0], right: to[0], top: geometry.top, bottom: Math.max(head ? from[1] : roof, tail ? to[1] : roof) }, rightEdge,
            { left: initialFrom[0], right: initialTo[0], top: reference.top, bottom: Math.max(head ? initialFrom[1] : referenceRoof, tail ? initialTo[1] : referenceRoof) }, profile);
          interactive += result.drawing;
          if (occupies(element)) innerRoofs.push({ from: link.from.at, to: link.to.at, top: result.box.top });
          if (!innerTie && occupies(element)) {
            roofs.push({ start: result.box.left, end: result.box.right, y: result.box.top, from: link.from.at, to: link.to.at });
          }
        } else if (link.kind === 'slide' || link.kind === 'tremolo') {
          const element = linkOf(link);
          const p = placement(element);
          const left = head ? relative(link.from.at, lane.id) + 6 : LEFT + 3;
          const right = tail ? relative(link.to.at, lane.id) - 6 : rightEdge - 4;
          if (right <= left + 1) continue;
          const mid = (left + right) / 2;
          const roof = localCeiling(Math.min(head ? anchor(link, true).point[1] : Infinity,
            tail ? anchor(link, false).point[1] : Infinity, offset(lane, minTick) - 8), left, right, obstacles) - 1;
          const y = Number.isFinite(roof) ? roof : offset(lane, minTick) - 15;
          const up = sound(endpointGlyph(link, false)?.pitch ?? link.to.note.pitches[0], measures[link.to.measure].tonic) >=
            sound(endpointGlyph(link, true)?.pitch ?? link.from.note.pitches[0], measures[link.from.measure].tonic);
          const from: [number, number] = [clamp(left + (p.from ?? 0), marginLeft, right - 2), y - (up ? 0 : 5)];
          const to: [number, number] = [clamp(right + (p.to ?? 0), from[0] + 2, rightEdge), y - (up ? 5 : 0)];
          const stroke = link.kind === 'slide' ? line(...from, ...to, 'slide-mark') :
            Array.from({ length: link.strokes ?? 3 }, (_, i) => line(mid - 4, y - i * 2.8, mid + 4, y - 3 - i * 2.8, 'tremolo-mark')).join('');
          const handles = picked(element) ? (head ? makeHandle('from', ...from) : '') + (tail ? makeHandle('to', ...to) : '') : '';
          interactive += placed(element, stroke + line(...from, ...to, 'line-hit') + handles,
            { left: from[0], right: to[0], top: y - 12, bottom: y + 1 }, rightEdge, undefined, undefined, true).drawing;
        } else wedges.push(link);
      }
      for (const entry of tuplets) if (!spans.some(link => internalWedge(link, entry))) emitTuplet(entry);
      const beamFloors = new Map<Token, number>();
      const articulations: (() => void)[] = [];
      const rhythmicBottom = new Map<VoiceBand, number>();
      for (let index = 0; index < items.length;) {
        if (!items[index].bars) { index++; continue; }
        let next = index + 1;
        while (next < items.length && connected(items[next - 1], items[next], 1) && offset(lane, items[next - 1].at) === offset(lane, items[next].at)) next++;
        const run = items.slice(index, next);
        const floor = Math.max(...run.map(token => (glyphMap.get(token)!.at(-1)?.y ?? 0) + 8 * tokenScale(token)));
        for (const token of run) beamFloors.set(token, floor);
        index = next;
      }
      for (const [index, token] of items.entries()) {
        const glyphs = glyphMap.get(token)!;
        const base = beamFloors.get(token) ?? 0;
        const beam = token.bars ? base + (token.bars - 1) * 3 : -Infinity;
        const dy = offset(lane, token.at);
        const x = relative(token.at, lane.id);
        const next = items[index + 1];
        for (let level = 1; level <= token.bars; level++) {
          const right = next && connected(token, next, level) && offset(lane, next.at) === dy ? relative(next.at, lane.id) : x + 5;
          const top = dy + base + (level - 1) * 3;
          reserve(x - 5, right, top - .68, top + .68);
        }
        const bottom = dy + (glyphs.at(-1)?.y ?? 0);
        for (let dot = 0; dot < token.dots; dot++) reserve(x + 7.5 + dot * 4, x + 10.5 + dot * 4, bottom + .5, bottom + 3.5);
        for (const at of token.tail) {
          const dash = relative(at, lane.id), baseline = offset(lane, at) + 1;
          if (occupies({ kind: 'extension', id: token.note.id, at }))
            reserve(dash - 5, dash + 5, baseline - STROKE_RADIUS, baseline + STROKE_RADIUS);
        }
        let noteBottom = Math.max(beam + 0.675, (glyphs.at(-1)?.y ?? 0) + 6 * tokenScale(token));
        for (const glyph of glyphs) if (glyph.octave < 0) {
          const floor = glyph === glyphs.at(-1) && token.bars ? beam : glyph.y + 7 * tokenScale(token);
          noteBottom = Math.max(noteBottom, floor - glyph.octave * 4 + 1.48);
          reserve(x - 1.48, x + 1.48, dy + floor + 2.52, dy + floor - glyph.octave * 4 + 1.48);
        }
        lowest = Math.max(lowest, noteBottom);
        if (hasDivisi) {
          const slice = bandAt(lane, token.at);
          rhythmicBottom.set(slice, Math.max(rhythmicBottom.get(slice) ?? -Infinity, dy + noteBottom));
        }
      }
      const inlineInk: InkBox[] = [];
      for (const token of items) for (const { at, words, extension } of textAnchors(token)) {
        const leading = leadingText(token, words.interNoteText, extension);
        if (!leading) continue;
        const { pick, width, ascent, descent, align, value, side } = leading;
        const p = placement(pick);
        const layout = occupies(pick);
        const squeeze = layout ? factor : 1;
        const dy = offset(lane, at);
        const edge = side < 0 ? 'left' : 'right';
        const clearance = extension === undefined
          ? group[token.measure - group[0].index].noteInk.get(token)?.[edge] ?? digitHalf : Math.max(5, spacing.note);
        const slackKey = lanePositions.get(lane.id)?.has(at) ? JSON.stringify([lane.id, at]) : String(at);
        const slack = columnSlack.get(slackKey)?.[edge] ?? 0;
        const outward = layout ? clamp((p.x ?? 0) * side, 0, slack) * squeeze : (p.x ?? 0) * side;
        const near = relative(at, lane.id) + side * ((clearance + leadingGap) * squeeze + outward);
        const left = side < 0 ? near - width * squeeze : near;
        const right = left + width * squeeze;
        const y = dy + 1;
        const vertical = obstacles.filter(box => intersectsX(box, left, right));
        const nextY = y + (layout ? legalY(p.y ?? 0, vertical.map(box => [box.top - y - descent - 1, box.bottom - y + ascent + 1])) : p.y ?? 0);
        const x = right - (align === 'start' ? width : align === 'end' ? 0 : width / 2);
        const shape = formatted(pick, x, nextY, value, 'expression');
        const drawing = squeeze < 1 ? `<g transform="translate(${right} 0) scale(${squeeze} 1) translate(${-right} 0)">${shape}</g>` : shape;
        interactive += label(pick, layout ? `<g data-note-text-limits="${side < 0 ? [-slack, 1200] : [-1200, slack]}">${drawing}</g>` : drawing);
        if (layout) {
          const box = { left, right, top: nextY - ascent, bottom: nextY + descent };
          inlineInk.push(box);
          obstacles.push(box);
        }
      }
      const verseHeights = new Map<number, number>();
      for (const token of items) if (!token.continuation) for (const verse of noteVerses(token.note)) if (verse.text) {
        const pick = markOf(token, 'lyric', verse.number);
        if (!occupies(pick)) continue;
        const m = measured(verse.text, 'lyric', appearance(pick)?.text);
        verseHeights.set(verse.number, Math.max(verseHeights.get(verse.number) ?? 0, m.ascent + m.descent));
      }
      const rhythmicFloor = lowest;
      const lyricBaseline = rhythmicFloor + spacing.lyric + Math.max(12, style.lyric.size - 2, ...verseHeights.values());
      const extending = (extensions.get(lane.id) ?? []).filter(extension => extension.at < end && extension.end > start);
      const verseRows = [...new Set([
        ...items.flatMap(token => token.continuation ? [] : noteVerses(token.note)
          .filter(verse => occupies(markOf(token, 'lyric', verse.number))).map(verse => verse.number)),
        ...extending.filter(extension => occupies({ kind: 'mark', field: 'lyric-extension', id: extension.id, verse: extension.verse }))
          .map(extension => extension.verse),
        ...(lyricEdit?.lane === lane.id && lyricEdit.at >= start && lyricEdit.at < end
          ? lyricEdit.rows ?? [lyricEdit.verse] : [])
      ])].sort((left, right) => left - right);
      const verseRow = (number: number) => verseRows.filter(verse => verse < number).length;
      const lyricGap = spacing.lyric + Math.max(12, style.lyric.size - 2, ...verseHeights.values());
      const verseFloors = new Map<VoiceBand, number>();
      for (const slice of bandsFor(lane)) if (hasDivisi && slice.lanes.includes(lane)) {
        verseFloors.set(slice, Math.max(offset(lane, slice.start) + (lane.parent ? 14.5 : bracketed ? 10 : 9),
          rhythmicBottom.get(slice) ?? -Infinity));
      }
      const verseY = (number: number, at: number) => (hasDivisi ? (verseFloors.get(bandAt(lane, at)) ?? rhythmicFloor) + lyricGap : lyricBaseline) +
        verseRows.filter(verse => verse < number).reduce((sum, verse) => sum + Math.max(style.lyric.size, verseHeights.get(verse) ?? 0) + 3, 0);
      const localLyricY = (baseline: number, left: number, right: number, ascent: number, descent: number) => {
        const nearby = inlineInk.filter(box => intersectsX(box, left, right)).sort((a, b) => a.top - b.top);
        for (const box of nearby) if (baseline + descent + 1 > box.top && baseline - ascent - 1 < box.bottom)
          baseline = box.bottom + ascent + 1;
        return baseline;
      };
      const addLyric = (number: number, shape: string, bottom?: number) => {
        const stretch = spacing.lyric + 3 * verseRow(number);
        lyrics.set(stretch, (lyrics.get(stretch) ?? '') + shape);
        if (bottom !== undefined && bottom >= lowest) {
          lowest = bottom;
          lyricWeight = stretch;
        }
      };
      const placedLyrics = new Map<string, { box: InkBox; at: number; verse: number; baseline: number }>();
      for (const extension of extending) {
        const left = extension.at >= start ? relative(extension.at, lane.id) + lyricSize(extension.text).half + 3 : LEFT;
        const right = extension.end >= end
          ? rightEdge - 3 : extension.beforeText ? relative(extension.end, lane.id) - lyricSize(extension.beforeText).half - 3
            : relative(extension.end, lane.id) - 3;
        const element = { kind: 'mark', field: 'lyric-extension', id: extension.id, verse: extension.verse } as const;
        const segments = hasDivisi ? bandsFor(lane).filter(slice => slice.lanes.includes(lane)).map(slice =>
          ({ left: Math.max(left, bandEdge(slice.start)), right: Math.min(right, bandEdge(slice.end)), at: slice.start }))
          : [{ left, right, at: extension.at }];
        for (const segment of segments) if (segment.right > segment.left) {
          const baseline = localLyricY(verseY(extension.verse, segment.at), segment.left, segment.right, 1.5, 0);
          const result = placed(element, line(segment.left, baseline - 1, segment.right, baseline - 1, 'lyric-extension') +
            line(segment.left, baseline - 1, segment.right, baseline - 1, 'line-hit'),
            { left: segment.left, right: segment.right, top: baseline - 1.5, bottom: baseline - 0.5 });
          addLyric(extension.verse, result.drawing, occupies(element) ? result.box.bottom : undefined);
        }
      }
      for (const [index, token] of items.entries()) {
        const y = offset(lane, token.at);
        const scale = tokenScale(token);
        const x = relative(token.at, lane.id);
        const ordered = glyphMap.get(token)!;
        const pitchBottom = y + (ordered.at(-1)?.y ?? 0);
        const beamY = y + (beamFloors.get(token) ?? 0);
        if (lyricEdit?.lane === lane.id && lyricEdit.at === token.at) {
          const baseline = localLyricY(verseY(lyricEdit.verse, token.at), x - 6, x + 6, style.lyric.size * .86, 4);
          addLyric(lyricEdit.verse, `<circle class="lyric-anchor" cx="${x}" cy="${baseline}" r="0"/>`, baseline + 4);
          if (hasDivisi) reserve(x - 2, x + 2, baseline - style.lyric.size, baseline + 4);
        }
        if (!token.exact) warnings.add('谱中存在首版无法精确绘制的细分时值。');
        if (!ordered.length) interactive += label({ kind: 'pitch', id: token.note.id, at: token.at, index: 0 }, text(x, y + 5.5, token.note.unpitched ? 'X' : '0', 'digit'));
        for (const glyph of ordered) {
          const digitY = y + glyph.y;
          const element = { kind: 'pitch', id: token.note.id, at: token.at, index: glyph.index } as const;
          let shape = text(x, digitY + 5.5, glyph.pitch.degree, 'digit');
          if (scale !== 1) shape = `<g transform="translate(0 ${digitY * (1 - scale)}) scale(1 ${scale})">${shape}</g>`;
          for (let octave = 0; octave < Math.abs(glyph.octave); octave++) {
            const floor = glyph === ordered.at(-1) && token.bars ? beamY + (token.bars - 1) * 3 : digitY + 7 * scale;
            shape += dot(x, glyph.octave > 0 ? digitY - 10 * scale - octave * 4 : floor + 4 + octave * 4);
          }
          interactive += label(element, shape);
        }
        for (let index = 0; index < token.dots; index++) drawing += dot(x + 9 + index * 4, pitchBottom + 2);
        for (const at of token.tail) {
          const left = relative(at, lane.id) - 5, right = relative(at, lane.id) + 5, baseline = offset(lane, at) + 1;
          interactive += label({ kind: 'extension', id: token.note.id, at },
            line(left, baseline, right, baseline, 'extension') + line(left, baseline, right, baseline, 'line-hit'));
        }
        for (let level = 1; level <= token.bars; level++) {
          const beam = beamY + (level - 1) * 3;
          drawing += line(x - 5, beam, x + 5, beam, 'beam');
          const next = items[index + 1];
          if (next && connected(token, next, level) && offset(lane, next.at) === y) {
            drawing += line(x, beam, relative(next.at, lane.id), beam, 'beam');
          }
        }
        if (!token.continuation) {
          articulations.push(() => {
            let markY = digitClearance.get(token)! - 2.5;
            for (const kind of ORNAMENT_KINDS) {
              const item = token.note.ornaments?.[kind];
              if (!item) continue;
              const element = { kind: 'mark', id: token.note.id, field: 'ornament', ornament: kind } as const;
              const until = token.tail.at(-1) ?? token.at;
              const waveEnd = item.wave ? Math.min(rightEdge - 3, Math.max(x + 16, relative(until, lane.id))) : x + 6;
            const shape = kind === 'tremolo' ? Array.from({ length: item.strokes ?? 3 }, (_, i) => line(x - 4, markY - i * 3, x + 4, markY - i * 3 - 3, 'tremolo-mark')).join('') :
              shift(ornamentVector(kind, kind === 'trill' && item.wave ? waveEnd - x - 7 : 0), x, markY);
              const changes = [item.upper, item.lower].flatMap((value, i) => value === undefined ? [] :
                [text(x + (i ? 8 : -8), markY - 8, accidentalSign(value), 'ornament-text')]);
              const result = placed(element, shape + changes.join(''), { left: x - 9, right: Math.max(x + 9, waveEnd + 2),
                top: markY - (changes.length ? 17 : 11), bottom: markY + 2 }, rightEdge, undefined, undefined, true);
              interactive += result.drawing;
              if (occupies(element)) markY = result.box.top - 3;
            }
            const mark = (field: 'staccato' | 'accent' | 'fermata' | 'tenuto', shape: string) => {
              const element = markOf(token, field);
              const width = { staccato: 2.5, accent: 5.5, tenuto: 4.5, fermata: 6.5 }[field];
              interactive += placed(element, shape, { left: x - width, right: x + width, top: markY - 7,
                bottom: markY + (field === 'fermata' ? .5 : 2) }, rightEdge, undefined, undefined, true).drawing;
              return occupies(element);
            };
            if (token.note.staccato) {
              if (mark('staccato', `<path class="solid" d="M${x - 2.3} ${markY - 6}h4.6L${x} ${markY}Z"/>`)) markY -= 9;
            }
            if (token.note.accent) {
              if (mark('accent', path(`M${x - 5} ${markY - 5}l10 3-10 3`))) markY -= 9;
            }
            if (token.note.tenuto) {
              if (mark('tenuto', line(x - 4, markY - 1, x + 4, markY - 1, 'tenuto'))) markY -= 6;
            }
            const breath = breathShape(token.note.breath);
            if (breath) {
              const next = items[index + 1];
              const half = breath === 'upbow' || breath === 'salzedo' ? 4.5 : 2.6;
              const breathX = Math.min(relative(token.at + token.length, lane.id) - half, next ? (x + relative(next.at, lane.id)) / 2 : rightEdge - half);
              const breathY = localCeiling(y - 6, breathX - half, breathX + half, obstacles) - 1;
              const shape = { upbow: 'M-4 -7L0 0L4 -7', comma: 'M0 -7c3 0 2 4 -2 7 1 -2 2 -4 1 -5q-2 -1 1 -2Z',
                tick: 'M-2 -1L2 -7', salzedo: 'M-4 -7L0 0L4 -7M-2 -3H2' }[breath];
              const drawing = shift(path(shape, breath === 'comma' ? 'solid breath-comma' : 'breath-' + breath), breathX, breathY);
              interactive += placed(markOf(token, 'breath'), drawing,
                { left: breathX - half, right: breathX + half, top: breathY - 8, bottom: breathY + .5 }, rightEdge, undefined, undefined, true).drawing;
            }
            if (token.note.fermata) {
              markY -= 3;
              mark('fermata', fermataShape(x, markY));
            }
          });
          for (const verse of noteVerses(token.note)) if (verse.text) {
            const element = markOf(token, 'lyric', verse.number);
            const word = verse.text;
            const face = appearance(element)?.text;
            const { width, ascent, descent } = measured(word, 'lyric', face);
            const sides = lyricSides(word, width, face);
            const natural = verseY(verse.number, token.at);
            const baseline = localLyricY(natural, x - sides.left, x + sides.right, ascent, descent);
            const result = placed(element, formatted(element, x + sides.dx, baseline, word, 'lyric'),
              { left: x - sides.left, right: x + sides.right, top: baseline - ascent, bottom: baseline + descent });
            if (appearance(element)?.visible !== false) placedLyrics.set(appearanceKey(element), { box: result.box, at: token.at,
              verse: verse.number, baseline: baseline + result.dy });
            if (baseline > natural && occupies(element)) inlineInk.push(result.box);
            addLyric(verse.number, result.drawing, occupies(element) ? result.box.bottom : undefined);
          }
        }
      }
      const lyricAt = new Map([...placedLyrics.values()].map(word => [`${word.verse}:${word.at}`, word]));
      for (const [key, word] of placedLyrics) {
        const at = nextSyllable.get(key);
        if (at === undefined) continue;
        const next = lyricAt.get(`${word.verse}:${at}`);
        const right = next?.box.left ?? (at >= end ? rightEdge : word.box.right);
        if (right - word.box.right < hyphenRoom - 4) continue;
        const x = (word.box.right + right) / 2;
        const y = (word.baseline + (next?.baseline ?? word.baseline)) / 2;
        addLyric(word.verse, text(x, y, '-', 'lyric lyric-hyphen'));
      }
      const dynamics: { element: ElementSelection; from?: number; to?: number; center: number;
        box: InkBox; draw: (center: number) => string; provisional?: InkBox }[] = [];
      const prepareDynamics: (() => void)[] = [];
      const dynamicWidths = new Map<number, number>();
      for (const token of items.filter(item => !item.continuation)) {
        const x = relative(token.at, lane.id);
        const dynamic = token.note.dynamic;
        if (!dynamic) continue;
        const pick = markOf(token, 'dynamic');
        const size = measured(dynamic, 'dynamic', appearance(pick)?.text);
        const half = Math.max(7, size.width / 2);
        if (occupies(pick)) dynamicWidths.set(token.at, half);
        const move = placement(markOf(token, 'dynamic'));
        const oldPlacement = (move.x || move.y) && !move.spaced;
        prepareDynamics.push(() => {
          const xx = x + clamp(move.x ?? 0, marginLeft - x + half, rightEdge - x - half);
          const left = xx - half, right = xx + half;
          const baseline = localCeiling(offset(lane, token.at) - 7, left, right, obstacles) - (oldPlacement ? 3 : 6);
          const y = Math.min(baseline + (move.y ?? 0), localCeiling(offset(lane, token.at) - 7, left, right, obstacles) - size.descent - 1);
          const center = y + (size.descent - size.ascent) / 2;
          dynamics.push({ element: pick, from: token.at, to: token.at, center,
            box: { left, right, top: y - size.ascent, bottom: y + size.descent },
            draw: value => `<rect class="dynamic-hit" x="${left}" y="${value - (size.ascent + size.descent) / 2}" width="${right - left}" height="${size.ascent + size.descent}" fill="transparent"/>` +
              formatted(pick, xx, y + value - center, dynamic, 'dynamic') });
        });
      }
      for (const token of items) for (const { at, words, extension } of textAnchors(token)) {
        if (!words.text) continue;
        const x = relative(at, lane.id);
        const pick = textPick(token, 'text', extension);
        const size = measured(words.text, 'expression', appearance(pick)?.text);
        const half = size.width / 2;
        const baseline = localCeiling(offset(lane, at) - 7, x - half, x + half, obstacles) - 4;
        interactive += placed(pick, formatted(pick, x, baseline, words.text, 'expression'),
          { left: x - half, right: x + half, top: baseline - size.ascent, bottom: baseline + size.descent }).drawing;
      }
      for (const token of items) for (const { at, words, extension } of textAnchors(token)) {
        if (!words.rehearsal) continue;
        const x = relative(at, lane.id);
        const pick = textPick(token, 'rehearsal', extension);
        const size = measured(words.rehearsal, 'expression', appearance(pick)?.text);
        const half = Math.max(8, size.width / 2 + 4);
        const ascent = Math.max(13, size.ascent + 2);
        const baseline = localCeiling(offset(lane, at) - 7, x - half, x + half, obstacles) - 7;
        interactive += placed(pick,
          `<rect class="rehearsal-box" x="${x - half}" y="${baseline - ascent}" width="${half * 2}" height="${ascent + 4}"/>` +
          formatted(pick, x, baseline, words.rehearsal, 'expression'),
          { left: x - half, right: x + half, top: baseline - ascent, bottom: baseline + 4 }).drawing;
      }
      for (const link of wedges) {
        const from = link.fromAt ?? link.from.at;
        const to = link.toAt ?? link.to.at;
        const head = from >= start;
        // An explicit end at a barline belongs to the closing measure, even at a system break.
        const stopEdge = link.toAt === undefined ? undefined : measureEndEdges.get(to) ??
          [...measureEndEdges].find(([at]) => Math.abs(to - at) <= 2e-8)?.[1];
        if (to <= start + 2e-8) continue;
        const tail = stopEdge !== undefined || to < end;
        const baseLeft = head ? relative(from, lane.id) + 3 + (dynamicWidths.get(from) ?? 0) : LEFT + 3;
        const baseRight = stopEdge !== undefined ? stopEdge - 2 :
          tail ? relative(to, lane.id) - 2 - (dynamicWidths.get(to) ?? 0) : rightEdge - 3;
        if (baseRight <= baseLeft) continue;
        const element = linkOf(link);
        const dynamicText = link.source === undefined ? undefined : score.spans[link.source].dynamicText;
        const p = placement(element);
        let [left, right] = lineEnds(baseLeft, baseRight, head, tail, p, 9);
        const dx = clamp(p.x ?? 0, marginLeft - left, rightEdge - right);
        left += dx;
        right += dx;
        const opening = (at: number) => {
          const fraction = clamp((at - from) / (to - from), 0, 1);
          return 4.5 * (link.kind === 'crescendo' ? fraction : 1 - fraction);
        };
        const caption = head ? dynamicText ?? '' : '';
        const size = measured(caption, 'dynamic');
        const first = dynamicText === undefined ? Math.max(!head && link.kind === 'diminuendo' ? engraving.continuation / 2 : 0, opening(head ? from : start)) : 0;
        const last = dynamicText === undefined ? Math.max(!tail && link.kind === 'crescendo' ? engraving.continuation / 2 : 0, opening(tail ? to : end)) : 0;
        const manual = !!(p.x || p.y);
        const automatic = offset(lane, Math.max(start, from)) - 13;
        const spot = manual && !p.spaced ? automatic + 3 : automatic;
        const related = obstacles.filter(box => {
          const entry = tupletInk.get(box);
          if (!entry) return true;
          const inside = (at: number) => at > entry.first.at && at < lastAnchor(entry);
          const outside = (at: number) => at < entry.first.at || at > lastAnchor(entry);
          return !internalWedge(link, entry) && !(inside(from) && outside(to) || inside(to) && outside(from));
        });
        const autoShift = !manual || p.spaced ? wedgeClearance(spot, left, right, first, last, related, undefined, 5) : 0;
        const center = spot + (manual ? wedgeClearance(spot, left, right, first, last, related, autoShift + (p.y ?? 0), .5) : autoShift);
        const half = dynamicText === undefined ? Math.max(first, last) : caption ? (size.ascent + size.descent) / 2 : .6;
        const box = { left, right: Math.max(right, left + size.width), top: center - half, bottom: center + half };
        const draw = (y: number) => {
          const handles = picked(element) ? (head ? makeHandle('from', left, y) : '') + (tail ? makeHandle('to', right, y) : '') : '';
          if (dynamicText !== undefined) {
            const dashStart = left + (caption ? size.width + 4 : 0);
            return (caption ? formatted(element, left, y + (size.ascent - size.descent) / 2, caption, 'dynamic', 'start') : '') +
              (dashStart < right ? line(dashStart, y, right, y, 'tempo-dashes') + line(dashStart, y, right, y, 'line-hit') : '') + handles;
          }
          const geometry = `M${left} ${y - first}L${right} ${y - last}M${left} ${y + first}L${right} ${y + last}`;
          return path(geometry, 'wedge') + path(geometry, 'line-hit') + handles;
        };
        dynamics.push({ element, from: head ? from : undefined, to: tail ? to : undefined, center, box, draw,
          provisional: occupies(element) ? box : undefined });
        if (occupies(element)) {
          obstacles.push(box);
          innerRoofs.push({ from, to, top: box.top });
        }
        laidWedges.add(link);
      }
      for (const entry of tuplets) emitTuplet(entry);
      for (const symbol of score.chordSymbols ?? []) if (symbol.lane === lane.id && symbol.at >= start && symbol.at < end) {
        const element = { kind: 'chord-symbol', id: symbol.id } as const;
        const value = symbol.text;
        const { width, ascent, descent } = measured(value, 'expression', appearance(element)?.text);
        const x = clamp(relative(symbol.at, lane.id) - width / 2, LEFT, rightEdge - width);
        const y = localCeiling(offset(lane, symbol.at) - 13, x, x + width, obstacles) - 4 - descent;
        interactive += placed(element, formatted(element, x, y, value, 'chord-symbol', 'start'),
          { left: x, right: x + width, top: y - ascent, bottom: y + descent }).drawing;
      }
      if (lane === active[0]) {
        for (const bar of group) for (const mark of score.measures[bar.index].route ?? []) {
          const element = { kind: 'route', id: mark.id, index: bar.index } as const;
          const head = routeAtStart(mark);
          const at = head ? bar.start : bar.end;
          const caption = head ? (mark.kind === 'segno' ? '𝄋' : '𝄌') + (mark.target === '1' ? '' : ' ' + mark.target) : routeCaption(mark);
          const { width, ascent, descent } = measured(caption, 'expression', appearance(element)?.text);
          const x = clamp(head ? barEdge(bar.index) + 4 : barEdge(bar.index + 1) - width - 4, LEFT, rightEdge - width);
          const y = localCeiling(offset(lane, head ? at : at - .01) - 16, x, x + width, obstacles) - 5 - descent;
          interactive += placed(element, formatted(element, x, y, caption, 'route-mark', 'start'),
            { left: x, right: x + width, top: y - ascent, bottom: y + descent }).drawing;
        }
        const fermatas = group.map((measure, i) => ({ index: measure.index + 1, x: boundaries[i], at: measure.end }));
        if (!group[0].index && startsRepeat(boundaryAt(score, 0).style)) fermatas.unshift({ index: 0, x: LEFT, at: start });
        for (const { index, x, at } of fermatas) if (boundaryAt(score, index).fermata) articulations.push(() => {
          const y = localCeiling(offset(lane, at, true) - 13, x - 7, x + 7, obstacles) - 5;
          interactive += placed({ kind: 'bar-fermata', index }, fermataShape(x, y), { left: x - 7, right: x + 7, top: y - 7, bottom: y + .5 },
            pageWidth, undefined, undefined, true).drawing;
        });
        for (const mark of score.tempoMarks ?? []) if (mark.at && mark.at >= start && mark.at < end) {
          const element = { kind: 'tempo-mark', id: mark.id } as const;
          const value = tempoLabel(mark);
          const { width, ascent, descent } = measured(value, 'expression', appearance(element)?.text);
          const x = clamp(relative(mark.at) - 2, LEFT, rightEdge - width);
          const y = localCeiling(offset(lane, mark.at) - 13, x, x + width, obstacles) - 5 - descent;
          interactive += placed(element, formatted(element, x, y, value, 'tempo-text', 'start'),
            { left: x, right: x + width, top: y - ascent, bottom: y + descent }).drawing;
        }
      }
        for (const { line: tempo, to } of tempoLines) if ((tempo.lane ? tempo.lane === lane.id : lane === active[0]) && tempo.from < end && to > start) {
          const element = { kind: 'tempo-line', id: tempo.id } as const;
          const p = placement(element);
          const head = tempo.from >= start, tail = to <= end;
          const caption = head ? tempo.label || tempo.kind : '';
          const { width, ascent, descent } = measured(caption, 'expression', appearance(element)?.text);
          const fromX = head ? relative(tempo.from) - 1 : LEFT + 2;
          const toX = tail ? measureEdges.get(to) ?? relative(to) : rightEdge - 2;
          let [left, right] = lineEnds(fromX, toX, head, tail, p, 5);
          const dx = clamp(p.x ?? 0, marginLeft - left, rightEdge - Math.max(left + width, right));
          left += dx; right += dx;
          const labelRight = left + width;
          const dashStart = head ? labelRight + 4 : left;
          const dash = right > dashStart + 1;
          const layoutDash = dash && tempo.dashLayout !== false;
          const base = offset(lane, Math.max(start, tempo.from)) - 14;
          const ceiling = localCeiling(base, left, Math.max(labelRight, layoutDash ? right : left), obstacles);
          const height = Math.max(caption ? descent : 0, layoutDash ? .6 : 0);
          const wanted = ceiling - height - 5 + (p.y ?? 0);
          const related = obstacles.filter(box => intersectsX(box, left, Math.max(labelRight, layoutDash ? right : left)));
          const y = legalY(wanted, related.map(box => [box.top - height - .6, box.bottom + Math.max(ascent, 2) + .6]));
          let shape = caption ? formatted(element, left, y, caption, 'tempo-text', 'start') : '';
          if (dash) shape += `<g${tempo.dashVisible === false ? ' class="score-invisible"' : ''}>${line(dashStart, y - 2, right, y - 2, 'tempo-dashes')}${line(dashStart, y - 2, right, y - 2, 'line-hit')}</g>`;
          if (picked(element)) shape += (head ? makeHandle('from', left, y - 2) : '') + (tail ? makeHandle('to', right, y - 2) : '');
          if (occupies(element)) {
            if (caption) reserve(left, labelRight, y - ascent, y + descent);
            if (layoutDash) reserve(dashStart, right, y - 2.6, y - 1.4);
          }
          interactive += label(element, shape);
        }
      for (const draw of articulations) draw();
      for (const prepare of prepareDynamics) prepare();
      const ranks = new Map<number, number>();
      let currentRank = -1;
      for (const [i, token] of items.entries()) {
        if (token.note.id !== items[i - 1]?.note.id) currentRank++;
        ranks.set(token.at, currentRank);
      }
      const rank = (at: number) => ranks.get(at) ?? ranks.get(items.find(token => token.at <= at && at < token.at + token.length)?.at ?? -1) ?? -1;
      const eligible = dynamics.filter(item => {
        const flags = appearance(item.element);
        return flags?.alignDynamics !== false && flags?.visible !== false && flags?.layout !== false;
      });
      const groups = new Map(dynamics.map(item => [item, new Set([item])]));
      for (const a of eligible) for (const b of eligible) {
        if (a === b || a.to === undefined || b.from === undefined || b.from < a.to) continue;
        const last = rank(a.to), next = rank(b.from);
        if (a.to !== b.from && (last < 0 || next < last || next > last + 1)) continue;
        const group = groups.get(a)!;
        if (group === groups.get(b)) continue;
        for (const member of groups.get(b)!) { group.add(member); groups.set(member, group); }
      }
      const provisional = new Set(dynamics.flatMap(item => item.provisional ? [item.provisional] : []));
      const printed = new Set<typeof dynamics[number]>();
      for (const item of dynamics) {
        if (printed.has(item)) continue;
        const group = [...groups.get(item)!];
        const shared = group.length > 1;
        const id = shared ? `${lane.id}:${start}:${dynamics.indexOf(item)}` : '';
        const ceiling = (member: typeof item) => obstacles.reduce((y, box) =>
          !provisional.has(box) && intersectsX(box, member.box.left, member.box.right) ?
            Math.min(y, box.top - (member.box.bottom - member.center) - 1.5) : y, member.center);
        const textLine = item.element.kind === 'span' && score.spans[item.element.index]?.dynamicText !== undefined;
        const center = shared || textLine ? Math.min(...group.map(ceiling)) : item.center;
        for (const member of group) {
          printed.add(member);
          const shape = member.draw(center);
          interactive += label(member.element, shared ? `<g data-dynamic-group="${escape(id)}">${shape}</g>` : shape);
          if (occupies(member.element)) obstacles.push(offsetBox(member.box, 0, center - member.center));
        }
      }
      if (input && cursor.lane === lane.id) {
        const token = items.find(item => item.at === cursor.at);
        if (token) {
          const y = offset(lane, token.at);
          const x = Math.min(relative(token.at, lane.id) - 10, ...glyphMap.get(token)!.filter(glyph => signAt(token, glyph.index))
            .map(glyph => {
              const ink = accidentalInk(token, glyph.pitch, digitHalf);
              return relative(token.at, lane.id) - 2 - ink.gap - ink.width + (placement(markOf(token, 'accidental', undefined, glyph.index)).x ?? 0);
            }));
          drawing += line(Math.max(LEFT + 1, x), y - 14, Math.max(LEFT + 1, x),
            y + (glyphMap.get(token)!.at(-1)?.y ?? 0) + 12, 'input-cursor');
        }
      }
      const obstacleBottom = Math.max(-Infinity, ...obstacles.map(box => box.bottom));
      if (obstacleBottom > lowest) { lowest = obstacleBottom; lyricWeight = 0; }
      const highest = Math.min(lane.parent ? -17 : -13, ...obstacles.map(box => box.top));
      if (voiceRows.length) {
        rowStart += spacing.voice;
        weight += spacing.voice;
      }
      const baseline = rowStart - highest;
      let highlights = '';
      for (const [index, measure] of group.entries()) {
        const style = Object.hasOwn(measure.highlights ?? {}, lane.id) ? measure.highlights![lane.id] : undefined;
        if (!style || measure.end <= minTick || measure.start >= maxTick) continue;
        const from = Math.max(measure.start, minTick), to = Math.min(measure.end, maxTick);
        const cuts = [...new Set([from, to, ...(groupLanes.get(lane.id) ?? []).flatMap(child => [child.start!, child.end!])])]
          .filter(at => at >= from && at <= to).sort((a, b) => a - b);
        for (let part = 1; part < cuts.length; part++) {
          const first = cuts[part - 1], last = cuts[part];
          const x = first === measure.start ? bars[index] : relative(first) - digitHalf - 2;
          const right = last === measure.end ? bars[index + 1] : relative(last) - digitHalf - 2;
          const y = offset(lane, first);
          if (right > x) highlights += `<rect class="measure-highlight" data-highlight-lane="${escape(lane.id)}" data-highlight-measure="${measure.index}" x="${x + 1}" y="${y - 13}" width="${Math.max(0, right - x - 2)}" height="25" rx="2" fill="${escape(style.color)}" fill-opacity="${style.opacity / 100}"/>`;
        }
      }
      const ink = [...obstacles];
      for (const slice of bandsFor(lane)) if (slice.lanes.includes(lane)) {
        const dy = offset(lane, slice.start);
        ink.push({ left: bandEdge(slice.start), right: bandEdge(slice.end), top: dy - 13, bottom: dy + (lane.parent ? 14.5 : 10) });
      }
      voiceRows.push({ lane, baseline, weight, drawing: drawing + interactive, lyrics, highlights, ink });
      rowStart = baseline + lowest;
      weight += lyricWeight;
    }
    const inkByLane = new Map(voiceRows.map(row => [row.lane.id, row.ink]));
    if (!local && hasDivisi) {
      const offsets: DivisiOffsets = new Map();
      for (const slices of bands.values()) for (const slice of slices) {
        const baseline = [0];
        const left = bandEdge(slice.start), right = bandEdge(slice.end);
        for (let index = 1; index < slice.lanes.length; index++) {
          const upper = inkByLane.get(slice.lanes[index - 1].id)!;
          const lower = inkByLane.get(slice.lanes[index].id)!;
          const clearance = verticalClearance(upper, lower, left, right);
          baseline.push(baseline[index - 1] + Math.max(23, clearance) + spacing.voice);
        }
        const middle = baseline.at(-1)! / 2;
        offsets.set(slice, new Map(slice.lanes.map((lane, index) => [lane.id, baseline[index] - middle])));
      }
      return drawSystem(group, spacing, marginLeft, LEFT, rightEdge, shown, { bands, offsets });
    }
    if (local) {
      rowStart = endingBottom + 4;
      weight = 0;
      let above: { ink: InkBox[]; baseline: number } | undefined;
      for (const [index, parent] of mainLanes.entries()) {
        const members = voiceRows.filter(row => row.lane === parent || row.lane.parent === parent.id);
        const ink = members.flatMap(row => row.ink);
        const top = Math.min(...ink.map(box => box.top));
        const bottom = Math.max(...ink.map(box => box.bottom));
        const baseline = above ? above.baseline + Math.max(23, verticalClearance(above.ink, ink, marginLeft, rightEdge)) + spacing.voice
          : endingBottom + 4 - top;
        for (const row of members) {
          row.baseline = baseline;
          row.weight = index * spacing.voice;
        }
        rowStart = Math.max(rowStart, baseline + bottom);
        weight = index * spacing.voice;
        above = { ink, baseline };
      }
    }
    const rootRows = mainLanes.map(root => voiceRows.filter(row => parentId(row.lane) === root.id));
    const topRows = rootRows[0];
    const staffEdges = (extra: number) => rootRows.map(([row], i) => {
      const base = row.baseline + row.weight * extra;
      const band = bandAt(mainLanes[i], start);
      const offsets = local?.offsets.get(band);
      const positions = band.lanes.map(lane => offsets?.get(lane.id) ?? 0);
      return { top: base + Math.min(0, ...positions) - 13, bottom: base + Math.max(0, ...positions) + 10, center: base };
    });
    const staffBrackets = (edges: ReturnType<typeof staffEdges>) => {
      const profiles = shown.projected.map(bracket => {
        const pick = { kind: 'staff-bracket', id: bracket.item.id, first: group[0].index, last: group.at(-1)!.index } as const;
        return { pick, type: bracket.item.type, y1: edges[bracket.top].top, y2: edges[bracket.bottom].bottom,
          offset: clamp(placement(pick).x ?? 0, -3, 3), layout: occupies(pick) };
      });
      const xs = bracketPositions(profiles);
      return profiles.map((profile, i) => ({ ...profile, x: LEFT + xs[i] }));
    };
    const bracketInk = (brackets: ReturnType<typeof staffBrackets>): InkBox[] => brackets.flatMap(({ pick, type, x, y1, y2 }) => {
      if (type !== 'bracket' || !occupies(pick)) return [];
      const right = x + CHORAL_BRACKET_FLARE.width;
      return [{ left: x, right, top: y1 - CHORAL_BRACKET_FLARE.height, bottom: y1 + .5 },
        { left: x, right, top: y2 - .5, bottom: y2 + CHORAL_BRACKET_FLARE.height }];
    });
    const initialBracketInk = bracketInk(staffBrackets(staffEdges(0)));
    rowStart = Math.max(rowStart, ...initialBracketInk.map(box => box.bottom));
    const numbers = (extra: number, brackets: InkBox[]) => {
      const ink = [...systemInk, ...brackets, ...voiceRows.flatMap(row => row.ink.map(box => offsetBox(box, 0, row.baseline + row.weight * extra)))];
      return group.flatMap((measure, i) => {
        if (!numbered[i]) return [];
        const pick = { kind: 'measure-number', index: measure.index } as const;
        const p = placement(pick);
        const label = String(measure.number);
        const { width, ascent, descent } = measured(label, 'measureNumber');
        const x = clamp(bars[i] + (p.x ?? 0), marginLeft, rightEdge - width);
        const nearest = topRows.flatMap(row => row.ink.filter(box => intersectsX(box, x - 2, x + width + 2))
          .map(box => box.top + row.baseline + row.weight * extra));
        const reference = Math.min(topRows[0].baseline - 13, ...nearest);
        const related = ink.filter(box => intersectsX(box, x - 2, x + width + 2));
        const automatic = Math.min(reference, ...related.map(box => box.top)) - 3 - descent;
        const y = p.y ? legalY(Math.min(rowStart - descent, automatic + p.y),
          related.map(box => [box.top - descent - 2, box.bottom + ascent + 2])) : automatic;
        if (occupies(pick)) ink.push({ left: x, right: x + width, top: y - ascent, bottom: y + descent });
        return [{ inkTop: occupies(pick) ? y - ascent : 0, drawing: wrap(pick, text(x, y, label, 'measure-number', 'start'),
          !input && selection?.kind === 'measure-number' && selection.index === measure.index) }];
      });
    };
    const inset = Math.max(0, ...initialBracketInk.map(box => 2 - box.top), ...numbers(0, initialBracketInk).map(number => 2 - number.inkTop));
    const draw = (top: number, extra: number): string => {
      const height = rowStart + weight * extra;
      const baselines = new Map(voiceRows.map(row => [row.lane.id, row.baseline + row.weight * extra]));
      const playback = group.map((measure, index) => {
        const left = boundaries[index - 1] ?? LEFT;
        return `<rect class="play-measure" data-play-measure="${measure.index}" hidden="" x="${left}" y="12" width="${boundaries[index] - left}" height="${Math.max(0, height - 12)}"/>`;
      }).join('');
      const rows = voiceRows.map(row => {
        const lyrics = [...row.lyrics].map(([weight, drawing]) =>
          extra && !local ? `<g transform="translate(0 ${weight * extra})">${drawing}</g>` : drawing).join('');
        return `<g class="voice-row" transform="translate(0 ${baselines.get(row.lane.id)})" data-lane="${escape(row.lane.id)}">${row.drawing}${lyrics}</g>`;
      }).join('');
      const highlights = voiceRows.map(row => shift(row.highlights, 0, baselines.get(row.lane.id))).join('');
      const edges = staffEdges(extra);
      const brackets = staffBrackets(edges);
      const metadata = `data-system-first="${group[0].index}" data-system-last="${group.at(-1)!.index}"`;
      const guide = { kind: 'staff-guide', index: group[0].index } as const;
      let brace = mainLanes.length > 1 ? wrap(guide,
        line(LEFT - 2, edges[0].top, LEFT - 2, edges.at(-1)!.bottom, 'choral-bracket-guide') +
        line(LEFT - 2, edges[0].top, LEFT - 2, edges.at(-1)!.bottom, 'line-hit'),
        selection?.kind === 'staff-guide' && selection.index === guide.index) : '';
      brace += edges.map((edge, i) => `<circle data-staff-target="${escape(mainLanes[i].id)}" cx="${LEFT - 2}" cy="${edge.center}" r="0"/>`).join('');
      for (const { pick, type, x, y1, y2 } of brackets) {
        const selected = !input && selection?.kind === 'staff-bracket' && appearanceKey(selection) === appearanceKey(pick);
        const middle = (y1 + y2) / 2;
        const shape = type === 'brace' ? path(curlyBrace(x, y1, middle, y2, 1, 2.3), 'solid staff-brace')
          : type === 'square' ? path(`M${x + 5} ${y1}H${x}V${y2}H${x + 5}`, 'staff-square')
          : path(choralBracket(x, y1, y2), 'solid choral-bracket');
        const handles = selected ? ['top', 'bottom'].map((edge, i) =>
          `<rect class="span-handle staff-handle" data-staff-end="${edge}" x="${x - 3.5}" y="${(i ? y2 : y1) - 3.5}" width="7" height="7" rx="1"/>`).join('') : '';
        brace += wrap(pick, shape + line(x, y1, x, y2, 'line-hit') + handles, selected);
      }
      for (const parent of mainLanes) {
        const subsets = voiceRows.filter(row => row.lane.parent === parent.id);
        const endpoints = new Set(subsets.flatMap(({ lane }) => [lane.start!, lane.end!]).filter(at => at >= start && at <= end));
        for (const at of endpoints) for (const side of ['start', 'end'] as const) {
          const relevant = subsets.filter(row => row.lane[side] === at);
          if (!relevant.length || side === 'start' && at === end || side === 'end' && at === start) continue;
          const slice = bandAt(parent, at, side === 'end');
          const centers = slice.lanes.map(lane => baselines.get(lane.id)! + (local?.offsets.get(slice)?.get(lane.id) ?? 0));
          if (centers.length < 2) continue;
          const middle = (Math.max(...centers) + Math.min(...centers)) / 2;
          const half = (Math.max(...centers) - Math.min(...centers)) / 2 + 12;
          const top = middle - half, bottom = middle + half;
          const d = side === 'start' ? 1 : -1;
          const element = { kind: 'divisi-brace', lane: parent.id, at, side } as const;
          const position = divisiPositions.get(appearanceKey(element));
          if (!position) continue;
          const { x, min, max } = position;
          const geometry = curlyBrace(x, top, middle, bottom, d, engraving.divisi);
          const shape = `<g data-brace-move="" data-brace-x="${x}" data-limits="${min},${max}">${path(geometry, 'divisi-bracket')}${line(x, top, x, bottom, 'line-hit')}</g>`;
          brace += wrap(element, shape, !input && !!selection && appearanceKey(selection) === appearanceKey(element));
        }
      }
      const columns = [...columnLimits].map(([at, limits]) => `<g data-column-move="${escape(at)}" data-limits="${limits}"/>`).join('');
      const anchors = new Map([[start, LEFT], [end, rightEdge]]);
      for (const [at, x] of positions) anchors.set(at, Math.max(LEFT, x - digitHalf - 2));
      const marks = escape(JSON.stringify([...anchors].sort(([a], [b]) => a - b)));
      const playhead = `<line class="playhead" hidden="" data-play-anchors="${marks}" x1="0" x2="0" y1="${edges[0].top - 3}" y2="${edges.at(-1)!.bottom + 3}"/>`;
      return `<g class="score-system" ${metadata} data-system-visible="${escape(JSON.stringify([...shown.visible]))}" data-system-conflicts="${shown.conflicts.length}" data-system-fallback="${escape(shown.voice.fallback?.id ?? '')}" data-system-inset="${inset}" transform="translate(0 ${top})"><g transform="translate(0 ${inset})">${columns}${highlights}${playback}${systemDrawing}${numbers(extra, bracketInk(brackets)).map(item => item.drawing).join('')}${rows}${brace}${playhead}</g></g>`;
    };
    return { height: rowStart + inset, weight, draw, warnings };
  }

  const content: string[] = [];
  for (let index = 0; index < measures.length;) {
    const number = content.length + 1;
    const { spacing, justifyBottom } = pageLayout(score, number);
    const marginLeft = spacing.marginLeft / scale;
    const right = pageWidth - spacing.marginRight / scale;
    const marginTop = spacing.marginTop / scale;
    const marginBottom = spacing.marginBottom / scale;
    const displayFolio = score.folio !== false && (number > 1 || score.folio?.first !== false);
    const topFolio = score.folio && score.folio.position === 'top';
    const copyright = { kind: 'header', field: 'copyright' } as const;
    const copyrightSpace = number === 1 && score.copyright && occupies(copyright) ? Math.max(18, style.credit.size + 7) : 0;
    const bottom = pageHeight - Math.max(displayFolio && !topFolio ? 24 : 14, marginBottom) - copyrightSpace;
    const contentTop = Math.max(marginTop, displayFolio && topFolio ? 24 : 0);
    const heading = number === 1 ? pageHeading(contentTop, marginLeft, right) : undefined;
    const start = heading?.bottom ?? contentTop;
    const leading = heading ? 13 : 0;
    const systems: { layout: ReturnType<typeof drawSystem>; top: number; weight: number }[] = [];
    let used = start;
    let weight = 0;
    while (index < measures.length) {
      if (systems.length && boundaryAt(score, index).break === 'page') break;
      const { group, shown, left, overflow, overfull } = systemAt(index, spacing, marginLeft, right);
      const layout = drawSystem(group, spacing, marginLeft, left, right, shown);
      const gap = systems.length ? spacing.system : leading;
      const top = used + gap;
      if (top + layout.height > bottom && (systems.length || heading)) break;
      if (top + layout.height > bottom) warnings.add('某系统超过一页可印高度，请减少同屏声部或调整断行。');
      for (const issue of layout.warnings) warnings.add(issue);
      if (overfull && group.length > 1) warnings.add(`锁定谱行超出可用页宽（小节 ${group[0].index + 1}–${group.at(-1)!.index + 1}），已压缩排版。`);
      systems.push({ layout, top, weight: weight + gap });
      for (const lane of shown.names) if (printed(nameAt(lane, group[0].start))) seenNames.add(lane.id);
      previousSolo = shown.roots.length === 1 ? shown.roots[0].id : undefined;
      used = top + layout.height;
      weight += gap + layout.weight;
      index += group.length;
      if (overflow) restartFrom = index;
    }
    const slack = justifyBottom ? Math.max(0, bottom - used) : 0;
    const extra = weight ? slack / weight : 0;
    const shift = weight ? 0 : slack;
    const drawing = (heading?.drawing ?? '') + systems.map(system =>
      system.layout.draw(system.top + system.weight * extra + shift, extra)).join('');
    const outside = score.folio && score.folio.align === 'outside';
    const pageNumber = number + ((score.folio && score.folio.start) || 1) - 1;
    const rightSide = pageNumber % 2 === 1;
    const x = outside ? rightSide ? Math.min(right, pageWidth - 6) : Math.max(6, marginLeft) : pageWidth / 2;
    const folioY = topFolio ? Math.max(13, marginTop / 2 + 4) : pageHeight - Math.max(6, marginBottom / 2 - 4);
    const folio = displayFolio ? text(x, folioY, String(pageNumber), 'folio',
      outside ? rightSide ? 'end' : 'start' : 'middle') : '';
    const credit = number === 1 && score.copyright ? wrap(copyright,
      formatted(copyright, (marginLeft + right) / 2 + (placement(copyright).x ?? 0), bottom + 16 + (placement(copyright).y ?? 0), score.copyright, 'credit'),
      selection?.kind === 'header' && selection.field === 'copyright') : '';
    content.push(drawing + credit + folio);
  }
  const pages = content.map((drawing, index) => {
    return `<svg class="sheet" viewBox="0 0 ${paper.pixelWidth} ${paper.pixelHeight}" xmlns="http://www.w3.org/2000/svg" data-page="${index + 1}" aria-label="第 ${index + 1} 页">${scale === 1 ? drawing : `<g class="score-scale" transform="scale(${scale})">${drawing}</g>`}</svg>`;
  }).join('');
  return { pages, warnings: [...warnings], count: content.length };
}

function widthOf(text: string) {
  return Array.from(text).reduce((sum, char) => sum + (/[^\x00-\x7F]/.test(char) ? 14 : 8), 0);
}

function lyricExtensions(prepared: ReturnType<typeof notation>) {
  const result = new Map<string, { id: string; at: number; end: number; text: string; verse: number; beforeText?: string }[]>();
  for (const [lane, tokens] of prepared.byLane) {
    const active = new Map<number, NonNullable<ReturnType<typeof result.get>>[number]>();
    const spans: NonNullable<ReturnType<typeof result.get>> = [];
    for (const token of tokens) if (!token.continuation) for (const verse of noteVerses(token.note)) {
      const previous = active.get(verse.number);
      if (verse.text && previous && verse.extend !== 'stop' && verse.extend !== 'continue') {
        if (previous.end === token.at) previous.beforeText = verse.text;
        active.delete(verse.number);
      }
      if (verse.extend === 'start') {
        const extension = { id: token.note.id, at: token.at, end: token.note.at + token.note.length, text: verse.text ?? '', verse: verse.number };
        active.set(verse.number, extension);
        spans.push(extension);
      } else if (previous && verse.extend) {
        previous.end = token.note.at + token.note.length;
        if (verse.extend === 'stop') active.delete(verse.number);
      }
    }
    result.set(lane, spans);
  }
  return result;
}
