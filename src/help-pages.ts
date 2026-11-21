import { introduction, manualText } from './manual-content.js';
import { symbolGroups } from './workbench.js';
import { keyName } from './shortcuts.js';

const token = /\{\{([^{}]+)\}\}/g;
const heading = /^(#{1,3}) (.+)$/;
const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
type Outline = { level: number; node: HTMLElement }[];

export function mountHelpPages(keys: (id: string) => string[], download: (file: Blob, name: string) => void,
  print: (pages: HTMLElement) => void) {
  const keyLabels = (ids: string) => ids.split(',').map(id => keys(id).map(keyName).join(' / ') || '未绑定');
  const quote = String.fromCharCode(96);
  function fullText() {
    const groups = symbolGroups.map(group => '## ' + group.title + '\n\n' + group.entries.map(entry => {
      const caption = /^tempo:(metro|mod):/.test(entry.command) ? entry.title + ' ' + entry.glyph : entry.title;
      const binding = keys(entry.command).length ? ' ｜ {{' + entry.command + '}}' : '';
      return caption + binding;
    }).join('\n\n')).join('\n\n');
    return manualText.trim() + '\n\n# 附录　符号面板索引\n\n按面板分类列出符号和命令。已分配的快捷键显示在名称后。需要查看锚点、参数与输出效果时，可从正文对应章节阅读。\n\n' + groups;
  }
  const markdown = () => '# 数谱功能手册\n\n' + fullText().replace(/^(#{1,3}) /gm, '#$1 ')
    .replace(token, (_, ids: string) => keyLabels(ids).map(label => label.includes(quote)
      ? quote.repeat(2) + ' ' + label + ' ' + quote.repeat(2) : quote + label + quote).join('、')) + '\n';
  function render(source: string, prefix: string) {
    const article = document.createElement('article');
    const outline: Outline = [];
    for (const block of source.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean)) {
      const head = block.match(heading);
      const level = head?.[1].length ?? 0;
      const node = document.createElement(level ? 'h' + (level + 1) : 'p');
      const text = head?.[2] ?? block;
      let start = 0;
      for (const match of text.matchAll(token)) {
        node.append(text.slice(start, match.index));
        for (const [i, label] of keyLabels(match[1]).entries()) {
          if (i) node.append('、');
          const cap = document.createElement('kbd');
          cap.textContent = label;
          node.append(cap);
        }
        start = match.index + match[0].length;
      }
      node.append(text.slice(start));
      if (level) {
        node.id = prefix + '-' + outline.length;
        outline.push({ level, node });
      }
      article.append(node);
    }
    return { article, outline };
  }

  const dialog = get<HTMLDialogElement>('manual');
  const body = get('manual-body');
  const outline = get('manual-nav');
  const find = get<HTMLInputElement>('manual-search');
  const clear = get<HTMLButtonElement>('manual-clear-search');
  const count = get('manual-search-count');
  const rail = get('manual-rail');
  let matches: HTMLElement[][] = [];
  let active = -1;
  let animationFrame: number | undefined;
  const offset = (node: HTMLElement) => node.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;

  function refreshRail() {
    if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(() => {
      animationFrame = undefined;
      if (!dialog.open) return;
      rail.replaceChildren(...matches.map((pieces, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'manual-rail-hit';
        button.style.top = 100 * Math.min(.999, Math.max(0, offset(pieces[0]) / Math.max(1, body.scrollHeight))) + '%';
        button.title = '跳到第 ' + (index + 1) + ' 处匹配';
        button.setAttribute('aria-label', button.title);
        button.tabIndex = -1;
        button.onclick = () => jump(index);
        return button;
      }));
      rail.hidden = !matches.length;
    });
  }

  function jump(index: number) {
    if (!matches.length) return;
    matches[active]?.forEach(part => part.classList.remove('manual-current-match'));
    active = (index + matches.length) % matches.length;
    const pieces = matches[active];
    pieces.forEach(part => part.classList.add('manual-current-match'));
    body.scrollTop = offset(pieces[0]) - body.clientHeight * .28;
    count.textContent = (active + 1) + ' / ' + matches.length;
  }

  function search() {
    for (const pieces of matches) for (const mark of pieces) {
      const parent = mark.parentNode;
      mark.replaceWith(document.createTextNode(mark.textContent ?? ''));
      parent?.normalize();
    }
    matches = [];
    active = -1;
    const query = find.value.trim();
    clear.hidden = !find.value;
    count.textContent = '';
    if (query) {
      // Escape the query before matching so punctuation is always literal.
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(escaped, 'giu');
      for (const block of body.querySelectorAll('h2, h3, h4, p')) {
        const text = block.textContent ?? '';
        const hits = [...text.matchAll(pattern)];
        if (!hits.length) continue;
        const pending = hits.map(hit => ({ start: hit.index, end: hit.index + hit[0].length, pieces: [] as HTMLElement[] }));
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        const nodes: Text[] = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
        let cursor = 0;
        for (const node of nodes) {
          const value = node.data;
          const next = cursor + value.length;
          const fragment = document.createDocumentFragment();
          let used = 0;
          for (const hit of pending) {
            if (hit.start >= next || hit.end <= cursor) continue;
            const start = Math.max(0, hit.start - cursor);
            const end = Math.min(value.length, hit.end - cursor);
            const mark = document.createElement('mark');
            mark.className = 'manual-match';
            mark.textContent = value.slice(start, end);
            fragment.append(value.slice(used, start), mark);
            used = end;
            hit.pieces.push(mark);
          }
          if (used) {
            fragment.append(value.slice(used));
            node.replaceWith(fragment);
          }
          cursor = next;
        }
        matches.push(...pending.map(hit => hit.pieces).filter(pieces => pieces.length));
      }
      count.textContent = matches.length ? matches.length + ' 处' : '无匹配';
    }
    refreshRail();
  }

  const workspace = get('manual-workspace');
  const outlineToggle = get<HTMLButtonElement>('manual-toggle-outline');
  outlineToggle.onclick = () => {
    outline.hidden = !outline.hidden;
    workspace.classList.toggle('outline-closed', outline.hidden);
    outlineToggle.setAttribute('aria-expanded', String(!outline.hidden));
    refreshRail();
  };
  find.oninput = search;
  find.onkeydown = event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    jump(active < 0 ? event.shiftKey ? matches.length - 1 : 0 : active + (event.shiftKey ? -1 : 1));
  };
  dialog.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'f') return;
    event.preventDefault();
    find.focus();
    find.select();
  });
  clear.onclick = () => { find.value = ''; search(); find.focus(); };
  new ResizeObserver(refreshRail).observe(body);
  document.fonts?.ready.then(refreshRail);

  get('manual-markdown').onclick = () => download(new Blob([markdown()], { type: 'text/markdown;charset=utf-8' }), '数谱功能手册.md');
  get('manual-pdf').onclick = () => {
    const { article } = render(fullText(), 'print-manual');
    const title = document.createElement('h1');
    title.textContent = '数谱功能手册';
    article.prepend(title);
    print(article);
  };
  return {
    openIntro() {
      get('guide-content').replaceChildren(render(introduction, 'intro').article);
      get<HTMLDialogElement>('guide').showModal();
    },
    openManual() {
      const doc = render(fullText(), 'manual-topic');
      body.replaceChildren(doc.article);
      // Outline groups entries by heading depth while the reading pane remains one continuous document.
      const root = document.createElement('ul');
      const lists = [root];
      for (const { level, node } of doc.outline) {
        while (lists.length < level) {
          const list = document.createElement('ul');
          lists.at(-1)?.lastElementChild?.append(list);
          lists.push(list);
        }
        lists.length = level;
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = '#' + node.id;
        link.textContent = node.textContent;
        link.onclick = event => {
          event.preventDefault();
          body.scrollTop = offset(node) - 12;
          node.tabIndex = -1;
          node.focus({ preventScroll: true });
        };
        item.append(link);
        lists.at(-1)!.append(item);
      }
      outline.replaceChildren(root);
      matches = [];
      find.value = '';
      rail.replaceChildren();
      dialog.showModal();
      body.scrollTop = 0;
      search();
    }
  };
}
