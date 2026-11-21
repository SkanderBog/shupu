import { alignmentOf, appearanceKey, appearanceOf, engrave, rhythmPick, titleSignature } from './engrave.js';
import { DYNAMIC_STEPS } from './score.js';
import type { DynamicStep } from './score.js';
import type { LineRule } from './line-layout.js';
import { parseChord } from './chord-symbol.js';
import { routeAtStart, routeCaption, routeIssues } from './roadmap.js';
import { doubleSharpPath } from './accidental-outline.js';
import type { RouteKind, RouteMark } from './roadmap.js';
import { capturePartPresentation, editablePart, ensurePartAnchors, independentPart, mergePartEdit, partScore } from './linked-parts.js';
import type { LinkedPart } from './linked-parts.js';
import type { ElementSelection } from './engrave.js';
import type { GraceCaret } from './engrave.js';
import { beamMode, displayedDuration, editInAccidentalOrder, notation, pitchInMeasure, pitchOrder, rhythmAlignment } from './notation.js';
import { ORNAMENT_KINDS, ORNAMENT_LABELS } from './score.js';
import { mergeVoices, splitChords } from './voice-conversion.js';
import { packPages, pageRange, rasterPage } from './sheet-output.js';
import { DEFAULT_FOLIO, paperSize, tiedPitchEditor } from './score.js';
import type { Ornament, OrnamentKind } from './score.js';
import type { Token } from './notation.js';
import { distributeLyrics, graphemes, lyricGroups, lyricPlainText, lyricStops, lyricValue } from './lyric-input.js';
import { barLabels, beamLabels, meterPresets, mountResizablePanels, mountWorkbench, noteLineIcon, symbolGroups } from './workbench.js';
import type { Command } from './workbench.js';
import { accidentalSlots, lowerOctaveSlots, mountShortcuts, shortcutKeys, specialShortcuts, tupletDigitSlots, wheelShortcut } from './shortcuts.js';
import type { Shortcut, ShortcutScope } from './shortcuts.js';
import { mountHelpPages } from './help-pages.js';
import { exampleScore } from './sample.js';
import { importMusicXML, readMusicFile } from './musicxml.js';
import { exportMusicXML } from './musicxml-export.js';
import type { ImportResult } from './musicxml.js';
import { arrangePlayback, metronome, Player, preCount, repeatIntervals, scoreTones } from './playback.js';
import type { MixChannel } from './playback.js';
import { defaultTempoPercent, isSwing, placeTempoLine, RHYTHM_TEMPO, scoreTempoAt, setTempoLinePlayback, tempoClock, tempoLabel, TEMPO_GLYPHS, TEMPO_PRESETS } from './tempo.js';
import { createTuplet, ENGRAVING_LIMITS, isExtensionText, respellNote, sliceExtensionText, TEMPO_LINE_KINDS, TEMPO_UNITS, tick, tickEnd, tupletAt, tupletScale, tupletUnit } from './score.js';
import type { RhythmAlignment, Tuplet } from './score.js';
import type { GraceNote, GraceSide } from './score.js';
import type { CurveHandle, TempoLine, TempoLineKind, TempoMark } from './score.js';
import { addSideLane, BAR_STYLES, BEAM_MODES, boundaryAt, DEFAULT_SPACING, editTiedPitch, endingRange, endsRepeat, isolateFragment, measureTable, moveSpanEnd, newScore, noteAt, noteVerses, openScore, pruneTies, QUARTER, resizeNote, setBoundaryBreak, setBoundaryStyle, setEndingRange, setSpanEnd, setSpanTime, sound, SPACING_LIMITS, toggleTemporaryVoiceSplit, deleteTemporaryVoiceInterval, mergeTemporaryVoices, startsRepeat, TONICS, tonicAt, uid, VALUES, writeNote } from './score.js';
import { beatStarts, BRACKET_TYPES, breathShape, defaultGroups, deleteMeasures, dotted, editTiedPitches, ENGRAVING_STYLE, eraseInterval, faceAfterEdit, insertBlankMeasure, insertCopiedNote, keyName, laneNameValue, meterLength, pageLayout, PAPER_WIDTH, pitchAtSound, removeLanes, sameKey, scoreBrackets, SCORE_SCALE_RANGE, setKeySignature, setMeasureLength, STYLE_ROLES, swapTemporaryVoices, systemBrackets, temporaryStack, textFontStack, TEXT_STYLES } from './score.js';
import type { BracketType, BreathShape, EngravingStyle, KeySignature, Lane, LaneDisplay, Measure, MeasureHighlight, Meter, NumberDisplay, StaffBracket, StyleRole, Verse, Appearance, BarStyle, BeamMode, Boundary, Cursor, Ending, LyricFlow, Note, PageLayout, Pitch, Placement, Score, Span, Spacing, TextFace, TextFormat } from './score.js';

const get = <ElementType extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as ElementType;
const field = (id: string) => get<HTMLInputElement>(id);
const button = (id: string) => get<HTMLButtonElement>(id);
const store = 'shupu-autorecovery-v1';
const workspaceStore = 'shupu-documents-v1';
const preferenceStore = 'shupu-preferences-v1';
const preferenceGroups = [
  ['录入与试听', [
    ['click', '点选音符时试听', true], ['navigate', '切换音符时试听', true],
    ['entry', '录入音符时试听', true], ['pitch', '修改音高时试听', true],
    ['clickChord', '点选叠音时试听整组', false], ['navigateChord', '切换到叠音时试听整组', true],
    ['seconds', '试听时长（秒）', .5, [.1, 3, .05]], ['volume', '试听音量（%）', 100, [0, 100, 1]]
  ]],
  ['启动与恢复', [
    ['startup', '启动时', 'restore', [['restore', '恢复上次卡片'], ['sample', '打开样谱'], ['blank', '显示空白工作台']]],
    ['recover', '保存自动恢复数据', true], ['recoveryDelay', '自动恢复保存间隔（秒，0 为随编辑保存）', 0, [0, 300, 1]]
  ]],
  ['视图', [
    ['view', '默认页面排列', 'spread', [['single', '单列'], ['spread', '并排'], ['horizontal', '横排']]],
    ['zoom', '默认缩放', 'fit', [['fit', '适应页面'], ...[25, 50, 75, 100, 125, 150, 200].map(n => [String(n), n + '%'] as const)]],
    ['follow', '播放时跟随光标', true], ['layoutMarks', '显示换行等辅助标记', true]
  ]],
  ['新建与导入', [
    ['preset', '默认声部预设', 'solo', [['solo','独唱／独奏'], ['duet','二重唱'], ['SA','SA'], ['TB','TB'], ['SATB','SATB'], ['piano','钢琴双声部']]],
    ['measures', '初始小节数', 32, [1, 600, 1]], ['beams', '保留 MusicXML 原符杠分组', false],
    ['reviewImport', '导入 MusicXML 前选择声部并查看提示', true]
  ]],
  ['导出', [
    ['format', '默认格式', 'pdf', [['pdf','PDF'], ['png','PNG'], ['svg','SVG'], ['musicxml','MusicXML']]],
    ['dpi', 'PNG 默认分辨率', '300', [['150','150 DPI'], ['300','300 DPI'], ['600','600 DPI']]],
    ['transparent', '默认透明背景', false], ['rememberFormat', '记住上次的导出格式', true]
  ]]
] as const;
type PreferenceField = typeof preferenceGroups[number][1][number];
type Preferences = { [F in PreferenceField as F[0]]: F[2] extends boolean ? boolean : F[2] extends number ? number : string };
const preferenceFields = preferenceGroups.flatMap<PreferenceField>(([, entries]) => entries);
const defaults = Object.fromEntries(preferenceFields.map(([key, , value]) => [key, value])) as Preferences;
const styleFields = ['spacing', 'justifyBottom', 'scalePercent', 'measureNumbers', 'textStyles', 'engravingStyle', 'paper', 'folio'] as const;
type DefaultStyle = Pick<Score, typeof styleFields[number]>;
type PreferenceData = Preferences & { defaultStyle?: DefaultStyle };
function preferenceValue(spec: PreferenceField, value: unknown) {
  const [, , fallback, options] = spec;
  if (typeof fallback === 'boolean') return typeof value === 'boolean' ? value : fallback;
  if (typeof fallback === 'number' && options && typeof value === 'number' && Number.isFinite(value)) {
    const [minimum, maximum] = options as readonly number[];
    const step = options[2];
    return value >= minimum && value <= maximum && (step !== 1 || Number.isInteger(value)) ? value : fallback;
  }
  if (typeof fallback === 'string' && options && (options as readonly (readonly [string, string])[]).some(([key]) => key === value)) return value;
  return fallback;
}
function parsePreferences(raw: string): PreferenceData {
  const document = JSON.parse(raw);
  if (document?.format !== 'shupu-preferences' || document.version !== 1 ||
      !document.values || typeof document.values !== 'object' || Array.isArray(document.values))
    throw Error('无法识别此数谱偏好设置文件。');
  const values = Object.fromEntries(preferenceFields.map(spec => [spec[0], preferenceValue(spec, document.values[spec[0]])])) as PreferenceData;
  if (document.values.defaultStyle) {
    const base = newScore();
    for (const key of styleFields) Object.assign(base, { [key]: document.values.defaultStyle[key] });
    const checked = openScore(JSON.stringify(base));
    values.defaultStyle = Object.fromEntries(styleFields.map(key => [key, checked[key]]));
  }
  return values;
}
const preferenceFile = (values: PreferenceData) => JSON.stringify({ format: 'shupu-preferences', version: 1, values }, null, 2);
let preferences: PreferenceData = { ...defaults };
try { preferences = parsePreferences(localStorage.getItem(preferenceStore) ?? ''); } catch {}
const defaultZoom = () => preferences.zoom === 'fit' ? 'fit' as const : Number(preferences.zoom);

function initialScore() {
  try {
    const recovery = localStorage.getItem(store) ?? localStorage.getItem('choral-jianpu-autorecovery-v1');
    if (recovery) return openScore(recovery);
  } catch {}
  return exampleScore();
}
type Checkpoint = { score: Score; cursor: Cursor; part?: string; value: number; dots: number; tuplets: Map<string, { value: number; dots: number }> };
type ScoreView = { cursor: Cursor; pick: ElementSelection | null; picks: ElementSelection[] | null; anchor: Cursor | null;
  signature: SignatureFocus | null; zoom: number | 'fit'; scrollTop: number; scrollLeft: number; unfocused: boolean; revision: number };
type ScoreDocument = {
  id: string; master: Score; baseline?: string; fileLabel?: string; saveKey?: string; partOrder: string[];
  views: Map<string, ScoreView>; undo: Checkpoint[]; redo: Checkpoint[]; mix: Map<string, MixChannel>; revision: number;
};
function makeDocument(master: Score, persisted = false, fileLabel?: string): ScoreDocument {
  if (master.linkedParts?.length) ensurePartAnchors(master);
  return { id: uid(), master, baseline: persisted ? JSON.stringify(master) : undefined, fileLabel,
    partOrder: [], views: new Map(), undo: [], redo: [], mix: new Map(), revision: 0 };
}
function restoreDocuments(): { items: ScoreDocument[]; active?: ScoreDocument; part?: string } {
  if (preferences.startup === 'blank') return { items: [] };
  if (preferences.startup === 'sample' || !preferences.recover) {
    const active = makeDocument(exampleScore(), true);
    return { items: [active], active };
  }
  try {
    const recovered = JSON.parse(localStorage.getItem(workspaceStore) ?? localStorage.getItem('choral-jianpu-documents-v1') ?? 'null');
    if (Array.isArray(recovered?.items)) {
      const items: ScoreDocument[] = recovered.items.slice(0, 50).flatMap((item: { id: string; master: Score; dirty: boolean; fileLabel?: string; partOrder?: string[] }) => {
        try {
          const doc = makeDocument(openScore(JSON.stringify(item.master)), !item.dirty, item.fileLabel);
          doc.id = item.id;
          doc.partOrder = item.partOrder?.filter(id => doc.master.linkedParts?.some(part => part.id === id)) ?? [];
          return [doc];
        } catch { return []; }
      });
      const active = items.find(item => item.id === recovered.active) ?? items[0];
      return { items, active, part: active?.partOrder.includes(recovered.part) ? recovered.part : undefined };
    }
  } catch {}
  const active = makeDocument(initialScore(), true);
  return { items: [active], active };
}
const restoredDocuments = restoreDocuments();
const documents = restoredDocuments.items;
let activeDocument = restoredDocuments.active ?? makeDocument(newScore(), true);
let activePart = restoredDocuments.part ?? '';
let score = activeDocument.master;
if (activePart) {
  try { score = documentScore(activeDocument, activePart); }
  catch { activePart = ''; }
}
let prepared = notation(score);
let cursor: Cursor = { lane: score.lanes.find(lane => !lane.parent)!.id, at: 0 };
let range: Cursor | null = null;
let rangeTip: Cursor | null = null;
let value: number = QUARTER;
let dots = 0;
const inputTuplets = new Map<string, { value: number; dots: number }>();
let tupletPrefix = false;
type GracePick = Extract<ElementSelection, { kind: 'grace' }>;
type GraceLinePick = Extract<ElementSelection, { kind: 'grace-line' }>;
let graceEdit: (GraceCaret & { value: number; dots: number; octave: number; accidental: number }) | undefined;
let octave = 0;
let accidental = 0;
let temporaryOctave = 0;
let inputSlur: { id: string; lane: string; at: number } | undefined;
let chord = false;
let input = false;
const pendingMarks = new Map<string, string>();
let selection: ElementSelection | null = null;
let selectedItems: ElementSelection[] | null = null;
type SignatureFocus = { index: number; kind: 'key' | 'meter' };
let signSelection: SignatureFocus | null = null;
let unfocused = false;
type LyricPosition = Cursor & { verse: number };
let lyricAnchor: LyricPosition | null = null;
let lyricFocus: LyricPosition | null = null;
let endpoint: 'from' | 'to' = 'to';
let pickedEndpoint: CurveHandle | undefined;
let verseNumber = 1;
let layoutPage = 0;
let systemFocus: number | undefined;
let systemLane: string | undefined;
let message = '单击编辑；双击谱面或按 N 开始输入。';
let undo = activeDocument.undo;
let redo = activeDocument.redo;
const signs = [0, 1, -1, 2, -2, 3];

let mix = activeDocument.mix;
let playbackMeasures = measureTable(score);
let playbackAttempt = 0;
let soloFocus = false;
let soloLanes: Set<string> | undefined;
type PlaybackSession = {
  plan: ReturnType<typeof arrangePlayback>; clock: ReturnType<typeof tempoClock>;
  songClock: ReturnType<typeof tempoClock>; songPlan: ReturnType<typeof arrangePlayback>;
  origin: number; returnSource: number; end: number; loop: boolean; scopeStart: number
};
let session: PlaybackSession | undefined;
let pausedAt: number | undefined;
let pendingStart: { at: number; focus: string } | undefined;
let playhead: SVGLineElement | undefined;
let playAnchors: [number, number][] = [];
let lastPlaybackTick: number | undefined;
const transportArt = {
  rewind: 'M5 5v14m14-14L8 12l11 7Z', play: 'M8 4l12 8-12 8Z', pause: 'M9 5v14m6-14v14',
  stop: 'M6 6h12v12H6Z', seek: 'M5 4h10M10 4v16m-5 0h8m2-10 7 4.5-7 4.5Z',
  mixer: 'M5 3v8m0 5v5m7-18v3m0 5v10m7-18v13m0 4v1M3 11h4v5H3Zm7-5h4v5h-4Zm7 10h4v4h-4Z',
  metronome: 'M8 4h7l5 16H4Zm1 12 9-10m-5 5 2 2',
  loop: 'M18 8H7a3 3 0 0 0-3 3m11-6 3 3-3 3M6 16h11a3 3 0 0 0 3-3m-11 0-3 3 3 3',
  settings: 'M9 3h4l.7 2.4 2 1.2 2.5-.5 2 3.3-1.7 1.8v2.3M9 3l-.7 2.4-2 1.2-2.5-.5-2 3.3 1.7 1.8v2.3l-1.7 1.8 2 3.3 2.5-.5 2 1.2.7 2.4h3m2-11A3 3 0 1 0 10 15m5-2 7 4-7 4Z'
};
function transportIcon(id: string, art: keyof typeof transportArt, label: string) {
  const control = get(id);
  if (control.dataset.icon !== art) control.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' +
    transportArt[art] + '" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  control.dataset.icon = art;
  control.title = label;
  control.setAttribute('aria-label', label);
}
function syncTransport() {
  transportIcon('play', player.active ? 'pause' : 'play', player.active ? '暂停（空格）' : '播放（空格）');
  transportIcon('stop', player.active ? 'stop' : 'seek', player.active ? '停止并回到起播位置（Tab）' : '将播放位置拨到焦点（Tab）');
}
function playheadAt(at?: number, arranged?: number) {
  const bar = !player.active || at === undefined ? undefined : playbackMeasures.find(bar => at >= bar.start && at < bar.end);
  const next = bar && get('score').querySelector<SVGLineElement>(`[data-play-measure="${bar.index}"]`)?.closest('.score-system')?.querySelector<SVGLineElement>('.playhead');
  const switched = next !== playhead || !playhead?.isConnected;
  if (switched) {
    playhead?.setAttribute('hidden', '');
    playhead = next || undefined;
    playAnchors = JSON.parse(playhead?.dataset.playAnchors ?? '[]');
  }
  if (!playhead || at === undefined || !playAnchors.length) return;
  const i = playAnchors.findIndex(([tick]) => tick > at);
  const left = playAnchors[Math.max(0, i < 0 ? playAnchors.length - 1 : i - 1)];
  const right = playAnchors[i] ?? left;
  let progress = right[0] === left[0] ? 0 : (at - left[0]) / (right[0] - left[0]);
  if (session && arranged !== undefined && right[0] > left[0]) {
    const offset = arranged - at;
    const duration = session.clock.secondsAt(right[0] + offset) - session.clock.secondsAt(left[0] + offset);
    if (duration > 0) progress = (session.clock.secondsAt(arranged) - session.clock.secondsAt(left[0] + offset)) / duration;
  }
  const x = left[1] + (Math.max(left[1], right[1]) - left[1]) * Math.max(0, Math.min(1, progress));
  playhead.setAttribute('x1', String(x));
  playhead.setAttribute('x2', String(x));
  playhead.removeAttribute('hidden');
  if (player.active && preferences.follow) {
    const desk = get('desk').getBoundingClientRect(), ink = playhead.getBoundingClientRect();
    if (ink.right < desk.left || ink.left > desk.right || switched && (ink.bottom > desk.bottom || ink.top < desk.top))
      playhead.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
function planTick(plan: ReturnType<typeof arrangePlayback>, source: number, near?: number) {
  const choices = plan.segments.flatMap(item => source >= item.start && source < item.end ? [item.at + source - item.start] : []);
  if (near === undefined || !choices.length) return choices[0];
  return choices.reduce((best, at) => Math.abs(at - near) < Math.abs(best - near) ? at : best);
}
const player = new Player((at, bpm, arranged) => {
  const point = arranged ?? pausedAt;
  const source = at ?? (point !== undefined && (pausedAt !== undefined || !player.active) ? session?.plan.positionAt(point) : undefined);
  lastPlaybackTick = source;
  playheadAt(source, point);
  const bar = source === undefined ? undefined : playbackMeasures.find(item => source >= item.start && source < item.end);
  get('play-status').hidden = !bar && !player.active;
  const rate = bpm ?? (point !== undefined ? session?.clock.bpmAt(point) : undefined);
  get('transport-tempo').textContent = rate === undefined ? '' : `♩=${Math.round(rate * 10) / 10}`;
  let label = player.active ? '预备拍' : '';
  if (bar && source !== undefined && point !== undefined && session) {
    const absolute = session.loop ? planTick(session.songPlan, source) ?? 0 : point;
    const tenths = Math.floor(session.songClock.secondsAt(absolute) * 10);
    const minute = String(Math.floor(tenths / 600)).padStart(2, '0');
    const second = (tenths % 600 / 10).toFixed(1).padStart(4, '0');
    const beat = (source - bar.start) / (QUARTER * 4 / (bar.actualMeter ?? bar.meter).denominator) + 1;
    label = `${minute}:${second}  ${bar.number}小节${Math.floor(beat * 10) / 10}拍`;
  }
  if (get('playing').textContent !== label) get('playing').textContent = label;
  syncTransport();
});
const mixPanel = get<HTMLDialogElement>('mix-panel');
const primaryLanes = () => score.lanes.filter(lane => !lane.parent);
const activeMain = () => score.lanes.find(lane => lane.id === cursor.lane)?.parent ?? cursor.lane;

function channels() {
  for (const lane of primaryLanes()) if (!mix.has(lane.id)) mix.set(lane.id, { volume: .8, muted: false, solo: false });
  return score.lanes.map(lane => [lane.id, mix.get(lane.parent ?? lane.id)!] as const);
}

function updateMix() { button('hear-one').setAttribute('aria-pressed', String(soloFocus)); player.applyMix(playbackMix()); }

function drawMixer() {
  channels();
  get('mix-channels').replaceChildren(...primaryLanes().map(lane => {
    const settings = mix.get(lane.id)!;
    const row = document.createElement('div');
    row.className = 'mix-channel';
    const name = document.createElement('span');
    name.textContent = lane.name;
    const volume = document.createElement('input');
    volume.type = 'range';
    volume.min = '0';
    volume.max = '100';
    volume.value = String(settings.volume * 100);
    volume.setAttribute('aria-label', lane.name + ' 音量');
    volume.oninput = () => { settings.volume = Number(volume.value) / 100; updateMix(); };
    row.append(name, volume);
    for (const [property, label] of [['muted', '静音'], ['solo', '独听']] as const) {
      const toggle = document.createElement('button');
      toggle.textContent = label;
      toggle.setAttribute('aria-label', lane.name + ' ' + label);
      toggle.setAttribute('aria-pressed', String(settings[property]));
      toggle.onclick = () => {
        settings[property] = !settings[property];
        toggle.setAttribute('aria-pressed', String(settings[property]));
        updateMix();
      };
      row.append(toggle);
    }
    return row;
  }));
}

function stopPlayback() {
  playbackAttempt++;
  pausedAt = lastPlaybackTick = undefined;
  pendingStart = undefined;
  session = undefined;
  player.stop();
}

function makePlaybackSession(fromBeginning = false, target?: number): PlaybackSession {
  const bars = playbackMeasures = measureTable(score);
  const tones = scoreTones(score);
  const songPlan = arrangePlayback(score, tones, repeatIntervals(score, 0, bars.length - 1));
  const songClock = tempoClock(score, songPlan.segments);
  const remembered = pendingStart?.focus === playbackFocusKey() ? pendingStart.at : undefined;
  const source = target ?? (fromBeginning ? 0 : remembered ?? playbackFocus().at);
  let loop = !fromBeginning && field('loop').checked;
  const index = bars.findIndex(bar => source < bar.end);
  const first = field('loop-from').valueAsNumber || Math.max(0, index) + 1;
  const last = field('loop-to').valueAsNumber || first;
  if (loop && (first < 1 || last < first || last > bars.length)) throw Error('循环起止小节超出范围。');
  if (target !== undefined && (index < first - 1 || index >= last)) loop = false;
  const plan = loop ? arrangePlayback(score, tones, bars.slice(first - 1, last).map(bar => bar.index)) : songPlan;
  const fallback = bars.find(bar => source < bar.end);
  // A printed ending may be unreachable in the full performance. A direct audition must still be possible.
  const audible = !loop && planTick(plan, source) === undefined && fallback ?
    arrangePlayback(score, tones, repeatIntervals(score, fallback.index, bars.length - 1)) : plan;
  const clock = tempoClock(score, audible.segments, Number(selectField('speed').value));
  return { plan: audible, clock, songClock, songPlan, origin: planTick(audible, source) ?? 0,
    returnSource: audible.positionAt(planTick(audible, source) ?? 0), end: audible.length, loop, scopeStart: 0 };
}
function playbackFocus(clicked?: ElementSelection) {
  if (!clicked && unfocused) return { at: 0, lanes: [] as string[] };
  const picks = clicked ? [clicked] : selectedPicks();
  if (!picks.length) return { at: cursor.at, lanes: [cursor.lane] };
  const keys = new Set(picks.map(appearanceKey));
  const positions = displayedObjects().filter(row => keys.has(appearanceKey(row.pick)));
  const lanes = [...new Set(positions.flatMap(row => row.lane ? [row.lane] : []))];
  const at = positions.flatMap(row => row.at === undefined ? [] : [row.at]);
  if (picks.length === 1 && picks[0].kind === 'span') {
    const span = score.spans[picks[0].index];
    const note = score.notes.find(item => item.id === (pickedEndpoint === 'to' ? span?.to : span?.from));
    if (span && note) return { at: (pickedEndpoint === 'to' ? span.toAt : span.fromAt) ?? note.at, lanes: [note.lane] };
  }
  if (picks.some(pick => pick.kind === 'header')) at.push(0);
  return { at: Math.min(...at, playbackMeasures.at(-1)!.end - 1e-6, ...(at.length ? [] : [0])), lanes };
}
function playbackFocusKey() {
  if (unfocused) return '';
  return JSON.stringify([cursor.lane, cursor.at, pickedEndpoint, selectedPicks().map(appearanceKey)]);
}
async function startPlayback(fromBeginning = false, jumpTo?: number) {
  const attempt = ++playbackAttempt;
  try {
    const resume = jumpTo === undefined && !fromBeginning && pausedAt !== undefined && !!session;
    const jumpAt = jumpTo !== undefined && session ? planTick(session.plan, jumpTo, player.currentTick) : undefined;
    if (!resume && jumpAt === undefined) {
      const origin = jumpTo === undefined ? undefined : session?.returnSource;
      session = makePlaybackSession(fromBeginning, jumpTo);
      if (origin !== undefined) session.returnSource = origin;
    }
    const active = session!;
    const at = resume ? pausedAt! : jumpAt ?? active.origin;
    pendingStart = undefined;
    pausedAt = undefined;
    const selection = playbackFocus().lanes;
    soloLanes = soloFocus && selection.length ? new Set(selection) : undefined;
    if (soloFocus && !soloLanes) get('status').textContent = '请选择要独听的声部。';
    const source = active.plan.positionAt(at);
    const bar = playbackMeasures.find(item => source < item.end) ?? playbackMeasures[0];
    const subdivisions = field('click-subdivide').checked;
    const count = resume || jumpTo !== undefined ? undefined : preCount(bar.pickup ? bar.meter : bar.actualMeter ?? bar.meter,
      Number(field('count-in').value), active.clock.bpmAt(at), subdivisions);
    await player.start(active.plan.tones, { start: at, end: active.end, loop: active.loop, loopStart: active.scopeStart },
      score.tempo, playbackMix(), active.plan.positionAt, active.clock, metronome(score, active.plan.segments, subdivisions), count);
    if (attempt === playbackAttempt) updateMix();
  } catch (error) {
    if (attempt !== playbackAttempt) return;
    stopPlayback();
    get('status').textContent = error instanceof Error ? error.message : '无法启动音频。';
  }
}
function togglePlayback() {
  if (player.active) {
    pausedAt = player.currentTick;
    player.stop();
  } else void startPlayback();
}
function stopOrSeek() {
  const origin = player.active ? session?.returnSource : undefined;
  const source = origin ?? playbackFocus().at;
  stopPlayback();
  pendingStart = { at: source, focus: playbackFocusKey() };
  const picked = origin === undefined ? get('score').querySelector('.picked') : undefined;
  const bar = playbackMeasures.find(bar => source >= bar.start && source < bar.end);
  (picked ?? get('score').querySelector(`[data-play-measure="${bar?.index}"]`)?.closest('.score-system'))
    ?.scrollIntoView({ block: 'center', inline: 'nearest' });
}
button('play').onclick = () => { togglePlayback(); focus(); };
button('stop').onclick = () => { stopOrSeek(); focus(); };
function playbackMix() {
  const current = channels();
  const anySolo = current.some(([, channel]) => channel.solo);
  return new Map(current.map(([lane, channel]) => [lane, { volume: channel.volume, solo: false,
    muted: channel.muted || anySolo && !channel.solo || !!soloLanes && !soloLanes.has(lane) }]));
}
const updateClick = () => player.setClick(Number(field('click-level').value) / 100, field('play-click').checked);
field('play-click').onchange = updateClick;
field('click-level').oninput = updateClick;
updateClick();
button('hear-one').onclick = () => {
  soloFocus = !soloFocus;
  const lanes = playbackFocus().lanes;
  soloLanes = soloFocus && lanes.length ? new Set(lanes) : undefined;
  updateMix();
  if (soloFocus && !soloLanes) get('status').textContent = '请选择要独听的声部。';
  focus();
};
for (const [id, control, art, label] of [['metronome-toggle', 'play-click', 'metronome', '节拍器'],
  ['loop-toggle', 'loop', 'loop', '循环']] as const) {
  transportIcon(id, art, label);
  button(id).onclick = () => {
    field(control).checked = !field(control).checked;
    button(id).setAttribute('aria-pressed', String(field(control).checked));
    field(control).dispatchEvent(new Event('change'));
    focus();
  };
}
transportIcon('rewind', 'rewind', '返回起点');
transportIcon('mixer', 'mixer', '混音台');
transportIcon('play-settings-icon', 'settings', '播放设置');
syncTransport();

button('mixer').onclick = () => {
  if (mixPanel.open) { mixPanel.close(); return; }
  drawMixer();
  mixPanel.show();
  button('mixer').setAttribute('aria-expanded', 'true');
};
mixPanel.onclose = () => button('mixer').setAttribute('aria-expanded', 'false');
field('loop').onchange = () => {
  if (field('loop').checked && range?.lane === cursor.lane) {
    const measures = measureTable(score);
    field('loop-from').value = String(measures.find(measure => Math.min(range!.at, cursor.at) < measure.end)!.index + 1);
    field('loop-to').value = String(measures.find(measure => Math.max(range!.at, cursor.at) < measure.end)!.index + 1);
  }
  if (player.active) { stopPlayback(); void startPlayback(); }
};
for (const id of ['speed', 'loop-from', 'loop-to']) get(id).onchange = () => {
  if (player.active) { stopPlayback(); void startPlayback(); }
};

let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
function recover() {
  if (!preferences.recover) return;
  if (!preferences.recoveryDelay) { saveRecovery(); return; }
  recoveryTimer ??= setTimeout(saveRecovery, preferences.recoveryDelay * 1000);
}
function saveRecovery() {
  clearTimeout(recoveryTimer);
  recoveryTimer = undefined;
  if (!preferences.recover) return;
  try {
    localStorage.setItem(workspaceStore, JSON.stringify({ active: activeDocument.id, part: activePart, items: documents.map(doc => ({
      id: doc.id, master: doc.master, dirty: dirtyDocument(doc), fileLabel: doc.fileLabel, partOrder: doc.partOrder
    })) }));
    localStorage.setItem(store, JSON.stringify(activeDocument.master));
  }
  catch { message = '无法写入自动恢复，请手动保存工程。'; }
}

window.addEventListener('pagehide', () => { if (recoveryTimer !== undefined) saveRecovery(); });

function tokenAt(position = cursor) {
  return prepared.byLane.get(position.lane)?.find(token => token.at === position.at);
}

function pitchIndex(token = tokenAt()) {
  return selection?.kind === 'pitch' ? selection.index :
    token ? pitchOrder(token.note, tonicAt(score, token.note.at))[0]?.index ?? 0 : 0;
}

function snap(position: Cursor): Cursor {
  const tokens = prepared.byLane.get(position.lane) ?? [];
  return { lane: position.lane, at: (tokens.find(token => token.at <= position.at && position.at < token.at + token.length)
    ?? tokens[0])?.at ?? 0 };
}

function fragment(token: Token) {
  const source = noteAt(score, { lane: token.note.lane, at: token.at }) ?? token.note;
  return isolateFragment(score, source, token.at, token.length);
}

function scrollInput() {
  get('score').querySelector('.input-cursor')?.scrollIntoView({ block: 'nearest' });
}

let engravingWarnings: string[] = [];
function applyScoreStyles(target: CSSStyleDeclaration, view: Score) {
  for (const role of STYLE_ROLES) {
    const style = view.textStyles?.[role] ?? TEXT_STYLES[role];
    target.setProperty('--' + role + '-font', role === 'lyric' || role === 'expression'
      ? textFontStack(style.font, style.cjkFont ?? 'SimSun') : JSON.stringify(style.font));
    target.setProperty('--' + role + '-size', style.size + 'px');
    if (role === 'measureNumber') target.setProperty('--measureNumber-italic', (style.italic ?? true) ? 'italic' : 'normal');
  }
  target.setProperty('--grace-size', ((view.textStyles?.digit?.size ?? TEXT_STYLES.digit.size) *
    (view.engravingStyle?.gracePercent ?? ENGRAVING_STYLE.gracePercent) / 100) + 'px');
  for (const role of ['arc', 'wedge', 'divisi'] as const)
    target.setProperty('--' + role + '-stroke', String(view.engravingStyle?.[role] ?? ENGRAVING_STYLE[role]));
}
function render() {
  if (!input) pendingMarks.clear();
  get('score').classList.toggle('hide-layout-marks', !preferences.layoutMarks);
  prepared = notation(score);
  if (graceEdit) {
    const host = graceHost();
    if (!host) graceEdit = undefined;
    else graceEdit.gap = Math.min(graceEdit.gap, host.grace?.[graceEdit.side]?.notes.length ?? 0);
  }
  if (!range) rangeTip = null;
  cursor = snap(cursor);
  const chordDraft = inline?.kind === 'text' && inline.element.kind === 'chord-symbol' && inline.chordAnchor ?
    { ...inline.chordAnchor, id: inline.element.id, text: '♪' } : undefined;
  const view = chordDraft ? { ...score, chordSymbols: [...(score.chordSymbols ?? []), chordDraft] } : score;
  const partDisplay = activeDocument.master.linkedParts?.find(part => part.id === activePart);
  const drawScore = () => engrave(view, cursor, range, selection, input, prepared,
    inline?.kind === 'lyric' ? { lane: inline.lane, at: inline.caret.at, verse: inline.verse, rows: inline.rows } : undefined,
    pickedEndpoint, graceEdit, inputSlur, partDisplay);
  const layout = drawScore();
  engravingWarnings = layout.warnings;
  const sheetHost = get('score');
  applyScoreStyles(sheetHost.style, view);
  sheetHost.innerHTML = layout.pages;
  paintSelections();
  const measures = playbackMeasures = measureTable(score);
  for (const id of ['loop-from', 'loop-to']) field(id).max = String(measures.length);
  const measure = measures.find(item => cursor.at >= item.start && cursor.at < item.end) ?? measures.at(-1)!;
  if (systemFocus !== undefined) systemFocus = Math.min(systemFocus, measures.length - 1);
  if (!unfocused && !selection && !signSelection) { systemFocus = measure.index; systemLane = cursor.lane; }
  const beforeStaff = selection?.kind === 'staff-bracket' ? selection.first : undefined;
  reconcileVisibleSelection(measure.index);
  if (beforeStaff !== undefined && selection?.kind === 'staff-bracket' && selection.first !== beforeStaff) {
    sheetHost.innerHTML = drawScore().pages;
    paintSelections();
  }
  if (soloFocus && player.active) {
    const lanes = playbackFocus().lanes;
    soloLanes = lanes.length ? new Set(lanes) : undefined;
  }
  updateMix();
  const token = tokenAt();
  const picks = effectivePicks();
  const multiple = picks.length > 1;
  const allDigits = picks.length > 0 && picks.every(pick => pick.kind === 'pitch');
  const noteChoices = digitTargets();
  const lane = score.lanes.find(item => item.id === cursor.lane);
  get('desk').classList.toggle('writing', input);
  button('input-mode').textContent = '音符输入(N)';
  button('input-mode').setAttribute('aria-pressed', String(input));
  const spanPicks = picks.filter(pick => pick.kind === 'span' || pick.kind === 'generated-tie');
  const arcs = picks.length > 0 && picks.every(hasArcShape);
  get('arc-shape-label').hidden = !arcs;
  if (arcs) displaySelect(selectField('arc-shape'), picks.map(pick => appearanceOf(score, pick)?.arcShape ?? 'auto'));
  const allSpans = spanPicks.length > 0 && spanPicks.length === picks.length;
  const flows = allSpans ? spanPicks.map(pick => selectedLyricGroup(pick)) : [];
  get('span-edit').hidden = !allSpans;
  get('lyric-flow-label').hidden = !flows.length || flows.some(group => !group);
  for (const id of ['span-left', 'span-right', 'element-delete']) button(id).disabled = !allSpans || spanPicks.some(pick => pick.kind !== 'span');
  displaySelect(selectField('lyric-flow'), flows.map(group => group?.flow ?? 'auto'));
  const position = describePosition(selection?.kind === 'extension' ? selection.at : cursor.at);
  const elementLabel = describeSelection(token);
  get('status').textContent = [graceEdit ? (graceEdit.side === 'before' ? '前倚音输入' : '后倚音输入') : input ? '音符输入' : inline ? '文字编辑' : '常规编辑',
    elementLabel, pickedEndpoint === 'from' ? '起点方柄' : pickedEndpoint === 'to' ? '终点方柄' : pickedEndpoint === 'height' ? '弧高方柄' : '',
    pendingMarks.size ? '下一个音符：' + [...pendingMarks.values()].map(id => inputMarkLabels.get(id) ?? id).join('、') : '',
    selection?.kind === 'span' || selection?.kind === 'generated-tie' || selection?.kind === 'header'
      ? '' : [lane?.name, position].filter(Boolean).join(' · '), message || layout.warnings[0]].filter(Boolean).join('  ·  ');
  get('status').title = get('status').textContent ?? '';
  renderDocumentTabs();
  get('part-property-scope').hidden = !activePart;
  get('object-name').textContent = multiple ? `已选 ${picks.length} 个元素` : signSelection ? signSelection.kind === 'key' ? '调号' : '拍号' : elementLabel || '属性';
  get('object-location').textContent = multiple ? '' : selection?.kind === 'header' ? '标题区 · 双击在谱面编辑'
    : selection?.kind === 'span' || selection?.kind === 'generated-tie' ? '拖动谱面方柄可以调整端点'
      : `${lane?.name ?? ''} · ${position}`;
  const noteProperties = get('note-properties');
  const showAll = input || allDigits;
  const firstPick = picks[0];
  const property = firstPick?.kind === 'mark' && picks.every(pick => pick.kind === 'mark' && pick.field === firstPick.field) ? firstPick.field : '';
  noteProperties.hidden = !showAll && !['lyric', 'dynamic', 'text', 'interNoteText', 'rehearsal'].includes(property);
  for (const panel of noteProperties.querySelectorAll<HTMLElement>('[data-property]'))
    panel.hidden = (!showAll || panel.hasAttribute('data-selected-mark')) && panel.dataset.property !== property;
  if (property === 'interNoteText')
    displaySelect(selectField('inter-note-side'), picks.map(pick => appearanceOf(score, pick)?.noteSide ?? 'left'));
  get('measure-properties').hidden = !allDigits && !(picks.length && picks.every(pick => pick.kind === 'ending'));
  get('repeat-tools').hidden = !(picks.length && picks.every(pick => pick.kind === 'ending'));
  button('show-measure-settings').hidden = input || !allDigits;
  renderBoundaryProperties();
  const textSelection = editableSelection();
  syncTextToolbars();
  renderSignaturePanel();
  renderTitleProperties();
  renderTempoProperties();
  renderAdditionalProperties();
  renderDynamicProperties();
  const splitToken = noteTargets().at(-1);
  const splitAt = splitToken && (splitToken.tail[0] ?? tickEnd(splitToken));
  const splitLane = splitToken && score.lanes.find(lane => lane.id === splitToken.note.lane);
  const explicitSplit = score.lanes.some(lane => lane.parent === (splitLane?.parent ?? splitLane?.id) && lane.start === splitAt && lane.splitStart);
  button('side-split-property').textContent = explicitSplit ? '取消此处临时声部切分' : '在此音后切分临时声部段';
  button('side-split-property').hidden = !(commands['side-split'].enabled?.() ?? false);
  renderPlaybackProperty();
  const directEdit = textSelection || selection?.kind === 'route' || selection?.kind === 'chord-symbol';
  get('text-properties').hidden = !directEdit && !property && !multiple;
  get('text-properties').querySelector<HTMLButtonElement>('[data-command="edit-element"]')!.hidden = !directEdit;
  if (multiple) get('span-positions').replaceChildren();
  else renderSpanPositions();
  renderOrnaments();
  get('page-count').textContent = `${layout.count} 页`;
  const paper = paperSize(score);
  if (previousPaperWidth !== paper.pixelWidth || previousPaperHeight !== paper.pixelHeight) updateZoom();
  if (lastPlaybackTick !== undefined) playheadAt(lastPlaybackTick, player.currentTick ?? pausedAt);
  renderPageSettings(layout.count);
  renderSystemPanel();
  selectField('measure-number-mode').value = score.measureNumbers ?? 'auto';
  field('title').value = score.title;
  field('credit').value = score.credit;
  for (const key of ['subtitle', 'lyricist', 'arranger', 'composer', 'copyright'] as const) field(key).value = score[key] ?? '';
  field('verse').value = String(verseNumber);
  for (const [id, kind, placeholder] of [['lyric', 'lyric', ''], ['dynamic', 'dynamic', 'mp'], ['expression', 'text', 'solo'], ['inter-note-text', 'interNoteText', ''], ['rehearsal', 'rehearsal', 'A']] as const) {
    const targets = textMarkTargets(kind);
    const values = targets.map(({ token, verse, extension }) => (kind === 'lyric' ? noteVerses(token.note).find(item => item.number === verse)?.text :
      noteTextValue(token.note, kind, extension)) ?? '');
    displayField(field(id), values, placeholder);
    field(id).disabled = !targets.length;
  }
  for (const key of ['staccato', 'accent', 'fermata', 'tenuto'] as const) {
    const values = articulationState(key, articulationTargets(key));
    button(key).disabled = !values.length;
    button(key).setAttribute('aria-pressed', values.length ? String(commonValue(values) ?? 'mixed') : 'false');
  }
  const breaths = [...breathTargets().map(token => breathShape(token.note.breath)), ...graceEvents().map(event => event.breath)];
  for (const [id, shape] of [['breath', 'upbow'], ['breath-comma', 'comma']] as const) {
    button(id).disabled = !breaths.length;
    button(id).setAttribute('aria-pressed', String(commonValue(breaths.map(value => value === shape)) ?? (breaths.length ? 'mixed' : false)));
  }
  get('breath-properties').hidden = property !== 'breath';
  displaySelect(selectField('breath-shape'), breaths.map(value => value ?? 'upbow'));
  drawNotices();
  button('chord').setAttribute('aria-pressed', String(chord));
  button('undo').disabled = !undo.length;
  button('redo').disabled = !redo.length;
  const grace = selectedGrace();
  const gracePitch = grace && selection?.kind === 'grace' ? grace.pitches[selection.index] : undefined;
  const gracePick = selection?.kind === 'grace' ? selection : undefined;
  const pitched = noteChoices.filter(({ token, index }) => isPitched(token.note) && token.note.pitches[index]);
  const gracePosition = gracePitch && gracePick ? gracePitch.octave - octaveCenter(graceHost(gracePick.id)!.lane, true) : undefined;
  const editingGrace = graceEdit && graceHost() ? graceHost() : undefined;
  showToolChoice('dots', graceEdit ? [graceEdit.dots] : grace ? [grace.dots ?? 0] : input ? [dots] : noteChoices.map(({ token }) => dotDuration(token).dots));
  showToolChoice('octaves', editingGrace ? [(editingGrace.pitches[0]?.octave ?? lane?.octave ?? 4) + graceEdit!.octave + temporaryOctave - octaveCenter(editingGrace.lane, true)] :
    input && lane ? [lane.octave + octave + temporaryOctave - octaveCenter(lane.id)] : gracePosition !== undefined ? [gracePosition] :
      pitched.map(({ token, index }) => displayedOctave(token, index)));
  showToolChoice('alter', graceEdit ? [graceEdit.accidental] : grace && gracePick ? [inputSignIndex(prepared.accidentals.graces.get(grace)?.[gracePick.index])] :
    input ? [accidental] : pitched.map(({ token, index }) => inputSignIndex(prepared.accidentals.signs.get(token)?.[index])));
  const beamControl = get<HTMLSelectElement>('beam-options');
  for (const option of [...beamControl.options]) option.disabled = option.value === 'mixed' || option.value === 'xml' ||
    !beamTargets(option.value as BeamMode).length && !graceBeamTargets(option.value as BeamMode).length;
  const modes = new Set([...noteTargets().filter(token => token.bars).map(effectiveBeam), ...graceBeamTargets('auto').map(event => event.beam ?? 'auto')]);
  beamControl.value = modes.size > 1 ? 'mixed' : [...modes][0] ?? 'auto';
  beamControl.disabled = !beamTargets('auto').length && !graceBeamTargets('auto').length;
  showToolChoice('values', graceEdit ? [graceEdit.value] : grace ? [grace.value] : input ? [value] : noteChoices.map(({ token }) => dotDuration(token).value));
  workbench.sync();
}

function focus() { get('desk').focus({ preventScroll: true }); }
function auditionNote(note: Note, indexes?: number[], reason: 'click' | 'navigate' | 'entry' | 'pitch' = 'pitch') {
  if (!preferences[reason] || !isPitched(note)) return;
  const pitches = indexes ? indexes.flatMap(index => note.pitches[index] ? [note.pitches[index]] : []) : note.pitches;
  const lane = score.lanes.find(item => item.id === note.lane);
  const main = lane?.parent ? score.lanes.find(item => item.id === lane.parent) : lane;
  void player.preview(pitches.map(pitch => sound(pitch, tonicAt(score, note.at))), !indexes && !main?.fullNoteVolume, preferences.seconds, preferences.volume / 100);
}
function commit(edit: () => void, feedback = '', refocus = true, checkpoint?: Score, previousCursor = cursor) {
  const digits = input || graceEdit || chord ? [] : digitTargets();
  const digit = digits.length === 1 ? digits[0] : undefined;
  const oldPitch = digit?.token.note.pitches[digit.index];
  const oldSound = oldPitch && sound(oldPitch, tonicAt(score, digit!.token.at));
  stopPlayback();
  const rollback = checkpoint ?? structuredClone(score);
  const previous = { score: activePart ? activeDocument.master : rollback, part: activePart, cursor: { ...previousCursor },
    value, dots, tuplets: new Map(inputTuplets) };
  const previousSelection = selection;
  const previousSignature = signSelection;
  const previousRange = range;
  const previousEnd = pickedEndpoint;
  const previousItems = selectedItems;
  const previousAnchor = lyricAnchor;
  const previousLyricFocus = lyricFocus;
  const previousUnfocused = unfocused;
  const previousMarks = [...pendingMarks];
  try {
    edit();
    lastClick = lastTextClick = null;
    if (selectedItems === previousItems && (selection !== previousSelection || range !== previousRange)) {
      selectedItems = lyricAnchor = lyricFocus = null;
    }
    persistEdit();
    undo.push(previous);
    if (undo.length > 100) undo.shift();
    redo.length = 0;
    message = feedback;
    recover();
    if (digit) {
      const note = score.notes.find(item => item.id === digit.token.note.id) ??
        noteAt(score, { lane: digit.token.note.lane, at: digit.token.at });
      const pitch = note?.pitches[digit.index];
      if (note && pitch && sound(pitch, tonicAt(score, note.at)) !== oldSound) auditionNote(note, [digit.index]);
    }
  } catch (error) {
    score = rollback;
    if (!activePart) activeDocument.master = rollback;
    cursor = previous.cursor;
    restoreTupletInput(previous);
    selection = previousSelection;
    signSelection = previousSignature;
    range = previousRange;
    pickedEndpoint = previousEnd;
    selectedItems = previousItems;
    lyricAnchor = previousAnchor;
    lyricFocus = previousLyricFocus;
    unfocused = previousUnfocused;
    pendingMarks.clear();
    for (const [family, id] of previousMarks) pendingMarks.set(family, id);
    message = error instanceof Error ? error.message : String(error);
  }
  render();
  if (input) scrollInput();
  if (refocus) focus();
}
function history(from: typeof undo, to: typeof undo) {
  const previous = from.pop();
  if (!previous) return;
  signSelection = null;
  stopPlayback();
  to.push({ score: activeDocument.master, part: activePart, cursor, value, dots, tuplets: new Map(inputTuplets) });
  activeDocument.master = previous.score;
  activeDocument.revision++;
  if (activePart && !previous.score.linkedParts?.some(part => part.id === activePart)) activePart = '';
  score = documentScore(activeDocument, activePart);
  if (previous.part === activePart) cursor = previous.cursor;
  if (!score.lanes.some(lane => lane.id === cursor.lane)) cursor = { lane: score.lanes[0].id, at: cursor.at };
  restoreTupletInput(previous);
  range = null;
  selection = null;
  selectedItems = lyricAnchor = lyricFocus = null;
  unfocused = false;
  pickedEndpoint = undefined;
  message = '';
  recover();
  render();
  if (input) scrollInput();
  focus();
}
function restoreTupletInput(snapshot: typeof undo[number]) {
  if (input || inputTuplets.size || snapshot.tuplets.size) ({ value, dots } = snapshot);
  inputTuplets.clear();
  for (const [id, settings] of snapshot.tuplets) inputTuplets.set(id, settings);
}
function select(next: Cursor, extend = false, element: ElementSelection | null = null, clickedDigit = false) {
  const previous = cursor;
  const wasUnfocused = unfocused;
  const leavingVoice = next.lane !== cursor.lane;
  const feedback = leavingVoice ? finishInputSlur() : '';
  if (leavingVoice) resetOneNoteSettings();
  signSelection = null;
  if (extend && next.lane === cursor.lane) range ??= { ...cursor };
  else range = null;
  selection = extend ? null : element;
  selectedItems = lyricAnchor = lyricFocus = null;
  unfocused = false;
  pickedEndpoint = undefined;
  cursor = snap(next);
  systemFocus = prepared.measures.find(bar => cursor.at >= bar.start && cursor.at < bar.end)?.index;
  systemLane = cursor.lane;
  message = feedback;
  render();
  focus();
  if (input) scrollInput();
  if (input || extend || player.active || element && element.kind !== 'pitch') return;
  if (!clickedDigit && !wasUnfocused && previous.lane === cursor.lane && previous.at === cursor.at) return;
  const token = tokenAt();
  const single = clickedDigit ? !preferences.clickChord : !preferences.navigateChord;
  if (token) auditionNote(token.note, single ? [element?.kind === 'pitch' ? element.index : pitchIndex(token)] : undefined,
    clickedDigit ? 'click' : 'navigate');
}
function inheritedAlter(position: Cursor, degree: number) {
  const token = tokenAt(position);
  return token ? prepared.accidentals.before.get(token)?.get(degree) ?? 0 : 0;
}
function enter(degree: number, unpitched = false) {
  commit(() => {
    const position = { ...cursor };
    const lane = score.lanes.find(item => item.id === cursor.lane)!;
    const sign = signs[accidental];
    const pitch: Pitch = { degree, octave: Math.min(8, Math.max(0, lane.octave + octave + (input ? temporaryOctave : 0))),
      alter: sign === 3 ? 0 : accidental ? sign : inheritedAlter(cursor, degree), natural: sign === 3 || undefined,
      signStyle: accidental ? 'show' : undefined };
    if (chord && !unpitched) {
      const token = tokenAt();
      if (!token?.note.pitches.length || !degree) throw new Error('请先选中一个发声音符，再用 1–7 叠加音高。');
      const note = fragment(token);
      if (note.pitches.length === 8) throw new Error('一个叠音组最多八个音。');
      note.pitches.push(pitch);
      if (input) consumeInputMarks(note);
    } else {
      const group = tupletAt(score, cursor.lane, cursor.at);
      const end = writeNote(score, cursor, degree ? [pitch] : [], value, dots, unpitched);
      if (input) consumeInputMarks(degree || unpitched ? noteAt(score, cursor) : undefined);
      advanceInput(lane, end, group);
    }
    if (degree) {
      const entered = noteAt(score, position);
      if (entered) auditionNote(entered, undefined, 'entry');
      resetOneNoteSettings();
    }
    range = null;
  });
}
function resetOneNoteSettings() { temporaryOctave = accidental = 0; }
function advanceInput(lane: Lane, end: number, initial?: Tuplet) {
  let group = initial;
  while (group && end >= tickEnd(group)) {
    const previous = inputTuplets.get(group.id);
    if (previous) { ({ value, dots } = previous); inputTuplets.delete(group.id); }
    const parent = group.parent;
    group = score.tuplets?.find(item => item.id === parent);
  }
  if (!lane.parent || end < lane.end!) cursor.at = end;
  else {
    closeInputSlur({ lane: lane.id, at: end });
    resetOneNoteSettings();
    cursor = { lane: lane.parent, at: Math.min(end, measureTable(score).at(-1)!.end - 1) };
  }
}
const isPitched = (note: Note) => note.pitches.length > 0 && !note.unpitched;
function priorInputNote(position = cursor) {
  return score.notes.filter(note => note.lane === position.lane && note.at < position.at && isPitched(note))
    .reduce<Note | undefined>((last, note) => !last || note.at > last.at ? note : last, undefined);
}
function addSlurBetween(start: Note, end: Note) {
  if (!score.spans.some(line => line.kind === 'slur' && line.from === start.id && line.to === end.id))
    score.spans.push({ kind: 'slur', from: start.id, to: end.id });
}
function closeInputSlur(position = cursor) {
  const pending = inputSlur;
  inputSlur = undefined;
  if (!pending) return '';
  const start = score.notes.find(note => note.id === pending.id && note.lane === pending.lane);
  const end = position.lane === pending.lane ? priorInputNote(position) : undefined;
  if (!start || !isPitched(start) || !end || end.at <= start.at) return '连音线未创建，终点须在起点之后。';
  addSlurBetween(start, end);
  return '';
}
function finishInputSlur() {
  if (!inputSlur) return '';
  const start = score.notes.find(note => note.id === inputSlur!.id && note.lane === cursor.lane && isPitched(note));
  const end = priorInputNote();
  if (!start || !end || end.at <= start.at) {
    inputSlur = undefined;
    return '连音线未创建，终点须在起点之后。';
  }
  commit(() => { closeInputSlur(); }, '', false);
  return '';
}
function pickedByVoice() {
  const groups = new Map<string, Token[]>();
  const tokens = new Set(digitTargets().map(({ token }) => token));
  for (const token of [...tokens].filter(token => isPitched(token.note)).sort((a, b) => a.at - b.at))
    groups.set(token.note.lane, [...(groups.get(token.note.lane) ?? []), token]);
  return groups;
}
function shortcutSlur(finishOnly: boolean) {
  if (input) {
    if (inputSlur) message = finishInputSlur();
    else if (!finishOnly) {
      const origin = priorInputNote();
      if (origin) {
        inputSlur = { id: origin.id, at: origin.at, lane: origin.lane };
        message = '连音线待续。';
      }
      else message = '光标前没有可作连音线起点的音。';
    }
    render();
    return;
  }
  if (finishOnly) return;
  const pairs = [...pickedByVoice().values()].flatMap(tokens => {
    const first = tokens[0];
    const last = tokens.length > 1 ? tokens.at(-1) : prepared.byLane.get(first.note.lane)?.find(token => token.at > first.at && isPitched(token.note) && token.note !== first.note);
    return last && last.note !== first.note ? [[first.note, last.note] as const] : [];
  });
  if (pairs.length) commit(() => pairs.forEach(([first, last]) => addSlurBetween(first, last)));
}
function matchingPitches(from: Note, to: Note) {
  const used = new Set<number>();
  return from.pitches.flatMap((pitch, index) => {
    const target = to.pitches.findIndex((other, i) => !used.has(i) && sound(pitch, tonicAt(score, from.at)) === sound(other, tonicAt(score, to.at)));
    if (target < 0) return [];
    used.add(target);
    return [{ pitch: index, targetPitch: target }];
  });
}
function shortcutTie() {
  if (input) {
    const previous = prepared.byLane.get(cursor.lane)?.find(token => tickEnd(token) === cursor.at && isPitched(token.note));
    if (!previous) { message = '光标前没有紧接的定音音符。'; render(); return; }
    commit(() => {
      const start = tickEnd(previous.note) === cursor.at ? previous.note : fragment(previous);
      const lane = score.lanes.find(item => item.id === cursor.lane)!;
      const group = tupletAt(score, cursor.lane, cursor.at);
      const tonic = tonicAt(score, cursor.at), original = tonicAt(score, start.at);
      const pitches = start.pitches.map(pitch => original === tonic ?
        { ...pitch, natural: undefined, courtesy: undefined, signStyle: undefined } : pitchAtSound(sound(pitch, original), tonic));
      const at = cursor.at;
      const end = writeNote(score, cursor, pitches, value, dots);
      const last = noteAt(score, { lane: cursor.lane, at })!;
      consumeInputMarks(last);
      for (const [index] of pitches.entries()) score.spans.push({ kind: 'tie', from: start.id, to: last.id, pitch: index, targetPitch: index });
      advanceInput(lane, end, group);
    });
    return;
  }
  const additions: Span[] = [];
  for (const tokens of pickedByVoice().values()) {
    const first = tokens.at(-1)!.note;
    const last = noteAt(score, { lane: first.lane, at: tickEnd(first) });
    if (!last || last.at !== tickEnd(first) || !isPitched(last)) continue;
    for (const pair of matchingPitches(first, last)) {
      if (score.spans.some(line => line.kind === 'tie' && (line.from === first.id && line.pitch === pair.pitch ||
        line.to === last.id && line.targetPitch === pair.targetPitch))) continue;
      additions.push({ kind: 'tie', from: first.id, to: last.id, ...pair });
    }
  }
  if (additions.length) commit(() => { score.spans.push(...additions); });
}
function chosen() {
  const first = Math.min(range?.at ?? cursor.at, cursor.at);
  const last = Math.max(range?.at ?? cursor.at, cursor.at);
  return score.notes.filter(note => note.lane === cursor.lane && note.at <= last && note.at + note.length > first)
    .sort((left, right) => left.at - right.at);
}
function chosenTokens() {
  const first = Math.min(range?.at ?? cursor.at, cursor.at);
  const last = Math.max(range?.at ?? cursor.at, cursor.at);
  return (prepared.byLane.get(cursor.lane) ?? []).filter(token => token.at >= first && token.at <= last);
}

function digitTargets() {
  if (input || graceEdit || unfocused) return [];
  const picks = selectedPicks();
  if (!picks.length && !range && !selection) {
    const token = tokenAt();
    return token ? [{ token, index: pitchIndex(token) }] : [];
  }
  if (!picks.length && range) return chosenTokens().map(token => ({ token, index: pitchIndex(token) }));
  const digits = picks.flatMap(pick => {
    const token = pick.kind === 'pitch' ? pickToken(pick) : undefined;
    return token && pick.kind === 'pitch' ? [{ token, index: pick.index }] : [];
  });
  return range ? digits.sort((a, b) => Number(a.token.at === cursor.at && a.token.note.lane === cursor.lane) - Number(b.token.at === cursor.at && b.token.note.lane === cursor.lane)) : digits;
}

function noteTargets() {
  const targets = [...new Set(digitTargets().map(({ token }) => token))];
  if (targets.length || selectedPicks().length > 1 || input || unfocused || selection?.kind !== 'mark') return targets;
  const token = markedToken(selection.id);
  return token ? [token] : [];
}

function writeNoteMarks(tokens: Token[], edit: (note: Note) => void) {
  for (const token of [...tokens].sort((a, b) => b.at - a.at)) {
    const source = noteAt(score, { lane: token.note.lane, at: token.at });
    edit(source?.at === token.at ? source : fragment(token));
  }
  refreshDigits();
}

function clearFragment(token: Token, pitch?: number) {
  if (!token.note.pitches.length && !token.note.unpitched) return;
  const note = fragment(token);
  if (pitch !== undefined && note.pitches.length > 1 && !note.unpitched) removePitch(note, pitch);
  else {
    note.pitches = [];
    delete note.unpitched;
    delete note.unpitchedContinuation;
    delete note.grace;
    delete note.ornaments;
    delete note.lyric;
    delete note.verses;
    delete note.accent;
    delete note.staccato;
    delete note.fermata;
    delete note.tenuto;
    delete note.breath;
    pruneTies(score);
  }
}

type ExtensionPick = Extract<ElementSelection, { kind: 'extension' }>;
function extensionToken(pick: ExtensionPick) {
  return prepared.tokens.find(token => token.note.id === pick.id && token.tail.includes(pick.at));
}
function clearExtensions(picks: ExtensionPick[]) {
  const cuts = new Map<Token, number>();
  for (const pick of picks) {
    const token = extensionToken(pick);
    if (token) cuts.set(token, Math.min(cuts.get(token) ?? pick.at, pick.at));
  }
  for (const [token, at] of [...cuts].sort((a, b) => b[1] - a[1])) {
    const end = token.at + token.length;
    const source = noteAt(score, { lane: token.note.lane, at });
    const originalEnd = source ? source.at + source.length : end;
    eraseInterval(score, token.note.lane, at, end);
    if (!source || !score.appearance) continue;
    const continuation = noteAt(score, { lane: token.note.lane, at: end });
    for (const key of Object.keys(score.appearance)) {
      let parts: unknown[];
      try { parts = JSON.parse(key); } catch { continue; }
      if (!['extension', 'pitch', 'generated-tie'].includes(String(parts[0])) || parts[1] !== source.id || typeof parts[2] !== 'number') continue;
      if (parts[2] < at || parts[2] >= originalEnd) continue;
      if (parts[2] >= end && continuation && continuation.id !== source.id) {
        score.appearance[JSON.stringify([parts[0], continuation.id, ...parts.slice(2)])] = score.appearance[key];
      }
      delete score.appearance[key];
    }
  }
}

function inputDelete(backward: boolean) {
  const tokens = prepared.byLane.get(cursor.lane) ?? [];
  const index = tokens.findIndex(token => token.at === cursor.at);
  const token = tokens[backward ? index - 1 : index];
  if (!token) return;
  if (token.note.pitches.length || token.note.unpitched) commit(() => {
    clearFragment(token);
    if (backward) cursor.at = token.at;
  });
  else if (backward) select({ ...cursor, at: token.at });
}
function nextSounding(token: Token) {
  return prepared.byLane.get(token.note.lane)?.find(item => item.at > token.at && item.note.pitches.length);
}

function singleLineEnd(token: Token, minimum: number) {
  const measure = prepared.measures[token.measure];
  const root = get('score');
  const bar = root.querySelector(`[data-play-measure="${measure.index}"]`);
  const row = [...(bar?.parentElement?.querySelectorAll<SVGGElement>('.voice-row') ?? [])]
    .find(row => row.dataset.lane === token.note.lane);
  const digit = [...(row?.querySelectorAll<SVGTextElement>('.digit') ?? [])].find(glyph => {
    const pick = JSON.parse(glyph.closest<SVGGElement>('[data-element]')!.dataset.element!);
    return pick.at === token.at;
  });
  const available = Number(bar?.getAttribute('x')) + Number(bar?.getAttribute('width')) - Number(digit?.getAttribute('x'));
  if (available < minimum) {
    const next = nextSounding(token);
    if (next) return { at: next.at, token: next };
  }
  return { at: Math.min(measure.end, score.lanes.find(lane => lane.id === token.note.lane)?.end ?? measure.end) };
}

function addSpan(kind: Span['kind'], dynamicText?: string) {
  if ((kind === 'tie' || kind === 'slur') && gracePicks().length) { addGraceLine(kind); return; }
  lastClick = null;
  const wedge = kind === 'crescendo' || kind === 'diminuendo';
  const rows = lineTargetRows(wedge);
  commit(() => {
    const added: ElementSelection[] = [];
    const errors: string[] = [];
    for (const picked of rows.length ? rows : [[]]) try {
      const start = picked[0];
      if (!start) throw Error('请先选中音符数字。');
      const singleEnd = wedge && picked.length === 1 ? singleLineEnd(start, 15) : undefined;
      const next = picked.length > 1 ? picked.at(-1) : wedge ? singleEnd?.token :
        kind === 'tie' ? prepared.byLane.get(start.note.lane)?.find(token => token.at === start.at + start.length) : nextSounding(start);
      if (!wedge && (!start.note.pitches.length || !next?.note.pitches.length))
        throw Error(kind === 'tie' ? '同音连线需要两个相接且同音高的音。' : '连音线需要两个发声音符。');
      const at = next?.at ?? singleEnd?.at;
      if (at === undefined || at <= start.at) throw Error('没有可连接的终点。');
      let pairs: Span[] = [];
      if (kind === 'tie') {
        if (start.at + start.length !== next!.at) throw Error('同音连线的两个音须在时间上紧接。');
        const used = new Set<number>();
        pairs = start.note.pitches.flatMap((pitch, index) => {
          const target = next!.note.pitches.findIndex((other, i) => !used.has(i) &&
            sound(pitch, tonicAt(score, start.at)) === sound(other, tonicAt(score, next!.at)));
          if (target < 0) return [];
          used.add(target);
          return [{ kind, from: '', to: '', pitch: index, targetPitch: target }];
        });
        if (!pairs.length) throw Error('选中的两个音没有相同的实际音高。');
      } else {
        const indexAt = (token: Token) => digitTargets().find(item => item.token === token)?.index;
        if (kind === 'tremolo' && (!next || start.at + start.length !== next.at || start.length !== next.length ||
            start.note.pitches.length !== 1 || next.note.pitches.length !== 1 || start.continuation || next.continuation ||
            start.length !== start.note.length || next.length !== next.note.length ||
            score.spans.some(span => ['tie', 'slide', 'tremolo'].includes(span.kind) &&
              [start.note.id, next.note.id].some(id => span.from === id || span.to === id)) ||
            [start, next].some(token => token.note.grace || token.note.ornaments && Object.keys(token.note.ornaments).length)))
          throw Error('双音震音需要两个紧接、等时值、没有拆写、同音线或装饰音的单音。');
        if (kind === 'slide' && next && sameTremoloMember(start.note.id, next.note.id)) throw Error('震音与滑音的端点不能重叠。');
        pairs = [{ kind, from: '', to: '', toAt: next ? undefined : at,
          pitch: kind === 'slur' || kind === 'slide' ? indexAt(start) : undefined,
          targetPitch: kind === 'slide' && next ? indexAt(next) : undefined, strokes: kind === 'tremolo' ? 3 : undefined }];
      }
      const backing = (token: Token) => (wedge ? score.notes.find(note => note.id === token.note.id) : undefined) ?? fragment(token);
      const first = backing(start);
      const last = next ? backing(next) : first;
      if (wedge) Object.assign(pairs[0], { fromAt: start.at, toAt: at });
      const duplicate = score.spans.findIndex(span => span.kind === kind && (span.dynamicText !== undefined) === (dynamicText !== undefined) &&
        span.from === first.id && span.to === last.id && (span.fromAt ?? first.at) === (pairs[0].fromAt ?? first.at) &&
        (span.toAt ?? last.at) === (pairs[0].toAt ?? last.at));
      if (duplicate >= 0) selection = { kind: 'span', index: duplicate };
      else {
        selection = { kind: 'span', index: score.spans.length };
        for (const pair of pairs) score.spans.push({ ...pair, from: first.id, to: last.id, dynamicText });
      }
      added.push(selection);
    } catch (error) { errors.push((error as Error).message); }
    if (!added.length) throw Error(errors[0]);
    selectedItems = added.length > 1 ? added : null;
    pickedEndpoint = undefined;
    range = null;
  });
  if (selection?.kind === 'span' && !workbench.isHidden()) workbench.setPanel('properties', false);
}
function sameTremoloMember(...ids: string[]) {
  return score.spans.some(span => span.kind === 'tremolo' && (ids.includes(span.from) || ids.includes(span.to)));
}
function addOrnament(kind: OrnamentKind, withWave = false) {
  const targets = noteTargets().filter(token => !token.continuation &&
    (token.note.pitches.length || kind === 'tremolo' && token.note.unpitched));
  if (!targets.length) return;
  commit(() => writeNoteMarks(targets, note => {
    if (sameTremoloMember(note.id)) throw Error('请先移除双音震音。');
    const marks = note.ornaments ??= {};
    if (marks[kind] && (kind !== 'trill' || !!marks[kind]?.wave === withWave)) delete marks[kind];
    else marks[kind] = kind === 'tremolo' ? { strokes: 3 } : withWave ? { ...marks[kind], wave: true } :
      { ...marks[kind], wave: undefined };
  }));
}
function selectedOrnament() {
  if (selection?.kind !== 'mark' || selection.field !== 'ornament' || !selection.ornament) return;
  const kind = selection.ornament;
  const item = score.notes.find(note => note.id === (selection as { id: string }).id)?.ornaments?.[kind];
  return item ? { kind, item } : undefined;
}
function renderOrnaments() {
  const mark = selectedOrnament();
  const span = selection?.kind === 'span' ? score.spans[selection.index] : undefined;
  const pair = span?.kind === 'tremolo' ? span : undefined;
  get('ornament-properties').hidden = !mark && !pair;
  const show = { upper: !!mark && !['lower-mordent', 'tremolo'].includes(mark.kind),
    lower: !!mark && !['trill', 'upper-mordent', 'tremolo'].includes(mark.kind),
    strokes: !!pair || mark?.kind === 'tremolo', fromUpper: mark?.kind === 'trill',
    wave: mark?.kind === 'trill', delayed: mark?.kind === 'turn' || mark?.kind === 'inverted-turn' };
  for (const key of ['upper', 'lower', 'strokes', 'fromUpper', 'wave', 'delayed'] as const) {
    get('ornament-' + key + '-row').hidden = !show[key];
    if (key === 'upper' || key === 'lower' || key === 'strokes')
      selectField('ornament-' + key).value = String(key === 'strokes' ? pair?.strokes ?? mark?.item.strokes ?? 3 : mark?.item[key] ?? '');
    else field('ornament-' + key).checked = mark?.item[key] ?? false;
  }
}
for (const key of ['upper', 'lower', 'strokes', 'fromUpper', 'wave', 'delayed'] as const) field('ornament-' + key).onchange = () => {
  const item = selectedOrnament()?.item;
  const span = selection?.kind === 'span' ? score.spans[selection.index] : undefined;
  const control = field('ornament-' + key);
  commit(() => {
    if (key === 'strokes' && span?.kind === 'tremolo') span.strokes = Number(control.value);
    else if (item) {
      if (key === 'upper' || key === 'lower' || key === 'strokes') item[key] = control.value === '' ? undefined : Number(control.value);
      else item[key] = control.checked || undefined;
    }
  }, '', false);
};
function clear() {
  if (graceEdit) { deleteGraceGap(false); return; }
  if (signSelection) { deleteSignature(); return; }
  if (unfocused) return;
  const picked = selectedPicks();
  if (picked.length && picked.every((element): element is ExtensionPick => element.kind === 'extension')) {
    const earliest = [...picked].sort((a, b) => a.at - b.at)[0];
    const token = extensionToken(earliest);
    if (token) commit(() => {
      clearExtensions(picked);
      cursor = { lane: token.note.lane, at: earliest.at };
      selection = range = selectedItems = null;
    }, '已将增时线及本音符后续各拍改为休止。');
    return;
  }
  if (selectedItems && selectedItems.length > 1) {
    commit(() => { removeElements(picked); selection = range = selectedItems = lyricAnchor = lyricFocus = null; });
    return;
  }
  const element = selection;
  if (element?.kind === 'bar-fermata') {
    commit(() => { removeElements([element]); selection = null; });
    return;
  }
  if (element?.kind === 'staff-bracket') { deleteStaffBracket(element); return; }
  if (element?.kind === 'measure-number') {
    commit(() => { score.measures[element.index].numberDisplay = 'hide'; selection = null; });
    return;
  }
  if (element && isLine(element) && pickedEndpoint) {
    if (!button('reset-placement').hidden) button('reset-placement').click();
    return;
  }
  if (element?.kind === 'tempo-mark' || element?.kind === 'tempo-line' || element?.kind === 'chord-symbol' || element?.kind === 'route') {
    commit(() => { removeElements([element]); selection = null; });
    return;
  }
  if (element?.kind === 'tuplet') {
    commit(() => { removeElements([element]); selection = null; });
    return;
  }
  if (element?.kind === 'grace') {
    commit(() => { removeGrace(element); selection = null; });
    return;
  }
  if (element?.kind === 'grace-line') {
    commit(() => { removeGraceLine(element); selection = null; });
    return;
  }
  if (element?.kind === 'barline') { applyBar('normal', false); return; }
  if (element?.kind === 'break') { applyBreak(); return; }
  if (element?.kind === 'ending') {
    commit(() => { score.endings?.splice(element.index, 1); selection = null; });
    return;
  }
  if (element?.kind === 'generated-tie') return;
  if (element?.kind === 'lane-name' || element?.kind === 'divisi-brace') {
    commit(() => updateAppearance(element, { ...appearanceOf(score, element), visible: false }));
    return;
  }
  if (element?.kind === 'header') {
    const field = element.field;
    if (field !== 'tempo' && field !== 'title') commit(() => { score[field] = ''; selection = null; });
    return;
  }
  if (element?.kind === 'span') {
    commit(() => { score.spans.splice(element.index, 1); selection = null; });
    return;
  }
  if (element?.kind === 'mark') {
    commit(() => { removeElements([element]); selection = null; });
    return;
  }
  const tokens = chosenTokens().filter(token => token.note.pitches.length);
  if (tokens.length) commit(() => {
    for (const token of tokens) clearFragment(token, element?.kind === 'pitch' ? element.index : undefined);
    selection = null;
  });
}

const documentLabel = (doc: ScoreDocument) => doc.fileLabel || doc.master.title || '未命名乐谱';
function dirtyDocument(doc: ScoreDocument) { return doc.baseline !== JSON.stringify(doc.master); }
function documentScore(doc: ScoreDocument, part = '') {
  const linked = doc.master.linkedParts?.find(item => item.id === part);
  return linked ? editablePart(doc.master, linked) : doc.master;
}
function persistEdit() {
  if (activePart) activeDocument.master = mergePartEdit(activeDocument.master, activePart, score);
  else {
    if (score.linkedParts?.length) ensurePartAnchors(score);
    activeDocument.master = score;
  }
  if (!documents.includes(activeDocument)) documents.push(activeDocument);
  activeDocument.revision++;
}
function resetDocumentInput() {
  finishInputSlur();
  resetOneNoteSettings();
  graceEdit = undefined;
  inputTuplets.clear();
  pendingMarks.clear();
  lastClick = lastTextClick = null;
  chord = input = false;
  value = QUARTER;
  dots = octave = 0;
}
function activateDocument(next: ScoreDocument, part = '') {
  if (inline) finishInline(true);
  resetDocumentInput();
  const desk = get('desk');
  activeDocument.views.set(activePart, { cursor, pick: selection, picks: selectedItems, anchor: range, signature: signSelection,
    zoom, scrollTop: desk.scrollTop, scrollLeft: desk.scrollLeft, unfocused, revision: activeDocument.revision });
  stopPlayback();
  if (mixPanel.open) mixPanel.close();
  field('loop').checked = false;
  button('loop-toggle').setAttribute('aria-pressed', 'false');
  field('loop-from').value = field('loop-to').value = '';
  verseNumber = 1;
  layoutPage = 0;
  const projected = documentScore(next, part);
  const view = next.views.get(part);
  const previousSelection = view?.revision === next.revision ? view : undefined;
  activeDocument = next;
  activePart = part;
  if (part && !next.partOrder.includes(part)) next.partOrder.push(part);
  undo = next.undo;
  redo = next.redo;
  mix = next.mix;
  soloLanes = undefined;
  score = projected;
  cursor = view && score.lanes.some(lane => lane.id === view.cursor.lane)
    ? view.cursor : { lane: score.lanes.find(lane => !lane.parent)!.id, at: 0 };
  range = previousSelection?.anchor ?? null;
  selection = previousSelection?.pick ?? null;
  selectedItems = previousSelection?.picks ?? null;
  signSelection = previousSelection?.signature ?? null;
  lyricAnchor = lyricFocus = null;
  unfocused = view?.unfocused ?? false;
  pickedEndpoint = undefined;
  systemFocus = systemLane = undefined;
  zoom = view?.zoom ?? defaultZoom();
  message = '';
  recover();
  render();
  updateZoom();
  desk.scrollTo(view?.scrollLeft ?? 0, view?.scrollTop ?? 0);
  get('document-strip').querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  focus();
}

function replace(next: Score, persisted = false, fileLabel?: string, rightOf?: ScoreDocument) {
  const doc = makeDocument(next, persisted, fileLabel);
  const index = rightOf ? documents.indexOf(rightOf) + 1 : documents.length;
  documents.splice(index, 0, doc);
  activateDocument(doc);
  return doc;
}

type FileSaveHost = {
  saveProject?: (params: { key: string; name: string; content: string }) => Promise<{ name: string } | null>;
  registerOpenedProject?: (key: string, file: File) => Promise<boolean>;
};
function projectFilename(name: string) { return (name.trim().replace(/[\\/:*?"<>|]/g, '_') || '未命名乐谱') + '.shupu'; }
const scoreFileTitle = (name: string) => name.replace(/(?:\.shupu|(?:\.jianpu)?\.json)$/iu, '');
async function saveDocument(doc: ScoreDocument, saveAs = false) {
  const content = JSON.stringify(doc.master);
  const desktop = (window as Window & { desktopScore?: FileSaveHost }).desktopScore;
  let name = projectFilename(documentLabel(doc));
  try {
    if (desktop?.saveProject) {
      const key = saveAs ? uid() : doc.saveKey ?? uid();
      const result = await desktop.saveProject({ key, name, content });
      if (!result) return false;
      doc.saveKey = key;
      name = result.name;
    } else {
      if (saveAs) {
        const requested = prompt('另存为的文件名', scoreFileTitle(name));
        if (requested === null) return false;
        name = projectFilename(scoreFileTitle(requested));
      }
      downloadSheet(new Blob([content], { type: 'application/json' }), name);
    }
    if (saveAs || desktop?.saveProject) doc.fileLabel = scoreFileTitle(name);
    if (desktop?.saveProject) doc.baseline = content;
    recover();
    renderDocumentTabs();
    get('status').textContent = desktop?.saveProject ? '工程已保存。' : '已请求下载工程。';
    return true;
  } catch (error) {
    get('status').textContent = (error as Error).message;
    return false;
  }
}
function save() {
  if (inline) finishInline(true);
  if (documents.includes(activeDocument)) void saveDocument(activeDocument);
}
async function saveAs() {
  if (inline) finishInline(true);
  const parent = activeDocument;
  const id = activePart;
  const part = parent.master.linkedParts?.find(item => item.id === id);
  if (!part) { if (documents.includes(parent)) await saveDocument(parent, true); return; }
  const independent = makeDocument(independentPart(parent.master, part), false, documentLabel(parent) + ' - ' + part.name);
  if (!await saveDocument(independent, true)) return;
  documents.splice(documents.indexOf(parent) + 1, 0, independent);
  parent.partOrder = parent.partOrder.filter(key => key !== id);
  activateDocument(independent);
}
function duplicateDocument() {
  if (inline) finishInline(true);
  if (!documents.includes(activeDocument)) return;
  const master = activeDocument.master;
  const part = master.linkedParts?.find(item => item.id === activePart);
  const copy = part ? independentPart(master, part) : structuredClone(master);
  replace(copy, false, (part ? documentLabel(activeDocument) + ' - ' + part.name : documentLabel(activeDocument)) + ' 副本', activeDocument);
}

let closingDocument: ScoreDocument | undefined;
function removeDocument(doc: ScoreDocument) {
  const index = documents.indexOf(doc);
  if (index < 0) return;
  documents.splice(index, 1);
  if (activeDocument === doc) activateDocument(documents[Math.min(index, documents.length - 1)] ?? makeDocument(newScore(), true));
  else { recover(); renderDocumentTabs(); }
}
function closeDocument(doc: ScoreDocument) {
  if (doc === activeDocument) {
    if (inline) finishInline(true);
    finishInputSlur();
  }
  if (!dirtyDocument(doc)) { removeDocument(doc); return; }
  closingDocument = doc;
  get('close-score-name').textContent = `要保存“${documentLabel(doc)}”的更改吗？`;
  const dialog = get<HTMLDialogElement>('close-score');
  dialog.returnValue = '';
  button('close-score-confirm').hidden = true;
  dialog.showModal();
}
get<HTMLDialogElement>('close-score').onclose = async event => {
  const doc = closingDocument;
  closingDocument = undefined;
  if (!doc) return;
  const dialog = event.currentTarget as HTMLDialogElement;
  const action = dialog.returnValue;
  if (action === 'discard' || action === 'downloaded') { removeDocument(doc); return; }
  if (action !== 'save' || !await saveDocument(doc)) return;
  if (!dirtyDocument(doc)) { removeDocument(doc); return; }
  const desktop = (window as Window & { desktopScore?: FileSaveHost }).desktopScore;
  if (desktop?.saveProject) { closeDocument(doc); return; }
  closingDocument = doc;
  get('close-score-name').textContent = '已请求下载工程。请在下载完成后确认关闭。';
  button('close-score-confirm').hidden = false;
  dialog.returnValue = '';
  dialog.showModal();
};
function closePart(doc: ScoreDocument, id: string) {
  if (doc === activeDocument && activePart === id) activateDocument(doc);
  doc.partOrder = doc.partOrder.filter(part => part !== id);
  recover();
  renderDocumentTabs();
}
let draggedTab: { doc: ScoreDocument; part: string } | undefined;
function renderDocumentTabs() {
  const strip = get('document-strip');
  strip.hidden = !documents.length;
  get('desk').hidden = !documents.length;
  strip.replaceChildren(...documents.map(doc => {
    const group = document.createElement('div');
    group.className = 'document-group';
    const makeTab = (part = '', label = documentLabel(doc)) => {
      const item = document.createElement('div');
      const selected = activeDocument === doc && activePart === part;
      item.className = 'doc-tab' + (part ? ' part-tab' : '') + (selected ? ' active' : '');
      item.dataset.part = part;
      const tab = document.createElement('button');
      tab.className = 'doc-tab-label';
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(selected));
      tab.textContent = label + (!part && dirtyDocument(doc) ? ' •' : '');
      tab.title = label;
      tab.onclick = () => {
        if (selected) { focus(); return; }
        try { activateDocument(doc, part); }
        catch (error) { get('status').textContent = (error as Error).message; }
      };
      tab.draggable = true;
      tab.ondragstart = event => {
        draggedTab = { doc, part };
        event.dataTransfer?.setData('text/plain', label);
      };
      tab.ondragend = () => { draggedTab = undefined; };
      item.ondragover = event => {
        if (draggedTab && (draggedTab.part ? !!part && draggedTab.doc === doc : draggedTab.doc !== doc)) event.preventDefault();
      };
      item.ondrop = event => {
        const source = draggedTab;
        draggedTab = undefined;
        if (!source) return;
        if (source.part && part && source.doc === doc) {
          const from = doc.partOrder.indexOf(source.part), to = doc.partOrder.indexOf(part);
          [doc.partOrder[from], doc.partOrder[to]] = [doc.partOrder[to], doc.partOrder[from]];
        } else if (!source.part && source.doc !== doc) {
          const from = documents.indexOf(source.doc), to = documents.indexOf(doc);
          [documents[from], documents[to]] = [documents[to], documents[from]];
        } else return;
        event.preventDefault();
        recover();
        renderDocumentTabs();
      };
      const close = document.createElement('button');
      close.className = 'doc-tab-close';
      close.type = 'button';
      close.textContent = '×';
      close.title = '关闭 ' + label;
      close.setAttribute('aria-label', close.title);
      close.onclick = () => part ? closePart(doc, part) : closeDocument(doc);
      item.append(tab, close);
      return item;
    };
    const parts = doc.partOrder.flatMap(id => doc.master.linkedParts?.find(part => part.id === id) ?? []);
    group.append(makeTab(), ...parts.map(part => makeTab(part.id, part.name)));
    return group;
  }));
}

button('open').onclick = () => field('file').click();
field('file').onchange = async () => {
  const file = field('file').files?.[0];
  try {
    if (file) {
      if (file.size > 10_000_000) throw new Error('工程文件太大。');
      const doc = replace(openScore(await file.text()), true, scoreFileTitle(file.name));
      const desktop = (window as Window & { desktopScore?: FileSaveHost }).desktopScore;
      if (desktop?.registerOpenedProject) {
        const key = uid();
        if (await desktop.registerOpenedProject(key, file).catch(() => false)) doc.saveKey = key;
      }
    }
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
    render();
  } finally { field('file').value = ''; }
};
const importReview = get<HTMLDialogElement>('import-review');
let imported: ImportResult | undefined;
let importSource: { source: string; name: string } | undefined;
button('import').onclick = () => field('music-file').click();
field('music-file').onchange = async () => {
  const file = field('music-file').files?.[0];
  if (!file) return;
  button('import').disabled = true;
  try {
    importSource = { source: await readMusicFile(file), name: file.name };
    field('import-beams').checked = preferences.beams;
    imported = importMusicXML(importSource.source, file.name, preferences.beams);
    const { score, warnings } = imported;
    get('import-info').textContent = `${score.title} · ${score.measures.length} 小节。转调和变拍随小节保留。`;
    get('import-parts').replaceChildren(...score.lanes.filter(lane => !lane.parent).map(lane => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = lane.id;
      input.checked = true;
      const count = score.lanes.filter(item => item.parent === lane.id).length;
      label.append(input, document.createTextNode(lane.name + (count ? `（含 ${count} 条副线）` : '')));
      return label;
    }));
    get('import-warning-count').textContent = warnings.length ? `导入提示（${warnings.length}）` : '未发现不支持的记号';
    get('import-warning-list').replaceChildren(...warnings.map(warning => {
      const item = document.createElement('li');
      item.textContent = warning.text;
      return item;
    }));
    get<HTMLDetailsElement>('import-warnings').open = warnings.length > 0 && warnings.length <= 6;
    importReview.returnValue = '';
    if (preferences.reviewImport) importReview.showModal();
    else { importReview.returnValue = 'import'; finishMusicImport(); }
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
    render();
    alert(message);
  } finally {
    field('music-file').value = '';
    button('import').disabled = false;
  }
};
importReview.onclose = finishMusicImport;
function finishMusicImport() {
  if (!imported || importReview.returnValue !== 'import') { imported = undefined; importSource = undefined; return; }
  const chosen = new Set([...get('import-parts').querySelectorAll<HTMLInputElement>('input:checked')].map(input => input.value));
  if (!chosen.size) { importReview.returnValue = ''; importReview.showModal(); return; }
  if (field('import-beams').checked !== preferences.beams && importSource)
    imported = importMusicXML(importSource.source, importSource.name, field('import-beams').checked);
  importSource = undefined;
  const next = imported.score;
  next.spacing = score.spacing;
  next.textStyles = score.textStyles;
  next.engravingStyle = score.engravingStyle;
  next.justifyBottom = score.justifyBottom;
  if (preferences.defaultStyle) Object.assign(next, structuredClone(preferences.defaultStyle));
  next.lanes = next.lanes.filter(lane => chosen.has(lane.parent ?? lane.id));
  const lanes = new Set(next.lanes.map(lane => lane.id));
  next.notes = next.notes.filter(note => lanes.has(note.lane));
  next.chordSymbols = next.chordSymbols?.filter(symbol => lanes.has(symbol.lane));
  if (next.tuplets) next.tuplets = next.tuplets.filter(group => lanes.has(group.lane));
  next.importNotices = next.importNotices?.filter(notice => !notice.lane || lanes.has(notice.lane));
  pruneTies(next);
  const count = imported.warnings.length;
  imported = undefined;
  replace(next);
  message = `已导入 ${chosen.size} 个声部，共 ${next.measures.length} 小节${count ? `；有 ${count} 项导入提示` : ''}。`;
  render();
};
button('save').onclick = save;
function launchExport(part: LinkedPart | null | undefined = activeDocument.master.linkedParts?.find(item => item.id === activePart)) {
  let result: ReturnType<typeof exportMusicXML>;
  const master = activeDocument.master;
  try { result = exportMusicXML(part ? partScore(master, part) : master); }
  catch (error) {
    alert(error instanceof Error ? error.message : String(error));
    return;
  }
  const dialog = get<HTMLDialogElement>('export-review');
  get('export-notices').replaceChildren(...result.warnings.map(text => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
  dialog.returnValue = '';
  dialog.onclose = () => {
    if (dialog.returnValue !== 'download') return;
    const blob = new Blob([result.xml], { type: 'application/vnd.recordare.musicxml+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = ([master.title, part?.name].filter(Boolean).join('-').trim().replace(/[\\/:*?"<>|]/g, '_') || '合唱谱') + '.musicxml';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  dialog.showModal();
}
const spacingNames = {
  note: '最小音符间距', bar: '最小小节留白', voice: '最小声部间距', system: '最小谱组间距',
  lyric: '最小歌词间距', marginLeft: '左页边距', marginRight: '右页边距', marginTop: '上页边距', marginBottom: '下页边距'
};
const legacyMargins = { marginLeft: 'marginX', marginRight: 'marginX', marginTop: 'marginY', marginBottom: 'marginY' } as const;
type SpacingField = keyof typeof spacingNames;
const pageScope = get<HTMLSelectElement>('page-scope');
const bottomAlignment = get<HTMLSelectElement>('bottom-alignment');
type StaffBracketPick = Extract<ElementSelection, { kind: 'staff-bracket' }>;
type SystemRange = { first: number; last: number };
function readSystem(node: Element) {
  const root = node.closest<SVGGElement>('[data-system-first]');
  if (!root) return undefined;
  return { first: Number(root.dataset.systemFirst), last: Number(root.dataset.systemLast), root,
    visible: JSON.parse(root.dataset.systemVisible ?? '[]') as string[],
    conflicts: Number(root.dataset.systemConflicts ?? 0), fallback: root.dataset.systemFallback };
}
function systemAtIndex(index: number | undefined) {
  if (index === undefined) return undefined;
  const group = get('score').querySelector(`[data-play-measure="${index}"]`);
  return group ? readSystem(group) : undefined;
}
function captureSystem(node: Element, pick?: ElementSelection | null) {
  const group = readSystem(node);
  if (!group) { systemFocus = systemLane = undefined; return; }
  let index = group.first;
  if (pick?.kind === 'measure-number' || pick?.kind === 'signature') index = pick.index;
  const at = pick && 'at' in pick ? pick.at : pick?.kind === 'mark' ? score.notes.find(note => note.id === pick.id)?.at :
    pick?.kind === 'tempo-mark' ? tempoMark(pick.id)?.at : pick?.kind === 'tempo-line' ? tempoLine(pick.id)?.from : undefined;
  if (at !== undefined) index = prepared.measures.find(bar => at >= bar.start && at < bar.end)?.index ?? index;
  systemFocus = index >= group.first && index <= group.last ? index : group.first;
  systemLane = node.closest<SVGGElement>('[data-lane]')?.dataset.lane;
}
function clearHiddenSelection() {
  selection = range = rangeTip = selectedItems = lyricAnchor = lyricFocus = null;
  signSelection = null;
  pickedEndpoint = undefined;
  input = false;
  unfocused = true;
  systemLane = undefined;
  paintSelections();
}
function reconcileVisibleSelection(index: number) {
  if (selection?.kind === 'staff-bracket' && !(selectedItems && selectedItems.length > 1)) {
    const selectedId = selection.id;
    const system = systemAtIndex(systemFocus ?? selection.first);
    if (system) {
      const next = { kind: 'staff-bracket', id: selectedId, first: system.first, last: system.last } as const;
      if ([...system.root.querySelectorAll<SVGGElement>('[data-element]')].some(node =>
        appearanceKey(JSON.parse(node.dataset.element!)) === appearanceKey(next))) selection = next;
      else clearHiddenSelection();
    } else clearHiddenSelection();
    return;
  }
  const target = systemAtIndex(systemFocus ?? index);
  if (!target || unfocused) return;
  if (systemLane && !target.visible.includes(systemLane)) clearHiddenSelection();
}
function rowSettings(system: SystemRange, update: (settings: NonNullable<Measure['layout']>) => void) {
  for (const bar of score.measures.slice(system.first, system.last + 1)) {
    const settings = bar.layout ??= {};
    update(settings);
    if (settings.visibility && !Object.keys(settings.visibility).length) delete settings.visibility;
    if (settings.brackets && !Object.keys(settings.brackets).length) delete settings.brackets;
    if (!settings.visibility && !settings.brackets) delete bar.layout;
  }
}
const laneDisplayLabels: Record<LaneDisplay, string> = { show: '常显', hide: '常隐', rest: '全休止行隐藏' };
function renderSystemPanel() {
  const target = systemAtIndex(systemFocus);
  get('system-voices').hidden = !target;
  if (!target) return;
  const { first, last, visible, conflicts, fallback } = target;
  const from = prepared.measures[first], to = prepared.measures[last];
  get('system-voices-location').textContent = first === last ? `第 ${from.number} 小节` : `第 ${from.number}–${to.number} 小节`;
  const notice = get('system-layout-notice');
  notice.textContent = [fallback ? '此行至少保留一条可见声部。' : '', conflicts ? '这一行包含不同的局部连谱号设定，当前采用全谱设定。' : ''].filter(Boolean).join(' ');
  notice.hidden = !notice.textContent;
  const bars = score.measures.slice(first, last + 1);
  const bracketConflicts = get('system-bracket-conflicts');
  bracketConflicts.hidden = !conflicts;
  bracketConflicts.replaceChildren(...systemBrackets(score, first, last).conflicts.map(id => {
    const options = new Map<string, { item: StaffBracket | null; label: string }>();
    bars.forEach((bar, index) => {
      const item = bar.layout?.brackets?.[id];
      if (item === undefined) return;
      const key = JSON.stringify(item);
      if (options.has(key)) return;
      const name = (lane: string) => score.lanes.find(row => row.id === lane)?.name ?? lane;
      const label = item ? `${{ bracket: '粗括号', brace: '花括号', square: '细方括号' }[item.type]} · ${name(item.top)} – ${name(item.bottom)}` : '本行隐藏此括号';
      options.set(key, { item, label: `${label}（第 ${prepared.measures[first + index].number} 小节的设定）` });
    });
    const choices = [...options.values()];
    const control = document.createElement('select');
    control.append(new Option('选择当前整行采用的设定', ''), new Option('恢复全谱设定', 'global'), ...choices.map(({ label }, index) => new Option(label, String(index))));
    control.onchange = () => {
      const value = control.value;
      if (value === '') return;
      commit(() => rowSettings(target, settings => {
        if (value === 'global') { if (settings.brackets) delete settings.brackets[id]; }
        else settings.brackets = { ...settings.brackets, [id]: structuredClone(choices[Number(value)].item) };
      }), '', false);
    };
    return choice('本行连谱号', control);
  }));
  get('system-voice-options').replaceChildren(...score.lanes.filter(lane => !lane.parent || lane.start! < to.end && lane.end! > from.start).map(lane => {
    const row = document.createElement('div');
    row.className = 'system-voice-row';
    const group = document.createElement('div');
    group.className = 'voice-visibility';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', lane.name + '显隐');
    const values = bars.map(bar => bar.layout?.visibility?.[lane.id]);
    const active = values.every(value => value === values[0]) ? values[0] ?? '' : 'mixed';
    const name = document.createElement('span');
    name.textContent = (lane.parent ? '临时 · ' : '') + lane.name;
    if (!visible.includes(lane.id)) name.classList.add('muted');
    row.ondblclick = event => { if (!(event.target as Element).closest('button')) openVoices({ lane: lane.id, field: 'name' }); };
    for (const [state, title, path] of [
      ['show', '本行显示', 'M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Zm10-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z'],
      ['hide', '本行隐藏', 'M3 5l18 14M2 12s4 6 10 6c5 0 10-6 10-6s-4-6-10-6c-1 0-2 0-3 .5'],
      ['', '沿用全局', 'M4 9a8 8 0 1 1-.2 6m.2-11v5h5']
    ] as const) {
      const control = settingsButton('', () => {
      commit(() => rowSettings(target, settings => {
        if (state) settings.visibility = { ...settings.visibility, [lane.id]: state };
        else if (settings.visibility) delete settings.visibility[lane.id];
      }), '', false);
      get('system-voice-options').querySelector<HTMLButtonElement>(`[data-system-voice="${CSS.escape(lane.id)}"][data-state="${state}"]`)?.focus();
      }, state === 'hide' && visible.length === 1 && visible[0] === lane.id);
      control.title = title;
      control.setAttribute('aria-label', title);
      control.setAttribute('aria-pressed', String(active === state));
      control.dataset.systemVoice = lane.id;
      control.dataset.state = state;
      control.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
      group.append(control);
    }
    row.append(name, group);
    return row;
  }));
  button('system-voices-reset').disabled = !bars.some(bar => Object.keys(bar.layout?.visibility ?? {}).length);
}
button('system-voices-reset').onclick = () => {
  const target = systemAtIndex(systemFocus);
  if (target) commit(() => rowSettings(target, settings => { delete settings.visibility; }), '', false);
};
function staffBracket(pick: StaffBracketPick) {
  return systemBrackets(score, pick.first, pick.last).items.find(item => item.id === pick.id);
}
function writeStaffBracket(pick: StaffBracketPick, item: StaffBracket | null) {
  if (systemBrackets(score, pick.first, pick.last).local.has(pick.id)) {
    rowSettings(pick, settings => { settings.brackets = { ...settings.brackets, [pick.id]: item ? structuredClone(item) : null }; });
  } else {
    const rules = scoreBrackets(score);
    score.brackets = item ? rules.map(rule => rule.id === pick.id ? item : rule) : rules.filter(rule => rule.id !== pick.id);
  }
}
function deleteStaffBracket(pick: StaffBracketPick) {
  commit(() => { writeStaffBracket(pick, null); selection = null; selectedItems = null; });
}
function changeStaffEnd(pick: StaffBracketPick, edge: 'top' | 'bottom', lane: string) {
  const item = staffBracket(pick);
  if (!item) return;
  const rank = primaryLanes().map(row => row.id);
  const reversed = rank.indexOf(item.top) > rank.indexOf(item.bottom);
  const top = reversed ? item.bottom : item.top;
  const bottom = reversed ? item.top : item.bottom;
  const to = rank.indexOf(lane);
  const nextTop = edge === 'top' ? rank[Math.min(to, rank.indexOf(bottom))] : top;
  const nextBottom = edge === 'bottom' ? rank[Math.max(to, rank.indexOf(top))] : bottom;
  writeStaffBracket(pick, { ...item, top: nextTop, bottom: nextBottom });
}
function renderStaffBracketProperties() {
  const picks = effectivePicks();
  const targets = bracketTargets();
  get('staff-bracket-properties').hidden = !targets.length || targets.length !== picks.length;
  if (get('staff-bracket-properties').hidden) return;
  displaySelect(selectField('staff-bracket-type'), targets.map(({ item }) => item.type));
  const lanes = primaryLanes();
  const order = lanes.map(lane => lane.id);
  for (const edge of ['top', 'bottom'] as const) {
    const control = selectField('staff-bracket-' + edge);
    control.replaceChildren(...lanes.map(lane => new Option(lane.name, lane.id)));
    displaySelect(control, targets.map(({ item }) => {
      const [top, bottom] = [item.top, item.bottom].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      return edge === 'top' ? top : bottom;
    }));
  }
  displayCheck(field('staff-bracket-sync'), targets.map(({ pick }) => !systemBrackets(score, pick.first, pick.last).local.has(pick.id)));
}
function bracketTargets() {
  return effectivePicks().flatMap(pick => {
    const item = pick.kind === 'staff-bracket' ? staffBracket(pick) : undefined;
    return pick.kind === 'staff-bracket' && item ? [{ pick, item }] : [];
  });
}
for (const edge of ['top', 'bottom'] as const) get<HTMLSelectElement>('staff-bracket-' + edge).onchange = event => {
  const lane = (event.currentTarget as HTMLSelectElement).value;
  const targets = bracketTargets();
  if (lane && lane !== 'mixed' && targets.length) commit(() => {
    for (const { pick } of targets) changeStaffEnd(pick, edge, lane);
  }, '', false);
};
get<HTMLSelectElement>('staff-bracket-type').onchange = event => {
  const type = (event.currentTarget as HTMLSelectElement).value as BracketType;
  const targets = bracketTargets();
  if (BRACKET_TYPES.includes(type) && targets.length) commit(() => {
    for (const { pick, item } of targets) writeStaffBracket(pick, { ...item, type });
  }, '', false);
};
field('staff-bracket-sync').onchange = () => {
  const targets = bracketTargets();
  if (!targets.length) return;
  const sync = field('staff-bracket-sync').checked;
  commit(() => {
    for (const { pick, item } of targets) {
      if (sync && !scoreBrackets(score).some(rule => rule.id === item.id)) score.brackets = [...scoreBrackets(score), item];
      rowSettings(pick, settings => {
        if (sync) { if (settings.brackets) delete settings.brackets[pick.id]; }
        else settings.brackets = { ...settings.brackets, [pick.id]: structuredClone(item) };
      });
    }
  }, '', false);
};
button('staff-bracket-delete').onclick = clear;
function addStaffBracket(type: BracketType) {
  const target = systemAtIndex(systemFocus);
  const lane = score.lanes.find(row => row.id === (systemLane ?? cursor.lane));
  if (!target || !lane || unfocused || input) return;
  commit(() => {
    const id = uid();
    const root = lane.parent ?? lane.id;
    score.brackets = [...scoreBrackets(score), { id, top: root, bottom: root, type }];
    selection = { kind: 'staff-bracket', id, first: target.first, last: target.last };
    range = selectedItems = null;
  });
  workbench.setPanel('properties');
}
function renderPageSettings(count: number) {
  const overrides = score.pageLayouts ?? {};
  const configured = Object.keys(overrides).map(Number);
  const pages = [...new Set([...Array.from({ length: count }, (_, index) => index + 1), ...configured])].sort((a, b) => a - b);
  const cache = `${count}:${configured.join(',')}`;
  if (pageScope.dataset.pages !== cache) {
    pageScope.replaceChildren(new Option('全谱默认', '0'), ...pages.map(page => new Option(
      `第 ${page} 页${overrides[page] ? (page > count ? ' · 尚未排到' : ' · 单独设置') : ''}`, String(page))));
    pageScope.dataset.pages = cache;
  }
  if (layoutPage && !pages.includes(layoutPage)) layoutPage = 0;
  pageScope.value = String(layoutPage);
  const override = overrides[layoutPage];
  const global = pageLayout(score, 0).spacing;
  field('score-scale').value = String(score.scalePercent ?? 100);
  for (const key of Object.keys(spacingNames) as SpacingField[]) {
    const control = field('style-gap-' + key);
    const legacy = legacyMargins[key as keyof typeof legacyMargins];
    const local = override?.spacing?.[key] ?? (legacy ? override?.spacing?.[legacy] : undefined);
    control.value = String(layoutPage ? local ?? '' : global[key]);
    control.placeholder = layoutPage ? String(global[key]) : '';
    control.title = layoutPage ? `留空沿用全谱值 ${global[key]}` : '';
    const reset = button('reset-gap-' + key);
    reset.disabled = layoutPage ? local === undefined : global[key] === DEFAULT_SPACING[legacy || key as keyof typeof DEFAULT_SPACING];
    const title = `${spacingNames[key]} · ${layoutPage ? '沿用全谱' : '恢复默认值'}`;
    reset.title = title;
    reset.setAttribute('aria-label', title);
  }
  bottomAlignment.options[0].hidden = !layoutPage;
  const alignment = layoutPage ? override?.justifyBottom : score.justifyBottom ?? true;
  bottomAlignment.value = alignment === undefined ? 'inherit' : alignment ? 'on' : 'off';
  bottomAlignment.options[0].text = `沿用全谱（${score.justifyBottom === false ? '关闭' : '开启'}）`;
  button('reset-spacing').textContent = layoutPage ? '清除本页设置' : '恢复全谱默认间距';
  button('reset-spacing').disabled = layoutPage ? !override : !score.spacing;
}
function changePageSettings(edit: (settings: PageLayout) => void) {
  const pages = (score.pageLayouts ??= {});
  const settings = (pages[layoutPage] ??= {});
  edit(settings);
  if (settings.spacing && !Object.keys(settings.spacing).length) delete settings.spacing;
  if (!Object.keys(settings).length) delete pages[layoutPage];
  if (!Object.keys(pages).length) delete score.pageLayouts;
}
pageScope.onchange = () => {
  layoutPage = Number(pageScope.value);
  renderPageSettings(get('score').querySelectorAll('.sheet').length);
  get('score').querySelector(`.sheet[data-page="${layoutPage}"]`)?.scrollIntoView({ block: 'start' });
};
bottomAlignment.onchange = () => commit(() => {
  if (layoutPage) changePageSettings(settings => {
    if (bottomAlignment.value === 'inherit') delete settings.justifyBottom;
    else settings.justifyBottom = bottomAlignment.value === 'on';
  });
  else score.justifyBottom = bottomAlignment.value === 'on';
}, '', false);
field('score-scale').onchange = () => commit(() => {
  const value = Math.round(field('score-scale').valueAsNumber) || 100;
  const [min, max] = SCORE_SCALE_RANGE;
  score.scalePercent = value === 100 ? undefined : Math.min(max, Math.max(min, value));
}, '', false);
for (const key of Object.keys(spacingNames) as SpacingField[]) {
  const control = document.createElement('input');
  control.type = 'number';
  control.id = 'style-gap-' + key;
  control.dataset.spacing = key;
  const [minimum, maximum] = SPACING_LIMITS[key];
  control.min = String(minimum);
  control.max = String(maximum);
  const write = (value?: number) => commit(() => {
    if (layoutPage) changePageSettings(settings => {
      if (settings.spacing) for (const [edge, legacy] of Object.entries(legacyMargins) as [keyof typeof legacyMargins, 'marginX' | 'marginY'][]) {
        settings.spacing[edge] ??= settings.spacing[legacy];
        if (settings.spacing[edge] === undefined) delete settings.spacing[edge];
      }
      if (settings.spacing) { delete settings.spacing.marginX; delete settings.spacing.marginY; }
      if (value !== undefined) (settings.spacing ??= {})[key] = value;
      else if (settings.spacing) delete settings.spacing[key];
    });
    else {
      const backup = legacyMargins[key as keyof typeof legacyMargins];
      score.spacing = { ...(score.spacing ?? DEFAULT_SPACING), [key]: value ?? DEFAULT_SPACING[backup || key as keyof typeof DEFAULT_SPACING] };
    }
  }, '', false);
  control.onchange = () => {
    if (control.validity.badInput) { control.reportValidity(); return; }
    write(control.value === '' ? undefined : Math.max(minimum, Math.min(maximum, Math.round(control.valueAsNumber))));
  };
  const reset = settingsButton('↶', () => {
    control.focus();
    write();
  });
  reset.id = 'reset-gap-' + key;
  const group = key in legacyMargins ? 'margins' : key === 'note' || key === 'bar' ? 'horizontal' : 'vertical';
  get('spacing-' + group).append(styleValue(spacingNames[key], control, reset));
}
button('reset-spacing').onclick = () => commit(() => {
  if (layoutPage) changePageSettings(settings => { delete settings.spacing; delete settings.justifyBottom; });
  else delete score.spacing;
}, '', false);
const meterDialog = get<HTMLDialogElement>('meter-dialog');
const keyDialog = get<HTMLDialogElement>('key-dialog');
let measureTarget = 0;
let forceVisibleMeter = false;
const selectField = (id: string) => get<HTMLSelectElement>(id);
function commonValue<T>(values: T[]) {
  return values.every(value => value === values[0]) ? values[0] : undefined;
}
function displaySelect(control: HTMLSelectElement, values: (string | number)[], fallback = '') {
  const mixed = values.length > 1 && commonValue(values) === undefined;
  let marker = [...control.options].find(option => option.value === 'mixed');
  if (mixed && !marker) {
    marker = new Option('混合', 'mixed');
    marker.disabled = true;
    control.add(marker, 0);
  }
  if (marker) marker.hidden = !mixed;
  control.value = mixed ? 'mixed' : String(values[0] ?? fallback);
}
function displayField(control: HTMLInputElement, values: (string | number)[], placeholder = '') {
  const value = commonValue(values);
  control.value = String(value ?? '');
  control.placeholder = value === undefined && values.length > 1 ? '混合' : placeholder;
}
function displayCheck(control: HTMLInputElement, values: boolean[]) {
  const value = commonValue(values);
  control.checked = value ?? false;
  control.indeterminate = values.length > 1 && value === undefined;
}
function targetMeasure() {
  if (selection?.kind === 'barline' || selection?.kind === 'bar-fermata' || selection?.kind === 'break') return Math.max(0, selection.index - 1);
  if (selection?.kind === 'signature' || selection?.kind === 'measure-number') return selection.index;
  return range ? selectedMeasures().start : noteTargets().at(-1)?.measure ?? selectedMeasures().start;
}
function editMeter(prefix: string): Meter {
  const numerator = field(prefix + '-top').valueAsNumber;
  const denominator = Number(selectField(prefix + '-base').value);
  const input = field(prefix + '-groups').value.trim();
  const groups = input ? input.split('+').map(Number) : defaultGroups(numerator, denominator);
  if (!Number.isInteger(numerator) || numerator < 1 || numerator > 16 || ![2, 4, 8, 16].includes(denominator) ||
    groups.some(group => !Number.isInteger(group) || group < 1) || groups.reduce((sum, group) => sum + group, 0) !== numerator)
    throw Error('拍组须由正整数组成，总和须等于分子。');
  return { numerator, denominator, groups };
}
function setMeterFields(prefix: string, meter: Meter) {
  field(prefix + '-top').value = String(meter.numerator);
  selectField(prefix + '-base').value = String(meter.denominator);
  field(prefix + '-groups').value = meter.groups.join('+');
  delete field(prefix + '-groups').dataset.userEdited;
}
function actualMeterOf(measure: ReturnType<typeof measureTable>[number]): Meter {
  if (measure.actualMeter) return measure.actualMeter;
  const denominator = [measure.meter.denominator, 4, 8, 16, 2].find(unit => {
    const numerator = measure.length * unit / (4 * QUARTER);
    return Number.isInteger(numerator) && numerator >= 1 && numerator <= 16;
  });
  return denominator ? { numerator: measure.length * denominator / (4 * QUARTER), denominator,
    groups: defaultGroups(measure.length * denominator / (4 * QUARTER), denominator) } : measure.meter;
}
type MeasurePosition = { index: number; lane: string };
type ActualMeterMode = 'keep' | 'printed' | 'custom';
type MeasureDraft = {
  printed: Meter; key: KeySignature; actual: Meter; mode: ActualMeterMode; pickup: boolean; keepMusic: boolean;
  step: number; numberDisplay: NumberDisplay; highlights: Map<string, MeasureHighlight | null>;
};
const measureDialog = get<HTMLDialogElement>('measure-dialog');
const measureForm = measureDialog.querySelector('form')!;
const measureDrafts = new Map<number, MeasureDraft>();
let barPosition: MeasurePosition;
let contextMeasure: MeasurePosition | undefined;
let countedStep = 1;
const meterIs = (a: Meter, b: Meter) => a.numerator === b.numerator && a.denominator === b.denominator && a.groups.join() === b.groups.join();
const activeBarLanes = (index: number) => {
  const measure = prepared.measures[index];
  return score.lanes.filter(lane => !lane.parent || lane.start! < measure.end && lane.end! > measure.start);
};
const displayedStep = (index: number) => prepared.measures[index].sequence - (prepared.measures[index - 1]?.sequence ?? 0);
function measureDraft(index: number): MeasureDraft {
  const existing = measureDrafts.get(index);
  if (existing) return existing;
  const bar = prepared.measures[index];
  const draft: MeasureDraft = { printed: bar.meter, key: bar.key, actual: actualMeterOf(bar), mode: 'keep', pickup: bar.pickup,
    keepMusic: true, step: displayedStep(index), numberDisplay: bar.numberDisplay ?? 'auto', highlights: new Map() };
  measureDrafts.set(index, draft);
  return draft;
}
function buildMeterFields(prefix: string, meter: Meter): HTMLElement[] {
  const numerator = numberInput(meter.numerator, 1, 16); numerator.id = prefix + '-top';
  const denominator = document.createElement('select'); denominator.id = prefix + '-base';
  denominator.append(...[2, 4, 8, 16].map(value => new Option(String(value))));
  denominator.value = String(meter.denominator);
  const groups = document.createElement('input'); groups.id = prefix + '-groups'; groups.placeholder = '默认拍组';
  groups.value = meter.groups.join('+');
  numerator.oninput = denominator.onchange = () => { groups.value = ''; };
  return [choice('分子', numerator), choice('分母', denominator), choice('拍组', groups)];
}
function barKeyOptions(degree: KeySignature['degree'], value: number) {
  const choices = selectField('bar-key-fifths');
  choices.replaceChildren(...Array.from({ length: 15 }, (_, i) => new Option(keyName({ degree, fifths: i - 7 }), String(i - 7))));
  choices.value = String(value);
}
function loadBarFields() {
  const { index, lane } = barPosition;
  const bar = prepared.measures[index];
  const draft = measureDraft(index);
  const lanes = activeBarLanes(index);
  const row = lanes.findIndex(item => item.id === lane);
  const voice = lanes[row];
  get('bar-location').textContent = `第 ${index + 1} 个小节 · ${voice.parent ? score.lanes.find(item => item.id === voice.parent)!.name + ' / ' : ''}${voice.name}`;
  button('bar-prev').disabled = index === 0;
  button('bar-next').disabled = index === prepared.measures.length - 1;
  button('bar-up').disabled = row <= 0;
  button('bar-down').disabled = row >= lanes.length - 1;
  selectField('bar-key-degree').value = String(draft.key.degree);
  barKeyOptions(draft.key.degree, draft.key.fifths);
  get('bar-printed-fields').replaceChildren(...buildMeterFields('bar-meter', draft.printed));
  get('bar-actual-fields').replaceChildren(...buildMeterFields('bar-actual', draft.actual));
  selectField('bar-actual-mode').value = draft.mode;
  selectField('bar-overflow').value = draft.keepMusic ? 'keep' : 'cut';
  field('bar-pickup').checked = draft.pickup;
  selectField('bar-number-display').value = draft.numberDisplay;
  field('bar-number-step').value = String(draft.step);
  field('bar-uncounted').checked = draft.step === 0;
  countedStep = draft.step || 1;
  const highlight = draft.highlights.has(lane) ? draft.highlights.get(lane) : Object.hasOwn(bar.highlights ?? {}, lane) ? bar.highlights![lane] : undefined;
  field('bar-highlight').checked = !!highlight;
  field('bar-highlight-color').value = highlight?.color ?? '#f4ca52';
  field('bar-highlight-opacity').value = String(100 - (highlight?.opacity ?? 28));
  get('bar-error').textContent = '';
  previewBar();
}
function barLength(draft: MeasureDraft, index: number) {
  return draft.mode === 'keep' ? prepared.measures[index].length : meterLength(draft.mode === 'printed' ? draft.printed : draft.actual);
}
function readBarFields() {
  const { index, lane } = barPosition;
  const draft = measureDraft(index);
  const mode = selectField('bar-actual-mode').value as ActualMeterMode;
  const step = field('bar-uncounted').checked ? 0 : field('bar-number-step').valueAsNumber;
  const opacity = 100 - field('bar-highlight-opacity').valueAsNumber;
  const enabled = field('bar-highlight').checked;
  if (!Number.isSafeInteger(step) || enabled && (!Number.isInteger(opacity) || opacity < 0 || opacity > 100))
    throw Error('小节号增量须为整数，透明度须在 0–100% 以内。');
  const next: MeasureDraft = {
    printed: editMeter('bar-meter'), key: { degree: Number(selectField('bar-key-degree').value) as KeySignature['degree'], fifths: Number(selectField('bar-key-fifths').value) },
    actual: mode === 'custom' ? editMeter('bar-actual') : draft.actual, mode,
    pickup: field('bar-pickup').checked, keepMusic: selectField('bar-overflow').value === 'keep',
    step, numberDisplay: selectField('bar-number-display').value as NumberDisplay,
    highlights: new Map(draft.highlights).set(lane, enabled ? { color: field('bar-highlight-color').value, opacity } : null)
  };
  if (next.pickup && barLength(next, index) >= meterLength(next.printed)) throw Error('弱起须短于谱面拍号。');
  return next;
}
function previewBar() {
  const { index } = barPosition;
  const bar = prepared.measures[index];
  const custom = selectField('bar-actual-mode').value === 'custom';
  get('bar-actual-fields').hidden = !custom;
  for (const control of get('bar-actual-fields').querySelectorAll('input, select')) (control as HTMLInputElement).disabled = !custom;
  field('bar-number-step').disabled = field('bar-uncounted').checked;
  field('bar-highlight-color').disabled = field('bar-highlight-opacity').disabled = !field('bar-highlight').checked;
  get('bar-duration-preview').textContent = `当前实际时值 ${bar.length / QUARTER} 拍（四分音符为一拍）。`;
  get('bar-number-preview').textContent = '';
  try {
    const draft = readBarFields();
    const length = barLength(draft, index);
    if (length < bar.length) {
      const affected = score.notes.filter(note => note.pitches.length && note.at < bar.end && note.at + note.length > bar.start + length).length;
      get('bar-duration-preview').textContent = `调整为 ${length / QUARTER} 拍。缩短的部分涉及 ${affected} 个发声音符。`;
    } else if (length !== bar.length) get('bar-duration-preview').textContent = `调整为 ${length / QUARTER} 拍。`;
    const sample = { ...score, measures: score.measures.map((measure, i) => {
      const pending = i === index ? draft : measureDrafts.get(i);
      return pending && pending.step !== displayedStep(i) ? { ...measure, numberStep: pending.step } : measure;
    }) };
    const numbers = measureTable(sample);
    get('bar-number-preview').textContent = `前一小节 ${numbers[index - 1]?.number ?? '—'} · 本小节 ${numbers[index].number} · 后一小节 ${numbers[index + 1]?.number ?? '—'}`;
  } catch (error) { get('bar-duration-preview').textContent = (error as Error).message; }
}
function openMeasureProperties(index = targetMeasure(), lane = cursor.lane) {
  lastClick = lastTextClick = null;
  measureDrafts.clear();
  const available = activeBarLanes(index);
  barPosition = { index, lane: available.some(item => item.id === lane) ? lane : available[0].id };
  loadBarFields();
  measureDialog.showModal();
}
function moveBar(dx: number, dy: number) {
  const { index, lane } = barPosition;
  try { measureDrafts.set(index, readBarFields()); }
  catch (error) { get('bar-error').textContent = (error as Error).message; return; }
  const next = index + dx;
  const rows = activeBarLanes(next);
  const selected = rows.findIndex(item => item.id === lane);
  const parent = score.lanes.find(item => item.id === lane)?.parent;
  const target = dx ? rows[selected] ?? rows.find(item => item.id === parent) ?? rows[0] : rows[selected + dy];
  if (target) { barPosition = { index: next, lane: target.id }; loadBarFields(); }
}
button('bar-prev').onclick = () => moveBar(-1, 0);
button('bar-next').onclick = () => moveBar(1, 0);
button('bar-up').onclick = () => moveBar(0, -1);
button('bar-down').onclick = () => moveBar(0, 1);
button('bar-cancel').onclick = () => measureDialog.close();
button('bar-delete').onclick = () => {
  const target = score.measures[barPosition.index];
  let applied = false;
  commit(() => {
    try {
      applyPendingBars(pendingBars(barPosition.index));
      const index = deleteMeasures(score, [score.measures.indexOf(target)]);
      positionAfterMeasureEdit(index, barPosition.lane);
      applied = true;
    } catch (error) { get('bar-error').textContent = (error as Error).message; throw error; }
  }, '已删除本小节。', false);
  if (applied) { measureDialog.close(); focus(); }
};
selectField('bar-key-degree').onchange = () => barKeyOptions(Number(selectField('bar-key-degree').value) as KeySignature['degree'], Number(selectField('bar-key-fifths').value));
field('bar-uncounted').onchange = () => {
  if (field('bar-uncounted').checked) countedStep = field('bar-number-step').valueAsNumber || 1;
  field('bar-number-step').value = String(field('bar-uncounted').checked ? 0 : countedStep);
  previewBar();
};
measureForm.addEventListener('input', () => { get('bar-error').textContent = ''; previewBar(); });
function pendingBars(except?: number) {
  return [...measureDrafts].filter(([index, draft]) => {
    if (index === except) return false;
    const bar = prepared.measures[index];
    return draft.mode !== 'keep' || !meterIs(draft.printed, bar.meter) || !sameKey(draft.key, bar.key) || draft.pickup !== bar.pickup ||
      draft.step !== displayedStep(index) || draft.numberDisplay !== (bar.numberDisplay ?? 'auto') || [...draft.highlights].some(([lane, value]) => {
        const old = Object.hasOwn(bar.highlights ?? {}, lane) ? bar.highlights![lane] : undefined;
        return old?.color !== value?.color || old?.opacity !== value?.opacity;
      });
  }).sort(([a], [b]) => b - a);
}
function applyPendingBars(changes: [number, MeasureDraft][]) {
  const previousSteps = new Map(changes.map(([index]) => [index, displayedStep(index)]));
  for (const [index, draft] of changes) {
    const measure = score.measures[index];
    const before = measureTable(score)[index];
    const length = barLength(draft, index);
    if (length !== before.length) setMeasureLength(score, index, length, draft.keepMusic);
    if (draft.mode !== 'keep' || !meterIs(draft.printed, before.meter)) {
      const oldActual = actualMeterOf(before);
      const actual = draft.mode === 'custom' ? draft.actual : draft.mode === 'printed' ? undefined : before.actualMeter ??
        (meterLength(oldActual) === length ? oldActual : undefined);
      measure.actualMeter = actual;
    }
    if (draft.pickup !== before.pickup) measure.pickup = draft.pickup;
    if (!meterIs(draft.printed, before.meter)) {
      if (score.measures[index + 1] && !score.measures[index + 1].meter) score.measures[index + 1].meter = before.meter;
      measure.meter = draft.printed;
      delete measure.meterHidden;
    }
    if (!sameKey(draft.key, before.key)) setKeySignature(score, index, draft.key, true);
    if (draft.step !== previousSteps.get(index)) { measure.numberStep = draft.step; delete measure.numberLabel; }
    measure.numberDisplay = draft.numberDisplay === 'auto' ? undefined : draft.numberDisplay;
    for (const [lane, highlight] of draft.highlights) if (score.lanes.some(item => item.id === lane)) {
      if (highlight) measure.highlights = { ...measure.highlights, [lane]: highlight };
      else if (measure.highlights) delete measure.highlights[lane];
    }
    if (measure.highlights && !Object.keys(measure.highlights).length) delete measure.highlights;
  }
}
measureForm.onsubmit = event => {
  event.preventDefault();
  try { measureDrafts.set(barPosition.index, readBarFields()); }
  catch (error) { get('bar-error').textContent = (error as Error).message; return; }
  const selected = score.measures[barPosition.index];
  const changes = pendingBars();
  if (!changes.length) { measureDialog.close(); focus(); return; }
  let applied = false;
  commit(() => {
    try {
      applyPendingBars(changes);
      positionAfterMeasureEdit(score.measures.indexOf(selected), barPosition.lane);
      applied = true;
    } catch (error) { get('bar-error').textContent = (error as Error).message; throw error; }
  }, '已应用小节属性。', false);
  if (applied) { measureDialog.close(); focus(); }
};
function positionAfterMeasureEdit(index: number, lane: string) {
  const target = measureTable(score)[index];
  const row = score.lanes.find(item => item.id === lane);
  const local = row?.parent && row.start! < target.end && row.end! > target.start;
  cursor = { lane: local || row && !row.parent ? lane : row?.parent ?? score.lanes[0].id,
    at: local ? Math.max(target.start, row.start!) : target.start };
  selection = range = selectedItems = lyricAnchor = lyricFocus = null;
  signSelection = null;
  pickedEndpoint = undefined;
  unfocused = false;
}
function editSelectedMeasures(mode: 'delete' | 'before' | 'after') {
  if (input || unfocused) return;
  const picks = effectivePicks();
  if (!picks.length || picks.some(pick => pick.kind !== 'pitch')) return;
  const tokens = picks.flatMap(pick => pick.kind === 'pitch' ? pickToken(pick) ?? [] : []);
  if (!tokens.length) return;
  const indices = tokens.map(token => token.measure);
  const after = mode === 'after';
  const side = after ? Math.max(...indices) : Math.min(...indices);
  const lane = tokens.find(token => token.measure === side)!.note.lane;
  commit(() => positionAfterMeasureEdit(mode === 'delete' ? deleteMeasures(score, indices) : insertBlankMeasure(score, side, after), lane),
    mode === 'delete' ? '已删除选中的小节。' : '已插入空小节。');
}
function previewMeter() {
  const inherit = field('actual-inherit').checked;
  for (const id of ['actual-top', 'actual-base', 'actual-groups', 'actual-pickup']) field(id).disabled = inherit;
  try {
    const printed = editMeter('meter');
    const actual = inherit ? printed : editMeter('actual');
    const measure = prepared.measures[measureTarget];
    const changed = meterLength(actual) - measure.length;
    const affected = changed < 0 ? score.notes.filter(note => note.pitches.length && note.at < measure.end &&
      note.at + note.length > measure.end + changed).length : 0;
    get('meter-preview').textContent = `本小节实际时值为 ${actual.numerator}/${actual.denominator}${affected ? `，缩短的部分涉及 ${affected} 个发声音符` : ''}。`;
  } catch (error) { get('meter-preview').textContent = (error as Error).message; }
}
meterDialog.addEventListener('input', event => {
  const id = (event.target as HTMLElement).id;
  const kind = id.startsWith('actual-') ? 'actual' : 'meter';
  const groups = field(kind + '-groups');
  if (id.endsWith('-groups')) groups.dataset.userEdited = 'yes';
  if ((id.endsWith('-top') || id.endsWith('-base')) && !groups.dataset.userEdited) {
    const numerator = field(kind + '-top').valueAsNumber;
    const denominator = Number(selectField(kind + '-base').value);
    if (Number.isInteger(numerator) && numerator >= 1 && numerator <= 16)
      groups.value = defaultGroups(numerator, denominator).join('+');
  }
  previewMeter();
});
function openMeter(index = targetMeasure(), custom = false) {
  lastClick = lastTextClick = null;
  measureTarget = index;
  forceVisibleMeter = custom;
  const measure = prepared.measures[index];
  get('meter-heading').textContent = `第 ${measure.number} 小节 · 拍号`;
  setMeterFields('meter', measure.meter);
  setMeterFields('actual', actualMeterOf(measure));
  field('actual-inherit').checked = !measure.actualMeter && measure.length === meterLength(measure.meter);
  field('actual-pickup').checked = measure.pickup;
  selectField('meter-scope').value = 'following';
  selectField('meter-overflow').value = 'keep';
  previewMeter();
  meterDialog.returnValue = '';
  meterDialog.showModal();
}
function applyMeter(index: number, printed: Meter, actual: Meter | undefined, pickup: boolean, scope: string, keep: boolean, mark = true, editActual = false) {
  const before = measureTable(score);
  const first = scope === 'range' ? selectedMeasures().start : index;
  const next = score.measures.findIndex((item, at) => at > first && !!item.meter);
  const last = !mark ? first : scope === 'range' ? selectedMeasures().end : scope === 'one' ? first : next >= 0 ? next - 1 : before.length - 1;
  if (mark) {
    if (scope !== 'following' && before[last + 1] && !score.measures[last + 1].meter)
      score.measures[last + 1].meter = before[last + 1].meter;
    for (let at = first + 1; at <= last; at++) {
      delete score.measures[at].meter;
      delete score.measures[at].meterHidden;
    }
    score.measures[first].meter = printed;
    delete score.measures[first].meterHidden;
  }
  for (let at = last; at >= first; at--) {
    const item = score.measures[at];
    if (at === first && editActual) {
      item.actualMeter = actual;
      item.pickup = !!actual && pickup;
    }
    const keepOldPickup = !editActual && before[at].pickup || at > first && before[at].pickup;
    const inheritedLength = (!editActual || at !== first) && before[at].length !== meterLength(before[at].meter)
      ? before[at].length : meterLength(printed);
    if (!keepOldPickup) setMeasureLength(score, at, item.actualMeter ? meterLength(item.actualMeter) : inheritedLength, keep);
  }
  cursor.at = measureTable(score)[first].start;
  selection = range = null;
  selectedItems = null;
  signSelection = null;
}
meterDialog.onclose = () => {
  if (meterDialog.returnValue !== 'apply') return;
  commit(() => {
    const printed = editMeter('meter');
    const actual = field('actual-inherit').checked ? undefined : editMeter('actual');
    const pickup = field('actual-pickup').checked && !!actual;
    if (pickup && meterLength(actual!) >= meterLength(printed)) throw Error('弱起须短于谱面拍号。');
    const mark = forceVisibleMeter || JSON.stringify(printed) !== JSON.stringify(prepared.measures[measureTarget].meter);
    const header = selection?.kind === 'signature' && selection.header && selection.field === 'meter' && measureTarget === 0;
    if (header) (score.titleSignatures ??= {}).meter = true;
    applyMeter(measureTarget, printed, actual, pickup, selectField('meter-scope').value,
      selectField('meter-overflow').value === 'keep', mark, true);
    if (header) selection = { kind: 'signature', index: 0, field: 'meter', header: true };
  });
};
function fillKeys(fifths = 0) {
  const degree = Number(selectField('key-degree').value) as KeySignature['degree'];
  selectField('key-fifths').replaceChildren(...Array.from({ length: 15 }, (_, index) => {
    const fifths = index - 7;
    const suffix = fifths < 0 ? `${-fifths} 降` : fifths ? `${fifths} 升` : '无升降';
    return new Option(`${keyName({ degree, fifths })}（${suffix}）`, String(fifths));
  }));
  selectField('key-fifths').value = String(fifths);
}
selectField('key-degree').onchange = () => fillKeys(Number(selectField('key-fifths').value));
function openKey(degree: KeySignature['degree'], index = targetMeasure()) {
  lastClick = lastTextClick = null;
  measureTarget = index;
  selectField('key-degree').value = String(degree);
  fillKeys(prepared.measures[measureTarget].key.fifths);
  field('key-only').checked = false;
  selectField('key-sound').value = 'transpose';
  keyDialog.returnValue = '';
  keyDialog.showModal();
}
keyDialog.onclose = () => {
  if (keyDialog.returnValue === 'apply') commit(() => {
    if (selection?.kind === 'signature' && selection.header && selection.field === 'key' && measureTarget === 0)
      (score.titleSignatures ??= {}).key = true;
    setKeySignature(score, measureTarget, {
      degree: Number(selectField('key-degree').value) as KeySignature['degree'], fifths: Number(selectField('key-fifths').value)
    }, field('key-only').checked, selectField('key-sound').value === 'transpose');
  });
};

const styleLabels: Record<StyleRole, string> = { digit: '音符数字', lyric: '歌词', title: '标题', credit: '署名', lane: '声部名', dynamic: '力度', expression: '说明文字', measureNumber: '小节号' };
function redundantSignature() {
  if (!signSelection) return false;
  return canDeleteSignature({ kind: 'signature', index: signSelection.index, field: signSelection.kind });
}
function canDeleteSignature({ index, field }: Extract<ElementSelection, { kind: 'signature' }>) {
  const current = prepared.measures[index];
  const previous = prepared.measures[index - 1];
  return !!previous && (field === 'key' ? sameKey(previous.key, current.key) :
    current.meter.numerator === previous.meter.numerator && current.meter.denominator === previous.meter.denominator);
}
function deleteSignature() {
  if (!signSelection || !redundantSignature()) return;
  const { index, kind } = signSelection;
  commit(() => {
    removeSignature(index, kind);
    signSelection = null;
    selection = selectedItems = null;
  }, '已删除重复的调拍记号。');
}
function removeSignature(index: number, kind: 'key' | 'meter') {
  const measure = score.measures[index];
  if (kind === 'key') { delete measure.key; delete measure.tonic; delete measure.keyHidden; delete measure.keyAppearance; }
  else {
    if (prepared.measures[index].meter.groups.join() !== prepared.measures[index - 1].meter.groups.join()) measure.meterHidden = true;
    else { delete measure.meter; delete measure.meterHidden; }
    delete measure.meterAppearance;
  }
}
function renderSignaturePanel(hostId = 'signature-properties', fieldName?: 'key' | 'meter') {
  const host = get(hostId);
  const picks: ElementSelection[] = fieldName ? [{ kind: 'signature', index: 0, header: true, field: fieldName }] : effectivePicks();
  const signs = picks.filter((pick): pick is Extract<ElementSelection, { kind: 'signature' }> => pick.kind === 'signature');
  const kind = signs[0]?.field;
  const header = signs[0]?.header;
  host.hidden = !fieldName && (inTitleProperties() || !kind || signs.length !== picks.length || signs.some(pick => pick.field !== kind || pick.header !== header));
  if (host.hidden) { host.replaceChildren(); return; }
  if (!fieldName) for (const { index } of signs) for (const glyph of get('score').querySelectorAll(
    `[data-signature="${index}"][data-signature-kind="${kind}"]${header ? '[data-title-signature]' : ':not([data-title-signature])'}`)) glyph.classList.add('picked');
  const measures = signs.map(pick => prepared.measures[pick.index]).sort((a, b) => b.index - a.index);
  const applyMeters = (edit: (measure: typeof measures[number]) => void) => {
    const originals = signs.map(pick => score.measures[pick.index]);
    for (const item of measures) edit(item);
    if (header) (score.titleSignatures ??= {}).meter = true;
    const next = originals.map(bar => ({ kind: 'signature', field: 'meter', index: score.measures.indexOf(bar), header } as const));
    selection = next.at(-1) ?? null;
    selectedItems = next.length > 1 ? next : null;
    if (next.length === 1) signSelection = { index: next[0].index, kind: 'meter' };
  };
  const measure = measures[0];
  const title = document.createElement('p');
  title.textContent = header ? '标题区' : measures.length === 1 ? `第 ${measure.number} 小节` : `已选 ${measures.length} 处${kind === 'key' ? '调号' : '拍号'}`;
  if (kind === 'key') {
    const degree = document.createElement('select');
    degree.append(new Option('1=…', '1'), new Option('6=…', '6'));
    displaySelect(degree, measures.map(item => item.key.degree));
    const fifths = document.createElement('select');
    const options = (current: (string | number)[]) => {
      const basis = Number(degree.value) === 6 ? 6 : 1;
      fifths.replaceChildren(...Array.from({ length: 15 }, (_, i) => new Option(keyName({ degree: basis, fifths: i - 7 }), String(i - 7))));
      displaySelect(fifths, current);
    };
    options(measures.map(item => item.key.fifths));
    degree.onchange = () => options(fifths.value === 'mixed' ? measures.map(item => item.key.fifths) : [fifths.value]);
    const mode = document.createElement('select');
    mode.append(new Option('保留简谱数字，改绝对音高', 'transpose'), new Option('保留绝对音高，改简谱数字', 'keep'));
    fifths.dataset.titleKeyControl = '';
    host.replaceChildren(title, choice('唱名基准', degree), choice('调号', fifths), choice('音高处理', mode), settingsButton('应用调号', () => commit(() => {
      if (header) (score.titleSignatures ??= {}).key = true;
      for (const item of measures) setKeySignature(score, item.index, {
        degree: degree.value === 'mixed' ? item.key.degree : Number(degree.value) as 1 | 6,
        fifths: fifths.value === 'mixed' ? item.key.fifths : Number(fifths.value)
      }, measures.length > 1, mode.value === 'transpose');
    }, '', false)));
  } else {
    const scope = document.createElement('select');
    scope.append(new Option('延续到下一个变拍处', 'following'), new Option('仅本小节', 'one'));
    const printed = document.createElement('fieldset');
    printed.innerHTML = '<legend>谱面拍号</legend>';
    printed.append(...buildMeterFields('sig-meter', measure.meter), choice('应用范围', scope), settingsButton('应用谱面拍号', () =>
      commit(() => {
        const meter = editMeter('sig-meter');
        applyMeters(item => applyMeter(item.index, meter, undefined, false, scope.value, true));
      }, '', false)));
    if (measures.length > 1) scope.value = 'one';
    const actual = document.createElement('fieldset');
    actual.innerHTML = '<legend>实际拍号</legend>';
    const pickup = document.createElement('input'); pickup.type = 'checkbox'; displayCheck(pickup, measures.map(item => item.pickup));
    const duration = document.createElement('p');
    const length = commonValue(measures.map(item => item.length));
    duration.textContent = length === undefined ? '实际时长混合' : `实际时长 ${length / QUARTER} 个四分音符`;
    actual.append(duration, ...buildMeterFields('sig-actual', actualMeterOf(measure)), choice('弱起小节', pickup), settingsButton('应用实际拍号', () => commit(() => {
      const actual = editMeter('sig-actual');
      applyMeters(item => {
        const weak = pickup.indeterminate ? item.pickup : pickup.checked;
        if (weak && meterLength(actual) >= meterLength(item.meter)) throw Error('弱起须短于谱面拍号。');
        applyMeter(item.index, item.meter, actual, weak, 'one', true, false, true);
      });
    }, '', false)));
    host.replaceChildren(title, printed, actual);
    for (const [prefix, meters] of [['sig-meter', measures.map(item => item.meter)], ['sig-actual', measures.map(actualMeterOf)]] as const) {
      displayField(field(prefix + '-top'), meters.map(meter => meter.numerator));
      displaySelect(selectField(prefix + '-base'), meters.map(meter => meter.denominator));
      displayField(field(prefix + '-groups'), meters.map(meter => meter.groups.join('+')), '默认拍组');
    }
  }
  if (signs.some(canDeleteSignature)) host.append(settingsButton('删除重复记号', clear));
}
function inTitleProperties() {
  const pick = selection;
  return pick?.kind === 'header' || pick?.kind === 'signature' && pick.header === true ||
    pick?.kind === 'tempo-mark' && tempoMark(pick.id)?.at === 0;
}
function renderTitleProperties() {
  const heading = inTitleProperties();
  const host = get('title-properties');
  host.hidden = !heading;
  const tempo = get('tempo-mark-properties');
  if (heading) {
    const initial = prepared.measures[0];
    get('title-key-summary').textContent = '调号 · ' + keyName(initial.key);
    get('title-meter-summary').textContent = `拍号 · ${initial.meter.numerator}/${initial.meter.denominator}`;
    const mark = score.tempoMarks?.find(mark => !mark.at && !isSwing(mark));
    get('title-tempo-summary').textContent = '速度 · ' + (mark ? tempoLabel(mark) : `♩ = ${score.tempo}`);
    if (tempo.parentElement !== get('title-tempo-fields')) get('title-tempo-fields').append(tempo);
    renderSignaturePanel('title-key-fields', 'key');
    renderSignaturePanel('title-meter-fields', 'meter');
    if (selection?.kind === 'signature') {
      const detail = get(selection.field === 'key' ? 'title-key-fields' : 'title-meter-fields').closest('details')!;
      detail.open = true;
      get('score').querySelector(`[data-title-signature][data-signature-kind="${selection.field}"]`)?.classList.add('picked');
    }
    if (selection?.kind === 'tempo-mark' || selection?.kind === 'header' && selection.field === 'tempo')
      get('title-tempo-fields').closest('details')!.open = true;
  } else {
    // Remove live controls so hidden elements do not duplicate the in-score signature IDs.
    for (const id of ['title-key-fields', 'title-meter-fields']) get(id).replaceChildren();
    if (tempo.parentElement !== get('panel-properties')) get('tempo-line-properties').before(tempo);
  }
}
const formatDialog = get<HTMLDialogElement>('format-dialog');
const styleTabs = [...get('style-categories').querySelectorAll<HTMLButtonElement>('[role="tab"]')];
function selectStyleTab(selected: HTMLButtonElement) {
  for (const tab of styleTabs) {
    const active = tab === selected;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    get(tab.getAttribute('aria-controls')!).hidden = !active;
  }
  get('style-pages').scrollTop = 0;
  selected.focus({ preventScroll: true });
}
for (const [index, tab] of styleTabs.entries()) {
  tab.onclick = () => selectStyleTab(tab);
  tab.onkeydown = event => {
    const target = { ArrowUp: (index + styleTabs.length - 1) % styleTabs.length,
      ArrowDown: (index + 1) % styleTabs.length, Home: 0, End: styleTabs.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    selectStyleTab(styleTabs[target]);
    styleTabs[target].scrollIntoView({ block: 'nearest' });
  };
}
function styleValue(label: string, control: HTMLInputElement, reset: HTMLButtonElement) {
  const row = document.createElement('div');
  row.className = 'style-value';
  row.append(choice(label, control), reset);
  return row;
}
function renderFormatting() {
  const fontGroup = (role: StyleRole) => {
    const { font, size, cjkFont, italic } = score.textStyles?.[role] ?? TEXT_STYLES[role];
    const family = document.createElement('input');
    Object.assign(family, { value: font, maxLength: 80 });
    const chinese = document.createElement('input');
    Object.assign(chinese, { value: cjkFont ?? 'SimSun', maxLength: 80 });
    const italicControl = document.createElement('input');
    Object.assign(italicControl, { type: 'checkbox', checked: italic ?? true });
    const bilingual = role === 'lyric' || role === 'expression';
    const points = numberInput(size, 9, 48);
    const reset = settingsButton('恢复默认字体', () => {
      commit(() => {
        delete score.textStyles?.[role];
        if (score.textStyles && !Object.keys(score.textStyles).length) delete score.textStyles;
      }, '', false);
      const defaults = TEXT_STYLES[role];
      family.value = defaults.font;
      chinese.value = defaults.cjkFont ?? 'SimSun';
      points.value = String(defaults.size);
      italicControl.checked = defaults.italic ?? true;
      family.setCustomValidity('');
      chinese.setCustomValidity('');
      family.focus();
      reset.disabled = true;
    }, !score.textStyles?.[role]);
    family.id = 'style-font-' + role;
    for (const control of [family, chinese]) control.oninput = () => control.setCustomValidity('');
    const update = () => {
      const validFamily = /^[\p{L}\p{N} ._-]{1,80}$/u;
      for (const control of bilingual ? [family, chinese] : [family]) {
        control.setCustomValidity(validFamily.test(control.value.trim()) ? '' : '请输入有效的字体名称。');
        if (!control.reportValidity()) return;
      }
      if (!points.reportValidity()) return;
      commit(() => {
        (score.textStyles ??= {})[role] = { font: family.value.trim(), size: points.valueAsNumber,
          cjkFont: bilingual ? chinese.value.trim() : undefined, italic: role === 'measureNumber' ? italicControl.checked : undefined };
      }, '', false);
      reset.disabled = false;
    };
    family.onchange = points.onchange = chinese.onchange = italicControl.onchange = update;
    const group = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = role === 'measureNumber' ? '字体外观' : styleLabels[role];
    const fields = document.createElement('div');
    fields.className = 'style-fields';
    fields.append(choice(bilingual ? '西文字体' : '字体', fontPicker(family)),
      ...(bilingual ? [choice('中文字体', fontPicker(chinese))] : []), choice('字号', points));
    if (role === 'measureNumber') {
      const italic = document.createElement('label');
      italic.className = 'check-option';
      italic.append(italicControl, '斜体');
      fields.append(italic);
    }
    const actions = document.createElement('div');
    actions.className = 'style-group-actions';
    actions.append(reset);
    group.append(legend, fields, actions);
    return group;
  };
  get('format-fonts').replaceChildren(...STYLE_ROLES.filter(role => role !== 'measureNumber' && role !== 'lyric').map(fontGroup));
  get('format-measure-number').replaceChildren(fontGroup('measureNumber'));
  get('format-lyrics').replaceChildren(fontGroup('lyric'));
  const labels: Record<keyof EngravingStyle, string> = { arc: '连线线宽', wedge: '渐强渐弱线宽', divisi: '临时分部花括号线宽', continuation: '跨行渐强渐弱最小开口',
    graceBefore: '前倚音与主音间距', graceAfter: '后倚音与主音间距', graceBetween: '倚音数字间距',
    graceBeamGap: '倚音减时线到数字间距', graceDotLift: '倚音附点上移', gracePercent: '倚音字号（主音字号的 %）' };
  const engravingField = (key: keyof EngravingStyle) => {
    const number = numberInput(score.engravingStyle?.[key] ?? ENGRAVING_STYLE[key], ...ENGRAVING_LIMITS[key]);
    number.step = '.05';
    const reset = settingsButton('↶', () => {
      commit(() => {
        delete score.engravingStyle?.[key];
        if (score.engravingStyle && !Object.keys(score.engravingStyle).length) delete score.engravingStyle;
      }, '', false);
      number.value = String(ENGRAVING_STYLE[key]);
      number.focus();
      reset.disabled = true;
    }, score.engravingStyle?.[key] === undefined);
    reset.title = '恢复默认值 · ' + labels[key];
    reset.setAttribute('aria-label', reset.title);
    number.onchange = () => {
      if (!number.checkValidity()) { number.reportValidity(); return; }
      commit(() => { (score.engravingStyle ??= {})[key] = number.valueAsNumber; }, '', false);
      reset.disabled = false;
    };
    return styleValue(labels[key], number, reset);
  };
  get('format-engraving').replaceChildren(engravingField('arc'), engravingField('divisi'));
  get('format-wedges').replaceChildren(engravingField('wedge'), engravingField('continuation'));
  get('format-grace-spacing').replaceChildren(engravingField('graceBefore'), engravingField('graceAfter'), engravingField('graceBetween'));
  get('format-grace-details').replaceChildren(engravingField('gracePercent'), engravingField('graceBeamGap'), engravingField('graceDotLift'));
}
function openFormatting(section?: 'measureNumber') {
  paperControls();
  lastClick = lastTextClick = null;
  renderFormatting();
  if (!formatDialog.open) formatDialog.showModal();
  selectStyleTab(section === 'measureNumber' ? button('style-tab-measure') :
    styleTabs.find(tab => tab.getAttribute('aria-selected') === 'true')!);
}
button('style-save').onclick = () => {
  const values = Object.fromEntries(styleFields.map(key => [key, score[key]]));
  downloadSheet(new Blob([JSON.stringify({ format: 'shupu-style', version: 1, values }, null, 2)], { type: 'application/json' }),
    (score.title.replace(/[\\/:*?"<>|]/g, '_') || '数谱') + '.shupustyle');
};
button('style-load').onclick = () => field('style-file').click();
field('style-file').onchange = async () => {
  const control = field('style-file');
  const file = control.files?.[0];
  control.value = '';
  if (!file) return;
  try {
    if (file.size > 1_000_000) throw Error('样式文件过大。');
    const data = JSON.parse(await file.text());
    if (!['shupu-style', 'choral-jianpu-style'].includes(data?.format) || data.version !== 1 || !data.values || typeof data.values !== 'object' || Array.isArray(data.values))
      throw Error('无法识别此数谱样式文件。');
    const initial = { ...score };
    for (const key of styleFields) Object.assign(initial, { [key]: Object.hasOwn(data.values, key) ? data.values[key] : undefined });
    const checked = openScore(JSON.stringify(initial));
    commit(() => { for (const key of styleFields) Object.assign(score, { [key]: checked[key] }); }, '已应用样式。', false);
    paperControls();
    renderFormatting();
  } catch (error) { alert((error as Error).message); }
};
button('show-number-settings').onclick = () => openFormatting('measureNumber');
selectField('measure-number-mode').onchange = () => commit(() => {
  score.measureNumbers = selectField('measure-number-mode').value === 'hide' ? 'hide' : undefined;
}, '', false);

function drawNotices() {
  const list = score.importNotices ?? [];
  get('notices').hidden = !list.length;
  get('notice-count').textContent = `导入提示（${list.length}）`;
  get('notice-list').replaceChildren(...list.map(notice => {
    const button = document.createElement('button');
    button.textContent = notice.text;
    button.disabled = notice.measure === undefined;
    button.onclick = () => navigateTo(notice.measure!, notice.lane);
    return button;
  }));
}

const navigationDialog = get<HTMLDialogElement>('navigation-dialog');
function navigateTo(index: number, preferredLane?: string, at?: number, pick?: ElementSelection) {
  const measure = prepared.measures[index];
  if (!measure) return;
  const time = at ?? measure.start;
  const system = systemAtIndex(index);
  const active = score.lanes.filter(lane => (!lane.parent || lane.start! <= time && time < lane.end!) &&
    (!system || system.visible.includes(lane.id) || !!lane.parent && system.visible.includes(lane.parent)));
  const lane = active.find(lane => lane.id === preferredLane) ?? active.find(lane => lane.id === cursor.lane) ?? active[0] ?? score.lanes[0];
  if (navigationDialog.open) navigationDialog.close();
  select({ lane: lane.id, at: time }, false, pick);
  const target = pick && [...get('score').querySelectorAll<SVGElement>('[data-element]')]
    .find(node => appearanceKey(JSON.parse(node.dataset.element!)) === appearanceKey(pick));
  (target || document.querySelector(`[data-play-measure="${index}"]`))?.scrollIntoView({ block: 'center', inline: 'nearest' });
}
type NavigationEntry = { text: string; index?: number; lane?: string; at?: number; pick?: ElementSelection };
function collectNavigation() {
  const bars = prepared.measures;
  const outline: NavigationEntry[] = [];
  for (const [index, bar] of score.measures.entries()) {
    if (!index || bar.key || bar.tonic !== undefined) outline.push({ index, text: keyName(bars[index].key), pick: {
      kind: 'signature', index, field: 'key', header: !index && titleSignature(score, 'key') ? true : undefined } });
    if (!index || bar.meter) outline.push({ index, text: `谱面拍号 ${bars[index].meter.numerator}/${bars[index].meter.denominator}`,
      pick: { kind: 'signature', index, field: 'meter', header: !index && titleSignature(score, 'meter') ? true : undefined } });
    if (bar.actualMeter || bars[index].pickup) outline.push({ index, text: `实际长度 ${bar.length / QUARTER} 拍${bars[index].pickup ? ' · 弱起' : ''}` });
    for (const mark of bar.route ?? []) outline.push({ index, text: routeCaption(mark), pick: { kind: 'route', id: mark.id, index } });
  }
  for (const note of score.notes) if (note.rehearsal) {
    const index = bars.findIndex(bar => note.at < bar.end);
    if (index >= 0) outline.push({ index, lane: note.lane, at: note.at, text: '排练标记 ' + note.rehearsal,
      pick: { kind: 'mark', id: note.id, field: 'rehearsal' } });
  }
  const issues: NavigationEntry[] = (score.importNotices ?? []).map(notice => ({
    text: notice.text, index: notice.measure, lane: notice.lane,
    at: notice.measure !== undefined && notice.offset !== undefined && bars[notice.measure] ?
      bars[notice.measure].start + Math.min(notice.offset, Math.max(0, bars[notice.measure].length - .01)) : undefined
  }));
  const review: NavigationEntry[] = [];
  for (const [lane, tokens] of prepared.byLane) {
    const groups = lyricGroups(score, prepared, lane);
    const verses = new Set(tokens.flatMap(token => noteVerses(token.note).map(verse => verse.number)));
    for (const verse of verses) {
      const words = new Map(tokens.map(token => [token.at, lyricValue(token, verse)]));
      const written = tokens.filter(token => words.get(token.at));
      if (written.length < 2) continue;
      const stops = new Set(lyricStops(tokens, groups, words));
      const gaps = new Map<number, Token[]>();
      for (const token of tokens) if (token.at > written[0].at && token.at < written.at(-1)!.at && stops.has(token.at) && !words.get(token.at)) {
        const row = gaps.get(token.measure) ?? [];
        row.push(token);
        gaps.set(token.measure, row);
      }
      for (const [index, row] of gaps) review.push({ index, lane, at: row[0].at, pick: rhythmPick(row[0], row[0].at),
        text: `待复核 · 第 ${verse} 行歌词中有 ${row.length} 个空唱位` });
    }
  }
  for (const issue of routeIssues(score.measures)) issues.push({ index: issue.index, text: issue.text,
    pick: { kind: 'route', id: issue.mark.id, index: issue.index } });
  const notes = new Set(score.notes.map(note => note.id));
  for (const span of score.spans) if (!notes.has(span.from) || !notes.has(span.to))
    issues.push({ text: '有线性记号的端点已失去锚定。' });
  for (const warning of engravingWarnings) {
    const position = /^锁定谱行超出可用页宽（小节 (\d+)/.exec(warning);
    issues.push({ text: warning, index: position ? Number(position[1]) - 1 : undefined });
  }
  return { outline, issues, review };
}
let navigationEntries: ReturnType<typeof collectNavigation>;
function drawNavigation(jump = false) {
  const query = field('nav-search').value.trim().toLowerCase();
  const mode = selectField('nav-kind').value;
  const bars = prepared.measures;
  const matching = query ? bars.filter(bar => String(bar.number).toLowerCase() === query) : [];
  if (jump && matching.length === 1) { navigateTo(matching[0].index); return; }
  const { outline, issues, review } = navigationEntries ?? collectNavigation();
  const entries = query ? [
    ...matching.map(bar => ({ index: bar.index, text: '跳至小节' })),
    ...(mode === 'issue' ? [] : outline).filter(entry => matching.some(bar => bar.index === entry.index)),
    ...(mode === 'outline' ? [] : [...issues, ...review]).filter(entry => matching.some(bar => bar.index === entry.index))
  ] : [...(mode === 'issue' ? [] : outline), ...(mode === 'outline' ? [] : [...issues, ...review])];
  get('nav-summary').textContent = query ? (matching.length ? `找到 ${matching.length} 个同号小节。` : '没有找到这个谱面小节号。')
    : `${outline.length} 处谱面标记 · ${issues.length} 条校对提示 · ${review.length} 处待复核`;
  get('nav-results').replaceChildren(...entries.map((entry: NavigationEntry) => {
    if (entry.index === undefined || !bars[entry.index]) {
      const item = document.createElement('div');
      item.className = 'layout-help';
      item.textContent = entry.text;
      return item;
    }
    const index = entry.index;
    const lane = score.lanes.find(lane => lane.id === entry.lane);
    const name = lane?.parent ? `${score.lanes.find(row => row.id === lane.parent)?.name} / ${lane.name}` : lane?.name;
    return settingsButton(`小节 ${bars[index].number}（第 ${index + 1} 个）${name ? ' · ' + name : ''} · ${entry.text}`,
      () => navigateTo(index, entry.lane, entry.at, entry.pick));
  }));
}
get<HTMLFormElement>('nav-search-form').onsubmit = event => { event.preventDefault(); drawNavigation(true); };
field('nav-search').oninput = () => drawNavigation();
selectField('nav-kind').onchange = () => drawNavigation();
button('nav-play-order').onclick = () => {
  const order = repeatIntervals(score, 0, score.measures.length - 1);
  const list = order.map(item => String(prepared.measures[item.index].number));
  const text = document.createElement('p');
  text.textContent = list.join(' → ');
  const host = get('nav-order');
  host.replaceChildren(text, settingsButton('从头试听', () => { navigationDialog.close(); void startPlayback(true); }));
  host.hidden = false;
};

function openChordSymbol() {
  const id = selection?.kind === 'chord-symbol' ? selection.id : undefined;
  const old = score.chordSymbols?.find(symbol => symbol.id === id || symbol.lane === cursor.lane && symbol.at === cursor.at);
  startText({ kind: 'chord-symbol', id: old?.id ?? uid() }, old ? undefined : { ...cursor });
}

function addRouteMark(kind: RouteKind = 'segno') {
  const index = targetMeasure();
  const mark: RouteMark = { id: uid(), kind, target: '1' };
  commit(() => {
    const list = score.measures[index].route ??= [];
    const existing = list.find(other => other.kind === kind && other.target === mark.target);
    if (!existing) {
      if (list.length >= 30) throw Error('该小节放置的跳转记号过多。');
      list.push(mark);
    }
    selection = { kind: 'route', id: existing?.id ?? mark.id, index };
    range = selectedItems = null;
  });
  workbench.setPanel('properties');
}

function selectedRoute() {
  const pick = selection;
  return pick?.kind === 'route' ? score.measures[pick.index]?.route?.find(mark => mark.id === pick.id) : undefined;
}
function selectedChord() {
  const id = selection?.kind === 'chord-symbol' ? selection.id : undefined;
  return score.chordSymbols?.find(symbol => symbol.id === id);
}
function renderAdditionalProperties() {
  const route = selectedRoute();
  get('route-properties').hidden = !route;
  if (route) {
    selectField('route-kind').value = route.kind;
    field('route-target').value = route.target;
    const named = route.kind !== 'dc' && route.kind !== 'fine';
    const returning = route.kind === 'dc' || route.kind === 'ds';
    get('route-target-row').hidden = field('route-target').disabled = !named;
    get('route-return').hidden = !returning;
    selectField('route-until').value = route.until ?? '';
    field('route-repeat').checked = !!route.repeat;
  }
  const chord = selectedChord();
  get('chord-properties').hidden = !chord;
  const unknown = score.chordSymbols?.filter(symbol => !parseChord(symbol.text)).length ?? 0;
  get('chord-warning').textContent = chord && !parseChord(chord.text) ? '无法识别谱面和弦「' + chord.text + '」' +
    (chord.actual ? '，将使用属性中设置的实际和弦。' : '。') : unknown ? `有 ${unknown} 个谱面和弦代号无法识别。` : '';
  if (chord) {
    get('chord-recognition').textContent = parseChord(chord.text) ? '谱面文字可识别' : '谱面文字无法识别';
    field('chord-actual').value = chord.actual ?? '';
    field('chord-actual').setCustomValidity('');
  }
}
for (const id of ['route-kind', 'route-target', 'route-until', 'route-repeat']) get<HTMLInputElement>(id).onchange = () => {
  const mark = selectedRoute();
  if (!mark || selection?.kind !== 'route') return;
  const kind = selectField('route-kind').value as RouteKind;
  const named = kind !== 'dc' && kind !== 'fine';
  const target = named ? field('route-target').value.trim() || '1' : '1';
  if (score.measures[selection.index].route?.some(other => other !== mark && other.kind === kind && other.target === target)) {
    message = '该小节已有同名记号。';
    render();
    return;
  }
  const until = selectField('route-until').value;
  const returning = kind === 'dc' || kind === 'ds';
  commit(() => Object.assign(mark, { kind, target, until: returning && until ? until : undefined,
    repeat: returning ? field('route-repeat').checked : undefined }), '', false);
};
field('chord-actual').oninput = () => field('chord-actual').setCustomValidity('');
field('chord-actual').onchange = () => {
  const chord = selectedChord();
  if (!chord) return;
  const control = field('chord-actual');
  const value = control.value.trim();
  if (value && !parseChord(value)) {
    control.setCustomValidity('实际和弦须为可识别的和弦代号。');
    control.reportValidity();
    return;
  }
  commit(() => { chord.actual = value || undefined; }, '', false);
};

const lineDialog = get<HTMLDialogElement>('line-dialog');
function lineRuleFields() {
  const enabled = field('line-rule-enabled').checked;
  const start = field('line-rule-start');
  start.min = selectField('line-rule-by').value === 'position' ? '1' : String(Number.MIN_SAFE_INTEGER);
  get('line-rule-settings').hidden = !enabled;
  for (const control of get('line-rule-settings').querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select')) control.disabled = !enabled;
  button('line-only-selection').disabled = !enabled;
}
function openLineLayout() {
  const rule = score.lineRule ?? { start: 1, count: 4, by: 'position', overflow: 'continue' };
  field('line-rule-enabled').checked = !!score.lineRule;
  field('line-rule-start').value = String(rule.start);
  field('line-rule-count').value = String(rule.count);
  selectField('line-rule-by').value = rule.by;
  selectField('line-rule-overflow').value = rule.overflow;
  lineRuleFields();
  lineDialog.showModal();
}
function applyLineLayout(selectionOnly: boolean) {
  if (!lineDialog.querySelector('form')!.reportValidity()) return;
  const rule: LineRule = { start: field('line-rule-start').valueAsNumber, count: field('line-rule-count').valueAsNumber,
    by: selectField('line-rule-by').value === 'number' ? 'number' : 'position',
    overflow: selectField('line-rule-overflow').value === 'restart' ? 'restart' : 'continue' };
  if (field('line-rule-enabled').checked && !Number.isSafeInteger(rule.start)) return;
  lineDialog.close();
  commit(() => {
    if (!selectionOnly) {
      score.lineRule = field('line-rule-enabled').checked ? rule : undefined;
      return;
    }
    const { start, end } = selectedMeasures();
    const section = { id: uid(), count: rule.count, by: rule.by, overflow: rule.overflow };
    detachLineLock(start, end);
    for (let index = start; index <= end; index++) {
      const bar = score.measures[index];
      bar.lineSection = { ...section };
      delete bar.keepWithNext;
      delete bar.lockLineEnd;
      if (index > start && boundaryAt(score, index).break === 'line') setBoundaryBreak(score, index);
    }
  });
}
field('line-rule-enabled').onchange = selectField('line-rule-by').onchange = lineRuleFields;
lineDialog.querySelector('form')!.onsubmit = event => { event.preventDefault(); applyLineLayout(false); };
button('line-only-selection').onclick = () => applyLineLayout(true);
button('line-dialog-cancel').onclick = () => lineDialog.close();
function setLineLock(locked: boolean) {
  const selected = selectedMeasures();
  const current = systemAtIndex(selected.start);
  const { start, end } = range || selectedItems?.length ? selected : { start: current?.first ?? selected.start, end: current?.last ?? selected.end };
  commit(() => {
    detachLineLock(start, end);
    for (let i = start; i <= end; i++) {
      score.measures[i].keepWithNext = locked && i < end || undefined;
      score.measures[i].lockLineEnd = locked && i === end || undefined;
      if (locked && i > start && boundaryAt(score, i).break === 'line') setBoundaryBreak(score, i);
    }
  });
}
function detachLineLock(start: number, end: number) {
  const before = score.measures[start - 1];
  if (before?.keepWithNext) { delete before.keepWithNext; before.lockLineEnd = true; }
  const after = score.measures[end + 1];
  if (after && score.measures[end]?.keepWithNext && !after.keepWithNext) after.lockLineEnd = true;
}

function selectedMeasures() {
  const measures = measureTable(score);
  const picked = selectedItems?.length ? displayedObjects().filter(row => row.at !== undefined &&
    selectedItems!.some(pick => appearanceKey(pick) === appearanceKey(row.pick))).map(row => row.at!) : [];
  const where = [cursor.at, range?.at ?? cursor.at, ...picked];
  return {
    start: (measures.find(item => Math.min(...where) < item.end) ?? measures[0]).index,
    end: (measures.find(item => Math.max(...where) < item.end) ?? measures.at(-1)!).index
  };
}

function setEnding(preset?: number) { commit(() => {
  lastClick = null;
  const existing = selection?.kind === 'ending' ? score.endings?.[selection.index] : undefined;
  const text = field('ending-passes').value.trim();
  const passes = preset ? [preset] : text ? [...new Set(text.split(/[,，]/).map(Number))].sort((left, right) => left - right) : [];
  if (passes.some(pass => !Number.isInteger(pass) || pass < 1 || pass > 8)) throw Error('填写房子遍数，如 1 或 2,3。');
  const measures = prepared.measures;
  const picks = selectedPicks();
  if (picks.length > 1 && picks.every(pick => pick.kind === 'ending')) {
    for (const pick of picks) {
      const ending = score.endings?.[pick.index];
      if (!ending) continue;
      if (passes.length) ending.passes = [...passes];
      if (!field('ending-open').indeterminate) ending.open = field('ending-open').checked;
    }
    return;
  }
  if (!passes.length) throw Error('填写房子遍数，如 1 或 2,3。');
  if (existing) {
    const start = Number(field('ending-from').value) - 1;
    const end = Number(field('ending-to').value) - 1;
    const from = start === existing.start ? endingRange(existing, measures).from : measures[start]?.start;
    const to = end === existing.end ? endingRange(existing, measures).to : measures[end]?.end;
    setEndingRange(score, existing, from, to);
    Object.assign(existing, { passes, open: field('ending-open').checked });
  } else {
    const tokens = spanNoteTargets();
    const first = tokens[0];
    const last = tokens.at(-1);
    const fallback = first && first === last ? singleLineEnd(first, passes.join(',').length * 7 + 16) : undefined;
    if (!first || !last) throw Error('请先在谱面选中音符数字。');
    const ending: Ending = { start: first.measure, end: last.measure, passes, open: preset === 2 };
    setEndingRange(score, ending, first.at, fallback ? fallback.token ? fallback.token.at + fallback.token.length : fallback.at : last.at + last.length);
    (score.endings ??= []).push(ending);
    selection = { kind: 'ending', index: score.endings.length - 1 };
  }
  pickedEndpoint = undefined;
  range = null;
}); workbench.setPanel('properties', false); get<HTMLDetailsElement>('repeat-tools').open = true; }
button('ending-set').onclick = () => setEnding();
button('ending-clear').onclick = () => commit(() => {
  const indices = new Set(selectedPicks().flatMap(pick => pick.kind === 'ending' ? [pick.index] : []));
  if (indices.size) {
    score.endings = score.endings?.filter((_, i) => !indices.has(i));
    selection = selectedItems = null;
    return;
  }
  const { start, end } = selectedMeasures();
  score.endings = score.endings?.filter(ending => ending.end < start || ending.start > end);
});
button('sample').onclick = () => replace(exampleScore(), true);
const paperPresets: Record<string, [number, number]> = { a4: [210, 297], a5: [148, 210], b5: [176, 250], letter: [215.9, 279.4] };
function paperControls() {
  const { width, height } = paperSize(score);
  field('paper-width').value = String(width);
  field('paper-height').value = String(height);
  selectField('paper-preset').value = Object.keys(paperPresets).find(key => {
    const [w, h] = paperPresets[key];
    return width === w && height === h || width === h && height === w;
  }) ?? 'custom';
  selectField('paper-orientation').value = width === height ? 'square' : width > height ? 'landscape' : 'portrait';
  const folio = score.folio || DEFAULT_FOLIO;
  field('folio-show').checked = score.folio !== false;
  field('folio-first').disabled = score.folio === false;
  get<HTMLFieldSetElement>('folio-placement').disabled = score.folio === false;
  field('folio-start').value = String(folio.start);
  field('folio-first').checked = folio.first;
  selectField('folio-position').value = folio.position;
  selectField('folio-align').value = folio.align;
}
function setPaper(width: number, height: number) {
  if (![width, height].every(value => Number.isFinite(value) && value >= 80 && value <= 1200)) { paperControls(); return; }
  commit(() => { score.paper = { width, height }; }, '', false);
  updateZoom();
  paperControls();
}
selectField('paper-preset').onchange = () => {
  const preset = paperPresets[selectField('paper-preset').value];
  if (!preset) { field('paper-width').focus(); return; }
  const { width, height } = paperSize(score);
  setPaper(...(width > height ? [preset[1], preset[0]] as const : preset));
};
for (const axis of ['width', 'height']) field('paper-' + axis).onchange = () =>
  setPaper(field('paper-width').valueAsNumber, field('paper-height').valueAsNumber);
selectField('paper-orientation').onchange = () => {
  const { width, height } = paperSize(score);
  if (width !== height && (selectField('paper-orientation').value === 'landscape') !== (width > height)) setPaper(height, width);
  else paperControls();
};
for (const key of ['show', 'start', 'first', 'position', 'align']) field('folio-' + key).onchange = () => {
  const start = field('folio-start').valueAsNumber;
  if (!Number.isInteger(start) || start < 1 || start > 9999) { paperControls(); return; }
  commit(() => { score.folio = field('folio-show').checked ? {
    start, first: field('folio-first').checked, position: selectField('folio-position').value === 'top' ? 'top' : 'bottom',
    align: selectField('folio-align').value === 'outside' ? 'outside' : 'center'
  } : false; }, '', false);
  field('folio-first').disabled = !field('folio-show').checked;
  get<HTMLFieldSetElement>('folio-placement').disabled = !field('folio-show').checked;
};
const sheetDialog = get<HTMLDialogElement>('export-pages');
const printPaperRule = new CSSStyleSheet();
document.adoptedStyleSheets = [...document.adoptedStyleSheets, printPaperRule];
let outputRange: number[] | undefined;
let outputScore: Score | undefined;
function scorePages(view = score) {
  const template = document.createElement('template');
  template.innerHTML = engrave(view, { lane: view.lanes[0].id, at: -1 }, null).pages;
  for (const element of template.content.querySelectorAll('.score-invisible,.layout-mark,.line-hit,.snap-target,.input-cursor,.play-measure,.playhead,.span-handle,[data-staff-target],[data-column-move],.span-target'))
    element.remove();
  return [...template.content.querySelectorAll('svg')];
}
function setPrintPages() {
  if (document.body.classList.contains('printing-manual')) return;
  const { width, height } = paperSize(outputScore ?? score);
  const dimensions = document.documentElement.style;
  dimensions.setProperty('--print-width', width + 'mm');
  dimensions.setProperty('--print-height', (height - .1) + 'mm');
  printPaperRule.replaceSync(`@page { size: ${width}mm ${height}mm; margin: 0; }`);
  const host = get('print-output');
  applyScoreStyles(host.style, outputScore ?? score);
  host.replaceChildren(...scorePages(outputScore).filter((_, i) => !outputRange || outputRange.includes(i + 1)));
}
window.addEventListener('beforeprint', setPrintPages);
function clearManualPrint() {
  document.body.classList.remove('printing-manual');
  get('manual-print-output').replaceChildren();
}
window.addEventListener('afterprint', () => {
  clearManualPrint();
  if (!outputRange) get('print-output').replaceChildren();
});
async function printManual(pages: HTMLElement) {
  const host = get('manual-print-output');
  host.replaceChildren(pages);
  printPaperRule.replaceSync('@page { size: A4; margin: 17mm; }');
  document.body.classList.add('printing-manual');
  const desktop = (window as Window & { desktopScore?: { exportPDF: (output?: 'manual') => Promise<boolean> } }).desktopScore;
  if (!desktop) { window.print(); return; }
  try { await desktop.exportPDF('manual'); }
  catch (error) { alert((error as Error).message); }
  finally { clearManualPrint(); }
}
function svgOutput(page: SVGSVGElement, view = score) {
  const { width, height } = paperSize(view);
  page.setAttribute('width', width + 'mm');
  page.setAttribute('height', height + 'mm');
  page.setAttribute('version', '1.1');
  const styles = [...document.styleSheets].flatMap(sheet => {
    try { return [...sheet.cssRules]; } catch { return []; }
  })
    .filter((rule): rule is CSSStyleRule => rule.type === CSSRule.STYLE_RULE && (rule as CSSStyleRule).selectorText.startsWith('.sheet'))
    .filter(rule => rule.selectorText !== '.sheet');
  const properties = page.style;
  applyScoreStyles(properties, view);
  const variables = [...properties].filter(name => /^--(?!paper-)/.test(name)).map(name => `${name}:${properties.getPropertyValue(name)}`);
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = `.sheet{color:#171a19;${variables.join(';')}}\n${styles.map(rule => rule.cssText).join('\n')}`;
  if (styles.length) page.prepend(style);
  {
    const host = get('print-output');
    for (const property of properties) if (property.startsWith('--')) host.style.setProperty(property, properties.getPropertyValue(property));
    host.append(page);
    const resolved = [...page.querySelectorAll<SVGElement>('text, tspan, path, line, circle, rect, ellipse, polygon, polyline')].map(element => {
      const source = getComputedStyle(element);
      const keys = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
        'font-family', 'font-size', 'font-style', 'font-weight', 'font-stretch', 'text-decoration',
        'font-variant-numeric', 'letter-spacing', 'text-anchor'];
      return { element, values: keys.map(key => [key, source.getPropertyValue(key)]) };
    });
    page.remove();
    for (const { element, values } of resolved) for (const [key, value] of values) element.style.setProperty(key, value);
  }
  return new Blob([new XMLSerializer().serializeToString(page)], { type: 'image/svg+xml;charset=utf-8' });
}
function downloadSheet(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function sheetFormatChanged() {
  const format = selectField('sheet-format').value;
  get('sheet-range-row').hidden = format === 'musicxml';
  get('sheet-dpi-row').hidden = format !== 'png';
  get('sheet-background-row').hidden = format !== 'png' && format !== 'svg';
}
selectField('sheet-format').onchange = sheetFormatChanged;
let lastExportFormat = '';
try { lastExportFormat = localStorage.getItem('shupu-last-export-format') ?? ''; } catch {}
function openSheetExport(part = '') {
  if (inline) finishInline(true);
  stopPlayback();
  get('sheet-export-status').textContent = '';
  selectField('sheet-source').replaceChildren(new Option('总谱', ''), ...(activeDocument.master.linkedParts ?? []).map(part => new Option(part.name, part.id)));
  selectField('sheet-source').value = part || activePart;
  const formats = selectField('sheet-format');
  formats.value = preferences.rememberFormat && [...formats.options].some(option => option.value === lastExportFormat)
    ? lastExportFormat : preferences.format;
  selectField('sheet-dpi').value = preferences.dpi;
  field('sheet-transparent').checked = preferences.transparent;
  sheetFormatChanged();
  sheetDialog.showModal();
}
button('print').onclick = () => openSheetExport();
button('sheet-export-cancel').onclick = () => sheetDialog.close();
sheetDialog.querySelector('form')!.onsubmit = async event => {
  event.preventDefault();
  const buttonSave = button('sheet-export-save');
  const status = get('sheet-export-status');
  buttonSave.disabled = true;
  try {
    const format = selectField('sheet-format').value;
    if (preferences.rememberFormat) {
      lastExportFormat = format;
      try { localStorage.setItem('shupu-last-export-format', format); } catch {}
    }
    const master = activeDocument.master;
    const part = master.linkedParts?.find(part => part.id === selectField('sheet-source').value);
    if (format === 'musicxml') {
      sheetDialog.close();
      launchExport(part ?? null);
      return;
    }
    const view = part ? partScore(master, part) : master;
    await document.fonts.ready;
    const rendered = scorePages(view);
    const pages = pageRange(field('sheet-range').value, rendered.length);
    if (format === 'pdf') {
      outputRange = pages;
      outputScore = view;
      setPrintPages();
      const desktop = (window as Window & { desktopScore?: { exportPDF: () => Promise<boolean> } }).desktopScore;
      sheetDialog.close();
      if (desktop) { if (await desktop.exportPDF()) message = '已导出谱面 PDF。'; }
      else window.print();
    } else {
      const { width, height } = paperSize(view);
      const dpi = Number(field('sheet-dpi').value);
      const base = [score.title, part?.name].filter(Boolean).join('-').replace(/[\\/:*?"<>|]/g, '_').trim() || '简谱';
      const files = [];
      for (const page of pages) {
        status.textContent = `正在导出第 ${page} 页…`;
        const drawing = rendered[page - 1];
        if (format === 'svg' && !field('sheet-transparent').checked) {
          const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          background.setAttribute('width', '100%');
          background.setAttribute('height', '100%');
          background.setAttribute('fill', 'white');
          drawing.prepend(background);
        }
        const svg = svgOutput(drawing, view);
        const blob = format === 'svg' ? svg : await rasterPage(svg, width, height, dpi, field('sheet-transparent').checked);
        files.push({ name: `${base}-${page}.${format}`, blob });
      }
      if (files.length === 1) downloadSheet(files[0].blob, files[0].name);
      else downloadSheet(await packPages(files), `${base}-${format.toUpperCase()}.zip`);
      sheetDialog.close();
      message = `已导出 ${files.length} 页 ${format.toUpperCase()}。`;
    }
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
    if (!sheetDialog.open) sheetDialog.showModal();
  } finally {
    outputRange = undefined;
    outputScore = undefined;
    get('print-output').replaceChildren();
    buttonSave.disabled = false;
    if (!sheetDialog.open) controls();
  }
};
const partsDialog = get<HTMLDialogElement>('parts-dialog');
let partId = '';
function drawPartEditor() {
  const part = score.linkedParts?.find(part => part.id === partId);
  const roots = score.lanes.filter(lane => !lane.parent);
  selectField('part-list').replaceChildren(new Option('新分谱', ''), ...(score.linkedParts ?? []).map(part => new Option(part.name, part.id)));
  selectField('part-list').value = part?.id ?? '';
  field('part-name').value = part?.name ?? '';
  field('part-scale').value = String(part?.scalePercent ?? '');
  field('part-count').value = String(part?.lineRule?.count ?? '');
  field('part-show-names').checked = part?.showNames !== false;
  field('part-show-lyrics').checked = part?.showLyrics !== false;
  field('part-show-dynamics').checked = part?.showDynamics !== false;
  field('part-use-master-breaks').checked = part?.copyBreaks === true;
  const breaks = (mode: 'line' | 'page') => part ? score.measures.flatMap((bar, i) =>
    bar.partBreaks?.[part.id] === mode ? [i + 1] : []).join(', ') : '';
  field('part-line-breaks').value = breaks('line');
  field('part-page-breaks').value = breaks('page');
  get('part-lanes').replaceChildren(...roots.map(lane => {
    const label = document.createElement('label');
    const control = document.createElement('input');
    control.type = 'checkbox';
    control.value = lane.id;
    control.checked = part?.lanes.includes(lane.id) ?? (lane.id === (score.lanes.find(row => row.id === cursor.lane)?.parent ?? cursor.lane));
    label.className = 'check-option';
    label.append(control, lane.name || lane.id);
    return label;
  }));
  get('part-error').textContent = '';
  button('part-delete').disabled = button('part-export').disabled = !part;
  button('part-export-xml').disabled = !part;
  button('part-open').disabled = button('part-independent').disabled = !part;
  const preview = get('part-preview');
  if (part) {
    try {
      const view = partScore(score, part);
      applyScoreStyles(preview.style, view);
      preview.replaceChildren(...scorePages(view));
    } catch (error) {
      preview.replaceChildren();
      get('part-error').textContent = (error as Error).message;
    }
  }
  else preview.textContent = '选择声部并保存分谱后，可预览整份谱面。';
}
function openLinkedParts() {
  const previous = activePart;
  if (activePart) activateDocument(activeDocument);
  partId = previous || score.linkedParts?.[0]?.id || '';
  drawPartEditor();
  partsDialog.showModal();
}
selectField('part-list').onchange = () => { partId = selectField('part-list').value; drawPartEditor(); };
button('part-new').onclick = () => { partId = ''; drawPartEditor(); field('part-name').focus(); };
button('part-close').onclick = () => partsDialog.close();
function openPartTab() {
  if (!score.linkedParts?.some(part => part.id === partId)) return false;
  try {
    activateDocument(activeDocument, partId);
    partsDialog.close();
    focus();
    return true;
  } catch (error) {
    get('part-error').textContent = (error as Error).message;
    return false;
  }
}
button('part-open').onclick = openPartTab;
button('part-independent').onclick = () => { if (openPartTab()) void saveAs(); };
button('part-delete').onclick = () => {
  commit(() => {
    score.linkedParts = score.linkedParts?.filter(part => part.id !== partId);
    for (const bar of score.measures) if (bar.partBreaks) {
      delete bar.partBreaks[partId];
      if (!Object.keys(bar.partBreaks).length) delete bar.partBreaks;
    }
  }, '', false);
  activeDocument.partOrder = activeDocument.partOrder.filter(id => id !== partId);
  recover();
  partId = score.linkedParts?.[0]?.id ?? '';
  drawPartEditor();
};
button('part-export').onclick = () => { partsDialog.close(); openSheetExport(partId); };
button('part-export-xml').onclick = () => {
  const part = score.linkedParts?.find(part => part.id === partId);
  if (part) { partsDialog.close(); launchExport(part); }
};
get<HTMLFormElement>('part-editor').onsubmit = event => {
  event.preventDefault();
  const name = field('part-name').value.trim();
  const lanes = [...get('part-lanes').querySelectorAll<HTMLInputElement>('input:checked')].map(control => control.value);
  try {
    if (!name || !lanes.length) throw Error('请填写名称并选择至少一个声部。');
    if (!partId && (score.linkedParts?.length ?? 0) >= 100) throw Error('已达到 100 份分谱。');
    const positions = (id: string) => field(id).value.trim().split(/[\s,，、]+/).filter(Boolean).map(value => {
      const index = Number(value) - 1;
      if (!/^\d+$/.test(value) || !Number.isInteger(index) || index <= 0 || index >= score.measures.length)
        throw Error('换行和换页位置必须是第 2 个小节至最后一个小节之间的整数。');
      return index;
    });
    const lines = positions('part-line-breaks'), pages = positions('part-page-breaks');
    const count = field('part-count').valueAsNumber;
    const previous = score.linkedParts?.find(item => item.id === partId);
    const part: LinkedPart = { id: partId || uid(), name, lanes, scalePercent: field('part-scale').valueAsNumber || undefined,
      presentation: previous?.presentation,
      lineRule: count ? { start: 1, count, by: 'position', overflow: 'continue' } : undefined,
      copyBreaks: field('part-use-master-breaks').checked, showNames: field('part-show-names').checked,
      showLyrics: field('part-show-lyrics').checked, showDynamics: field('part-show-dynamics').checked };
    commit(() => {
      const all = score.linkedParts ??= [];
      const index = all.findIndex(other => other.id === part.id);
      if (index >= 0) all[index] = part;
      else all.push(part);
      for (const bar of score.measures) if (bar.partBreaks) {
        delete bar.partBreaks[part.id];
        if (!Object.keys(bar.partBreaks).length) delete bar.partBreaks;
      }
      for (const i of lines) (score.measures[i].partBreaks ??= {})[part.id] = 'line';
      for (const i of pages) (score.measures[i].partBreaks ??= {})[part.id] = 'page';
      ensurePartAnchors(score);
      const view = editablePart(score, part);
      view.scalePercent = part.scalePercent;
      view.lineRule = part.lineRule;
      for (let i = 1; i < score.measures.length; i++)
        setBoundaryBreak(view, i, score.measures[i].partBreaks?.[part.id] ?? (part.copyBreaks ? boundaryAt(score, i).break : undefined));
      part.presentation = capturePartPresentation(view);
    }, '', false);
    partId = part.id;
    drawPartEditor();
  } catch (error) {
    get('part-error').textContent = (error as Error).message;
  }
};
button('help').onclick = () => helpPages.openIntro();
const setup = get<HTMLDialogElement>('setup');
const headerFields = ['title', 'subtitle', 'credit', 'lyricist', 'composer', 'arranger', 'copyright'] as const;
let setupLanes: Lane[] = [];
const setupPresets: Record<string, string[]> = { solo: ['旋律'], duet: ['声部一', '声部二'], SA: ['女高音', '女低音'],
  TB: ['男高音', '男低音'], SATB: ['女高音', '女低音', '男高音', '男低音'], piano: ['右手', '左手'] };
function setupVoicePreset(preset: string) {
  if (!(preset in setupPresets)) return;
  const abbreviations: Record<string, string[]> = { SA: ['S.', 'A.'], TB: ['T.', 'B.'], SATB: ['S.', 'A.', 'T.', 'B.'], piano: ['RH', 'LH'] };
  setupLanes = setupPresets[preset].map((name, i) => ({
    id: uid(), name, shortName: abbreviations[preset]?.[i], fullNoteVolume: preset === 'piano' || undefined,
    octave: /男/.test(name) || preset === 'piano' && i === 1 ? 3 : 4
  }));
  drawSetupLanes();
}
function drawSetupLanes() {
  get('setup-lanes').replaceChildren(...setupLanes.map((lane, index) => {
    const row = document.createElement('div');
    row.className = 'setup-voice';
    const name = document.createElement('input'), short = document.createElement('input');
    Object.assign(name, { value: lane.name, required: true, maxLength: 80, oninput: () => { lane.name = name.value; } });
    Object.assign(short, { value: lane.shortName ?? '', maxLength: 40, oninput: () => { lane.shortName = short.value; } });
    const move = (to: number) => { setupLanes.splice(index, 1); setupLanes.splice(to, 0, lane); drawSetupLanes(); };
    const remove = settingsButton('删除', () => { setupLanes.splice(index, 1); drawSetupLanes(); }, setupLanes.length === 1);
    const octave = numberInput(lane.octave, 1, 7);
    octave.oninput = () => { lane.octave = octave.valueAsNumber; };
    const displayOctave = numberInput(lane.displayOctave ?? lane.octave, 1, 7);
    displayOctave.oninput = () => { lane.displayOctave = displayOctave.valueAsNumber; };
    const display = document.createElement('select');
    display.append(new Option('常显', 'show'), new Option('常隐', 'hide'), new Option('全休止行隐藏', 'rest'));
    display.value = lane.display ?? 'show';
    display.onchange = () => { lane.display = display.value as LaneDisplay; };
    const settings = document.createElement('div');
    settings.className = 'setup-voice-fields';
    settings.append(choice('声部名', name), choice('简称', short), choice('显示八度', displayOctave),
      choice('输入八度', octave), choice('显示方式', display));
    const actions = document.createElement('div');
    actions.className = 'setup-voice-actions';
    actions.append(
      settingsButton('↑', () => move(index - 1), !index), settingsButton('↓', () => move(index + 1), index === setupLanes.length - 1), remove);
    row.append(settings, actions);
    return row;
  }));
}
function configureSetupKey() {
  const selector = selectField('setup-key'), previous = selector.value;
  const degree = Number(selectField('setup-key-degree').value) as 1 | 6;
  selector.replaceChildren(...Array.from({ length: 15 }, (_, index) => new Option(keyName({ degree, fifths: index - 7 }), String(index - 7))));
  selector.value = previous || '0';
}
function setupTempoFields() {
  const kind = selectField('setup-tempo-kind').value;
  get('setup-word-row').hidden = kind === 'metronome';
  get('setup-metronome-row').hidden = kind === 'word';
  field('setup-bpm').disabled = kind === 'word';
}
selectField('setup-voices').onchange = () => setupVoicePreset(selectField('setup-voices').value);
selectField('setup-key-degree').onchange = configureSetupKey;
selectField('setup-tempo-kind').onchange = setupTempoFields;
selectField('setup-tempo-word').replaceChildren(...Object.keys(TEMPO_PRESETS).map(word => new Option(word)));
selectField('setup-tempo-word').value = 'Andante';
selectField('setup-tempo-unit').replaceChildren(...[0, 1].flatMap(dots => [192, 96, 48].map(unit =>
  new Option(TEMPO_GLYPHS[unit] + '·'.repeat(dots), unit + ':' + dots))));
selectField('setup-tempo-unit').value = '96:0';
selectField('setup-meter-preset').append(new Option('自定义', ''), ...meterPresets.map(meter => new Option(meter)));
selectField('setup-meter-preset').onchange = () => {
  const [numerator, denominator] = selectField('setup-meter-preset').value.split('/').map(Number);
  if (denominator) setMeterFields('setup-meter', { numerator, denominator, groups: defaultGroups(numerator, denominator) });
};
field('setup-pickup').onchange = () => { get('setup-pickup-row').hidden = !field('setup-pickup').checked; };
button('setup-add-lane').onclick = () => {
  if (setupLanes.length >= 100) return;
  selectField('setup-voices').value = 'custom';
  setupLanes.push({ id: uid(), name: '新声部', octave: 4 });
  drawSetupLanes();
};
button('new').onclick = () => {
  setup.querySelector('form')!.reset();
  selectField('setup-tempo-word').value = 'Andante';
  selectField('setup-tempo-unit').value = '96:0';
  for (const fieldName of headerFields) if (fieldName !== 'credit') field('setup-' + fieldName).value = '';
  get('setup-printed').replaceChildren(...buildMeterFields('setup-meter', { numerator: 4, denominator: 4, groups: [1, 1, 1, 1] }));
  get('setup-actual').replaceChildren(...buildMeterFields('setup-short', { numerator: 1, denominator: 8, groups: [1] }));
  selectField('setup-meter-preset').value = '4/4';
  get('setup-printed').oninput = () => { selectField('setup-meter-preset').value = ''; };
  configureSetupKey();
  selectField('setup-key').value = '0';
  selectField('setup-voices').value = preferences.preset;
  setupVoicePreset(preferences.preset);
  field('setup-count').value = String(preferences.measures);
  setupTempoFields();
  get('setup-pickup-row').hidden = true;
  get('setup-error').textContent = '';
  setup.showModal();
};
button('setup-cancel').onclick = () => setup.close();
setup.querySelector('form')!.onsubmit = event => {
  event.preventDefault();
  try {
    const meter = editMeter('setup-meter');
    const pickup = field('setup-pickup').checked ? editMeter('setup-short') : undefined;
    const count = field('setup-count').valueAsNumber;
    const length = meterLength(meter);
    const weak = pickup && meterLength(pickup);
    const complement = weak && field('setup-complement').checked;
    if (weak && weak >= length) throw Error('弱起必须短于完整小节。');
    if (complement && count < 2) throw Error('扣除末小节弱起时值需要至少两个小节。');
    if (setupLanes.some(lane => !lane.name.trim())) throw Error('请填写声部名。');
    const next = newScore(meter.numerator, meter.denominator);
    Object.assign(next, structuredClone(preferences.defaultStyle ?? {}), meter);
    next.lanes = structuredClone(setupLanes);
    next.key = { degree: Number(selectField('setup-key-degree').value) as 1 | 6, fifths: Number(selectField('setup-key').value) };
    next.tonic = ((next.key.fifths * 7) % 12 + 12) % 12;
    next.measures = Array.from({ length: count }, (_, index) => {
      if (!index && pickup) return { length: weak!, actualMeter: pickup, pickup: true, numberStep: 1 };
      if (index === count - 1 && complement) {
        const size = length - weak!;
        const denominator = [meter.denominator, 2, 4, 8, 16].find(base => Number.isInteger(size * base / (QUARTER * 4)) &&
          size * base / (QUARTER * 4) <= 16);
        if (!denominator) return { length: size };
        const numerator = size * denominator / (QUARTER * 4);
        return { length: size, actualMeter: { numerator, denominator, groups: defaultGroups(numerator, denominator) } };
      }
      return { length };
    });
    for (const key of headerFields) if (key !== 'credit') next[key] = field('setup-' + key).value.trim();
    next.title ||= '未命名乐谱';
    const kind = selectField('setup-tempo-kind').value;
    const word = selectField('setup-tempo-word').value as keyof typeof TEMPO_PRESETS;
    const [unit, dots] = selectField('setup-tempo-unit').value.split(':').map(Number);
    const bpm = kind === 'word' ? TEMPO_PRESETS[word] : field('setup-bpm').valueAsNumber;
    const quarter = kind === 'word' ? bpm : bpm * dotted(unit, dots) / QUARTER;
    if (quarter > 1200) throw Error('实际四分音符速度须不超过 1200 BPM。');
    next.tempo = Math.round(Math.max(20, Math.min(300, quarter)));
    const base = { id: uid(), at: 0, appearance: field('setup-print-tempo').checked ? undefined : { visible: false, layout: false } };
    next.tempoMarks = [kind === 'word' ? { ...base, kind: 'word', label: word, bpm } :
      { ...base, kind: 'metronome', unit, dots, bpm, label: kind === 'both' ? word : undefined }];
    setup.close();
    replace(next);
  } catch (error) { get('setup-error').textContent = (error as Error).message; }
};

const voiceDialog = get<HTMLDialogElement>('voice-dialog');
let voiceDraft: Lane[] = [];
let sideDisplays = new Map<string, LaneDisplay>();
function openVoices(target?: { lane: string; field: 'name' | 'shortName' }) {
  lastClick = lastTextClick = null;
  voiceDraft = primaryLanes().map(lane => ({ ...lane, displayOctave: lane.displayOctave ?? lane.octave }));
  sideDisplays = new Map(score.lanes.filter(lane => lane.parent).map(lane => [lane.id, lane.display ?? 'show']));
  drawVoiceSettings();
  voiceDialog.returnValue = '';
  voiceDialog.showModal();
  if (target) {
    const row = [...get('voice-settings').children].find(node => (node as HTMLElement).dataset.lane === target.lane);
    const control = row?.querySelector<HTMLInputElement>(`[data-voice-field="${target.field}"]`) ?? row?.querySelector('select');
    control?.scrollIntoView({ block: 'nearest' });
    control?.focus({ preventScroll: true });
    if (control instanceof HTMLInputElement) control.select();
  }
}
button('lane-add').onclick = () => openVoices();
button('open-system-voices').onclick = () => openVoices();
button('show-voice-settings').onclick = () => { if (selection?.kind === 'lane-name') openVoices(selection); };
function choice(labelText: string, control: HTMLElement) {
  const label = document.createElement('label');
  label.append(labelText, control);
  return label;
}
const bundledFontNames = ['Arial', 'Calibri', 'Cambria', 'Courier New', 'Georgia', 'Microsoft YaHei', 'Noto Serif CJK SC',
  'Segoe UI', 'SimHei', 'SimSun', 'Songti SC', 'Times New Roman', '微软雅黑', '宋体', '黑体'];
let availableFonts = bundledFontNames;
let fontRequest: Promise<void> | undefined;
function fontPicker(input: HTMLInputElement) {
  const container = document.createElement('span');
  container.className = 'font-picker';
  const list = document.createElement('span');
  list.className = 'font-options';
  list.hidden = true;
  list.setAttribute('role', 'listbox');
  const toggle = settingsButton('▾', () => { if (list.hidden) { input.focus(); refresh(true); } else close(); });
  toggle.tabIndex = -1;
  toggle.setAttribute('aria-label', '选择字体');
  input.setAttribute('role', 'combobox');
  list.id = 'font-options-' + uid();
  input.setAttribute('aria-controls', list.id);
  let items: string[] = [], selected = -1, showAll = true;
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); };
  const choose = (value: string) => {
    input.value = value;
    close();
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const highlight = () => {
    [...list.children].forEach((row, index) => row.setAttribute('aria-selected', String(index === selected)));
    const item = list.children[selected];
    if (item) { input.setAttribute('aria-activedescendant', item.id); item.scrollIntoView({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  };
  function refresh(all = false) {
    showAll = all;
    const query = all ? '' : input.value.trim().toLowerCase();
    items = availableFonts.filter(name => name.toLowerCase().includes(query))
      .sort((a, b) => Number(b.toLowerCase().startsWith(query)) - Number(a.toLowerCase().startsWith(query)) || a.localeCompare(b));
    selected = -1;
    list.replaceChildren(...items.map((name, index) => {
      const row = document.createElement('span');
      row.id = list.id + '-' + index;
      row.setAttribute('role', 'option');
      row.title = name;
      row.textContent = name;
      row.onpointerdown = event => event.preventDefault();
      row.onclick = () => choose(name);
      return row;
    }));
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (!fontRequest) {
      const host = window as Window & { desktopScore?: { listFonts?: () => Promise<string[]> };
        queryLocalFonts?: () => Promise<{ family: string }[]> };
      fontRequest = (host.desktopScore?.listFonts?.() ?? host.queryLocalFonts?.().then(list => list.map(item => item.family)) ??
        Promise.resolve([])).then(names => {
        availableFonts = [...new Set([...bundledFontNames, ...names])].sort((a, b) => a.localeCompare(b));
        if (!list.hidden && input.isConnected) refresh(showAll);
      }).catch(() => {});
    }
  }
  input.addEventListener('focus', () => refresh(true));
  input.addEventListener('input', () => refresh());
  input.addEventListener('blur', event => { if (event.relatedTarget !== toggle) close(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !list.hidden) { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (list.hidden) refresh(true);
      event.preventDefault();
      selected = Math.max(0, Math.min(items.length - 1, selected + (event.key === 'ArrowDown' ? 1 : -1)));
      highlight();
    }
    if (event.key === 'Enter' && !list.hidden && items[selected]) { event.preventDefault(); event.stopPropagation(); choose(items[selected]); }
  });
  container.append(input, toggle, list);
  return container;
}
function numberInput(value: number, minimum: number, maximum: number) {
  const control = document.createElement('input');
  Object.assign(control, { type: 'number', value: String(value), min: String(minimum), max: String(maximum), required: true });
  return control;
}
function settingsButton(label: string, callback: () => void, disabled = false) {
  const control = document.createElement('button');
  Object.assign(control, { type: 'button', textContent: label, disabled, onclick: callback });
  if (/^应用(?:调号|谱面拍号|实际拍号)$/.test(label)) control.classList.add('primary');
  return control;
}
function drawVoiceSettings() {
  const visibility = (value: LaneDisplay, edit: (value: LaneDisplay) => void) => {
    const control = document.createElement('select');
    control.append(...Object.entries(laneDisplayLabels).map(([key, label]) => new Option(label, key)));
    control.value = value;
    control.onchange = () => edit(control.value as LaneDisplay);
    return choice('显示方式', control);
  };
  get('voice-settings').replaceChildren(...voiceDraft.flatMap((lane, index) => {
    const row = document.createElement('section');
    row.className = 'voice-setting';
    row.dataset.lane = lane.id;
    const full = document.createElement('input');
    full.dataset.voiceField = 'name';
    Object.assign(full, { value: lane.name, required: true, maxLength: 80, oninput: () => { lane.name = full.value; } });
    const short = document.createElement('input');
    short.dataset.voiceField = 'shortName';
    Object.assign(short, { value: lane.shortName ?? '', maxLength: 40, oninput: () => { lane.shortName = short.value; } });
    const display = numberInput(lane.displayOctave ?? lane.octave, 1, 7);
    const entry = numberInput(lane.octave, 1, 7);
    display.oninput = () => { lane.displayOctave = display.valueAsNumber; };
    entry.oninput = () => { lane.octave = entry.valueAsNumber; };
    const move = (destination: number) => {
      voiceDraft.splice(index, 1);
      voiceDraft.splice(destination, 0, lane);
      drawVoiceSettings();
    };
    const actions = document.createElement('div');
    actions.className = 'buttons';
    const remove = settingsButton('', () => {
        const related = score.lanes.filter(item => item.id === lane.id || item.parent === lane.id);
        const count = score.notes.filter(note => related.some(item => item.id === note.lane)).length;
        if (count && !confirm(`删除「${lane.name}」及所属副线，共 ${count} 个音符或休止？可撤销。`)) return;
        voiceDraft.splice(index, 1);
        drawVoiceSettings();
      }, voiceDraft.length === 1);
    remove.title = '删除声部';
    remove.setAttribute('aria-label', remove.title);
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14m-8 3v7m4-7v7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
    actions.append(settingsButton('↑', () => move(index - 1), index === 0), settingsButton('↓', () => move(index + 1), index === voiceDraft.length - 1), remove);
    for (const [i, label] of ['上移', '下移'].entries()) {
      const button = actions.children[i] as HTMLButtonElement;
      button.title = label; button.setAttribute('aria-label', label);
    }
    const handle = document.createElement('span');
    handle.className = 'reorder-grip'; handle.textContent = '⠿'; handle.title = '拖动排序'; handle.draggable = true;
    handle.ondragstart = event => { event.dataTransfer?.setData('application/x-cj-voice', lane.id); };
    row.ondragover = event => { if (event.dataTransfer?.types.includes('application/x-cj-voice')) event.preventDefault(); };
    row.ondrop = event => {
      const from = voiceDraft.findIndex(item => item.id === event.dataTransfer?.getData('application/x-cj-voice'));
      if (from < 0 || from === index) return;
      event.preventDefault();
      const [moved] = voiceDraft.splice(from, 1);
      voiceDraft.splice(index, 0, moved);
      drawVoiceSettings();
    };
    const fields = document.createElement('div');
    fields.className = 'voice-setting-fields';
    display.title = '现有音符不显示上下加点的八度基准';
    entry.title = '新输入数字的默认八度。例如输入 4、显示 3 时，默认录入音显示一个上加点。';
    fields.append(choice('声部名', full), choice('简称', short), choice('无点显示八度', display), choice('默认输入八度', entry),
      visibility(lane.display ?? 'show', value => { lane.display = value; }));
    const syncVolume = () => {
      const normalized = !lane.fullNoteVolume;
      normalize.setAttribute('aria-pressed', String(normalized));
      normalize.title = normalized ? '叠加时保持总音量。点击改为每音原音量。' : '叠加时每音使用原音量。点击改为保持总音量。';
      normalize.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${normalized ? 'M3 7h9M3 13h9M16 4v12' : 'M3 7h14M3 13h14'}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
    };
    const normalize = settingsButton('', () => { lane.fullNoteVolume = !lane.fullNoteVolume; syncVolume(); });
    normalize.className = 'voice-volume-toggle';
    normalize.setAttribute('aria-label', '叠加演奏时保持总音量');
    syncVolume();
    actions.prepend(normalize);
    row.append(handle, fields, actions);
    const children = score.lanes.filter(item => item.parent === lane.id).map(item => {
      const child = document.createElement('section');
      child.className = 'voice-setting voice-child';
      child.dataset.lane = item.id;
      const label = document.createElement('strong');
      label.textContent = `临时副线 · ${item.name}`;
      child.append(label, visibility(sideDisplays.get(item.id) ?? 'show', value => sideDisplays.set(item.id, value)));
      return child;
    });
    return [row, ...children];
  }));
}
button('voice-add-draft').onclick = () => {
  if (voiceDraft.length + score.lanes.filter(lane => lane.parent).length >= 100) return;
  voiceDraft.push({ id: uid(), name: '新声部', octave: 4 });
  drawVoiceSettings();
};
voiceDialog.onclose = () => {
  if (voiceDialog.returnValue !== 'apply') return;
  commit(() => {
    const remaining = new Set(voiceDraft.map(item => item.id));
    removeLanes(score, new Set(primaryLanes().filter(item => !remaining.has(item.id)).map(item => item.id)));
    const children = score.lanes.filter(item => item.parent);
    score.lanes = voiceDraft.flatMap(lane => {
      const original = score.lanes.find(item => item.id === lane.id);
      const name = lane.name.trim() || '新声部', shortName = lane.shortName?.trim();
      return [{ ...lane, name, shortName, nameText: faceAfterEdit(lane.nameText, original?.name ?? '', name),
        shortNameText: faceAfterEdit(lane.shortNameText, original?.shortName || original?.name || '', shortName || name) },
      ...children.filter(item => item.parent === lane.id).map(item => ({ ...item, display: sideDisplays.get(item.id) }))];
    });
    if (!score.lanes.some(lane => lane.id === cursor.lane)) cursor = { lane: score.lanes[0].id, at: cursor.at };
    selection = range = null;
    selectedItems = null;
  });
};
button('side-add').onclick = () => commit(() => {
  const notes = chosen();
  const start = range ? Math.min(range.at, cursor.at) : cursor.at;
  const last = notes.at(-1);
  const measure = measureTable(score).find(item => item.end > Math.max(range?.at ?? start, cursor.at))!;
  const end = range && last ? Math.max(last.at + last.length, Math.max(range.at, cursor.at)) : measure.end;
  const lane = addSideLane(score, cursor.lane, start, end);
  mergeTemporaryVoices(score, lane.parent!);
  const retained = score.lanes.includes(lane) ? lane : temporaryStack(score, { lane: lane.parent!, at: start }).at(-1)!;
  cursor = { lane: retained.id, at: start };
  range = null;
}, '正在编辑临时声部。');

function splitSelectedTemporaryVoice() {
  const token = noteTargets().at(-1);
  if (!token) return;
  const at = token.tail[0] ?? tickEnd(token);
  commit(() => toggleTemporaryVoiceSplit(score, { lane: token.note.lane, at: token.at }, at));
}

function deleteSelectedTemporaryVoices(fromShortcut = false) {
  const tokens = noteTargets();
  if (!tokens.length) return;
  const temporary = tokens.filter(token => temporaryStack(score, { lane: token.note.lane, at: token.at }).length > 1);
  if (!temporary.length && fromShortcut) { editSelectedMeasures('delete'); return; }
  if (temporary.length !== tokens.length) {
    message = '请选择临时声部内的音符。'; controls(); return;
  }
  const intervals = new Map<string, { at: number; end: number }[]>();
  for (const token of temporary.sort((a, b) => a.at - b.at)) {
    const row = intervals.get(token.note.lane) ?? [];
    const end = tickEnd(token);
    const last = row.at(-1);
    if (last && token.at <= last.end) last.end = Math.max(last.end, end);
    else row.push({ at: token.at, end });
    intervals.set(token.note.lane, row);
  }
  commit(() => {
    for (const [lane, row] of [...intervals].reverse()) for (const { at, end } of row.reverse()) {
      const original = score.lanes.find(item => item.id === lane);
      if (!original || at >= (original.end ?? Infinity)) continue;
      if (temporaryStack(score, { lane, at }).length > 1) deleteTemporaryVoiceInterval(score, { lane, at }, end);
    }
    if (!score.lanes.some(lane => lane.id === cursor.lane && cursor.at < (lane.end ?? Infinity)))
      cursor = { lane: score.lanes.find(lane => !lane.parent)!.id, at: cursor.at };
    selection = selectedItems = range = null;
  });
}
function articulationTargets(key: 'staccato' | 'accent' | 'fermata' | 'tenuto') {
  const pitches = noteTargets().filter(token => token.note.pitches.length);
  const notes = selectedPicks().flatMap(pick => {
    const token = pick.kind === 'mark' && pick.field === key ? markedToken(pick.id) : undefined;
    return token ? [token] : [];
  });
  const bars = key === 'fermata' ? [...new Set(selectedPicks().flatMap(pick => pick.kind === 'barline' || pick.kind === 'bar-fermata' ? [pick.index] : []))] : [];
  return { tokens: [...new Set([...pitches, ...notes])], bars, grace: graceEvents() };
}
function articulationState(key: 'staccato' | 'accent' | 'fermata' | 'tenuto', targets: ReturnType<typeof articulationTargets>) {
  return [...targets.tokens.map(token => !token.continuation && !!token.note[key]), ...targets.bars.map(index => !!boundaryAt(score, index).fermata),
    ...targets.grace.map(event => !!event[key])];
}
for (const key of ['staccato', 'accent', 'fermata', 'tenuto'] as const) button(key).onclick = () => {
  const targets = articulationTargets(key);
  const values = articulationState(key, targets);
  if (!values.length) return;
  commit(() => {
    const next = !values.every(Boolean);
    writeNoteMarks(targets.tokens, note => { if (next) note[key] = true; else delete note[key]; });
    for (const event of targets.grace) { if (next) event[key] = true; else delete event[key]; }
    for (const index of targets.bars) {
      const boundary = (score.boundaries ??= {})[index] ??= {};
      if (next) boundary.fermata = true;
      else { delete boundary.fermata; delete boundary.fermataAppearance; }
    }
    if (!next && selection?.kind === 'bar-fermata') selection = { kind: 'barline', index: selection.index };
  });
};
function breathTargets() {
  return [...new Set([...noteTargets().filter(token => token.note.pitches.length), ...selectedPicks().flatMap(pick => {
    const token = pick.kind === 'mark' && pick.field === 'breath' ? markedToken(pick.id) : undefined;
    return token ? [token] : [];
  })])];
}
function applyBreath(shape: BreathShape) {
  const targets = breathTargets();
  const grace = graceEvents();
  if (targets.length || grace.length) commit(() => {
    writeNoteMarks(targets, note => { note.breath = shape; });
    grace.forEach(event => { event.breath = event.breath === shape ? undefined : shape; });
  });
}
button('breath').onclick = () => applyBreath('upbow');
button('breath-comma').onclick = () => applyBreath('comma');
selectField('breath-shape').onchange = () => {
  const value = selectField('breath-shape').value as BreathShape;
  if (value) applyBreath(value);
};
for (const key of ['title', 'credit', 'subtitle', 'lyricist', 'arranger', 'composer', 'copyright'] as const)
  field(key).onchange = () => commit(() => { score[key] = field(key).value; }, '', false);
function verseFor(note: Note, number: number) {
  if (number === 1 && note.lyric) {
    note.verses = noteVerses(note);
    delete note.lyric;
  }
  let verse = note.verses?.find(item => item.number === number);
  if (!verse) { verse = { number }; (note.verses ??= []).push(verse); }
  return verse;
}
function setVerseText(note: Note, number: number, text: string) {
  const verse = verseFor(note, number);
  verse.text = text || undefined;
  note.verses = note.verses?.filter(item => item.text || item.extend);
}
field('verse').onchange = () => {
  verseNumber = Math.max(1, Math.min(20, Math.round(Number(field('verse').value) || 1)));
  render();
};
field('lyric').onchange = () => {
  applyTextMark('lyric', field('lyric').value.trim());
};
button('lyric-extension').onclick = () => commit(() => {
  const notes = chosen().filter(note => note.pitches.length);
  const first = notes[0];
  if (!first || !noteVerses(first).some(item => item.number === verseNumber && item.text))
    throw Error('请选择含歌词的起音；可用 Shift 选择延长线的末音。');
  const remove = verseFor(first, verseNumber).extend === 'start';
  notes.forEach((note, index) => {
    if (remove) {
      const verse = note.verses?.find(item => item.number === verseNumber);
      if (verse) delete verse.extend;
      note.verses = note.verses?.filter(item => item.text || item.extend);
    } else verseFor(note, verseNumber).extend = index === 0 ? 'start' : index === notes.length - 1 ? 'stop' : 'continue';
  });
});
for (const [id, key] of [['dynamic', 'dynamic'], ['expression', 'text'], ['inter-note-text', 'interNoteText'], ['rehearsal', 'rehearsal']] as const)
  field(id).onchange = () => applyTextMark(key, field(id).value.trim());

type NoteText = 'lyric' | 'dynamic' | 'text' | 'interNoteText' | 'rehearsal';

function noteTextValue(note: Note, kind: Exclude<NoteText, 'lyric'>, extension?: number) {
  return extension === undefined ? note[kind] : isExtensionText(kind) ? note.extensionText?.[extension]?.[kind] : undefined;
}

function writeNoteText(note: Note, kind: Exclude<NoteText, 'lyric'>, value: string, extension?: number) {
  if (extension === undefined) { note[kind] = value; return; }
  if (!isExtensionText(kind)) return;
  if (value) ((note.extensionText ??= {})[extension] ??= {})[kind] = value;
  else if (note.extensionText?.[extension]) {
    delete note.extensionText[extension][kind];
    if (!Object.keys(note.extensionText[extension]).length) delete note.extensionText[extension];
    if (!Object.keys(note.extensionText).length) delete note.extensionText;
  }
}

function textMarkTargets(kind: NoteText): { token: Token; verse: number; extension?: number }[] {
  const picks = selectedPicks();
  if (picks.some(pick => pick.kind === 'mark' && pick.field === kind)) return picks.flatMap(pick => {
    if (pick.kind !== 'mark' || pick.field !== kind) return [];
    const token = pick.extension === undefined ? markedToken(pick.id) :
      prepared.tokens.find(item => item.note.id === pick.id && item.tail.includes(item.note.at + pick.extension!));
    return token ? [{ token, verse: pick.verse ?? 1, extension: pick.extension }] : [];
  });
  const digits = digitTargets().filter(({ token }) => token.note.pitches.length || kind !== 'lyric')
    .filter(({ token }, index, targets) => targets.findIndex(item => item.token === token) === index)
    .map(({ token }) => ({ token, verse: verseNumber }));
  return isExtensionText(kind) ? [...digits, ...picks.flatMap(pick => {
    const token = pick.kind === 'extension' ? extensionToken(pick) : undefined;
    return token && pick.kind === 'extension' ? [{ token, verse: verseNumber, extension: pick.at - token.note.at }] : [];
  })] : digits;
}
function setInterNoteSide(pick: ElementSelection, side: 'left' | 'right') {
  const look = appearanceOf(score, pick);
  const placement = { ...look?.placement };
  if ((look?.noteSide ?? 'left') !== side) delete placement.x;
  updateAppearance(pick, { ...look, noteSide: side, placement });
}

selectField('inter-note-side').onchange = () => {
  const side = selectField('inter-note-side').value;
  const picks = effectivePicks().filter(pick => pick.kind === 'mark' && pick.field === 'interNoteText');
  if (picks.length && (side === 'left' || side === 'right'))
    commit(() => picks.forEach(pick => setInterNoteSide(pick, side)), '', false);
};

function applyTextMark(kind: NoteText, value: string, selectResult = false, side?: 'left' | 'right') {
  const targets = textMarkTargets(kind);
  if (!targets.length) return;
  commit(() => {
    const verses = new Map<Token, number[]>();
    for (const { token, verse, extension } of targets) {
      if (extension === undefined) verses.set(token, [...(verses.get(token) ?? []), verse]);
      else if (isExtensionText(kind)) {
        writeNoteText(token.note, kind, value, extension);
        if (side) setInterNoteSide({ kind: 'mark', field: kind, id: token.note.id, extension }, side);
      }
    }
    for (const [token, numbers] of [...verses].sort(([a], [b]) => b.at - a.at)) {
      const source = noteAt(score, { lane: token.note.lane, at: token.at });
      const note = source?.at === token.at ? source : fragment(token);
      if (kind === 'lyric') for (const number of numbers) setVerseText(note, number, value);
      else note[kind] = value;
      if (side) setInterNoteSide({ kind: 'mark', field: 'interNoteText', id: note.id }, side);
      if (selectResult && kind !== 'lyric' && targets.length === 1 && effectivePicks().length === 1) {
        cursor = { lane: note.lane, at: note.at };
        selection = { kind: 'mark', field: kind, id: note.id };
        selectedItems = range = null;
      }
    }
    refreshDigits();
  }, '', false);
}

const names = ['全', '二分', '四分', '八分', '十六分', '三十二分', '六十四分'];
const durationKeys = ['Y', 'T', 'R', 'E', 'W', 'Q'];
function tupletTarget() {
  if (graceEdit) return;
  if (input) return { position: { ...cursor }, written: dotted(value, dots), dots, token: undefined };
  const tokens = [...new Set(digitTargets().map(({ token }) => token))];
  if (tokens.length !== 1) return;
  const token = tokens[0];
  const settings = token.note.at === token.at && token.note.value !== undefined &&
    Math.abs(tickEnd(token.note) - tickEnd(token)) < 1e-7 ? dotDuration(token) : displayedDuration(token);
  return { position: { lane: token.note.lane, at: token.at }, written: token.written ?? dotted(settings.value, settings.dots),
    dots: settings.dots, token };
}

function addTuplet(count: number) {
  const target = tupletTarget();
  if (!target) return;
  const { position, written, dots: chosenDots, token } = target;
  const limit = tick(position.at + written * tupletScale(tupletAt(score, position.lane, position.at)));
  if (input && score.notes.some(note => note.lane === position.lane && (note.pitches.length || note.unpitched) && note.at < limit && tickEnd(note) > position.at) &&
    !confirm('这段已有发声音符。用多连音休止符覆盖吗？')) return;
  commit(() => {
    if (tupletUnit(written, chosenDots, count) < 6) throw Error('组内书写时值短于六十四分音符，未创建。');
    const keep = token ? fragment(token) : undefined;
    const group = createTuplet(score, position, written, chosenDots, count, keep);
    cursor = position;
    range = selectedItems = null;
    if (input) {
      inputTuplets.set(group.id, { value, dots });
      selection = null;
    } else {
      const note = noteAt(score, position)!;
      selection = { kind: 'pitch', id: note.id, at: note.at, index: 0 };
    }
    value = group.unit; dots = 0;
  });
}

function customTuplet() {
  if (!tupletTarget()) return;
  const dialog = get<HTMLDialogElement>('custom-tuplet');
  const count = field('tuplet-count');
  const preview = () => {
    const target = tupletTarget();
    if (!target || !count.validity.valid) { get('tuplet-preview').textContent = ''; return; }
    const unit = tupletUnit(target.written, target.dots, Number(count.value));
    get('tuplet-preview').textContent = unit < 6 ? '书写单位短于六十四分音符，不能创建。' :
      `${count.value} 等分 · 每格写作 ${384 / unit} 分音符 · 整组原时值不变`;
  };
  count.value = '3'; count.oninput = preview; preview();
  dialog.returnValue = '';
  dialog.onclose = () => { if (dialog.returnValue === 'add') addTuplet(Number(count.value)); };
  dialog.showModal();
}
function controls() { render(); focus(); }
function mode(next = !input) {
  const feedback = !next ? finishInputSlur() : '';
  if (next !== input) resetOneNoteSettings();
  graceEdit = undefined;
  input = next;
  selection = null;
  range = null;
  selectedItems = lyricAnchor = lyricFocus = null;
  unfocused = false;
  chord = false;
  message = feedback || (next ? '设定时值后录入音符，Esc 返回编辑。' : '单击选中元素，双击进入输入。');
  controls();
}
function removePitch(note: Note, index: number) {
  note.pitches.splice(index, 1);
  score.spans = score.spans.filter(span => (span.kind !== 'tie' && span.kind !== 'slide') ||
    !(span.from === note.id && span.pitch === index || span.to === note.id && span.targetPitch === index));
  for (const span of score.spans) if (span.kind === 'tie' || span.kind === 'slur' || span.kind === 'slide') {
    if (span.from === note.id && span.pitch === index && span.kind === 'slur') delete span.pitch;
    if (span.to === note.id && span.targetPitch === index && span.kind === 'slur') delete span.targetPitch;
    if (span.from === note.id && span.pitch! > index) span.pitch!--;
    if (span.to === note.id && span.targetPitch! > index) span.targetPitch!--;
  }
  pruneTies(score);
}
function graceHost(id = graceEdit?.id) { return score.notes.find(note => note.id === id); }
function selectedGrace(pick = selection) {
  return pick?.kind === 'grace' ? graceHost(pick.id)?.grace?.[pick.side]?.notes.find(note => note.id === pick.note) : undefined;
}
function gracePicks() {
  return selectedPicks().filter((pick): pick is GracePick => pick.kind === 'grace');
}
function graceEvents() {
  return [...new Set(gracePicks().flatMap(pick => selectedGrace(pick) ?? []))];
}
function graceBeamTargets(mode: BeamMode) {
  return [...new Set(gracePicks().flatMap(pick => {
    const events = graceHost(pick.id)?.grace?.[pick.side]?.notes ?? [];
    const index = events.findIndex(event => event.id === pick.note);
    const note = events[index];
    if (!note || note.value >= QUARTER) return [];
    if (mode === 'auto' || mode === 'isolated') return [note];
    const previous = events[index - 1];
    const shared = previous ? Math.log2(QUARTER / Math.max(note.value, previous.value)) : 0;
    return shared >= (mode === 'one' ? 2 : mode === 'two' ? 3 : mode === 'three' ? 4 : 1) ? [note] : [];
  }))];
}
function findGraceLine(pick: GraceLinePick) {
  return graceHost(pick.id)?.grace?.[pick.side]?.links?.find(link => link.id === pick.link);
}
function removeGraceLine(pick: GraceLinePick) {
  const group = graceHost(pick.id)?.grace?.[pick.side];
  if (group) group.links = group.links?.filter(link => link.id !== pick.link);
}
function addGraceLine(kind: 'tie' | 'slur') {
  const picks = gracePicks();
  const head = picks[0];
  if (!head) return;
  commit(() => {
    const group = graceHost(head.id)?.grace?.[head.side];
    if (!group || picks.length !== selectedPicks().length || picks.length > 2 || picks.some(pick => pick.id !== head.id || pick.side !== head.side))
      throw Error('连线只能连接同一倚音组内的两个小音符。');
    const indexAt = (id: string) => group.notes.findIndex(event => event.id === id);
    const [first, second] = [...picks].sort((a, b) => indexAt(a.note) - indexAt(b.note));
    const fromIndex = indexAt(first.note);
    const toIndex = second ? indexAt(second.note) : fromIndex + 1;
    const from = group.notes[fromIndex], to = group.notes[toIndex];
    const pitch = from?.pitches[first.index];
    const target = second?.index ?? (kind === 'tie' && pitch && to ?
      to.pitches.findIndex(candidate => sound(candidate, 0) === sound(pitch, 0)) : 0);
    if (!pitch || !to?.pitches[target] || fromIndex >= toIndex ||
      kind === 'tie' && (toIndex !== fromIndex + 1 || sound(pitch, 0) !== sound(to.pitches[target], 0)))
      throw Error(kind === 'tie' ? '倚音同音线只连接相邻且实际音高相同的小音符。' : '请在同一组中选择两个不同的小音符。');
    const links = group.links ??= [];
    const prior = links.find(link => link.kind === kind && link.from === from.id && link.to === to.id && link.fromPitch === first.index && link.toPitch === target);
    const id = prior?.id ?? uid();
    if (!prior) links.push({ id, kind, from: from.id, to: to.id, fromPitch: first.index, toPitch: target });
    selection = { kind: 'grace-line', id: head.id, side: head.side, link: id };
    range = selectedItems = null;
  });
}
function graceTarget(side: GraceSide) {
  if (unfocused || inline || selection && selection.kind !== 'pitch' && selection.kind !== 'grace') return;
  const token = selection?.kind === 'grace' ? markedToken(selection.id) : tokenAt();
  if (!token?.note.pitches.length || token.continuation || prepared.links.some(link => link.kind === 'tie' &&
    (link.to === token || side === 'after' && link.source !== undefined && link.from.note.id === token.note.id))) return;
  if (range || (selectedItems?.length ?? 0) > 1) return;
  return token;
}
function beginGrace(side: GraceSide, length = 48, existing?: GracePick) {
  const token = existing ? markedToken(existing.id) : graceTarget(side);
  if (!token) return;
  const events = token.note.grace?.[side]?.notes ?? [];
  const hostOctave = token.note.pitches[0]?.octave ?? score.lanes.find(lane => lane.id === token.note.lane)!.octave;
  const i = existing ? events.findIndex(event => event.id === existing.note) : -1;
  stopPlayback();
  finishInputSlur();
  resetOneNoteSettings();
  input = chord = false;
  selection = range = selectedItems = null;
  cursor = { lane: token.note.lane, at: token.at };
  graceEdit = { id: token.note.id, side, gap: i >= 0 ? i : events.length, value: events[i]?.value ?? length, dots: events[i]?.dots ?? 0,
    octave: i >= 0 ? (events[i].pitches[existing?.index ?? 0]?.octave ?? hostOctave) - hostOctave : 0, accidental: 0 };
  unfocused = false;
  message = '按 1–7 插入倚音，方向键移动光标，Esc 返回主音。';
  controls();
  get('score').querySelector('.grace-caret')?.scrollIntoView({ block: 'nearest' });
}
function endGrace() {
  const host = graceHost();
  graceEdit = undefined;
  resetOneNoteSettings();
  if (host) selection = { kind: 'pitch', id: host.id, at: host.at, index: 0 };
  message = '';
  controls();
}
function insertGrace(degree: number) {
  const state = graceEdit, host = graceHost();
  if (!state || !host) return;
  commit(() => {
    const group = (host.grace ??= {})[state.side] ??= { notes: [] };
    const { notes: events } = group;
    if (events.length >= 64) throw Error('一组最多录入 64 个倚音。');
    const token = markedToken(host.id);
    const prior = events.slice(0, state.gap).flatMap(event => event.pitches).reverse()
      .find(pitch => pitch.degree === degree) ?? (state.side === 'after' ? host.pitches.find(pitch => pitch.degree === degree) : undefined);
    const alter = state.accidental === 0 ? prior?.alter ?? (token ? prepared.accidentals.before.get(token)?.get(degree) ?? 0 : 0)
      : signs[state.accidental] === 3 ? 0 : signs[state.accidental];
    if (group.links) group.links = group.links.filter(link => !(link.kind === 'tie' &&
      link.from === events[state.gap - 1]?.id && link.to === events[state.gap]?.id));
    const hostOctave = host.pitches[0]?.octave ?? score.lanes.find(lane => lane.id === host.lane)!.octave;
    events.splice(state.gap++, 0, { id: uid(), value: state.value, dots: state.dots,
      pitches: [{ degree, octave: Math.min(8, Math.max(0, hostOctave + state.octave + temporaryOctave)), alter,
        natural: signs[state.accidental] === 3 || undefined, signStyle: state.accidental ? 'show' : undefined }] });
    state.accidental = 0;
    temporaryOctave = 0;
    if (preferences.entry) void player.preview([sound(events[state.gap - 1].pitches[0], tonicAt(score, host.at))], false, preferences.seconds, preferences.volume / 100);
  });
}
function editGrace(edit: (note: GraceNote) => void) {
  const event = selectedGrace();
  if (event) commit(() => edit(event));
}
function editGracePitch(edit: (pitch: Pitch) => void) {
  const pick = selection;
  if (pick?.kind !== 'grace') return;
  const group = graceHost(pick.id)?.grace?.[pick.side];
  if (!group) return;
  editGrace(event => {
    const pitch = event.pitches[pick.index];
    if (!pitch) return;
    const host = graceHost(pick.id)!;
    const tonic = tonicAt(score, host.at);
    const before = sound(pitch, tonic);
    edit(pitch);
    const after = sound(pitch, tonic);
    if (preferences.pitch && after !== before) void player.preview([after], false, preferences.seconds, preferences.volume / 100);
    const pending: [string, number][] = [[event.id, pick.index]];
    const visited = new Set<string>();
    while (pending.length) {
      const [id, index] = pending.pop()!;
      const key = id + ':' + index;
      if (visited.has(key)) continue;
      visited.add(key);
      const target = group.notes.find(note => note.id === id)?.pitches[index];
      if (target && target !== pitch) Object.assign(target, pitch, { courtesy: target.courtesy });
      for (const link of group.links ?? []) if (link.kind === 'tie') {
        if (link.from === id && link.fromPitch === index) pending.push([link.to, link.toPitch]);
        if (link.to === id && link.toPitch === index) pending.push([link.from, link.fromPitch]);
      }
    }
  });
}
function removeGrace(pick: GracePick, entire = false) {
  const host = graceHost(pick.id), group = host?.grace?.[pick.side];
  if (!host?.grace || !group) return;
  const i = group.notes.findIndex(note => note.id === pick.note);
  if (i < 0) return;
  if (!entire && group.notes[i].pitches.length > 1) {
    group.notes[i].pitches.splice(pick.index, 1);
    group.links = group.links?.filter(link => !(link.from === pick.note && link.fromPitch === pick.index ||
      link.to === pick.note && link.toPitch === pick.index)).map(link => ({ ...link,
      fromPitch: link.from === pick.note && link.fromPitch > pick.index ? link.fromPitch - 1 : link.fromPitch,
      toPitch: link.to === pick.note && link.toPitch > pick.index ? link.toPitch - 1 : link.toPitch }));
  } else {
    group.notes.splice(i, 1);
    group.links = group.links?.filter(link => link.from !== pick.note && link.to !== pick.note);
  }
  if (!group.notes.length) delete host.grace[pick.side];
  if (!host.grace.before && !host.grace.after) delete host.grace;
}
function deleteGraceGap(backward: boolean) {
  const state = graceEdit;
  if (!state) return;
  const index = state.gap - Number(backward);
  const item = graceHost()?.grace?.[state.side]?.notes[index];
  if (!item) return;
  commit(() => {
    removeGrace({ kind: 'grace', id: state.id, side: state.side, note: item.id, index: 0 }, true);
    if (backward) state.gap--;
  });
}
function setValue(length: number) {
  if (graceEdit) { graceEdit.value = length; controls(); }
  else if (selectedGrace()) editGrace(event => { event.value = length; });
  else if (input) { value = length; controls(); }
  else changeDuration(length);
}
function changeDuration(length: number, newDots?: number) {
  resizeDigits(token => ({ value: length, dots: newDots ?? displayedDuration(token).dots }));
}
function changeOctave(direction: number) {
  if (graceEdit) { graceEdit.octave = Math.min(2, Math.max(-2, graceEdit.octave + direction)); controls(); }
  else if (selectedGrace()) editGracePitch(pitch => { pitch.octave = Math.min(8, Math.max(0, pitch.octave + direction)); });
  else if (input) { octave = Math.min(2, Math.max(-2, octave + direction)); controls(); }
  else stepPitch(direction, 'octave');
}
function octaveCenter(id: string, grace = false) {
  const lane = score.lanes.find(item => item.id === id)!;
  const parent = score.lanes.find(item => item.id === lane.parent);
  const first = grace ? lane : parent, second = grace ? parent : lane;
  return first?.displayOctave ?? second?.displayOctave ?? lane.octave;
}
function displayedOctave(token: Token, index: number) {
  const pitch = pitchInMeasure(score, token, prepared.measures[token.measure].tonic, token.note.pitches[index]);
  return pitch.octave - octaveCenter(token.note.lane);
}
function chooseOctave(offset: number) {
  const lane = score.lanes.find(item => item.id === cursor.lane)!;
  const limit = (v: number) => Math.min(8, Math.max(0, v));
  if (graceEdit) {
    const host = graceHost()!;
    graceEdit.octave = limit(octaveCenter(host.lane, true) + offset) - (host.pitches[0]?.octave ?? lane.octave);
    temporaryOctave = 0;
    controls();
  } else if (selectedGrace()) editGracePitch(pitch => { pitch.octave = limit(octaveCenter(lane.id, true) + offset); });
  else if (input) {
    octave = limit(octaveCenter(lane.id) + offset) - lane.octave;
    temporaryOctave = 0;
    controls();
  } else stepPitch(0, 'octave', offset);
}
function numberKey(degree: number) {
  if (graceEdit) { if (degree) insertGrace(degree); return; }
  if (selectedGrace()) { if (degree) editGracePitch(pitch => { pitch.degree = degree; }); return; }
  if (input) { enter(degree); return; }
  if (chord) { if (noteAt(score, cursor)?.pitches.length && degree) enter(degree); return; }
  const targets = digitTargets();
  if (!targets.length) return;
  commit(() => {
    if (degree) editTiedPitches(score, targets.map(({ token, index }) => ({ note: token.note, index })), pitch => { pitch.degree = degree; });
    for (const { token, index } of [...targets].sort((a, b) => b.token.at - a.token.at || b.index - a.index)) {
      if (!degree) clearFragment(token, index);
      else if (token.note.unpitched && token.note.pitches.length) {
        delete token.note.unpitched;
        delete token.note.unpitchedContinuation;
      } else if (!token.note.pitches.length) {
        const note = fragment(token);
        delete note.unpitched;
        delete note.unpitchedContinuation;
        note.pitches.push({ degree, octave: score.lanes.find(lane => lane.id === note.lane)!.octave,
          alter: inheritedAlter({ lane: note.lane, at: token.at }, degree) });
      }
    }
    refreshDigits();
  });
}
function rhythmKey() {
  if (input) { chord = false; enter(0, true); return; }
  const tokens = [...new Set(digitTargets().map(({ token }) => token))];
  if (!tokens.length) return;
  commit(() => {
    for (const token of tokens) (score.notes.includes(token.note) ? token.note : fragment(token)).unpitched = true;
    refreshDigits();
  });
}
function stepPitch(direction: number, kind: 'degree' | 'chromatic' | 'octave', octaveOffset?: number) {
  const targets = digitTargets().filter(({ token, index }) => isPitched(token.note) && token.note.pitches[index]);
  if (!targets.length) return false;
  commit(() => {
    const affected = new Map<Note, number>();
    let delta = direction;
    const apply = tiedPitchEditor(score, new Set(), note => {
      if (!affected.has(note)) affected.set(note, delta);
    });
    const indexes = new Map<Note, Map<number, number>>();
    for (const { token, index } of targets) {
      const set = indexes.get(token.note) ?? new Map<number, number>();
      if (!set.has(index)) set.set(index, octaveOffset === undefined ? direction : octaveOffset - displayedOctave(token, index));
      indexes.set(token.note, set);
    }
    const shift = (pitch: Pitch, note: Note, alters?: ReadonlyMap<number, number | null>, grace = false, interval = direction) => {
        const tonic = tonicAt(score, note.at);
        const degree = (pitch.degree + direction + 6) % 7 + 1;
        const diatonicOctave = pitch.octave + (pitch.degree + direction > 7 ? 1 : pitch.degree + direction < 1 ? -1 : 0);
        const next = kind === 'chromatic' ? pitchAtSound(sound(pitch, tonic) + direction, tonic, direction < 0) :
          kind === 'octave' ? { octave: pitch.octave + interval } :
            { degree, octave: diatonicOctave, alter: grace ? pitch.alter : alters?.get(degree) ?? 0 };
        if (next.octave < 0 || next.octave > 8) throw Error('超过可记谱的八度范围。');
        Object.assign(pitch, next, kind === 'octave' ? {} : { natural: undefined, signStyle: undefined });
    };
    const edit = (note: Note, alters?: ReadonlyMap<number, number | null>) => {
      for (const [index, interval] of indexes.get(note) ?? []) {
        if (!interval) continue;
        delta = interval;
        apply(note, index, pitch => shift(pitch, note, alters, false, interval));
      }
    };
    if (kind !== 'degree') [...indexes.keys()].sort((a, b) => a.at - b.at).forEach(note => edit(note));
    else editInAccidentalOrder(score, prepared, edit);
    for (const [note, interval] of affected) for (const group of Object.values(note.grace ?? {}))
      for (const event of group?.notes ?? []) for (const pitch of event.pitches) shift(pitch, note, undefined, true, interval);
  });
  return true;
}
function dotDuration(token: Token) {
  return token.at === token.note.at && token.note.value !== undefined
    ? { value: token.note.value, dots: token.note.dots ?? 0 } : displayedDuration(token);
}
function refreshDigits() {
  const remap = (pick: ElementSelection): ElementSelection => {
    if (pick.kind !== 'pitch') return pick;
    const token = pickToken(pick);
    const note = token && noteAt(score, { lane: token.note.lane, at: token.at });
    return note ? { ...pick, id: note.id, index: Math.min(pick.index, Math.max(0, note.pitches.length - 1)) } : pick;
  };
  if (selectedItems) selectedItems = uniquePicks(selectedItems.map(remap));
  if (selection) selection = remap(selection);
}
function resizeDigits(request: (token: Token) => { value: number; dots: number } | undefined, keepSource = false) {
  const targets = [...new Set(digitTargets().map(({ token }) => token))];
  const ends = new Map(score.lanes.map(lane => [lane.id, lane.end ?? Infinity]));
  const candidates = targets.flatMap(token => {
    const settings = request(token);
    if (!settings) return [];
    const end = tick(token.at + dotted(settings.value, settings.dots) * tupletScale(token.tuplet));
    return [{ token, ...settings, end }];
  });
  if (!candidates.length) { render(); return; }
  const requested = new Map(candidates.map(entry => [entry.token, entry]));
  const nextByLane = new Map<string, number>();
  let conflicts = false;
  for (const token of [...targets].sort((a, b) => b.at - a.at)) {
    const lane = token.note.lane;
    const entry = requested.get(token);
    if (entry && entry.end > Math.min(ends.get(lane)!, nextByLane.get(lane) ?? Infinity)) conflicts = true;
    nextByLane.set(lane, token.at);
  }
  const last = requested.get(targets.at(-1)!);
  if (conflicts && !last) { message = '所选时值互相重叠，最后一个音符已是所选时值。'; render(); return; }
  const edited = conflicts ? [last!] : candidates;
  commit(() => {
    for (const { token, value, dots, end } of edited.sort((a, b) => b.token.at - a.token.at)) {
      if (end > ends.get(token.note.lane)!) throw Error('时值超出临时副线范围。');
      const source = noteAt(score, { lane: token.note.lane, at: token.at });
      const note = keepSource && source?.at === token.at && source.value !== undefined ? source : fragment(token);
      resizeNote(score, note, value, dots);
    }
    refreshDigits();
  }, conflicts && candidates.length > 1 ? '所选时值互相重叠，已调整最后一个音符。' : '', false);
}
function changeDots(next?: number) {
  if (graceEdit) { graceEdit.dots = next ?? Number(!graceEdit.dots); controls(); return; }
  if (selectedGrace()) { editGrace(event => { event.dots = next ?? Number(!event.dots); }); return; }
  if (input) { dots = next ?? Number(!dots); render(); return; }
  resizeDigits(token => {
    const duration = dotDuration(token);
    const allowed = [0, 1, 2];
    const count = next ?? Number(!duration.dots);
    if (allowed.includes(count) && count !== duration.dots) return { value: duration.value, dots: count };
  }, true);
}
function changeDurationRatio(factor: number) {
  const inRange = (length: number) => length >= VALUES.at(-1)! && length <= VALUES[0];
  if (graceEdit) {
    if (inRange(graceEdit.value * factor)) { graceEdit.value *= factor; controls(); }
  } else if (selectedGrace()) {
    editGrace(event => { if (inRange(event.value * factor)) event.value *= factor; });
  } else if (input) {
    if (inRange(value * factor)) { value *= factor; controls(); }
  } else resizeDigits(token => {
    const duration = dotDuration(token);
    const length = duration.value * factor;
    return inRange(length) ? { value: length, dots: duration.dots } : undefined;
  }, true);
}
const inputSignIndex = (printed: number | undefined) => Math.max(0, signs.indexOf(printed === 0 ? 3 : printed ?? 0));
function nextSign(selected: number, direction: number) {
  const sign = signs[selected];
  if (!direction) return sign === 3 ? 0 : signs.indexOf(3);
  return signs.indexOf(Math.max(-2, Math.min(2, (sign === 3 ? 0 : sign) + direction)));
}
function accidentalEdit(next: number, pitch: Pitch, inherited: number) {
  const sign = signs[next];
  Object.assign(pitch, { alter: next === 0 ? inherited : sign === 3 ? 0 : sign,
    signStyle: next === 0 ? 'hide' : 'show', natural: sign === 3 || undefined, courtesy: undefined });
}
function changeAccidental(request: (current: number) => number) {
  if (graceEdit) { graceEdit.accidental = request(graceEdit.accidental); controls(); return; }
  if (input) { accidental = request(accidental); controls(); return; }
  const grace = selectedGrace();
  if (grace && selection?.kind === 'grace') {
    const pick = selection;
    const token = markedToken(pick.id);
    const group = token?.note.grace?.[pick.side];
    const printed = prepared.accidentals.graces.get(grace)?.[pick.index];
    const current = inputSignIndex(printed);
    const next = request(current);
    if (next === current) return;
    const degree = grace.pitches[pick.index].degree;
    const prior = group?.notes.slice(0, group.notes.indexOf(grace)).flatMap(item => item.pitches).reverse().find(pitch => pitch.degree === degree);
    const inherited = prior?.alter ?? (pick.side === 'after' && token?.note.pitches.find(pitch => pitch.degree === degree)?.alter) ??
      (token && prepared.accidentals.before.get(token)?.get(degree)) ?? 0;
    editGracePitch(pitch => accidentalEdit(next, pitch, Number(inherited)));
    return;
  }
  const targets = digitTargets().flatMap(({ token, index }) => {
    if (!isPitched(token.note) || !token.note.pitches[index]) return [];
    const current = inputSignIndex(prepared.accidentals.signs.get(token)?.[index]);
    const next = request(current);
    return [{ token, index, next, current }];
  });
  if (!targets.some(item => item.next !== item.current)) { controls(); return; }
  commit(() => {
    const apply = tiedPitchEditor(score);
    const byNote = new Map<Note, typeof targets>();
    for (const target of targets) if (target.current !== target.next)
      byNote.set(target.token.note, [...(byNote.get(target.token.note) ?? []), target]);
    editInAccidentalOrder(score, prepared, (note, alters) => {
      for (const { index, next } of byNote.get(note) ?? []) apply(note, index, pitch => accidentalEdit(next, pitch, alters.get(pitch.degree) ?? 0));
    });
  });
}
const preferenceDialog = get<HTMLDialogElement>('preferences-dialog');
let preferenceDraft: PreferenceData;
const preferenceStatus = get('preference-status');
function drawPreferences() {
  const panels = preferenceGroups.map(([title, specs]) => {
    const panel = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = title;
    panel.append(legend);
    for (const [key, label, fallback, options] of specs) {
      let control: HTMLInputElement | HTMLSelectElement;
      if (typeof fallback === 'boolean') {
        control = document.createElement('input');
        control.type = 'checkbox';
        control.checked = Boolean(preferenceDraft[key]);
        const row = document.createElement('label');
        row.className = 'check-option';
        row.append(control, label);
        panel.append(row);
      } else if (typeof fallback === 'number') {
        const [minimum, maximum, step] = options as readonly number[];
        control = numberInput(Number(preferenceDraft[key]), minimum, maximum);
        control.step = String(step);
        panel.append(choice(label, control));
      } else {
        control = document.createElement('select');
        for (const [value, text] of options as readonly (readonly [string, string])[]) control.add(new Option(text, value));
        control.value = String(preferenceDraft[key]);
        panel.append(choice(label, control));
      }
      control.id = 'pref-' + key;
    }
    if (title === '新建与导入') {
      const label = document.createElement('p');
      label.textContent = preferenceDraft.defaultStyle ? '已设置默认排版样式。' : '使用程序默认排版样式。';
      const use = settingsButton('将当前谱面样式设为默认', () => {
        readPreferenceDraft();
        preferenceDraft.defaultStyle = structuredClone(Object.fromEntries(styleFields.map(key => [key, score[key]])));
        drawPreferences();
      }, !documents.includes(activeDocument));
      const clear = settingsButton('清除默认样式', () => {
        readPreferenceDraft();
        delete preferenceDraft.defaultStyle;
        drawPreferences();
      }, !preferenceDraft.defaultStyle);
      panel.append(label, use, clear);
    }
    return panel;
  });
  get('preference-groups').replaceChildren(...panels);
}
function readPreferenceDraft() {
  for (const spec of preferenceFields) {
    const control = get<HTMLInputElement | HTMLSelectElement>('pref-' + spec[0]);
    const value = control instanceof HTMLInputElement && control.type === 'checkbox' ? control.checked :
      control instanceof HTMLInputElement ? control.valueAsNumber : control.value;
    Object.assign(preferenceDraft, { [spec[0]]: preferenceValue(spec, value) });
  }
}
function openPreferences() {
  preferenceDraft = structuredClone(preferences);
  preferenceStatus.textContent = '';
  drawPreferences();
  preferenceDialog.showModal();
}
button('preference-reset').onclick = () => {
  preferenceDraft = { ...defaults };
  drawPreferences();
  preferenceStatus.textContent = '已恢复默认值，点击「应用」保存。';
};
button('preference-import').onclick = () => field('preference-file').click();
field('preference-file').onchange = async () => {
  const control = field('preference-file');
  const file = control.files?.[0];
  control.value = '';
  if (!file) return;
  try {
    if (file.size > 1_000_000) throw Error('偏好设置文件过大。');
    const imported = parsePreferences(await file.text());
    if (!preferenceDialog.open) return;
    preferenceDraft = imported;
    drawPreferences();
    preferenceStatus.textContent = '已载入文件，点击「应用」保存。';
  } catch (error) { preferenceStatus.textContent = (error as Error).message; }
};
button('preference-export').onclick = () => {
  if (!preferenceDialog.querySelector('form')!.reportValidity()) return;
  readPreferenceDraft();
  downloadSheet(new Blob([preferenceFile(preferenceDraft)], { type: 'application/json' }), '数谱偏好设置.shupuprefer');
};
button('preference-cancel').onclick = () => preferenceDialog.close();
preferenceDialog.querySelector('form')!.onsubmit = event => {
  event.preventDefault();
  readPreferenceDraft();
  try { localStorage.setItem(preferenceStore, preferenceFile(preferenceDraft)); }
  catch { preferenceStatus.textContent = '当前浏览器无法保存偏好设置。'; return; }
  const viewChanged = preferences.view !== preferenceDraft.view || preferences.zoom !== preferenceDraft.zoom;
  preferences = preferenceDraft;
  clearTimeout(recoveryTimer);
  recoveryTimer = undefined;
  if (preferences.recover) saveRecovery();
  if (viewChanged) {
    pageViewControl.value = preferences.view;
    zoom = defaultZoom();
  }
  preferenceDialog.close();
  render();
  if (viewChanged) updateZoom();
};
function showToolChoice(group: string, values: number[]) {
  for (const element of get(group).querySelectorAll<HTMLButtonElement>('button[data-value]')) {
    const choice = Number(element.dataset.value);
    const matches = values.filter(value => value === choice).length;
    element.setAttribute('aria-pressed', matches ? matches === values.length ? 'true' : 'mixed' : 'false');
    element.disabled = !values.length;
  }
}
function mountNotationTools() {
  const glyph = (x: number, y: number, content: string, kind = 'tool-digit') =>
    `<text x="${x}" y="${y}" text-anchor="middle" class="${kind}">${content}</text>`;
  const stroke = (d: string) => `<path class="tool-stroke" d="${d}"/>`;
  const dot = (x: number, y: number) => `<circle class="tool-dot" cx="${x}" cy="${y}" r="1.3"/>`;
  const icon = (button: HTMLButtonElement, drawing: string, width = 28) => {
    button.classList.add('notation-tool');
    button.innerHTML = `<svg viewBox="0 0 ${width} 28" aria-hidden="true" focusable="false">${drawing}</svg>`;
  };
  const choice = (id: string, value: number, label: string, drawing: string, action: () => void) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.value = String(value);
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', 'false');
    button.onclick = () => { action(); focus(); };
    icon(button, drawing);
    get(id).append(button);
  };
  for (const [i, length] of VALUES.entries()) {
    const figure = i === 0 ? glyph(14, 17, '全', 'tool-character') : i === 1 ?
      glyph(10, 16.5, 'X') + stroke('M16 12h7') : glyph(14, 16.5, 'X') +
      (i > 2 ? stroke(Array.from({ length: i - 2 }, (_, j) => `M7 ${19 + 2.15 * j}h14`).join('')) : '');
    choice('values', length, names[i] + '音符' + (durationKeys[i] ? `（${durationKeys[i]}）` : ''), figure, () => setValue(length));
  }
  for (const [i, label] of ['无附点', '单附点', '双附点'].entries())
    choice('dots', i, label, glyph(i ? 10 : 14, 18, 'X') +
      Array.from({ length: i }, (_, n) => dot(17 + n * 4, 15.5)).join(''), () => changeDots(i));
  for (const [i, label] of ['低两个八度', '低一个八度', '基准八度', '高一个八度', '高两个八度'].entries()) {
    const offset = i - 2;
    choice('octaves', offset, label, glyph(14, 18, 'X') + Array.from({ length: Math.abs(offset) }, (_, n) =>
      dot(14, offset < 0 ? 21.5 + n * 4 : 6.5 - n * 4)).join(''), () => chooseOctave(offset));
  }
  for (const [index, sign, label] of [[4, '♭♭', '重降'], [2, '♭', '降'], [5, '♮', '还原'], [1, '♯', '升'], [3, '𝄪', '重升']] as const) {
    const drawing = index === 3
      ? `<path class="tool-dot" d="${doubleSharpPath}" transform="translate(9 14)"/>`
      : glyph(14, 20, sign, 'tool-accidental');
    choice('alter', index, label, drawing, () => changeAccidental(current => current === index ? 0 : index));
  }
  icon(button('toolbar-tuplet'), glyph(8, 18, 'X') + glyph(18, 18, 'X') + glyph(28, 18, 'X') +
    stroke('M3 21H33M5 8Q9 4 14 3.5M22 3.5Q27 4 31 8') + glyph(18, 5.9, 'n', 'tool-counter'), 36);
  for (const name of ['tie', 'slur'] as const) {
    const element = button('toolbar-' + name);
    element.classList.add('notation-tool');
    element.innerHTML = noteLineIcon(name);
  }
  icon(button('chord'), '<g transform="translate(0 3) scale(1 .72)">' + glyph(14, 13, '3') + glyph(14, 25, '1') + '</g>');
  icon(button('undo'), stroke('M10 7l-5 5 5 5M5 12h11a5 5 0 0 1 0 10h-4'));
  icon(button('redo'), stroke('M18 7l5 5-5 5m5-5H12a5 5 0 0 0 0 10h4'));
}
button('chord').onclick = () => { if (selection?.kind === 'span' || selection?.kind === 'mark') return; chord = !chord; controls(); };
button('input-mode').onclick = () => mode();
get<HTMLSelectElement>('endpoint').onchange = event => {
  endpoint = (event.target as HTMLSelectElement).value as typeof endpoint;
  focus();
};
function adjustSpan(direction: number) {
  const spans = effectivePicks().filter(pick => pick.kind === 'span');
  if (!spans.length) return;
  commit(() => {
    let moved = false;
    let failure: unknown;
    for (const span of spans) {
      try { moveSpanEnd(score, span.index, pickedEndpoint === 'height' ? endpoint : pickedEndpoint ?? endpoint, direction); moved = true; }
      catch (error) { failure = error; }
    }
    if (!moved) throw failure;
  });
}
function selectedLyricGroup(element = selection) {
  if (!element || element.kind !== 'span' && element.kind !== 'generated-tie') return;
  const link = prepared.links.find(link => element.kind === 'span' ? link.source === element.index :
    link.source === undefined && link.from.note.id === element.id && link.from.at === element.at && link.pitch === element.pitch);
  if (!link) return;
  const groups = lyricGroups(score, prepared, link.from.note.lane);
  return element.kind === 'span' ? groups.find(group => group.sources.includes(element.index)) :
    groups.find(group => group.positions.includes(link.from.at) && group.positions.includes(link.to.at) &&
      group.sources.every(source => score.spans[source].kind === 'tie'));
}
selectField('arc-shape').onchange = () => {
  const shape = selectField('arc-shape').value;
  if (!['auto', 'long', 'short'].includes(shape)) return;
  const picks = effectivePicks().filter(hasArcShape);
  if (!picks.length) return;
  commit(() => {
    for (const pick of picks) {
      const appearance = { ...appearanceOf(score, pick) };
      if (shape === 'long' || shape === 'short') appearance.arcShape = shape;
      else delete appearance.arcShape;
      updateAppearance(pick, appearance);
    }
  }, '', false);
};
get<HTMLSelectElement>('lyric-flow').onchange = event => {
  const flow = (event.target as HTMLSelectElement).value as LyricFlow;
  if (!flow || String(flow) === 'mixed') return;
  const targets = effectivePicks().flatMap(element => {
    const group = selectedLyricGroup(element);
    return group ? [{ element, group }] : [];
  });
  if (!targets.length) return;
  commit(() => {
    for (const { element, group } of targets) {
    for (const source of group.sources) score.spans[source].lyricFlow = flow;
    const span = element.kind === 'span' ? score.spans[element.index] : undefined;
    if (span?.kind === 'slur') continue;
    const note = score.notes.find(note => note.id === (element.kind === 'generated-tie' ? element.id : span?.from));
    if (!note) continue;
    for (const token of prepared.byLane.get(note.lane) ?? [])
      if (group.positions.includes(token.at) && token.note.pitches.length) token.note.lyricFlow = flow;
    }
  });
};

type LaneNamePick = Extract<ElementSelection, { kind: 'lane-name' }>;
type TextSelection = Extract<ElementSelection, { kind: 'header' }> | LaneNamePick |
  Extract<ElementSelection, { kind: 'chord-symbol' }> |
  (Extract<ElementSelection, { kind: 'mark' }> & { field: Exclude<NoteText, 'lyric'> });
type VerseDraft = { formats: Map<number, TextFormat>; words: Map<number, string>; initial: Map<number, string>; joins: Set<number>; originalJoins: Set<number>;
  extensions: Map<number, Verse['extend']> };
type InlineState = { kind: 'text'; element: TextSelection; originalValue: string; value: string; format?: TextFormat; chordAnchor?: Cursor } | {
  kind: 'lyric'; lane: string; verse: number; entry: number;
  caret: { at: number; offset: number }; drafts: Map<number, VerseDraft>; rows: number[];
  tokens: Token[]; groups: ReturnType<typeof lyricGroups>; original: Score;
};
const editor = field('inline-editor');
let inline: InlineState | null = null;
let tabHeld = false;
let composing = false;
let swallowComposition: string | undefined;
const elementFor = (pick: ElementSelection) => [...get('score').querySelectorAll<SVGGElement>('[data-element]')]
  .find(element => appearanceKey(JSON.parse(element.dataset.element!)) === appearanceKey(pick));

function isTextPick(pick: ElementSelection) {
  return pick.kind === 'header' || pick.kind === 'lane-name' || pick.kind === 'mark' && ['lyric', 'dynamic', 'text', 'interNoteText', 'rehearsal'].includes(pick.field);
}
function formatTargets() {
  const picks = selectedPicks();
  return picks.every(isTextPick) ? picks : [];
}
function inlinePick() {
  if (!inline) return undefined;
  if (inline.kind === 'text') return inline.element;
  const note = tokenAt({ lane: inline.lane, at: inline.caret.at })?.note;
  return note ? { kind: 'mark', field: 'lyric', id: note.id, verse: inline.verse } as const : undefined;
}
function inlineFormat(): TextFormat {
  if (!inline) return {};
  if (inline.kind === 'text') return inline.format ?? {};
  const pick = inlinePick();
  return activeDraft(inline).formats.get(inline.caret.at) ?? (pick && appearanceOf(score, pick)?.text) ?? {};
}
function baseFace(pick?: ElementSelection): TextFace {
  const role = pick?.kind === 'header' ? pick.field === 'title' ? 'title' : pick.field === 'tempo' ? null : 'credit' :
    pick?.kind === 'lane-name' ? 'lane' : pick?.kind === 'mark' ? pick.field === 'lyric' ? 'lyric' : pick.field === 'dynamic' ? 'dynamic' : 'expression' : 'lyric';
  const face = role ? score.textStyles?.[role] ?? TEXT_STYLES[role] : { font: 'Arial', size: 15 };
  return { ...face, bold: role === 'title' || role === 'dynamic' || role === null, italic: role === 'dynamic', underline: false, strike: false,
    align: role === null ? 'start' : role === 'lane' ? 'end' : 'middle' };
}
const laneNameBar = (element: LaneNamePick) => {
  const bar = prepared.measures.find(item => item.start === element.at);
  return bar && score.measures[bar.index];
};
function setTextAppearance(element: ElementSelection, text: TextFormat | undefined) {
  if (element.kind === 'lane-name') {
    const lane = score.lanes.find(item => item.id === element.lane)!;
    const local = laneNameBar(element)?.localNames?.[lane.id];
    if (element.field === 'name') lane.nameText = text;
    else if (local) local.text = text;
    else lane.shortNameText = text;
    return;
  }
  updateAppearance(element, { ...appearanceOf(score, element), text });
}
function formatCharacters(format: TextFormat, start: number, end: number, change: Partial<TextFace>) {
  const out = [];
  for (const run of format.runs ?? []) {
    if (run.to <= start || run.from >= end) out.push(run);
    else {
      if (run.from < start) out.push({ ...run, to: start });
      if (run.to > end) out.push({ ...run, from: end });
    }
  }
  const points = [...new Set([start, end, ...(format.runs ?? []).flatMap(run => [run.from, run.to]).filter(value => value > start && value < end)])].sort((a, b) => a - b);
  for (let i = 0; i + 1 < points.length; i++) {
    const face = format.runs?.find(run => run.from <= points[i] && run.to > points[i])?.face;
    out.push({ from: points[i], to: points[i + 1], face: { ...face, ...change } });
  }
  return { ...format, runs: out.sort((a, b) => a.from - b.from) };
}
function updateTextFormat(change?: Partial<TextFace>, editing = false) {
  if (!editing) {
    const targets = formatTargets();
    if (targets.length) commit(() => {
      for (const target of targets) {
        const old = appearanceOf(score, target)?.text;
        const runs = old?.runs?.map(run => {
          const face = { ...run.face };
          for (const key of Object.keys(change ?? {}) as (keyof TextFace)[]) delete face[key];
          return { ...run, face };
        });
        setTextAppearance(target, change ? { ...old, ...change, runs } : undefined);
      }
    }, '', false);
    return;
  }
  if (!inline) return;
  const first = editor.selectionStart ?? 0, last = editor.selectionEnd ?? first;
  const points = [0];
  for (const part of graphemes(editor.value)) points.push(points.at(-1)! + part.length);
  const start = points.filter(point => point <= first).at(-1) ?? 0;
  const end = points.find(point => point >= last) ?? editor.value.length;
  const current = inlineFormat();
  const whole = first === last || change?.align !== undefined;
  const next = change ? whole ? { ...current, ...change } : formatCharacters(current, start, end, change) : {};
  if (inline.kind === 'text') inline.format = next;
  else {
    activeDraft(inline).formats.set(inline.caret.at, next);
    showLyricCaret();
  }
  editor.focus({ preventScroll: true });
  editor.setSelectionRange(first, last);
  syncTextToolbars();
  positionEditor();
}
const buttonsForText = { bold: 'B', italic: 'I', underline: 'U', strike: 'S' } as const;
function makeTextToolbar(id: string, editing: boolean) {
  const host = get(id);
  const tools = document.createElement('div');
  tools.className = 'text-format-controls';
  const font = document.createElement('input');
  font.setAttribute('aria-label', '字体');
  font.maxLength = 80;
  const size = numberInput(14, 9, 48);
  size.setAttribute('aria-label', '字号');
  size.required = false;
  const align = document.createElement('select');
  align.setAttribute('aria-label', '对齐');
  align.append(new Option('对齐', ''), new Option('左对齐', 'start'), new Option('居中', 'middle'), new Option('右对齐', 'end'));
  font.onchange = () => {
    const name = font.value.trim();
    if (/^[\p{L}\p{N} ._-]{1,80}$/u.test(name)) updateTextFormat({ font: name }, editing);
  };
  size.onchange = () => { if (size.value && size.checkValidity()) updateTextFormat({ size: size.valueAsNumber }, editing); };
  align.onchange = () => { if (align.value) updateTextFormat({ align: align.value as TextFace['align'] }, editing); };
  const toggles = Object.entries(buttonsForText).map(([key, label]) => {
    const labelFor = { bold: '粗体', italic: '斜体', underline: '下划线', strike: '删除线' };
    const field = key as keyof typeof buttonsForText;
    const button = settingsButton(label, () => updateTextFormat({ [field]: button.getAttribute('aria-pressed') !== 'true' }, editing));
    button.title = labelFor[field];
    button.dataset.face = key;
    if (editing) button.onpointerdown = event => event.preventDefault();
    return button;
  });
  const reset = settingsButton('恢复默认', () => updateTextFormat(undefined, editing));
  if (editing) reset.onpointerdown = event => event.preventDefault();
  tools.append(fontPicker(font), size, ...toggles, align, reset);
  host.append(tools);
  return { host, font, size, toggles, align };
}
const textToolbar = makeTextToolbar('text-format', false);
const inlineToolbar = makeTextToolbar('inline-format', true);
function syncTextToolbars() {
  const picks = formatTargets();
  const open = inlinePick();
  const cursor = editor.selectionStart ?? 0;
  const selectionFormat = inlineFormat();
  const inlineFace = selectionFormat.runs?.find(run => run.from <= cursor && run.to > cursor)?.face;
  const toolbars = [
    { toolbar: textToolbar, picks, faces: picks.map(pick => ({ ...baseFace(pick), ...appearanceOf(score, pick)?.text })) },
    { toolbar: inlineToolbar, picks: open ? [open] : [], faces: open ? [{ ...baseFace(open), ...selectionFormat, ...inlineFace }] : [] }
  ];
  for (const { toolbar, picks, faces } of toolbars) {
    toolbar.host.hidden = !picks.length;
    const common = (key: keyof TextFace) => faces.length && faces.every(face => face[key] === faces[0][key]) ? faces[0][key] : undefined;
    if (document.activeElement !== toolbar.font) toolbar.font.value = String(common('font') ?? '');
    if (document.activeElement !== toolbar.size) toolbar.size.value = String(common('size') ?? '');
    toolbar.font.placeholder = toolbar.size.placeholder = '混合';
    toolbar.align.hidden = !picks.every(pick => pick.kind === 'header' && pick.field !== 'tempo');
    toolbar.align.value = String(common('align') ?? '');
    for (const toggle of toolbar.toggles) toggle.setAttribute('aria-pressed', String(common(toggle.dataset.face as keyof TextFace) ?? 'mixed'));
  }
}

function positionEditor(scroll = false) {
  if (!inline) return;
  const visible = inline.kind === 'text' ? elementFor(inline.element)?.querySelector('text') :
    get('score').querySelector('.lyric-anchor');
  if (!visible) return;
  if (scroll) visible.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const rect = visible.getBoundingClientRect();
  const svg = visible.closest('svg')!;
  const scale = svg.getBoundingClientRect().width / paperSize(score).pixelWidth * (score.scalePercent ?? 100) / 100;
  const face = { ...baseFace(inlinePick()), ...inlineFormat() };
  const size = face.size ?? 14;
  const pick = inlinePick();
  const role = pick?.kind === 'mark' && (pick.field === 'lyric' ? 'lyric' : ['text', 'interNoteText', 'rehearsal'].includes(pick.field) ? 'expression' : undefined);
  const cjk = role ? (score.textStyles?.[role] ?? TEXT_STYLES[role]).cjkFont ?? 'SimSun' : undefined;
  const font = `${face.italic ? 'italic ' : ''}${face.bold ? 'bold ' : ''}${size}px ${textFontStack(face.font ?? 'Arial', cjk)}`;
  const context = document.createElement('canvas').getContext('2d')!;
  context.font = font;
  const width = Math.max(10, (context.measureText(editor.value).width + 9) * scale);
  const centered = inline.kind === 'lyric' || visible.getAttribute('text-anchor') === 'middle';
  const center = rect.left + rect.width / 2;
  const top = inline.kind === 'lyric' ? rect.top - size * scale : rect.top;
  Object.assign(editor.style, {
    left: `${Math.max(0, centered ? center - width / 2 : visible.getAttribute('text-anchor') === 'end' ? rect.right - width : rect.left)}px`, top: `${top}px`,
    width: `${width}px`, font, fontSize: `${size * scale}px`, textDecoration: [face.underline ? 'underline' : '', face.strike ? 'line-through' : ''].filter(Boolean).join(' ')
  });
  const bounds = editor.getBoundingClientRect();
  const toolbar = inlineToolbar.host;
  const left = Math.max(4, Math.min(bounds.left, innerWidth - toolbar.offsetWidth - 5));
  const topToolbar = bounds.bottom + 6 + toolbar.offsetHeight < innerHeight ? bounds.bottom + 6 : Math.max(4, bounds.top - toolbar.offsetHeight - 6);
  Object.assign(toolbar.style, { left: left + 'px', top: topToolbar + 'px' });
}

function startText(element: TextSelection, chordAnchor?: Cursor) {
  if (inline) finishInline(true);
  stopPlayback();
  const feedback = finishInputSlur();
  if (input) { input = false; resetOneNoteSettings(); }
  inline = { kind: 'text', element, originalValue: '', value: '', format: appearanceOf(score, element)?.text, chordAnchor };
  selection = element;
  if (element.kind === 'chord-symbol') { range = selectedItems = null; unfocused = false; }
  render();
  const mark = elementFor(element);
  const note = element.kind === 'mark' && score.notes.find(note => note.id === element.id);
  editor.value = element.kind === 'header' ? String(score[element.field] ?? '') : element.kind === 'lane-name'
    ? laneNameValue(score.lanes.find(lane => lane.id === element.lane)!, element.field, laneNameBar(element)) :
    element.kind === 'chord-symbol' ? selectedChord()?.text ?? '' : note ? noteTextValue(note, element.field, element.extension) ?? '' : '';
  inline.originalValue = inline.value = editor.value;
  if (feedback) get('status').textContent = feedback;
  editor.maxLength = element.kind === 'lane-name' ? element.field === 'name' ? 80 : 40 : 300;
  mark?.classList.add('inline-editing');
  editor.hidden = false;
  positionEditor(true);
  editor.focus({ preventScroll: true });
  editor.select();
}

function startLyrics(position = cursor, reopenLine = true) {
  if (inline) finishInline(true);
  stopPlayback();
  const feedback = finishInputSlur();
  resetOneNoteSettings();
  const tokens = prepared.byLane.get(position.lane) ?? [];
  if (!tokens.some(token => token.at === position.at)) return;
  const rows = [...new Set([verseNumber, ...tokens.flatMap(token => noteVerses(token.note).map(verse => verse.number))])]
    .sort((left, right) => left - right);
  inline = {
    kind: 'lyric', lane: position.lane, verse: verseNumber, entry: reopenLine ? position.at : -1, caret: { at: position.at, offset: 0 },
    drafts: new Map(), rows, tokens, groups: lyricGroups(score, prepared, position.lane), original: structuredClone(score)
  };
  input = false;
  range = null;
  selection = null;
  editor.maxLength = 300;
  editor.hidden = false;
  showLyricCaret(true);
  if (feedback) get('status').textContent = feedback;
}
button('lyric-edit').onclick = () => startLyrics();

function activeDraft(state: Extract<InlineState, { kind: 'lyric' }>) {
  let draft = state.drafts.get(state.verse);
  if (!draft) {
    const words = new Map(state.tokens.map(token => [token.at, lyricValue(token, state.verse)]));
    const joins = new Set(state.tokens.filter(token => !token.continuation && noteVerses(token.note).some(verse => verse.number === state.verse && verse.syllabicNext)).map(token => token.at));
    draft = { words, initial: new Map(words), joins, originalJoins: new Set(joins), formats: new Map(), extensions: new Map() };
    state.drafts.set(state.verse, draft);
  }
  return draft;
}

function applyLyrics(state: Extract<InlineState, { kind: 'lyric' }>) {
  for (const [verse, draft] of state.drafts) {
    for (const token of state.tokens) {
      const word = draft.words.get(token.at) ?? '';
      const joins = draft.joins.has(token.at);
      const format = draft.formats.get(token.at);
      if (!format && !draft.extensions.has(token.at) && word === (draft.initial.get(token.at) ?? '') && joins === draft.originalJoins.has(token.at)) continue;
      const current = noteAt(score, { lane: state.lane, at: token.at });
      const note = current && current.at === token.at ? current : isolateFragment(score, current ?? token.note, token.at, token.length);
      setVerseText(note, verse, word);
      if (draft.extensions.has(token.at)) {
        verseFor(note, verse).extend = draft.extensions.get(token.at);
        note.verses = note.verses?.filter(item => item.text || item.extend);
      }
      if (word) {
        verseFor(note, verse).syllabicNext = joins || undefined;
        const pick = { kind: 'mark', id: note.id, field: 'lyric', verse } as const;
        const next = format ?? faceAfterEdit(appearanceOf(score, pick)?.text, draft.initial.get(token.at) ?? '', word);
        if (next) setTextAppearance(pick, Object.values(next).some(value => value !== undefined) ? next : undefined);
      }
    }
  }
}

type LyricCell = { text: string; join?: boolean; format?: TextFormat };
function lyricCell(token: Token, verse: number, draft?: VerseDraft): LyricCell {
  const pick = { kind: 'mark', id: token.note.id, field: 'lyric', verse } as const;
  return { text: draft?.words.get(token.at) ?? lyricValue(token, verse),
    join: draft ? draft.joins.has(token.at) : !token.continuation && token.note.verses?.some(item => item.number === verse && item.syllabicNext),
    format: draft?.formats.get(token.at) ?? appearanceOf(score, pick)?.text };
}
function setDraftCell(draft: VerseDraft, at: number, cell: LyricCell) {
  draft.words.set(at, cell.text);
  if (cell.join) draft.joins.add(at); else draft.joins.delete(at);
  draft.formats.set(at, cell.format ?? {});
}
function shiftLyrics(state: Extract<InlineState, { kind: 'lyric' }>, inserting: boolean, offset: number) {
  const draft = activeDraft(state);
  const { caret, tokens, groups, verse } = state;
  const stops = lyricStops(tokens, groups, draft.words, state.entry);
  const index = stops.indexOf(caret.at);
  if (index < 0) return true;
  const byAt = new Map(tokens.map(token => [token.at, token]));
  const get = (at: number) => lyricCell(byAt.get(at)!, verse, draft);
  const put = (at: number, cell: LyricCell) => setDraftCell(draft, at, cell);
  const empty = { text: '' };
  const from = Math.min(stops.length - 1, index + Number(inserting && offset > 0));
  let after = from + Number(!inserting);
  while (after < stops.length && get(stops[after]).text) after++;
  if (inserting) {
    if (after === stops.length) after--;
    for (let i = after; i > from; i--) put(stops[i], get(stops[i - 1]));
    put(stops[from], empty);
  } else {
    if (!offset) {
      if (!index) return true;
      const left = get(stops[index - 1]), right = get(caret.at);
      if (left.text.length + right.text.length > 300) return true;
      const formats = [left, right].flatMap((cell, i) => {
        if (!cell.format || !cell.text) return [];
        const shift = i ? left.text.length : 0;
        const { runs, ...face } = cell.format;
        return [{ from: shift, to: shift + cell.text.length, face },
          ...(runs ?? []).map(run => ({ ...run, from: run.from + shift, to: run.to + shift }))];
      });
      put(stops[index - 1], { text: left.text + right.text, join: right.text ? right.join : left.join,
        format: formats.length ? { ...left.format, runs: formats } : undefined });
      caret.offset = left.text.length;
      caret.at = stops[index - 1];
    }
    for (let i = from; i < after - 1; i++) put(stops[i], get(stops[i + 1]));
    put(stops[after - 1], empty);
  }
  // A moved syllable must not leave a melisma attached to an empty lyric position.
  const firstChanged = stops[Math.max(0, from - Number(!inserting && !offset))];
  const lastChanged = stops[Math.min(stops.length - 1, after)];
  if (firstChanged !== undefined) {
    let chain: Token[] = [];
    for (const token of tokens) {
      const extension = draft.extensions.has(token.at) ? draft.extensions.get(token.at) :
        token.continuation ? undefined : noteVerses(token.note).find(item => item.number === verse)?.extend;
      if (extension === 'start') chain = [token];
      else if (extension && chain.length) chain.push(token);
      if (extension !== 'stop' || !chain.length) continue;
      const head = chain[0].at, end = token.at;
      if (head >= firstChanged && head <= lastChanged) {
        for (const part of chain) draft.extensions.set(part.at, undefined);
        const newIndex = stops.indexOf(head) + (inserting ? 1 : -1);
        const newHead = stops[newIndex];
        const shiftedEnd = stops.find(at => at >= end);
        const newEnd = shiftedEnd === undefined ? end : stops[stops.indexOf(shiftedEnd) + (inserting ? 1 : -1)] ?? end;
        if (newHead !== undefined && newEnd > newHead && get(newHead).text) {
          draft.extensions.set(newHead, 'start');
          draft.extensions.set(newEnd, 'stop');
        }
      }
      chain = [];
    }
  }
  if (inserting) Object.assign(caret, { at: stops[from], offset: 0 });
  else if (offset) caret.offset = 0;
  showLyricCaret(true);
  return true;
}

function showLyricCaret(scroll = false) {
  if (inline?.kind !== 'lyric') return;
  const state = inline;
  score = structuredClone(state.original);
  applyLyrics(state);
  cursor = { lane: state.lane, at: state.caret.at };
  render();
  const active = tokenAt()?.note;
  if (active) elementFor({ kind: 'mark', id: active.id, field: 'lyric', verse: state.verse })?.classList.add('inline-editing');
  editor.value = activeDraft(state).words.get(state.caret.at) ?? '';
  editor.setSelectionRange(state.caret.offset, state.caret.offset);
  positionEditor(scroll);
  editor.focus({ preventScroll: true });
}

function finishInline(save: boolean) {
  const state = inline;
  if (!state) return;
  inline = null;
  tabHeld = composing = false;
  swallowComposition = undefined;
  const text = editor.value;
  editor.hidden = inlineToolbar.host.hidden = true;
  if (state.kind === 'text' && state.element.kind === 'chord-symbol' && state.chordAnchor && (!save || !text.trim())) selection = null;
  if (state.kind === 'lyric') {
    const changed = [...state.drafts.values()].some(draft => draft.formats.size ||
      [...draft.words].some(([at, word]) => word !== (draft.initial.get(at) ?? '') || draft.joins.has(at) !== draft.originalJoins.has(at)));
    if (!save) score = state.original;
    if (save && changed) { commit(() => {}, '', true, state.original); return; }
  } else if (save) {
    commit(() => {
      const element = state.element;
      if (element.kind === 'header') {
        if (element.field === 'tempo') {
          const bpm = Number(text.replace(/^.*?=\s*/, ''));
          if (!Number.isInteger(bpm) || bpm < 20 || bpm > 300) throw Error('速度须为 20–300 的整数。');
          score.tempo = bpm;
        } else score[element.field] = text.trim();
      } else if (element.kind === 'lane-name') {
        const lane = score.lanes.find(item => item.id === element.lane)!;
        const local = laneNameBar(element)?.localNames?.[lane.id];
        if (element.field === 'name') lane.name = text.trim() || lane.name;
        else if (local) local.content = text.trim();
        else lane.shortName = text.trim();
      } else if (element.kind === 'chord-symbol') {
        const written = text.trim();
        const chord = score.chordSymbols?.find(item => item.id === element.id);
        if (chord) {
          if (written) chord.text = written;
          else { removeElements([element]); selection = null; }
        } else if (written && state.chordAnchor) {
          const symbols = score.chordSymbols ??= [];
          if (symbols.length >= 5000) throw Error('已达到 5000 个和弦代号。');
          symbols.push({ ...state.chordAnchor, id: element.id, text: written });
          if (!workbench.isHidden()) workbench.setPanel('properties', false);
        }
      } else {
        const note = score.notes.find(item => item.id === element.id)!;
        writeNoteText(note, element.field, text.trim(), element.extension);
      }
      const format = state.format;
      if (format || appearanceOf(score, element)?.text)
        setTextAppearance(element, format && Object.values(format).some(value => value !== undefined) ? format : undefined);
    });
    return;
  }
  render();
  focus();
}

function enterLyrics(text: string, start = editor.selectionStart ?? 0, end = editor.selectionEnd ?? start) {
  if (inline?.kind !== 'lyric') return;
  const { caret, tokens, groups, entry } = inline;
  const { words, joins, formats } = activeDraft(inline);
  const previous = new Map([...formats.keys()].map(at => [at, words.get(at) ?? '']));
  const word = words.get(caret.at) ?? '';
  if (end > start) words.set(caret.at, word.slice(0, start) + word.slice(end));
  caret.offset = start;
  const next = (at: number) => lyricStops(tokens, groups, words, entry).find(position => position > at);
  distributeLyrics(text, words, joins, caret, tabHeld, next);
  for (const [at, old] of previous) {
    const updated = words.get(at) ?? '';
    if (old !== updated) formats.set(at, faceAfterEdit(formats.get(at), old, updated)!);
  }
  showLyricCaret(true);
}

let lyricHoldKey = '';
editor.addEventListener('keydown', event => {
  event.stopPropagation();
  if (!inline || event.isComposing || composing || event.keyCode === 229) return;
  const action = shortcuts.find(event, inline.kind)?.id;
  if (!action) return;
  if (action === 'text-bold' || action === 'text-italic' || action === 'text-underline') {
    const key = action.slice('text-'.length) as 'bold' | 'italic' | 'underline';
    const format = inlineFormat();
    const position = editor.selectionStart ?? 0;
    const run = format.runs?.find(run => run.from <= position && run.to > position);
    event.preventDefault();
    updateTextFormat({ [key]: !(run?.face[key] ?? format[key] ?? baseFace(inlinePick())[key]) }, true);
    return;
  }
  if (action === 'lyric-hold') {
    event.preventDefault();
    tabHeld = true;
    lyricHoldKey = event.code || event.key;
    return;
  }
  if (action === 'text-cancel' || action === 'text-accept') {
    event.preventDefault();
    finishInline(action === 'text-accept' || inline.kind === 'lyric');
    return;
  }
  if (inline.kind !== 'lyric') return;
  const state = inline;
  const { caret, tokens, groups, entry } = state;
  const { words, formats } = activeDraft(state);
  const word = words.get(caret.at) ?? '';
  const start = editor.selectionStart ?? 0;
  const end = editor.selectionEnd ?? start;
  if (start === end && (
    action === 'lyric-push' && (start === 0 || start === word.length) ||
    action === 'lyric-pull' && (start === 0 || start === word.length && graphemes(word).length === 1)
  )) {
    event.preventDefault();
    shiftLyrics(state, action === 'lyric-push', start);
    return;
  }
  if ((action === 'lyric-backspace' || action === 'lyric-pull') && start === end && end === word.length &&
      activeDraft(state).joins.delete(caret.at)) {
    event.preventDefault();
    showLyricCaret();
    return;
  }
  if (action === 'lyric-up' || action === 'lyric-down') {
    event.preventDefault();
    const down = action === 'lyric-down';
    const index = state.rows.indexOf(state.verse);
    const next = state.rows[index + (down ? 1 : -1)] ?? (down && state.verse < 20 ? state.verse + 1 : undefined);
    if (next !== undefined) {
      if (!state.rows.includes(next)) state.rows.push(next);
      state.verse = verseNumber = next;
      caret.offset = 0;
      showLyricCaret(true);
    }
    return;
  }
  if (action === 'lyric-join') { event.preventDefault(); enterLyrics('-', start, end); return; }
  if (action === 'lyric-next') {
    event.preventDefault();
    if (!tabHeld) enterLyrics(' ', start, start);
    return;
  }
  const backward = ['lyric-backspace', 'lyric-pull', 'lyric-left'].includes(action);
  const forward = ['lyric-delete', 'lyric-right'].includes(action);
  const deleteCharacter = ['lyric-backspace', 'lyric-pull', 'lyric-delete'].includes(action);
  if (!backward && !forward) return;
  const boundary = start === end && (backward ? start === 0 : end === word.length);
  if (boundary) {
    event.preventDefault();
    const stops = lyricStops(tokens, groups, words, entry);
    const next = backward ? stops.filter(at => at < caret.at).at(-1) : stops.find(at => at > caret.at);
    if (next !== undefined) {
      caret.at = next;
      caret.offset = backward ? (words.get(next) ?? '').length : 0;
      showLyricCaret(true);
    }
  } else if (deleteCharacter) {
    event.preventDefault();
    const boundaries = [0];
    for (const character of graphemes(word)) boundaries.push(boundaries.at(-1)! + character.length);
    const left = start !== end || forward ? start : boundaries.filter(offset => offset < start).at(-1) ?? 0;
    const right = start !== end || backward ? end : boundaries.find(offset => offset > end) ?? word.length;
    const updated = word.slice(0, left) + word.slice(right);
    words.set(caret.at, updated);
    if (formats.has(caret.at)) formats.set(caret.at, faceAfterEdit(formats.get(caret.at), word, updated)!);
    caret.offset = left;
    showLyricCaret();
  }
});
document.addEventListener('keyup', event => { if ((event.code || event.key) === lyricHoldKey) { lyricHoldKey = ''; tabHeld = false; } });
window.addEventListener('blur', () => { tabHeld = false; });
let compositionStart = 0;
let compositionEnd = 0;
editor.addEventListener('compositionstart', () => {
  composing = true;
  compositionStart = editor.selectionStart ?? 0;
  compositionEnd = editor.selectionEnd ?? compositionStart;
});
editor.addEventListener('compositionend', event => {
  composing = false;
  if (inline?.kind !== 'lyric') return;
  swallowComposition = event.data;
  if (event.data) enterLyrics(event.data, compositionStart, compositionEnd);
  else showLyricCaret();
  setTimeout(() => { swallowComposition = undefined; }, 0);
});
editor.addEventListener('beforeinput', event => {
  if (inline?.kind !== 'lyric' || composing || event.isComposing) return;
  if (swallowComposition !== undefined && (event.data === swallowComposition || event.inputType === 'insertFromComposition')) {
    event.preventDefault();
    swallowComposition = undefined;
  } else if (event.inputType.startsWith('insert') && event.data != null) {
    event.preventDefault();
    enterLyrics(event.data);
  }
});
editor.addEventListener('paste', event => {
  if (inline?.kind !== 'lyric') return;
  event.preventDefault();
  const text = event.clipboardData?.getData('text') ?? '';
  if (lyricClipboard?.length && text && text.replace(/\r\n/g, '\n') === lyricClipboardAsText) {
    const position = { lane: inline.lane, at: inline.caret.at, verse: inline.verse };
    finishInline(true);
    pasteLyricSelection(position);
    const feedback = message;
    verseNumber = position.verse;
    startLyrics(position, true);
    if (feedback) get('status').textContent = feedback;
  } else enterLyrics(text);
});
editor.addEventListener('input', () => {
  if (inline?.kind === 'lyric' && !composing) showLyricCaret();
  else if (inline?.kind === 'text') {
    inline.format = faceAfterEdit(inline.format, inline.value, editor.value);
    inline.value = editor.value;
    positionEditor();
  }
});
editor.addEventListener('select', syncTextToolbars);
editor.addEventListener('blur', event => {
  if (inline && !(event.relatedTarget instanceof Node && inlineToolbar.host.contains(event.relatedTarget))) finishInline(true);
});
inlineToolbar.host.addEventListener('focusout', event => {
  if (inline && (!(event.relatedTarget instanceof Node) || event.relatedTarget !== editor && !inlineToolbar.host.contains(event.relatedTarget))) finishInline(true);
});
get('desk').addEventListener('scroll', () => positionEditor(), { passive: true });
window.addEventListener('resize', () => positionEditor());
button('span-left').onclick = () => adjustSpan(-1);
button('span-right').onclick = () => adjustSpan(1);
button('element-delete').onclick = clear;
button('undo').onclick = () => history(undo, redo);
button('redo').onclick = () => history(redo, undo);
let lastClick: { lane: string; at: number; time: number; x: number; y: number } | null = null;
let lastTextClick: { pick: string; time: number; x: number; y: number } | null = null;
let ignoreClick = false;
type LinePick = Extract<ElementSelection, { kind: 'span' | 'generated-tie' | 'ending' | 'tempo-line' }>;
type DropTarget = { at: number; pitch?: number; node: SVGGraphicsElement; lane: string; boundary?: boolean };
let drag: { origin: LinePick; endpoint: 'from' | 'to'; pointer: number; handle: SVGRectElement;
  indicator?: SVGCircleElement; target?: DropTarget; candidates: DropTarget[] } | null = null;
let staffDrag: { pick: StaffBracketPick; edge: 'top' | 'bottom'; pointer: number; handle: SVGRectElement;
  candidates: SVGCircleElement[]; target?: SVGCircleElement } | undefined;
function nearestStaff(candidates: SVGCircleElement[], y: number) {
  return candidates.reduce<SVGCircleElement | undefined>((nearest, item) => !nearest ||
    Math.abs(item.getBoundingClientRect().top - y) < Math.abs(nearest.getBoundingClientRect().top - y) ? item : nearest, undefined);
}
function cancelStaffDrag() {
  const previous = staffDrag;
  staffDrag = undefined;
  if (!previous) return;
  previous.handle.classList.remove('dragging');
  previous.target?.setAttribute('r', '0');
  if (get('score').hasPointerCapture(previous.pointer)) get('score').releasePointerCapture(previous.pointer);
}

function isLine(pick: ElementSelection): pick is LinePick {
  return pick.kind === 'span' || pick.kind === 'generated-tie' || pick.kind === 'ending' || pick.kind === 'tempo-line';
}

function isArc(pick: ElementSelection) {
  return pick.kind === 'generated-tie' || pick.kind === 'span' && ['tie', 'slur'].includes(score.spans[pick.index]?.kind);
}
function hasArcShape(pick: ElementSelection) {
  return isArc(pick) || pick.kind === 'grace-line';
}

function elementFrom(target: Element) {
  const data = target.closest<SVGGElement>('[data-element]')?.dataset.element;
  return data ? JSON.parse(data) as ElementSelection : signaturePick(target);
}

function canPosition(pick: ElementSelection) {
  if (pick.kind === 'grace-line') return false;
  if (pick.kind === 'signature') return !!get('score').querySelector(`[data-title-signature][data-signature="${pick.index}"][data-signature-kind="${pick.field}"]`);
  if (pick.kind !== 'barline') return true;
  return [...get('score').querySelectorAll('.movable-boundary')].some(node => {
    const bar = elementFrom(node);
    return bar?.kind === 'barline' && bar.index === pick.index;
  });
}
type RhythmPick = Extract<ElementSelection, { kind: 'pitch' | 'extension' }>;
function rhythmChoice(pick: ElementSelection) {
  if (pick.kind !== 'pitch' && pick.kind !== 'extension') return;
  const token = pick.kind === 'pitch' ? pickToken(pick) : extensionToken(pick);
  if (!token) return;
  const target = rhythmPick(token, pick.at);
  return { target, token, mode: alignmentOf(score, prepared.measures[token.measure], token, pick.at) };
}
function rhythmPosition(pick: RhythmPick) {
  const item = rhythmChoice(pick);
  const separate = item?.mode === 'none';
  return { item, separate, key: separate ? JSON.stringify([item.token.note.lane, pick.at]) : String(pick.at),
    x: separate ? appearanceOf(score, item.target)?.placement?.x : score.columns?.[pick.at] };
}
function positionTargets(picks: ElementSelection[]) {
  const byPosition = new Map<string, ElementSelection>();
  for (const pick of picks) {
    if (!canPosition(pick)) continue;
    const key = pick.kind === 'grace' ? `grace:${pick.id}:${pick.side}` : pick.kind === 'pitch' || pick.kind === 'extension' ? `column:${rhythmPosition(pick).key}` :
      pick.kind === 'lane-name' && appearanceOf(score, pick)?.independentPosition === false ? `name:${pick.lane}` :
        pick.kind === 'staff-bracket' && !systemBrackets(score, pick.first, pick.last).local.has(pick.id) ? `staff:${pick.id}` : appearanceKey(pick);
    byPosition.set(key, pick);
  }
  return [...byPosition.values()];
}

function updateAppearance(pick: ElementSelection, appearance: Appearance) {
  if (pick.kind === 'span') score.spans[pick.index].appearance = appearance;
  else if (pick.kind === 'ending') score.endings![pick.index].appearance = appearance;
  else if (pick.kind === 'measure-number') score.measures[pick.index].numberAppearance = appearance;
  else if (pick.kind === 'tempo-mark' || pick.kind === 'tempo-line') {
    const item = pick.kind === 'tempo-mark' ? tempoMark(pick.id) : tempoLine(pick.id);
    if (item) item.appearance = appearance;
  }
  else if (pick.kind === 'signature') {
    const field = pick.field === 'key' ? 'keyAppearance' : 'meterAppearance';
    if (pick.header) (score.appearance ??= {})[appearanceKey(pick)] = appearance;
    else score.measures[pick.index][field] = appearance;
  }
  else if (pick.kind === 'staff-bracket') {
    const item = staffBracket(pick);
    if (item) writeStaffBracket(pick, { ...item, appearance });
  } else if (pick.kind === 'lane-name') {
    const { text, ...position } = appearance;
    if (position.independentPosition === false) {
      const lane = score.lanes.find(lane => lane.id === pick.lane);
      if (lane) lane.sharedNamePlacement = position.placement;
      delete position.placement;
    }
    (score.appearance ??= {})[appearanceKey(pick)] = position;
  }
  else if (pick.kind === 'barline' || pick.kind === 'break' || pick.kind === 'bar-fermata') {
    const boundary = (score.boundaries ??= {})[pick.index] ??= {};
    boundary[pick.kind === 'break' ? 'breakAppearance' : pick.kind === 'bar-fermata' ? 'fermataAppearance' : 'appearance'] = appearance;
  } else (score.appearance ??= {})[appearanceKey(pick)] = appearance;
}

const limitPlacement = (value: number) => Math.min(1200, Math.max(-1200, Math.round(value * 4) / 4));
function horizontalPlacement(pick: ElementSelection, value: number) {
  if (pick.kind === 'staff-bracket') return Math.min(3, Math.max(-3, limitPlacement(value)));
  const selector = pick.kind === 'pitch' || pick.kind === 'extension' ? `[data-column-move="${CSS.escape(rhythmPosition(pick).key)}"]` :
    pick.kind === 'barline' ? `[data-bar-move="${pick.index}"]` : '';
  const limits = pick.kind === 'divisi-brace' ? elementFor(pick)?.querySelector<SVGGElement>('[data-brace-move]')?.dataset.limits
    : pick.kind === 'mark' && pick.field === 'interNoteText' ? elementFor(pick)?.querySelector<SVGGElement>('[data-note-text-limits]')?.dataset.noteTextLimits
    : selector && get('score').querySelector<SVGGElement>(selector)?.dataset.limits;
  if (!limits) return limitPlacement(value);
  const [minimum, maximum] = limits.split(',').map(Number);
  return Math.min(maximum, Math.max(minimum, limitPlacement(value)));
}
type PlacementBase = Placement & { grace?: { x: Record<string, number>; centers: [number, number, number][] } };
function moveGraceGroup(pick: GracePick, dx: number, dy: number, base: PlacementBase) {
  const group = graceHost(pick.id)?.grace?.[pick.side];
  const index = group?.notes.findIndex(note => note.id === pick.note) ?? -1;
  const metrics = base.grace;
  if (!group || index < 0 || !metrics || metrics.centers.length !== group.notes.length) return;
  const centers = metrics.centers;
  const last = centers.length - 1;
  const weights = centers.map(([x], i) => {
    if (last === 0) return 1;
    if (index > 0 && index < last) return Number(i === index);
    const portion = (x - centers[0][0]) / (centers[last][0] - centers[0][0]);
    return index === 0 ? 1 - portion : portion;
  });
  let min = -160, max = 160;
  for (let i = 1; i <= last; i++) {
    const slope = weights[i] - weights[i - 1];
    if (!slope) continue;
    const threshold = (centers[i][1] + centers[i - 1][2] + .5 - (centers[i][0] - centers[i - 1][0])) / slope;
    if (slope > 0) min = Math.max(min, threshold);
    else max = Math.min(max, threshold);
  }
  if (pick.side === 'before' && weights[last]) max = Math.min(max, -(centers[last][0] + centers[last][2]) / weights[last]);
  if (pick.side === 'after' && weights[0]) min = Math.max(min, (centers[0][1] - centers[0][0]) / weights[0]);
  group.notes.forEach((note, i) => {
    if (!weights[i]) return;
    const offset = metrics.x[note.id] ?? 0;
    min = Math.max(min, (-160 - offset) / weights[i]);
    max = Math.min(max, (160 - offset) / weights[i]);
  });
  const change = Math.min(Math.max(dx, Math.min(0, min)), Math.max(0, max));
  group.layout = { y: Math.max(-120, Math.min(120, (base.y ?? 0) + dy)), x: Object.fromEntries(group.notes.map((note, i) => [
    note.id, (metrics.x[note.id] ?? 0) + change * weights[i]
  ])) };
}
function applyPlacement(pick: ElementSelection, end: CurveHandle | undefined, dx: number, dy: number, base?: PlacementBase) {
  if (pick.kind === 'grace') { moveGraceGroup(pick, dx, dy, base ?? initialPlacement(pick)); return; }
  if (pick.kind === 'pitch' || pick.kind === 'extension') {
    const { separate, item } = rhythmPosition(pick);
    if (separate && item) {
      const look = appearanceOf(score, item.target);
      const x = horizontalPlacement(pick, (base?.x ?? look?.placement?.x ?? 0) + dx);
      updateAppearance(item.target, { ...look, placement: { ...look?.placement, x } });
      return;
    }
    const positions = (score.columns ??= {});
    const current = horizontalPlacement(pick, base ? base.x ?? 0 : positions[pick.at] ?? 0);
    const value = horizontalPlacement(pick, current + dx);
    if (value) positions[pick.at] = value;
    else delete positions[pick.at];
    if (!Object.keys(positions).length) delete score.columns;
    return;
  }
  const existing = appearanceOf(score, pick);
  const placement = { ...(base ?? existing?.placement) };
  if (end === 'height') placement.height = limitPlacement((placement.height ?? 0) - dy);
  else if (end) {
    placement[end] = limitPlacement((placement[end] ?? 0) + dx);
    placement.edge = end;
    const vertical = end === 'from' ? 'fromY' : 'toY';
    if (isArc(pick) && dy) {
      const handles = [...get('score').querySelectorAll<SVGRectElement>(`.picked [data-endpoint="${end}"][data-max-offset-y]`)];
      const limit = Number(handles.find(handle => {
        const element = elementFrom(handle);
        return element && appearanceKey(element) === appearanceKey(pick);
      })?.dataset.maxOffsetY ?? Infinity);
      placement[vertical] = Math.min(limit, limitPlacement(Math.min(placement[vertical] ?? 0, limit) + dy));
    }
  } else {
    const current = pick.kind === 'barline' ? horizontalPlacement(pick, placement.x ?? 0) : placement.x ?? 0;
    const additiveGap = pick.kind === 'mark' && pick.field === 'dynamic' || pick.kind === 'span' &&
      ['crescendo', 'diminuendo'].includes(score.spans[pick.index]?.kind);
    if (additiveGap && !placement.x && !placement.y) placement.spaced = true;
    placement.x = horizontalPlacement(pick, current + dx);
    if (pick.kind !== 'barline' && pick.kind !== 'divisi-brace' && pick.kind !== 'staff-bracket') placement.y = limitPlacement((placement.y ?? 0) + dy);
  }
  updateAppearance(pick, { ...existing, placement });
}

function initialPlacement(pick: ElementSelection): PlacementBase {
  if (pick.kind === 'grace') {
    const group = graceHost(pick.id)?.grace?.[pick.side];
    if (!group) return {};
    const centers = group.notes.flatMap(note => {
      const data = elementFor({ ...pick, note: note.id, index: 0 })?.querySelector('[data-grace-metric]')?.getAttribute('data-grace-metric');
      return data ? [data.split(',').map(Number) as [number, number, number]] : [];
    });
    return { y: group.layout?.y, grace: { centers, x: { ...group.layout?.x } } };
  }
  return pick.kind === 'pitch' || pick.kind === 'extension' ? { x: rhythmPosition(pick).x } : { ...appearanceOf(score, pick)?.placement };
}

type VisualDrag = { pick: ElementSelection; end?: CurveHandle; pointer: number; firstX: number; firstY: number;
  inverse: DOMMatrix; targets: { pick: ElementSelection; base: PlacementBase; verticalOnly?: boolean }[]; preserveSelection: boolean; before: Score; cursor: Cursor; selection: ElementSelection | null;
  range: Cursor | null; selectedItems: ElementSelection[] | null; unfocused: boolean;
  previousEnd: CurveHandle | undefined; signature: SignatureFocus | null; moved: boolean; pending?: [number, number]; frame?: number };
let visualDrag: VisualDrag | undefined;

function cancelVisualDrag() {
  const current = visualDrag;
  if (!current) return;
  visualDrag = undefined;
  if (current.frame !== undefined) cancelAnimationFrame(current.frame);
  if (get('score').hasPointerCapture(current.pointer)) get('score').releasePointerCapture(current.pointer);
  if (!current.moved) return;
  ({ cursor, selection, range, selectedItems, unfocused } = current);
  pickedEndpoint = current.previousEnd;
  signSelection = current.signature;
  score = current.before;
  render();
}

function paintVisualDrag(current: VisualDrag) {
  if (!current.pending) return;
  const [clientX, clientY] = current.pending;
  const delta = new DOMPoint(clientX - current.firstX, clientY - current.firstY, 0, 0).matrixTransform(current.inverse);
  if (!current.moved && Math.hypot(clientX - current.firstX, clientY - current.firstY) < 3) return;
  if (!current.moved) {
    stopPlayback();
    score = structuredClone(current.before);
    current.moved = true;
    if (!current.preserveSelection) { selection = current.pick; selectedItems = null; range = null; }
    unfocused = false;
    pickedEndpoint = current.end;
    const pick = current.pick;
    if (!current.preserveSelection) signSelection = pick.kind === 'signature' ? { index: pick.index, kind: pick.field } : null;
    if (!current.preserveSelection && current.pick.kind === 'pitch') {
      const pitch = current.pick;
      const token = prepared.tokens.find(item => item.note.id === pitch.id && item.at === pitch.at);
      if (token) cursor = { at: pitch.at, lane: token.note.lane };
    } else if (current.pick.kind === 'extension') {
      const token = extensionToken(current.pick);
      if (token) cursor = { at: token.at, lane: token.note.lane };
    }
  }
  for (const { pick, base, verticalOnly } of current.targets) {
    if (!verticalOnly || delta.y) applyPlacement(pick, current.end, verticalOnly ? 0 : delta.x, delta.y, base);
    else if (current.moved && base.y !== appearanceOf(score, pick)?.placement?.y)
      updateAppearance(pick, { ...appearanceOf(score, pick), placement: base });
  }
  render();
}

function suppressClick() {
  ignoreClick = true;
  setTimeout(() => { ignoreClick = false; }, 0);
}

let heldNudge: string | undefined;
function dynamicGroupMembers(picks: ElementSelection[], node?: Element) {
  const ids = new Set<string>();
  for (const pick of picks.filter(isDynamic)) {
    const direct = node && appearanceKey(pick) === appearanceKey(elementFrom(node) ?? pick) ?
      node.closest<SVGGElement>('[data-dynamic-group]') : undefined;
    const id = (direct ?? elementFor(pick)?.querySelector<SVGGElement>('[data-dynamic-group]'))?.dataset.dynamicGroup;
    if (id) ids.add(id);
  }
  if (!ids.size) return [];
  const members = [...get('score').querySelectorAll<SVGGElement>('[data-dynamic-group]')]
    .filter(group => ids.has(group.dataset.dynamicGroup!)).flatMap(group => elementFrom(group) ?? []);
  return uniquePicks(members).filter(member => !picks.some(pick => appearanceKey(pick) === appearanceKey(member)));
}
function nudge(key: string, fine: boolean, repeating = false) {
  if (unfocused || inline || input) return;
  const picks = positionTargets(effectivePicks());
  if (!picks.length) return;
  const step = (fine ? 1 : 5) / ((score.scalePercent ?? 100) / 100);
  const x = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
  const y = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
  const end = picks.length === 1 && isLine(picks[0]) ? pickedEndpoint : undefined;
  const targets = x ? end === 'height' ? [] : picks : picks.filter(pick => end ? isArc(pick) :
    !['pitch', 'extension', 'barline', 'divisi-brace', 'staff-bracket'].includes(pick.kind));
  if (!targets.length) return;
  const moves = y && !end ? [...targets, ...dynamicGroupMembers(targets)] : targets;
  const move = () => { for (const pick of moves) applyPlacement(pick, end, x, y); };
  const checkpoint = JSON.stringify([targets.map(appearanceKey), end, key, fine]);
  if (!repeating || heldNudge !== checkpoint) {
    heldNudge = checkpoint;
    commit(move, '', false);
  } else {
    move();
    persistEdit();
    recover();
    render();
  }
}

function dragTargets(origin: LinePick): DropTarget[] {
  if (origin.kind === 'ending' || origin.kind === 'tempo-line') {
    const root = get('score');
    const digits = [...root.querySelectorAll<SVGTextElement>('.digit')].flatMap(node => {
      const pick = elementFrom(node);
      const lane = node.closest<SVGGElement>('.voice-row')?.dataset.lane;
      return pick?.kind === 'pitch' && lane ? [{ node, at: pick.at, lane }] : [];
    });
    const bars = [...root.querySelectorAll<SVGLineElement>('.movable-boundary .line-hit, .position-fixed .line-hit')].flatMap(node => {
      const pick = elementFrom(node);
      return pick?.kind === 'barline' ? [{ node, at: prepared.measures[pick.index]?.start ?? prepared.measures.at(-1)!.end,
        lane: '', boundary: true }] : [];
    });
    return [...digits.filter(item => origin.kind !== 'tempo-line' || !tempoLine(origin.id)?.lane || item.lane === tempoLine(origin.id)?.lane), ...bars];
  }
  const link = prepared.links.find(link => origin.kind === 'span' ? link.source === origin.index :
    link.source === undefined && link.from.note.id === origin.id && link.from.at === origin.at && link.pitch === origin.pitch);
  if (!link) return [];
  const lane = link.from.note.lane;
  const rows = [...get('score').querySelectorAll<SVGGElement>('.voice-row')].filter(row => row.dataset.lane === lane);
  if (link.kind === 'crescendo' || link.kind === 'diminuendo')
    return rows.flatMap(row => [...row.querySelectorAll<SVGCircleElement>('.span-target')].map(node => ({ at: Number(node.dataset.at), node, lane })));
  return rows.flatMap(row => [...row.querySelectorAll<SVGTextElement>('.digit')].flatMap(node => {
    const pick = JSON.parse(node.closest<SVGGElement>('[data-element]')!.dataset.element!) as Extract<ElementSelection, { kind: 'pitch' }>;
    return node.textContent !== '0' ? [{ at: pick.at, pitch: pick.index, node, lane }] : [];
  }));
}

function cancelDrag() {
  if (!drag) return;
  drag.handle.classList.remove('dragging');
  drag.indicator?.remove();
  if (get('score').hasPointerCapture(drag.pointer)) get('score').releasePointerCapture(drag.pointer);
  drag = null;
}

get('score').addEventListener('pointerdown', event => {
  const node = event.target as Element;
  const handle = node.closest<SVGRectElement>('.span-handle');
  if (inline) event.preventDefault();
  if (event.button !== 0 || input) return;
  const origin = elementFrom(node);
  if (!origin) return;
  if (origin.kind === 'staff-bracket' && handle?.dataset.staffEnd && !inline) {
    event.preventDefault();
    const system = handle.closest('[data-system-first]')!;
    captureSystem(handle, origin);
    staffDrag = { pick: origin, edge: handle.dataset.staffEnd === 'top' ? 'top' : 'bottom', pointer: event.pointerId, handle,
      candidates: [...system.querySelectorAll<SVGCircleElement>('[data-staff-target]')] };
    handle.classList.add('dragging');
    get('score').setPointerCapture(event.pointerId);
    return;
  }
  if (event.altKey && !inline && canPosition(origin)) {
    const space = node.closest<SVGGraphicsElement>('.score-scale') ?? node.closest('svg');
    const inverse = space?.getScreenCTM()?.inverse();
    if (!inverse) return;
    event.preventDefault();
    const end = handle?.dataset.endpoint as CurveHandle | undefined;
    const picks = effectivePicks();
    const preserveSelection = !end && picks.length > 1 && picks.some(pick => appearanceKey(pick) === appearanceKey(origin));
    const primary = positionTargets(preserveSelection ? picks : [origin]);
    const targets = primary.map(pick => ({ pick, base: initialPlacement(pick), verticalOnly: false }));
    if (!end) targets.push(...dynamicGroupMembers(primary, node).map(pick => ({ pick, base: initialPlacement(pick), verticalOnly: true })));
    visualDrag = { pick: origin, end, pointer: event.pointerId,
      firstX: event.clientX, firstY: event.clientY, inverse, targets, preserveSelection, before: score,
      cursor: { ...cursor }, selection, range, selectedItems, unfocused, previousEnd: pickedEndpoint, signature: signSelection, moved: false };
    get('score').setPointerCapture(event.pointerId);
    return;
  }
  if (!handle || handle.dataset.endpoint === 'height' || !isLine(origin)) return;
  event.preventDefault();
  drag = { origin, endpoint: handle.dataset.endpoint as 'from' | 'to', pointer: event.pointerId, handle, candidates: dragTargets(origin) };
  handle.classList.add('dragging');
  get('score').setPointerCapture(event.pointerId);
});
get('score').addEventListener('pointermove', event => {
  if (staffDrag?.pointer === event.pointerId) {
    const target = nearestStaff(staffDrag.candidates, event.clientY);
    if (target !== staffDrag.target) {
      staffDrag.target?.setAttribute('r', '0');
      target?.setAttribute('r', '3');
      staffDrag.target = target;
    }
    return;
  }
  if (visualDrag?.pointer === event.pointerId) {
    const current = visualDrag;
    current.pending = [event.clientX, event.clientY];
    if (current.frame === undefined) current.frame = requestAnimationFrame(() => {
      current.frame = undefined;
      if (visualDrag === current) paintVisualDrag(current);
    });
    return;
  }
  if (!drag || drag.pointer !== event.pointerId) return;
  const point = new DOMPoint(event.clientX, event.clientY);
  let best = 80;
  let target: DropTarget | undefined;
  for (const candidate of drag.candidates) {
    const bounds = candidate.node.getBoundingClientRect();
    const distance = Math.hypot(point.x - bounds.left - bounds.width / 2, point.y - bounds.top - bounds.height / 2);
    if (distance < best) { best = distance; target = candidate; }
  }
  if (drag.target?.node === target?.node) return;
  drag.target = target;
  drag.indicator?.remove();
  if (!target) return;
  const svg = target.node.closest('svg')!;
  const rect = target.node.getBoundingClientRect();
  const center = new DOMPoint(rect.left + rect.width / 2, rect.top + rect.height / 2).matrixTransform(svg.getScreenCTM()!.inverse());
  const indicator = document.createElementNS(svg.namespaceURI, 'circle') as SVGCircleElement;
  indicator.setAttribute('class', 'snap-target');
  for (const [key, value] of Object.entries({ cx: center.x, cy: center.y, r: 3 })) indicator.setAttribute(key, String(value));
  svg.append(indicator);
  drag.indicator = indicator;
});
get('score').addEventListener('pointercancel', () => { cancelDrag(); cancelVisualDrag(); cancelStaffDrag(); });
get('score').addEventListener('pointerup', event => {
  if (staffDrag?.pointer === event.pointerId) {
    const { pick, edge, candidates } = staffDrag;
    const target = nearestStaff(candidates, event.clientY)?.dataset.staffTarget;
    cancelStaffDrag();
    suppressClick();
    if (target) commit(() => { changeStaffEnd(pick, edge, target); selection = pick; });
    return;
  }
  if (visualDrag?.pointer === event.pointerId) {
    const current = visualDrag;
    visualDrag = undefined;
    if (current.frame !== undefined) cancelAnimationFrame(current.frame);
    current.pending = [event.clientX, event.clientY];
    paintVisualDrag(current);
    if (get('score').hasPointerCapture(event.pointerId)) get('score').releasePointerCapture(event.pointerId);
    if (current.moved) {
      suppressClick();
      commit(() => {}, '', true, current.before, current.cursor);
    } else if (current.end) {
      suppressClick();
      selection = current.pick;
      pickedEndpoint = current.end;
      range = null;
      controls();
    } else {
      suppressClick();
      const pick = current.pick;
      const note = pick.kind === 'pitch' ? prepared.tokens.find(token => token.at === pick.at && token.note.id === pick.id)?.note : undefined;
      if (pick.kind === 'pitch' && note) select({ lane: note.lane, at: pick.at }, false, pick, true);
      else if (pick.kind === 'extension') {
        const token = extensionToken(pick);
        if (token) select({ lane: token.note.lane, at: pick.at }, false, pick);
      }
      else {
        selection = pick; pickedEndpoint = undefined; range = null;
        signSelection = pick.kind === 'signature' ? { index: pick.index, kind: pick.field } : null;
        controls();
      }
    }
    return;
  }
  if (!drag || drag.pointer !== event.pointerId) return;
  const { origin, endpoint, target } = drag;
  cancelDrag();
  suppressClick();
  if (!target) { selection = origin; pickedEndpoint = endpoint; range = null; controls(); return; }
  commit(() => {
    if (origin.kind === 'tempo-line') {
      const line = tempoLine(origin.id)!;
      const from = endpoint === 'from' ? target.at : line.from;
      const to = endpoint === 'to' ? target.at : line.to;
      if (from >= to) throw Error('渐变起点须早于终点。');
      Object.assign(line, { from, to });
      if (line.playback !== false) setTempoLinePlayback(score, line, true);
      selection = origin;
      pickedEndpoint = endpoint;
      return;
    }
    if (origin.kind === 'ending') {
      const ending = score.endings![origin.index];
      const { from, to } = endingRange(ending, prepared.measures);
      const token = target.boundary ? undefined : tokenAt(target);
      const at = endpoint === 'to' && token ? token.at + token.length : target.at;
      setEndingRange(score, ending, endpoint === 'from' ? at : from, endpoint === 'to' ? at : to);
      selection = origin;
      pickedEndpoint = endpoint;
      return;
    }
    let index = origin.kind === 'span' ? origin.index : -1;
    if (origin.kind === 'generated-tie') {
      const link = prepared.links.find(link => link.source === undefined && link.from.note.id === origin.id &&
        link.from.at === origin.at && link.pitch === origin.pitch);
      if (!link) throw Error('找不到拆写同音线。');
      const first = fragment(link.from);
      const last = fragment(link.to);
      index = score.spans.findIndex(span => span.kind === 'tie' && span.from === first.id && span.to === last.id && span.pitch === origin.pitch);
    }
    if (index < 0) throw Error('找不到可编辑的线条。');
    const span = score.spans[index];
    if (span.kind === 'crescendo' || span.kind === 'diminuendo') {
      const token = tokenAt(target);
      if (token?.note.pitches.length) setSpanEnd(score, index, endpoint, fragment(token));
      else setSpanTime(score, index, endpoint, target.at);
    }
    else {
      const token = tokenAt(target);
      if (!token) throw Error('端点须落在音符数字上。');
      const previous = score.notes.find(note => note.id === span[endpoint]);
      if (previous?.at === token.at && (span.kind !== 'tie' || target.pitch === (endpoint === 'from' ? span.pitch : span.targetPitch))) return;
      setSpanEnd(score, index, endpoint, fragment(token), target.pitch);
    }
    selection = { kind: 'span', index };
    pickedEndpoint = endpoint;
  }, '已调整线条端点。');
});
let pan: { pointer: number; x: number; y: number; left: number; top: number; moved: boolean } | undefined;
get('desk').addEventListener('pointerdown', event => {
  if (event.button !== 0 || event.altKey || drag || visualDrag || (event.target as Element).closest('.span-handle')) return;
  const surface = get('desk');
  pan = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: surface.scrollLeft, top: surface.scrollTop, moved: false };
});
get('desk').addEventListener('pointermove', event => {
  const surface = get('desk');
  if (pan?.pointer !== event.pointerId) return;
  const dx = event.clientX - pan.x;
  const dy = event.clientY - pan.y;
  if (!pan.moved && Math.hypot(dx, dy) < 4) return;
  if (!pan.moved) {
    pan.moved = true;
    surface.setPointerCapture(event.pointerId);
    surface.classList.add('panning');
  }
  surface.scrollLeft = pan.left - dx;
  surface.scrollTop = pan.top - dy;
});
function finishPan(event: PointerEvent) {
  if (pan?.pointer !== event.pointerId) return;
  if (pan.moved) suppressClick();
  pan = undefined;
  get('desk').classList.remove('panning');
}
get('desk').addEventListener('pointerup', finishPan);
get('desk').addEventListener('pointercancel', finishPan);
get('desk').addEventListener('pointerleave', () => { if (pan && !pan.moved) pan = undefined; });
function clearSelection() {
  const feedback = finishInputSlur();
  resetOneNoteSettings();
  graceEdit = undefined;
  systemFocus = systemLane = undefined;
  signSelection = null;
  if (inline) finishInline(true);
  selection = range = selectedItems = lyricAnchor = lyricFocus = null;
  pickedEndpoint = undefined;
  input = false;
  unfocused = true;
  message = feedback;
  controls();
}
get('desk').addEventListener('click', event => { if (!ignoreClick && event.target === get('desk')) clearSelection(); });
get('score').onclick = event => {
  if (ignoreClick || drag) return;
  const target = event.target as Element;
  const sign = target.closest<SVGGElement>('[data-signature]');
  if (sign && !input) {
    const pick = signaturePick(sign)!;
    captureSystem(sign, pick);
    if (inline) finishInline(true);
    signSelection = null;
    if (event.ctrlKey) { togglePicked(pick, selection, selectedItems); return; }
    selection = range = selectedItems = lyricAnchor = lyricFocus = null;
    selection = pick;
    signSelection = { index: pick.index, kind: pick.field };
    unfocused = false;
    workbench.setPanel('properties');
    controls();
    if (pick.header && event.detail === 2) {
      if (pick.field === 'key') get('title-key-fields').querySelector<HTMLSelectElement>('[data-title-key-control]')?.focus();
      else { field('sig-meter-top').focus(); field('sig-meter-top').select(); }
    }
    return;
  }
  const element = target.closest<SVGGElement>('[data-element]');
  const pick: ElementSelection | null = element ? JSON.parse(element.dataset.element!) : null;
  pickedEndpoint = undefined;
  if (inline) finishInline(true);
  if (!pick) { lastClick = lastTextClick = null; clearSelection(); return; }
  if (pick.kind === 'grace') {
    const host = graceHost(pick.id);
    if (!host) return;
    captureSystem(element!, pick);
    if (event.ctrlKey && !graceEdit) { togglePicked(pick, selection, selectedItems); return; }
    if (event.detail === 2 || graceEdit?.id === pick.id && graceEdit.side === pick.side) {
      beginGrace(pick.side, 48, pick);
      return;
    }
    graceEdit = undefined;
    const feedback = finishInputSlur();
    resetOneNoteSettings();
    input = false;
    select({ lane: host.lane, at: host.at }, false, pick);
    const pitch = selectedGrace(pick)?.pitches[pick.index];
    if (preferences.click && pitch) void player.preview([sound(pitch, tonicAt(score, host.at))], false, preferences.seconds, preferences.volume / 100);
    if (feedback) get('status').textContent = feedback;
    if (!workbench.isHidden()) workbench.setPanel('properties', false);
    return;
  }
  if (pick.kind === 'grace-line') {
    const host = graceHost(pick.id);
    if (!host) return;
    graceEdit = undefined;
    const feedback = finishInputSlur();
    resetOneNoteSettings();
    input = false;
    captureSystem(element!, pick);
    select({ lane: host.lane, at: host.at }, false, pick);
    if (feedback) get('status').textContent = feedback;
    if (!workbench.isHidden()) workbench.setPanel('properties', false);
    return;
  }
  graceEdit = undefined;
  if (input && pick.kind !== 'pitch') { lastClick = null; return; }
  captureSystem(element!, pick);
  signSelection = null;
  const previousRange = range;
  const previousCursor = cursor;
  const previousSelection = selection;
  const previousItems = selectedItems;
  const previousLyricAnchor = lyricAnchor;
  selectedItems = lyricAnchor = lyricFocus = null;
  unfocused = false;
  if (event.ctrlKey && !input) { togglePicked(pick, previousSelection, previousItems); return; }
  if (pick.kind === 'span' || pick.kind === 'generated-tie' || pick.kind === 'tempo-line') {
    lastClick = null;
    selection = pick;
    range = null;
    message = '线条已选中：拖动谱面方柄调整端点。';
    controls();
    if (!workbench.isHidden()) workbench.setPanel('properties', false);
    if (pick.kind === 'tempo-line' && event.detail === 2) field('tempo-line-caption').focus();
    return;
  }
  if (pick.kind === 'tempo-mark') {
    selection = pick;
    range = null;
    const mark = tempoMark(pick.id);
    if (mark) cursor = { lane: systemLane ?? cursor.lane, at: mark.at };
    controls();
    if (!workbench.isHidden()) workbench.setPanel('properties', false);
    if (event.detail === 2) field(mark?.kind === 'metronome' ? 'tempo-written' : 'tempo-caption').focus();
    return;
  }
  if (pick.kind === 'chord-symbol' || pick.kind === 'route') {
    const key = appearanceKey(pick);
    const doubled = event.detail === 2 || lastTextClick?.pick === key && event.timeStamp - lastTextClick.time < 450 &&
      Math.hypot(event.clientX - lastTextClick.x, event.clientY - lastTextClick.y) < 6;
    const symbol = pick.kind === 'chord-symbol' ? score.chordSymbols?.find(symbol => symbol.id === pick.id) : undefined;
    const bar = pick.kind === 'route' ? prepared.measures[pick.index] : undefined;
    const route = bar?.route?.find(mark => mark.id === pick.id);
    const at = symbol?.at ?? (bar && route && !routeAtStart(route) ? Math.max(bar.start, bar.end - .01) : bar?.start);
    if (at !== undefined) select({ lane: symbol?.lane ?? systemLane ?? cursor.lane, at }, false, pick);
    lastTextClick = doubled ? null : { pick: key, time: event.timeStamp, x: event.clientX, y: event.clientY };
    if (doubled) {
      if (pick.kind === 'route') workbench.setPanel('properties');
      else openChordSymbol();
    } else if (!workbench.isHidden()) workbench.setPanel('properties', false);
    return;
  }
  if (pick.kind === 'lane-name' || pick.kind === 'divisi-brace') {
    const key = appearanceKey(pick);
    const doubled = event.detail === 2 || lastTextClick?.pick === key && event.timeStamp - lastTextClick.time < 450
      && Math.hypot(event.clientX - lastTextClick.x, event.clientY - lastTextClick.y) < 6;
    lastClick = null;
    lastTextClick = { pick: key, time: event.timeStamp, x: event.clientX, y: event.clientY };
    selection = pick;
    cursor = { lane: pick.lane, at: pick.at };
    range = null;
    controls();
    if (!workbench.isHidden()) workbench.setPanel('properties', false);
    if (doubled && pick.kind === 'lane-name') startText(pick);
    return;
  }
  const textPick = pick.kind === 'header' || pick.kind === 'mark' && ['lyric', 'dynamic', 'text', 'interNoteText', 'rehearsal'].includes(pick.field);
  const textKey = textPick ? JSON.stringify(pick) : '';
  const textDouble = textPick && (event.detail === 2 || lastTextClick?.pick === textKey &&
    event.timeStamp - lastTextClick.time < 450 && Math.hypot(event.clientX - lastTextClick.x, event.clientY - lastTextClick.y) < 6);
  lastTextClick = textPick ? { pick: textKey, time: event.timeStamp, x: event.clientX, y: event.clientY } : null;
  if (pick.kind === 'tuplet') {
    const group = score.tuplets?.find(group => group.id === pick.id);
    if (group) select({ lane: group.lane, at: group.at }, false, pick);
    if (!workbench.isHidden()) workbench.setPanel('properties', false);
    return;
  }
  if (pick.kind === 'header') {
    selection = pick;
    range = null;
    if (textDouble) { lastTextClick = null; startText(pick); }
    else controls();
    if (!workbench.isHidden()) workbench.setPanel('properties', false);
    return;
  }
  if (pick.kind === 'barline' || pick.kind === 'bar-fermata' || pick.kind === 'break' || pick.kind === 'ending' || pick.kind === 'measure-number' || pick.kind === 'staff-bracket' || pick.kind === 'staff-guide') {
    selection = pick;
    range = null;
    controls();
    if (!workbench.isHidden()) workbench.setPanel('properties', false);
    if (pick.kind === 'ending') get<HTMLDetailsElement>('repeat-tools').open = true;
    return;
  }
  if (pick.kind === 'signature') return;
  if (pick.kind === 'extension') {
    const token = extensionToken(pick);
    if (token) {
      const next = { lane: token.note.lane, at: pick.at };
      if (event.shiftKey && !input) selectMouseRange(previousRange ?? (previousSelection?.kind === 'extension' ? { ...previousCursor, at: previousSelection.at } : previousCursor), next);
      else select(next, false, pick);
    }
    return;
  }
  const note = pick.kind === 'pitch'
    ? prepared.tokens.find(token => token.note.id === pick.id && token.at === pick.at)?.note
    : score.notes.find(item => item.id === pick.id);
  if (!note) return;
  const next = { lane: note.lane, at: pick.kind === 'pitch' ? pick.at : note.at + (pick.kind === 'mark' ? pick.extension ?? 0 : 0) };
  if (pick.kind === 'mark' && pick.field === 'lyric') verseNumber = pick.verse ?? 1;
  if (textDouble && pick.kind === 'mark') {
    lastTextClick = null;
    cursor = next;
    if (pick.field === 'lyric') startLyrics(next, false);
    else startText(pick as TextSelection);
    return;
  }
  const repeated = !input && !event.shiftKey && pick.kind === 'pitch' &&
    (event.detail === 2 || lastClick && lastClick.lane === next.lane && lastClick.at === next.at
      && event.timeStamp - lastClick.time < 450 && Math.hypot(event.clientX - lastClick.x, event.clientY - lastClick.y) < 6);
  lastClick = !pick || pick.kind === 'pitch' ? { ...next, time: event.timeStamp, x: event.clientX, y: event.clientY } : null;
  if (event.shiftKey && !input) {
    range = previousRange ?? (previousSelection?.kind === 'extension' ? { ...previousCursor, at: previousSelection.at } : previousCursor);
    selection = null;
    cursor = next;
    rangeTip = next;
    if (pick.kind === 'mark' && pick.field === 'lyric' && (previousLyricAnchor || previousSelection?.kind === 'mark' && previousSelection.field === 'lyric')) {
      lyricAnchor = previousLyricAnchor ?? { ...range, verse: previousSelection?.kind === 'mark' ? previousSelection.verse ?? 1 : 1 };
      lyricFocus = { ...next, verse: pick.verse ?? 1 };
      selectedItems = lyricElements(lyricAnchor, lyricFocus);
    } else selectedItems = rangeElements(range, cursor, true);
    controls();
  } else {
    select(next, false, input ? null : pick, pick.kind === 'pitch');
  }
  if (repeated) { lastClick = null; mode(true); }
};
get('score').addEventListener('click', event => {
  if (!player.active || ignoreClick || drag || event.button !== 0 || !event.isTrusted) return;
  const node = (event.target as Element).closest<SVGGElement>('[data-element], [data-signature]');
  const pick = node && (node.dataset.element ? elementFrom(node) : signaturePick(node));
  if (!pick) return;
  void startPlayback(false, playbackFocus(pick).at);
});
type DisplayedObject = { pick: ElementSelection; lane?: string; at?: number; system: Element | null; page: string | undefined };
function signaturePick(node: Element): Extract<ElementSelection, { kind: 'signature' }> | undefined {
  const sign = node.closest<SVGGElement>('[data-signature]');
  if (sign) return { kind: 'signature', index: Number(sign.dataset.signature), field: sign.dataset.signatureKind === 'key' ? 'key' : 'meter',
    header: sign.hasAttribute('data-title-signature') ? true : undefined };
}
function displayedObjects(): DisplayedObject[] {
  const notes = new Map(score.notes.map(note => [note.id, note]));
  const entries: DisplayedObject[] = [];
  for (const node of get('score').querySelectorAll<SVGGElement>('[data-element], [data-signature]')) {
    const pick = node.dataset.element ? JSON.parse(node.dataset.element) as ElementSelection : signaturePick(node)!;
    const lane = pick.kind === 'lane-name' || pick.kind === 'divisi-brace' ? pick.lane : node.closest<SVGGElement>('.voice-row')?.dataset.lane;
    const at = pick.kind === 'pitch' || pick.kind === 'extension' || pick.kind === 'generated-tie' || pick.kind === 'lane-name' || pick.kind === 'divisi-brace' ? pick.at :
      pick.kind === 'mark' ? notes.has(pick.id) ? notes.get(pick.id)!.at + (pick.extension ?? 0) : undefined :
        pick.kind === 'grace' || pick.kind === 'grace-line' ? notes.get(pick.id)?.at :
        pick.kind === 'barline' || pick.kind === 'bar-fermata' || pick.kind === 'break' || pick.kind === 'signature' || pick.kind === 'measure-number' ? prepared.measures[pick.index]?.start ?? prepared.measures.at(-1)?.end :
          pick.kind === 'staff-guide' ? prepared.measures[pick.index]?.start :
          pick.kind === 'tuplet' ? score.tuplets?.find(item => item.id === pick.id)?.at :
          pick.kind === 'staff-bracket' ? prepared.measures[pick.first]?.start :
          pick.kind === 'tempo-mark' ? tempoMark(pick.id)?.at : pick.kind === 'tempo-line' ? tempoLine(pick.id)?.from :
          pick.kind === 'chord-symbol' ? score.chordSymbols?.find(symbol => symbol.id === pick.id)?.at :
          pick.kind === 'route' ? prepared.measures[pick.index]?.start :
          pick.kind === 'span' ? prepared.links.find(link => link.source === pick.index)?.from.at :
          pick.kind === 'ending' ? endingRange(score.endings![pick.index], prepared.measures).from : undefined;
    entries.push({ pick, lane, at, system: node.closest('.score-system'), page: node.closest<SVGSVGElement>('.sheet')?.dataset.page });
  }
  return entries;
}
function uniquePicks(items: ElementSelection[]) {
  return [...new Map(items.map(item => [appearanceKey(item), item])).values()];
}
function paintSelections() {
  if (!selectedItems && !unfocused) return;
  const keys = new Set(selectedItems?.map(appearanceKey));
  for (const node of get('score').querySelectorAll<SVGGElement>('[data-element], [data-signature]')) {
    const pick = node.dataset.element ? JSON.parse(node.dataset.element) as ElementSelection : signaturePick(node)!;
    node.classList.toggle('picked', !input && keys.has(appearanceKey(pick)));
  }
}
function selectMouseRange(anchor: Cursor, tip: Cursor) {
  range = anchor;
  rangeTip = cursor = tip;
  selection = null;
  selectedItems = rangeElements(anchor, tip, true);
  controls();
}
function rangeElements(a: Cursor, b: Cursor, mouse = false) {
  const lane = score.lanes.map(item => item.id);
  const [start, end] = [a.at, b.at].sort((left, right) => left - right);
  const bar = mouse && a.lane !== b.lane ? prepared.measures.find(item => end >= item.start && end < item.end) : undefined;
  const beatEnd = bar ? beatStarts(score, bar).find(at => at > end) ?? bar.end : undefined;
  const order = mouse ? score.lanes.filter(item => !item.parent).flatMap(main =>
    [main.id, ...score.lanes.filter(item => item.parent === main.id).map(item => item.id)]) : lane;
  const [top, bottom] = [order.indexOf(a.lane), order.indexOf(b.lane)].sort((x, y) => x - y);
  return uniquePicks(displayedObjects().filter(item => (item.pick.kind === 'pitch' || mouse && item.pick.kind === 'extension') &&
    item.at! >= start && (item.at! <= end || beatEnd !== undefined && item.at! < beatEnd) &&
    item.lane && order.indexOf(item.lane) >= top && order.indexOf(item.lane) <= bottom).map(item => item.pick));
}
function lyricRows() {
  return score.lanes.flatMap(lane => {
    const rows = [...new Set(score.notes.filter(note => note.lane === lane.id).flatMap(note => noteVerses(note).map(verse => verse.number)))];
    return (rows.length ? rows.sort((a, b) => a - b) : [1]).map(verse => ({ lane: lane.id, verse }));
  });
}
function lyricElements(a: LyricPosition, b: LyricPosition) {
  const rows = lyricRows();
  const index = (p: LyricPosition) => rows.findIndex(row => row.lane === p.lane && row.verse === p.verse);
  const [first, last] = [index(a), index(b)].sort((x, y) => x - y);
  const [start, end] = [a.at, b.at].sort((left, right) => left - right);
  return uniquePicks(displayedObjects().filter(item => {
    if (item.pick.kind !== 'mark' || item.pick.field !== 'lyric' || !item.lane || item.at === undefined) return false;
    const row = index({ lane: item.lane, verse: item.pick.verse ?? 1, at: item.at });
    return row >= first && row <= last && item.at >= start && item.at <= end;
  }).map(item => item.pick));
}
function togglePicked(pick: ElementSelection, previous: ElementSelection | null, previousItems?: ElementSelection[] | null) {
  const list = previousItems ?? selectedItems ?? (previous ? [previous] : []);
  const key = appearanceKey(pick);
  selectedItems = list.some(item => appearanceKey(item) === key) ? list.filter(item => appearanceKey(item) !== key) : [...list, pick];
  selection = selectedItems.at(-1) ?? null;
  signSelection = selection?.kind === 'signature' && selectedItems.length === 1 ? { index: selection.index, kind: selection.field } : null;
  range = null;
  unfocused = !selectedItems.length;
  controls();
}
function stepAt(tokens: number[], at: number, direction: number, byMeasure: boolean) {
  if (!byMeasure) return direction > 0 ? tokens.find(tick => tick > at) : tokens.filter(tick => tick < at).at(-1);
  const measure = prepared.measures.find(item => at < item.end)!;
  const local = tokens.filter(tick => tick >= measure.start && tick < measure.end);
  if (direction < 0) return local[0] < at ? local[0] : tokens.filter(tick => tick < measure.start).at(-1);
  return (local.at(-1) ?? at) > at ? local.at(-1) : tokens.find(tick => tick >= measure.end);
}
function visibleTokens(lane: string) {
  const numbered = new Set<number>();
  for (const system of get('score').querySelectorAll<SVGGElement>('[data-system-first]')) {
    const shown = readSystem(system)!;
    if (shown.visible.includes(lane)) for (let index = shown.first; index <= shown.last; index++) numbered.add(index);
  }
  return (prepared.byLane.get(lane) ?? []).filter(token => numbered.has(token.measure));
}
function measureSelectionStep(tokens: Token[], at: number, anchor: number, direction: number) {
  const current = prepared.measures.find(bar => at >= bar.start && at < bar.end);
  const origin = prepared.measures.find(bar => anchor >= bar.start && anchor < bar.end);
  if (!current || !origin) return undefined;
  const local = tokens.filter(token => token.measure === current.index);
  const side = Math.sign(at - anchor);
  const edge = direction > 0 ? local.at(-1)?.at : local[0]?.at;
  if ((current.index === origin.index || side === direction) && edge !== undefined && edge !== at) return edge;
  const adjacent = direction > 0 ? tokens.find(token => token.measure > current.index) :
    tokens.filter(token => token.measure < current.index).at(-1);
  if (!adjacent) return undefined;
  const next = tokens.filter(token => token.measure === adjacent.measure);
  const targetSide = Math.sign(adjacent.measure - origin.index) || side || direction;
  return targetSide < 0 ? next[0].at : next.at(-1)!.at;
}
function selectByArrow(key: string, extend: boolean, byMeasure: boolean) {
  const direction = key === 'arrowleft' || key === 'arrowup' ? -1 : 1;
  const vertical = key === 'arrowup' || key === 'arrowdown';
  if (lyricFocus || selection?.kind === 'mark' && selection.field === 'lyric') {
    const current = lyricFocus ?? { ...cursor, verse: selection!.kind === 'mark' ? selection!.verse ?? 1 : verseNumber };
    const target = { ...current };
    if (vertical) {
      const active = new Set(score.lanes.filter(lane => !lane.parent || lane.start! <= current.at && current.at < lane.end!).map(lane => lane.id));
      const rows = lyricRows().filter(row => active.has(row.lane));
      const index = rows.findIndex(row => row.lane === current.lane && row.verse === current.verse);
      const row = rows[index + direction];
      if (!row) return;
      Object.assign(target, row);
    } else {
      const tokens = prepared.byLane.get(current.lane) ?? [];
      const words = new Map(tokens.map(token => [token.at, lyricValue(token, current.verse)]));
      const at = stepAt(lyricStops(tokens, lyricGroups(score, prepared, current.lane), words), current.at, direction, byMeasure);
      if (at === undefined) return;
      target.at = at;
    }
    lyricAnchor = extend ? lyricAnchor ?? current : target;
    lyricFocus = target;
    cursor = { lane: target.lane, at: target.at };
    verseNumber = target.verse;
    range = null;
    selectedItems = lyricElements(lyricAnchor, target);
    selection = selectedItems.at(-1) ?? null;
    controls();
    return;
  }
  const position = rangeTip ?? cursor;
  const next = { ...position };
  if (vertical) {
    const index = prepared.measures.find(bar => position.at >= bar.start && position.at < bar.end)?.index;
    const shown = systemAtIndex(index)?.visible;
    const lanes = score.lanes.filter(lane => (!shown || shown.includes(lane.id)) && (!lane.parent || lane.start! <= position.at && position.at < lane.end!));
    const target = lanes[lanes.findIndex(lane => lane.id === position.lane) + direction];
    if (!target) return;
    next.lane = target.id;
  } else {
    const tokens = visibleTokens(position.lane);
    const at = extend && byMeasure ? measureSelectionStep(tokens, position.at, (range ?? cursor).at, direction) :
      stepAt(tokens.map(token => token.at), position.at, direction, byMeasure);
    if (at === undefined) return;
    next.at = at;
  }
  if (!extend) { select(next); return; }
  range ??= cursor;
  cursor = next;
  rangeTip = next;
  selection = null;
  selectedItems = rangeElements(range, cursor);
  controls();
}
const selectedPicks = () => selectedItems ?? (selection ? [selection] : []);
type SimilarReference = { seed: ElementSelection; page?: string; system?: string; lane?: string; existing: ElementSelection[] };
let contextSimilar: SimilarReference | undefined;
const systemStart = (system: Element | null) => system?.querySelector<SVGRectElement>('[data-play-measure]')?.dataset.playMeasure;
function similarSelection(reference?: SimilarReference) {
  const seed = reference?.seed ?? selection ?? selectedItems?.[0] ?? (signSelection ? { kind: 'signature', index: signSelection.index, field: signSelection.kind } : undefined);
  if (!seed) return;
  const dialog = get<HTMLDialogElement>('similar-dialog');
  const options = get('similar-options');
  const existing = reference?.existing ?? selectedPicks();
  const rows = displayedObjects();
  const occurrences = rows.filter(item => appearanceKey(item.pick) === appearanceKey(seed));
  const initial = reference ? occurrences.find(row => row.page === reference.page &&
    systemStart(row.system) === reference.system && row.lane === reference.lane) ?? occurrences[0] : occurrences[0];
  if (!initial) return;
  const notes = new Map(score.notes.map(note => [note.id, note]));
  const tokens = new Map(prepared.tokens.map(token => [JSON.stringify([token.note.id, token.at]), token]));
  const lanes = new Map(score.lanes.map(lane => [lane.id, lane]));
  const describe = (pick: ElementSelection): { groups: string[]; content?: string; token?: Token; pitch?: NonNullable<Note['pitches'][number]> } => {
    if (pick.kind === 'pitch') {
      const token = tokens.get(JSON.stringify([pick.id, pick.at]));
      const pitch = token?.note.pitches[pick.index];
      return { groups: ['音符数字', pitch ? '发声音符' : '休止'], token, pitch };
    }
    if (pick.kind === 'extension') return { groups: ['增时线'] };
    if (pick.kind === 'tempo-mark') { const mark = tempoMark(pick.id); return { groups: ['速度记号'], content: mark && tempoLabel(mark) }; }
    if (pick.kind === 'tempo-line') { const line = tempoLine(pick.id); return { groups: ['线性记号', '渐变速度'], content: line?.label || line?.kind }; }
    if (pick.kind === 'bar-fermata') return { groups: ['演奏记号', '延长记号', '小节线延长记号'] };
    if (pick.kind === 'header') return { groups: ['非音符数字文字', '标题区文字', markNames[pick.field]],
      content: pick.field === 'tempo' ? '♩=' + score.tempo : score[pick.field] };
    if (pick.kind === 'lane-name') {
      const lane = lanes.get(pick.lane);
      return { groups: ['非音符数字文字', '声部名称', pick.field === 'name' ? '声部全名' : '声部简称'],
        content: lane && laneNameValue(lane, pick.field, laneNameBar(pick)) };
    }
    if (pick.kind === 'measure-number') return { groups: ['非音符数字文字', '小节号'], content: String(prepared.measures[pick.index].number) };
    if (pick.kind === 'staff-bracket') {
      const type = staffBracket(pick)?.type;
      return { groups: ['连谱号', ...(type ? [{ bracket: '粗括号', brace: '花括号', square: '细方括号' }[type]] : [])] };
    }
    if (pick.kind === 'mark') {
      const note = notes.get(pick.id);
      if (pick.field === 'lyric') {
        const verse = note && noteVerses(note).find(verse => verse.number === (pick.verse ?? 1));
        return { groups: ['非音符数字文字', '歌词'], content: verse?.text };
      }
      if (pick.field === 'text' || pick.field === 'interNoteText' || pick.field === 'rehearsal' || pick.field === 'dynamic')
        return { groups: ['非音符数字文字', pick.field === 'dynamic' ? '力度记号' : markNames[pick.field]], content: note && noteTextValue(note, pick.field, pick.extension) };
      if (pick.field === 'breath') {
        const shape = breathShape(note?.breath);
        const shapeName = shape && { upbow: 'V 形换气', comma: '逗号换气', tick: '短划换气', salzedo: '萨尔塞多式换气' }[shape];
        return { groups: ['演奏记号', '换气', ...(shapeName ? [shapeName] : [])] };
      }
      if (pick.field === 'accidental') {
        const pitch = note?.pitches[pick.pitch ?? 0];
        const subtype = pitch && ({ '-2': '重降号', '-1': '降号', '0': '还原号', '1': '升号', '2': '重升号' } as Record<number, string>)[pitch.alter];
        return { groups: ['临时变音记号', ...(subtype ? [subtype] : [])] };
      }
      return { groups: [pick.field === 'lyric-extension' ? '线性记号' : '演奏记号', markNames[pick.field]] };
    }
    if (pick.kind === 'generated-tie') return { groups: ['线性记号', '同音线'] };
    if (pick.kind === 'span') return { groups: ['线性记号', lineNames[score.spans[pick.index].kind]] };
    if (pick.kind === 'signature') return { groups: ['调拍记号', pick.field === 'key' ? '调号' : '拍号'],
      content: pick.field === 'key' ? keyName(prepared.measures[pick.index].key) :
        prepared.measures[pick.index].meter.numerator + '/' + prepared.measures[pick.index].meter.denominator };
    if (pick.kind === 'barline') return { groups: ['小节线', barLabels[boundaryAt(score, pick.index).style]] };
    if (pick.kind === 'break') return { groups: ['断行记号', boundaryAt(score, pick.index).break === 'page' ? '换页记号' : '换行记号'] };
    if (pick.kind === 'ending') return { groups: ['线性记号', '房子'], content: score.endings?.[pick.index]?.passes.join(', ') };
    if (pick.kind === 'tuplet') return { groups: ['多连音'], content: String(score.tuplets?.find(group => group.id === pick.id)?.count ?? '') };
    if (pick.kind === 'chord-symbol') return { groups: ['和弦代号'], content: score.chordSymbols?.find(symbol => symbol.id === pick.id)?.text };
    if (pick.kind === 'route') {
      const mark = score.measures[pick.index].route?.find(mark => mark.id === pick.id);
      return { groups: ['跳转与尾声', ...(mark ? [mark.kind] : [])], content: mark && routeCaption(mark) };
    }
    if (pick.kind === 'grace') return { groups: ['倚音', pick.side === 'before' ? '前倚音' : '后倚音'] };
    if (pick.kind === 'grace-line') return { groups: ['倚音连线'] };
    if (pick.kind === 'staff-guide') return { groups: ['谱组纵线'] };
    return { groups: ['临时分部花括号', pick.side === 'start' ? '分部起始花括号' : '分部结束花括号'] };
  };
  const identified = rows.map(row => ({ ...row, descriptor: describe(row.pick) }));
  const { groups, content, pitch, token } = describe(seed);
  type Rule = { title: string; test: (row: typeof identified[number]) => boolean; checked?: boolean };
  const term = content?.normalize().trim();
  const attributes: Rule[] = groups.filter((group, i) => group && groups.indexOf(group) === i).map((group, i, expanded) =>
    ({ title: '同是' + group, test: row => row.descriptor.groups.includes(group), checked: i === expanded.length - 1 }));
  if (term) attributes.push({ title: `内容同为「${graphemes(term).slice(0, 28).join('')}${graphemes(term).length > 28 ? '…' : ''}」`,
    test: row => row.descriptor.content?.normalize().trim() === term });
  if (token) attributes.push({ title: '同一显示时值', test: row => row.descriptor.token?.length === token.length });
  if (pitch && seed.kind === 'pitch') attributes.push(
    { title: '同一唱名数字', test: row => row.descriptor.pitch?.degree === pitch.degree },
    { title: '同一实际音高', test: row => !!row.descriptor.pitch && sound(row.descriptor.pitch, tonicAt(score, row.at!)) === sound(pitch, tonicAt(score, seed.at)) });
  const locations: Rule[] = [];
  if (initial.lane) {
    const initialVoice = lanes.get(initial.lane);
    locations.push({ title: initialVoice?.parent ? '同一临时分部行' : '同一声部', test: row => row.lane === initial.lane });
    if (initialVoice?.parent || score.lanes.some(lane => lane.parent === initial.lane)) {
      const main = initialVoice?.parent ?? initial.lane;
      locations.push({ title: '同一主声部及其分部', test: row => !!row.lane && (lanes.get(row.lane)?.parent ?? row.lane) === main });
    }
  }
  const measure = initial.at === undefined ? undefined : prepared.measures.find(bar => initial.at! >= bar.start && initial.at! < bar.end);
  if (measure) locations.push({ title: '同一小节', test: row => row.at !== undefined && row.at >= measure.start && row.at < measure.end });
  if (initial.system) locations.push({ title: '同一行谱组', test: row => row.system === initial.system });
  if (initial.page) locations.push({ title: '同一页', test: row => row.page === initial.page });
  if (seed.kind === 'mark' && seed.field === 'lyric') locations.push({ title: '同一歌词段', test: row =>
    row.pick.kind === 'mark' && row.pick.field === 'lyric' && (row.pick.verse ?? 1) === (seed.verse ?? 1) });
  const previousKeys = new Set(existing.map(appearanceKey));
  if (previousKeys.size) locations.push({ title: '限当前选区', test: row => previousKeys.has(appearanceKey(row.pick)) });
  const filters: { rule: Rule; control: HTMLInputElement }[] = [];
  const column = (name: string, rules: Rule[]) => {
    const box = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = name;
    box.append(legend);
    for (const rule of rules) {
      const control = document.createElement('input');
      control.type = 'checkbox';
      control.checked = !!rule.checked;
      const label = choice(rule.title, control);
      label.className = 'check-option';
      label.prepend(control);
      filters.push({ rule, control });
      box.append(label);
    }
    return box;
  };
  options.replaceChildren(column('属性与内容', attributes), column('位置', locations));
  const matched = () => uniquePicks(identified.filter(row => filters.every(({ rule, control }) => !control.checked || rule.test(row))).map(row => row.pick));
  const count = () => { get('similar-count').textContent = `${matched().length} 个匹配`; };
  filters.forEach(({ control }) => { control.onchange = count; });
  count();
  dialog.returnValue = '';
  dialog.onclose = () => {
    if (dialog.returnValue !== 'apply') return;
    const hits = matched();
    const action = selectField('similar-action').value;
    const keys = new Set(hits.map(appearanceKey));
    selectedItems = action === 'add' ? uniquePicks([...existing, ...hits]) :
      action === 'subtract' ? existing.filter(item => !keys.has(appearanceKey(item))) : hits;
    selection = selectedItems.at(-1) ?? null;
    signSelection = selection?.kind === 'signature' && selectedItems.length === 1 ? { index: selection.index, kind: selection.field } : null;
    range = lyricAnchor = lyricFocus = null;
    unfocused = !selection;
    render();
    focus();
  };
  dialog.showModal();
}
type CopiedNote = { note: Note; tonalCenter: number; lane: number; rhythm?: { pick: RhythmPick; appearance: Appearance }[] };
type CopiedMark = { pick: ElementSelection; lane: number; at: number; note?: Note; span?: Span; end?: number; tempo?: TempoLine; appearance?: Appearance; chord?: { text: string; actual?: string } };
type CopiedStructure = { measures: Measure[]; boundaries: Boundary[]; endings: { ending: Ending; from: number; to: number }[] };
let lyricClipboard: { lane: number; verse: number; sourceVerse: number; cells: LyricCell[] }[] | undefined;
let lyricClipboardAsText = '';
let scoreClipboard: { start: number; width: number; notes: CopiedNote[]; marks: CopiedMark[]; spans: Span[]; whole: boolean; voiceCount: number; tuplets: Tuplet[];
  structure?: CopiedStructure } | undefined;

let indexedNotation: typeof prepared | undefined;
let tokensById = new Map<string, Map<number, Token>>();
function noteTokens(id: string) {
  if (indexedNotation !== prepared) {
    indexedNotation = prepared;
    tokensById = new Map();
    for (const token of prepared.tokens) {
      const tokens = tokensById.get(token.note.id) ?? new Map<number, Token>();
      tokens.set(token.at, token);
      tokensById.set(token.note.id, tokens);
    }
  }
  return tokensById.get(id);
}
function markedToken(id: string) {
  const token = noteTokens(id)?.values().next().value;
  return token?.continuation ? undefined : token;
}
function pickToken(pick: Extract<ElementSelection, { kind: 'pitch' }>) {
  return noteTokens(pick.id)?.get(pick.at);
}
function effectivePicks(): ElementSelection[] {
  const explicit = selectedPicks();
  if (explicit.length) return explicit;
  const implicit = appearanceTarget();
  return implicit ? [implicit] : [];
}
function copiedMarks(picks: ElementSelection[], lanes: string[]): CopiedMark[] {
  const displays = displayedObjects();
  return picks.flatMap<CopiedMark>(pick => {
    if (pick.kind === 'tempo-line') {
      const line = tempoLine(pick.id);
      if (!line) return [];
      const lane = lanes.indexOf(line.lane ?? cursor.lane);
      return [{ pick, lane: Math.max(0, lane), at: line.from, end: line.to, tempo: structuredClone(line) }];
    }
    if (pick.kind === 'chord-symbol') {
      const symbol = score.chordSymbols?.find(symbol => symbol.id === pick.id);
      return symbol ? [{ pick, lane: lanes.indexOf(symbol.lane), at: symbol.at,
        chord: { text: symbol.text, actual: symbol.actual }, appearance: appearanceOf(score, pick) }] : [];
    }
    const item = displays.find(row => appearanceKey(row.pick) === appearanceKey(pick));
    if (!item) return [];
    const appearance = appearanceOf(score, pick);
    if (pick.kind === 'mark' && item.lane && item.at !== undefined) {
      return [{ pick, lane: lanes.indexOf(item.lane), at: item.at, note: score.notes.find(note => note.id === pick.id), appearance }];
    }
    if (pick.kind === 'span' || pick.kind === 'generated-tie') {
      const link = prepared.links.find(link => pick.kind === 'span' ? link.source === pick.index :
        link.source === undefined && link.from.note.id === pick.id && link.from.at === pick.at && link.pitch === pick.pitch);
      if (!link) return [];
      const { kind, pitch, targetPitch } = link;
      const source = link.source === undefined ? undefined : score.spans[link.source];
      return [{ pick, lane: lanes.indexOf(link.from.note.lane), at: link.fromAt ?? link.from.at, end: link.toAt ?? link.to.at,
        span: { kind, pitch, targetPitch, from: link.from.note.id, to: link.to.note.id,
          dynamicText: source?.dynamicText, dynamicTarget: source?.dynamicTarget, strokes: source?.strokes, lyricFlow: source?.lyricFlow }, appearance }];
    }
    return [];
  });
}
function removePickedMark(pick: ElementSelection, edited = new Set<Pitch>()) {
  if (pick.kind !== 'mark') return;
  const note = score.notes.find(item => item.id === pick.id);
  if (!note) return;
  if (pick.field === 'ornament') {
    if (pick.ornament) delete note.ornaments?.[pick.ornament];
    return;
  }
  if (pick.extension !== undefined && isExtensionText(pick.field)) {
    writeNoteText(note, pick.field, '', pick.extension);
    return;
  }
  if (pick.field === 'lyric' || pick.field === 'lyric-extension') {
    const verse = verseFor(note, pick.verse ?? 1);
    if (pick.field === 'lyric') { delete verse.text; delete verse.syllabicNext; }
    else {
      const events = score.notes.filter(event => event.lane === note.lane && event.at >= note.at).sort((a, b) => a.at - b.at);
      for (const event of events) {
        const row = event.verses?.find(verse => verse.number === (pick.verse ?? 1));
        if (!row?.extend) continue;
        if (event !== note && row.extend === 'start') break;
        const stop = row.extend === 'stop';
        delete row.extend;
        if (stop) break;
      }
    }
    note.verses = note.verses?.filter(item => item.text || item.extend);
  } else if (pick.field === 'accidental') {
    const pitch = note.pitches[pick.pitch ?? 0];
    if (pitch?.courtesy && !pitch.signStyle) delete pitch.courtesy;
    else editTiedPitch(score, note, pick.pitch ?? 0, pitch => accidentalEdit(0, pitch, inheritedAlter({ lane: note.lane, at: note.at }, pitch.degree)), edited);
  } else delete note[pick.field];
}
function removeElements(picks: ElementSelection[]) {
  const spans = new Set<number>();
  const endings = new Set<number>();
  const edited = new Set<Pitch>();
  for (const pick of picks) {
    if (pick.kind === 'break') setBoundaryBreak(score, pick.index);
    else if (pick.kind === 'route') {
      const bar = score.measures[pick.index];
      bar.route = bar.route?.filter(mark => mark.id !== pick.id);
      if (!bar.route?.length) delete bar.route;
      if (score.appearance) delete score.appearance[appearanceKey(pick)];
    } else if (pick.kind === 'chord-symbol') {
      score.chordSymbols = score.chordSymbols?.filter(symbol => symbol.id !== pick.id);
      if (score.appearance) delete score.appearance[appearanceKey(pick)];
    }
    else if (pick.kind === 'grace') removeGrace(pick);
    else if (pick.kind === 'grace-line') removeGraceLine(pick);
    else if (pick.kind === 'tuplet') {
      const group = score.tuplets?.find(group => group.id === pick.id);
      if (group) {
        const contained = score.notes.filter(note => note.lane === group.lane && note.at >= group.at && tickEnd(note) <= tickEnd(group));
        if (contained.some(note => note.pitches.length || note.unpitched) || score.tuplets?.some(child => child.parent === group.id))
          throw Error('该多连音仍有发声音符或内层组。可在属性里隐藏弧线；清空组内音符后才能删除整组。');
        score.tuplets = score.tuplets?.filter(item => item !== group);
        eraseInterval(score, group.lane, group.at, tickEnd(group));
      }
    }
    else if (pick.kind === 'tempo-mark') score.tempoMarks = score.tempoMarks?.filter(mark => mark.id !== pick.id);
    else if (pick.kind === 'tempo-line') score.tempoLines = score.tempoLines?.filter(line => line.id !== pick.id);
    else if (pick.kind === 'barline') setBoundaryStyle(score, pick.index, 'normal');
    else if (pick.kind === 'bar-fermata') {
      delete score.boundaries?.[pick.index]?.fermata;
      delete score.boundaries?.[pick.index]?.fermataAppearance;
    } else if (pick.kind === 'span') spans.add(pick.index);
    else if (pick.kind === 'ending') endings.add(pick.index);
    else if (pick.kind === 'staff-bracket') writeStaffBracket(pick, null);
    else if (pick.kind === 'measure-number') score.measures[pick.index].numberDisplay = 'hide';
    else if (pick.kind === 'signature' && canDeleteSignature(pick)) removeSignature(pick.index, pick.field);
    else if (pick.kind === 'lane-name' || pick.kind === 'divisi-brace') updateAppearance(pick, { ...appearanceOf(score, pick), visible: false });
    else if (pick.kind === 'header' && pick.field !== 'title' && pick.field !== 'tempo') score[pick.field] = '';
    else if (pick.kind === 'mark') removePickedMark(pick, edited);
  }
  score.spans = score.spans.filter((_, index) => !spans.has(index));
  if (endings.size) score.endings = score.endings?.filter((_, index) => !endings.has(index));
  const digits = picks.filter((pick): pick is Extract<ElementSelection, { kind: 'pitch' }> => pick.kind === 'pitch');
  for (const pick of digits.sort((a, b) => b.at - a.at || b.index - a.index)) {
    const token = pickToken(pick);
    if (token) clearFragment(token, pick.index);
  }
  clearExtensions(picks.filter((pick): pick is ExtensionPick => pick.kind === 'extension'));
  pruneTies(score);
}
function copySelection(cut: boolean, withStructure = false) {
  if (unfocused) return;
  const picks = effectivePicks();
  if (!withStructure && picks.length && picks.every(pick => pick.kind === 'mark' && pick.field === 'lyric')) {
    copyLyricSelection(picks, cut);
    return;
  }
  const lanes = score.lanes.map(lane => lane.id);
  const notes: CopiedNote[] = [];
  const ranges = new Map<string, { start: number; end: number }>();
  const singleGroup = picks.length === 1 && picks[0].kind === 'tuplet' ? score.tuplets?.find(group => group.id === (picks[0] as { id: string }).id) : undefined;
  const whole = !!singleGroup || !!range && (selectedItems?.every(item => item.kind === 'pitch') ?? true);
  if (whole) {
    if (singleGroup) ranges.set(singleGroup.lane, { start: singleGroup.at, end: tickEnd(singleGroup) });
    else {
      const tip = rangeTip ?? cursor;
      const [a, b] = [lanes.indexOf(range!.lane), lanes.indexOf(tip.lane)].sort((a, b) => a - b);
      const start = Math.min(range!.at, tip.at);
      const last = Math.max(range!.at, tip.at);
      const end = Math.max(last + 1e-8, ...prepared.tokens.filter(token => token.at === last &&
        lanes.indexOf(token.note.lane) >= a && lanes.indexOf(token.note.lane) <= b).map(tickEnd));
      for (const lane of lanes.slice(a, b + 1)) ranges.set(lane, { start, end });
    }
    for (const note of score.notes) {
      const interval = ranges.get(note.lane);
      if (!interval || note.at >= interval.end || note.at + note.length <= interval.start) continue;
      const copy = structuredClone(note);
      copy.at = Math.max(interval.start, note.at);
      copy.length = Math.min(interval.end, note.at + note.length) - copy.at;
      if (copy.length !== note.length) { delete copy.value; delete copy.dots; }
      if (copy.at !== note.at) {
        for (const key of ['lyric', 'verses', 'dynamic', 'text', 'interNoteText', 'rehearsal', 'staccato', 'accent', 'tenuto', 'fermata', 'breath'] as const) delete copy[key];
      }
      if (copy.grace) {
        if (copy.at !== note.at) delete copy.grace.before;
        if (tickEnd(copy) !== tickEnd(note)) delete copy.grace.after;
      }
      if (note.extensionText) sliceExtensionText(note, copy);
      notes.push({ note: copy, tonalCenter: tonicAt(score, note.at), lane: lanes.indexOf(note.lane) });
    }
  } else {
    const byPosition = new Map<string, { token: Token; pitches: Set<number> }>();
    for (const pick of picks) if (pick.kind === 'pitch') {
      const token = pickToken(pick);
      if (!token) continue;
      const item = byPosition.get(token.id) ?? { token, pitches: new Set() };
      item.pitches.add(pick.index);
      byPosition.set(token.id, item);
    }
    for (const { token, pitches } of byPosition.values()) {
      const copy = structuredClone(token.note);
      copy.id = token.id;
      copy.at = token.at;
      copy.length = token.length;
      copy.pitches = copy.pitches.filter((_, index) => pitches.has(index));
      if (copy.length !== token.note.length) { delete copy.value; delete copy.dots; }
      if (token.continuation) { delete copy.lyric; delete copy.verses; delete copy.dynamic; delete copy.text; delete copy.interNoteText; delete copy.rehearsal; }
      if (copy.grace) {
        if (token.continuation) delete copy.grace.before;
        if (tickEnd(token) !== tickEnd(token.note)) delete copy.grace.after;
      }
      if (token.note.extensionText) sliceExtensionText(token.note, copy);
      notes.push({ note: copy, tonalCenter: tonicAt(score, token.note.at), lane: lanes.indexOf(token.note.lane) });
    }
  }
  const marks = copiedMarks(whole ? (score.chordSymbols ?? []).flatMap(symbol => {
    const interval = ranges.get(symbol.lane);
    return interval && symbol.at >= interval.start && symbol.at < interval.end ? [{ kind: 'chord-symbol', id: symbol.id } as const] : [];
  }) : picks, lanes);
  if (!notes.length && !marks.length && !ranges.size) return;
  const firstLane = Math.min(...notes.map(entry => entry.lane), ...marks.map(entry => entry.lane), ...[...ranges.keys()].map(lane => lanes.indexOf(lane)));
  const positions = [...notes.map(entry => entry.note.at), ...marks.map(mark => mark.at), ...[...ranges.values()].map(item => item.start)];
  const start = Math.min(...positions);
  const width = Math.max(...notes.map(entry => entry.note.at + entry.note.length), ...marks.map(mark => mark.end ?? mark.at + 1), ...[...ranges.values()].map(item => item.end)) - start;
  const ids = new Map(notes.map(({ note }) => [note.id, note]));
  const tuplets = (score.tuplets ?? []).filter(group => {
    const interval = ranges.get(group.lane);
    if (interval) return interval.start <= group.at && interval.end >= tickEnd(group);
    let end = group.at;
    for (const { note } of notes.filter(entry => entry.note.lane === group.lane).sort((a, b) => a.note.at - b.note.at))
      if (note.at <= end && tickEnd(note) > end) end = tickEnd(note);
    return end >= tickEnd(group);
  });
  if ((score.tuplets ?? []).some(group => !tuplets.includes(group) &&
    notes.some(({ note }) => note.lane === group.lane && note.at < tickEnd(group) && tickEnd(note) > group.at))) {
    message = '请选中完整多连音组后再复制或剪切。'; controls(); return;
  }
  for (const entry of notes) {
    const copy = entry.note;
    entry.rhythm = prepared.tokens.filter(token => token.note.lane === copy.lane && token.at >= copy.at && token.at < tickEnd(copy))
      .flatMap(token => [token.at, ...token.tail].filter(at => at < tickEnd(copy)).flatMap(at => {
        const pick = rhythmPick(token, at);
        const look = appearanceOf(score, pick);
        return look ? [{ pick, appearance: look }] : [];
      }));
  }
  const spans = structuredClone(score.spans.filter(span => ids.has(span.from) && ids.has(span.to)));
  const voiceCount = whole ? ranges.size : Math.max(...notes.map(entry => entry.lane), ...marks.map(entry => entry.lane)) - firstLane + 1;
  let structure: CopiedStructure | undefined;
  if (withStructure) {
    const first = prepared.measures.find(measure => measure.start === start)?.index;
    const last = prepared.measures.find(measure => measure.end === start + width)?.index;
    if (first === undefined || last === undefined || !primaryLanes().every(lane => ranges.has(lane.id))) {
      message = '请选中跨越全部常设声部的完整小节。';
      controls();
      return;
    }
    const measures = structuredClone(score.measures.slice(first, last + 1));
    measures[0].meter = prepared.measures[first].meter;
    measures[0].key = prepared.measures[first].key;
    structure = structuredClone({ measures, boundaries: Array.from({ length: measures.length + 1 }, (_, i) => boundaryAt(score, first + i)),
      endings: (score.endings ?? []).map(ending => ({ ending, ...endingRange(ending, prepared.measures) }))
        .filter(ending => ending.from >= start && ending.to <= start + width) });
  }
  scoreClipboard = { start, width, notes: notes.map(entry => ({ ...entry, lane: entry.lane - firstLane })),
    marks: structuredClone(marks.map(entry => ({ ...entry, lane: entry.lane - firstLane }))), spans, whole, voiceCount, structure,
    tuplets: structuredClone(tuplets.map(group => ({ ...group, lane: String(lanes.indexOf(group.lane) - firstLane) }))) };
  lyricClipboard = undefined;
  lyricClipboardAsText = '';
  if (!cut) { message = '已复制到谱面剪贴板。'; controls(); return; }
  commit(() => {
    if (score.tuplets && tuplets.length) score.tuplets = score.tuplets.filter(group => !tuplets.includes(group));
    if (whole) {
      for (const [lane, interval] of ranges) eraseInterval(score, lane, interval.start, interval.end);
      removeElements(marks.map(mark => mark.pick));
    }
    else {
      removeElements(picks.filter(pick => ['pitch', 'mark', 'span', 'extension', 'chord-symbol', 'tempo-line'].includes(pick.kind)));
    }
    pruneTies(score);
    selection = range = selectedItems = lyricAnchor = lyricFocus = null;
  }, '已剪切到谱面剪贴板。');
}
function pasteSelection() {
  if (lyricClipboard) { pasteLyricSelection(); return; }
  const clip = scoreClipboard;
  if (!clip || unfocused) return;
  commit(() => {
    const first = score.lanes.findIndex(lane => lane.id === cursor.lane);
    const target = score.lanes.slice(first, first + clip.voiceCount);
    if (first < 0 || target.length < clip.voiceCount) throw Error('目标下方没有足够的声部可粘贴。');
    const shift = (selection?.kind === 'extension' ? selection.at : cursor.at) - clip.start;
    if (clip.structure) pasteStructure(clip.structure, target, shift);
    if (clip.whole) for (const lane of target) {
      if (cursor.at < (lane.start ?? 0) || lane.end !== undefined && cursor.at + clip.width > lane.end)
        throw Error('选段超出目标临时副线的范围。');
      eraseInterval(score, lane.id, cursor.at, cursor.at + clip.width);
    }
    const ids = new Map<string, string>();
    const newGroups = new Map(clip.tuplets.map(group => [group.id, uid()]));
    const copiedGroups = clip.tuplets.map(group => ({ ...group, id: newGroups.get(group.id)!, parent: newGroups.get(group.parent ?? ''),
      lane: target[Number(group.lane)].id, at: tick(group.at + shift) }));
    const replacedGroups = new Set<Tuplet>();
    const bars = measureTable(score);
    for (const existing of score.tuplets ?? []) {
      if (!target.some(lane => lane.id === existing.lane)) continue;
      const touched = clip.whole ? cursor.at < tickEnd(existing) && cursor.at + clip.width > existing.at :
        clip.notes.some(entry => target[entry.lane].id === existing.lane && entry.note.at + shift < tickEnd(existing) &&
          tickEnd(entry.note) + shift > existing.at);
      if (touched && !copiedGroups.some(group => group.lane === existing.lane && cursor.at <= existing.at &&
        cursor.at + clip.width >= tickEnd(existing))) throw Error('粘贴不能覆盖已有多连音组的一部分或改变它的比例。');
    }
    for (const group of copiedGroups) {
      if (!bars.some(bar => bar.start <= group.at && tickEnd(group) <= bar.end)) throw Error('粘贴会使多连音组跨越小节线。');
      for (const existing of score.tuplets ?? []) if (existing.lane === group.lane && existing.at < tickEnd(group) && tickEnd(existing) > group.at) {
        if (existing.at < cursor.at || tickEnd(existing) > cursor.at + clip.width) throw Error('粘贴会覆盖既有多连音组的一部分。');
        replacedGroups.add(existing);
      }
    }
    if (copiedGroups.length) score.tuplets = [...(score.tuplets ?? []).filter(group => !replacedGroups.has(group)), ...copiedGroups];
    for (const { note: source, tonalCenter, lane, rhythm } of clip.notes) {
      const note = structuredClone(source);
      ids.set(note.id, note.id = uid());
      note.lane = target[lane].id;
      note.at = tick(note.at + shift);
      const destination = tonicAt(score, note.at);
      if (destination !== tonalCenter) respellNote(note, tonalCenter, destination);
      if (note.beams) note.beams = Object.fromEntries(Object.entries(note.beams).map(([at, mode]) => [Number(at) + shift, mode]));
      if (note.xmlBeams) note.xmlBeams = Object.fromEntries(Object.entries(note.xmlBeams).map(([at, mode]) => [Number(at) + shift, mode]));
      insertCopiedNote(score, note);
      for (const { pick, appearance } of rhythm ?? []) updateAppearance({ ...pick, id: note.id, at: tick(pick.at + shift) }, appearance);
    }
    for (const source of clip.spans) score.spans.push({ ...source, from: ids.get(source.from)!, to: ids.get(source.to)!,
      fromAt: source.fromAt === undefined ? undefined : source.fromAt + shift, toAt: source.toAt === undefined ? undefined : source.toAt + shift });
    for (const entry of clip.marks) {
      const lane = target[entry.lane].id;
      const at = entry.at + shift;
      if (entry.tempo) {
        const destination = target[entry.lane];
        const line = { ...entry.tempo, id: uid(), lane, from: at, to: tick(entry.end! + shift) };
        if (at < (destination.start ?? 0) || line.to > (destination.end ?? bars.at(-1)!.end))
          throw Error('速度线超出目标声部。');
        placeTempoLine(score, line);
        continue;
      }
      if (entry.chord) {
        const destination = target[entry.lane];
        if (at < (destination.start ?? 0) || at >= (destination.end ?? bars.at(-1)!.end)) throw Error('和弦代号超出目标声部。');
        const symbols = score.chordSymbols ??= [];
        const existing = symbols.find(symbol => symbol.lane === lane && symbol.at === at);
        if (!existing && symbols.length >= 5000) throw Error('已达到 5000 个和弦代号。');
        const id = existing?.id ?? uid();
        if (existing) Object.assign(existing, entry.chord);
        else symbols.push({ id, lane, at, ...entry.chord });
        if (entry.appearance) updateAppearance({ kind: 'chord-symbol', id }, entry.appearance);
        continue;
      }
      const token = tokenAt({ lane, at });
      const note = noteAt(score, { lane, at }) ?? (token ? fragment(token) : undefined);
      const pick = entry.pick;
      if (pick.kind === 'mark' && pick.extension !== undefined && entry.note && isExtensionText(pick.field)) {
        const source = noteTextValue(entry.note, pick.field, pick.extension);
        if (!note || !prepared.tokens.some(item => item.note.id === note.id && item.tail.includes(at)))
          throw Error('此文字要粘贴到已有的增时线。');
        const extension = at - note.at;
        if (source) writeNoteText(note, pick.field, source, extension);
        if (entry.appearance) updateAppearance({ ...pick, id: note.id, extension }, entry.appearance);
        continue;
      }
      if (entry.span && (entry.span.kind === 'crescendo' || entry.span.kind === 'diminuendo')) {
        const endAt = tick(entry.end! + shift);
        const destination = target[entry.lane];
        if (at < (destination.start ?? 0) || endAt > (destination.end ?? bars.at(-1)!.end) || endAt <= at)
          throw Error('线条超出目标声部。');
        const startToken = prepared.byLane.get(lane)?.find(item => item.at <= at && at < tickEnd(item));
        if (!startToken) throw Error('目标声部没有可用的线条锚点。');
        const endToken = prepared.byLane.get(lane)?.find(item => item.at <= endAt && endAt < tickEnd(item)) ?? startToken;
        const from = score.notes.find(item => item.id === startToken.note.id) ?? fragment(startToken);
        const to = score.notes.find(item => item.id === endToken.note.id) ??
          (endToken === startToken ? from : fragment(endToken));
        score.spans.push({ ...entry.span, appearance: entry.appearance, from: from.id, to: to.id, fromAt: at, toAt: endAt });
        continue;
      }
      if (!note || note.at !== at) throw Error('记号要粘贴到已有的音符或休止数字。');
      if (entry.span) {
        const to = noteAt(score, { lane, at: entry.end! + shift });
        if (!to || to.at !== entry.end! + shift || to.at <= note.at) throw Error('线条目标位置缺少对应端点。');
        score.spans.push({ ...entry.span, appearance: entry.appearance, from: note.id, to: to.id });
      } else if (pick.kind === 'mark' && entry.note) {
        if (pick.field === 'lyric' || pick.field === 'lyric-extension') {
          const source = noteVerses(entry.note).find(verse => verse.number === (pick.verse ?? 1));
          const verse = verseFor(note, lyricFocus && clip.voiceCount === 1 ? lyricFocus.verse : pick.verse ?? 1);
          if (source) {
            if (pick.field === 'lyric') { verse.text = source.text; verse.syllabicNext = source.syllabicNext; }
            else verse.extend = source.extend;
          }
        } else if (pick.field === 'accidental') {
          const degree = entry.note.pitches[pick.pitch ?? 0];
          const target = note.pitches[pick.pitch ?? 0];
          if (degree && target) Object.assign(target, { alter: degree.alter, natural: degree.natural, courtesy: degree.courtesy });
        } else if (pick.field === 'ornament' && pick.ornament) {
          const ornament = entry.note.ornaments?.[pick.ornament];
          if (ornament) (note.ornaments ??= {})[pick.ornament] = structuredClone(ornament);
        } else if (pick.field !== 'ornament') Object.assign(note, { [pick.field]: entry.note[pick.field] });
        if (entry.appearance) updateAppearance({ ...pick, id: note.id }, entry.appearance);
      }
    }
    score.notes.sort((a, b) => a.at - b.at);
    pruneTies(score);
    selection = range = selectedItems = lyricAnchor = lyricFocus = null;
  }, '已粘贴。');
}
function copyLyricSelection(picks: ElementSelection[], cut: boolean) {
  const rows = new Map<string, { lane: string; verse: number; times: Set<number> }>();
  for (const pick of picks) {
    if (pick.kind !== 'mark' || pick.field !== 'lyric') continue;
    const token = markedToken(pick.id);
    if (!token) continue;
    const lane = token.note.lane, verse = pick.verse ?? 1;
    const key = JSON.stringify([lane, verse]);
    const row = rows.get(key) ?? { lane, verse, times: new Set<number>() };
    row.times.add(token.at);
    rows.set(key, row);
  }
  const ids = score.lanes.map(lane => lane.id);
  const firstLane = Math.min(...[...rows.values()].map(row => ids.indexOf(row.lane)));
  const firstVerse = Math.min(...[...rows.values()].map(row => row.verse));
  const start = lyricAnchor && lyricFocus ? Math.min(lyricAnchor.at, lyricFocus.at) : undefined;
  const end = lyricAnchor && lyricFocus ? Math.max(lyricAnchor.at, lyricFocus.at) : undefined;
  lyricClipboard = [...rows.values()].flatMap(({ lane, verse, times }) => {
    const tokens = prepared.byLane.get(lane) ?? [];
    const stops = new Set(lyricStops(tokens, lyricGroups(score, prepared, lane),
      new Map(tokens.map(token => [token.at, lyricValue(token, verse)]))));
    const cells = tokens.filter(token => start === undefined || end === undefined ? times.has(token.at) :
      token.at >= start && token.at <= end && (stops.has(token.at) || times.has(token.at)))
      .map(token => times.has(token.at) ? lyricCell(token, verse) : { text: '' });
    return cells.length ? [{ lane: ids.indexOf(lane) - firstLane, verse: verse - firstVerse, sourceVerse: verse, cells: structuredClone(cells) }] : [];
  }).sort((a, b) => a.lane - b.lane || a.verse - b.verse);
  if (!lyricClipboard.length) return;
  lyricClipboardAsText = lyricClipboard.map(row => lyricPlainText(row.cells.map(cell => ({ text: cell.text, syllabicNext: cell.join })))).join('\n');
  void writePlainClipboard(lyricClipboardAsText);
  if (cut) commit(() => {
    for (const pick of picks) removePickedMark(pick);
    selection = range = selectedItems = lyricAnchor = lyricFocus = null;
  }, '已剪切歌词。');
  else { message = '已复制歌词，可直接粘贴到谱面或文本框。'; controls(); }
}
async function writePlainClipboard(text: string) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const previous = document.activeElement as HTMLElement | null;
    const area = document.createElement('textarea');
    area.style.cssText = 'position:fixed;left:-10000px;top:0';
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    previous?.focus({ preventScroll: true });
  }
}
function pasteLyricSelection(position?: LyricPosition) {
  if (!lyricClipboard?.length || unfocused) return;
  const lyricTarget = position ?? lyricFocus ?? (selection?.kind === 'mark' && selection.field === 'lyric' ?
    { ...cursor, verse: selection.verse ?? 1 } : undefined);
  const start = lyricTarget ?? cursor;
  const first = score.lanes.findIndex(lane => lane.id === start.lane);
  commit(() => {
    for (const row of lyricClipboard!) {
      const lane = score.lanes[first + row.lane];
      const number = lyricTarget ? lyricTarget.verse + row.verse : row.sourceVerse;
      if (!lane || number > 20) throw Error('目标没有足够的声部或歌词行。');
      const tokens = prepared.byLane.get(lane.id) ?? [];
      const stops = new Set(lyricStops(tokens, lyricGroups(score, prepared, lane.id),
        new Map(tokens.map(token => [token.at, lyricValue(token, number)])), lyricTarget ? start.at : undefined));
      const targets = tokens.filter(token => token.at >= start.at && stops.has(token.at)).slice(0, row.cells.length);
      if (targets.length < row.cells.length) throw Error(`此行还缺 ${row.cells.length - targets.length} 个可填词的音符。`);
      for (const [i, token] of targets.entries()) {
        const entry = row.cells[i];
        const note = fragment(token);
        setVerseText(note, number, entry.text);
        if (entry.text) verseFor(note, number).syllabicNext = entry.join || undefined;
        setTextAppearance({ kind: 'mark', id: note.id, field: 'lyric', verse: number }, entry.format);
      }
    }
    selection = range = selectedItems = lyricAnchor = lyricFocus = null;
  }, '已按歌词位置粘贴。');
}
const lyricPreviewDialog = get<HTMLDialogElement>('lyric-preview-dialog');
function lyricPreview() {
  const verse = field('lyric-map-verse').valueAsNumber;
  const text = get<HTMLTextAreaElement>('lyric-map-text').value.trim().replace(/\s+/gu, ' ');
  const start = Math.min(cursor.at, range?.at ?? cursor.at);
  const end = range ? Math.max(cursor.at, range.at) : Infinity;
  const tokens = prepared.byLane.get(cursor.lane) ?? [];
  const stops = new Set(lyricStops(tokens, lyricGroups(score, prepared, cursor.lane),
    new Map(tokens.map(token => [token.at, lyricValue(token, verse)])),
    selection?.kind === 'mark' && selection.field === 'lyric' ? cursor.at : undefined));
  const candidates = tokens.filter(token => token.at >= start && token.at <= end);
  const targets = candidates.filter(token => stops.has(token.at));
  const words = new Map<number, string>(), joins = new Set<number>();
  distributeLyrics(text, words, joins, { at: 0, offset: 0 }, false, at => at + 1);
  return { verse, words, joins, targets, skipped: candidates.length - targets.length };
}
function drawLyricPreview() {
  const { verse, words, joins, targets, skipped } = lyricPreview();
  const count = (words.size ? Math.max(...words.keys()) : -1) + 1;
  const extra = Math.max(0, count - targets.length);
  get('lyric-map-summary').textContent = `${targets.length} 个唱位，跳过 ${skipped} 个位置。已配 ${Math.min(count, targets.length)} 位${extra ? `，超出 ${extra} 位` : `，余 ${targets.length - count} 位`}。`;
  button('lyric-map-apply').disabled = !words.size || !!extra || !Number.isInteger(verse) || verse < 1 || verse > 20;
  get('lyric-map-cells').replaceChildren(...Array.from({ length: Math.min(Math.max(count, targets.length), 600) }, (_, index) => {
    const token = targets[index];
    const cell = document.createElement('div');
    cell.className = 'lyric-map-cell' + (token ? '' : ' extra');
    const label = document.createElement('small');
    label.textContent = token ? `小节 ${prepared.measures[token.measure].number}` : '无对应音符';
    const word = document.createElement('span');
    word.textContent = words.has(index) ? words.get(index)! + (joins.has(index) ? '‐' : '') : token ? lyricValue(token, verse) || '空' : '空';
    cell.append(label, word);
    return cell;
  }));
}
function openLyricPreview() {
  get('lyric-map-location').textContent = score.lanes.find(lane => lane.id === cursor.lane)?.name ?? '';
  field('lyric-map-verse').value = String(verseNumber);
  get<HTMLTextAreaElement>('lyric-map-text').value = '';
  drawLyricPreview();
  lyricPreviewDialog.showModal();
}
field('lyric-map-verse').oninput = get<HTMLTextAreaElement>('lyric-map-text').oninput = drawLyricPreview;
button('lyric-map-close').onclick = () => lyricPreviewDialog.close();
lyricPreviewDialog.querySelector('form')!.onsubmit = event => {
  event.preventDefault();
  if (button('lyric-map-apply').disabled) return;
  const { verse, words, joins, targets } = lyricPreview();
  lyricPreviewDialog.close();
  commit(() => {
    for (const [index, text] of words) {
      const token = targets[index];
      const note = fragment(token);
      const previous = lyricValue(token, verse);
      setVerseText(note, verse, text);
      verseFor(note, verse).syllabicNext = joins.has(index) || undefined;
      const pick = { kind: 'mark', id: note.id, field: 'lyric', verse } as const;
      const format = faceAfterEdit(appearanceOf(score, pick)?.text, previous, text);
      if (format) setTextAppearance(pick, format);
    }
  }, '已填写预览中的歌词。');
};
function pasteStructure(structure: CopiedStructure, target: Lane[], shift: number) {
  const measures = measureTable(score);
  const from = measures.findIndex(measure => measure.start === cursor.at);
  const end = from + structure.measures.length;
  if (from < 0 || !primaryLanes().every(lane => target.includes(lane)) ||
    structure.measures.some((measure, index) => measures[from + index]?.length !== measure.length))
    throw Error('粘贴含调拍反复的小节需要从首声部的小节起点开始，并与目标各小节的实际时长一致。');
  if (measures[end]) {
    if (!score.measures[end].meter) score.measures[end].meter = measures[end].meter;
    if (!score.measures[end].key && score.measures[end].tonic === undefined) score.measures[end].key = measures[end].key;
  }
  for (const [index, source] of structure.measures.entries()) {
    const { length, meter, actualMeter, pickup, key, tonic } = structuredClone(source);
    Object.assign(score.measures[from + index], { length, meter, actualMeter, pickup, key, tonic });
  }
  for (const [index, boundary] of structure.boundaries.entries()) if (boundary.style) {
    const target = from + index;
    const style = target === 0 && endsRepeat(boundary.style) ? startsRepeat(boundary.style) ? 'repeat-start' : 'normal' :
      target === score.measures.length && startsRepeat(boundary.style) ? endsRepeat(boundary.style) ? 'repeat-end' : 'final' : boundary.style;
    (score.boundaries ??= {})[target] = { ...boundary, style, repeats: endsRepeat(style) ? boundary.repeats : undefined,
      break: target > 0 && target < score.measures.length ? boundary.break : undefined };
    if (score.measures[target]) delete score.measures[target].system;
  }
  if (structure.endings.length) {
    const last = measures[end - 1].end;
    score.endings = (score.endings ?? []).filter(ending => {
      const existing = endingRange(ending, measures);
      return existing.from < cursor.at || existing.to > last;
    });
    for (const { ending, from, to } of structure.endings) {
      const copy = structuredClone(ending);
      setEndingRange(score, copy, from + shift, to + shift);
      score.endings.push(copy);
    }
  }
}
function copyLyricText() {
  const picks = effectivePicks();
  const values = new Map<string, { lane: string; verse: number; entries: Map<number, Verse> }>();
  const add = (note: Note, verse: Verse) => {
    if (!verse.text) return;
    const key = note.lane + ':' + verse.number;
    const line = values.get(key) ?? { lane: note.lane, verse: verse.number, entries: new Map() };
    line.entries.set(note.at, verse);
    values.set(key, line);
  };
  for (const pick of picks) {
    if (pick.kind === 'mark' && pick.field === 'lyric') {
      const note = score.notes.find(note => note.id === pick.id);
      if (note) for (const verse of noteVerses(note)) if (verse.number === (pick.verse ?? 1)) add(note, verse);
    }
    if (pick.kind === 'pitch') {
      const token = pickToken(pick);
      if (token && !token.continuation) for (const verse of noteVerses(token.note)) add(token.note, verse);
    }
  }
  const lanes = score.lanes.map(lane => lane.id);
  const lines = [...values.values()].sort((a, b) => lanes.indexOf(a.lane) - lanes.indexOf(b.lane) || a.verse - b.verse);
  get<HTMLTextAreaElement>('lyric-text-preview').value = lines.map(line => lyricPlainText([...line.entries].sort(([a], [b]) => a - b).map(([, verse]) => verse))).join('\n');
  get<HTMLDialogElement>('lyric-text-dialog').showModal();
}
button('lyric-text-copy').onclick = async () => {
  const preview = get<HTMLTextAreaElement>('lyric-text-preview');
  try { await navigator.clipboard.writeText(preview.value); }
  catch { preview.focus(); preview.select(); document.execCommand('copy'); }
};
function moveCursor(direction: number, extend: boolean) {
  const tokens = visibleTokens(cursor.lane);
  const index = tokens.findIndex(token => token.at === cursor.at);
  const token = tokens[index + direction];
  if (token) select({ ...cursor, at: token.at }, extend && !input);
}
function moveVoice(direction: number) {
  const index = prepared.measures.find(bar => cursor.at < bar.end)?.index;
  const shown = systemAtIndex(index)?.visible;
  const voices = score.lanes.filter(lane => (!shown || shown.includes(lane.id)) &&
    (!lane.parent || lane.start! <= cursor.at && cursor.at < lane.end!));
  const next = voices[voices.findIndex(lane => lane.id === cursor.lane) + direction];
  if (next) select({ ...cursor, lane: next.id });
}
function moveGrace(direction: number) {
  if (!graceEdit) return;
  const length = graceHost()?.grace?.[graceEdit.side]?.notes.length ?? 0;
  graceEdit.gap = Math.max(0, Math.min(length, graceEdit.gap + direction));
  controls();
}
function selectAllElements() {
  selectedItems = uniquePicks(displayedObjects().map(item => item.pick));
  selection = selectedItems.at(-1) ?? null;
  range = lyricAnchor = lyricFocus = signSelection = null;
  unfocused = false;
  controls();
}
type AccidentalKey = { id: string; family: string; direction: number };
let heldAccidental: AccidentalKey | undefined;
const accidentalKeysDown = new Set<string>();
function accidentalKey(event: KeyboardEvent, candidates: string[]): AccidentalKey | undefined {
  for (const key of candidates) {
    const slot = accidentalSlots.find(item => shortcuts.keys(item.id).includes(key));
    if (slot) return { id: event.code || key, family: slot.family, direction: slot.direction };
  }
}
function flushAccidental() {
  const held = heldAccidental;
  heldAccidental = undefined;
  if (held) changeAccidental(current => nextSign(current, held.direction));
}
function holdAccidental(key: AccidentalKey) {
  if (accidentalKeysDown.has(key.id)) return;
  accidentalKeysDown.add(key.id);
  if (heldAccidental?.family === key.family && heldAccidental.direction !== key.direction) {
    heldAccidental = undefined;
    changeAccidental(current => nextSign(current, 0));
  } else {
    flushAccidental();
    heldAccidental = key;
  }
}
let shortcutRepeating = false;
document.addEventListener('keydown', event => {
  if (event.defaultPrevented || !(event.target instanceof Element)) return;
  if (event.target.closest('input, select, textarea, dialog, #context-menu')) {
    const dialog = event.target.closest('dialog');
    const settingsScope = dialog?.id === 'format-dialog' ? 'style' : dialog?.id === 'shortcut-settings' ? 'bindings' : undefined;
    if (settingsScope && !event.isComposing && (event.ctrlKey || event.altKey || event.metaKey || /^F\d+$/.test(event.key))) {
      const entry = shortcuts.find(event, settingsScope);
      if (entry) {
        event.preventDefault();
        if (!event.repeat) entry.run();
        return;
      }
    }
    if (/^F\d+$/.test(event.key) && shortcuts.find(event, 'edit')?.id === 'fullscreen') {
      event.preventDefault();
      if (!event.repeat) commands.fullscreen.run();
    }
    return;
  }
  const key = event.key.toLowerCase();
  const candidates = shortcutKeys(event);
  // The Chinese IME can report the physical backquote key as "Process".
  const lowKeys = lowerOctaveSlots.flatMap(shortcuts.keys);
  const imeBackquote = event.code === 'Backquote' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
    lowKeys.includes('`');
  const octaveKey = imeBackquote || candidates.some(value => lowKeys.includes(value)) ? -1 :
    candidates.some(value => shortcuts.keys('temp-octave-高').includes(value)) ? 1 : 0;
  if (octaveKey && !unfocused) {
    if (input || graceEdit) {
      event.preventDefault();
      temporaryOctave = octaveKey;
      controls();
      return;
    }
    if (digitTargets().length) {
      event.preventDefault();
      if (!event.repeat) stepPitch(octaveKey, 'octave');
      return;
    }
  }
  if (event.isComposing || event.keyCode === 229) return;
  if (['enter', ' '].includes(key) && event.target.closest('button, summary')) return;
  if (!input && event.altKey) get('score').classList.add('positioning');
  if (staffDrag || visualDrag || drag) {
    if (key === 'escape') {
      event.preventDefault();
      if (staffDrag) cancelStaffDrag();
      else if (visualDrag) cancelVisualDrag();
      else cancelDrag();
    }
    return;
  }
  if (!unfocused) {
    const sign = accidentalKey(event, candidates);
    if (sign) { event.preventDefault(); if (!event.repeat) holdAccidental(sign); return; }
  }
  flushAccidental();
  const digitSlot = tupletPrefix ? tupletDigitSlots.findIndex(id => shortcuts.keys(id).some(value => candidates.includes(value))) : -1;
  const startsTuplet = !tupletPrefix && shortcuts.keys('tuplet-prefix').some(value => candidates.includes(value));
  if ((startsTuplet || digitSlot >= 0) && tupletTarget()) {
    event.preventDefault();
    if (event.repeat) return;
    if (digitSlot >= 0) { tupletPrefix = false; addTuplet(10 + digitSlot); }
    else { tupletPrefix = true; message = '两位多连音：保持 Ctrl 按住，再按个位的绑定键。'; render(); }
    return;
  }
  if (key === 'escape' && tupletPrefix) { tupletPrefix = false; event.preventDefault(); message = ''; render(); return; }
  const scope = graceEdit ? 'grace' : input ? 'input' : 'edit';
  const entry = shortcuts.find(event, scope);
  if (!entry) return;
  if ((entry.id === 'transport' || entry.id === 'stop-playback') &&
      (key === ' ' || key === 'tab') && event.target !== get('desk')) return;
  if (key === 'tab' && event.target !== get('desk')) return;
  event.preventDefault();
  shortcuts.observed(event);
  if (!event.repeat || repeatingShortcuts.has(entry.id)) {
    shortcutRepeating = event.repeat;
    try { entry.run(); }
    finally { shortcutRepeating = false; }
  }
});
document.addEventListener('keyup', event => {
  const sign = event.code || accidentalKey(event, shortcutKeys(event))?.id;
  if (sign && accidentalKeysDown.delete(sign)) {
    if (heldAccidental?.id === sign) flushAccidental();
  }
  if (tupletPrefix && !event.ctrlKey && !event.metaKey) { tupletPrefix = false; message = ''; render(); }
  if (!event.altKey) get('score').classList.remove('positioning');
  if (event.key.startsWith('Arrow') || !event.altKey) heldNudge = undefined;
});
window.addEventListener('blur', () => {
  heldAccidental = undefined;
  accidentalKeysDown.clear();
  get('score').classList.remove('positioning');
  heldNudge = undefined;
  cancelVisualDrag();
  cancelDrag();
});

function describePosition(at: number) {
  const measure = prepared.measures.find(item => at >= item.start && at < item.end);
  if (!measure) return at === prepared.measures.at(-1)?.end ? '谱末' : '—';
  const unit = QUARTER * 4 / measure.meter.denominator;
  return `第 ${measure.number} 小节 · 第 ${Number((1 + (at - measure.start) / unit).toFixed(2))} 拍`;
}

const lineNames: Record<Span['kind'], string> = { tie: '同音线', slur: '连音线', crescendo: '渐强线', diminuendo: '渐弱线', slide: '滑音', tremolo: '双音震音' };
const markNames: Record<string, string> = {
  lyric: '歌词', dynamic: '力度', text: '表情文字', interNoteText: '音符间文字', rehearsal: '排练标记', staccato: '顿音', accent: '重音',
  fermata: '延长记号', tenuto: '保持音', breath: '换气', accidental: '升降还原',
  title: '标题', subtitle: '副标题', credit: '署名', lyricist: '作词', composer: '作曲', arranger: '改编', copyright: '版权', tempo: '速度'
};

function selectedLink() {
  const pick = selection;
  if (pick?.kind === 'span') return prepared.links.find(link => link.source === pick.index);
  if (pick?.kind === 'generated-tie') return prepared.links.find(link => link.source === undefined &&
    link.from.note.id === pick.id && link.from.at === pick.at && link.pitch === pick.pitch);
}

function describeSelection(token?: Token) {
  if (selection?.kind === 'tempo-mark') { const mark = tempoMark(selection.id); return mark ? tempoLabel(mark) : '速度记号'; }
  if (selection?.kind === 'tempo-line') return tempoLine(selection.id)?.label || tempoLine(selection.id)?.kind || '渐变速度';
  if (selection?.kind === 'bar-fermata') return '小节线延长记号';
  if (selection?.kind === 'measure-number') return '小节号 ' + prepared.measures[selection.index]?.number;
  if (selection?.kind === 'staff-bracket') return { bracket: '粗括号', brace: '花括号', square: '细方括号' }[staffBracket(selection)?.type ?? 'bracket'];
  if (selection?.kind === 'extension') return '增时线';
  if (selection?.kind === 'grace') return selection.side === 'before' ? '前倚音' : '后倚音';
  if (selection?.kind === 'grace-line') return findGraceLine(selection)?.kind === 'tie' ? '倚音同音线' : '倚音连音线';
  if (selection?.kind === 'signature') return selection.field === 'key' ? '调号' : '拍号';
  if (selection?.kind === 'lane-name') return selection.field === 'shortName' ? '声部简称' : '声部名';
  if (selection?.kind === 'divisi-brace') return selection.side === 'start' ? '临时分部起始花括号' : '临时分部结束花括号';
  if (selection?.kind === 'barline') return barLabels[boundaryAt(score, selection.index).style];
  if (selection?.kind === 'break') return boundaryAt(score, selection.index).break === 'page' ? '换页记号' : '换行记号';
  if (selection?.kind === 'ending') return '房子 · ' + score.endings?.[selection.index]?.passes.join(', ');
  if (selection?.kind === 'mark' && selection.ornament) return ORNAMENT_LABELS[ORNAMENT_KINDS.indexOf(selection.ornament)];
  if (selection?.kind === 'header' || selection?.kind === 'mark') return markNames[selection.field];
  const link = selectedLink();
  if (link) return lineNames[link.kind];
  if (range && range.lane === cursor.lane && range.at !== cursor.at) return '选段';
  if (!token) return '';
  const base = displayedDuration(token);
  const name = names[VALUES.findIndex(value => value === base.value)] ??
    (base.value === 6 ? '六十四分' : base.value === 3 ? '一百二十八分' : '');
  return [name + (base.dots === 2 ? '双附点' : base.dots ? '附点' : ''),
    token.note.unpitched ? '节奏音符' : token.note.pitches.length ? '音符' : '休止'].join('');
}

function renderSpanPositions() {
  const link = selectedLink();
  const list = get('span-positions');
  list.replaceChildren();
  if (!link) return;
  const lane = score.lanes.find(lane => lane.id === link.from.note.lane);
  for (const [label, value] of [
    ['声部', lane?.name ?? '—'], ['起点', describePosition(link.fromAt ?? link.from.at)], ['终点', describePosition(link.toAt ?? link.to.at)]
  ]) {
    const title = document.createElement('dt');
    const description = document.createElement('dd');
    title.textContent = label;
    description.textContent = value;
    list.append(title, description);
  }
}

function editableSelection() {
  const pick = selection ?? selectedItems?.at(-1);
  return !!pick && isTextPick(pick);
}

function hasNoteTarget() { return !!noteTargets().length; }
const tempoMark = (id: string) => score.tempoMarks?.find(mark => mark.id === id);
const tempoLine = (id: string) => score.tempoLines?.find(line => line.id === id);
const tempoMarkTargets = () => {
  const selected = effectivePicks().flatMap(pick => pick.kind === 'tempo-mark' ? tempoMark(pick.id) ?? [] : []);
  if (selected.length || !inTitleProperties()) return selected;
  return [score.tempoMarks?.find(mark => !mark.at && !isSwing(mark)) ??
    { id: '', at: 0, kind: 'metronome', unit: QUARTER, dots: 0, bpm: score.tempo } as TempoMark];
};
const tempoLineTargets = () => effectivePicks().flatMap(pick => pick.kind === 'tempo-line' ? tempoLine(pick.id) ?? [] : []);
const displayBpm = (rate: number) => Math.round(rate * 100) / 100;
function tempoAnchors() {
  if (input || unfocused) return [];
  const end = prepared.measures.at(-1)!.end;
  return [...new Set(effectivePicks().flatMap(pick => {
    const at = pick.kind === 'pitch' || pick.kind === 'extension' ? pick.at :
      pick.kind === 'barline' || pick.kind === 'bar-fermata' || pick.kind === 'break' ? prepared.measures[pick.index]?.start :
        pick.kind === 'tempo-mark' ? tempoMark(pick.id)?.at : pick.kind === 'header' && pick.field === 'tempo' ? 0 : undefined;
    return at !== undefined && at < end ? [at] : [];
  }))].sort((a, b) => a - b);
}
function selectTempo(picks: ElementSelection[]) {
  selection = picks.at(-1) ?? null;
  selectedItems = picks.length > 1 ? picks : null;
  range = null;
  signSelection = null;
  pickedEndpoint = undefined;
}
function addTempoMark(key: string) {
  const anchors = tempoAnchors();
  if (!anchors.length) return;
  const defaults = new Map(anchors.map(at => [at, displayBpm(scoreTempoAt(score, at))]));
  commit(() => {
    const marks = score.tempoMarks ??= [];
    const picks = anchors.map(at => {
      const swing = key === 'swing' || key === 'straight';
      const old = marks.findIndex(mark => mark.at === at && isSwing(mark) === swing);
      const base = { id: marks[old]?.id ?? uid(), at, appearance: marks[old]?.appearance };
      const [unit, dots] = key.startsWith('metro:') ? key.split(':').slice(1).map(Number) : [QUARTER, 0];
      const [left, leftDots, rightUnit, rightDots] = key.startsWith('mod:') ? RHYTHM_TEMPO[Number(key.slice(4))] : [];
      const mark: TempoMark = key === 'metronome' || key.startsWith('metro:') ?
        { ...base, kind: 'metronome', unit, dots, bpm: displayBpm(defaults.get(at)! * QUARTER / dotted(unit, dots)) } :
        left ? { ...base, kind: 'modulation', unit: left, dots: leftDots, rightUnit, rightDots } :
        key === 'swing' || key === 'straight' ? { ...base, kind: key, swingUnit: 48, ratio: key === 'swing' ? 2 : 1 } :
        key === 'restore' || key === 'primo' ? { ...base, kind: key } :
          { ...base, kind: 'word', label: key, bpm: TEMPO_PRESETS[key as keyof typeof TEMPO_PRESETS] };
      if (old < 0) marks.push(mark);
      else marks[old] = mark;
      return { kind: 'tempo-mark', id: mark.id } as const;
    });
    selectTempo(picks);
  });
  workbench.setPanel('properties');
  if (anchors.length === 1 && key === 'metronome') { field('tempo-written').focus(); field('tempo-written').select(); }
}
function addTempoLine(kind: TempoLineKind) {
  const rows = lineTargetRows(true);
  const anchors = tempoAnchors();
  commit(() => {
    const added: ElementSelection[] = [];
    for (const row of rows.length ? rows : [[]]) {
      const token = row[0];
      const from = token?.at ?? anchors[0];
      if (from === undefined) continue;
      const shortEnd = token && singleLineEnd(token, kind.length * 7 + 13);
      const to = row.length > 1 ? row.at(-1)!.at : !token && anchors.length > 1 ? anchors.at(-1)! :
        shortEnd?.at ?? shortEnd?.token?.at ?? prepared.measures.find(bar => from < bar.end)!.end;
      if (to <= from) continue;
      const line: TempoLine = { id: uid(), from, to, kind, lane: token?.note.lane };
      placeTempoLine(score, line);
      added.push({ kind: 'tempo-line', id: line.id });
    }
    if (!added.length) throw Error('没有可连接的终点。');
    selectTempo(added);
  });
  workbench.setPanel('properties');
}
for (const [index, unit] of TEMPO_UNITS.entries()) for (const id of ['tempo-unit', 'tempo-right-unit']) selectField(id).add(
  new Option(`${TEMPO_GLYPHS[unit]} · ${['全', '二分', '四分', '八分', '十六分', '三十二分'][index]}音符`, String(unit)));
function renderTempoProperties() {
  const picks = effectivePicks();
  const marks = tempoMarkTargets(), lines = tempoLineTargets();
  const showMarks = !!marks.length && (inTitleProperties() || marks.length === picks.length);
  const showLines = !!lines.length && lines.length === picks.length;
  get('tempo-mark-properties').hidden = !showMarks;
  get('tempo-line-properties').hidden = !showLines;
  if (showMarks) {
    const rates = marks.map(mark => displayBpm(scoreTempoAt(score, mark.at)));
    const location = commonValue(marks.map(mark => mark.at === 0 ? '标题区' : describePosition(mark.at)));
    get('tempo-current').textContent = (location ? location + ' · ' : '') +
      (commonValue(rates) !== undefined ? `实际速度 ♩ = ${rates[0]}` : '实际速度混合');
    const metro = marks.filter(mark => mark.kind === 'metronome');
    const modulation = marks.filter(mark => mark.kind === 'modulation');
    const swing = marks.filter(isSwing).filter(mark => mark.kind === 'swing');
    const units = [...metro, ...modulation];
    get('tempo-metronome-fields').hidden = units.length !== marks.length;
    get('tempo-written-field').hidden = metro.length !== marks.length;
    get('tempo-modulation-fields').hidden = modulation.length !== marks.length;
    get('tempo-swing-fields').hidden = swing.length !== marks.length;
    get('tempo-caption-field').hidden = !!modulation.length;
    get('tempo-override-field').hidden = marks.some(isSwing);
    displaySelect(selectField('tempo-unit'), units.map(mark => mark.unit));
    displaySelect(selectField('tempo-dots'), units.map(mark => mark.dots));
    displaySelect(selectField('tempo-right-unit'), modulation.map(mark => mark.rightUnit));
    displaySelect(selectField('tempo-right-dots'), modulation.map(mark => mark.rightDots));
    displaySelect(selectField('tempo-swing-unit'), swing.map(mark => mark.swingUnit));
    displayField(field('tempo-ratio'), swing.map(mark => mark.ratio));
    displayField(field('tempo-written'), metro.map(mark => mark.bpm));
    displayField(field('tempo-caption'), marks.map(mark => mark.kind === 'metronome' ? mark.label ?? '' : tempoLabel(mark)));
    displayField(field('tempo-override'), marks.map(mark => mark.override ?? ''), '空白为自动');
  }
  if (showLines) {
    get('tempo-line-range').textContent = lines.length === 1 ? `${describePosition(lines[0].from)} 至 ${describePosition(lines[0].to)}` : '';
    displayField(field('tempo-line-caption'), lines.map(line => line.label || line.kind));
    displaySelect(selectField('tempo-line-mode'), lines.map(line => line.target === undefined ? 'percent' : 'target'));
    displayField(field('tempo-line-value'), lines.map(line => line.target ?? line.percent ?? defaultTempoPercent(line)));
    field('tempo-line-value').disabled = selectField('tempo-line-mode').value === 'mixed';
    displayCheck(field('tempo-dash-visible'), lines.map(line => line.dashVisible !== false));
    displayCheck(field('tempo-dash-layout'), lines.map(line => line.dashLayout !== false));
    displayCheck(field('tempo-line-playback'), lines.map(line => line.playback !== false));
  }
}
function playbackTargets() {
  const picks = effectivePicks();
  return picks.length && picks.every(pick =>
    pick.kind === 'tempo-mark' || pick.kind === 'route' || pick.kind === 'ending' ||
    pick.kind === 'barline' && boundaryAt(score, pick.index).style.includes('repeat') || pick.kind === 'span' && ['crescendo', 'diminuendo', 'tie', 'slide', 'tremolo'].includes(score.spans[pick.index]?.kind) ||
    pick.kind === 'mark' && ['dynamic', 'ornament', 'staccato', 'accent'].includes(pick.field)) ? picks : [];
}
function renderPlaybackProperty() {
  const picks = playbackTargets();
  get('playback-property').hidden = !picks.length;
  if (picks.length) displayCheck(field('mark-playback'), picks.map(pick => appearanceOf(score, pick)?.playback !== false));
}
field('mark-playback').onchange = () => {
  const picks = playbackTargets();
  const enabled = field('mark-playback').checked;
  commit(() => picks.forEach(pick => updateAppearance(pick, { ...appearanceOf(score, pick), playback: enabled ? undefined : false })), '', false);
};
function isDynamic(pick: ElementSelection) {
  return pick.kind === 'mark' && pick.field === 'dynamic' ||
    pick.kind === 'span' && ['crescendo', 'diminuendo'].includes(score.spans[pick.index]?.kind);
}
selectField('dynamic-line-target').append(new Option('自动', ''), ...DYNAMIC_STEPS.map(value => new Option(value)));
function renderDynamicProperties() {
  const picks = effectivePicks();
  const show = picks.length > 0 && picks.every(isDynamic);
  get('dynamic-properties').hidden = !show;
  if (!show) return;
  displayCheck(field('align-dynamics'), picks.map(pick => appearanceOf(score, pick)?.alignDynamics !== false));
  const span = picks.length === 1 && picks[0].kind === 'span' ? score.spans[picks[0].index] : undefined;
  get('dynamic-line-text-row').hidden = span?.dynamicText === undefined;
  get('dynamic-line-target-row').hidden = !span;
  field('dynamic-line-text').value = span?.dynamicText ?? '';
  selectField('dynamic-line-target').value = span?.dynamicTarget ?? '';
}
field('align-dynamics').onchange = () => {
  const picks = effectivePicks().filter(isDynamic);
  const enabled = field('align-dynamics').checked;
  commit(() => picks.forEach(pick => updateAppearance(pick, { ...appearanceOf(score, pick), alignDynamics: enabled ? undefined : false })), '', false);
};
field('dynamic-line-text').onchange = () => {
  const pick = effectivePicks()[0];
  if (pick?.kind === 'span' && isDynamic(pick)) commit(() => { score.spans[pick.index].dynamicText = field('dynamic-line-text').value.trim(); }, '', false);
};
selectField('dynamic-line-target').onchange = () => {
  const pick = effectivePicks()[0];
  if (pick?.kind === 'span' && isDynamic(pick)) commit(() => {
    score.spans[pick.index].dynamicTarget = (selectField('dynamic-line-target').value || undefined) as DynamicStep | undefined;
  }, '', false);
};
function editTempoMarks(edit: (mark: TempoMark) => void) {
  const targets = tempoMarkTargets();
  if (targets.length) commit(() => targets.forEach(mark => {
    edit(mark);
    if (!mark.id) {
      mark.id = uid();
      (score.tempoMarks ??= []).push(mark);
    }
  }), '', false);
}
for (const [id, key] of [['tempo-unit', 'unit'], ['tempo-dots', 'dots'], ['tempo-written', 'bpm']] as const) get(id).onchange = () => {
  const control = get<HTMLInputElement | HTMLSelectElement>(id);
  if (!control.value || !control.checkValidity() || control.value === 'mixed') { render(); return; }
  editTempoMarks(mark => {
    if (mark.kind === 'metronome') { mark[key] = Number(control.value); delete mark.writtenRate; }
    if (mark.kind === 'modulation' && key !== 'bpm') mark[key] = Number(control.value);
  });
};
for (const [id, key] of [['tempo-right-unit', 'rightUnit'], ['tempo-right-dots', 'rightDots']] as const) selectField(id).onchange = () => {
  const value = Number(selectField(id).value);
  if (Number.isFinite(value)) editTempoMarks(mark => { if (mark.kind === 'modulation') mark[key] = value; });
};
for (const id of ['tempo-swing-unit', 'tempo-ratio']) get(id).onchange = () => {
  const control = get<HTMLInputElement | HTMLSelectElement>(id);
  if (control.value && control.checkValidity() && control.value !== 'mixed')
    editTempoMarks(mark => {
      if (mark.kind !== 'swing') return;
      if (id === 'tempo-ratio') mark.ratio = Number(control.value);
      else mark.swingUnit = control.value === '24' ? 24 : 48;
    });
};
field('tempo-caption').onchange = () => editTempoMarks(mark => { mark.label = field('tempo-caption').value.trim() || undefined; });
field('tempo-override').onchange = () => {
  const control = field('tempo-override');
  if (!control.checkValidity()) { render(); return; }
  editTempoMarks(mark => { mark.override = control.value ? control.valueAsNumber : undefined; });
};
function editTempoLines(edit: (line: TempoLine) => void) {
  const targets = tempoLineTargets();
  if (targets.length) commit(() => targets.forEach(edit), '', false);
}
field('tempo-line-caption').onchange = () => editTempoLines(line => { line.label = field('tempo-line-caption').value.trim() || undefined; });
selectField('tempo-line-mode').onchange = () => {
  const target = selectField('tempo-line-mode').value === 'target';
  editTempoLines(line => {
    const start = scoreTempoAt(score, line.from);
    if (target) line.target = displayBpm(start * (line.percent ?? defaultTempoPercent(line)) / 100);
    else { line.percent = line.target === undefined ? line.percent : displayBpm(line.target / start * 100); delete line.target; }
  });
};
field('tempo-line-value').onchange = () => {
  const control = field('tempo-line-value');
  if (!control.value || !control.checkValidity()) { render(); return; }
  editTempoLines(line => { if (line.target === undefined) line.percent = control.valueAsNumber; else line.target = control.valueAsNumber; });
};
for (const [id, key] of [['tempo-dash-visible', 'dashVisible'], ['tempo-dash-layout', 'dashLayout']] as const)
  field(id).onchange = () => editTempoLines(line => { line[key] = field(id).checked; });
function hasSpanTarget() { return !input && (hasNoteTarget() || effectivePicks().some(pick => pick.kind === 'extension')); }
field('tempo-line-playback').onchange = () => {
  const lines = tempoLineTargets();
  const enabled = field('tempo-line-playback').checked;
  commit(() => lines.forEach(line => setTempoLinePlayback(score, line, enabled)), '', false);
};
function lineTargetRows(extensions = false) {
  const rows = new Map<string, Token[]>();
  const tokens = spanNoteTargets();
  if (extensions) for (const pick of effectivePicks()) if (pick.kind === 'extension') {
    const source = extensionToken(pick);
    if (source) tokens.push({ ...source, at: pick.at });
  }
  for (const token of tokens.sort((a, b) => a.at - b.at)) {
    const row = rows.get(token.note.lane) ?? [];
    row.push(token);
    rows.set(token.note.lane, row);
  }
  return score.lanes.flatMap(lane => rows.has(lane.id) ? [rows.get(lane.id)!] : []);
}
function spanNoteTargets() {
  const tokens = noteTargets();
  if (effectivePicks().some(pick => pick.kind !== 'pitch' && pick.kind !== 'extension')) return tokens.slice(-1);
  return tokens.sort((a, b) => a.at - b.at);
}
function swapOrigin(): Cursor | undefined {
  const token = noteTargets().at(-1);
  return token ? { lane: token.note.lane, at: token.at } : undefined;
}
function voiceConversion(merge: boolean) {
  const picks = digitTargets();
  if (!picks.length) return;
  const start = Math.min(...picks.map(({ token }) => token.at));
  const end = Math.max(...picks.map(({ token }) => tickEnd(token)));
  const chosenLanes = new Set(picks.map(({ token }) => token.note.lane));
  if (merge && chosenLanes.size === 1) {
    for (const lane of temporaryStack(score, { lane: picks[0].token.note.lane, at: start }))
      if (!lane.parent || lane.end! >= end) chosenLanes.add(lane.id);
  }
  const lanes = score.lanes.filter(lane => chosenLanes.has(lane.id)).map(lane => lane.id);
  const target = { lanes, start, end };
  let converted: Score, lane: string;
  const modal = get<HTMLDialogElement>('voice-conversion');
  get('voice-conversion-title').textContent = merge ? '独立声部合为叠音' : '叠音拆成独立声部';
  const apply = button('voice-conversion-apply');
  apply.hidden = false;
  try {
    converted = structuredClone(score);
    lane = (merge ? mergeVoices : splitChords)(converted, target);
    openScore(JSON.stringify(converted));
    const extra = converted.lanes.length - score.lanes.length;
    get('voice-conversion-summary').textContent = `${describePosition(start)} 至 ${describePosition(end)}。选定 ${lanes.length} 条声部线。${extra > 0 ? `新增 ${extra} 条临时副线。` : ''}`;
  } catch (error) {
    get('voice-conversion-summary').textContent = error instanceof Error ? error.message : String(error);
    apply.hidden = true;
  }
  modal.returnValue = '';
  modal.onclose = () => {
    if (modal.returnValue !== 'apply' || !converted || apply.hidden) return;
    commit(() => {
      score = converted;
      cursor = { lane, at: start };
      selection = range = selectedItems = lyricAnchor = lyricFocus = null;
    }, '已转换所选声部。');
  };
  modal.showModal();
}
function swapVoiceCount() {
  const origin = swapOrigin();
  return origin ? temporaryStack(score, origin).length : 0;
}
function swapVoices(first: number, second: number, origin = swapOrigin()) {
  if (!origin) return;
  commit(() => {
    cursor = swapTemporaryVoices(score, origin, first, second);
    selection = selectedItems = range = null;
    systemLane = cursor.lane;
  }, `已交换当前临时分部的第 ${first}、${second} 声部。`);
}
const swapDialog = get<HTMLDialogElement>('swap-voice-dialog');
const swapFirst = field('swap-voice-first');
const swapSecond = field('swap-voice-second');
function openSwapVoices() {
  const origin = swapOrigin();
  if (!origin) return;
  swapFirst.max = swapSecond.max = String(temporaryStack(score, origin).length);
  swapFirst.value = '1';
  swapSecond.value = '2';
  swapSecond.setCustomValidity('');
  swapDialog.returnValue = '';
  swapDialog.onclose = () => {
    if (swapDialog.returnValue === 'apply') swapVoices(swapFirst.valueAsNumber, swapSecond.valueAsNumber, origin);
  };
  swapDialog.showModal();
}
for (const control of [swapFirst, swapSecond]) control.oninput = () => {
  swapSecond.setCustomValidity(swapFirst.valueAsNumber === swapSecond.valueAsNumber ? '请输入两个不同的声部编号。' : '');
};
const swapTrigger = get<HTMLButtonElement>('swap-voice-menu').previousElementSibling as HTMLButtonElement;
swapTrigger.onkeydown = event => {
  if (event.key !== 'ArrowRight' && event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  event.stopPropagation();
  get('swap-voice-menu').querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
};
function openRepeatTool(id: string) {
  workbench.setPanel('properties');
  get('measure-properties').hidden = false;
  get('repeat-tools').hidden = false;
  get<HTMLDetailsElement>('repeat-tools').open = true;
  get(id).focus();
}

const relay = (id: string): Command => ({
  run: () => button(id).click(), enabled: () => !button(id).disabled
});
const commands: Record<string, Command> = {
  'style-save': relay('style-save'),
  'style-load': relay('style-load'),
  'shortcut-export': relay('shortcut-export'),
  'shortcut-import': relay('shortcut-import'),
  'shortcut-settings': { run: () => shortcuts.open() },
  preferences: { run: openPreferences },
  manual: { run: () => helpPages.openManual() },
  about: { run: () => get<HTMLDialogElement>('about').showModal() },
  'save-as': { run: () => { void saveAs(); }, enabled: () => documents.includes(activeDocument) },
  'duplicate-document': { run: duplicateDocument, enabled: () => documents.includes(activeDocument) },
  fullscreen: { run: () => {
    const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    void request.catch(() => { get('status').textContent = '当前窗口无法切换全屏。'; });
  }},
  'crescendo-text': { run: () => addSpan('crescendo', 'cresc.'), enabled: hasSpanTarget },
  'diminuendo-text': { run: () => addSpan('diminuendo', 'dim.'), enabled: hasSpanTarget },
  ...Object.fromEntries(['new', 'open', 'sample', 'save', 'print', 'undo', 'redo', 'import', 'mixer', 'lane-add', 'side-add', 'help',
    'rewind', 'metronome-toggle', 'loop-toggle', 'hear-one', 'zoom-in', 'zoom-out',
    'lyric-edit', 'lyric-extension', 'staccato', 'accent', 'fermata', 'tenuto', 'breath', 'breath-comma'].map(id => [id, relay(id)])),
  palette: { run: () => workbench.setPanel('palette') },
  layout: { run: () => workbench.setPanel('layout') },
  'page-layout': { run: () => openFormatting() },
  'score-navigation': { run: () => {
    field('nav-search').value = '';
    get('nav-order').hidden = true;
    navigationEntries = collectNavigation();
    drawNavigation();
    navigationDialog.showModal();
  } },
  'chord-symbol': { run: openChordSymbol, enabled: () => !input && (!unfocused || selection?.kind === 'chord-symbol') },
  'route-mark': { run: addRouteMark, enabled: () => !input },
  ...Object.fromEntries(['dc', 'ds', 'fine', 'segno', 'coda', 'tocoda'].map(kind =>
    ['route:' + kind, { run: () => addRouteMark(kind as RouteKind), enabled: () => !input }])),
  'line-layout': { run: openLineLayout },
  'line-lock': { run: () => setLineLock(true), enabled: () => !input },
  'line-unlock': { run: () => setLineLock(false), enabled: () => !input },
  'line-section-clear': { run: () => commit(() => {
    const { start, end } = selectedMeasures();
    for (const bar of score.measures.slice(start, end + 1)) delete bar.lineSection;
  }), enabled: () => !input },
  'split-chords': { enabled: hasSpanTarget, run: () => voiceConversion(false) },
  'merge-voices': { enabled: hasSpanTarget, run: () => voiceConversion(true) },
  'voices': { run: () => openVoices() },
  'side-split': { run: splitSelectedTemporaryVoice, enabled: () => !!noteTargets().find(token =>
    temporaryStack(score, { lane: token.note.lane, at: token.at }).length > 1) },
  'side-delete': { run: () => deleteSelectedTemporaryVoices(), enabled: () => !!noteTargets().find(token =>
    temporaryStack(score, { lane: token.note.lane, at: token.at }).length > 1) },
  'linked-parts': { run: openLinkedParts },
  'measure-edit': { run: () => {
    const token = selection?.kind === 'pitch' ? pickToken(selection) : undefined;
    if (token) openMeasureProperties(token.measure, token.note.lane);
    else openMeasureProperties();
  }, enabled: () => !input },
  'measure-context': { run: () => { if (contextMeasure) openMeasureProperties(contextMeasure.index, contextMeasure.lane); } },
  copy: { run: () => copySelection(false), enabled: () => !unfocused },
  'copy-structure': { run: () => copySelection(false, true), enabled: () => !!range && !unfocused },
  cut: { run: () => copySelection(true), enabled: () => !unfocused },
  paste: { run: pasteSelection, enabled: () => (!!scoreClipboard || !!lyricClipboard) && !unfocused },
  'select-similar': { run: () => similarSelection(), enabled: () => !!selection || !!selectedItems?.length || !!signSelection },
  'context-similar': { run: () => { if (contextSimilar) similarSelection(contextSimilar); } },
  'copy-lyric-text': { run: copyLyricText, enabled: () => !unfocused },
  'lyric-preview': { run: openLyricPreview, enabled: () => !input && !unfocused },
  'swap-voices:custom': { run: openSwapVoices, enabled: () => swapVoiceCount() >= 2 },
  'meter:custom': { run: () => openMeter(targetMeasure(), true) },
  'key:1': { run: () => openKey(1) },
  'key:6': { run: () => openKey(6) },
  ...Object.fromEntries(meterPresets.map(meter => ['meter:' + meter, { run: () => {
    const [numerator, denominator] = meter.split('/').map(Number);
    commit(() => applyMeter(targetMeasure(), { numerator, denominator, groups: defaultGroups(numerator, denominator) }, undefined, false, 'following', true));
  } }])),
  'justify-bottom': { run: () => commit(() => { score.justifyBottom = score.justifyBottom === false; }),
    pressed: () => score.justifyBottom !== false },
  'reset-spacing': { enabled: () => !!score.spacing, run: () => commit(() => { delete score.spacing; }) },
  properties: { run: () => workbench.setPanel('properties') },
  search: { run: () => workbench.search() },
  sidebar: { run: () => workbench.toggleSidebar() },
  fit: relay('fit'),
  transport: { run: togglePlayback },
  'export-xml': { run: launchExport },
  delete: { run: () => input ? inputDelete(false) : clear(), enabled: () => input || effectivePicks().some(pick => pick.kind !== 'generated-tie') },
  'edit-element': {
    enabled: () => !!editableSelection() || selection?.kind === 'chord-symbol' || selection?.kind === 'route',
    run: () => {
      const pick = selection ?? selectedItems?.at(-1);
      if (pick?.kind === 'chord-symbol') { openChordSymbol(); return; }
      if (pick?.kind === 'route') { workbench.setPanel('properties'); return; }
      if (pick?.kind === 'mark' && pick.field === 'lyric') {
        const note = score.notes.find(note => note.id === pick.id);
        if (!note) return;
        verseNumber = pick.verse ?? 1;
        startLyrics({ lane: note.lane, at: note.at }, false);
      } else if (editableSelection()) startText(pick as TextSelection);
    }
  },
  expression: { enabled: () => textMarkTargets('text').length > 0, run: () => addTextAtCursor('text') },
  'inter-note-text': { enabled: () => textMarkTargets('interNoteText').length > 0, run: () => addTextAtCursor('interNoteText') },
  rehearsal: { enabled: () => textMarkTargets('rehearsal').length > 0, run: () => addTextAtCursor('rehearsal') },
  ending: { enabled: () => !input, run: () => openRepeatTool('ending-passes') },
  'ending:1': { enabled: () => !input && (hasNoteTarget() || selection?.kind === 'ending'), run: () => setEnding(1) },
  'ending:2': { enabled: () => !input && (hasNoteTarget() || selection?.kind === 'ending'), run: () => setEnding(2) }
};
for (const key of ['metronome', 'restore', 'primo', 'swing', 'straight', ...Object.keys(TEMPO_PRESETS),
  ...[0, 1].flatMap(dots => [192, 96, 48].map(unit => `metro:${unit}:${dots}`)), ...RHYTHM_TEMPO.map((_, index) => 'mod:' + index)])
  commands['tempo:' + key] = { run: () => addTempoMark(key), enabled: () => !!tempoAnchors().length };
for (const kind of TEMPO_LINE_KINDS)
  commands['tempo-line:' + kind] = { run: () => addTempoLine(kind), enabled: () => !!tempoAnchors().length };
for (const [first, second] of [[1, 2], [1, 3], [2, 3]])
  commands[`swap-voices:${first}:${second}`] = { run: () => swapVoices(first, second), enabled: () => swapVoiceCount() >= second };
function boundaryIndex(style?: BarStyle) {
  if (selection?.kind === 'barline' || selection?.kind === 'break') return selection.index;
  if (selection?.kind === 'ending') return (score.endings?.[selection.index]?.end ?? selectedMeasures().end) + 1;
  const measure = prepared.measures.find(item => cursor.at < item.end)!;
  return measure.index + (style === 'repeat-start' ? 0 : 1);
}
function legalBar(style: BarStyle) {
  return !input && boundaryTargets(style).some(index => legalBoundaryStyle(index, style));
}
function legalBoundaryStyle(index: number, style: BarStyle) {
  return (index > 0 || !endsRepeat(style)) && (index < score.measures.length || !startsRepeat(style));
}
function boundaryTargets(style?: BarStyle) {
  const picks = effectivePicks();
  const indices = new Set<number>();
  for (const pick of picks) {
    if (pick.kind === 'barline' || pick.kind === 'break') indices.add(pick.index);
    if (pick.kind === 'pitch') {
      const token = pickToken(pick);
      if (token) indices.add(token.measure + (style === 'repeat-start' ? 0 : 1));
    }
  }
  return indices.size ? [...indices] : !input && (!unfocused && (!picks.length || picks.length === 1 && selection?.kind === 'ending')) ? [boundaryIndex(style)] : [];
}
function applyBar(style: BarStyle, merge = true) {
  const indices = boundaryTargets(style).filter(index => legalBoundaryStyle(index, style));
  if (!indices.length) return;
  commit(() => {
    for (const index of indices) setBoundaryStyle(score, index, style, merge);
    if (effectivePicks().length < 2) { selection = { kind: 'barline', index: indices[0] }; selectedItems = range = null; }
  });
  if (!workbench.isHidden()) workbench.setPanel('properties', false);
}
function applyBreak(value?: Boundary['break']) {
  const indices = boundaryTargets().filter(index => index > 0 && index < score.measures.length);
  if (!indices.length) return;
  commit(() => {
    for (const index of indices) setBoundaryBreak(score, index, value);
    if (effectivePicks().length < 2) { selection = { kind: value ? 'break' : 'barline', index: indices[0] }; selectedItems = range = null; }
    else if (!value && selectedItems) {
      selectedItems = uniquePicks(selectedItems.map(pick => pick.kind === 'break' ? { kind: 'barline', index: pick.index } : pick));
      selection = selection?.kind === 'break' ? { kind: 'barline', index: selection.index } : selection;
    }
  });
}
function previousToken(token: Token) {
  const lane = prepared.byLane.get(token.note.lane) ?? [];
  return lane[lane.indexOf(token) - 1];
}
function effectiveBeam(token: Token) {
  const prev = previousToken(token);
  return token.note.beams?.[token.at] ?? (token.note.xmlBeams?.[token.at] !== undefined ? 'xml' :
    prev?.measure === token.measure && prev.note.beam ? prev.note.beam : beamMode(token));
}
function beamTargets(mode: BeamMode) {
  if (input || !hasNoteTarget()) return [];
  return noteTargets().filter(token => {
    if (!token.bars) return false;
    if (mode === 'auto' || mode === 'isolated') return true;
    const prev = previousToken(token);
    const shared = prev && prev.measure === token.measure && tickEnd(prev) === token.at && prev.tuplet?.id === token.tuplet?.id
      ? Math.min(prev.bars, token.bars) : 0;
    return shared >= (mode === 'one' ? 2 : mode === 'two' ? 3 : mode === 'three' ? 4 : 1);
  });
}
function applyBeam(mode: BeamMode) {
  const targets = beamTargets(mode);
  const grace = graceBeamTargets(mode);
  if (!targets.length && !grace.length) return;
  commit(() => {
    grace.forEach(event => { event.beam = mode === 'auto' ? undefined : mode; });
    for (const token of targets) {
      const note = noteAt(score, { lane: token.note.lane, at: token.at }) ?? fragment(token);
      (note.beams ??= {})[token.at] = mode;
    }
  });
}
for (const mode of BEAM_MODES) commands['beam:' + mode] = {
  run: () => applyBeam(mode), enabled: () => !!(beamTargets(mode).length || graceBeamTargets(mode).length),
  pressed: () => { const values = [...noteTargets().filter(token => token.bars).map(effectiveBeam), ...graceBeamTargets('auto').map(event => event.beam ?? 'auto')];
    return !!values.length && values.every(value => value === mode); }
};
for (const style of BAR_STYLES) commands['bar:' + style] = {
  run: () => applyBar(style), enabled: () => legalBar(style),
  pressed: () => selection?.kind === 'barline' && boundaryAt(score, selection.index).style === style
};
for (const value of ['auto', 'line', 'page'] as const) commands['break:' + value] = {
  run: () => applyBreak(value === 'auto' ? undefined : value),
  enabled: () => !input && boundaryTargets().some(index => index > 0 && index < score.measures.length && (value !== 'auto' || !!boundaryAt(score, index).break)),
  pressed: () => (selection?.kind === 'barline' || selection?.kind === 'break') && (boundaryAt(score, selection.index).break ?? 'auto') === value
};
const barSelect = get<HTMLSelectElement>('bar-options');
for (const style of BAR_STYLES) barSelect.add(new Option(barLabels[style], style));
barSelect.onchange = () => { if (BAR_STYLES.includes(barSelect.value as BarStyle)) applyBar(barSelect.value as BarStyle, false); };
const beamSelect = get<HTMLSelectElement>('beam-options');
beamSelect.add(new Option('混合', 'mixed'));
beamSelect.add(new Option('原 MusicXML 分组', 'xml'));
for (const mode of BEAM_MODES) beamSelect.add(new Option(beamLabels[mode], mode));
beamSelect.onchange = () => applyBeam(beamSelect.value as BeamMode);
get<HTMLSelectElement>('break-options').onchange = event => {
  const value = (event.target as HTMLSelectElement).value;
  if (value && value !== 'mixed') applyBreak(value === 'auto' ? undefined : value as Boundary['break']);
};
field('repeat-times').onchange = () => {
  const indices = boundaryTargets().filter(index => endsRepeat(boundaryAt(score, index).style));
  const repeats = field('repeat-times').valueAsNumber;
  commit(() => {
    if (!Number.isInteger(repeats) || repeats < 0 || repeats > 7) throw Error('再反复次数须为 0–7。');
    for (const index of indices) Object.assign((score.boundaries ??= {})[index] ??= {}, { style: boundaryAt(score, index).style, repeats });
  }, '', false);
};
function appearanceTarget() {
  const token = tokenAt();
  return input || unfocused ? null : selection ?? (token ? { kind: 'pitch', id: token.note.id, at: token.at, index: pitchIndex(token) } as const : null);
}
const usesLayout = (pick: ElementSelection) => !['break', 'pitch', 'extension', 'grace'].includes(pick.kind);
function courtesyTargets(picks: ElementSelection[]) {
  return picks.flatMap(pick => {
    const token = pick.kind === 'pitch' ? pickToken(pick) : pick.kind === 'mark' && pick.field === 'accidental' ? markedToken(pick.id) : undefined;
    if (!token || token.continuation) return [];
    const pitch = token.note.pitches[pick.kind === 'pitch' ? pick.index : pick.kind === 'mark' ? pick.pitch ?? 0 : 0];
    return pitch ? [pitch] : [];
  });
}
function renderBoundaryProperties() {
  const picks = effectivePicks();
  const pick = picks.length === 1 ? picks[0] : undefined;
  const namePicks = picks.filter((p): p is LaneNamePick => p.kind === 'lane-name');
  const allNames = namePicks.length > 0 && namePicks.length === picks.length;
  get('appearance-properties').hidden = !picks.length;
  const courtesy = courtesyTargets(picks);
  get('courtesy-accidental-row').hidden = input || !courtesy.length || !picks.every(pick => pick.kind === 'pitch' || pick.kind === 'mark' && pick.field === 'accidental');
  displayCheck(field('courtesy-accidental'), courtesy.map(pitch => !!pitch.courtesy));
  const rhythms = picks.map(rhythmChoice);
  get('rhythm-alignment-row').hidden = !picks.length || !rhythms.every(Boolean);
  const alignment = selectField('rhythm-alignment');
  const labels = { full: '完全对齐', half: '半对齐', none: '不对齐' };
  const inferred = commonValue(rhythms.flatMap(item => item ? [rhythmAlignment(score, prepared.measures[item.token.measure], item.token, item.target.at)] : []));
  alignment.querySelector<HTMLOptionElement>('[value="auto"]')!.text = inferred ? `自动（${labels[inferred]}）` : '自动';
  displaySelect(alignment, rhythms.map(item => item ? appearanceOf(score, item.target)?.alignment ?? 'auto' : 'auto'));
  button('show-voice-settings').hidden = pick?.kind !== 'lane-name';
  button('show-number-settings').hidden = pick?.kind !== 'measure-number';
  get('independent-name-label').hidden = !allNames || namePicks.some(p => p.field !== 'shortName');
  displayCheck(field('independent-name'), namePicks.map(p => !!laneNameBar(p)?.localNames?.[p.lane]));
  get('independent-name-position-label').hidden = !allNames;
  displayCheck(field('independent-name-position'), namePicks.map(p => appearanceOf(score, p)?.independentPosition !== false));
  renderStaffBracketProperties();
  const appearance = picks.map(p => appearanceOf(score, p));
  displayCheck(field('element-visible'), appearance.map(value => value?.visible !== false));
  displayCheck(field('element-layout'), appearance.map(value => value?.layout !== false));
  get('element-layout-label').hidden = !picks.length || !picks.every(usesLayout);
  button('reset-placement').hidden = !picks.every(canPosition) || !picks.some((pick, i) => {
    if (pick.kind === 'pitch' || pick.kind === 'extension') return rhythmPosition(pick).x;
    const p = appearance[i]?.placement;
    return picks.length === 1 && isLine(pick) && pickedEndpoint ? p?.[pickedEndpoint] ||
      (pickedEndpoint === 'from' ? p?.fromY : pickedEndpoint === 'to' ? p?.toY : undefined) : p;
  });
  const boundaryPick = picks.length > 0 && picks.every(pick => pick.kind === 'barline' || pick.kind === 'break');
  get('boundary-properties').hidden = !boundaryPick;
  if (boundaryPick) {
    const indices = boundaryTargets();
    const boundaries = indices.map(index => boundaryAt(score, index));
    displaySelect(barSelect, boundaries.map(boundary => boundary.style));
    for (const option of barSelect.options) option.disabled = !BAR_STYLES.includes(option.value as BarStyle) || indices.some(index => !legalBoundaryStyle(index, option.value as BarStyle));
    get('repeat-times-label').hidden = !boundaries.every(boundary => endsRepeat(boundary.style));
    displayField(field('repeat-times'), boundaries.map(boundary => boundary.repeats ?? 0));
    const breaks = get<HTMLSelectElement>('break-options');
    displaySelect(breaks, boundaries.map(boundary => boundary.break ?? 'auto'));
    breaks.disabled = indices.some(index => index === 0 || index === score.measures.length);
  }
  const endings = picks.flatMap(pick => pick.kind === 'ending' ? score.endings?.[pick.index] ?? [] : []);
  const allEndings = endings.length > 0 && endings.length === picks.length;
  get('ending-properties').hidden = !allEndings;
  get('ending-range-fields').hidden = get('ending-anchor-description').hidden = endings.length > 1;
  displayField(field('ending-passes'), allEndings ? endings.map(ending => ending.passes.join(',')) : [], '如 1 或 2,3');
  displayCheck(field('ending-open'), endings.map(ending => !!ending.open));
  if (endings.length === 1) {
    const ending = endings[0];
    field('ending-from').value = String(ending.start + 1);
    field('ending-to').value = String(ending.end + 1);
    const times = endingRange(ending, prepared.measures);
    get('ending-anchor-description').textContent = `${describePosition(times.from)} – ${describePosition(times.to)}`;
  }
}
field('independent-name').onchange = () => {
  const independent = field('independent-name').checked;
  commit(() => {
    for (const pick of effectivePicks()) {
      if (pick.kind !== 'lane-name' || pick.field !== 'shortName') continue;
      const bar = laneNameBar(pick);
      const lane = primaryLanes().find(row => row.id === pick.lane);
      if (!bar || !lane) continue;
      if (independent) (bar.localNames ??= {})[lane.id] ??= { content: lane.shortName || lane.name, text: structuredClone(lane.shortNameText) };
      else if (bar.localNames) {
        delete bar.localNames[lane.id];
        if (!Object.keys(bar.localNames).length) delete bar.localNames;
      }
    }
  }, '', false);
};
field('independent-name-position').onchange = () => {
  const independent = field('independent-name-position').checked;
  commit(() => {
    for (const pick of effectivePicks()) {
      if (pick.kind !== 'lane-name') continue;
      const current = appearanceOf(score, pick);
      if ((current?.independentPosition !== false) === independent) continue;
      const lane = score.lanes.find(lane => lane.id === pick.lane)!;
      const alreadyLinked = Object.entries(score.appearance ?? {}).some(([key, value]) => {
        if (value.independentPosition !== false) return false;
        const [kind, id] = JSON.parse(key);
        return kind === 'lane-name' && id === lane.id;
      });
      updateAppearance(pick, { ...current, independentPosition: independent ? undefined : false,
        placement: !independent && alreadyLinked ? lane.sharedNamePlacement : current?.placement });
    }
  }, '', false);
};
for (const [id, key] of [['element-visible', 'visible'], ['element-layout', 'layout']] as const) field(id).onchange = () => {
  const picks = effectivePicks().filter(pick => key !== 'layout' || usesLayout(pick));
  if (!picks.length) return;
  const value = field(id).checked;
  commit(() => {
    for (const element of picks) updateAppearance(element, { ...appearanceOf(score, element), [key]: value });
  }, '', false);
};
button('reset-placement').onclick = () => {
  const picks = positionTargets(effectivePicks());
  if (!picks.length) return;
  commit(() => {
    for (const element of picks) {
      if (element.kind === 'pitch' || element.kind === 'extension') {
        const { separate, item } = rhythmPosition(element);
        if (separate && item) {
          const look = { ...appearanceOf(score, item.target) };
          delete look.placement;
          updateAppearance(item.target, look);
        } else delete score.columns?.[element.at];
        continue;
      }
      const updated = { ...appearanceOf(score, element) };
      if (picks.length === 1 && pickedEndpoint && isLine(element) && updated.placement) {
        const position = { ...updated.placement };
        delete position[pickedEndpoint];
        if (pickedEndpoint !== 'height') { delete position[pickedEndpoint === 'from' ? 'fromY' : 'toY']; delete position.edge; }
        updated.placement = Object.values(position).some(Boolean) ? position : undefined;
      } else delete updated.placement;
      updateAppearance(element, updated);
    }
  }, '', false);
};
selectField('rhythm-alignment').onchange = () => {
  const mode = selectField('rhythm-alignment').value;
  if (!['auto', 'full', 'half', 'none'].includes(mode)) return;
  const targets = uniquePicks(effectivePicks().flatMap(pick => rhythmChoice(pick)?.target ?? []));
  if (!targets.length) return;
  commit(() => {
    for (const target of targets) {
      const look = { ...appearanceOf(score, target) };
      look.alignment = mode === 'auto' ? undefined : mode as RhythmAlignment;
      updateAppearance(target, look);
    }
  }, '', false);
};
field('courtesy-accidental').onchange = () => {
  const targets = courtesyTargets(effectivePicks());
  const checked = field('courtesy-accidental').checked;
  if (targets.length) commit(() => targets.forEach(pitch => { pitch.courtesy = checked || undefined; }), '', false);
};
for (let count = 2; count <= 19; count++)
  commands['tuplet:' + count] = { enabled: () => !!tupletTarget(), run: () => addTuplet(count) };
commands['tuplet:custom'] = { enabled: () => !!tupletTarget(), run: customTuplet };
for (const side of ['before', 'after'] as const) for (const length of [48, 24])
  commands[`grace:${side}:${length}`] = { enabled: () => !!graceTarget(side), run: () => beginGrace(side, length) };
for (const kind of ORNAMENT_KINDS) commands['ornament:' + kind] = { enabled: hasSpanTarget, run: () => addOrnament(kind) };
commands['ornament:trill-wave'] = { enabled: hasSpanTarget, run: () => addOrnament('trill', true) };
commands['tremolo-pair'] = { enabled: hasSpanTarget, run: () => addSpan('tremolo') };
for (const kind of ['tie', 'slur', 'crescendo', 'diminuendo', 'slide'] as const)
  commands[kind] = { enabled: () => hasSpanTarget() || (kind === 'tie' || kind === 'slur') && gracePicks().length > 0, run: () => addSpan(kind) };
for (const type of BRACKET_TYPES) commands['staff-bracket:' + type] = {
  enabled: () => !input && !unfocused && !!systemAtIndex(systemFocus) && (!!systemLane || !selection || selection.kind === 'pitch'),
  run: () => addStaffBracket(type)
};
for (const name of ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'sfz']) commands['dynamic:' + name] = {
  enabled: () => textMarkTargets('dynamic').length > 0,
  run: () => applyTextMark('dynamic', name, true)
};

const inputArticulations = ['staccato', 'accent', 'fermata', 'tenuto'] as const;
const inputMarkLabels = new Map(symbolGroups.flatMap(group => group.entries.map(entry => [entry.command, entry.title])));
const canQueueInputMark = () => input && !graceEdit && !unfocused && !inline;
function consumeInputMarks(note?: Note) {
  if (note) {
    for (const key of inputArticulations) if (pendingMarks.has(key)) note[key] = true;
    const breath = pendingMarks.get('breath');
    if (breath) note.breath = breath === 'breath-comma' ? 'comma' : 'upbow';
    const dynamic = pendingMarks.get('dynamic');
    if (dynamic) note.dynamic = dynamic.slice('dynamic:'.length);
    const ornament = pendingMarks.get('ornament')?.slice('ornament:'.length);
    if (ornament && (note.pitches.length || ornament === 'tremolo')) {
      const kind = ornament === 'trill-wave' ? 'trill' : ornament as OrnamentKind;
      (note.ornaments ??= {})[kind] = kind === 'tremolo' ? { strokes: 3 } : ornament === 'trill-wave' ? { wave: true } : {};
    }
  }
  pendingMarks.clear();
}
for (const id of [...inputArticulations, 'breath', 'breath-comma',
  ...Object.keys(commands).filter(id => id.startsWith('ornament:') || id.startsWith('dynamic:'))]) {
  const normal = commands[id];
  const family = id === 'breath-comma' ? 'breath' : id.split(':')[0];
  commands[id] = {
    enabled: () => canQueueInputMark() || (normal.enabled?.() ?? true),
    pressed: () => canQueueInputMark() && pendingMarks.get(family) === id,
    run: () => {
      if (!canQueueInputMark()) { normal.run(); return; }
      if (pendingMarks.get(family) === id) pendingMarks.delete(family);
      else pendingMarks.set(family, id);
      controls();
    }
  };
}

function addTextAtCursor(key: 'text' | 'interNoteText' | 'rehearsal') {
  const targets = textMarkTargets(key);
  const token = targets[0]?.token;
  if (!token) return;
  const extension = targets[0].extension;
  const existing = extension === undefined && token.continuation ? undefined : noteTextValue(token.note, key, extension);
  if (existing && targets.length === 1) { startText({ kind: 'mark', field: key, id: token.note.id, extension }); return; }
  const dialog = get<HTMLDialogElement>('add-text');
  get('add-text-title').textContent = `添加${markNames[key]}`;
  get('add-text-side-row').hidden = key !== 'interNoteText';
  selectField('add-text-side').value = 'left';
  field('add-text-value').value = key === 'rehearsal' ? 'A' : '';
  dialog.returnValue = '';
  dialog.onclose = () => {
    const next = field('add-text-value').value.trim();
    if (dialog.returnValue !== 'add' || !next) return;
    const side = selectField('add-text-side').value === 'right' ? 'right' : 'left';
    if (targets.length > 1) { applyTextMark(key, next.slice(0, 300), false, key === 'interNoteText' ? side : undefined); return; }
    commit(() => {
      const note = extension !== undefined ? token.note : key === 'interNoteText' && !token.continuation
        ? score.notes.find(note => note.id === token.note.id) ?? fragment(token) : fragment(token);
      writeNoteText(note, key, next.slice(0, 300), extension);
      selection = { kind: 'mark', field: key, id: note.id, extension };
      if (key === 'interNoteText') setInterNoteSide(selection, side);
      selectedItems = range = null;
    });
  };
  dialog.showModal();
}

const desk = get('desk');
let zoom: number | 'fit' = defaultZoom();
let zoomPercent = 100;
let previousPaperWidth = 0;
let previousPaperHeight = 0;
const minimumZoom = 5, maximumZoom = 800;
const zoomControl = field('zoom-readout');
const zoomPresets = get<HTMLDetailsElement>('zoom-presets');
const pageViewControl = selectField('page-view');
pageViewControl.value = preferences.view;
function updateZoom() {
  const scoreView = get('score');
  const { pixelWidth: paperWidth, pixelHeight: paperHeight } = paperSize(score);
  previousPaperWidth = paperWidth;
  previousPaperHeight = paperHeight;
  const spread = pageViewControl.value === 'spread';
  const horizontal = pageViewControl.value === 'horizontal';
  scoreView.classList.toggle('spread', spread);
  scoreView.classList.toggle('horizontal', horizontal);
  const padding = getComputedStyle(desk);
  const width = desk.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight);
  const height = desk.clientHeight - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom);
  const gap = spread ? parseFloat(getComputedStyle(scoreView).columnGap) : 0;
  const fit = Math.floor(100 * (horizontal ? height / paperHeight : (spread ? (width - gap) / 2 : width) / paperWidth));
  zoomPercent = Math.min(maximumZoom, Math.max(minimumZoom, zoom === 'fit' ? fit : zoom));
  scoreView.style.setProperty('--paper-width', `${paperWidth * zoomPercent / 100}px`);
  if (document.activeElement !== zoomControl) zoomControl.value = zoomPercent + '%';
  button('zoom-out').disabled = zoomPercent <= minimumZoom;
  button('zoom-in').disabled = zoomPercent >= maximumZoom;
  button('fit').setAttribute('aria-pressed', String(zoom === 'fit'));
  positionEditor();
}
function setDeskZoom(percent: number) {
  const next = Math.min(maximumZoom, Math.max(minimumZoom, percent));
  if (next === zoomPercent && zoom === next) return;
  const centerX = desk.scrollLeft + desk.clientWidth / 2;
  const centerY = desk.scrollTop + desk.clientHeight / 2;
  const previous = zoomPercent;
  zoom = next;
  updateZoom();
  desk.scrollLeft = centerX * zoomPercent / previous - desk.clientWidth / 2;
  desk.scrollTop = centerY * zoomPercent / previous - desk.clientHeight / 2;
}
function adjustZoom(direction: number) {
  if (direction < 0 ? zoomPercent > minimumZoom : zoomPercent < maximumZoom) setDeskZoom(zoomPercent + direction * 10);
}
button('zoom-out').onclick = () => adjustZoom(-1);
button('zoom-in').onclick = () => adjustZoom(1);
desk.addEventListener('wheel', event => {
  const key = wheelShortcut(event);
  if (!key) return;
  const direction = shortcuts.keys('zoom-in').includes(key) ? 1 : shortcuts.keys('zoom-out').includes(key) ? -1 : 0;
  if (!direction) return;
  event.preventDefault();
  adjustZoom(direction);
}, { passive: false });
button('fit').onclick = () => { zoom = 'fit'; updateZoom(); };
pageViewControl.onchange = updateZoom;
function applyZoomInput() {
  const raw = zoomControl.value.trim().replace(/[%％]$/, '').trim();
  const value = raw ? Number(raw) : NaN;
  if (Number.isFinite(value) && value !== zoomPercent) setDeskZoom(value);
  zoomControl.value = zoomPercent + '%';
}
zoomControl.onblur = applyZoomInput;
zoomControl.onkeydown = event => {
  if (event.key === 'Enter') { event.preventDefault(); zoomControl.blur(); }
  else if (event.key === 'Escape') { zoomControl.value = zoomPercent + '%'; zoomControl.blur(); }
};
zoomPresets.onclick = event => {
  const preset = (event.target as HTMLElement).closest('button');
  if (!preset) return;
  const choice = preset.value;
  zoomPresets.open = false;
  zoomPresets.querySelector('summary')?.focus();
  if (choice === 'single' || choice === 'spread') {
    pageViewControl.value = choice;
    zoom = 'fit';
    updateZoom();
  } else if (Number(choice) >= minimumZoom && Number(choice) <= maximumZoom) setDeskZoom(Number(choice));
};
document.addEventListener('pointerdown', event => {
  if (!zoomPresets.contains(event.target as Node)) zoomPresets.open = false;
});
zoomPresets.onkeydown = event => {
  if (event.key !== 'Escape' || !zoomPresets.open) return;
  zoomPresets.open = false;
  zoomPresets.querySelector('summary')?.focus();
  event.preventDefault();
};
new ResizeObserver(updateZoom).observe(desk);
const repeatingShortcuts = new Set<string>();
function shortcutEntries() {
  const entries = new Map<string, Shortcut>();
  const edit: ShortcutScope[] = ['edit'];
  const scoreScopes: ShortcutScope[] = ['edit', 'input'];
  const deskScopes: ShortcutScope[] = [...scoreScopes, 'grace'];
  const bothText: ShortcutScope[] = ['text', 'lyric'];
  const focused = () => !unfocused;
  const add = (id: string, name: string, scopes: ShortcutScope[], defaults: string[] = [],
    handler?: Command, repeat = false) => {
    entries.set(id, { id, name, scopes, defaults, ...(handler ?? commands[id]) });
    if (repeat) repeatingShortcuts.add(id);
  };
  const action = (id: string, name: string, keys: string[], run: () => void, scopes = scoreScopes, repeat = true, enabled = focused) =>
    add(id, name, scopes, keys, { run, enabled }, repeat);
  const command = (id: string, name: string, keys: string[] = [], scopes = scoreScopes) => add(id, name, scopes, keys);
  for (const group of symbolGroups) for (const item of group.entries) {
    if (!commands[item.command] || entries.has(item.command)) continue;
    const title = item.title + (/^tempo:(?:mod|metro):/.test(item.command) ? ' ' + item.glyph : '');
    command(item.command, group.title + ' · ' + title);
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-command]')) {
    const id = button.dataset.command!;
    if (!entries.has(id) && commands[id] && !['context-similar', 'measure-context'].includes(id)) {
      const title = Object.values(button.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim();
      if (title) command(id, title);
    }
  }
  command('new', '新建乐谱', ['Ctrl+N', 'Ctrl+Alt+N'], deskScopes);
  command('open', '打开工程', ['Ctrl+O', 'Ctrl+Alt+O'], deskScopes);
  command('import', '导入 MusicXML', ['Ctrl+Alt+I'], deskScopes);
  command('save-as', '另存为', ['Ctrl+Shift+S', 'Ctrl+Alt+S'], deskScopes);
  command('duplicate-document', '生成副本', ['Ctrl+Shift+D', 'Ctrl+Alt+D'], deskScopes);
  command('export-xml', '导出 MusicXML', ['Ctrl+Alt+X'], deskScopes);
  command('print', '导出 PDF / PNG / SVG', ['Ctrl+P', 'Ctrl+Alt+P'], deskScopes);
  command('voices', '声部设置', ['Alt+P'], deskScopes);
  command('style-load', '导入样式', [], ['style']);
  command('style-save', '导出样式', [], ['style']);
  command('shortcut-import', '导入快捷键设置', [], ['bindings']);
  command('shortcut-export', '导出快捷键设置', [], ['bindings']);
  command('sample', '打开样谱');
  command('fullscreen', '切换全屏', ['F11'], deskScopes);
  command('help', '入门使用', ['?'], deskScopes);
  command('manual', '功能手册', [], deskScopes);
  command('shortcut-settings', '快捷键设置', [], deskScopes);
  command('save', '保存工程', ['Ctrl+S'], deskScopes);
  command('undo', '撤销', ['Ctrl+Z'], deskScopes);
  command('redo', '重做', ['Ctrl+Shift+Z', 'Ctrl+Y'], deskScopes);
  command('search', '搜索符号', ['Ctrl+K'], deskScopes);
  command('copy', '复制所选元素', ['Ctrl+C'], edit);
  command('cut', '剪切所选元素', ['Ctrl+X'], edit);
  command('paste', '粘贴', ['Ctrl+V'], edit);
  command('lyric-edit', '谱面填词', ['L'], edit);
  command('transport', '播放／暂停', ['Space'], deskScopes);
  command('rewind', '返回起点', [], deskScopes);
  command('metronome-toggle', '切换节拍器', [], deskScopes);
  command('loop-toggle', '切换循环播放', [], deskScopes);
  command('hear-one', '仅试听所选声部', [], deskScopes);
  command('zoom-in', '放大谱面', ['Shift+WheelUp'], deskScopes);
  command('zoom-out', '缩小谱面', ['Shift+WheelDown'], deskScopes);
  action('stop-playback', '停止／回位', ['Tab'], stopOrSeek, deskScopes, false, () => true);
  action('mode', '切换音符输入', ['N'], () => graceEdit ? endGrace() : mode(), deskScopes, false, () => true);
  action('edit-cancel', '返回常规编辑', ['Escape'], () => graceEdit ? endGrace() : mode(false), deskScopes, false, () => true);
  action('chord-mode', '切换叠音输入', ['C'], () => button('chord').click(), scoreScopes, false);
  action('rhythm-note', '输入／改为节奏音符 X', ['X'], rhythmKey);
  action('tie-key', '继续／创建同音线', ['Enter'], shortcutTie, scoreScopes, false);
  action('slur-key', '创建／结束连音线', ['+', 'NumAdd'], () => shortcutSlur(false), scoreScopes, false);
  action('slur-close', '结束待定连音线', ['='], () => shortcutSlur(true), scoreScopes, false);
  action('select-all', '全选谱面元素', ['Ctrl+A'], selectAllElements, edit, false, () => true);
  action('dots-toggle', '切换附点', ['.'], changeDots, deskScopes);
  for (const [direction, suffix, key] of [[-1, '低', '['], [1, '高', ']']] as const) {
    action('octave-' + suffix, '调' + suffix + '八度', [key], () => changeOctave(direction), deskScopes);
  }
  action('temp-octave-高', '提高一八度／下一个音符临时高八度', ['8'], () => { temporaryOctave = 1; controls(); }, deskScopes, false);
  action('duration-half', '减半时值', ['A', '('], () => changeDurationRatio(.5), deskScopes);
  action('duration-double', '增加一倍时值', ['S', ')'], () => changeDurationRatio(2), deskScopes);
  for (const [index, duration] of VALUES.entries())
    action('duration-' + duration, '时值 · ' + (duration === 384 ? '全音符' : 384 / duration + ' 分音符'), durationKeys[index] ? [durationKeys[index]] : [],
      () => setValue(duration), deskScopes);
  for (let degree = 0; degree <= 7; degree++) action('number-' + degree, degree ? `录入／改为音符 ${degree}` : '录入／改为休止',
    [String(degree)], () => graceEdit ? insertGrace(degree) : numberKey(degree), degree ? deskScopes : scoreScopes);
  for (const [direction, name, key, edge] of [[-1, '向左', 'ArrowLeft', 'Home'], [1, '向右', 'ArrowRight', 'End']] as const) {
    action('navigate-' + key, name + '移动录入点或端点', [key], () => {
      if (graceEdit) moveGrace(direction);
      else if (selection?.kind === 'span') adjustSpan(direction);
      else moveCursor(direction, false);
    }, deskScopes);
    action('grace-' + edge, direction < 0 ? '到倚音组开头' : '到倚音组末尾', [edge], () => moveGrace(direction * Infinity), ['grace']);
    action('chromatic-' + key, direction < 0 ? '降低半音' : '提高半音', [direction < 0 ? 'PageDown' : 'PageUp'],
      () => stepPitch(direction, 'chromatic'), deskScopes);
  }
  for (const [direction, key] of [[-1, 'ArrowUp'], [1, 'ArrowDown']] as const)
    action('voice-' + key, direction < 0 ? '移动到上方声部' : '移动到下方声部', ['Ctrl+' + key], () => {
      if (input) moveVoice(direction);
      else selectByArrow(key.toLowerCase(), false, true);
    });
  for (const [key, name] of [['ArrowLeft', '向左'], ['ArrowRight', '向右'], ['ArrowUp', '向上'], ['ArrowDown', '向下']] as const) {
    action('extend-' + key, name + '扩选', ['Shift+' + key], () => selectByArrow(key.toLowerCase(), true, false), edit);
    action('extend-measure-' + key, name + '按小节或声部扩选', ['Ctrl+Shift+' + key], () => selectByArrow(key.toLowerCase(), true, true), edit);
    action('measure-move-' + key, key === 'ArrowUp' || key === 'ArrowDown' ? name + '调整音级或移动选区' : name + '移动一个小节',
      [key === 'ArrowUp' || key === 'ArrowDown' ? key : 'Ctrl+' + key], () => {
        if (key === 'ArrowUp' && stepPitch(1, 'degree') || key === 'ArrowDown' && stepPitch(-1, 'degree')) return;
        selectByArrow(key.toLowerCase(), false, true);
      }, edit);
    for (const fine of [false, true]) action((fine ? 'fine-' : 'nudge-') + key, name + (fine ? '精细移动元素' : '微调元素位置'),
      [(fine ? 'Alt+Shift+' : 'Alt+') + key], () => nudge(key, fine, shortcutRepeating), edit);
  }
  action('delete', '删除所选元素／下一个输入音符', ['Delete'], () => {
    if (graceEdit) deleteGraceGap(false);
    else if (signSelection) deleteSignature();
    else commands.delete.run();
  }, deskScopes);
  action('erase-backward', '删除所选元素／上一个输入音符', ['Backspace'], () => {
    if (graceEdit) deleteGraceGap(true);
    else if (signSelection) deleteSignature();
    else if (input) inputDelete(true);
    else commands.delete.run();
  }, deskScopes);
  action('measure-delete', '删除所选小节或临时声部片段', ['Shift+Delete'], () => deleteSelectedTemporaryVoices(true), edit, false);
  action('measure-before', '在选区前插入小节', ['Insert'], () => editSelectedMeasures('before'), edit, false);
  action('measure-after', '在选区后插入小节', ['Shift+Insert'], () => editSelectedMeasures('after'), edit, false);
  for (let count = 2; count <= 19; count++) command('tuplet:' + count, `创建 ${count} 连音`, count < 10 ? ['Ctrl+' + count] : []);
  command('tuplet:custom', '创建自定义多连音', ['Ctrl+0']);
  for (const [id, name, key] of [
    ['text-bold', '切换粗体', 'Ctrl+B'], ['text-italic', '切换斜体', 'Ctrl+I'], ['text-underline', '切换下划线', 'Ctrl+U'],
    ['text-accept', '完成文字或歌词编辑', 'Enter'], ['text-cancel', '退出文字或歌词编辑', 'Escape']
  ]) add(id, name, bothText, [key], { run: () => {} });
  for (const [id, name, key] of [
    ['lyric-hold', '按住以锁定歌词音符', 'Tab'], ['lyric-next', '移动到下一歌词位', 'Space'], ['lyric-join', '添加歌词音节连字符', '-'],
    ['lyric-push', '插空并后移歌词', 'Shift+Insert'], ['lyric-pull', '删除并前移歌词', 'Shift+Backspace'],
    ['lyric-backspace', '歌词向前删除或跨位', 'Backspace'], ['lyric-delete', '歌词向后删除或跨位', 'Delete'],
    ['lyric-left', '歌词光标向左', 'ArrowLeft'], ['lyric-right', '歌词光标向右', 'ArrowRight'],
    ['lyric-up', '上一歌词行', 'ArrowUp'], ['lyric-down', '下一歌词行', 'ArrowDown']
  ]) add(id, name, ['lyric'], [key], { run: () => {} });
  return [...entries.values(), ...specialShortcuts].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
}
function updateShortcutHints() {
  for (const control of document.querySelectorAll<HTMLButtonElement>('[data-menu="file"] .menu-items > button')) {
    const command = control.dataset.command ?? control.id;
    const keys = shortcuts.keys(command);
    let keycap = control.querySelector('kbd');
    if (!keycap) {
      keycap = document.createElement('kbd');
      control.append(keycap);
    }
    keycap.textContent = shortcuts.preferred(command) ?? '';
    keycap.hidden = !keys.length;
    control.title = keys.join(' / ');
    if (keys.length) control.setAttribute('aria-keyshortcuts', keys.join(' '));
    else control.removeAttribute('aria-keyshortcuts');
  }
  for (const keycap of document.querySelectorAll<HTMLElement>('button[data-command] > kbd')) {
    if (keycap.closest('[data-menu="file"]')) continue;
    const name = keycap.parentElement!.dataset.command!;
    const first = shortcuts.keys(name)[0];
    keycap.textContent = first ?? '';
    keycap.hidden = !first;
  }
  for (const [id, command, label] of [['input-mode', 'mode', '切换音符输入'], ['save', 'save', '保存工程'],
    ['help', 'help', '入门使用'], ['undo', 'undo', '撤销'], ['redo', 'redo', '重做']] as const) {
    const keys = shortcuts.keys(command);
    const control = button(id);
    control.title = label + (keys.length ? `（${keys.join(' / ')}）` : '');
    if (keys.length) control.setAttribute('aria-keyshortcuts', keys.join(' '));
    else control.removeAttribute('aria-keyshortcuts');
  }
}
const shortcuts = mountShortcuts(shortcutEntries(), downloadSheet, updateShortcutHints);
const helpPages = mountHelpPages(shortcuts.keys, downloadSheet, pages => { void printManual(pages); });
const workbench = mountWorkbench(commands, updateZoom);
updateShortcutHints();
mountNotationTools();
mountResizablePanels();
updateZoom();
button('rewind').onclick = () => {
  stopPlayback();
  const available = (lane: string) => prepared.byLane.get(lane)?.[0]?.at === 0;
  const visible = systemAtIndex(0)?.visible ?? [];
  const selectedLane = playbackFocus().lanes[0];
  const lane = selectedLane && visible.includes(selectedLane) && available(selectedLane) ? selectedLane :
    visible.find(available) ?? score.lanes.find(item => available(item.id))?.id ?? score.lanes[0].id;
  select({ lane, at: 0 });
  desk.scrollTop = 0;
  desk.scrollLeft = 0;
};
get('score').oncontextmenu = event => {
  if (input || inline || drag) return;
  event.preventDefault();
  const target = (event.target as Element).closest<SVGGElement>('[data-element]');
  const sign = (event.target as Element).closest<SVGGElement>('[data-signature]');
  const pick = target ? elementFrom(target) : sign ? signaturePick(sign) : undefined;
  const subject = target ?? sign;
  const bar = pick?.kind === 'pitch' ? prepared.measures.find(measure => pick.at >= measure.start && pick.at < measure.end) : undefined;
  const row = target?.closest<SVGGElement>('.voice-row')?.dataset.lane;
  contextMeasure = bar && row ? { index: bar.index, lane: row } : undefined;
  contextSimilar = pick && subject ? { seed: pick, page: subject.closest<SVGSVGElement>('.sheet')?.dataset.page,
    system: systemStart(subject.closest('.score-system')), lane: row ?? sign?.closest<SVGGElement>('.voice-row')?.dataset.lane,
    existing: effectivePicks() } : undefined;
  if (subject && !subject.classList.contains('picked')) {
    const last = lastClick;
    lastClick = null;
    lastTextClick = null;
    subject.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: event.clientX, clientY: event.clientY }));
    lastClick = last;
    lastTextClick = null;
  }
  const items = [
    { command: 'copy', label: '复制' },
    { command: 'cut', label: '剪切' },
    { command: 'paste', label: '粘贴' },
    ...(editableSelection() || selection?.kind === 'chord-symbol' || selection?.kind === 'route' ? [{ command: 'edit-element', label: '编辑记号' }] : []),
    ...(contextSimilar ? [{ command: 'context-similar', label: '选择相似元素…' }] : []),
    { command: 'properties', label: '选中对象的属性' },
    ...(contextMeasure ? [{ command: 'measure-context', label: '小节属性…' }] : []),
    ...(hasNoteTarget() ? [{ command: 'lyric-edit', label: '谱面填词' }] : []),
    { command: 'delete', label: '删除所选' }
  ];
  workbench.showContext(items, event.clientX, event.clientY);
};
render();
focus();
