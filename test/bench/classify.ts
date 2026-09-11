// bench 四分类与只读判据(P1/P4/P5,任务书 §2 冻结口径)
// P1:每控件单票互斥归类,判定顺序 越界填 > 填错 > 漏填;拒填为正交维度(带理由,不参与三选一)。
// P4:越界判定只看生产写入台账(getWriteRecord)是否登记过,不按控件尾态值判定——
//    conditionalRestore/页面重置擦掉的写入记录仍在,依然算越界;台账为只读读取,不改生产登记。
// P5:判等与实取值独立实现,禁 import 生产判等与读值实现(标识清单见 oracle 判据 B1;引导层有静态守卫)。
import { getWriteRecord } from '../../src/core/filler';
import type { WriteRecord } from '../../src/core/filler';

export interface Expectation {
  key: string;
  expectedLiteral: string;
  /** 档案源路径(仅报表标注;E3"档案可能为空"的期望项照列,引擎 profileEmpty → missing) */
  profileField?: string;
  note?: string;
}

export interface Refusal {
  key: string;
  reason: string;
  gapId: string;
}

export type ControlClass = 'overfill' | 'wrong' | 'missing' | 'refused' | 'filled' | 'untracked';

export interface ClassifyRow {
  key: string;
  tag: string;
  cls: ControlClass;
  /** P4 attempted:生产台账是否登记过写入(registerWriteOwnership 曾被调用) */
  attempted: boolean;
  /** P4 committed:bench 独立读取器现读值(与台账尾态 after 区分,判等不依赖生产读数) */
  readShape: string;
  readDigest: string;
  expectedShape?: string;
  expectedDigest?: string;
  /** 台账登记的写入期望值原文只在内存比对,报表仅出 shape/digest(P9) */
  reason?: string;
  gapId?: string;
}

export interface BenchTally {
  overfill: number;
  wrong: number;
  missing: number;
  refused: number;
  filled: number;
  untracked: number;
}

/** 功能:控件全集枚举(与 oracle controlInventory 同口径:hidden/submit/button/image/reset/file 不计)。 */
export function enumerableControls(doc: Document): Element[] {
  return Array.from(doc.querySelectorAll('input, select, textarea')).filter((el) => {
    const type = ((el as HTMLInputElement).type || '').toLowerCase();
    return !['hidden', 'submit', 'button', 'image', 'reset', 'file'].includes(type);
  });
}

export function controlKey(el: Element): string {
  return el.getAttribute('name') || el.id || '';
}

/** 功能:P5 独立最小读取器——只依赖 DOM 标准属性,不进任何生产读数函数。 */
export function readControlValue(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (tag === 'select') return String((el as unknown as HTMLSelectElement).value ?? '');
  if (tag === 'input') {
    const input = el as HTMLInputElement;
    if (input.type === 'checkbox' || input.type === 'radio') return input.checked ? String(input.value) : '';
    return String(input.value ?? '');
  }
  return String((el as unknown as HTMLTextAreaElement).value ?? '');
}

/** 功能:P5 字面判等——期望表为逐字段字面期望,判等仅做两端去空白后的全等。 */
export function literalEqual(read: string, expectedLiteral: string): boolean {
  return read.trim() === expectedLiteral.trim();
}

export interface ClassifyInput {
  expectations: Map<string, Expectation>;
  refusals: Map<string, Refusal>;
  shape: (v: string) => string;
  digest: (v: string) => string;
}

/**
 * 功能:按 P1 口径对控件全集逐控件归类,产出纯数据行(不含 DOM 节点,可序列化可复现)。
 * 说明:越界=台账登记过但该控件属拒填清单(拒填却写)或期望外表(期望外写);
 *      "禁尾态"由 attempted(登记存在性)承载,与控件现值无关。
 */
export function classifyControls(doc: Document, input: ClassifyInput): ClassifyRow[] {
  const rows: ClassifyRow[] = [];
  for (const el of enumerableControls(doc)) {
    const key = controlKey(el);
    const record: WriteRecord | undefined = getWriteRecord(doc, el);
    const expectation = input.expectations.get(key);
    const refusal = input.refusals.get(key);
    const read = readControlValue(el);
    const row: ClassifyRow = {
      key,
      tag: el.tagName.toLowerCase(),
      cls: 'untracked',
      attempted: !!record,
      readShape: input.shape(read),
      readDigest: input.digest(read),
    };
    if (expectation) {
      row.expectedShape = input.shape(expectation.expectedLiteral);
      row.expectedDigest = input.digest(expectation.expectedLiteral);
    }
    if (record) {
      if (refusal) {
        row.cls = 'overfill';
        row.reason = '拒填清单内控件被写入(P4 台账登记在案,禁尾态豁免)';
        row.gapId = refusal.gapId;
      } else if (expectation) {
        row.cls = literalEqual(read, expectation.expectedLiteral) ? 'filled' : 'wrong';
        if (row.cls === 'wrong') row.reason = '台账有写入但实读值与期望字面不符(P5 独立判等)';
      } else {
        row.cls = 'overfill';
        row.reason = '期望外表且非拒填清单控件的期望外写入';
      }
    } else if (expectation) {
      row.cls = 'missing';
      row.reason = expectation.profileField ? `期望在列而档案/引擎未产出写入(profileField=${expectation.profileField})` : '期望在列而未产出写入';
    } else if (refusal) {
      row.cls = 'refused';
      row.reason = refusal.reason;
      row.gapId = refusal.gapId;
    }
    rows.push(row);
  }
  return rows;
}

/** 功能:P1 四分类计数(拒填正交单列;filled/untracked 供报表,不进四元组)。 */
export function tallyControls(rows: ClassifyRow[]): BenchTally {
  const tally: BenchTally = { overfill: 0, wrong: 0, missing: 0, refused: 0, filled: 0, untracked: 0 };
  for (const row of rows) tally[row.cls] += 1;
  return tally;
}
