import type { Command } from './workbench.js';

export type ShortcutScope = 'edit' | 'input' | 'grace' | 'text' | 'lyric' | 'style' | 'bindings';
export interface Shortcut extends Command {
  id: string;
  name: string;
  scopes: ShortcutScope[];
  defaults: string[];
  fixed?: 'single' | 'ctrl' | 'continuation';
}
const scoreScopes: ShortcutScope[] = ['edit', 'input', 'grace'];
export const accidentalSlots = [
  { id: 'accidental-down-main', family: 'main', direction: -1, key: 'I' },
  { id: 'accidental-up-main', family: 'main', direction: 1, key: 'O' },
  { id: 'accidental-down-pad', family: 'pad', direction: -1, key: 'NumDivide' },
  { id: 'accidental-up-pad', family: 'pad', direction: 1, key: 'NumMultiply' }
] as const;
export const lowerOctaveSlots = ['octave-low-backquote', 'octave-low-middle-dot', 'octave-low-number'];
export const tupletDigitSlots = Array.from({ length: 10 }, (_, i) => 'tuplet-digit-' + i);
export const specialShortcuts: Shortcut[] = [
  ...accidentalSlots.map(slot => ({ id: slot.id, name: (slot.direction < 0 ? '降低' : '升高') + '升降号 · ' +
    (slot.family === 'main' ? '第一组' : '第二组'), scopes: scoreScopes, defaults: [slot.key], fixed: 'single' as const, run() {} })),
  ...lowerOctaveSlots.map((id, i) => ({ id, name: '临时低八度 · 按键 ' + (i + 1), scopes: ['input', 'grace'] as ShortcutScope[],
    defaults: [['`', '·', '9'][i]], fixed: 'single' as const, run() {} })),
  { id: 'tuplet-prefix', name: '两位多连音 · 起始按键', scopes: ['edit', 'input'], defaults: ['Ctrl+1'], fixed: 'ctrl', run() {} },
  ...tupletDigitSlots.map((id, i) => ({ id, name: '两位多连音 · ' + (10 + i) + ' 连音', scopes: ['edit', 'input'] as ShortcutScope[],
    defaults: ['Ctrl+' + i], fixed: 'continuation' as const, run() {} }))
];
const groupedRows = [
  { name: '逐档切换升降号／按对键切换还原号', ids: accidentalSlots.map(slot => slot.id) },
  { name: '临时低八度', ids: lowerOctaveSlots },
  { name: '两位多连音（10–19）', ids: ['tuplet-prefix', ...tupletDigitSlots] }
];
export const keyName = (key: string) => (({ NumDivide: '小键盘 /', NumMultiply: '小键盘 *', NumAdd: '小键盘 +' }[key] ?? key)
  .replace(/WheelUp$/, '滚轮向上').replace(/WheelDown$/, '滚轮向下'));
const wheelPattern = /^(?:Ctrl\+)?(?:Alt\+)?(?:Shift\+)?Wheel(?:Up|Down)$/;
export function wheelShortcut(event: Pick<WheelEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'deltaY' | 'deltaX'>) {
  const direction = event.deltaY || event.deltaX;
  const modifiers = (event.ctrlKey || event.metaKey ? 'Ctrl+' : '') + (event.altKey ? 'Alt+' : '') + (event.shiftKey ? 'Shift+' : '');
  return direction && modifiers ? modifiers + (direction < 0 ? 'WheelUp' : 'WheelDown') : undefined;
}
export type Bindings = Record<string, string[]>;
const scopeNames: Record<ShortcutScope, string> = {
  edit: '常规编辑', input: '音符输入', grace: '倚音输入', text: '文字编辑', lyric: '歌词编辑',
  style: '样式窗口', bindings: '快捷键设置窗口'
};
const storageKey = 'shupu-shortcuts-v1';
const form = 'shupu-shortcuts';
const keyPattern = /^(?:Ctrl\+)?(?:Alt\+)?(?:Shift\+)?(?:[ -~·]|Arrow(?:Left|Right|Up|Down)|F(?:[1-9]|1\d|2[0-4])|Space|Escape|Enter|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Num(?:[0-9]|Add|Subtract|Divide|Multiply|Decimal|Enter))$/;

export function shortcutKeys(event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'getModifierState'>) {
  if (event.getModifierState('AltGraph') || event.key.length === 1 && !/^[ -~·]$/.test(event.key)) return [];
  const physical = event.code?.startsWith('Numpad') ? event.code.replace('Numpad', 'Num') : '';
  const key = event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  const prefix = (event.ctrlKey || event.metaKey ? 'Ctrl+' : '') + (event.altKey ? 'Alt+' : '');
  const impliedShift = key.length === 1 && /[^A-Z0-9]/.test(key);
  return [...new Set([physical && prefix + (event.shiftKey ? 'Shift+' : '') + physical,
    prefix + (event.shiftKey && !impliedShift ? 'Shift+' : '') + key].filter(value => value && keyPattern.test(value)))];
}
function validKey(key: string, entry: Shortcut) {
  if (entry.scopes.some(scope => scope === 'style' || scope === 'bindings') && !/^(?:Ctrl\+|Alt\+|(?:Shift\+)?F\d+$)/.test(key)) return false;
  if (wheelPattern.test(key)) return (entry.id === 'zoom-in' || entry.id === 'zoom-out') && !key.startsWith('Wheel');
  if (!keyPattern.test(key)) return false;
  if (entry.fixed === 'single') return !/^(Ctrl|Alt|Shift)\+/.test(key) && key !== 'Escape';
  if (entry.fixed) return /^Ctrl\+(?!Alt\+|Shift\+).+/.test(key) && key !== 'Ctrl+Escape';
  return true;
}
const namesOverlap = (a: readonly ShortcutScope[], b: readonly ShortcutScope[]) => a.some(name => b.includes(name));
const overlaps = (a: Shortcut, b: Shortcut) => (a.fixed === 'continuation') === (b.fixed === 'continuation') && namesOverlap(a.scopes, b.scopes);
const normalizeSearch = (value: string) => value.toLowerCase().replace(/control\b/g, 'ctrl').replace(/\bdel\b/g, 'delete').replace(/\besc\b/g, 'escape');
export function shortcutMatches(name: string, keys: string[], query: string) {
  const contents = normalizeSearch([name, ...keys].join(' '));
  return normalizeSearch(query).trim().split(/\s+/).every(term => contents.includes(term));
}
export function parseBindings(text: string, entries: Map<string, Shortcut>) {
  const file = JSON.parse(text);
  if (![form, 'choral-jianpu-shortcuts'].includes(file?.format) || file.version !== 1 || !file.bindings || typeof file.bindings !== 'object' || Array.isArray(file.bindings))
    throw Error('无法识别此快捷键文件。');
  const bindings: Bindings = Object.create(null);
  const unknown: string[] = [];
  for (const [id, value] of Object.entries(file.bindings)) {
    if (id === 'temp-octave-低' && entries.has('octave-low-number')) {
      const slot = entries.get('octave-low-number')!;
      const former = Array.isArray(value) && value.find(key => typeof key === 'string' && validKey(key, slot));
      if (former) bindings[slot.id] = [former];
      continue;
    }
    const entry = entries.get(id);
    if (!entry) { unknown.push(id); continue; }
    if (!Array.isArray(value) || entry.fixed && value.length !== 1 || !value.every(key => typeof key === 'string' && validKey(key, entry)))
      throw Error(`「${entry.name}」的绑定不符合操作要求。`);
    bindings[id] = [...new Set(value)];
  }
  return { bindings, unknown };
}
export function bindingsFile(bindings: Bindings) {
  return JSON.stringify({ format: form, version: 1, bindings }, null, 2);
}

export function mountShortcuts(entries: Shortcut[], download: (blob: Blob, name: string) => void, changed: () => void) {
  const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  let bindings: Bindings = Object.create(null);
  try { bindings = parseBindings(localStorage.getItem(storageKey) ?? localStorage.getItem('choral-jianpu-shortcuts-v1') ?? '', byId).bindings; } catch {}
  let draft: Bindings = {};
  let incoming: ReturnType<typeof parseBindings> | undefined;
  let capture: { id: string; old?: string } | undefined;
  const dialog = get<HTMLDialogElement>('shortcut-settings');
  const captureField = get<HTMLInputElement>('shortcut-capture');
  const filter = get<HTMLInputElement>('shortcut-query');
  const conflictOnly = get<HTMLInputElement>('shortcut-conflicts');
  const feedback = get('shortcut-message');
  const effective = (entry: Shortcut, overrides: Bindings) => Object.hasOwn(overrides, entry.id) ? overrides[entry.id] : entry.defaults;
  const keys = (id: string) => byId.has(id) ? effective(byId.get(id)!, bindings) : [];
  const button = (title: string, action: () => void, tip?: string) => {
    const node = document.createElement('button');
    node.type = 'button'; node.textContent = title; node.onclick = action;
    if (tip) { node.title = tip; node.setAttribute('aria-label', tip); }
    return node;
  };
  const conflicts = (entry: Shortcut, next: string[], overrides: Bindings) => entries.flatMap(other => {
    if (entry === other || !overlaps(entry, other)) return [];
    return effective(other, overrides).flatMap(key => next.includes(key) ? [{ other, key }] : []);
  });
  const browser = !('desktopScore' in window);
  const agent = navigator.userAgent;
  const browserKeys = new Set(browser ? ['Ctrl+N', 'Ctrl+O', 'Ctrl+Shift+D'] : []);
  if (browser && /Edg\//.test(agent)) browserKeys.add('Ctrl+Shift+S');
  const browserConflict = (key: string) => browserKeys.has(key) ? '可能被浏览器占用' : '';
  const conflictText = (entry: Shortcut, key: string, overrides: Bindings) => [
    ...conflicts(entry, [key], overrides).map(({ other }) => '与「' + other.name + '」冲突'),
    browserConflict(key)
  ].filter(Boolean).join('；');
  const markConflict = (control: HTMLElement, entry: Shortcut, key: string) => {
    const reason = conflictText(entry, key, draft);
    if (!reason) return;
    control.classList.add('shortcut-conflict');
    control.title += ' · ' + reason;
    control.setAttribute('aria-label', control.title);
  };
  const hasConflict = (entry: Shortcut) => effective(entry, draft).some(key => conflictText(entry, key, draft));
  function change(entry: Shortcut, next: string[], reset = false) {
    const matches = conflicts(entry, next, draft);
    const locked = matches.find(match => match.other.fixed);
    if (locked) {
      feedback.textContent = `${keyName(locked.key)} 已用于「${locked.other.name}」。请先给该按键换一个绑定。`;
      return;
    }
    if (matches.length && !confirm(`此绑定已用于 ${matches.map(({ other, key }) => `${other.name}（${key}）`).join('、')}。替换原绑定？`)) {
      feedback.textContent = '保留原来的按键设置。';
      return;
    }
    for (const { other, key } of matches) draft[other.id] = effective(other, draft).filter(value => value !== key);
    if (reset) delete draft[entry.id];
    else draft[entry.id] = next;
    feedback.textContent = '';
    draw();
  }
  function endCapture() {
    capture = undefined;
    get('shortcut-capture-row').hidden = true;
  }
  function startCapture(entry: Shortcut, old?: string) {
    capture = { id: entry.id, old };
    get('shortcut-capture-name').textContent = entry.name;
    get('shortcut-capture-row').hidden = false;
    captureField.value = '';
    captureField.focus();
    feedback.textContent = '';
  }
  function recordKey(key: string) {
    if (!capture) return;
    const { id, old } = capture;
    const entry = byId.get(id)!;
    if (!validKey(key, entry)) {
      feedback.textContent = entry.scopes.some(scope => scope === 'style' || scope === 'bindings')
        ? '请使用含 Ctrl 或 Alt 的组合，或使用功能键。'
        : entry.fixed === 'single' ? '请按一个单键。' : entry.fixed ? '请按住 Ctrl 再按一个键。' : '滚轮组合可绑定给放大或缩小谱面。';
      return;
    }
    const current = [...effective(entry, draft)];
    if (old) current.splice(current.indexOf(old), 1, key);
    else current.push(key);
    endCapture();
    change(entry, [...new Set(current)]);
    filter.focus({ preventScroll: true });
  }
  captureField.onkeydown = event => {
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat || event.isComposing) return;
    const key = shortcutKeys(event)[0];
    if (key) recordKey(key);
  };
  captureField.addEventListener('wheel', event => {
    const key = wheelShortcut(event);
    if (!capture || !key) return;
    event.preventDefault();
    recordKey(key);
  }, { passive: false });
  function draw() {
    const scroller = get('shortcut-rows').closest<HTMLElement>('.shortcut-scroll')!;
    const top = scroller.scrollTop;
    const groups = groupedRows.flatMap((definition, index) => {
      const slots = definition.ids.flatMap(id => byId.get(id) ?? []);
      if (conflictOnly.checked && !slots.some(hasConflict)) return [];
      const values = slots.flatMap(entry => effective(entry, draft));
      if (!slots.length || !shortcutMatches(definition.name, [...values, ...values.map(keyName)], filter.value)) return [];
      const row = document.createElement('tr');
      const title = document.createElement('th'), scope = document.createElement('td');
      const controls = document.createElement('td'), reset = document.createElement('td');
      title.scope = 'row';
      title.textContent = definition.name;
      scope.textContent = slots[0].scopes.map(value => scopeNames[value]).join('、');
      controls.className = 'shortcut-bindings special-bindings';
      const chip = (i: number) => {
        const entry = slots[i], current = effective(entry, draft)[0];
        const control = button(keyName(current), () => startCapture(entry, current), `更改 ${entry.name}`);
        markConflict(control, entry, current);
        return control;
      };
      const line = (...parts: (HTMLElement | string)[]) => {
        const p = document.createElement('div');
        p.append(...parts);
        controls.append(p);
      };
      if (index === 0) {
        line('用 ', chip(0), chip(2), ' 下调，', chip(1), chip(3), ' 上调');
        line('同时按 ', chip(0), ' 和 ', chip(1), '，或 ', chip(2), ' 和 ', chip(3), ' 切换还原号');
      } else if (index === 1) line('按 ', chip(0), '、', chip(1), ' 或 ', chip(2), ' 临时降低八度');
      else {
        line('先按 ', chip(0), '，保持 Ctrl 按住，再按对应个位的键');
        const digits = document.createElement('div');
        digits.className = 'shortcut-sequence';
        slots.slice(1).forEach((_, i) => {
          const label = document.createElement('span');
          label.append(String(i + 10) + ' ', chip(i + 1));
          digits.append(label);
        });
        controls.append(digits);
      }
      const restore = button('恢复默认', () => {
        const collisions = slots.flatMap(entry => conflicts(entry, entry.defaults, draft)).filter(match => !slots.includes(match.other));
        if (collisions.some(match => match.other.fixed)) { feedback.textContent = '有默认键被另一项组合操作占用，请先更改占用项。'; return; }
        if (collisions.length && !confirm('恢复默认会移除冲突的普通绑定。继续？')) return;
        for (const { other, key } of collisions) draft[other.id] = effective(other, draft).filter(value => value !== key);
        for (const entry of slots) delete draft[entry.id];
        feedback.textContent = '';
        draw();
      });
      restore.disabled = slots.every(entry => !Object.hasOwn(draft, entry.id));
      reset.append(restore);
      row.append(title, scope, controls, reset);
      return [row];
    });
    get('shortcut-rows').replaceChildren(...groups, ...entries.filter(entry => !entry.fixed && (!conflictOnly.checked || hasConflict(entry)) &&
      shortcutMatches(entry.name, effective(entry, draft).flatMap(key => [key, keyName(key)]), filter.value)).map(entry => {
      const row = document.createElement('tr');
      const name = document.createElement('th'), scope = document.createElement('td');
      const controls = document.createElement('td'), reset = document.createElement('td');
      name.scope = 'row';
      name.textContent = entry.name;
      scope.textContent = entry.scopes.length === 3 && entry.scopes.includes('grace') && entry.scopes.includes('edit') ? '谱面' :
        entry.scopes.map(value => scopeNames[value]).join('、');
      controls.className = 'shortcut-bindings';
      for (const key of effective(entry, draft)) {
        const tag = document.createElement('span');
        tag.className = 'shortcut-binding';
        const current = button(keyName(key), () => startCapture(entry, key), `更改 ${entry.name} 的 ${keyName(key)}`);
        markConflict(current, entry, key);
        const remove = button('×', () => change(entry, effective(entry, draft).filter(value => value !== key)), `删除 ${key}`);
        tag.append(current, remove);
        controls.append(tag);
      }
      controls.append(button('＋', () => startCapture(entry), '添加快捷键'));
      const restore = button('恢复默认', () => change(entry, entry.defaults, true));
      restore.disabled = !Object.hasOwn(draft, entry.id);
      reset.append(restore);
      row.append(name, scope, controls, reset);
      return row;
    }));
    get('shortcut-empty').hidden = get('shortcut-rows').childElementCount > 0;
    scroller.scrollTop = top;
  }
  const importInput = get<HTMLInputElement>('shortcut-file');
  const preview = get('shortcut-import-preview');
  function importDraft(replace: boolean) {
    if (!incoming) return;
    const next = replace ? { ...incoming.bindings } : { ...draft, ...incoming.bindings };
    const fixes: string[] = [];
    const order = [...entries].sort((a, b) => Number(!!b.fixed) - Number(!!a.fixed) ||
      Number(Object.hasOwn(incoming!.bindings, b.id)) - Number(Object.hasOwn(incoming!.bindings, a.id)));
    // Prefer imported entries, then use the visible command order for imported conflicts.
    for (const [index, entry] of order.entries()) for (const key of effective(entry, next))
      for (const other of order.slice(index + 1)) if (overlaps(entry, other) && effective(other, next).includes(key)) {
        if (other.fixed) { feedback.textContent = `无法导入。${keyName(key)} 同时用于两个组合操作位置。`; return; }
        fixes.push(`${key} 保留给 ${entry.name}，移除 ${other.name} 的绑定`);
        next[other.id] = effective(other, next).filter(value => value !== key);
      }
    if (fixes.length && !confirm('处理这些快捷键冲突？\n' + fixes.join('\n'))) return;
    draft = next;
    incoming = undefined;
    preview.hidden = true;
    feedback.textContent = '已加入预览。点「应用」启用。';
    draw();
  }
  filter.oninput = () => { get('shortcut-rows').closest<HTMLElement>('.shortcut-scroll')!.scrollTop = 0; draw(); };
  conflictOnly.onchange = filter.oninput;
  get('shortcut-capture-cancel').onclick = () => { endCapture(); filter.focus(); };
  get('shortcut-reset').onclick = () => { endCapture(); draft = {}; feedback.textContent = '已在预览中恢复全部默认。'; draw(); };
  get('shortcut-export').onclick = () => download(new Blob([bindingsFile(draft)], { type: 'application/json' }), '数谱快捷键.shupuskeys');
  get('shortcut-import').onclick = () => importInput.click();
  get('shortcut-import-merge').onclick = () => importDraft(false);
  get('shortcut-import-replace').onclick = () => importDraft(true);
  importInput.onchange = async () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw Error('快捷键文件过大。');
      incoming = parseBindings(await file.text(), byId);
      get('shortcut-import-summary').textContent = `可导入 ${Object.keys(incoming.bindings).length} 项。` +
        (incoming.unknown.length ? ` 未识别：${incoming.unknown.join('、')}。` : '') + ' 合并时，文件中的设置覆盖同名功能。';
      preview.hidden = false;
    } catch (error) {
      incoming = undefined;
      preview.hidden = true;
      feedback.textContent = (error as Error).message;
    }
  };
  get('shortcut-apply').onclick = () => {
    try { localStorage.setItem(storageKey, bindingsFile(draft)); }
    catch { feedback.textContent = '当前浏览器无法保存快捷键设置。'; return; }
    bindings = structuredClone(draft);
    dialog.close();
    changed();
  };
  return {
    keys,
    preferred(id: string) {
      const entry = byId.get(id);
      if (!entry) return undefined;
      const options = keys(id);
      return options.find(key => !conflictText(entry, key, bindings)) ?? options[0];
    },
    observed(event: KeyboardEvent) {
      if (event.isTrusted && event.defaultPrevented && shortcutKeys(event).some(key => browserKeys.delete(key))) changed();
    },
    open() {
      draft = structuredClone(bindings);
      capture = incoming = undefined;
      preview.hidden = true;
      endCapture();
      filter.value = '';
      feedback.textContent = '';
      draw();
      dialog.showModal();
      filter.focus();
    },
    find(event: KeyboardEvent, scope: ShortcutScope) {
      for (const key of shortcutKeys(event)) {
        const entry = entries.find(entry => !entry.fixed && entry.scopes.includes(scope) && keys(entry.id).includes(key) && (entry.enabled?.() ?? true));
        if (entry) return entry;
      }
    }
  };
}
