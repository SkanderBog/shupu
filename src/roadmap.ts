export const ROUTE_KINDS = ['segno', 'coda', 'dc', 'ds', 'tocoda', 'fine'] as const;
export type RouteKind = typeof ROUTE_KINDS[number];
export interface RouteMark {
  id: string;
  kind: RouteKind;
  target: string;
  until?: 'fine' | 'coda';
  repeat?: boolean;
}
export const routeAtStart = (mark: RouteMark) => mark.kind === 'segno' || mark.kind === 'coda';
export function routeCaption(mark: RouteMark) {
  switch (mark.kind) {
    case 'segno': return mark.target === '1' ? 'Segno' : `Segno ${mark.target}`;
    case 'coda': return mark.target === '1' ? 'Coda' : `Coda ${mark.target}`;
    case 'tocoda': return mark.target === '1' ? 'To Coda' : `To Coda ${mark.target}`;
    case 'fine': return 'Fine';
    default: return (mark.kind === 'dc' ? 'D.C.' : mark.target === '1' ? 'D.S.' : `D.S. ${mark.target}`) +
      (mark.until === 'fine' ? ' al Fine' : mark.until === 'coda' ? ' al Coda' : '');
  }
}

export function routeIssues(bars: { route?: RouteMark[] }[]) {
  const locations = bars.flatMap((bar, index) => (bar.route ?? []).map(mark => ({ mark, index })));
  return locations.flatMap(({ mark, index }) => {
    const match = mark.kind === 'ds' ? 'segno' : mark.kind === 'tocoda' ? 'coda' : undefined;
    if (match && !locations.some(other => other.mark.kind === match && other.mark.target === mark.target &&
      (match === 'segno' ? other.index <= index : other.index > index)))
      return [{ index, mark, text: routeCaption(mark) + ' 找不到有效的 ' + (match === 'segno' ? 'Segno' : 'Coda') + '。' }];
    if (routeAtStart(mark) && locations.some(other => other.mark !== mark && other.mark.kind === mark.kind && other.mark.target === mark.target))
      return [{ index, mark, text: routeCaption(mark) + ' 的目标编号重复。' }];
    if (mark.until && !locations.some(other => other.mark.kind === (mark.until === 'fine' ? 'fine' : 'tocoda')))
      return [{ index, mark, text: routeCaption(mark) + ' 缺少终止或转入尾声的记号。' }];
    return [];
  });
}
