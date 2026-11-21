export const chordKinds: Record<string, string> = {
  '': 'major', m: 'minor', '5': 'power', '6': 'major-sixth', m6: 'minor-sixth',
  '7': 'dominant', maj7: 'major-seventh', m7: 'minor-seventh', mMaj7: 'major-minor',
  dim: 'diminished', dim7: 'diminished-seventh', m7b5: 'half-diminished',
  aug: 'augmented', aug7: 'augmented-seventh', sus2: 'suspended-second', sus4: 'suspended-fourth',
  '9': 'dominant-ninth', maj9: 'major-ninth', m9: 'minor-ninth',
  '11': 'dominant-11th', maj11: 'major-11th', m11: 'minor-11th',
  '13': 'dominant-13th', maj13: 'major-13th', m13: 'minor-13th', add9: 'major'
};
const aliases: Record<string, string> = { min: 'm', '-': 'm', M: '', M7: 'maj7', M9: 'maj9', 'Δ': 'maj7', 'Δ7': 'maj7',
  '+': 'aug', '°': 'dim', '°7': 'dim7', 'ø': 'm7b5', 'ø7': 'm7b5', sus: 'sus4' };
const notes = 'CDEFGAB';
const pitches = [0, 2, 4, 5, 7, 9, 11];
const mod = (n: number, m: number) => (n % m + m) % m;
const spelling = (step: string, alter: number) => step + (alter > 0 ? '#'.repeat(alter) : 'b'.repeat(-alter));

export interface ChordSymbol { id: string; lane: string; at: number; text: string; actual?: string }

interface ParsedChord { mode: 'none' | 'degree' | 'note'; root: string; quality: string; kind: string; text: string; bass?: string }
export function parseChord(value: string): ParsedChord | undefined {
  const caption = value.trim().replaceAll('♯', '#').replaceAll('♭', 'b').replace(/\s/g, '');
  if (/^n\.?c\.?$/i.test(caption)) return { mode: 'none', root: '', quality: '', kind: 'none', text: 'N.C.' } as const;
  const roman = /^((?:#{1,2}|b{1,2})?)(VII|III|VI|IV|II|V|I|vii|iii|vi|iv|ii|v|i)([^/]*)(?:\/((?:#{1,2}|b{1,2})?)(VII|III|VI|IV|II|V|I|vii|iii|vi|iv|ii|v|i))?$/.exec(caption);
  if (roman) {
    const [, alter, root, suffix, bassAlter, bass] = roman;
    const degree = (value: string) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'].indexOf(value.toUpperCase()) + 1;
    const quality = root === root.toLowerCase() && ['', '6', '7', '9', '11', '13'].includes(suffix) ? 'm' + suffix :
      suffix === 'o' ? 'dim' : suffix === 'o7' ? 'dim7' : suffix;
    const parsed = parseChord(alter + degree(root) + quality + (bass ? '/' + bassAlter + degree(bass) : ''));
    return parsed && { ...parsed, text: caption };
  }
  const relative = /^((?:#{1,2}|b{1,2})?[1-7])([^/]*)(?:\/((?:#{1,2}|b{1,2})?[1-7]))?$/.exec(caption);
  const absolute = /^([A-Ga-g](?:#{1,2}|b{1,2})?)([^/]*)(?:\/([A-Ga-g](?:#{1,2}|b{1,2})?))?$/.exec(caption);
  const match = relative ?? absolute;
  if (!match) return undefined;
  const [, root, suffix, bass] = match;
  const quality = aliases[suffix] ?? suffix;
  const kind = chordKinds[quality];
  if (!Object.hasOwn(chordKinds, quality)) return undefined;
  const normalize = (name: string) => relative ? name : name[0].toUpperCase() + name.slice(1);
  return { mode: relative ? 'degree' as const : 'note' as const, root: normalize(root), quality, kind,
    bass: bass && normalize(bass), text: normalize(root) + quality + (bass ? '/' + normalize(bass) : '') };
}

export function chordPitch(value: string) {
  const [, step, signs] = /^([A-G])([#b]*)$/.exec(value)!;
  return { step, alter: [...signs].reduce((sum, sign) => sum + (sign === '#' ? 1 : -1), 0) };
}
function degreePitch(degree: string, fifths: number, minor: boolean) {
  const index = Number(degree.at(-1)) - 1;
  const root = mod(4 * fifths + (minor ? 5 : 0), 7);
  const desired = mod(7 * fifths + (minor ? 9 : 0) +
    (minor ? [0, 2, 3, 5, 7, 8, 10] : pitches)[index] +
    [...degree.slice(0, -1)].reduce((sum, sign) => sum + (sign === '#' ? 1 : -1), 0), 12);
  const step = mod(root + index, 7);
  return { step: notes[step], alter: mod(desired - pitches[step] + 6, 12) - 6 };
}
export function noteForDegree(degree: string, fifths: number, minor: boolean) {
  const { step, alter } = degreePitch(degree, fifths, minor);
  return spelling(step, alter);
}
export function degreeForNote(value: string, fifths: number, minor: boolean) {
  const written = chordPitch(value);
  const root = mod(4 * fifths + (minor ? 5 : 0), 7);
  const index = mod(notes.indexOf(written.step) - root, 7) + 1;
  const base = degreePitch(String(index), fifths, minor);
  return spelling('', written.alter - base.alter) + index;
}
export function transposeChord(value: string, oldFifths: number, oldMinor: boolean, newFifths: number, newMinor: boolean) {
  const chord = parseChord(value);
  if (!chord || chord.mode !== 'note') return value;
  const distance = mod(7 * (newFifths - oldFifths) + 9 * (Number(newMinor) - Number(oldMinor)), 12);
  if (!distance && oldFifths === newFifths) return value;
  const shift = (name: string) => {
    const pitch = chordPitch(name);
    const target = mod(pitches[notes.indexOf(pitch.step)] + pitch.alter + distance, 12);
    const step = mod(notes.indexOf(pitch.step) + 4 * (newFifths - oldFifths) + 5 * (Number(newMinor) - Number(oldMinor)), 7);
    const alter = mod(target - pitches[step] + 6, 12) - 6;
    if (Math.abs(alter) <= 2) return spelling(notes[step], alter);
    const sharp = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const flat = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    return (newFifths < 0 ? flat : sharp)[target];
  };
  return shift(chord.root) + chord.quality + (chord.bass ? '/' + shift(chord.bass) : '');
}
