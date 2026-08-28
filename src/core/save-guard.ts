// 假保存守卫：把"填写完成时的表格证据"与"保存回发后的表格现状"对比。
// 巨能填的教训：接口 success / 页面不报错 ≠ 保存成功，"刷新后整表为空"才是毁档真相。
// 证据只含表格类型与行数/非空行数，绝不含任何档案内容。

import { findAchievementTable, findAwardTable, findExperienceTable, findFamilyTable, findLanguageTable } from './filler';

export interface TableEvidence {
  kind: 'achievements' | 'experiences' | 'awards' | 'family' | 'language';
  rows: number;
  filled: number;
}

function rowHasContent(row: HTMLTableRowElement): boolean {
  for (const cell of Array.from(row.cells)) {
    for (const el of Array.from(cell.querySelectorAll<HTMLInputElement>('input:not([type="hidden"]), textarea'))) {
      if (el.value.trim()) return true;
    }
    if ((cell.textContent || '').trim()) return true;
  }
  return false;
}

/** 功能：采集当前页五类动态表的存在性与内容证据（行数/非空行数）。 */
export function snapshotTableEvidence(doc: Document): TableEvidence[] {
  const out: TableEvidence[] = [];
  const seen = new Set<HTMLTableElement>();
  const push = (kind: TableEvidence['kind'], table: HTMLTableElement | null): void => {
    if (!table || seen.has(table)) return;
    seen.add(table);
    const rows = Array.from(table.rows).slice(1);
    out.push({ kind, rows: rows.length, filled: rows.filter(rowHasContent).length });
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
export function detectFakeSave(before: TableEvidence[], doc: Document): TableEvidence['kind'] | null {
  const now = snapshotTableEvidence(doc);
  const nowByKind = new Map(now.map((item) => [item.kind, item]));
  for (const prev of before) {
    if (prev.filled <= 0) continue;
    const cur = nowByKind.get(prev.kind);
    if (!cur) continue; // 表格不在本页：可能已进入下一步，不算假保存
    if (cur.filled === 0) return prev.kind;
  }
  return null;
}
