import { appearanceOf } from './engrave.js';
import { connected, graceConnected, graceRhythm, notation } from './notation.js';
import type { Token } from './notation.js';
import { boundaryAt, breathShape, endsRepeat, EXTENSION_TEXT_FIELDS, noteVerses, pitchAtSound, QUARTER, rhythmFraction, sameKey, sound, startsRepeat, tick, tickEnd, tonicAt, tupletScale } from './score.js';
import type { GraceSide, Pitch, Score } from './score.js';
import { graceBudgets } from './playback.js';
import { isSwing, scoreTempoMap, tempoLabel, tempoLineEnd } from './tempo.js';
import { chordPitch, noteForDegree, parseChord } from './chord-symbol.js';
import { routeAtStart, routeCaption } from './roadmap.js';
import type { RouteMark } from './roadmap.js';

const esc = (value: unknown) => String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
  .replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!);
const tag = (name: string, value: unknown) => `<${name}>${esc(value)}</${name}>`;
function routeDirection(mark: RouteMark, serial: number, hidden: boolean) {
  const attr = { segno: 'segno', coda: 'coda', dc: 'dacapo', ds: 'dalsegno', tocoda: 'tocoda', fine: 'fine' }[mark.kind];
  const value = mark.kind === 'dc' || mark.kind === 'fine' ? 'yes' : mark.target;
  const sound = `<sound ${attr}="${esc(value)}"/>`;
  if (hidden) return sound;
  const glyph = routeAtStart(mark) ? `<${mark.kind}/>` : tag('words', routeCaption(mark));
  return `<direction placement="above" id="cj-route-${mark.repeat ? 'again' : 'once'}-${serial}"><direction-type>${glyph}</direction-type>${sound}</direction>`;
}
const names = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const semitones = [0, 2, 4, 5, 7, 9, 11];
const mod = (value: number, base: number) => (value % base + base) % base;
const values = ['whole', 'half', 'quarter', 'eighth', '16th', '32nd', '64th', '128th'].flatMap((type, index) =>
  [0, 1, 2].map(dots => ({ type, dots, length: 384 / 2 ** index * (2 - 2 ** -dots) })))
  .sort((a, b) => b.length - a.length);
const dynamicNames = new Set(['p', 'pp', 'ppp', 'pppp', 'ppppp', 'pppppp', 'f', 'ff', 'fff', 'ffff', 'fffff', 'ffffff',
  'mp', 'mf', 'sf', 'sfp', 'sfpp', 'fp', 'rf', 'rfz', 'sfz', 'sffz', 'fz', 'n', 'pf', 'sfzp']);
const accidentals = ['triple-flat', 'flat-flat', 'flat', 'natural', 'sharp', 'double-sharp', 'triple-sharp'];
const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;

interface WrittenNote { token: Token; at: number; end: number; type?: string; dots: number; first: boolean; last: boolean; scale?: number }
export function exportMusicXML(score: Score) {
  const prepared = notation(score);
  const { measures, links } = prepared;
  const factors = measures.map(() => 1);
  const includeTime = (bar: number, at: number) => {
    const [, denominator] = rhythmFraction(at - measures[bar].start);
    const old = factors[bar];
    factors[bar] = old / gcd(old, denominator) * denominator;
    if (factors[bar] * QUARTER > 1e9) throw Error('该小节的多连音精度超出 MusicXML 可交换范围。');
  };
  for (const token of prepared.tokens) {
    includeTime(token.measure, token.at); includeTime(token.measure, tickEnd(token));
    for (const at of token.tail) includeTime(token.measure, at);
  }
  const includeAnchor = (at: number) => {
    const bar = measures.find(bar => at >= bar.start && at < bar.end);
    if (bar) includeTime(bar.index, at);
  };
  for (const span of score.spans) {
    if (span.fromAt !== undefined) includeAnchor(span.fromAt);
    if (span.toAt !== undefined) includeAnchor(span.toAt);
  }
  const warnings = new Set<string>();
  let extensionDirections = 0;
  let graceSerial = 0;
  let chordSerial = 0;
  const chordLabels: Record<string, { text: string; actual?: string }> = {};
  let routeSerial = 0;
  for (const symbol of score.chordSymbols ?? []) includeAnchor(symbol.at);
  const parts = score.lanes.filter(lane => !lane.parent);
  const importedLaneId = new Map(parts.flatMap((main, index) => [[main.id, `xml-${index}`] as const, ...score.lanes.filter(lane => lane.parent === main.id)
    .map((lane, voice) => [lane.id, `xml-${index}:1/${voice + 2}`] as const)]));
  const tempoAt = scoreTempoMap(score);
  const tempoDirections: { at: number; phase: number; content: string; sound?: number; swing?: string; lane?: string }[] = [];
  const tempoMarks = score.tempoMarks ?? [];
  const tempoLines = score.tempoLines ?? [];
  const markedTimes = new Set(tempoMarks.filter(mark => mark.appearance?.playback !== false && !isSwing(mark)).map(mark => mark.at));
  const units = Object.fromEntries(values.filter(value => !value.dots).map(value => [value.length, value.type]));
  const beatUnit = (unit: number, dots: number) => tag('beat-unit', units[unit]) + '<beat-unit-dot/>'.repeat(dots);
  const metro = (unit: number, dots: number, bpm: string | number) => `<metronome>${beatUnit(unit, dots)}${tag('per-minute', bpm)}</metronome>`;
  if (!markedTimes.has(0)) tempoDirections.push({ at: 0, phase: 1, content: metro(QUARTER, 0, score.tempo), sound: score.tempo });
  for (const mark of tempoMarks) {
    const visible = mark.appearance?.visible !== false;
    if (isSwing(mark)) {
      const denominator = Number.isInteger(mark.ratio) ? 1 : 100;
      const swing = mark.kind === 'straight' ? '<straight/>' :
        tag('first', Math.round(mark.ratio * denominator)) + tag('second', denominator) + tag('swing-type', units[mark.swingUnit]);
      tempoDirections.push({ at: mark.at, phase: 1, content: visible ? tag('words', tempoLabel(mark)) : '', swing: mark.appearance?.playback === false ? undefined : '<swing>' + swing + '</swing>' });
      continue;
    }
    const content = !visible ? '' : mark.kind === 'modulation' ?
      '<metronome>' + beatUnit(mark.unit, mark.dots) + beatUnit(mark.rightUnit, mark.rightDots) + '</metronome>' :
      mark.kind === 'metronome' ? (mark.label ? tag('words', mark.label) : '') + metro(mark.unit, mark.dots, mark.writtenRate ?? mark.bpm) :
        tag('words', tempoLabel(mark));
    tempoDirections.push({ at: mark.at, phase: 1, sound: mark.appearance?.playback === false ? undefined : tempoAt(mark.at), content });
  }
  for (const line of tempoLines) {
    const enabled = line.playback !== false;
    const to = enabled ? tempoLineEnd(score, line) : line.to;
    const printedEnd = line.lane ? line.to : to;
    const show = line.appearance?.visible !== false;
    const dashes = show && line.dashVisible !== false;
    if (show) tempoDirections.push({ at: line.from, lane: line.lane, phase: 2, content: tag('words', line.label || line.kind) +
      (dashes ? '</direction-type><direction-type><dashes type="start" number="1"/>' : '') });
    if (dashes) tempoDirections.push({ at: printedEnd, lane: line.lane, phase: 0, content: '<dashes type="stop" number="1"/>' });
    if (enabled && !markedTimes.has(to)) tempoDirections.push({ at: to, phase: 0, content: '', sound: tempoAt(to, false) });
    const step = Math.max(1, Math.round((to - line.from) / 8));
    for (let at = line.from + step; enabled && at < to; at += step)
      if (!markedTimes.has(at)) tempoDirections.push({ at, phase: 1, content: '', sound: tempoAt(at) });
  }
  tempoDirections.sort((a, b) => a.at - b.at || a.phase - b.phase);
  for (const item of tempoDirections) includeAnchor(item.at);
  for (const ending of score.endings ?? []) {
    if (ending.fromAt !== undefined) includeAnchor(ending.fromAt);
    if (ending.toAt !== undefined) includeAnchor(ending.toAt);
  }
  const xmlTempo = (value: number) => String(Math.round(value * 1000) / 1000);
  const syllables = new Map<string, string>();
  for (const tokens of prepared.byLane.values()) {
    const joining = new Set<number>();
    for (const token of tokens) if (!token.continuation) for (const verse of noteVerses(token.note)) if (verse.text) {
      const prior = joining.has(verse.number);
      if (prior || verse.syllabicNext) syllables.set(`${token.id}:${verse.number}`,
        verse.syllabicNext ? prior ? 'middle' : 'begin' : 'end');
      if (verse.syllabicNext) joining.add(verse.number);
      else joining.delete(verse.number);
    }
  }
  const outgoing = new Map<string, { xml: string; pitch?: number }[]>();
  const incoming = new Map<string, { xml: string; pitch?: number }[]>();
  const tremolos = new Map<string, { type: 'start' | 'stop'; strokes: number }>();
  const wedges = new Map<string, { at: number; xml: string; id?: string }[]>();
  let dynamicSerial = 0;
  const active = new Map<string, { end: number; number: number }[]>();
  const assignNumber = (key: string, at: number, end: number) => {
    const used = (active.get(key) ?? []).filter(item => item.end >= at);
    const number = Array.from({ length: 16 }, (_, index) => index + 1).find(value => !used.some(item => item.number === value));
    if (!number) throw Error('同一声部有太多重叠连线，无法可靠导出。');
    used.push({ end, number }); active.set(key, used);
    return number;
  };
  const append = <Item>(map: Map<string, Item[]>, key: string, item: Item) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  };
  for (const link of [...links].sort((a, b) => (a.fromAt ?? a.from.at) - (b.fromAt ?? b.from.at))) {
    const lane = link.from.note.lane;
    if ((link.from.note.unpitched || link.to.note.unpitched) && ['tie', 'slide', 'tremolo'].includes(link.kind)) continue;
    if (link.kind === 'tie' || link.kind === 'slur') {
      const slur = link.kind === 'slur';
      const number = slur ? ` number="${assignNumber(lane + ':slur', link.from.at, link.to.at)}"` : '';
      const name = slur ? 'slur' : 'tied';
      append(outgoing, link.from.id, { xml: `<${name} type="start"${number}/>`, pitch: link.pitch });
      append(incoming, link.to.id, { xml: `<${name} type="stop"${number}/>`, pitch: link.targetPitch });
    } else if (link.kind === 'slide') {
      const number = assignNumber(lane + ':slide', link.from.at, link.to.at);
      append(outgoing, link.from.id, { xml: `<slide type="start" number="${number}"/>`, pitch: link.pitch });
      append(incoming, link.to.id, { xml: `<slide type="stop" number="${number}"/>`, pitch: link.targetPitch });
    } else if (link.kind === 'tremolo') {
      tremolos.set(link.from.id, { type: 'start', strokes: link.strokes ?? 3 });
      tremolos.set(link.to.id, { type: 'stop', strokes: link.strokes ?? 3 });
    } else {
      const start = link.fromAt ?? link.from.at;
      const end = link.toAt ?? link.to.at;
      const number = assignNumber(lane + ':wedge', start, end);
      const span = link.source === undefined ? undefined : score.spans[link.source];
      const caption = span?.dynamicText;
      if (caption !== undefined) {
        const words = caption ? tag('words', caption) + '</direction-type><direction-type>' : '';
        append(wedges, lane, { at: start, xml: words + `<dashes type="start" number="${number}"/>`,
          id: `cj-dyn-${link.kind}-${span?.dynamicTarget ?? 'auto'}-${++dynamicSerial}` });
        append(wedges, lane, { at: end, xml: `<dashes type="stop" number="${number}"/>`, id: `cj-dyn-stop-${dynamicSerial}` });
      } else {
        append(wedges, lane, { at: start, xml: `<wedge type="${link.kind}" number="${number}"/>`,
          id: span?.dynamicTarget ? `cj-wedge-${span.dynamicTarget}-${++dynamicSerial}` : undefined });
        append(wedges, lane, { at: end, xml: `<wedge type="stop" number="${number}"/>` });
      }
    }
  }

  const content = parts.map((main, partIndex) => {
    const lanes = [main, ...score.lanes.filter(lane => lane.parent === main.id)];
    return `<part id="P${partIndex + 1}">${measures.map((measure, index) => {
      const prior = measures[index - 1];
      const opening = boundaryAt(score, index);
      const closing = boundaryAt(score, index + 1);
      const openingEndings = (score.endings ?? []).filter(ending => ending.start === index && ending.fromAt === undefined);
      const closingEndings = (score.endings ?? []).filter(ending => ending.end === index && ending.toAt === undefined);
      const endingTag = (ending: typeof openingEndings[number], type: string) =>
        `<ending number="${ending.passes.join(',')}" type="${type}"${ending.appearance?.visible === false ? ' print-object="no"' : ''}/>`;
      const openingFermata = !partIndex && !index && opening.fermata && opening.fermataAppearance?.visible !== false ? '<fermata/>' : '';
      const closingFermata = !partIndex && closing.fermata && closing.fermataAppearance?.visible !== false ? '<fermata/>' : '';
      const left = (startsRepeat(opening.style) || openingEndings.length || openingFermata)
        ? `<barline location="left">${startsRepeat(opening.style) ? '<bar-style>heavy-light</bar-style>' : ''}${
          openingFermata}${openingEndings.map(ending => endingTag(ending, 'start')).join('')}${startsRepeat(opening.style) ? '<repeat direction="forward"/>' : ''}</barline>` : '';
      const barStyle = endsRepeat(closing.style) ? 'light-heavy' : closing.appearance?.visible === false && !startsRepeat(closing.style)
        ? 'none' : closing.style === 'final' ? 'light-heavy' : closing.style === 'double' ? 'light-light' : '';
      const right = barStyle || closingEndings.length || closingFermata
        ? `<barline location="right">${barStyle ? tag('bar-style', barStyle) : ''}${closingFermata}${closingEndings.map(ending => endingTag(ending, ending.open ? 'discontinue' : 'stop')).join('')}${
          endsRepeat(closing.style) ? `<repeat direction="backward" times="${1 + (closing.repeats ?? 0)}"${
            score.measures.some(bar => bar.route?.some(mark => mark.repeat)) ? ' after-jump="yes"' : ''}/>` : ''}</barline>` : '';
      const factor = factors[index];
      const xmlTicks = (duration: number) => Math.round(duration * factor);
      const attributes = [
        !index || factor !== factors[index - 1] ? tag('divisions', QUARTER * factor) : '',
        !prior || !sameKey(prior.key, measure.key) || score.measures[index].key ? `<key${measure.keyHidden || measure.keyAppearance?.visible === false ? ' print-object="no"' : ''}>${tag('fifths', measure.key.fifths)}${tag('mode', measure.key.degree === 6 ? 'minor' : 'major')}</key>` : '',
        !prior || prior.meter !== measure.meter ? `<time${measure.meterHidden || measure.meterAppearance?.visible === false ? ' print-object="no"' : ''}>${tag('beats', measure.meter.groups.some(group => group > 1) ? measure.meter.groups.join('+') : measure.meter.numerator)}${tag('beat-type', measure.meter.denominator)}</time>` : '',
        !index ? `<clef><sign>${main.octave <= 3 ? 'F' : 'G'}</sign><line>${main.octave <= 3 ? 4 : 2}</line></clef>` : ''
      ].join('');
      const print = opening.break ? `<print new-${opening.break === 'line' ? 'system' : 'page'}="yes"/>` : '';
      const length = measure.end - measure.start;
      const implicit = length !== measure.meter.numerator * QUARTER * 4 / measure.meter.denominator ? ' implicit="yes"' : '';
      let at = measure.start;
      let body = '';
      const inside = (score.endings ?? []).flatMap(ending => {
        const marks: { at: number; xml: string }[] = [];
        if (ending.end === index && ending.toAt !== undefined)
          marks.push({ at: ending.toAt, xml: endingTag(ending, ending.open ? 'discontinue' : 'stop') });
        if (ending.start === index && ending.fromAt !== undefined)
          marks.push({ at: ending.fromAt, xml: endingTag(ending, 'start') });
        return marks;
      }).sort((a, b) => a.at - b.at || Number(a.xml.includes('type="start"')) - Number(b.xml.includes('type="start"')));
      for (const [voiceIndex, lane] of lanes.entries()) {
        const voice = voiceIndex + 1;
        const tokens = (prepared.byLane.get(lane.id) ?? []).filter(token => token.measure === index);
        if (!tokens.length) continue;
        const spell = (pitch: Pitch, sourceTonic: number) => {
          const midi = sound(pitch, sourceTonic);
          const degree = sourceTonic === measure.tonic ? pitch.degree : pitchAtSound(midi, measure.tonic).degree;
          const step = mod(degree - 1 + measure.key.fifths * 4, 7);
          const octave = Math.round((midi - semitones[step]) / 12) - 1;
          const alter = midi - (octave + 1) * 12 - semitones[step];
          if (!Number.isInteger(midi) || octave < 0 || octave > 9 || Math.abs(alter) > 3)
            throw Error(`${lane.name} · 第 ${measure.number} 小节有无法无损表示的音高，未导出。`);
          return { alter, pitch: `<pitch>${tag('step', names[step])}${alter ? tag('alter', alter) : ''}${tag('octave', octave)}</pitch>` };
        };
        const position = (target: number) => {
          if (target === at) return '';
          const type = target > at ? 'forward' : 'backup';
          const result = `<${type}>${tag('duration', xmlTicks(Math.abs(target - at)))}${type === 'forward' ? tag('voice', voice) : ''}</${type}>`;
          at = target;
          return result;
        };
        let nextEnding = 0;
        const writeEndingsThrough = (tick: number) => {
          if (voice !== 1) return;
          while (inside[nextEnding]?.at <= tick) {
            const mark = inside[nextEnding++];
            body += position(mark.at) + `<barline location="middle"><bar-style>none</bar-style>${mark.xml}</barline>`;
          }
        };
        body += position(measure.start);
        for (const symbol of score.chordSymbols ?? []) {
          if (symbol.lane !== lane.id || symbol.at < measure.start || symbol.at >= measure.end) continue;
          const chord = parseChord(symbol.actual ?? symbol.text);
          const id = `cj-harmony-${voice}-${++chordSerial}`;
          const offset = symbol.at > measure.start ? tag('offset', xmlTicks(symbol.at - measure.start)) : '';
          const hidden = appearanceOf(score, { kind: 'chord-symbol', id: symbol.id })?.visible === false;
          if (!chord) {
            body += `<direction id="${id}" placement="above"><direction-type><words${hidden ? ' print-object="no"' : ''}>${esc(symbol.text)}</words></direction-type>${offset}${tag('voice', voice)}</direction>`;
            warnings.add('无法识别的和弦代号按说明文字导出。');
            continue;
          }
          if (symbol.actual || chord.mode === 'degree' || chord.text !== symbol.text) chordLabels[id] = { text: symbol.text, actual: symbol.actual };
          const pitchXml = (type: 'root' | 'bass', name: string) => {
            const { step, alter } = chordPitch(name);
            return `<${type}>${tag(type + '-step', step)}${alter ? tag(type + '-alter', alter) : ''}</${type}>`;
          };
          const root = chord.mode === 'degree' ? `<numeral>${tag('numeral-root', chord.root.at(-1))}${
            chord.root.length > 1 ? tag('numeral-alter', (chord.root.startsWith('#') ? 1 : -1) * (chord.root.length - 1)) : ''
          }<numeral-key>${tag('numeral-fifths', measure.key.fifths)}<numeral-mode>major</numeral-mode></numeral-key></numeral>`
            : chord.mode === 'none' ? '<root><root-step text="">C</root-step></root>' : pitchXml('root', chord.root);
          const bass = 'bass' in chord && chord.bass ? pitchXml('bass',
            chord.mode === 'degree' ? noteForDegree(chord.bass, measure.key.fifths, false) : chord.bass) : '';
          const extra = chord.quality === 'add9' ? '<degree><degree-value>9</degree-value><degree-alter>0</degree-alter><degree-type>add</degree-type></degree>' : '';
          body += `<harmony id="${id}"${
            hidden ? ' print-object="no"' : ''
          }>${root}<kind text="${esc(chord.quality || (chord.mode === 'none' ? 'N.C.' : ''))}">${chord.kind}</kind>${bass}${extra}${
            offset}</harmony>`;
        }
        for (const item of tempoDirections) {
          if (item.lane ? item.lane !== lane.id : partIndex !== 0 || voice !== 1) continue;
          if (item.at < measure.start || item.at >= measure.end && !(item.at === measure.end && index === measures.length - 1)) continue;
          const offset = xmlTicks(item.at - measure.start);
          const soundAttr = item.sound === undefined ? '' : ` tempo="${xmlTempo(item.sound)}"`;
          if (!item.content && (item.sound !== undefined || item.swing)) body += `<sound${soundAttr}>${item.swing ?? ''}${offset ? tag('offset', offset) : ''}</sound>`;
          else if (item.content) body += `<direction placement="above"><direction-type>${item.content.replace('</words><metronome>', '</words></direction-type><direction-type><metronome>')}</direction-type>${
            offset ? `<offset sound="yes">${offset}</offset>` : ''}${item.swing ? `<sound>${item.swing}</sound>` : soundAttr ? `<sound${soundAttr}/>` : ''}</direction>`;
        }
        const directions: { at: number; xml: string; id?: string }[] = (wedges.get(lane.id) ?? []).filter(item =>
          (item.at >= measure.start && item.at < measure.end) || item.at === measure.end && index === measures.length - 1)
          .map(item => ({ at: item.at, xml: item.xml, id: item.id }));
        for (const token of tokens) if (!token.continuation) {
          if (token.note.dynamic) {
            const words = token.note.dynamic.trim().split(/\s+/).filter(Boolean);
            const content = words.every(word => dynamicNames.has(word)) ? words.map(word => `<${word}/>`).join('') : tag('other-dynamics', token.note.dynamic);
            directions.push({ at: token.at, xml: `<dynamics>${content}</dynamics>` });
          }
          if (token.note.text) directions.push({ at: token.at, xml: tag('words', token.note.text) });
          if (token.note.interNoteText) directions.push({ at: token.at, xml: tag('words', token.note.interNoteText) });
          if (token.note.rehearsal) directions.push({ at: token.at, xml: tag('rehearsal', token.note.rehearsal) });
        }
        for (const token of tokens) for (const at of token.tail) {
          const extension = at - token.note.at;
          const words = token.note.extensionText?.[extension];
          if (!words) continue;
          for (const field of EXTENSION_TEXT_FIELDS) {
            const caption = words[field];
            if (!caption) continue;
            const side = appearanceOf(score, { kind: 'mark', field, id: token.note.id, extension })?.noteSide ?? 'left';
            directions.push({ at, xml: tag(field === 'rehearsal' ? 'rehearsal' : 'words', caption),
              id: `shupu-extension-${field}-${side}-${++extensionDirections}` });
          }
        }
        for (const direction of directions.sort((a,b) => a.at - b.at))
          body += `<direction placement="above"${direction.id ? ` id="${direction.id}"` : ''}><direction-type>${direction.xml}</direction-type>${
            direction.at > measure.start ? tag('offset', xmlTicks(direction.at - measure.start)) : ''}${tag('voice', voice)}</direction>`;
        const written: WrittenNote[] = [];
        for (const token of tokens) {
          let start = token.at;
          const end = tickEnd(token);
          const scale = tupletScale(token.tuplet);
          while (start < end) {
            const value = values.find(entry => entry.length * scale <= end - start + 1e-7);
            if (!value) {
              warnings.add(`${lane.name} · 第 ${measure.number} 小节有非常规书写时值，已保留其实际时长。`);
              written.push({ token, at: start, end, type: token.tuplet ? units[token.tuplet.unit] : undefined,
                dots: 0, first: start === token.at, last: true, scale: token.tuplet ? (end - start) / token.tuplet.unit : undefined });
              break;
            }
            const finish = Math.abs(start + value.length * scale - end) < 1e-7 ? end : tick(start + value.length * scale);
            if (finish <= start) throw Error('多连音时值无法无损导出。');
            written.push({ token, at: start, end: finish, type: value.type, dots: value.dots,
              first: start === token.at, last: finish === end });
            start = finish;
          }
        }
        for (const [pieceIndex, piece] of written.entries()) {
          const { token } = piece;
          writeEndingsThrough(piece.at);
          body += position(piece.at);
          const prev = written[pieceIndex - 1];
          const next = written[pieceIndex + 1];
          const first = piece.first && !token.continuation;
          const ornament = (side: GraceSide) => {
            const group = token.note.grace?.[side];
            if (!group?.notes.length) return '';
            const source = tonicAt(score, token.note.at);
            const percent = +Math.min(100, 100 * graceBudgets(token.note)[side] / (piece.end - piece.at)).toFixed(6);
            const rhythm = graceRhythm(group.notes, measure.pickup ? measure.meter : measure.actualMeter ?? measure.meter);
            return group.notes.map((event, noteIndex) => event.pitches.map((pitch, pitchIndex) => {
              const written = spell(pitch, source);
              const borrow = side === 'before' ? 'following' : 'previous';
              const column = rhythm[noteIndex];
              const prior = rhythm[noteIndex - 1], next = rhythm[noteIndex + 1];
              let beams = '';
              if (!pitchIndex) for (let level = 1; level <= column.bars; level++) {
                const into = graceConnected(prior, column, level);
                const out = graceConnected(column, next, level);
                const hook = level > 1 && graceConnected(prior, column, 1) ? 'backward hook' :
                  level > 1 && graceConnected(column, next, 1) ? 'forward hook' : '';
                const type = into && out ? 'continue' : into ? 'end' : out ? 'begin' : hook;
                if (type) beams += `<beam number="${level}">${type}</beam>`;
              }
              let marks = '', soundTies = '';
              for (const [i, link] of (group.links ?? []).entries()) {
                const type = link.from === event.id && link.fromPitch === pitchIndex ? 'start' : link.to === event.id && link.toPitch === pitchIndex ? 'stop' : '';
                if (!type) continue;
                if (link.kind === 'tie') {
                  soundTies += `<tie type="${type}"/>`;
                  marks += `<tied type="${type}"/>`;
                } else marks += `<slur type="${type}" number="${16 - i % 16}"/>`;
              }
              if (!pitchIndex) {
                const arts = [event.staccato && '<staccato/>', event.accent && '<accent/>', event.tenuto && '<tenuto/>',
                  event.breath && tag('breath-mark', event.breath)].filter(Boolean).join('');
                if (event.fermata) marks += '<fermata/>';
                if (arts) marks += `<articulations>${arts}</articulations>`;
              }
              return `<note id="cj-grace-${side}-${++graceSerial}${event.beam ? '-' + event.beam : ''}"><grace slash="yes"${noteIndex === 0 && pitchIndex === 0 ?
                ` steal-time-${borrow}="${percent}"` : ''}/>${pitchIndex ? '<chord/>' : ''}${written.pitch}${soundTies}${tag('voice', voice)}${
                tag('type', units[event.value])}${'<dot/>'.repeat(event.dots ?? 0)}${pitch.courtesy ?
                `<accidental cautionary="yes">${accidentals[written.alter + 3]}</accidental>` : ''}${beams}${marks ? `<notations>${marks}</notations>` : ''}</note>`;
            }).join('')).join('');
          };
          if (first) body += ornament('before');
          const groups = (score.tuplets ?? []).filter(group => group.lane === lane.id && group.at <= piece.at && tickEnd(group) >= piece.end)
            .sort((a, b) => a.at - b.at || b.length - a.length);
          if (groups.length > 16) throw Error('此处超过 MusicXML 的 16 层多连音限制，请保留数谱工程。');
          const tupletMarks = groups.map((group, index) => {
            const unit = units[group.unit];
            const parent = (score.tuplets ?? []).find(item => item.id === group.parent);
            const [normal, actual] = rhythmFraction(tupletScale(group) / tupletScale(parent));
            const show = appearanceOf(score, { kind: 'tuplet', id: group.id })?.visible !== false;
            return {
              open: piece.at === group.at ? `<tuplet type="start" number="${index + 1}" bracket="${show ? 'yes' : 'no'}" show-number="${!show ? 'none' : actual === normal ? 'both' : 'actual'}">` +
                `<tuplet-actual>${tag('tuplet-number', group.count)}${tag('tuplet-type', unit)}</tuplet-actual>` +
                (Number.isInteger(group.count * normal / actual)
                  ? `<tuplet-normal>${tag('tuplet-number', group.count * normal / actual)}${tag('tuplet-type', unit)}</tuplet-normal>` : '') + '</tuplet>' : '',
              close: piece.end === tickEnd(group) ? `<tuplet type="stop" number="${index + 1}"/>` : ''
            };
          });
          const pair = tremolos.get(token.id);
          const pairValue = values.find(value => value.type === piece.type && value.dots === 0)?.length;
          const pairWritten = pairValue && units[pairValue * 2];
          const [normal, actual] = rhythmFraction((piece.scale ?? tupletScale(token.tuplet)) / (pair && pairWritten ? 2 : 1));
          const modification = groups.length || pair && pairWritten ? `<time-modification>${tag('actual-notes', actual)}${tag('normal-notes', normal)}</time-modification>` : '';
          let beams = '';
          for (let level = 1; level <= token.bars; level++) {
            const into = prev && prev.token !== token && connected(prev.token, token, level);
            const out = next && next.token !== token && connected(token, next.token, level);
            const hook = prev && connected(prev.token, token, 1) ? 'backward hook' : next && connected(token, next.token, 1) ? 'forward hook' : '';
            const value = into && out ? 'continue' : into ? 'end' : out ? 'begin' : level > 1 ? hook : '';
            if (value) beams += `<beam number="${level}">${value}</beam>`;
          }
          for (let pitchIndex = 0; pitchIndex < (token.note.unpitched ? 1 : Math.max(1, token.note.pitches.length)); pitchIndex++) {
            const pitch = token.note.unpitched ? undefined : token.note.pitches[pitchIndex];
            const visible = appearanceOf(score, { kind: 'pitch', id: token.note.id, at: token.at, index: pitchIndex })?.visible !== false;
            let spelling = token.note.unpitched ? '<unpitched/>' : '<rest/>';
            let cautionary = '';
            if (pitch) {
              const written = spell(pitch, tonicAt(score, token.note.at));
              spelling = written.pitch;
              const alter = written.alter;
              if (first && pitch.courtesy) cautionary = `<accidental cautionary="yes">${accidentals[alter + 3]}</accidental>`;
              else if (first && (pitch.signStyle === 'show' || pitch.natural)) cautionary = tag('accidental', accidentals[alter + 3]);
            }
            const relation = (map: typeof outgoing) => (map.get(token.id) ?? [])
              .filter(item => item.pitch === undefined ? pitchIndex === 0 : item.pitch === pitchIndex).map(item => item.xml);
            const stops = piece.first ? relation(incoming) : pitch ? ['<tied type="stop"/>'] : [];
            const starts = (piece.first ? relation(outgoing).filter(mark => !mark.startsWith('<tied')) : [])
              .concat(piece.last ? relation(outgoing).filter(mark => mark.startsWith('<tied')) : pitch ? ['<tied type="start"/>'] : []);
            const tie = (type: string, list: string[]) => list.some(item => item.startsWith('<tied')) ? `<tie type="${type}"/>` : '';
            const articulations = first && !pitchIndex ? [
              token.note.staccato && '<staccato/>', token.note.accent && '<accent/>',
              token.note.tenuto && '<tenuto/>', token.note.breath && tag('breath-mark', breathShape(token.note.breath))
            ].filter(Boolean).join('') : '';
            let ornaments = '';
            if (first && !pitchIndex) for (const [kind, item] of Object.entries(token.note.ornaments ?? {})) {
              const name = { trill: 'trill-mark', 'upper-mordent': 'inverted-mordent', 'lower-mordent': 'mordent',
                turn: item.delayed ? 'delayed-turn' : 'turn', 'inverted-turn': item.delayed ? 'delayed-inverted-turn' : 'inverted-turn', tremolo: '' }[kind];
              ornaments += kind === 'tremolo' ? `<tremolo type="single">${item.strokes ?? 3}</tremolo>` :
                `<${name}${kind === 'trill' && item.fromUpper ? ' start-note="upper"' : ''}/>`;
              if (kind === 'trill' && item.wave) ornaments += '<wavy-line type="start" number="1"/><wavy-line type="stop" number="1"/>';
              for (const [side, value] of [['above', item.upper], ['below', item.lower]] as const)
                if (value !== undefined) ornaments += `<accidental-mark placement="${side}">${accidentals[value + 3]}</accidental-mark>`;
            }
            if (pair && !pitchIndex) ornaments += `<tremolo type="${pair.type}">${pair.strokes}</tremolo>`;
            const marks = [...stops, ...starts].join('') + (first && !pitchIndex && token.note.fermata ? '<fermata/>' : '')
              + (ornaments ? `<ornaments>${ornaments}</ornaments>` : '')
              + (articulations ? `<articulations>${articulations}</articulations>` : '') +
              (!pitchIndex ? tupletMarks.map(mark => mark.open).join('') + [...tupletMarks].reverse().map(mark => mark.close).join('') : '');
            const lyrics = first && !pitchIndex ? noteVerses(token.note).map(verse => {
              if (!verse.text && !verse.extend) return '';
              const visible = appearanceOf(score, { kind: 'mark', id: token.note.id, field: 'lyric', verse: verse.number })?.visible !== false;
              const syllabic = syllables.get(`${token.id}:${verse.number}`);
              return `<lyric number="${verse.number}"${visible ? '' : ' print-object="no"'}>${
                verse.text ? (syllabic ? tag('syllabic', syllabic) : '') + tag('text', verse.text) : ''}${verse.extend ? `<extend type="${verse.extend}"/>` : ''}</lyric>`;
            }).join('') : '';
            const rhythmStop = token.note.unpitched && (!first || token.note.unpitchedContinuation) ? '<tie type="stop"/>' : '';
            const rhythmStart = token.note.unpitched && (!piece.last || tickEnd(token) < tickEnd(token.note) ||
              next?.token.note.unpitchedContinuation) ? '<tie type="start"/>' : '';
            body += `<note${visible ? '' : ' print-object="no"'}>${pitchIndex ? '<chord/>' : ''}${spelling}${
              tag('duration', xmlTicks(piece.end - piece.at))}${tie('stop', stops)}${tie('start', starts)}${rhythmStop}${rhythmStart}${tag('voice', voice)}${
              pair && pairWritten ? tag('type', pairWritten) : piece.type ? tag('type', piece.type) : ''}${'<dot/>'.repeat(piece.dots)}${cautionary}${modification}${token.note.unpitched ? '<notehead>x</notehead>' : ''}${pitchIndex ? '' : beams}${
              marks ? `<notations>${marks}</notations>` : ''}${lyrics}</note>`;
          }
          at = piece.end;
          if (piece.last && tickEnd(token) === tickEnd(token.note)) body += ornament('after');
        }
        writeEndingsThrough(measure.end);
      }
      const route = !partIndex ? measure.route ?? [] : [];
      const exportRoute = (start: boolean) => route.filter(mark => routeAtStart(mark) === start).map(mark =>
        routeDirection(mark, ++routeSerial, appearanceOf(score, { kind: 'route', id: mark.id, index })?.visible === false)).join('');
      return `<measure number="${esc(measure.number)}"${implicit}>${print}${left}${attributes ? `<attributes>${attributes}</attributes>` : ''}${exportRoute(true)}${body}${exportRoute(false)}${right}</measure>\n`;
    }).join('')}</part>`;
  }).join('\n');
  const allAppearance = [...Object.values(score.appearance ?? {}), ...score.spans.map(span => span.appearance),
    ...Object.values(score.boundaries ?? {}).map(boundary => boundary.appearance), ...(score.endings ?? []).map(ending => ending.appearance)];
  if (allAppearance.some(item => item?.placement) || Object.keys(score.columns ?? {}).length)
    warnings.add('手调的简谱位置保存在工程和 PDF 中。MusicXML 使用目标软件的布局。');
  if (score.endings?.some(ending => ending.fromAt !== undefined || ending.toAt !== undefined))
    warnings.add('小节内的房子按实际拍位导出。请在目标软件中核对它的端点和播放范围。');
  if (allAppearance.some(item => item?.layout === false)) warnings.add('不参与排版的设置、简谱弧形及本软件的精确分页不能在其他软件中保证保留。');
  if (allAppearance.some(item => item?.visible === false)) warnings.add('隐藏音符与歌词写入 MusicXML；其他隐藏记号可能在目标软件中显示，音乐元素不会删除。');
  if (score.notes.some(note => note.lyricFlow) || score.spans.some(span => span.lyricFlow)) warnings.add('歌词导航是数谱的编辑设置，不写入 MusicXML。');
  const credits = [['composer', score.composer], ['credit', score.credit], ['lyricist', score.lyricist], ['arranger', score.arranger]]
    .filter(([, text]) => !!text).map(([type, text]) => `<creator type="${type}">${esc(text)}</creator>`).join('') +
    (score.copyright ? tag('rights', score.copyright) : '');
  const actual = Object.fromEntries(score.measures.flatMap((measure, index) => measure.actualMeter || measure.pickup !== undefined || !index && (measure.meter || measure.key || score.titleSignatures) ?
    [[index, { meter: measure.actualMeter, pickup: measure.pickup, firstMeter: !index && !!measure.meter, firstKey: !index && !!measure.key,
      titleSignatures: !index ? score.titleSignatures : undefined }]] : []));
  const metadata = [Object.keys(actual).length ? `<miscellaneous-field name="shupu-bar-settings">${esc(JSON.stringify(actual))}</miscellaneous-field>` : '',
    Object.keys(chordLabels).length ? `<miscellaneous-field name="shupu-chord-labels">${esc(JSON.stringify(chordLabels))}</miscellaneous-field>` : '',
    tempoMarks.length || tempoLines.length ? `<miscellaneous-field name="shupu-tempo">${esc(JSON.stringify({ base: score.tempo, marks: tempoMarks, lines: tempoLines.map(line => ({ ...line, lane: line.lane && importedLaneId.get(line.lane) })) }))}</miscellaneous-field>` : ''].join('');
  const details = metadata ? `<miscellaneous>${metadata}</miscellaneous>` : '';
  if (tempoLines.length) warnings.add('渐快渐慢的播放速度按若干时间点写入 MusicXML。数谱重新导入时恢复连续渐变。');
  if (extensionDirections) warnings.add('增时线文字按实际拍位写入；其他软件可能显示在所属音符附近。保留方向记号的 ID 后，数谱可识别原来的文字类型与挂载位置。');
  return {
    xml: `<?xml version="1.0" encoding="UTF-8"?>\n${extensionDirections ? '<!-- Choral Jianpu extension-text IDs preserve the mark kind and side; the MusicXML offset gives its beat. -->\n' : ''}<score-partwise version="4.0">\n<work>${tag('work-title', score.title)}</work>${
      tag('movement-title', score.title)}${credits || details ? `<identification>${credits}${details}</identification>` : ''}${
      score.subtitle ? `<credit page="1"><credit-type>subtitle</credit-type>${tag('credit-words', score.subtitle)}</credit>` : ''}\n<part-list>${
      parts.map((part, index) => `<score-part id="P${index + 1}">${tag('part-name', part.name)}${part.shortName ? tag('part-abbreviation', part.shortName) : ''}</score-part>`).join('')}</part-list>\n${content}\n</score-partwise>\n`,
    warnings: [...warnings]
  };
}
