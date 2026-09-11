// 站点架构扫描：填充/报告前先"读一遍"页面结构，生成结构化描述，
// 供适配逻辑与诊断使用（网格表格列头/数据行样例/加行按钮/弹窗触发器等）。

import { findPickerTrigger, normalizeText } from './matcher';
import { routeKeyFor } from './fill-task';

export interface ScanGridTable {
  header: string[];
  rows: number;
  dataRows: number;
  writableRows: number;
  purpose: 'family' | 'awards' | 'experiences' | 'achievements' | 'cet' | 'unknown';
  /** 数据行单元格 HTML 样例（截断），用于看清网格的真实渲染结构 */
  samples: Array<{ cells: string[] }>;
  /** 表格内可找到的"新增/添加"类按钮 */
  addButtons: Array<{ tag: string; text: string; cls: string; name: string }>;
  hasSaveButton: boolean;
}

export interface SiteScan {
  url: string;
  inputs: number;
  selects: number;
  textareas: number;
  gridTables: ScanGridTable[];
  pickers: Array<{ name: string; triggerTag: string; triggerCls: string }>;
}

function cellSample(cell: Element): string {
  return (cell.innerHTML || cell.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70);
}

/** 扫描当前页面结构（同步、轻量） */
export function scanSite(doc: Document): SiteScan {
  const gridTables: ScanGridTable[] = [];
  for (const table of Array.from(doc.querySelectorAll<HTMLTableElement>('table'))) {
    const rows = Array.from(table.rows);
    if (rows.length < 2) continue;
    const header = Array.from(rows[0].cells).map((c) => normalizeText(c.textContent || '').slice(0, 16));
    const dataRows = rows.slice(1);
    const writableRows = dataRows.filter((r) => !!r.querySelector('input:not([type="hidden"]), textarea, [contenteditable="true"]')).length;
    const h = header.join(' ');
    let purpose: ScanGridTable['purpose'] = 'unknown';
    if (/(姓名|成员)/.test(h) && /关系|称谓|与本人/.test(h)) purpose = 'family';
    else if (/奖励|荣誉|获奖|奖项/.test(h)) purpose = 'awards';
    else if (/学习或工作|学习工作|工作经历/.test(h)) purpose = 'experiences';
    else if (/成果|论文|标题|刊物/.test(h)) purpose = 'achievements';
    else if (/名称|类别/.test(h) && /成绩/.test(h)) purpose = 'cet';
    const addButtons = Array.from(table.querySelectorAll('a, button, input[type="button"], input[type="submit"], span'))
      .filter((b) => {
        const t = normalizeText(`${b.textContent || ''} ${b.getAttribute('value') || ''}`);
        const cls = `${b.getAttribute('class') || ''}`.toLowerCase();
        return /新增|添加|增加|加行|插入|新行/.test(t) || /(^|[-_])add([-_]|$)|btnadd|addrow|addline|append/i.test(cls);
      })
      .slice(0, 5)
      .map((b) => ({
        tag: b.tagName.toLowerCase(),
        text: (b.textContent || b.getAttribute('value') || '').trim().slice(0, 12),
        cls: (b.getAttribute('class') || '').slice(0, 30),
        name: (b.getAttribute('name') || '').slice(0, 40),
      }));
    const hasSaveButton = Array.from(table.querySelectorAll('a, button, input, span')).some((b) =>
      /^保存$|^保存草稿$|^暂存$/.test(normalizeText(b.textContent || b.getAttribute('value') || '')),
    );
    gridTables.push({
      header,
      rows: rows.length,
      dataRows: dataRows.length,
      writableRows,
      purpose,
      samples: dataRows.slice(0, 3).map((r) => ({ cells: Array.from(r.cells).slice(0, 6).map((c) => cellSample(c)) })),
      addButtons,
      hasSaveButton,
    });
  }
  const pickers = Array.from(doc.querySelectorAll<HTMLInputElement>('input'))
    .map((i) => {
      const t = findPickerTrigger(i);
      return t ? { name: i.name || i.id || '', triggerTag: t.tagName.toLowerCase(), triggerCls: (t.getAttribute('class') || '').slice(0, 30) } : null;
    })
    .filter((p): p is { name: string; triggerTag: string; triggerCls: string } => !!p)
    .slice(0, 20);
  return {
    url: doc.location ? doc.location.href : '',
    inputs: doc.querySelectorAll('input:not([type="hidden"])').length,
    selects: doc.querySelectorAll('select').length,
    textareas: doc.querySelectorAll('textarea').length,
    gridTables,
    pickers,
  };
}

/**
 * 功能:I02 诊断用站点扫描——去掉页面原文(表头文本、单元格样例、按钮文本),
 * 只保留结构签名与由文本长度推导的分类。持久化与报告都必须使用本函数的结果。
 */
export function sanitizeScanForDiagnostics(scan: SiteScan): SiteScan {
  return {
    url: routeKeyFor(scan.url),
    inputs: scan.inputs,
    selects: scan.selects,
    textareas: scan.textareas,
    gridTables: scan.gridTables.map((table) => ({
      rows: table.rows,
      dataRows: table.dataRows,
      writableRows: table.writableRows,
      purpose: table.purpose,
      hasSaveButton: table.hasSaveButton,
      header: table.header.map((head) => `h:${head.length}`),
      samples: [],
      addButtons: table.addButtons.map((button) => ({ tag: button.tag, text: '按钮', cls: `class:${button.cls.length}`, name: `name:${button.name.length}` })),
    })),
    pickers: scan.pickers.map((picker) => ({ name: `name:${picker.name.length}`, triggerTag: picker.triggerTag, triggerCls: `class:${picker.triggerCls.length}` })),
  };
}
