// 只读控件候选解析与确定性消歧(PLAN v3 · P02)
// 设计:本模块是"影子编译"的安全基础——只收集候选与判定歧义,绝不写 DOM 属性、不点按钮、不建 storage。
// 与旧检测函数的关系:旧调用点(matcher/filler)仍保留其执行期标记动作;Compiler 只使用这里的只读结果。
import type { AdapterFieldContract } from './adapters';

export interface FieldCandidateResult {
  field: AdapterFieldContract;
  /** 消歧后的逻辑目标集合(radio 同 name 一组折叠为一个逻辑目标;其余控件各为一个)。 */
  logicalTargets: Element[];
  /** 实际命中的表达式(有序回退语义:仅当更早表达式无命中时才尝试下一个)。 */
  expressionUsed?: string;
  nativeIdUsed: boolean;
  ambiguous: boolean;
  reason: 'ok' | 'missing' | 'multiple' | 'no-selector';
}

function escapeCssId(id: string): string {
  // 仅允许字母数字与 _ - 直接进入;其余字符转义,避免引号/空格破坏选择器。
  return String(id).replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

/** 功能:按"单个逻辑目标"折叠候选集合(radio 按 name 分组;其余按元素一一计数)。 */
function collapseLogicalTargets(elements: Element[], driver: string): Element[] {
  if (driver !== 'radio') return elements;
  const radios = elements.filter((el) => el.tagName === 'INPUT' && (el.getAttribute('type') || 'text').toLowerCase() === 'radio');
  const others = elements.filter((el) => !radios.includes(el));
  const groups = new Map<string, Element>();
  for (const r of radios) {
    const name = r.getAttribute('name') || '';
    if (!groups.has(name)) groups.set(name, r);
  }
  return [...others, ...groups.values()];
}

/**
 * 功能:解析契约字段的目标控件(只读)。
 * 规则(PLAN v3 P02):nativeId 精确唯一命中为最高证据,命中即返回(不进回退链);
 * selectors 数组保持"有序回退"语义——A 无命中才试 B;单表达式命中多个可写控件视为真歧义;
 * radio 合法成组不误判;重复 id 也要检查(nativeId 与 id 选择器都用 querySelectorAll 收集)。
 */
export function collectContractFieldCandidates(field: AdapterFieldContract, doc: Document): FieldCandidateResult {
  const fail = (reason: FieldCandidateResult['reason'], extra?: Partial<FieldCandidateResult>): FieldCandidateResult => ({
    field,
    logicalTargets: [],
    nativeIdUsed: false,
    ambiguous: false,
    reason,
    ...extra,
  });
  if (field.nativeId) {
    const byId = Array.from(doc.querySelectorAll(`#${escapeCssId(field.nativeId)}`));
    if (byId.length === 1) {
      return { field, logicalTargets: byId, nativeIdUsed: true, ambiguous: false, reason: 'ok' };
    }
    if (byId.length > 1) {
      return { field, logicalTargets: byId, nativeIdUsed: true, ambiguous: true, reason: 'multiple' };
    }
    // nativeId 无命中:继续 selectors 回退链(漂移容错)。
  }
  const selectors = field.selectors || [];
  if (!selectors.length) return fail('no-selector');
  for (const sel of selectors) {
    let hits: Element[];
    try {
      hits = Array.from(doc.querySelectorAll(sel));
    } catch {
      continue; // 非法选择器按无命中处理,继续下一个回退表达式
    }
    if (!hits.length) continue;
    const logical = collapseLogicalTargets(hits, field.driver);
    if (logical.length === 1) {
      return { field, logicalTargets: logical, expressionUsed: sel, nativeIdUsed: false, ambiguous: false, reason: 'ok' };
    }
    // 多逻辑目标:真歧义,禁止"取第一个"。若后续回退表达式能唯一命中,
    // 按 P02 规则不得用其掩盖歧义,直接返回 blocked(字段级,不改写整页)。
    return { field, logicalTargets: logical, expressionUsed: sel, nativeIdUsed: false, ambiguous: true, reason: 'multiple' };
  }
  return fail('missing');
}
