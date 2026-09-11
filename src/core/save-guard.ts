// 假保存守卫：把"填写完成时的表格证据"与"保存回发后的表格现状"对比。
// 巨能填的教训：接口 success / 页面不报错 ≠ 保存成功，"刷新后整表为空"才是毁档真相。
// 证据只含表格类型与行数/非空行数，绝不含任何档案内容。

import { findAchievementTable, findAwardTable, findExperienceTable, findFamilyTable, findLanguageTable } from './filler';

export interface TableEvidence {
  kind: 'achievements' | 'experiences' | 'awards' | 'family' | 'language';
  rows: number;
  filled: number;
  /** P12:证据归属的脱敏路由键(origin+pathname);跨页/跨系统不比较,防误报。 */
  routeKey?: string;
  /** 表格结构身份摘要；行数和值不参与，防止把另一张同类表当作原表。 */
  tableId?: string;
}

export interface TableEvidenceScope {
  routeKey: string;
  packageId: string;
  packageVersion: string;
  pageId: string;
  contractHash: string;
}

export interface TableEvidenceEnvelope {
  schema: 2;
  at: number;
  scope: TableEvidenceScope;
  tables: TableEvidence[];
}

const TABLE_EVIDENCE_TTL_MS = 30 * 60_000;

/** 功能：对静态结构取非加密摘要，避免将标题/选择器原文写入证据；不用于认证。 */
function evidenceHash(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

/** 功能：生成完整页面作用域，配置变更即使未升版本也使旧表格证据失效。 */
export function makeTableEvidenceScope(routeKey: string, packageId: string, packageVersion: string, pageId: string, contract: unknown): TableEvidenceScope {
  return { routeKey, packageId, packageVersion, pageId, contractHash: evidenceHash(JSON.stringify(contract) || 'null') };
}

/** 功能：采集带版本、逻辑页面与时间戳的表格证据，不包含任何填写值。 */
export function createTableEvidenceEnvelope(doc: Document, scope: TableEvidenceScope, now = Date.now()): TableEvidenceEnvelope {
  return { schema: 2, at: now, scope: { ...scope }, tables: snapshotTableEvidence(doc, scope.routeKey) };
}

/** 功能：严格读取同页同配置且未过期的证据；旧格式、未来时间和不完整范围均拒绝。 */
export function readScopedTableEvidence(raw: string | null, scope: TableEvidenceScope, now = Date.now()): TableEvidence[] {
  try {
    const envelope = JSON.parse(raw || 'null') as TableEvidenceEnvelope | null;
    if (!envelope || envelope.schema !== 2 || !Number.isFinite(envelope.at) || envelope.at > now || now - envelope.at > TABLE_EVIDENCE_TTL_MS) return [];
    const keys: (keyof TableEvidenceScope)[] = ['routeKey', 'packageId', 'packageVersion', 'pageId', 'contractHash'];
    if (!envelope.scope || !keys.every((key) => typeof scope[key] === 'string' && !!scope[key] && scope[key] === envelope.scope[key])) return [];
    if (!Array.isArray(envelope.tables)) return [];
    if (!envelope.tables.every((table) => table && ['achievements', 'experiences', 'awards', 'family', 'language'].includes(table.kind)
      && typeof table.tableId === 'string' && !!table.tableId && table.routeKey === scope.routeKey
      && Number.isInteger(table.rows) && table.rows >= 0 && Number.isInteger(table.filled) && table.filled >= 0 && table.filled <= table.rows)) return [];
    return envelope.tables;
  } catch { return []; }
}

// F10:行内容判定必须识别真实数据——"编辑/删除/操作"等按钮文字不算行已填;原生 select 真实选中值(占位除外)纳入非空判定。
function rowHasContent(row: HTMLTableRowElement): boolean {
  for (const cell of Array.from(row.cells)) {
    for (const el of Array.from(cell.querySelectorAll<HTMLInputElement>('input:not([type="hidden"]):not([type="password"]), textarea'))) {
      if (['button', 'submit', 'reset', 'file'].includes(el.type)) continue;
      if (['checkbox', 'radio'].includes(el.type) && !el.checked) continue;
      if (el.value.trim()) return true;
    }
    for (const sel of Array.from(cell.querySelectorAll<HTMLSelectElement>('select'))) {
      const opt = sel.selectedOptions && sel.selectedOptions[0];
      if (opt && opt.value.trim() && !/请选择|----/.test(opt.text || '')) return true;
    }
    // 先识别真实控件，再取纯文本；占位option和同格“编辑”按钮都不算数据。
    const copy = cell.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('input,textarea,select,button,a,.btn,.link,script,style').forEach((node) => node.remove());
    const text = (copy.textContent || '').trim();
    if (text && !/^[编辑删除修改操作查看详情]+$/.test(text)) return true;
  }
  return false;
}

/** 功能：采集当前页五类动态表的存在性与内容证据（行数/非空行数）。 */
export function snapshotTableEvidence(doc: Document, routeKey?: string): TableEvidence[] {
  const out: TableEvidence[] = [];
  const seen = new Set<HTMLTableElement>();
  const push = (kind: TableEvidence['kind'], table: HTMLTableElement | null): void => {
    if (!table || seen.has(table)) return;
    seen.add(table);
    const rows = Array.from(table.rows).slice(1);
    const position = Array.from(doc.querySelectorAll('table')).indexOf(table);
    const headers = Array.from(table.rows[0]?.cells || [], (cell) => (cell.textContent || '').trim());
    const tableId = evidenceHash(JSON.stringify({ kind, id: table.id, form: table.closest('form')?.id || '', position, headers }));
    out.push({ kind, rows: rows.length, filled: rows.filter(rowHasContent).length, routeKey, tableId });
  };
  push('achievements', findAchievementTable(doc)?.table || null);
  push('experiences', findExperienceTable(doc)?.table || null);
  push('awards', findAwardTable(doc)?.table || null);
  push('family', findFamilyTable(doc)?.table || null);
  push('language', findLanguageTable(doc)?.table || null);
  return out;
}

/**
 * 功能：判断"保存回发后"是否疑似未生效。
 * 原理：同一类表格此前有非空内容，现在表格还在但内容全空 → 假保存；表格整体消失视为翻页，不告警。
 * 返回命中的表格类型，未命中返回 null。
 */
export function detectFakeSave(before: TableEvidence[], doc: Document, routeKey?: string): TableEvidence['kind'] | null {
  // P12:证据带路由归属时,只比较同一逻辑页(换页/换校不误报)。
  if (routeKey && before.some((item) => item.routeKey && item.routeKey !== routeKey)) return null;
  const now = snapshotTableEvidence(doc, routeKey);
  const nowByKind = new Map(now.map((item) => [item.kind, item]));
  for (const prev of before) {
    if (prev.filled <= 0) continue;
    const cur = nowByKind.get(prev.kind);
    if (!cur) continue; // 表格不在本页：可能已进入下一步，不算假保存
    if (prev.tableId && prev.tableId !== cur.tableId) continue;
    if (cur.filled === 0) return prev.kind;
  }
  return null;
}
