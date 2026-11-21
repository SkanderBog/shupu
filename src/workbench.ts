export type Panel = 'palette' | 'layout' | 'properties';
type WindowBounds = { x: number; y: number; width: number; height: number };

import { RHYTHM_TEMPO, TEMPO_GLYPHS, TEMPO_PRESETS } from './tempo.js';
import { ORNAMENT_KINDS, ORNAMENT_LABELS } from './score.js';
import { ornamentVector, ornamentOutlines } from './ornament-outlines.js';

export function noteLineIcon(kind: 'tie' | 'slur') {
  const slur = kind === 'slur';
  const digits = (slur ? ['1', '2', '3'] : ['1', '1']).map((digit, i) =>
    `<text x="${7 + i * (slur ? 11 : 14)}" y="20" text-anchor="middle">${digit}</text>`).join('');
  return `<svg viewBox="0 0 ${slur ? 36 : 28} 28" aria-hidden="true" focusable="false">${digits}<path class="tool-stroke" d="${slur ? 'M7 9Q18 0 29 9' : 'M7 9Q14 2 21 9'}"/></svg>`;
}

export function mountResizablePanels() {
  const key = 'shupu-workspace-layout-v1';
  let settings: { sidebar?: number; windows: Record<string, WindowBounds> } = { windows: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? localStorage.getItem('choral-jianpu-workspace-layout-v1') ?? 'null');
    if (saved && typeof saved === 'object' && saved.windows && typeof saved.windows === 'object') settings = saved;
  } catch { /* Defaults are usable without local storage. */ }
  const save = () => {
    try { localStorage.setItem(key, JSON.stringify(settings)); } catch { /* Layout is still applied for this session. */ }
  };
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));
  const frame = () => ({ width: Math.max(1, innerWidth - 12), height: Math.max(1, innerHeight - 12) });
  const bounded = (bounds: WindowBounds) => {
    const space = frame();
    const width = clamp(bounds.width, Math.min(265, space.width), space.width);
    const height = clamp(bounds.height, Math.min(130, space.height), space.height);
    return { x: clamp(bounds.x, 6, innerWidth - 6 - width), y: clamp(bounds.y, 6, innerHeight - 6 - height), width, height };
  };
  const apply = (dialog: HTMLDialogElement, bounds: WindowBounds) => {
    Object.assign(dialog.style, { left: bounds.x + 'px', top: bounds.y + 'px', width: bounds.width + 'px', height: bounds.height + 'px' });
    dialog.classList.add('arranged-dialog');
  };
  const directions = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
  const dialogs = Array.from(document.querySelectorAll('dialog'));
  const windowKey = (dialog: HTMLDialogElement) => dialog.id === 'setup' ? 'setup-v2' : dialog.id;
  for (const dialog of dialogs) {
    const content = Array.from(dialog.children);
    const form = content.length === 1 && content[0] instanceof HTMLFormElement ? content[0] : undefined;
    const layout = form ?? document.createElement('div');
    const title = (form ?? dialog).querySelector<HTMLElement>(':scope > .measure-dialog-heading, :scope > .mix-heading, :scope > [data-dialog-heading], :scope > h2');
    const heading = document.createElement('header');
    heading.className = 'dialog-header dialog-drag';
    if (title) {
      heading.append(title);
      const label = title.matches('h2') ? title : title.querySelector('h2, strong');
      if (label && !dialog.hasAttribute('aria-labelledby')) {
        if (!label.id) label.id = dialog.id + '-dialog-title';
        dialog.setAttribute('aria-labelledby', label.id);
      }
    }
    const close = title?.matches('.mix-heading') ? title.querySelector('button')! : document.createElement('button');
    close.type = 'button';
    close.classList.add('dialog-close');
    close.setAttribute('aria-label', '关闭弹窗');
    close.title = '关闭';
    close.textContent = '×';
    close.onclick = () => dialog.close('cancel');
    if (!title?.matches('.mix-heading')) heading.append(close);
    const body = document.createElement('div');
    body.className = 'dialog-scroll';
    const source = form ?? dialog;
    const tail = source.lastElementChild;
    const actions = tail?.matches('.buttons, button') ? document.createElement('div') : null;
    if (actions && tail) {
      actions.className = 'dialog-actions';
      actions.append(tail);
    }
    body.append(...source.childNodes);
    layout.classList.add('dialog-frame');
    layout.append(heading, body);
    if (actions) layout.append(actions);
    if (!form) dialog.append(layout);
    dialog.classList.add('resizable-dialog');
    for (const direction of directions) {
      const handle = document.createElement('div');
      handle.className = 'dialog-edge edge-' + direction;
      handle.dataset.edge = direction;
      handle.setAttribute('aria-hidden', 'true');
      dialog.append(handle);
    }
    let gesture: { pointer: number; x: number; y: number; rect: WindowBounds; edge: string; moved: boolean } | undefined;
    dialog.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !(event.target instanceof Element)) return;
      const edge = event.target.closest<HTMLElement>('.dialog-edge')?.dataset.edge;
      if (!edge && (!heading.contains(event.target) || event.target.closest('button, input, select, a'))) return;
      event.preventDefault();
      const { x, y, width, height } = dialog.getBoundingClientRect();
      gesture = { pointer: event.pointerId, x: event.clientX, y: event.clientY, rect: { x, y, width, height }, edge: edge ?? '', moved: false };
      dialog.setPointerCapture(event.pointerId);
      dialog.classList.add('arranging-dialog');
    });
    dialog.addEventListener('pointermove', event => {
      if (!gesture || event.pointerId !== gesture.pointer) return;
      const { rect, edge, x, y } = gesture;
      const dx = event.clientX - x, dy = event.clientY - y;
      if (!dx && !dy && !gesture.moved) return;
      gesture.moved = true;
      const space = frame();
      const minWidth = Math.min(265, space.width), minHeight = Math.min(130, space.height);
      const next = { ...rect };
      if (!edge) { next.x += dx; next.y += dy; }
      if (edge.includes('e')) next.width = clamp(rect.width + dx, minWidth, innerWidth - 6 - rect.x);
      if (edge.includes('s')) next.height = clamp(rect.height + dy, minHeight, innerHeight - 6 - rect.y);
      if (edge.includes('w')) {
        next.x = clamp(rect.x + dx, 6, rect.x + rect.width - minWidth);
        next.width = rect.x + rect.width - next.x;
      }
      if (edge.includes('n')) {
        next.y = clamp(rect.y + dy, 6, rect.y + rect.height - minHeight);
        next.height = rect.y + rect.height - next.y;
      }
      apply(dialog, bounded(next));
    });
    const finish = (event: PointerEvent) => {
      if (!gesture || gesture.pointer !== event.pointerId) return;
      const { x, y, width, height } = dialog.getBoundingClientRect();
      if (gesture.moved && width && height) { settings.windows[windowKey(dialog)] = { x, y, width, height }; save(); }
      gesture = undefined;
      dialog.classList.remove('arranging-dialog');
    };
    dialog.addEventListener('pointerup', finish);
    dialog.addEventListener('pointercancel', finish);
    dialog.addEventListener('lostpointercapture', finish);
  }
  const restore = (dialog: HTMLDialogElement) => {
    const prefs = settings.windows[windowKey(dialog)];
    if (dialog.open && prefs && [prefs.x, prefs.y, prefs.width, prefs.height].every(Number.isFinite)) apply(dialog, bounded(prefs));
  };
  const observer = new MutationObserver(records => records.forEach(record => restore(record.target as HTMLDialogElement)));
  dialogs.forEach(dialog => observer.observe(dialog, { attributes: true, attributeFilter: ['open'] }));
  const sidebar = document.getElementById('sidebar')!;
  const workspace = sidebar.closest<HTMLElement>('.workspace')!;
  const divider = document.createElement('div');
  divider.className = 'sidebar-divider';
  divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-orientation', 'vertical');
  divider.setAttribute('aria-label', '调整左侧栏宽度');
  divider.setAttribute('aria-controls', 'sidebar');
  divider.tabIndex = 0;
  sidebar.append(divider);
  const maxWidth = () => Math.max(110, Math.min(650, Math.floor(innerWidth * .72)));
  const sidebarWidth = (value: number) => {
    const max = maxWidth();
    const min = Math.min(160, max);
    const width = clamp(Math.round(value), min, max);
    workspace.style.setProperty('--sidebar-width', width + 'px');
    divider.setAttribute('aria-valuemin', String(min));
    divider.setAttribute('aria-valuemax', String(max));
    divider.setAttribute('aria-valuenow', String(width));
    return width;
  };
  let drag: { pointer: number; x: number; width: number } | undefined;
  divider.onpointerdown = event => {
    if (event.button !== 0) return;
    drag = { pointer: event.pointerId, x: event.clientX, width: sidebar.getBoundingClientRect().width };
    divider.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  divider.onpointermove = event => {
    if (drag?.pointer === event.pointerId) settings.sidebar = sidebarWidth(drag.width + event.clientX - drag.x);
  };
  divider.onlostpointercapture = () => { if (drag) { drag = undefined; save(); } };
  divider.onkeydown = event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    settings.sidebar = sidebarWidth(sidebar.getBoundingClientRect().width + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 1 : 12));
    save();
  };
  const restoreSidebar = () => {
    if (typeof settings.sidebar === 'number' && Number.isFinite(settings.sidebar)) sidebarWidth(settings.sidebar);
    else {
      divider.setAttribute('aria-valuemin', String(Math.min(160, maxWidth())));
      divider.setAttribute('aria-valuemax', String(maxWidth()));
      divider.setAttribute('aria-valuenow', String(Math.round(sidebar.getBoundingClientRect().width)));
    }
  };
  restoreSidebar();
  window.addEventListener('resize', () => { dialogs.forEach(restore); restoreSidebar(); });
}
export interface Command {
  run: () => void;
  enabled?: () => boolean;
  pressed?: () => boolean;
}
export interface SymbolEntry { command: string; glyph: string; title: string; search?: string }
const symbol = (command: string, glyph: string, title: string, search?: string): SymbolEntry =>
  ({ command, glyph, title, search });
export const beamLabels = {
  auto: '自动分组', isolated: '独立减时线', break: '断开左侧', one: '左侧仅连第一层', two: '左侧仅连前两层', three: '左侧仅连前三层', join: '向左连接'
};
export const barLabels = {
  normal: '普通小节线', double: '双小节线', final: '终止线', 'repeat-start': '反复头', 'repeat-end': '反复末', 'repeat-both': '反复末兼反复头'
};
export const meterPresets = ['2/2', '2/4', '3/4', '4/4', '3/8', '6/8', '9/8', '12/8'];

const gradualTempo = [
  symbol('tempo-line:accel.', 'accel. ┄', '渐快', 'accelerando 速度'),
  symbol('tempo-line:allarg.', 'allarg.', '渐慢放宽', 'allargando 速度'),
  symbol('tempo-line:rall.', 'rall. ┄', '渐慢（rall.）', 'rallentando 速度'),
  symbol('tempo-line:rit.', 'rit. ┄', '渐慢（rit.）', 'ritardando 速度')
];
const groupsByName = [
  { title: '装饰音与滑音', entries: [
    ...ORNAMENT_KINDS.map((kind, i) => symbol('ornament:' + kind, ['tr', '∿', '∿̸', '∽', '∽̸', '///'][i], ORNAMENT_LABELS[i], kind)),
    symbol('ornament:trill-wave', 'tr∿', '颤音与延续波线', 'trill wave'),
    symbol('tremolo-pair', '╱╱╱', '双音震音', '交替 tremolo'), symbol('slide', '↗', '滑音', '滑奏 glissando portamento')
  ] },
  { title: '速度', entries: [
    ...[0, 1].flatMap(dots => [192, 96, 48].map(unit =>
      symbol(`tempo:metro:${unit}:${dots}`, `${TEMPO_GLYPHS[unit]}${'·'.repeat(dots)} = 80`, '节拍器记号', 'bpm 速度 metronome'))),
    ...Object.keys(TEMPO_PRESETS).map(name => symbol('tempo:' + name, name, name, '速度 意大利语 tempo')),
    ...RHYTHM_TEMPO.map(([unit, dots, right, rightDots], index) => symbol('tempo:mod:' + index,
      `${TEMPO_GLYPHS[unit]}${'·'.repeat(dots)} = ${TEMPO_GLYPHS[right]}${'·'.repeat(rightDots)}`, '节奏调制', '速度 等值 拍值转换')),
    ...gradualTempo,
    symbol('tempo:restore', 'a tempo', '恢复上一次变速前的速度', '原速 a tempo'),
    symbol('tempo:primo', 'tempo primo', '恢复标题速度', '原初速度 tempo primo'),
    symbol('tempo:swing', 'Swing', '摇摆节奏', 'swing'), symbol('tempo:straight', 'Straight', '恢复均分节奏', 'straight')
  ] },
  { title: '线性记号', entries: [
    symbol('tie', '⌣', '同音线', '延音 同音连线 tie'),
    symbol('slur', '⌒', '连音线', '圆滑线 弧线 slur'),
    symbol('crescendo', '＜', '渐强', '力度 楔形 crescendo cresc'),
    symbol('crescendo-text', 'cresc. ┄', '文字渐强线', '力度 渐强 crescendo'),
    symbol('diminuendo-text', 'dim. ┄', '文字渐弱线', '力度 渐弱 diminuendo'),
    symbol('diminuendo', '＞', '渐弱', '力度 楔形 diminuendo dim decrescendo'),
    symbol('lyric-extension', '＿', '歌词延长线', '一字多音 延音 melisma'),
    ...gradualTempo
  ] },
  { title: '连谱号', entries: [
    symbol('staff-bracket:bracket', '▏', '粗括号', '谱表 连接 bracket'),
    symbol('staff-bracket:brace', '{', '花括号', '谱表 连接 brace'),
    symbol('staff-bracket:square', '[', '细方括号', '谱表 连接 square')
  ] },
  { title: '力度记号', entries: ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'sfz']
    .map(name => symbol('dynamic:' + name, name, name, '力度 强弱 dynamics')).concat(
      symbol('crescendo', '＜', '渐强', '力度 楔形 crescendo cresc'),
      symbol('diminuendo', '＞', '渐弱', '力度 楔形 diminuendo dim decrescendo')) },
  { title: '演奏与换气', entries: [
    symbol('staccato', '▾', '顿音', '跳音 staccato'), symbol('accent', '＞', '重音', 'accent'),
    symbol('tenuto', '–', '保持音', 'tenuto'), symbol('fermata', '𝄐', '延长记号', '停顿 fermata'),
    symbol('breath', '∨', 'V 形换气', '呼吸 breath upbow'), symbol('breath-comma', 'ʼ', '逗号换气', '呼吸 breath comma')
  ] },
  { title: '文字', entries: [
    symbol('lyric-edit', '词', '谱面填词', '歌词 L lyrics'),
    symbol('expression', 'Aa', '表情文字', 'solo tutti 说明'),
    symbol('inter-note-text', 'A↔', '音符间文字', '数字前 谱内 说明 inline'),
    symbol('rehearsal', '▣', '排练标记', '段落 rehearsal'),
    symbol('chord-symbol', 'Am7', '输入和弦代号…', '和弦 级数 音名 弹唱 chord harmony')
  ] },
  { title: '减时线属性', entries: Object.entries(beamLabels).map(([key, title], index) =>
    symbol('beam:' + key, ['A', '–', '┆', '─', '═', '≡', '━━'][index], title, '符杠 beam')) },
  { title: '多连音', entries: [
    ...Array.from({ length: 8 }, (_, index) => symbol(`tuplet:${index + 2}`, String(index + 2), `${index + 2} 连音`, '节奏 等分 tuplet')),
    symbol('tuplet:custom', 'N…', '自定义多连音', '节奏 等分 tuplet')
  ] },
  { title: '倚音', entries: [
    symbol('grace:before:48', '♪↘', '前倚音（八分）', '前置 grace'),
    symbol('grace:before:24', '♬↘', '前倚音（十六分）', '前置 grace'),
    symbol('grace:after:48', '↙♪', '后倚音（八分）', '后置 grace'),
    symbol('grace:after:24', '↙♬', '后倚音（十六分）', '后置 grace')
  ] },
  { title: '调号与拍号', entries: [
    symbol('key:1', '1=…', '1= 调号…', '唱名 大调 key'), symbol('key:6', '6=…', '6= 调号…', '唱名 小调 key'),
    ...meterPresets.map(meter => symbol(`meter:${meter}`, meter, meter, '拍号 meter time')),
    symbol('meter:custom', '♪', '自定义拍号…', '变拍 弱起 实际拍号 拍组 meter time')
  ] },
  { title: '小节线与反复', entries: [
    ...Object.entries(barLabels).map(([key, title], index) =>
      symbol('bar:' + key, ['|', '‖', '┃', '‖:', ':‖', ':‖:'][index], title, 'barline repeat')),
    symbol('ending:1', '1.', '一房子', '反复 volta'),
    symbol('ending:2', '2.', '二房子', '反复 volta'),
    symbol('ending', '1.', '房子设置', '一二房子 volta ending'),
    symbol('route:segno', '𝄋', 'Segno 返回点', '跳转 segno'),
    symbol('route:coda', '𝄌', 'Coda 尾声', '跳转 尾声 coda'),
    symbol('route:dc', 'D.C.', 'D.C. 从头再奏', '跳转 da capo'),
    symbol('route:ds', 'D.S.', 'D.S. 返回 Segno', '跳转 dal segno'),
    symbol('route:tocoda', 'To Coda', '转入尾声', '跳转 coda'),
    symbol('route:fine', 'Fine', 'Fine 结束点', '跳转 终止')
  ] },
  { title: '版面', entries: [
    symbol('break:line', '↵', '在此换行', '断行 system break'),
    symbol('break:page', '⇥', '在此换页', '分页 page break'),
    symbol('break:auto', '×', '取消手动断行', '自动 取消换行换页')
  ] },
  { title: '多声部', entries: [
    symbol('lane-add', '＋', '添加声部', '合唱 part'),
    symbol('side-add', '{', '添加临时声部', '临时副线 独立二声部 divisi'),
    symbol('side-delete', '×}', '删除临时声部'),
    symbol('side-split', 'X}{', '在此音后切分临时声部段')
  ] }
];
export const symbolGroups = ['连谱号', '调号与拍号', '速度', '线性记号', '力度记号', '演奏与换气', '装饰音与滑音',
  '倚音', '小节线与反复', '文字', '多连音', '减时线属性', '版面', '多声部'].map(title => groupsByName.find(group => group.title === title)!);

export function searchSymbols(query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const exactDynamic = terms.length === 1 && symbolGroups.some(group =>
    group.entries.some(entry => entry.command === 'dynamic:' + terms[0]));
  const seen = new Set<string>();
  return symbolGroups.map(group => ({
    title: group.title,
    entries: group.entries.filter(entry => {
      const name = `${group.title} ${entry.title} ${entry.search ?? ''}`.toLowerCase();
      const match = exactDynamic ? entry.command === 'dynamic:' + terms[0] : terms.every(term =>
        /^[a-z]{3,}$/.test(term) ? name.split(/[^a-z]+/).some(word => word.startsWith(term)) : name.includes(term));
      if (!match || terms.length && seen.has(entry.command)) return false;
      seen.add(entry.command);
      return true;
    })
  })).filter(group => group.entries.length);
}

export function mountWorkbench(commands: Record<string, Command>, panelChanged: () => void) {
  const find = <ElementType extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as ElementType;
  const sidebar = find('sidebar');
  const tabs = [...sidebar.querySelectorAll<HTMLButtonElement>('[data-panel]')];
  const workspace = sidebar.closest('.workspace')!;
  const query = find<HTMLInputElement>('palette-query');
  const groups = find('palette-groups');
  const context = find('context-menu');
  const openGroups = new Set(['线性记号', '力度记号']);
  const savedOrder = (localStorage.getItem('jianpu-palette-order') ?? '').split('|');
  const paletteOrder = [...new Set([...savedOrder.filter(title => symbolGroups.some(group => group.title === title)),
    ...symbolGroups.map(group => group.title)])];
  let draggedGroup = '';
  let panel: Panel = 'palette';
  const menuDetails = [...document.querySelectorAll<HTMLDetailsElement>('[data-menu]')];

  function setPanel(next: Panel, reveal = true) {
    panel = next;
    if (reveal) setSidebar(true);
    for (const tab of tabs) {
      const active = tab.dataset.panel === panel;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      find(`panel-${tab.dataset.panel}`).hidden = !active;
    }
  }

  function setSidebar(visible: boolean) {
    sidebar.hidden = !visible;
    workspace.classList.toggle('sidebar-hidden', !visible);
    find('show-sidebar').hidden = visible;
    panelChanged();
  }

  function sync() {
    for (const control of document.querySelectorAll<HTMLButtonElement>('button[data-command]')) {
      const command = commands[control.dataset.command!];
      control.disabled = !command || (command.enabled ? !command.enabled() : false);
      if (command?.pressed) control.setAttribute('aria-pressed', String(command.pressed()));
    }
  }

  function run(name: string) {
    const command = commands[name];
    if (!command || command.enabled && !command.enabled()) return;
    menuDetails.forEach(item => { item.open = false; });
    context.hidden = true;
    command.run();
    sync();
  }

  function drawPalette() {
    const matching = searchSymbols(query.value).sort((a, b) => paletteOrder.indexOf(a.title) - paletteOrder.indexOf(b.title));
    groups.replaceChildren(...matching.map(group => {
      const details = document.createElement('details');
      details.className = 'palette-group';
      details.open = !!query.value.trim() || openGroups.has(group.title);
      details.ontoggle = () => {
        if (query.value.trim()) return;
        if (details.open) openGroups.add(group.title);
        else openGroups.delete(group.title);
      };
      const summary = document.createElement('summary');
      summary.textContent = group.title;
      const handle = document.createElement('span');
      handle.className = 'palette-reorder';
      handle.textContent = '⠿';
      handle.title = '拖动调整面板顺序';
      handle.draggable = !query.value.trim();
      handle.onclick = event => event.preventDefault();
      handle.ondragstart = event => {
        draggedGroup = group.title;
        event.dataTransfer?.setData('text/plain', group.title);
      };
      handle.ondragend = () => { draggedGroup = ''; };
      summary.append(handle);
      details.ondragover = event => { if (draggedGroup && draggedGroup !== group.title) event.preventDefault(); };
      details.ondrop = event => {
        if (!draggedGroup || draggedGroup === group.title) return;
        event.preventDefault();
        const to = paletteOrder.indexOf(group.title);
        paletteOrder.splice(paletteOrder.indexOf(draggedGroup), 1);
        paletteOrder.splice(to, 0, draggedGroup);
        draggedGroup = '';
        localStorage.setItem('jianpu-palette-order', paletteOrder.join('|'));
        drawPalette();
      };
      const grid = document.createElement('div');
      grid.className = 'palette-grid';
      for (const entry of group.entries) {
        const control = document.createElement('button');
        control.type = 'button';
        control.className = 'palette-cell';
        control.dataset.command = entry.command;
        control.title = entry.title;
        const glyph = document.createElement('strong');
        glyph.textContent = entry.glyph;
        if (entry.command === 'tie' || entry.command === 'slur') {
          glyph.classList.add('notation-tool', 'palette-line-tool');
          glyph.innerHTML = noteLineIcon(entry.command);
        }
        if (entry.command === 'crescendo' || entry.command === 'diminuendo') glyph.innerHTML =
          `<svg width="38" height="16" viewBox="0 0 38 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="${entry.command === 'crescendo' ? 'M36 3L2 8L36 13' : 'M2 3L36 8L2 13'}"/></svg>`;
        const ornament = entry.command.slice('ornament:'.length);
        if (entry.command.startsWith('ornament:') && (ornament in ornamentOutlines || ornament === 'trill-wave')) {
          const kind = ornament === 'trill-wave' ? 'trill' : ornament as keyof typeof ornamentOutlines;
          glyph.innerHTML = `<svg width="32" height="20" viewBox="${ornament === 'trill-wave' ? -9 : -16} -13 32 20">${ornamentVector(kind, ornament === 'trill-wave' ? 17 : 0)}</svg>`;
        }
        glyph.setAttribute('aria-hidden', 'true');
        const title = document.createElement('span');
        title.textContent = entry.title;
        control.append(glyph, title);
        grid.append(control);
      }
      details.append(summary, grid);
      return details;
    }));
    find('palette-empty').hidden = !!matching.length;
    sync();
  }

  function search() {
    setPanel('palette');
    query.focus();
    query.select();
  }

  function showContext(items: { command: string; label: string }[], x: number, y: number) {
    context.replaceChildren(...items.map(item => {
      const control = document.createElement('button');
      control.setAttribute('role', 'menuitem');
      control.dataset.command = item.command;
      control.textContent = item.label;
      return control;
    }));
    sync();
    context.hidden = false;
    const bounds = context.getBoundingClientRect();
    context.style.left = `${Math.max(4, Math.min(x, innerWidth - bounds.width - 6))}px`;
    context.style.top = `${Math.max(4, Math.min(y, innerHeight - bounds.height - 6))}px`;
    context.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }

  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const target = event.target;
    const button = target.closest<HTMLButtonElement>('button[data-command]');
    if (button?.dataset.command) run(button.dataset.command);
    if (!context.contains(target)) context.hidden = true;
    for (const item of menuDetails) if (!item.contains(target)) item.open = false;
  });
  document.addEventListener('keydown', event => {
    if (context.contains(document.activeElement) && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const items = [...context.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      if (!items.length) return;
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
        : (index + items.length + (event.key === 'ArrowDown' ? 1 : -1)) % items.length;
      items[next].focus();
      return;
    }
    if (event.key === 'Escape' && (!context.hidden || menuDetails.some(item => item.open))) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const menu = menuDetails.find(item => item.open);
      menuDetails.forEach(item => { item.open = false; });
      context.hidden = true;
      (menu?.querySelector<HTMLElement>('summary') ?? find('desk')).focus({ preventScroll: true });
    }
  }, true);
  for (const menu of menuDetails) menu.addEventListener('click', event => {
    if ((event.target as Element).closest('button[id]') && menu.contains(event.target as Element)) menu.open = false;
  });
  tabs.forEach((tab, index) => {
    tab.onclick = () => setPanel(tab.dataset.panel as Panel);
    tab.onkeydown = event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      event.stopPropagation();
      const next = tabs[(index + tabs.length + (event.key === 'ArrowLeft' ? -1 : 1)) % tabs.length];
      setPanel(next.dataset.panel as Panel);
      next.focus();
    };
  });
  find<HTMLButtonElement>('hide-sidebar').onclick = () => { setSidebar(false); find('show-sidebar').focus(); };
  find<HTMLButtonElement>('show-sidebar').onclick = () => { setSidebar(true); find(`tab-${panel}`).focus(); };
  query.oninput = drawPalette;
  query.onkeydown = event => {
    if (event.key === 'Enter') groups.querySelector<HTMLButtonElement>('button:not(:disabled)')?.click();
  };
  setPanel('palette', false);
  drawPalette();
  return { setPanel, search, showContext, sync, toggleSidebar: () => setSidebar(sidebar.hidden), isHidden: () => sidebar.hidden };
}
