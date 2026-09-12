// A1 · 事件策略层（R1 翻绿目标）：eventPolicy ∈ {full, soft, silent} 收敛全部值变更派发口。
// 设计约束（INV-A1）：
//  - full 与迁移前各口事件集**逐字面等价**（tail 参数保留口别差异），默认路径零行为变化；
//  - soft 抑制失焦族（blur/focusout）——ASP 页 blur 触发页端校验/重算导致写后被清的场景；
//  - silent 零事件（页面自有轮询读取的隐藏载体）；
//  - 风险级：分数/GPA/日期类字段仅在 ASP 页自动降 soft（任务书 A1）；合同可声明覆盖（最高优先）；
//  - 不变量：本层只决定"派发哪些事件"，不改写入、不改 readNativeControlValue 读数（INV-A1-d）。
// 消费纪律：写入与登记（registerWriteOwnership）语义与时机不在本层职责内（INV-A1-a）。

export type EventPolicy = 'full' | 'soft' | 'silent';

/**
 * 值变更事件尾部的口别差异（迁移自既有派发口，full=现行逐字面）：
 *  - blur-focusout：input+change+blur(bubbles:false)+focusout（filler.setInputValue / date-drivers 现行）
 *  - blur-bubble ：input+change+blur(bubbles:true,用 win.Event)（control-drivers.emitChange / blue-flat 现行）
 *  - blur-only   ：input+change+blur(bubbles:false)（minimal-picker 现行；W-6 收敛）
 *  - change-only ：仅 change 不派 input（radio 组/分类下拉现行——input 会污染受控组件输入历史；W-6 收敛）
 *  - none        ：仅 input+change（组件/隐藏载体两件套现行）
 */
export type ValueEventTail = 'blur-focusout' | 'blur-bubble' | 'blur-only' | 'change-only' | 'none';

/** 任务书 A1 风险级默认表：分数/GPA/排名/语言成绩/日期类字段路径 → ASP 页自动 soft。 */
const RISK_SOFT_FIELD = /(^|\.)(gpa|score|cet4|cet6|rank|comprehensiveRank|gradeRank|birthday)|csrq|csny|rxny|byny|rxrq|byrq|date/i;

const aspLikeCache = new WeakMap<Document, boolean>();

/** 功能：判定页面是否 ASP 回发族（__doPostBack / WebForm_DoPostBackWithOptions）——软事件抑制的目标场景。 */
export function isAspLikePage(doc: Document): boolean {
  const cached = aspLikeCache.get(doc);
  if (cached !== undefined) return cached;
  const win = doc.defaultView as unknown as Record<string, unknown> | null;
  let result = false;
  if (win && (typeof win.__doPostBack === 'function' || typeof win.WebForm_DoPostBackWithOptions === 'function')) {
    result = true;
  } else {
    const html = doc.documentElement ? doc.documentElement.innerHTML : '';
    result = /__doPostBack|WebForm_DoPostBackWithOptions/.test(html.slice(0, 300000));
  }
  aspLikeCache.set(doc, result);
  return result;
}

export interface PolicyInput {
  /** 调用口默认策略（不传=full：现行行为）。 */
  policy?: EventPolicy;
  /** 合同声明覆盖（AdapterFieldContract.eventPolicy），最高优先。 */
  declared?: EventPolicy;
  /** 档案字段路径（风险级映射用；通用链传 FIELD_RULES 的 field，未知传 null）。 */
  field?: string | null;
  /** 页面是否 ASP 族（调用方可用 isAspLikePage(doc) 预计算）。 */
  aspPage?: boolean;
}

/** 功能：解析最终策略——合同声明 > (ASP 页 × 风险字段→soft) > 口默认（缺省 full）。 */
export function resolveEventPolicy(input: PolicyInput): EventPolicy {
  if (input.declared) return input.declared;
  if (input.aspPage && input.field && RISK_SOFT_FIELD.test(input.field)) return 'soft';
  return input.policy ?? 'full';
}

export interface DispatchValueEventsOptions extends PolicyInput {
  /** 口别尾部（full 下的现行事件集差异），迁移自各派发口。 */
  tail: ValueEventTail;
}

/**
 * 功能：统一值变更事件派发口（A1 收敛点）。
 * 说明：只派发事件，不写值、不登记——调用方先完成赋值（原型 setter）与台账登记。
 * full=逐字面现行；soft=去掉失焦族；silent=零事件。win.Event 优先（跨文档事件类一致性）。
 */
export function dispatchValueEvents(el: Element, opts: DispatchValueEventsOptions): void {
  const policy = resolveEventPolicy(opts);
  if (policy === 'silent') return;
  const win = el.ownerDocument ? el.ownerDocument.defaultView : null;
  const EventCtor = win?.Event || Event;
  // change-only：radio/分类下拉现行协议不派 input（防受控组件输入历史污染）。
  if (opts.tail !== 'change-only') el.dispatchEvent(new EventCtor('input', { bubbles: true }));
  el.dispatchEvent(new EventCtor('change', { bubbles: true }));
  if (policy === 'soft') return;
  switch (opts.tail) {
    case 'blur-focusout':
      el.dispatchEvent(new EventCtor('blur', { bubbles: false }));
      el.dispatchEvent(new EventCtor('focusout', { bubbles: true }));
      break;
    case 'blur-bubble':
      if (win) el.dispatchEvent(new win.Event('blur', { bubbles: true }));
      else el.dispatchEvent(new EventCtor('blur', { bubbles: true }));
      break;
    case 'blur-only':
      el.dispatchEvent(new EventCtor('blur', { bubbles: false }));
      break;
    case 'change-only':
    case 'none':
    default:
      break;
  }
}

/**
 * 功能：forceChange——学校/专业三联等联动场景，即使值未变也保证一次 change 派发以触发下级刷新。
 * 说明：供 picker/三联消费；独立于 dispatchValueEvents（不做策略降级——联动信号不可被抑制）。
 */
export function dispatchForcedChange(el: Element): void {
  const win = el.ownerDocument ? el.ownerDocument.defaultView : null;
  const EventCtor = win?.Event || Event;
  el.dispatchEvent(new EventCtor('change', { bubbles: true }));
}
