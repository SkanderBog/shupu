import { noteVerses } from './score.js';
import type { LyricFlow, Score } from './score.js';
import type { notation, Token } from './notation.js';

type Prepared = ReturnType<typeof notation>;
export interface LyricGroup { first: number; positions: number[]; sources: number[]; flow: LyricFlow }
const splitter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export const graphemes = (text: string) => Array.from(splitter.segment(text), item => item.segment);
export const isPunctuation = (character: string) => /^\p{P}/u.test(character);
export const advancesSyllable = (character: string) => /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(character);

export function lyricGroups(score: Score, prepared: Prepared, lane: string): LyricGroup[] {
  const tokens = prepared.byLane.get(lane) ?? [];
  const ties = new Map<string, { positions: Set<number>; sources: Set<number>; flow: LyricFlow }>();
  const members = new Map<string, string>();
  const groups: LyricGroup[] = [];
  const key = (token: Token, pitch: number) => JSON.stringify([token.id, pitch]);
  for (const link of prepared.links.filter(link => link.from.note.lane === lane && link.from.note.pitches.length)) {
    if (link.kind === 'slur') {
      groups.push({ first: link.from.at, positions: tokens.filter(token => token.at >= link.from.at && token.at <= link.to.at).map(token => token.at),
        sources: link.source === undefined ? [] : [link.source], flow: score.spans[link.source!]?.lyricFlow ?? 'auto' });
    } else if (link.kind === 'tie') {
      const first = key(link.from, link.pitch!);
      const last = key(link.to, link.targetPitch!);
      const root = members.get(first) ?? first;
      const endRoot = members.get(last);
      const flow = score.spans[link.source!]?.lyricFlow ?? link.from.note.lyricFlow ?? 'auto';
      const group = ties.get(root) ?? { positions: new Set(), sources: new Set(), flow };
      ties.set(root, group);
      if (group.flow === 'auto') group.flow = flow;
      if (endRoot && endRoot !== root) {
        const end = ties.get(endRoot)!;
        for (const at of end.positions) group.positions.add(at);
        for (const source of end.sources) group.sources.add(source);
        if (group.flow === 'auto') group.flow = end.flow;
        for (const [member, group] of members) if (group === endRoot) members.set(member, root);
        ties.delete(endRoot);
      }
      members.set(first, root);
      members.set(last, root);
      group.positions.add(link.from.at);
      group.positions.add(link.to.at);
      if (link.source !== undefined) group.sources.add(link.source);
    }
  }
  for (const group of ties.values()) {
    const positions = [...group.positions].sort((left, right) => left - right);
    groups.push({ first: positions[0], positions, sources: [...group.sources], flow: group.flow });
  }
  return groups;
}

export function lyricValue(token: Token, verse: number) {
  return token.continuation ? '' : noteVerses(token.note).find(item => item.number === verse)?.text ?? '';
}

export function lyricStops(tokens: Token[], groups: LyricGroup[], words: Map<number, string>, entry?: number) {
  const skipped = new Set<number>();
  for (const group of groups) {
    const interior = group.positions.filter(at => at !== group.first);
    if (entry !== undefined && interior.includes(entry)) continue;
    if (group.flow === 'each' || group.flow === 'auto' && interior.some(at => !!words.get(at))) continue;
    for (const at of interior) skipped.add(at);
  }
  return tokens.filter(token => token.note.pitches.length && (!token.note.unpitched || words.get(token.at)) && !skipped.has(token.at)).map(token => token.at);
}

export function insertLyrics(text: string, words: Map<number, string>, caret: { at: number; offset: number },
  held: boolean, next: (at: number) => number | undefined) {
  for (const character of graphemes(text)) {
    if (/^\s+$/u.test(character) || character === '　') {
      if (!held) {
        const after = next(caret.at);
        if (after !== undefined) Object.assign(caret, { at: after, offset: 0 });
      }
      continue;
    }
    if (!held && caret.offset === 0 && isPunctuation(character)) {
      const previous = [...words].filter(([at, word]) => at < caret.at && !!word).map(([at]) => at).sort((a, b) => b - a)[0];
      if (previous !== undefined) {
        const word = words.get(previous)!;
        if (word.length + character.length <= 300) words.set(previous, word + character);
        continue;
      }
    }
    const word = words.get(caret.at) ?? '';
    if (word.length + character.length > 300) continue;
    words.set(caret.at, word.slice(0, caret.offset) + character + word.slice(caret.offset));
    caret.offset += character.length;
    if (!held && advancesSyllable(character)) {
      const after = next(caret.at);
      if (after !== undefined) Object.assign(caret, { at: after, offset: 0 });
    }
  }
  return caret;
}

export function distributeLyrics(text: string, words: Map<number, string>, joins: Set<number>,
  caret: { at: number; offset: number }, held: boolean, next: (at: number) => number | undefined) {
  for (const character of graphemes(text)) {
    if (character === '-' && !held && /^[\p{Script=Latin}\p{M}'’]+$/u.test(words.get(caret.at) ?? '')) {
      joins.add(caret.at);
      const after = next(caret.at);
      if (after !== undefined) Object.assign(caret, { at: after, offset: 0 });
    } else insertLyrics(character, words, caret, held, next);
  }
}

export function lyricPlainText(verses: { text?: string; syllabicNext?: boolean }[]) {
  let output = '';
  let joins = false;
  const latin = /[\p{Script=Latin}0-9]/u;
  for (const verse of verses) {
    const word = verse.text?.trim();
    if (!word) continue;
    const head = Array.from(word)[0];
    const tail = Array.from(output).at(-1) ?? '';
    const separated = !joins && (latin.test(head) || /^[\[("']$/.test(head)) && (latin.test(tail) || /^[.,;:!?\])"]$/.test(tail));
    output += (separated ? ' ' : '') + word;
    joins = !!verse.syllabicNext;
  }
  return output;
}
