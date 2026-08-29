// 隐藏行串（hidden blob）同步：川大/长大式"可见子表 + 隐藏行码串"的通用处理。
// 形态：每行单元格用 | 连接，行与行用 # 连接（rows.map(r => r.join('|')).join('#')）。
// 精华（取自成熟填表软件同款做法）：写完可见表后按页面实况回读重编码同步隐藏域；
// 超长时"优先缩格保行"（二分查找每格截断长度，绝不丢行）；跨页 stash + 富者优先修复。
// 糟粕（不取）：写死表 ID、破坏式清除组件状态、静默丢行的兜底。

import { withUnlocked } from './unlock';

export const BLOB_CELL_JOIN = '|';
export const BLOB_ROW_JOIN = '#';
/** 隐藏串软上限（字符）：超过时缩格保行，不静默丢行 */
export const BLOB_SOFT_CAP = 790;
const BLOB_MAX_RECOGNIZE = 20000;

export interface BlobCodecOptions {
  softCap?: number;
  cellJoin?: string;
  rowJoin?: string;
}

function trimTrailingEmpty(cells: string[]): string[] {
  const out = cells.slice();
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out;
}

/** 解析隐藏行串；空串/形状不符返回 [] */
export function parseBlobRows(value: string, opts?: BlobCodecOptions): string[][] {
  const cellJoin = opts?.cellJoin || BLOB_CELL_JOIN;
  const rowJoin = opts?.rowJoin || BLOB_ROW_JOIN;
  const raw = String(value || '').trim();
  if (!raw) return [];
  return raw
    .split(rowJoin)
    .map((line) => line.split(cellJoin).map((cell) => cell.trim()))
    .map((cells) => trimTrailingEmpty(cells))
    .filter((cells) => cells.some(Boolean));
}

/** 隐藏串是否呈现"行码串"形状（至少两行，或单行但 ≥3 格且含格分隔符）。单格/两格单行无法与普通隐藏值区分，一律不认。 */
export function blobLooksLike(value: string, opts?: BlobCodecOptions): boolean {
  const raw = String(value || '');
  if (!raw.trim() || raw.length > BLOB_MAX_RECOGNIZE) return false;
  if (/[\r\n]/.test(raw)) return false; // 行码串是单行文本；带换行的隐藏值另有含义
  if (!raw.includes(opts?.cellJoin || BLOB_CELL_JOIN)) return false; // 无格分隔符的普通隐藏值
  const rows = parseBlobRows(raw, opts);
  if (!rows.length) return false;
  if (rows.length >= 2) return true;
  // 单行串至少 3 格才算行码串（两格以内无法与普通编码/区间类隐藏值区分）
  return rows[0].length >= 3;
}

/** 富者优先评分：非空单元格总数（与成熟填表软件 scoreRows 同思路） */
export function scoreRows(rows: string[][]): number {
  return (rows || []).reduce((sum, cells) => sum + cells.filter((cell) => cell && cell.trim()).length, 0);
}

function sanitizeCell(cell: string, cellJoin: string, rowJoin: string): string {
  return String(cell || '')
    .replace(new RegExp(`[${cellJoin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`, 'g'), cellJoin === '|' ? '／' : '_')
    .replace(new RegExp(`[${rowJoin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`, 'g'), rowJoin === '#' ? '＃' : '_')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

/**
 * 编码隐藏行串。单元格中的连接符替换为全角（／＃），换行压成空格；空行丢弃。
 * 超过软上限时二分查找"每格截断长度"，保证所有行都保留（优先缩格保行）；
 * 缩到最短仍放不下时返回完整编码（绝不静默丢行，由调用方按长度告警）。
 */
export function encodeBlobRows(rows: string[][], opts?: BlobCodecOptions): string {
  const cellJoin = opts?.cellJoin || BLOB_CELL_JOIN;
  const rowJoin = opts?.rowJoin || BLOB_ROW_JOIN;
  const softCap = Math.max(0, opts?.softCap ?? BLOB_SOFT_CAP);
  const clean = (rows || [])
    .map((cells) => (cells || []).map((cell) => sanitizeCell(cell, cellJoin, rowJoin)))
    .map((cells) => trimTrailingEmpty(cells))
    .filter((cells) => cells.some(Boolean));
  if (!clean.length) return '';
  const join = (list: string[][], cap: number | null): string =>
    list.map((cells) => (cap == null ? cells : cells.map((cell) => cell.slice(0, cap))).join(cellJoin)).join(rowJoin);
  const full = join(clean, null);
  if (!softCap || full.length <= softCap) return full;
  const maxCell = Math.max(...clean.map((cells) => Math.max(...cells.map((cell) => cell.length), 0)), 1);
  let best = '';
  let lo = 4;
  let hi = maxCell;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const trial = join(clean, mid);
    if (trial.length <= softCap) {
      best = trial; // 所有行都在（join 不丢行），只需更短的格
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best || full; // 缩格仍放不下：返回完整串，不丢行
}

/** 读取表格实况行：每个数据行的可写控件值（隐藏框/按钮除外），列序 = DOM 顺序 */
export function readTableLiveRows(table: HTMLTableElement): string[][] {
  const rows: string[][] = [];
  for (const tr of Array.from(table.rows).slice(1)) {
    const controls = Array.from(
      tr.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLElement>(
        'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="image"]), select, textarea, [contenteditable="true"]',
      ),
    );
    const values = controls.map((el) => {
      if (el instanceof tr.ownerDocument.defaultView!.HTMLSelectElement) return (el as HTMLSelectElement).value || '';
      if (el.getAttribute('contenteditable') === 'true') return (el.textContent || '').trim();
      return (el as HTMLInputElement).value || '';
    });
    if (values.some((value) => value.trim())) rows.push(values);
  }
  return rows;
}

/** 富者优先：返回较富的一组（同富取后者） */
export function applyRicherRows(a: string[][], b: string[][]): string[][] {
  const sa = scoreRows(a);
  const sb = scoreRows(b);
  if (sb > sa) return b;
  if (sa > sb) return a;
  return b.length > a.length ? b : a;
}

// ===================== 跨页 stash（sessionStorage，按 host 绑定） =====================

const STASH_KEY = 'tui-table-stash';
const STASH_MAX_ENTRIES = 8;

interface TableStash {
  host: string;
  href: string;
  at: number;
  tables: Record<string, string[][]>;
}

function stashHost(doc: Document): string {
  try {
    return doc.location ? doc.location.host : '';
  } catch {
    return '';
  }
}

function readStash(doc: Document): TableStash | null {
  try {
    const raw = doc.defaultView?.sessionStorage.getItem(STASH_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as TableStash;
    if (!obj || typeof obj.tables !== 'object') return null;
    const host = stashHost(doc);
    // host 不匹配（或端口差异）时忽略，防串站
    if (host && obj.host && obj.host.replace(/:\d+$/, '') !== host.replace(/:\d+$/, '')) return null;
    return obj;
  } catch {
    return null;
  }
}

function writeStash(doc: Document, stash: TableStash): void {
  try {
    doc.defaultView?.sessionStorage.setItem(STASH_KEY, JSON.stringify(stash));
  } catch {
    // 隐私模式等无 storage 环境： stash 是尽力而为
  }
}

/** 落盘本次填写的实况行（富者优先：历史更富时保留历史） */
export function stashTableRows(doc: Document, tableKey: string, rows: string[][]): void {
  const key = String(tableKey || '').trim();
  if (!key) return;
  const list = (rows || []).map((cells) => (Array.isArray(cells) ? cells : [cells]).map((cell) => String(cell == null ? '' : cell).trim())).filter((cells) => cells.some(Boolean));
  if (!list.length) return;
  const stash = readStash(doc) || { host: stashHost(doc), href: '', at: 0, tables: {} };
  const prev = Array.isArray(stash.tables[key]) ? stash.tables[key] : [];
  if (scoreRows(list) >= scoreRows(prev)) stash.tables[key] = list;
  const keys = Object.keys(stash.tables);
  while (keys.length > STASH_MAX_ENTRIES) {
    const oldest = keys.shift();
    if (oldest) delete stash.tables[oldest];
  }
  stash.at = Date.now();
  try {
    stash.href = doc.location ? doc.location.href : stash.href;
  } catch {
    // 忽略
  }
  writeStash(doc, stash);
}

/** 读取跨页 stash 的行（host 校验通过才返回） */
export function readStashedTableRows(doc: Document, tableKey: string): string[][] | null {
  const stash = readStash(doc);
  const rows = stash?.tables[String(tableKey || '').trim()];
  return Array.isArray(rows) ? rows : null;
}

// ===================== 表格 ↔ 隐藏域 同步 =====================

export interface BlobSyncOutcome {
  /** 已用实况行回写的隐藏域 */
  synced: HTMLInputElement[];
  /** 隐藏串比实况更富（疑似回发丢行）：保留原值不动，交由外层/人工核对 */
  keptRicher: HTMLInputElement[];
  liveRows: string[][];
  encoded: string;
}

/**
 * 同步一张动态表的隐藏行串：
 * - 关联规则（保守）：隐藏域与表格同一 form、当前值已呈行码串形状、解析列数 = 实况行列数；
 *   首次出现的空隐藏域没有任何形状证据，绝不猜测写入。
 * - 隐藏串比实况更富 → 不覆盖（保留疑似丢失的行作证据），同时落盘 stash；
 * - 否则用实况行重新编码回写（页面脚本对值做过变换时以页面为准）。
 */
export function syncTableBlobs(doc: Document, table: HTMLTableElement, opts?: { stashKey?: string; softCap?: number }): BlobSyncOutcome {
  const outcome: BlobSyncOutcome = { synced: [], keptRicher: [], liveRows: readTableLiveRows(table), encoded: '' };
  const liveCols = outcome.liveRows.length ? outcome.liveRows[0].length : 0;
  if (!liveCols) return outcome;
  const scope = table.closest('form') || doc.body;
  if (!scope) return outcome;
  const candidates = Array.from(scope.querySelectorAll<HTMLInputElement>('input[type="hidden"]')).filter((el) => {
    if (!blobLooksLike(el.value)) return false;
    const parsed = parseBlobRows(el.value);
    return !!parsed.length && parsed[0].length === liveCols;
  });
  if (!candidates.length) return outcome;
  const liveScore = scoreRows(outcome.liveRows);
  for (const el of candidates) {
    const parsed = parseBlobRows(el.value);
    if (scoreRows(parsed) > liveScore) {
      outcome.keptRicher.push(el); // 疑似回发把可见行刷掉了：保留更富的旧串并落盘，便于断点续填/人工核对
    }
  }
  if (outcome.keptRicher.length === candidates.length) {
    if (opts?.stashKey) stashTableRows(doc, opts.stashKey, parseBlobRows(candidates[0].value));
    return outcome;
  }
  outcome.encoded = encodeBlobRows(outcome.liveRows, { softCap: opts?.softCap });
  for (const el of candidates) {
    if (outcome.keptRicher.includes(el)) continue;
    if (el.value === outcome.encoded) continue;
    withUnlocked(el, () => {
      const proto = HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, outcome.encoded);
      else el.value = outcome.encoded;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    outcome.synced.push(el);
  }
  if (opts?.stashKey) {
    stashTableRows(doc, opts.stashKey, outcome.liveRows);
  }
  return outcome;
}
