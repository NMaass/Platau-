// Data table on .l-table: one <colgroup> of fixed widths (headers never move), optional
// sortable headers (click to sort, aria-sort, arrow slot reserved), optional row groups.
// Sort state lives in store.ui[`sort:${id}`]; app.ts handles clicks on [data-sort].
import {esc} from '../dom.ts';
import {store} from '../store.ts';

export interface Col<R> {
  key: string;
  label: string;          // header text (HTML allowed: e.g. an (i) peek)
  width: string;          // "64px" | "30%"
  num?: boolean;          // right aligned
  cell: (r: R) => string; // cell HTML
  /** sort value; omit for an unsortable column */
  sort?: (r: R) => number | string;
  /** sort descending first (ratings, salary) */
  desc?: boolean;
}
export interface TableOpts<R> {
  id: string;
  cols: Col<R>[];
  rows: R[];
  /** row groups (Active / Backup ...): rows are split by group(r) in the given order */
  groups?: {key: string; label: string; of: (r: R) => boolean}[];
  rowClass?: (r: R) => string;
  minWidth?: number;
  label?: string;
  /** default sort when the user hasn't picked one */
  defaultSort?: {key: string; dir: 'asc' | 'desc'};
  /** keep these rows where they are regardless of sort? no: sorting keeps all rows (dimmed ones included) */
}

export function getSort(id: string, def?: {key: string; dir: 'asc' | 'desc'}): {key: string; dir: 'asc' | 'desc'} | null {
  return (store.ui[`sort:${id}`] as {key: string; dir: 'asc' | 'desc'} | undefined) ?? def ?? null;
}
/** Toggle sort for a column (called by the [data-sort] click handler). */
export function toggleSort(id: string, key: string, desc: boolean): void {
  const cur = getSort(id);
  const dir = cur?.key === key ? (cur.dir === 'asc' ? 'desc' : 'asc') : (desc ? 'desc' : 'asc');
  store.ui[`sort:${id}`] = {key, dir};
}

export function sortRows<R>(rows: R[], cols: Col<R>[], s: {key: string; dir: 'asc' | 'desc'} | null): R[] {
  const c = s && cols.find((x) => x.key === s.key && x.sort);
  if (!c || !s) return rows;
  const k = s.dir === 'asc' ? 1 : -1;
  return rows.map((r, i) => ({r, i, v: c.sort!(r)})).sort((a, b) =>
    (a.v < b.v ? -k : a.v > b.v ? k : a.i - b.i)).map((x) => x.r);
}

export function table<R>(o: TableOpts<R>): string {
  const s = getSort(o.id, o.defaultSort);
  const head = o.cols.map((c) => {
    const cls = c.num ? ' class="num"' : '';
    if (!c.sort) return `<th scope="col"${cls}>${c.label}</th>`;
    const aria = s?.key === c.key ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    return `<th scope="col"${cls} aria-sort="${aria}"><button type="button" class="sort" data-sort="${esc(o.id)}:${esc(c.key)}:${c.desc ? 1 : 0}">${c.label}</button></th>`;
  }).join('');
  const tr = (r: R) => `<tr class="${o.rowClass?.(r) ?? ''}">${o.cols.map((c) => `<td${c.num ? ' class="num"' : ''}>${c.cell(r)}</td>`).join('')}</tr>`;
  let body: string;
  if (o.groups) {
    body = o.groups.map((g) => {
      const rs = sortRows(o.rows.filter(g.of), o.cols, s);
      if (!rs.length) return '';
      return `<tbody><tr><th class="grp" colspan="${o.cols.length}" scope="colgroup">${esc(g.label)}<span>${rs.length}</span></th></tr>${rs.map(tr).join('')}</tbody>`;
    }).join('');
  } else body = `<tbody>${sortRows(o.rows, o.cols, s).map(tr).join('')}</tbody>`;
  return `<div class="l-table-wrap"><table class="l-table" id="tbl-${esc(o.id)}"${o.minWidth ? ` style="min-width:${o.minWidth}px"` : ''}${o.label ? ` aria-label="${esc(o.label)}"` : ''}>
    <colgroup>${o.cols.map((c) => `<col style="width:${c.width}">`).join('')}</colgroup>
    <thead><tr>${head}</tr></thead>${body}</table></div>`;
}
