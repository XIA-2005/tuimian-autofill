// 安全填充器：兼容 React/Vue 受控组件（原生 setter + 事件派发），支持文本框/下拉/单选/文本域，
// 日期值按输入框 placeholder 提示的格式自适应，长文本域由结构化列表合成。

import { isEmptyValue, isPlaceholderOption, isSemanticEqual, isTextFieldEqual, compareKindForField } from './value-semantics';
import { dispatchValueEvents, isAspLikePage } from './event-policy';
import { fixedFieldLabel, safeDiagnosticField, sanitizeDiagnosticValue } from './fill-telemetry';
import { DetectedField, detectAllFields, detectComponentDropdownFields, detectField, FIELD_RULES, FieldRule, findPickerTrigger, isVisible, normalizeText } from './matcher';
import { isRegionLike, regionCode6, regionKeywords, regionMatchTokens, regionTreeTokens } from './regionutil';
import { composeListText, Experience, FamilyMember, getByPath, Profile, Application } from './profile';
import { matchAdapter } from './adapters';
import { fillDateControl } from './date-drivers';
import { PopupPickContext, resolveCodeNameBinding, verifyCodeNameBinding } from './popup-binding';
import {
  getResumablePickers, isPickerExhausted, markPickerDone, markPickerFailed,
  markPickerStep, resetActivePickerAttempts, startPicker,
} from './picker-state-machine';
import { pickSchool } from './school-picker-driver';
import { pickMajor } from './major-picker-driver';
import { pickComponentOption } from './component-select-drivers';
import { fillRetroHonorSlots } from './retro-honor-fill';
import { withUnlocked } from './unlock';
import { mainWorldJqxSelectLabel } from './world-bridge';
import {
  OWN_UI_SEL,
  cellHasControl,
  clickAttempt,
  clickPageAction,
  dataRowsOf,
  docAlive,
  DynamicTableSpec,
  ExistingRowOutcome,
  findAddButton,
  isDoPostbackAction,
  isPlaceholderRow,
  logRowDecision,
  OpenDialogInfo,
  postbackJustFired,
  rowFullyEmpty,
  rowHasInput,
  runDynamicTableFill,
  TableFillCtx,
  validDataRows,
} from './dynamic-table';
import { handleDialogAfterClick, sleep, visibleDialogRoots } from './dynamic-table';
import { currentDocumentEpoch, currentProfileRevision, documentIdentity } from './fill-session';
import type { RunSnapshot } from './fill-session';

// 机器层与统一内核已收敛至 dynamic-table.ts；这里保持既有公开 API 的导出位置不变
export { handleDialogAfterClick, sleep, visibleDialogRoots } from './dynamic-table';

export interface FillItem {
  label: string;
  field: string | null;
  status: 'filled' | 'profileEmpty' | 'noMatch' | 'failed' | 'skipped' | 'picker' | 'alreadyCorrect' | 'conflict';
  reason?: string;
  valuePreview?: string;
  /** 稳定问题码（core/error-codes.ts）：报告与漏填清单据此给出"用户该做什么" */
  issueCode?: string;
  /** 对应页面控件（仅内存使用，跨消息传递时会被剥离） */
  el?: Element;
  /** F06:本轮期望写入值(仅内存;settle 用它比较真实 DOM 值,不依赖受控框架的实例级 value)。 */
  expectedValue?: string;
  /** 弹窗字段语义与可接受代码；用于学校/专业代码和名称的精确成对校验。 */
  pickerContext?: PopupPickContext;
}

export interface FillStats {
  total: number;
  filled: number;
  skipped: number;
  noMatch: number;
  profileEmpty: number;
  failed: number;
  /** 弹窗选择框（只读输入框+选择按钮），由自动点选半自动处理 */
  picker: number;
  /**
   * 断点续填的 picker 数量：从 sessionStorage 恢复出"未 done 状态"的 picker 字段计数。
   * >0 时表示扩展已记录这些字段等待下次重试；用户主动点填充时会被清零。
   */
  pickerResumeCount: number;
}

export interface FillResult {
  stats: FillStats;
  items: FillItem[];
}

export interface FillAllOptions {
  /** 仅用户主动开始新一轮填写时为 true；自动补填必须为 false，避免解除人工跳过。 */
  resetPickerAttempts?: boolean;
  /**
   * P03:本轮执行排除回调——返回 true 的逻辑目标视为已被更高权威(合同)认领,
   * 通用链不再写入、不进入 manual/date/picker 分支;结果以 skipped 项保留供统计。
   */
  excludeEl?: (el: Element) => boolean;
}

/** 常见编码值 → 显示文本 的别名映射（用于下拉框/单选） */
export const VALUE_ALIASES: Record<string, string[]> = {
  男: ['男', '1', '01', 'm', 'male'],
  女: ['女', '2', '02', 'f', 'female', '0'],
  中共党员: ['中共党员', '党员', '正式党员', '01', '1'],
  中共预备党员: ['预备党员', '02'],
  共青团员: ['共青团员', '团员', '03'],
  群众: ['群众', '13', '04', '0'],
  汉族: ['汉族', '01'],
  未婚: ['未婚', '1'],
  已婚: ['已婚', '2'],
  非军人: ['非军人', '非现役军人', '0', '否', '未服兵役'],
  中国: ['中国', 'china', 'cn', '01'],
  居民身份证: ['居民身份证', '身份证', '01', '1'],
  英语: ['英语', 'english', '01', '1'],
  是: ['是', '1', 'y', 'yes', '有', 'true'],
  否: ['否', '0', '2', 'n', 'no', '无', 'false'],
  通过: ['通过', '是', '1', 'y', '有'],
  未通过: ['未通过', '否', '0', 'n', '无', '没有'],
};

function escapeAttr(s: string): string {
  return (s || '').replace(/["\\]/g, '\\$&');
}

export function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string, field?: string | null): void {
  const doc = el.ownerDocument;
  // P07:文本类写入前捕获原值(仅当新值与现值不同,避免清空/等值调用污染快照)。
  if (doc && readableControlValue(el) !== String(value)) captureBeforeValue(doc, el);
  // 写前临时解锁：readonly/disabled 控件的值页面校验器与表单序列化会忽略，造成"回读通过、保存丢失"
  beginInternalWrite();
  try {
    withUnlocked(el, () => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, value);
      else el.value = value;
      // A1:事件派发收敛至 event-policy——full 与原四事件逐字面等价；field 语境供 ASP 页风险级降 soft。
      dispatchValueEvents(el, { tail: 'blur-focusout', field: field ?? null, aspPage: doc ? isAspLikePage(doc) : false });
    });
  } finally {
    endInternalWrite();
  }
  // G02:真实写入登记 ownership(清空调用 value='' 时同样登记,由调用方决定语义)。
  if (doc) registerWriteOwnership(doc, el, String(value), 'text');
}

/**
 * 功能：向 jqx 虚拟列表的过滤框输入查询词，并触发其键盘过滤处理器。
 *
 * 原理说明：广工大 jqxListBox 不监听普通 `change/blur`，而是在 `keyup` 后读取过滤框。
 * 搜索阶段保持输入框焦点，不发送 Enter，避免误选当前第一项；最终选择仍由精确候选匹配完成。
 */
async function setJqxFilterValue(el: HTMLInputElement, value: string): Promise<void> {
  const win = el.ownerDocument.defaultView;
  const proto = win?.HTMLInputElement?.prototype || HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  el.focus();
  const EventCtor = win?.Event || Event;
  const KeyboardCtor = win?.KeyboardEvent || KeyboardEvent;
  const InputCtor = win?.InputEvent || EventCtor;
  // 先清空旧过滤条件，再逐字触发输入事件。jqx 内部保存了上次查询快照，一次性替换完整字符串时
  // 某些版本不会进入过滤分支；逐字序列与真实键盘输入保持一致。
  if (setter) setter.call(el, '');
  else el.value = '';
  el.dispatchEvent(new EventCtor('input', { bubbles: true }));
  el.dispatchEvent(new KeyboardCtor('keyup', { key: 'Backspace', code: 'Backspace', keyCode: 8, bubbles: true }));
  let prefix = '';
  for (const char of value) {
    prefix += char;
    el.dispatchEvent(new KeyboardCtor('keydown', { key: char, code: 'Unidentified', keyCode: 229, bubbles: true }));
    if (setter) setter.call(el, prefix);
    else el.value = prefix;
    try {
      el.dispatchEvent(new InputCtor('input', { bubbles: true, data: char, inputType: 'insertText' } as InputEventInit));
    } catch {
      el.dispatchEvent(new EventCtor('input', { bubbles: true }));
    }
    el.dispatchEvent(new KeyboardCtor('keyup', { key: char, code: 'Unidentified', keyCode: 229, bubbles: true }));
    await sleep(12);
  }
}

/** 按 placeholder 提示把 2003-05-12 / 2025-06 这类值转成页面要求的格式 */
function formatDateForInput(raw: string, el: HTMLInputElement): string {
  const v = raw.trim();
  const m = /^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?$/.exec(v) || /^(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?$/.exec(v);
  if (!m) return raw;
  const y = m[1];
  const mo = m[2].padStart(2, '0');
  const hasDay = m[3] !== undefined;
  const d = hasDay ? m[3].padStart(2, '0') : '';
  const ph = (el.getAttribute('placeholder') || '') + (el.getAttribute('data-label') || '');
  if (!ph.trim()) return raw;
  const phl = ph.toLowerCase();
  const has = (re: RegExp) => re.test(phl);
  const sep = ph.includes('/') ? '/' : ph.includes('.') ? '.' : ph.includes('-') ? '-' : '';
  if (!hasDay) {
    if (has(/yyyy\s*[\/.\-年]?\s*m+/) || has(/yyyym/)) {
      if (ph.includes('年')) return `${y}年${mo}月`;
      return sep ? `${y}${sep}${mo}` : y + mo;
    }
    return raw;
  }
  if (has(/yyyy\s*[\/.\-年]?\s*m+\s*[\/.\-月]?\s*d+|yyyymmdd|yyyymd/)) {
    if (ph.includes('年')) return `${y}年${mo}月${d}日`;
    return sep ? `${y}${sep}${mo}${sep}${d}` : y + mo + d;
  }
  return raw;
}

function pickOption(el: HTMLSelectElement, index: number): void {
  const doc = el.ownerDocument;
  beginInternalWrite();
  try {
    // 禁用下拉的选中值会被表单序列化忽略；写前临时启用，写后恢复
    withUnlocked(el, () => {
      const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
      if (desc && desc.set) desc.set.call(el, el.options[index].value);
      else el.selectedIndex = index;
      // A1/W-6:派发收敛至 event-policy（tail=none 与原两件套逐字面等价）。
      dispatchValueEvents(el, { tail: 'none' });
    });
  } finally {
    endInternalWrite();
  }
  // G02:select 写入登记 ownership(清除也走这里,记录随后由 clearPageFill 删除)。
  if (doc) registerWriteOwnership(doc, el, el.options[index].value, 'native-select');
}

function setSelectValue(el: HTMLSelectElement, value: string): boolean {
  const want = normalizeText(value);
  const options = Array.from(el.options);
  if (!options.length) return false;
  // 常见编码选项 "010101|哲学"：按 | 拆分后匹配名称部分
  const optionParts = (o: HTMLOptionElement): string[] => {
    const t = o.text.split(/[|｜:：]/).map(normalizeText).filter(Boolean);
    const v = o.value.split(/[|｜:：]/).map(normalizeText).filter(Boolean);
    return [...t, ...v];
  };
  const exact = options.find((o) => optionParts(o).includes(want));
  if (exact) {
    pickOption(el, exact.index);
    return true;
  }
  const alias = VALUE_ALIASES[want];
  if (alias) {
    for (const o of options) {
      const tv = optionParts(o).join('');
      if (alias.some((a) => tv.includes(normalizeText(a)))) {
        pickOption(el, o.index);
        return true;
      }
    }
  }
  return false;
}

function radioLabel(r: HTMLInputElement): string {
  const wrap = r.closest('label');
  if (wrap && wrap.textContent && wrap.textContent.trim()) return wrap.textContent.trim();
  const next = r.nextSibling;
  if (next && next.nodeType === Node.TEXT_NODE && next.textContent) return next.textContent.trim();
  const parent = r.parentElement;
  if (parent) {
    const t = parent.textContent ? parent.textContent.trim() : '';
    if (t && t.length <= 10) return t;
  }
  return r.value;
}

/**
 * 功能:G01 按 name + 所属表单限定 radio 组——同名 radio 分布在多个 form 时不得串组。
 * 规则:优先用元素所属 form(或最近的 form/表格行容器);无容器时退回全文档同名。
 */
export function radioGroupOf(el: HTMLInputElement): HTMLInputElement[] {
  const doc = el.ownerDocument || document;
  const name = el.getAttribute('name') || '';
  if (!name) return [el];
  const scope: Element | null = el.form || el.closest('form') || el.closest('table') || null;
  const all = Array.from(doc.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${escapeAttr(name)}"]`));
  if (!scope) return all;
  return all.filter((r) => (r.form || r.closest('form') || r.closest('table')) === scope);
}

function setRadioGroup(el: HTMLInputElement, value: string): boolean {
  const group = radioGroupOf(el);
  if (!group.length) return false;
  const doc = el.ownerDocument || document;
  void doc;
  const want = normalizeText(value);
  const candidates = VALUE_ALIASES[want] || [value];
  for (const r of group) {
    const rl = normalizeText(radioLabel(r));
    if (!rl) continue;
    if (candidates.some((c) => rl.includes(normalizeText(c)))) {
      if (!r.checked) {
        r.checked = true;
        r.click();
        // A1/W-6:派发收敛至 event-policy（tail=change-only 与原单 change 逐字面等价——radio 不派 input）。
        dispatchValueEvents(r, { tail: 'change-only' });
      }
      return true;
    }
  }
  return false;
}

function fillControl(d: DetectedField, value: unknown): boolean {
  const el = d.el;
  const tag = el.tagName;
  if (tag === 'SELECT') return setSelectValue(el as HTMLSelectElement, String(value));
  if (tag === 'TEXTAREA') {
    const text = String(value);
    setInputValue(el as HTMLTextAreaElement, text, d.rule?.field ?? null);
    // F06:写后必须回读真实 DOM 值(受控框架可能在事件处理中立刻还原)。
    return readNativeControlValue(el) === text;
  }
  const input = el as HTMLInputElement;
  switch (input.type) {
    case 'radio':
      return setRadioGroup(input, String(value));
    case 'checkbox':
      // 复选框语义复杂（如"是否服从调剂"、多选获奖类别），一律留人工确认
      return false;
    default: {
      const expected = formatDateForInput(String(value), input);
      setInputValue(input, expected, d.rule?.field ?? null);
      return readNativeControlValue(input) === expected;
    }
  }
}

/** 功能:读取控件的"可写值"快照(仅标量;select 取选中值;checkbox/radio 取 checked 文本)。 */
export function readableControlValue(el: Element): string {
  const tag = el.tagName;
  if (tag === 'SELECT') return (el as HTMLSelectElement).value;
  if (tag === 'TEXTAREA') return (el as HTMLTextAreaElement).value;
  if (tag === 'INPUT') {
    const input = el as HTMLInputElement;
    if (input.type === 'checkbox' || input.type === 'radio') return input.checked ? (input.value || 'on') : '';
    return input.value;
  }
  return '';
}

/**
 * 功能:F06 读取控件真实 DOM 值——用原型 getter 绕过 React/Vue 在元素实例上安装的 value tracker。
 * 说明:受控框架会劫持实例级 value(读回的是框架内部逻辑值),导致"已被框架还原"仍被读成写入值;
 * 原型 getter 反映真实 DOM 状态,是写入回读与稳定验证的可靠依据。
 */
export function readNativeControlValue(el: Element): string {
  const tag = el.tagName;
  const win = el.ownerDocument ? el.ownerDocument.defaultView : null;
  if (tag === 'INPUT') {
    const input = el as HTMLInputElement;
    if (input.type === 'checkbox' || input.type === 'radio') return input.checked ? (input.value || 'on') : '';
    const proto = (win && (win as unknown as { HTMLInputElement?: typeof HTMLInputElement }).HTMLInputElement ? (win as unknown as { HTMLInputElement: typeof HTMLInputElement }).HTMLInputElement.prototype : HTMLInputElement.prototype);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    return desc && desc.get ? String(desc.get.call(input) ?? '') : input.value;
  }
  if (tag === 'TEXTAREA') {
    const proto = (win && (win as unknown as { HTMLTextAreaElement?: typeof HTMLTextAreaElement }).HTMLTextAreaElement ? (win as unknown as { HTMLTextAreaElement: typeof HTMLTextAreaElement }).HTMLTextAreaElement.prototype : HTMLTextAreaElement.prototype);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    return desc && desc.get ? String(desc.get.call(el as HTMLTextAreaElement) ?? '') : (el as HTMLTextAreaElement).value;
  }
  if (tag === 'SELECT') return (el as HTMLSelectElement).value;
  return '';
}

// G02:写入记录(doc → el → 记录)。ownership 只能由真实写入登记,markEl(UI 高亮)不再授予所有权。
export interface WriteRecord {
  /** 写前原值(空态也保存)。 */
  before: string;
  /** 本轮期望语义值。 */
  expected: string;
  /** 写入后真实 DOM 值。 */
  after: string;
  driver: string;
  /** 用户/未知来源干预过该控件(值即使后来相同也不恢复可清除权限)。 */
  userIntervened: boolean;
  /** H02:写入时的轮次身份(原轮 runId)——恢复必须与当前轮一致。 */
  runId?: string;
  /** H02:写入时的文档实例+代际(epoch 字符串),跨导航/新 Document 失效。 */
  epoch: string;
  /** H02:写入时的档案修订——档案变更后旧记录不得授权恢复。 */
  revision: number;
}
const writeRecords = new WeakMap<Document, Map<Element, WriteRecord>>();
// P07:写入前快照(doc → el → 写前原值,含空态)。仅驱动可逆的普通标量捕获;用于失败后的有条件恢复。
const beforeFillValues = new WeakMap<Document, Map<Element, string>>();
// G02:内部写入深度——写入期间触发的 input/change 不算用户干预。
let internalWriteDepth = 0;
// H02:当前写入作用域(由编排入口在每轮开始时登记)。写入记录据此绑定 runId/档案修订/文档代际。
let activeWriteScope: { doc: Document; runId?: string; revision: number; epoch: string } | null = null;
/** 功能:H02 进入一轮写入作用域;未登记时记录只绑定当前文档代际与修订(仍不得跨修订恢复)。 */
export function beginWriteScope(doc: Document, run?: Pick<RunSnapshot, 'runId'>): void {
  activeWriteScope = {
    doc,
    runId: run?.runId,
    revision: currentProfileRevision(doc),
    epoch: `${documentIdentity(doc)}:${currentDocumentEpoch(doc)}`,
  };
}
export function endWriteScope(): void {
  activeWriteScope = null;
}
/** 功能:标记进入/退出内部写入(供事件监听区分扩展写入与用户编辑)。 */
export function beginInternalWrite(): void {
  internalWriteDepth += 1;
}
export function endInternalWrite(): void {
  internalWriteDepth = Math.max(0, internalWriteDepth - 1);
}
/** 功能:记录外部(用户/页面)对控件的干预;内部写入期间的事件忽略。 */
export function noteExternalInput(el: Element | null): void {
  if (!el || internalWriteDepth > 0) return;
  const doc = el.ownerDocument;
  if (!doc) return;
  const rec = writeRecords.get(doc)?.get(el);
  if (rec) rec.userIntervened = true;
}
/** 功能:查询控件是否被用户/未知来源干预过。 */
export function isUserIntervened(doc: Document, el: Element): boolean {
  return !!writeRecords.get(doc)?.get(el)?.userIntervened;
}

/** 功能:捕获控件写前原值(空态也保存);已捕获不覆盖。 */
export function captureBeforeValue(doc: Document, el: Element): void {
  if (!beforeFillValues.has(doc)) beforeFillValues.set(doc, new Map());
  const map = beforeFillValues.get(doc);
  if (map && !map.has(el)) map.set(el, readableControlValue(el));
}

/** 功能:读取写前原值(未捕获返回 undefined)。 */
export function getBeforeValue(doc: Document, el: Element): string | undefined {
  return beforeFillValues.get(doc)?.get(el);
}

/**
 * 功能:G02 登记一次真实写入(before/expected/after/driver),ownership 只来自这里。
 * 说明:markEl 仅做 UI 高亮,不授予所有权;合同/通用/组件/picker 的写入路径都必须调用本函数。
 */
export function registerWriteOwnership(doc: Document, el: Element, expected: string, driver = 'text'): void {
  let map = writeRecords.get(doc);
  if (!map) {
    map = new Map();
    writeRecords.set(doc, map);
  }
  const before = getBeforeValue(doc, el) ?? readableControlValue(el);
  // H02:记录绑定原轮 runId、文档代际与档案修订;作用域缺失时按当前文档即时取值(仍受修订/代际约束)。
  const scope = activeWriteScope && activeWriteScope.doc === doc ? activeWriteScope : null;
  map.set(el, {
    before,
    expected,
    after: readNativeControlValue(el),
    driver,
    userIntervened: false,
    runId: scope?.runId,
    epoch: scope?.epoch ?? `${documentIdentity(doc)}:${currentDocumentEpoch(doc)}`,
    revision: scope?.revision ?? currentProfileRevision(doc),
  });
}

/** 功能:查询某控件是否在本轮被本扩展写入过(写入记录为准)。 */
export function isOwnedByFill(doc: Document, el: Element): boolean {
  return !!writeRecords.get(doc)?.get(el);
}

/** 功能:读取本轮写入后的值快照(无记录返回 undefined)。 */
export function getOwnedValue(doc: Document, el: Element): string | undefined {
  return writeRecords.get(doc)?.get(el)?.after;
}

/** 功能:读取完整写入记录(供恢复/清除/诊断使用)。 */
export function getWriteRecord(doc: Document, el: Element): WriteRecord | undefined {
  return writeRecords.get(doc)?.get(el);
}

export function markEl(el: Element, kind: 'filled' | 'missing' | 'empty'): void {
  // G02:仅 UI 高亮;所有权由 registerWriteOwnership 单独登记(高亮不能授予清除权限)。
  el.classList.remove('tui-filled', 'tui-missing', 'tui-empty');
  el.classList.add(kind === 'filled' ? 'tui-filled' : kind === 'empty' ? 'tui-empty' : 'tui-missing');
  el.setAttribute('data-tui', kind);
}

export function clearHighlights(doc: Document): void {
  doc.querySelectorAll('[data-tui]').forEach((el) => {
    el.classList.remove('tui-filled', 'tui-missing', 'tui-empty');
    el.removeAttribute('data-tui');
  });
}

/** 长文类字段才允许用档案 essay 自动填写；备注/推荐人信息等绝不拿个人陈述顶上 */
const MANUAL_ESSAY_LABEL = /陈述|自述|研究计划|职业规划|申请理由|个人介绍|个人简介/;

interface ManualEssay {
  kind: string;
  content: string;
  field: string;
}

/** 功能：按标签语义匹配档案长文（essays 原子表）；语义不明确时仅在档案只有一条长文时兜底。 */
function pickEssayForManual(profile: Profile, label: string): ManualEssay | null {
  if (!MANUAL_ESSAY_LABEL.test(normalizeText(label))) return null;
  const essays = profile.essays
    .map((row, i) => ({ kind: row.kind || '', content: (row.content || '').trim(), field: `essays[${i}]` }))
    .filter((row) => row.content);
  if (!essays.length) return null;
  const want = normalizeText(label);
  const kindHit = essays.find((row) => row.kind && (want.includes(normalizeText(row.kind)) || normalizeText(row.kind).includes(want)));
  return kindHit || (essays.length === 1 ? essays[0] : null);
}

/**
 * 功能：读取页面给出的字数上限证据。优先级：maxlength 属性 > 邻近文案（"不超过/最多/限 N 字"）。
 * 证据范围：控件属性 + 所在单元格/标签容器 + 同行文本（表格布局的上限说明常写在兄弟单元格里）。
 * 没有可信证据返回 null——没有证据绝不猜上限，也绝不自动截断长文。
 */
function detectCharLimit(el: Element): number | null {
  const html = el as HTMLInputElement | HTMLTextAreaElement;
  const attr = html.getAttribute ? html.getAttribute('maxlength') : null;
  if (attr && /^\d{1,5}$/.test(attr.trim()) && Number(attr) > 0) return Number(attr);
  const scope = el.closest('td,th,label,li,p,dt,dd,.form-item,.form-group,.el-form-item,.layui-form-item');
  const rowScope = el.closest('tr') || (scope ? scope.closest('tr') : null);
  const text = normalizeText(
    `${(html.getAttribute && html.getAttribute('placeholder')) || ''} ${(html.getAttribute && html.getAttribute('title')) || ''} ${scope ? scope.textContent : ''} ${rowScope ? rowScope.textContent : ''}`,
  );
  const m =
    /(?:最多|不超过|限填?|以内|上限)[^\d]{0,4}(\d{2,5})\s*(?:个)?(?:汉字|字|字符)/.exec(text) ||
    /(\d{2,5})\s*(?:个)?(?:字|字符)(?:以里|以内)/.exec(text);
  return m ? Number(m[1]) : null;
}

/**
 * 功能：清除本页已填——只清空本扩展标记为 filled 的控件值（用户手填/半填内容不受影响），
 * 并移除全部高亮标记。绝不触碰密码/验证码（从未标记）、未标记字段与服务器已保存内容。
 */
export function clearPageFill(doc: Document): number {
  // F03:清除以"所有权记录"为准(不再依赖 data-tui 高亮标记——同值再填轮会清掉标记,但记录必须延续)。
  // 只清:本轮确实写入、此后未被用户改动、仍在该文档中的目标;无所有权/未知目标一律不清。
  const records = writeRecords.get(doc);
  if (!records) {
    clearHighlights(doc);
    return 0;
  }
  let cleared = 0;
  for (const el of Array.from(records.keys())) {
    if (!doc.contains(el)) {
      records.delete(el); // 节点已离开文档:让出所有权
      continue;
    }
    const rec = records.get(el);
    if (!rec) continue;
    // G02:用户/未知来源干预过 → 永久让出(值即使后来相同也不恢复可清除权限)。
    if (rec.userIntervened) {
      records.delete(el);
      continue;
    }
    if (readableControlValue(el) !== rec.after) {
      records.delete(el); // 值偏离写入后快照:来源不确定,让出所有权保留现值
      continue;
    }
    const tag = el.tagName;
    if (tag === 'SELECT') {
      const sel = el as HTMLSelectElement;
      const reset = Array.from(sel.options).find((o) => !o.value || /请选择|----/.test(o.text || ''));
      if (reset) {
        pickOption(sel, reset.index);
        cleared++;
      }
    } else if (tag === 'TEXTAREA') {
      setInputValue(el as HTMLTextAreaElement, '');
      cleared++;
    } else if (tag === 'INPUT') {
      const input = el as HTMLInputElement;
      if (['checkbox', 'radio', 'submit', 'button', 'file', 'password'].includes(input.type)) continue;
      setInputValue(input, '');
      cleared++;
    } else if (el.getAttribute('contenteditable') === 'true') {
      el.textContent = '';
      cleared++;
    }
    records.delete(el);
    markEl(el, 'empty');
  }
  clearHighlights(doc);
  return cleared;
}

export type RestoreVerdict = 'restored' | 'alreadyRestored' | 'restoreFailed' | 'notAttempted';

/**
 * 功能:G06 有条件恢复——只有"本轮真实写入过且状态可证明"的文本目标才恢复。
 * 条件(缺一即 notAttempted):同文档且节点仍连接;存在写入记录(ownership);
 * 记录未被用户/未知来源干预;driver 为可逆文本且真实 input.type 仍可逆(日期/radio/文件/密码不按文本恢复);
 * H02:记录的原轮 runId / 文档代际 / 档案修订必须与调用方显式传入的原轮 ctx 及当前状态一致——
 * 提高档案修订、导航、换轮后旧记录不得恢复。
 * 区分:页面已回到写前值 → alreadyRestored(无需动作,不作为"实际恢复"证据);
 * 实际写回成功 → restored;写回后回读不一致 → restoreFailed。
 */
export function conditionalRestore(doc: Document, el: Element, ctx: RunSnapshot | null | undefined): RestoreVerdict {
  if (!ctx) return 'notAttempted'; // H02:缺原轮 context 一律不恢复
  if (!el.isConnected || el.ownerDocument !== doc) return 'notAttempted';
  const record = getWriteRecord(doc, el);
  if (!record) return 'notAttempted'; // 缺 ownership:不得凭写前快照恢复
  if (record.userIntervened) return 'notAttempted'; // 用户/未知来源干预过
  if (record.driver !== 'text') return 'notAttempted'; // 仅可逆文本驱动(日期/radio/组件不可通用撤销)
  if (!record.runId || record.runId !== ctx.runId) return 'notAttempted'; // H02:跨轮记录不恢复
  const epochNow = `${documentIdentity(doc)}:${currentDocumentEpoch(doc)}`;
  if (record.epoch !== epochNow || ctx.epoch !== epochNow) return 'notAttempted'; // H02:导航/新文档失效
  const revisionNow = currentProfileRevision(doc);
  if (record.revision !== revisionNow || ctx.profileRevision !== revisionNow) return 'notAttempted'; // H02:档案修订后失效
  const tag = el.tagName;
  if (tag === 'TEXTAREA') {
    /* 文本域可逆 */
  } else if (tag === 'INPUT') {
    // H02:以真实 input.type 为准,不因登记为 text 就把日期/文件等当文本恢复。
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
    if (!['text', 'tel', 'email', 'url', 'search'].includes(type)) return 'notAttempted';
  } else {
    return 'notAttempted';
  }
  const before = record.before;
  const current = readNativeControlValue(el);
  if (current === before) return 'alreadyRestored'; // 页面已回原值:无动作
  if (current !== record.after) return 'notAttempted'; // 既非写后值也非原值:来源不明
  try {
    setInputValue(el as HTMLInputElement | HTMLTextAreaElement, before);
  } catch {
    return 'restoreFailed';
  }
  if (readNativeControlValue(el) === before) {
    writeRecords.get(doc)?.delete(el); // 已回写前状态:不再具备可清除所有权
    return 'restored';
  }
  return 'restoreFailed';
}

/**
 * 功能:P04 已有值语义判定(仅普通标量:text/textarea/原生 select)。
 * 空→照写;语义相等→alreadyCorrect(不 setter/click、不占清除所有权);不同→conflict(保留原值,仅该目标暂停)。
 * 弹窗/组件/只读日期类由调用方排除,不在此判定,维持既有驱动路径。
 */
function existingValueDecision(d: DetectedField, target: string): 'empty' | 'equal' | 'different' | 'unknown' {
  const el = d.el;
  const field = (d.rule && d.rule.field) || '';
  if (el.tagName === 'SELECT') {
    const sel = el as HTMLSelectElement;
    const opt = sel.selectedOptions[0];
    if (!opt || isPlaceholderOption(opt.value, opt.text || '')) return 'empty';
    // H01:删除"无显式 selected 且停在首项=浏览器默认选中"的 DOM 推断——用户点选首项不会留下 selected 属性,
    // 该推断会把用户真实选择当空值覆盖。空值只来自占位文本/空值规则或页面合同的显式声明。
    const candidates = [opt.text.trim(), opt.value.trim()];
    const aliases = VALUE_ALIASES[target] || [];
    if (candidates.includes(target.trim()) || aliases.some((a) => candidates.includes(a))) return 'equal';
    return 'different';
  }
  if (el.tagName === 'INPUT' && (el as HTMLInputElement).type.toLowerCase() === 'radio') {
    // G01:同 name 跨 form 不串组。
    const radios = radioGroupOf(el as HTMLInputElement);
    const checked = radios.find((r) => r.checked);
    if (!checked) return 'empty';
    const label = (checked.labels?.[0]?.textContent || checked.closest('label')?.textContent || checked.nextElementSibling?.textContent || '').replace(/\s+/g, '');
    const candidates = [label, checked.value].map((x) => String(x).replace(/\s+/g, ''));
    const aliases = VALUE_ALIASES[target] || [];
    const targetN = String(target).replace(/\s+/g, '');
    if (candidates.includes(targetN) || aliases.some((a) => candidates.includes(a))) return 'equal';
    return 'different';
  }
  const isTextualInput = el.tagName === 'INPUT' && ['text', 'tel', 'email', 'number', 'url', '', 'date', 'month'].includes((el as HTMLInputElement).type.toLowerCase());
  if (!isTextualInput && el.tagName !== 'TEXTAREA') return 'unknown';
  const input = el as HTMLInputElement;
  if ((input.readOnly || input.disabled)) return 'unknown';
  const current = input.value;
  if (isEmptyValue(current)) return 'empty';
  const kind = compareKindForField(field);
  if (kind.kind === 'date') {
    // 日期类仅在两侧都能按精度解析时判定,避免把页面自定义格式误读为不等。
    return kind.precision && isSemanticEqual(kind.precision, current, target) ? 'equal' : 'different';
  }
  return isTextFieldEqual(field, current, target) ? 'equal' : 'different';
}

/** 判断控件是否有"弹窗选择"行为：带"选择"触发按钮的输入框一律走弹窗（真实值常是隐藏编码/弹窗点选结果，直接注入文本会写坏代码列导致数据库截断） */
function hasPopupBehavior(d: DetectedField): boolean {
  const el = d.el;
  // 组件下拉（值隐藏域或组件本体）：一律走弹窗/组件点选，绝不直接注入文本
  const widgetMark = (el as HTMLElement).getAttribute ? (el as HTMLElement).getAttribute('data-tui-widget') : null;
  if (widgetMark === 'dropdown' || widgetMark === 'dropdown-value') return true;
  if (el.tagName !== 'INPUT') return false;
  const input = el as HTMLInputElement;
  const isChoice = ['radio', 'checkbox'].includes(input.type);
  if (isChoice) return false;
  if (input.type === 'hidden') return !!d.pickerTrigger;
  if (d.pickerTrigger) return true;
  if (input.readOnly || input.disabled) return true;
  return false;
}

/**
 * 蓝色系统复古奖励槽（上交/中南/南农/湖南等）：
 * 填写页只有 txthjmc0~4 / txthjsj0~4 / txtpm0~4 静态文本框，无动态表格。
 * 在 fillAll 中，detectAllFields 之前调用：把槽内控件加入 handled 防止被报 noMatch，
 * 同时把填写结果并入 preItems/preStats 统一计入报告。
 */
function fillRetroHonorTablesInFillAll(
  profile: Profile,
  doc: Document,
  handled: Set<Element>,
  preItems: FillItem[],
  preStats: { filled: number; profileEmpty: number },
): void {
  const { filled, items } = fillRetroHonorSlots(profile, doc);
  for (const item of items) {
    preItems.push(item);
    if (item.el) handled.add(item.el);
    if (item.status === 'filled') preStats.filled++;
    else if (item.status === 'profileEmpty') preStats.profileEmpty++;
  }
}

/**
 * 功能：识别并填写当前页面字段，同时生成可回读的结果清单。
 *
 * 用户主动发起新一轮填写时重置 picker 尝试；延时补填传入 false，保留本轮人工跳过状态，
 * 避免人工接管后的字段被后台轮次再次打开。其余字段继续沿用既有完整填写能力。
 */
export function fillAll(profile: Profile, doc: Document, rules: FieldRule[] = FIELD_RULES, options: FillAllOptions = {}): FillResult {
  clearHighlights(doc);
  // reset-on-click：用户主动点击"一键填充"时清零 picker 状态机的未完成项 attempt
  // （与 rowJobsDebug 的 reset-on-click 行为对齐）。sessionStorage 仍保留状态证据，
  // 但 attempt 归 0、state 回到 'idle'，让用户从干净状态重新开始。
  if (options.resetPickerAttempts !== false) resetActivePickerAttempts(doc);
  // 断点续填计数：read-on-click 后仍可能存在 "state≠done" 的 picker 字段（如 opening 阶段被中断）。
  // 这里记录的是 reset 之后的"可恢复 picker 字段数"，供 fillSummary 展示。
  const pickerResumeCount = getResumablePickers(doc).length;
  // 先处理"家庭成员表格"与"外语/计算机水平表格"（列头定义含义的裸表格），其单元格不再参与常规匹配
  const handled = new Set<Element>();
  const preItems: FillItem[] = [];
  const preStats = { filled: 0, profileEmpty: 0 };
  fillFamilyTables(profile, doc, handled, preItems, preStats);
  fillCetTables(profile, doc, handled, preItems, preStats);
  fillExperienceTables(profile, doc, handled, preItems, preStats);
  fillAwardTables(profile, doc, handled, preItems, preStats);
  // 蓝色系统复古奖励槽（上交/中南/南农/湖南等）：无动态表，只有 txthjmc/txthjsj/txtpm 静态输入。
  // 必须在 detectAllFields 之前处理并把控件加入 handled，否则常规匹配会把它们全部打 noMatch。
  fillRetroHonorTablesInFillAll(profile, doc, handled, preItems, preStats);

  // 组件下拉（页面上没有原生 select 的 jqx/自定义组件，如 ehall gsapp 的性别/政治面貌）先识别：
  // 它会把值载体（隐藏域/组件显示输入框）打上 data-tui-widget 标记，随后常规检测自动排除这些元素（消除 noMatch 噪音）
  // G01:被合同认领/歧义的节点在检测阶段即排除——它们的目标由合同结果代表,
  // 不再产生"通用内部跳过"条目(避免同目标重复统计与绕过)。
  const excludedByContract = (el: Element): boolean => !!options.excludeEl?.(el);
  const widgetFields = detectComponentDropdownFields(doc, rules).filter((w) => !handled.has(w.el) && !excludedByContract(w.el));
  const detected = detectAllFields(doc, rules).filter((d) => !handled.has(d.el) && !excludedByContract(d.el));
  for (const w of widgetFields) {
    if (detected.some((d) => d.el === w.el)) continue;
    detected.push(w);
  }
  // F03:radio 同 name 同规则只保留一个逻辑目标(组),避免逐节点重复结果/重复写组。
  const radioSeen = new Set<string>();
  const dedupedDetected: typeof detected = [];
  for (const d of detected) {
    if (d.el.tagName === 'INPUT' && (d.el as HTMLInputElement).type === 'radio' && d.rule) {
      const key = `${d.rule.field}\0${(d.el as HTMLInputElement).name}`;
      if (radioSeen.has(key)) continue;
      radioSeen.add(key);
    }
    dedupedDetected.push(d);
  }
  const items: FillItem[] = [...preItems];
  const stats: FillStats = { total: dedupedDetected.length + preItems.length, filled: preStats.filled, skipped: 0, noMatch: 0, profileEmpty: preStats.profileEmpty, failed: 0, picker: 0, pickerResumeCount };

  for (const d of dedupedDetected) {
    if (d.skip) {
      stats.skipped++;
      items.push({
        label: d.label,
        field: null,
        status: 'skipped',
        reason: d.skip === 'captcha' ? '验证码/安全字段，请人工填写' : '密码字段，请人工填写',
        el: d.el,
      });
      continue;
    }
    if (!d.rule) {
      stats.noMatch++;
      items.push({ label: d.label, field: null, status: 'noMatch', issueCode: 'E1101', el: d.el });
      markEl(d.el, 'missing');
      continue;
    }
    const isDateLike =
      d.rule.field === 'basic.birthday' ||
      /(?:^|\.)(?:startDate|endDate|date|birthday)$/i.test(d.rule.field || '') ||
      (d.el.tagName === 'INPUT' && ['date', 'month'].includes((d.el as HTMLInputElement).type));
    if (d.rule.manual) {
      // 人工长文类（个人陈述/自述/研究计划等）：页面给出可信字数上限、档案长文放得下才自动填写（绝不静默截断）
      const essay = pickEssayForManual(profile, d.label);
      const limit = detectCharLimit(d.el);
      const content = essay?.content?.trim() || '';
      const currentEssayText = (d.el as HTMLTextAreaElement | HTMLInputElement).value?.trim() || '';
      if (currentEssayText) {
        // F02:已有内容(可能是用户自写/上轮写入)绝不静默覆盖。
        if (content && currentEssayText === content) {
          items.push({ label: d.label, field: essay?.field || d.rule.field, status: 'alreadyCorrect', reason: '页面已有相同长文,跳过写入', el: d.el });
          continue;
        }
        stats.skipped++;
        items.push({ label: d.label, field: essay?.field || d.rule.field, status: 'skipped', reason: '页面已有长文内容,保留现有内容(不覆盖)', issueCode: 'E1206', el: d.el });
        markEl(d.el, 'missing');
        continue;
      }
      if (essay && content && limit && content.length <= limit && fillControl(d, content)) {
        stats.filled++;
        items.push({
          label: d.label,
          field: essay.field,
          status: 'filled',
          reason: `已按页面上限 ${limit} 字自动填写（共 ${content.length} 字，未截断）`,
          valuePreview: `${content.slice(0, 30)}…`,
          el: d.el,
          expectedValue: content,
        });
        markEl(d.el, 'filled');
        continue;
      }
      stats.skipped++;
      const reason = limit
        ? `页面限 ${limit} 字${essay ? `，档案长文 ${content.length} 字超限` : '，档案中未找到匹配的长文'}：请人工粘贴`
        : d.rule.manual;
      items.push({ label: d.label, field: essay?.field || d.rule.field, status: 'skipped', reason, issueCode: 'E1206', el: d.el });
      markEl(d.el, 'missing');
      continue;
    }
    let value: unknown;
    if (d.rule.derive) value = deriveValue(profile, d.rule.derive, doc);
    else if (d.rule.compose) value = composeListText(profile, d.rule.compose);
    else value = getByPath(profile, d.rule.field);
    if (value === undefined || value === null || String(value).trim() === '') {
      stats.profileEmpty++;
      items.push({ label: d.label, field: d.rule.field, status: 'profileEmpty', issueCode: 'E1102', el: d.el });
      markEl(d.el, 'empty');
      continue;
    }
    // 出生年月类字段只填到"月"（如 2003-05），不填日
    let v = String(value);
    if (d.rule.field === 'basic.birthday') {
      const l = normalizeText(d.label);
      if (l.includes('年月') && !l.includes('日')) {
        const mm = /^(\d{4})[-/.](\d{1,2})/.exec(v);
        if (mm) v = `${mm[1]}-${mm[2].padStart(2, '0')}`;
      }
    }
    // 入学/毕业年月（东华等只读日期框配 My97 日历）：写成 YYYYMM 紧凑格式，避免站点日期控件把值重置成"今天"
    if (d.rule.field === 'education.startDate' || d.rule.field === 'education.endDate') {
      const elTmp = d.el as HTMLInputElement;
      const locked = elTmp.readOnly || elTmp.getAttribute('readonly') !== null || /ireadonly/.test(elTmp.className || '');
      const dhuLike = /yzbm\.dhu\.edu\.cn/i.test(doc.location ? doc.location.href : '');
      if (locked && dhuLike) {
        const mm = /^(\d{4})[-/.](\d{1,2})/.exec(v);
        if (mm) v = `${mm[1]}${mm[2].padStart(2, '0')}`;
      }
    }
    // P10b:超限不静默截断——保留页面原值(通常为空)并提示人工精简;
    // 数据库列长约束是站点问题,不应以裁剪用户核心信息(身份证/电话/代码等一律不裁)换取写入成功。
    const cap = FIELD_LENGTH_CAPS[d.rule.field];
    if (cap && v.length > cap) {
      items.push({ label: d.label, field: d.rule.field, status: 'skipped', reason: `档案值 ${v.length} 字超过页面安全上限 ${cap},为避免静默截断已跳过,请人工精简`, issueCode: 'E1206', el: d.el });
      markEl(d.el, 'missing');
      continue;
    }
    // P04:已有值语义(仅普通标量;弹窗/日期类保持既有驱动路径)。
    if (!hasPopupBehavior(d)) {
      const verdict = existingValueDecision(d, v);
      if (verdict === 'equal') {
        items.push({ label: d.label, field: d.rule.field, status: 'alreadyCorrect', reason: '页面已有相同值,跳过写入(不触发事件)', el: d.el });
        continue;
      }
      if (verdict === 'different') {
        items.push({ label: d.label, field: d.rule.field, status: 'conflict', reason: '页面已有不同值,已保留原值(未覆盖)', el: d.el });
        markEl(d.el, 'missing');
        continue;
      }
    }
    // 弹窗选择框（只读/禁用/隐藏输入框 + 选择按钮、Show 显示框）：不直接注入文本（真实值往往是隐藏编码），交给自动点选处理。
    // 日期类字段除外：值本质就是文本（年月格式），直接注入并同步页面状态。
    const input = d.el as HTMLInputElement;
    if (hasPopupBehavior(d) && !isDateLike) {
      stats.picker++;
      const codeEntry = profile.codebook[d.rule.field];
      const pickerInput = d.el as HTMLInputElement;
      const readSelectorList = (attr: string): string[] => {
        try {
          const parsed = JSON.parse(pickerInput.getAttribute(attr) || '[]');
          return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : [];
        } catch {
          return [];
        }
      };
      const pickerCtx: PopupPickContext = {
        profilePath: pickerInput.getAttribute('data-tui-picker-profile') || d.rule.field,
        expectedCode: pickerInput.getAttribute('data-tui-picker-code') || undefined,
        codeAliases: codeEntry ? Object.values(codeEntry.codes).filter(Boolean) : [],
        codeSelectors: readSelectorList('data-tui-picker-code-selectors'),
        nameSelectors: readSelectorList('data-tui-picker-name-selectors'),
        displaySelectors: readSelectorList('data-tui-picker-display-selectors'),
        pickerProtocol: (pickerInput.getAttribute('data-tui-picker-protocol') || undefined) as PopupPickContext['pickerProtocol'],
        cascadeLabels: readSelectorList('data-tui-picker-cascade-labels'),
        componentDriver: (pickerInput.getAttribute('data-tui-component-driver') || undefined) as PopupPickContext['componentDriver'],
        triggerSelectors: readSelectorList('data-tui-picker-trigger-selectors'),
        frameNames: readSelectorList('data-tui-picker-frame-names'),
        frameSrcPatterns: readSelectorList('data-tui-picker-frame-patterns'),
      };
      // 断点续填：登记到 picker 状态机（state='opening', attempt=0, 缓存 value + context）
      // - 之前已 done：保留 done 状态，避免用户已填好的字段被标记为重试
      // - 之前已 failed (达到 MAX)：本字段跳过自动点选，转人工（marked 'skipped'，不重复尝试）
      const fieldId = pickerCtx.profilePath || d.rule.field || pickerInput.id || d.label;
      if (isPickerExhausted(fieldId, doc)) {
        stats.skipped++;
        items.push({
          label: d.label,
          field: d.rule.field,
          status: 'skipped',
          reason: '弹窗点选连续失败 ≥3 次，已转人工处理（清除 sessionStorage 后可重试）',
          valuePreview: v,
          el: d.el,
          pickerContext: pickerCtx,
        });
        markPickerStep(fieldId, 'failed', doc, 'max-attempts-exceeded-in-skip');
        markEl(d.el, 'missing');
        continue;
      }
      // 断点续填（修复）：读取上次的 value 快照，恢复 pickerCtx 作为参考
      try {
        const snap = getSnapshot(doc);
        const prev = snap?.fields?.find((f) => f.name === fieldId || f.id === fieldId);
        if (prev?.value) pickerCtx.priorValue = prev.value;
      } catch { /* 忽略 */ }
      startPicker(fieldId, pickerCtx, v, doc);
      items.push({
        label: d.label,
        field: d.rule.field,
        status: 'picker',
        reason: '弹窗选择框：将按当前字段精确匹配代码和名称',
        valuePreview: v,
        el: d.el,
        pickerContext: pickerCtx,
      });
      markEl(d.el, 'missing');
      continue;
    }
    const dateOutcome = isDateLike && d.el.tagName === 'INPUT' ? fillDateControl(d.el as HTMLInputElement, v) : null;
    const ok = dateOutcome ? dateOutcome.ok : fillControl(d, v);
    if (ok) {
      stats.filled++;
      items.push({ label: d.label, field: d.rule.field, status: 'filled', reason: dateOutcome?.reason, valuePreview: dateOutcome?.written || v, el: d.el, expectedValue: dateOutcome?.written || v });
      markEl(d.el, 'filled');
    } else {
      stats.failed++;
      const reason =
        dateOutcome
          ? dateOutcome.reason
          : d.el.tagName === 'SELECT' && (d.el as HTMLSelectElement).options.length <= 1
          ? '下拉暂无选项（可能是联动下拉，请先选择上级字段后重试）'
          : '下拉/单选选项不匹配，请人工选择';
      items.push({ label: d.label, field: d.rule.field, status: 'failed', reason, valuePreview: v, issueCode: 'E1103', el: d.el });
      markEl(d.el, 'missing');
    }
  }
  if (stats.total >= 3) {
    // 只有"真表单"才写诊断数据：日历等工具 iframe 只有 1-2 个输入框，不应覆盖主页面快照/摘要
    try {
      const store = (doc.defaultView as Window | null)?.sessionStorage;
      store?.setItem(
        'tui-fill-summary',
        JSON.stringify({
          at: Date.now(),
          stats,
          // I02:诊断摘要只保留固定字段类别/状态/问题码——不写资料值、页面标签原文与页面错误原文。
          items: items
            .map((i) => ({ label: fixedFieldLabel(i.field), field: safeDiagnosticField(i.field), status: i.status, issue: i.issueCode || '' }))
            .slice(0, 80),
        }),
      );
    } catch {
      /* 忽略 */
    }
    snapshotFillState(doc);
  }
  return { stats, items };
}

/** 常见易超长字段的保守长度上限（字符数） */
const FIELD_LENGTH_CAPS: Record<string, number> = {
  'basic.address': 50,
  'basic.email': 40,
  'basic.name': 30,
  'basic.namePinyin': 30,
  'basic.emergencyName': 30,
  'basic.wechat': 30,
  'education.university': 50,
  'education.college': 40,
  'education.major': 40,
};

/** 快照当前已填写的表单值到 sessionStorage（保存失败清空页面后，报告仍能还原"保存前"的值，便于定位截断字段） */
export function snapshotFillState(doc: Document): void {
  try {
    const store = (doc.defaultView as Window | null)?.sessionStorage;
    if (!store) return;
    const fields: Array<{ name: string; id: string; value: string }> = [];
    const nodes = doc.querySelectorAll<HTMLElement>('input:not([type="hidden"]):not([type="password"]):not([type="submit"]):not([type="button"]), select, textarea');
    nodes.forEach((el) => {
      if (fields.length >= 80) return;
      const tag = el.tagName;
      const v = tag === 'SELECT' ? (el as HTMLSelectElement).value : (el as HTMLInputElement).value || '';
      if (!v || !v.trim()) return;
      fields.push({ name: (el.getAttribute('name') || '').slice(0, 60), id: (el.id || '').slice(0, 60), value: v.slice(0, 60) });
    });
    store.setItem('tui-fill-snapshot', JSON.stringify({ at: Date.now(), fields }));
  } catch {
    /* 忽略（隐私模式等无 storage 的环境） */
  }
}

/** sessionStorage.tui-fill-snapshot 中存储的快照结构 */
export interface FillSnapshot {
  at: number;
  fields: Array<{ name: string; id: string; value: string }>;
}

/**
 * 读取最近一次 snapshotFillState 写入的快照（断点续填核心）。
 * 用于在 picker 启动时，从 sessionStorage 恢复"用户上次想填的值"作为 priorValue，
 * 辅助识别器/匹配器在人工弹窗中做更好的模糊匹配提示。
 */
export function getSnapshot(doc: Document): FillSnapshot | null {
  try {
    const store = (doc.defaultView as Window | null)?.sessionStorage;
    if (!store) return null;
    const raw = store.getItem('tui-fill-snapshot');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FillSnapshot;
    if (!parsed || !Array.isArray(parsed.fields)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 只读日期框：模拟点击打开弹层再点击页面收起，触发系统的内部状态同步 */
function syncReadonlyPicker(el: HTMLInputElement, doc: Document): void {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  setTimeout(() => {
    const body = doc.body || doc.documentElement;
    body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  }, 60);
}

/** 日期值是否同一"年月"（忽略格式差异：2021-09 vs 2021年9月 vs 202109） */
function sameYearMonth(a: string, b: string): boolean {
  const m1 = /^(\d{4})\D*(\d{1,2})/.exec(a || '');
  const m2 = /^(\d{4})\D*(\d{1,2})/.exec(b || '');
  return !!m1 && !!m2 && m1[1] === m2[1] && String(Number(m1[2])) === String(Number(m2[2]));
}

/** 只读日历框自愈：My97 等日历一点开就把值重置成"当前月份"（入学=毕业事故）→ 稍后校验，值被改掉就恢复档案值 */
function restoreAfterPickerSync(el: HTMLInputElement, written: string, doc: Document): void {
  setTimeout(() => {
    try {
      if (!doc.documentElement.contains(el)) return;
      const cur = (el.value || '').trim();
      if (cur && !sameYearMonth(cur, written)) setInputValue(el, written);
    } catch {
      // 忽略
    }
  }, 400);
}

// ===================== 学术成果表格（自动新增行并填写） =====================

export interface AchievementTableInfo {
  table: HTMLTableElement;
  timeIdx: number;
  journalIdx: number;
  titleIdx: number;
  roleIdx: number;
}

/** 学术成果表页内缓存：只缓存表对象和列索引；页面回发产生新 Document 后自动失效。 */
const achievementTableCache = new WeakMap<Document, { info: AchievementTableInfo; signature: string }>();

function achievementTableSignature(table: HTMLTableElement): string {
  const first = table.rows[0];
  const header = first ? Array.from(first.cells).map((cell) => normalizeText(cell.textContent || '')).join('|') : '';
  return `${table.rows.length}/${table.querySelectorAll('input:not([type="hidden"]),select,textarea,[contenteditable="true"]').length}/${header}`;
}

/** 定位"学术成果"表格；缓存只在表对象仍连接且轻量结构签名未变化时命中。 */
export function findAchievementTable(doc: Document): AchievementTableInfo | null {
  const cached = achievementTableCache.get(doc);
  if (cached && doc.documentElement.contains(cached.info.table) && achievementTableSignature(cached.info.table) === cached.signature) {
    return cached.info;
  }
  achievementTableCache.delete(doc);
  const matches: AchievementTableInfo[] = [];
  for (const table of Array.from(doc.querySelectorAll<HTMLTableElement>('table'))) {
    const rows = Array.from(table.rows);
    if (rows.length < 2) {
      // 表头-only 网格（0 条成果的新表）：整行都是 th 且列数足够才认；纯文字标题表（td）仍跳过
      const headerOnly = rows.length === 1 && rows[0].cells.length >= 3 && Array.from(rows[0].cells).every((cell) => cell.tagName === 'TH');
      if (!headerOnly) continue;
    }
    const first = Array.from(rows[0].cells).map((c) => normalizeText(c.textContent || ''));
    const hasName = first.some((h) => h.includes('成果名称'));
    const timeIdx = first.findIndex((h) => /时间|日期/.test(h));
    const journalIdx = first.findIndex((h) => /刊物|出版|出版社|期刊/.test(h));
    const roleIdx = first.findIndex((h) => /排名|排序|次序/.test(h));
    const titleIdx = hasName ? first.findIndex((h) => h.includes('成果名称')) : first.findIndex((h) => h.includes('标题'));
    // 东华式：真网格表头只有"标题"二字，"成果/论文/专著"字样在外层标题表里 →
    // "标题"列只要伴随 刊物/出版 或 排名 列即认定为成果表；纯"标题+时间"的通知列表不算（防误吞其它列表）
    const hasTitle = hasName || (titleIdx >= 0 && (journalIdx >= 0 || roleIdx >= 0));
    if (!hasTitle || timeIdx < 0) continue;
    matches.push({ table, timeIdx, journalIdx, titleIdx, roleIdx });
  }
  if (!matches.length) return null;
  // 多候选打分（巨能填 findBlueTableForField 锚点评分同款思路）：
  // 有可写空标题格 > 表内有加行/删行按钮 > 可写控件多——避免按 DOM 顺序选中"已填满"的旧表或其它列表
  const cellInput = (r: HTMLTableRowElement, idx: number): HTMLInputElement | null =>
    idx >= 0 && r.cells[idx] ? (r.cells[idx].querySelector('input:not([type="hidden"])') || r.cells[idx].querySelector('input')) : null;
  const score = (m: AchievementTableInfo): number => {
    const dataRows = validDataRows(m.table);
    const hasEmptyTitle = dataRows.some((r) => cellHasControl(r, m.titleIdx) && !(cellInput(r, m.titleIdx)?.value || '').trim());
    const hasAddDel = Array.from(m.table.querySelectorAll<HTMLElement>('a, button, input[type="button"], input[type="submit"]')).some((b) =>
      /新增|添加|删除|移除/.test(normalizeText(`${b.textContent || ''} ${(b as HTMLInputElement).value || ''}`)),
    );
    const controls = m.table.querySelectorAll('input:not([type="hidden"]), select, textarea').length;
    // 含嵌套表格的候选是布局包装表 → 巨幅降权（东华式外层表带标题词+按钮，不得压过内层真网格）
    const isWrapper = !!m.table.querySelector('table');
    return (hasEmptyTitle ? 1000 : 0) + (hasAddDel ? 500 : 0) + controls - (isWrapper ? 600 : 0);
  };
  const selected = matches.sort((a, b) => score(b) - score(a))[0];
  if (selected) achievementTableCache.set(doc, { info: selected, signature: achievementTableSignature(selected.table) });
  return selected || null;
}

/** 成果行标题内容（输入框优先，其次隐藏输入框，服务器渲染的纯文本展示行退回单元格文本，用于重复检测） */
function achievementRowTitle(row: HTMLTableRowElement, titleIdx: number): string {
  if (titleIdx < 0 || !row.cells[titleIdx]) return '';
  const cell = row.cells[titleIdx];
  const el = cell.querySelector('input:not([type="hidden"])') as HTMLInputElement | null;
  if (el) return el.value.trim();
  const hidden = cell.querySelector('input') as HTMLInputElement | null;
  if (hidden && hidden.value.trim()) return hidden.value.trim();
  return (cell.textContent || '').trim();
}

function stripJournalPrefix(s: string): string {
  return s.replace(/^发表刊物(?:或出版社)?[：:]?\s*/, '');
}

function toMonthStart(s: string): string {
  const m = /^(\d{4})[-/.](\d{1,2})/.exec((s || '').trim());
  return m ? `${m[1]}-${m[2].padStart(2, '0')}` : (s || '').trim();
}

/** 功能：在"新增"弹窗内按语义映射填写学术成果字段并确认，行真实增长才算成功。 */
async function fillAchievementDialog(doc: Document, dialog: OpenDialogInfo, entry: { title: string; date: string; role: string; description: string }): Promise<boolean> {
  // 不用 `instanceof Document`：测试/无 DOM 环境未注入 Document 构造器，按 innerDoc 是否存在区分即可
  const rootEl = dialog.innerDoc ? (dialog.innerDoc.body || dialog.innerDoc.documentElement) : dialog.root;
  if (!rootEl) return false;
  const inputs = Array.from(rootEl.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input:not([type="hidden"]), textarea')).filter((el) => isVisible(el) && !el.readOnly && !el.disabled);
  const semanticOf = (el: HTMLInputElement | HTMLTextAreaElement): string => {
    const label = el.closest('td,th,label,.form-item,.layui-form-item,.el-form-item')?.textContent || '';
    return normalizeText(`${(el as HTMLInputElement).placeholder || ''} ${el.getAttribute('title') || ''} ${el.name} ${el.id} ${label}`.slice(0, 160));
  };
  let titleInput: HTMLInputElement | HTMLTextAreaElement | null = null;
  for (const el of inputs) {
    const s = semanticOf(el);
    if (/标题|题目|成果名称|论文名称|名称/.test(s) && !/刊物|出版社|期刊|排名/.test(s)) {
      titleInput = el;
      break;
    }
  }
  if (!titleInput && inputs.length) titleInput = inputs[0]; // 单输入框弹窗：唯一输入框即标题
  if (!titleInput) return false;
  const trySet = (el: HTMLInputElement | HTMLTextAreaElement, val: string, semantic: RegExp): boolean => {
    if (!val) return false;
    const hit = inputs.find((cand) => cand !== titleInput && semantic.test(semanticOf(cand)));
    // 直接覆盖语义命中的字段：弹窗是本扩展刚点击"新增"打开的，字段里的旧值要么为空、
    // 要么是上一条确认后残留的内容（弹窗复用时不清空），照抄会污染第二条记录
    if (hit && normalizeText(hit.value) !== normalizeText(val)) {
      setInputValue(hit, val);
      return true;
    }
    return false;
  };
  setInputValue(titleInput, entry.title);
  if (!titleInput.value.trim() || normalizeText(titleInput.value) !== normalizeText(entry.title)) return false; // 弹窗写入被组件拒绝：不确认，交给人工
  trySet(titleInput, toMonthStart(entry.date), /时间|日期|年月/);
  trySet(titleInput, entry.description || '', /刊物|出版社|期刊|来源|出处/);
  trySet(titleInput, entry.role || '', /排名|位次|排序/);
  const confirm = Array.from(rootEl.querySelectorAll<HTMLElement>('a,button,input[type="button"],input[type="submit"],span')).find((el) => {
    if (!isVisible(el) || el.closest(OWN_UI_SEL)) return false;
    const text = normalizeText(`${el.textContent || ''} ${(el as HTMLInputElement).value || ''}`);
    return /^(确定|确认|保存|提交)$/.test(text) && !/最终|锁定|缴费|报名/.test(text);
  });
  if (!confirm) return false;
  // 新表可能只有表头行（成果为 0 条）：此时 findAchievementTable 返回 null，行增长基线按 0 计
  const tableInfo = findAchievementTable(doc);
  const rowsBefore = tableInfo ? validDataRows(tableInfo.table).length : 0;
  await clickPageAction(confirm, 0);
  // 确认后行可能异步出现（服务器保存）：表出现前持续轮询，不能因"暂无表"立即判负
  const t0 = Date.now();
  while (Date.now() - t0 < 3000) {
    await sleep(120);
    if (!docAlive(doc)) return false;
    const info = findAchievementTable(doc);
    if (info && validDataRows(info.table).length > rowsBefore) return true;
  }
  return false;
}

/**
 * 学术成果全自动填写：按档案 research 列表逐条填表（第 i 条填第 i 个数据行）；
 * 行数不够时自动点击"新增一行"按钮扩展，直到全部填完。
 * 注意：不依赖"空行"判断（真实页面行内常带隐藏编码输入框），按行号直接覆盖填写。
 */
export async function fillAchievements(
  profile: Profile,
  doc: Document,
  startIndex = 0,
  beforeAdd?: (i: number) => void | number,
  maxAddAttempts = 10,
  allowCommitActions = true,
  onProcessed?: (nextIndex: number) => void,
  isCancelled?: () => boolean,
): Promise<number> {
  const spec: DynamicTableSpec<AchievementTableInfo, Profile['research'][number]> = {
    kind: 'achievements',
    entries: profile.research.filter((r) => r.title && r.title.trim()).slice(0, 20),
    findTable: findAchievementTable,
    // 去重键 = 标题（巨能填 page_protocol_fill 同款：页面已有同题名行即跳过，宁可不填也不产生重复行；
    // 同题不同月的档案条目会被跳过，决策日志记为 duplicate，字段报告可直接看到跳过了哪几条）
    matchExisting: (info, entry, ctx) => {
      const dup = dataRowsOf(info.table).some((r) => normalizeText(achievementRowTitle(r, info.titleIdx)) === normalizeText(entry.title));
      if (!dup) return null;
      logRowDecision(ctx.doc, { kind: 'achievements', index: ctx.index, decision: 'duplicate' });
      return 'present';
    },
    isEmptyRow: (row, info) =>
      !achievementRowTitle(row, info.titleIdx) && cellHasControl(row, info.titleIdx) && rowFullyEmpty(row, [info.timeIdx, info.titleIdx, info.journalIdx, info.roleIdx]),
    fillRow: (row, info, entry) => {
      const set = (idx: number, val: string) => {
        if (idx < 0 || !val || !row.cells[idx]) return;
        const el = (row.cells[idx].querySelector('input:not([type="hidden"])') || row.cells[idx].querySelector('input')) as HTMLInputElement | null;
        if (!el) return;
        setInputValue(el, val);
        markEl(el, 'filled');
      };
      set(info.titleIdx, entry.title);
      set(info.timeIdx, toMonthStart(entry.date));
      set(info.roleIdx, entry.role || '');
      set(info.journalIdx, stripJournalPrefix(entry.description || ''));
      return true;
    },
    fillAddDialog: (dialogDoc, dialog, entry) =>
      fillAchievementDialog(dialogDoc, dialog, { title: entry.title, date: entry.date, role: entry.role || '', description: entry.description || '' }),
    // 加行点击策略按连续失败轮次轮换（0 标准回发 → 1 主世界求值 → 2 原生点击）
    strategyForAttempt: (attempt) => attempt,
  };
  return runDynamicTableFill(spec, doc, startIndex, beforeAdd, maxAddAttempts, allowCommitActions, onProcessed, isCancelled);
}

export interface ExperienceTableInfo {
  table: HTMLTableElement;
  timeIdx: number;
  orgIdx: number;
  roleIdx: number;
  /** 结束时间分列（东华式"起始时间/结束时间"两列）；-1 表示起止合在一列 */
  endIdx: number;
  /** 时间分隔符：'.'（默认紧凑）或 '-'（表头提示 2019-11 这类格式） */
  timeSep: '.' | '-';
}

/** 定位"学习或工作经历"表格（表头含 学习或工作/起止时间 或"起始时间+结束时间"分列 + 单位列；优先选"表头短单元格+多行"的真网格，避开外层包装大表） */
/** 表内控件带「学习信息」标量字段名（入学/毕业年月、GPA、排名等）→ 不是多行经历网格（对齐巨能填 tableLooksLikeBlueDynamicTable 的结构否决） */
function tableHasScalarInfoControls(table: HTMLTableElement): boolean {
  const controls = Array.from(table.querySelectorAll('input:not([type="hidden"]), select, textarea'));
  if (!controls.length) return false;
  const scalar = /(?:^|[^a-z0-9])(rxny|byny|zcxh|gpa|cjpm|bydwm|bydw|byzymc|byzydm|byyxmc|bkbydwshow)(?:$|[^a-z0-9])/i;
  return controls.some((el) => scalar.test(`${el.getAttribute('id') || ''} ${el.getAttribute('name') || ''}`));
}

export function findExperienceTable(doc: Document): ExperienceTableInfo | null {
  const matches: ExperienceTableInfo[] = [];
  for (const table of Array.from(doc.querySelectorAll<HTMLTableElement>('table'))) {
    const rows = Array.from(table.rows);
    if (!rows.length) continue;
    const first = Array.from(rows[0].cells).map((c) => normalizeText(c.textContent || ''));
    const isExp =
      first.some((h) => /学习或工作|学习工作|工作经历|学习起止时间|起止时间/.test(h)) ||
      (first.some((h) => /起始时间|开始时间/.test(h)) && first.some((h) => /结束时间|截止时间/.test(h)) && first.some((h) => /单位|学校/.test(h)));
    const timeIdx = first.findIndex((h) => /起止时间|起始时间|开始时间|时间/.test(h));
    const orgIdx = first.findIndex((h) => /单位|学校/.test(h));
    const roleIdx = first.findIndex((h) => /职务|职称/.test(h));
    const endIdx = first.findIndex((h) => /结束时间|截止时间|终止时间/.test(h));
    if (!isExp || timeIdx < 0 || orgIdx < 0) continue;
    // 结构性否决：行内全是标量学习信息字段的表（如 入学年月/毕业年月/绩点）绝不是经历网格
    if (tableHasScalarInfoControls(table)) continue;
    // 分隔符看原始表头文本（归一化会去掉 2019-11 里的连字符）
    const timeSep: '.' | '-' = /20\d\d[-–—]\s*\d{1,2}/.test(Array.from(rows[0].cells).map((c) => c.textContent || '').join('')) ? '-' : '.';
    matches.push({ table, timeIdx, orgIdx, roleIdx, endIdx, timeSep });
  }
  if (!matches.length) return null;
  // 真网格：表头单元格短、数据行数合理；包装大表表头常是超长文本块
  const best = matches.sort((a, b) => {
    const score = (m: ExperienceTableInfo): number => {
      const hdrLen = Array.from(m.table.rows[0].cells).reduce((s, c) => s + normalizeText(c.textContent || '').length, 0);
      const short = hdrLen <= 60 ? 1000 : 0;
      const rows = m.table.rows.length >= 2 ? 100 : 0;
      // 包装大表签名：全部列关键字（时间/结束/单位/职务）塌缩进同一个单元格（1 行巨文本块）→ 巨幅降权，仅在无其他候选时才考虑
      const collapsed =
        m.table.rows[0].cells.length === 1 && m.timeIdx === m.orgIdx && m.orgIdx === m.endIdx ? -100000 : 0;
      // 含嵌套表格的候选是布局包装表 → 巨幅降权（东华式外层表不得压过内层真网格）
      const nested = m.table.querySelector('table') ? -600 : 0;
      return short + rows - hdrLen + collapsed + nested;
    };
    return score(b) - score(a);
  })[0];
  return best;
}

/** 月份归一化为紧凑格式 YYYY.MM（南理工日期列惯例，避免数据库截断错误） */
function toMonthDot(s: string): string {
  const t = (s || '').trim();
  const m = /^(\d{4})\s*[-/.]\s*(\d{1,2})/.exec(t) || /^(\d{4})\s*年\s*(\d{1,2})/.exec(t);
  return m ? `${m[1]}.${m[2].padStart(2, '0')}` : t;
}

/** 已存在的经历行：仅把时间格归一化为紧凑格式（避免数据库截断），其余内容不动 */
function normalizeExperienceTime(row: HTMLTableRowElement, e: Experience, info: ExperienceTableInfo): void {
  const fmt = (s: string) => (info.timeSep === '-' ? toMonthDot(s).replace(/\./g, '-') : toMonthDot(s));
  const setCell = (idx: number, val: string) => {
    if (idx < 0 || !row.cells[idx]) return;
    const el = row.cells[idx].querySelector('input:not([type="hidden"])') as HTMLInputElement | null;
    if (el && el.value.trim() !== val) {
      setInputValue(el, val);
      markEl(el, 'filled');
    }
  };
  if (info.endIdx >= 0) {
    // 东华式分列：起始/结束各写一列
    setCell(info.timeIdx, fmt(e.start));
    if (e.end && e.end.trim()) setCell(info.endIdx, fmt(e.end));
    return;
  }
  const val = (e.end && e.end.trim() ? `${fmt(e.start)}-${fmt(e.end)}` : fmt(e.start)).slice(0, 20);
  setCell(info.timeIdx, val);
}

/** 填写一行学习/工作经历（时间列拼成 "起-止"；东华式起始/结束分列各写一列，格式随表头提示 2019-11/-）
 *  找不到 text 输入框时兜底尝试 textarea/contenteditable */
function fillExperienceRow(row: HTMLTableRowElement, e: Experience, info: ExperienceTableInfo): boolean {
  let wrote = false;
  const set = (idx: number, val: string) => {
    if (idx < 0 || !val || !row.cells[idx]) return;
    const cell = row.cells[idx];
    const el = (cell.querySelector('input:not([type="hidden"])') || cell.querySelector('input') || cell.querySelector('textarea') || cell.querySelector('[contenteditable="true"]')) as HTMLInputElement | HTMLTextAreaElement | HTMLElement | null;
    if (!el) return;
    if (el.getAttribute('contenteditable') === 'true') {
      (el as HTMLElement).textContent = val;
    } else {
      setInputValue(el as HTMLInputElement, val);
    }
    markEl(el, 'filled');
    wrote = true;
  };
  const fmt = (s: string) => (info.timeSep === '-' ? toMonthDot(s).replace(/\./g, '-') : toMonthDot(s));
  if (info.endIdx >= 0) {
    // 东华式分列：起始/结束各写一列
    set(info.timeIdx, fmt(e.start));
    if (e.end && e.end.trim()) set(info.endIdx, fmt(e.end));
  } else {
    const timeVal = e.end && e.end.trim() ? `${fmt(e.start)}-${fmt(e.end)}` : fmt(e.start);
    set(info.timeIdx, timeVal.slice(0, 20));
  }
  let orgVal = e.org || '';
  // 页面无「职务」列且列少时，把职务并入单位格（对齐巨能填 adaptBlueTableCells 的合并策略，避免职务信息丢失）
  if (info.roleIdx < 0 && e.role && e.role.trim() && orgVal && !orgVal.includes(e.role.trim())) {
    const editableCols = Array.from(row.cells).filter((c) => c.querySelector('input:not([type="hidden"]), textarea, [contenteditable="true"]')).length;
    if (editableCols <= 3) orgVal = `${orgVal}，${e.role.trim()}`;
  }
  set(info.orgIdx, orgVal);
  set(info.roleIdx, e.role);
  return wrote;
}

/** 读取经历行"单位"格内容（输入框优先，无输入框的服务器展示行退回单元格文本，用于重复检测） */
function experienceRowOrg(row: HTMLTableRowElement, orgIdx: number): string {
  if (orgIdx < 0 || !row.cells[orgIdx]) return '';
  const cell = row.cells[orgIdx];
  const el = (cell.querySelector('input:not([type="hidden"])') || cell.querySelector('input') || cell.querySelector('textarea') || cell.querySelector('[contenteditable="true"]')) as HTMLInputElement | HTMLElement | null;
  if (!el) return (cell.textContent || '').trim();
  return (el.getAttribute('contenteditable') === 'true' ? (el as HTMLElement).textContent : (el as HTMLInputElement).value || '').trim();
}

/** 学习/工作经历表格：表头为"学习或工作起止时间/单位/职务"，按档案 experiences 逐行填充（同步：只填空行，已存在的条目跳过） */
function fillExperienceTables(profile: Profile, doc: Document, handled: Set<Element>, items: FillItem[], stats: { filled: number }): void {
  const entries = profile.experiences.filter((e) => (e.org && e.org.trim()) || (e.start && e.start.trim()));
  if (!entries.length) return;
  const info = findExperienceTable(doc);
  if (!info) return;
  markGridHandled(info.table, handled); // 整表控件标记"已处理"，空插入行不参与通用匹配
  const allRows = dataRowsOf(info.table); // 含服务器渲染的纯文本展示行（无输入框）
  const dataRows = validDataRows(info.table); // 只有输入框的可写行
  entries.forEach((e, i) => {
    // 页面已有该条目（手动填过、前次已填或服务器展示行）→ 仅归一化时间格式，避免重复
    const existing = allRows.find((r) => normalizeText(experienceRowOrg(r, info.orgIdx)) === normalizeText(e.org));
    if (existing) {
      normalizeExperienceTime(existing, e, info);
      return;
    }
    const row = dataRows.find((r) => !experienceRowOrg(r, info.orgIdx) && cellHasControl(r, info.orgIdx) && rowFullyEmpty(r, [info.timeIdx, info.orgIdx, info.roleIdx, info.endIdx]));
    if (!row) return;
    if (!fillExperienceRow(row, e, info)) return;
    row.querySelectorAll('input:not([type="hidden"])').forEach((el) => {
      handled.add(el);
    });
    stats.filled++;
    items.push({
      label: `学习/工作经历 ${i + 1}：${e.org || e.start}`,
      field: `experiences[${i}]`,
      status: 'filled',
      valuePreview: e.org || e.start,
      el: (row.cells[info.timeIdx] && row.cells[info.timeIdx].querySelector('input')) || undefined,
    });
  });
}

/**
 * 学习/工作经历全自动填写（异步）：只填空行、已存在的条目自动跳过；行数不够时自动点击"新增一行"按钮扩展。
 * 北邮式逐行网格：填完立即点行内「添加」落库（自动换行），输入行里残留的未保存内容也会被补点「添加」保存。
 */
export async function fillExperiences(
  profile: Profile,
  doc: Document,
  startIndex = 0,
  beforeAdd?: (i: number) => void | number,
  maxAddAttempts = 10,
  allowCommitActions = true,
  onProcessed?: (nextIndex: number) => void,
  isCancelled?: () => boolean,
): Promise<number> {
  const spec: DynamicTableSpec<ExperienceTableInfo, Experience> = {
    kind: 'experiences',
    entries: profile.experiences.filter((e) => (e.org && e.org.trim()) || (e.start && e.start.trim())).slice(0, 20),
    findTable: findExperienceTable,
    // 页面已有该条目（含无输入框的服务器展示行）→ 仅归一化时间格式后跳过，避免重复；
    // 输入行里已填但未落库（上次「添加」没生效）→ 点本行 DoPostback「添加」保存，实现自动换行
    matchExisting: async (info, entry, ctx) => {
      const existingRow = dataRowsOf(info.table).find((r) => normalizeText(experienceRowOrg(r, info.orgIdx)) === normalizeText(entry.org));
      if (!existingRow) return null;
      normalizeExperienceTime(existingRow, entry, info);
      if (!rowHasInput(existingRow)) return 'present'; // 已保存的服务器文本展示行
      const rowBtn = findAddButton(info.table, existingRow);
      if (ctx.allowCommitActions && rowBtn && isDoPostbackAction(rowBtn)) {
        await clickPageAction(rowBtn, clickAttempt(ctx.beforeAdd, ctx.index, ctx.attempt));
        await sleep(1500); // 北邮等服务器回发较慢：给足新行出现的时间再继续
        return 'retry';
      }
      return 'present'; // 其他站点旧行为：输入行内容视为已处理
    },
    isEmptyRow: (row, info) =>
      !experienceRowOrg(row, info.orgIdx) && cellHasControl(row, info.orgIdx) && rowFullyEmpty(row, [info.timeIdx, info.orgIdx, info.roleIdx, info.endIdx]),
    fillRow: (row, info, entry) => fillExperienceRow(row, entry, info),
    // 无加行按钮：尝试点击空白模板行激活编辑（EasyUI click-to-edit 网格）
    findTemplateCell: (info) => {
      const template = Array.from(info.table.rows).slice(1).find((r) => !rowHasInput(r) && !isPlaceholderRow(r));
      return template ? ((template.cells[info.orgIdx] || template.cells[0]) as HTMLElement | undefined) ?? null : null;
    },
    rowCommitButton: (info, row) => findAddButton(info.table, row),
  };
  return runDynamicTableFill(spec, doc, startIndex, beforeAdd, maxAddAttempts, allowCommitActions, onProcessed, isCancelled);
}

export interface AwardTableInfo {
  table: HTMLTableElement;
  timeIdx: number;
  nameIdx: number;
  unitIdx: number;
  reasonIdx: number;
}

/** 定位"奖励情况"表格（表头含 奖励/荣誉 + 时间列 + 名称列，如南理工"奖励单位/奖励原因/奖励名称"、北邮等） */
export function findAwardTable(doc: Document): AwardTableInfo | null {
  const matches: AwardTableInfo[] = [];
  // 页面存在"何时何地何原因受过何种奖励"等标题表（东华/苏大式：关键词只在外层标题表里）
  const hasAwardTitleTable = Array.from(doc.querySelectorAll<HTMLTableElement>('table')).some((t) => {
    const rows = Array.from(t.rows);
    return !!rows.length && /奖励|获奖|荣誉|奖项|处分/.test(normalizeText(rows[0].textContent || ''));
  });
  for (const table of Array.from(doc.querySelectorAll<HTMLTableElement>('table'))) {
    const rows = Array.from(table.rows);
    if (rows.length < 2) continue; // 纯标题表（"何时何地何原因受过何种奖励"）跳过
    const first = Array.from(rows[0].cells).map((c) => normalizeText(c.textContent || ''));
    const hasAwardWord = first.some((h) => /奖励|荣誉|获奖|奖项/.test(h));
    const timeIdx = first.findIndex((h) => /时间|日期/.test(h));
    const nameIdx = first.findIndex((h) => /名称|奖项|荣誉|内容/.test(h));
    const unitIdx = first.findIndex((h) => /单位|机构|部门|组织|颁发|地点/.test(h));
    const reasonIdx = first.findIndex((h) => /原因|事由|类别|级别|等级/.test(h));
    if (timeIdx < 0 || nameIdx < 0) continue;
    const hasAddDel = Array.from(table.querySelectorAll<HTMLElement>('a, button, input[type="button"], input[type="submit"]')).some((b) =>
      /新增|添加|删除|移除/.test(normalizeText(`${b.textContent || ''} ${(b as HTMLInputElement).value || ''}`)),
    );
    // 东华式：真网格表头只有「时间/地点/内容」，「奖励」字样在外层标题表里 →
    // 无奖励关键词的网格必须有 加行/删行 chrome；或页面存在奖励标题表且网格带「地点」列（苏大式网格无删行按钮），防误吞通知列表
    if (!hasAwardWord && !(hasAddDel && (unitIdx >= 0 || reasonIdx >= 0)) && !(hasAwardTitleTable && unitIdx >= 0)) continue;
    matches.push({ table, timeIdx, nameIdx, unitIdx, reasonIdx });
  }
  if (!matches.length) return null;
  // 多候选打分：有可写空名称格 > 有加删按钮 > 可写控件多（避免按 DOM 顺序选中"已填满"的旧表）
  const cellInput = (r: HTMLTableRowElement, idx: number): HTMLInputElement | null =>
    idx >= 0 && r.cells[idx] ? (r.cells[idx].querySelector('input:not([type="hidden"])') || r.cells[idx].querySelector('input')) : null;
  const score = (m: (typeof matches)[number]): number => {
    const dataRows = validDataRows(m.table);
    const hasEmptyName = dataRows.some((r) => cellHasControl(r, m.nameIdx) && !(cellInput(r, m.nameIdx)?.value || '').trim());
    const hasAddDel = Array.from(m.table.querySelectorAll<HTMLElement>('a, button, input[type="button"], input[type="submit"]')).some((b) =>
      /新增|添加|删除|移除/.test(normalizeText(`${b.textContent || ''} ${(b as HTMLInputElement).value || ''}`)),
    );
    const controls = m.table.querySelectorAll('input:not([type="hidden"]), select, textarea').length;
    // 含嵌套表格的候选是布局包装表 → 巨幅降权（东华式外层表带标题词+按钮，不得压过内层真网格）
    const isWrapper = !!m.table.querySelector('table');
    return (hasEmptyName ? 1000 : 0) + (hasAddDel ? 500 : 0) + controls - (isWrapper ? 600 : 0);
  };
  return matches.sort((a, b) => score(b) - score(a))[0];
}

/** 奖励情况表格：表头含"奖励/荣誉"且带时间列+名称列（南理工"奖励单位/奖励原因/奖励名称"），按档案 awards 逐行填写 */
function fillAwardTables(profile: Profile, doc: Document, handled: Set<Element>, items: FillItem[], stats: { filled: number }): void {
  const entries = profile.awards.filter((a) => a.content && a.content.trim());
  if (!entries.length) return;
  const cellName = (row: HTMLTableRowElement, idx: number): string => {
    if (idx < 0 || !row.cells[idx]) return '';
    const cell = row.cells[idx];
    const el = cell.querySelector('input') as HTMLInputElement | null;
    if (el && el.value.trim()) return el.value.trim();
    return (cell.textContent || '').trim();
  };
  // 页面存在奖励标题表（东华/苏大式：关键词只在外层标题表里）
  const hasAwardTitleTable = Array.from(doc.querySelectorAll<HTMLTableElement>('table')).some((t) => {
    const rs = Array.from(t.rows);
    return !!rs.length && /奖励|获奖|荣誉|奖项|处分/.test(normalizeText(rs[0].textContent || ''));
  });
  for (const table of Array.from(doc.querySelectorAll<HTMLTableElement>('table'))) {
    const rows = Array.from(table.rows);
    if (rows.length < 2) continue;
    const first = Array.from(rows[0].cells).map((c) => normalizeText(c.textContent || ''));
    const hasAwardWord = first.some((h) => /奖励|荣誉|获奖|奖项/.test(h));
    if (!hasAwardWord) {
      // 无关键词网格：仅当页面存在奖励标题表、且本表列像奖励表（时间+名称/内容+地点/级别）才认定
      const nameLike = first.findIndex((h) => /名称|奖项|荣誉|内容/.test(h));
      const unitLike = first.findIndex((h) => /单位|机构|部门|组织|颁发|地点/.test(h));
      const timeLike = first.findIndex((h) => /时间|日期/.test(h));
      if (!(hasAwardTitleTable && nameLike >= 0 && unitLike >= 0 && timeLike >= 0)) continue;
    }
    const timeIdx = first.findIndex((h) => /时间|日期/.test(h));
    const nameIdx = first.findIndex((h) => /名称|奖项|荣誉|内容/.test(h));
    if (timeIdx < 0 || nameIdx < 0) continue;
    markGridHandled(table, handled); // 整表控件标记"已处理"，空插入行不参与通用匹配
    const unitIdx = first.findIndex((h) => /单位|机构|部门|组织|颁发/.test(h));
    const reasonIdx = first.findIndex((h) => /原因|事由|类别|级别|等级/.test(h));
    const dataRows = validDataRows(table);
    const cellTime = (row: HTMLTableRowElement, idx: number): string => {
      if (idx < 0 || !row.cells[idx]) return '';
      const el = row.cells[idx].querySelector('input') as HTMLInputElement | null;
      if (el && el.value.trim()) return normalizeText(el.value);
      return normalizeText(row.cells[idx].textContent || '');
    };
    // 去重键 = 名称+时间：同名但获奖时间不同是两条不同记录
    const rowKey = (r: HTMLTableRowElement): string => `${normalizeText(cellName(r, nameIdx))}|${monthKeyOf(cellTime(r, timeIdx))}`;
    const entryKey = (name: string, date: string): string => `${normalizeText(name)}|${monthKeyOf(date)}`;
    const seenKeys = new Set<string>();
    let dupCount = 0;
    entries.forEach((a, i) => {
      const name = a.content.trim();
      const unit = (a.place || '').trim();
      const key = entryKey(name, a.date);
      // 同名+同时间的奖项只填一条，并在提示中说明（反向提取易造成完全重复）
      if (seenKeys.has(key)) {
        dupCount++;
        return;
      }
      seenKeys.add(key);
      // 已有该奖项（服务器展示行或已填输入框，名称+时间一致）→ 跳过，避免重复
      if (dataRowsOf(table).some((r) => rowKey(r) === key)) return;
      const row = dataRows.find((r) => cellName(r, nameIdx) === '' && cellHasControl(r, nameIdx));
      if (!row) return;
      let wrote = false;
      const set = (idx: number, val: string) => {
        if (idx < 0 || !val || !row.cells[idx]) return;
        const cell = row.cells[idx];
        const el = (cell.querySelector('input:not([type="hidden"])') || cell.querySelector('input')) as HTMLInputElement | null;
        if (!el) return;
        setInputValue(el, val);
        handled.add(el);
        markEl(el, 'filled');
        wrote = true;
      };
      const month = normalizeMonth(a.date) || a.date;
      set(timeIdx, month);
      set(unitIdx, unit);
      set(reasonIdx, a.level || '');
      set(nameIdx, name);
      if (!wrote) return; // 空白模板行写不进 → 不计数不误报
      stats.filled++;
      items.push({ label: `奖励情况 ${i + 1}：${name}（${month}，地点 ${unit || '未填'}）`, field: `awards[${i}]`, status: 'filled', valuePreview: name });
    });
    if (dupCount > 0) {
      items.push({ label: `档案奖项有 ${dupCount} 条内容+时间完全相同的重复，已自动合并去重（建议到档案中删除重复项）`, field: 'awards[dup]', status: 'skipped', reason: '同内容同时间重复已合并' });
    }
  }
}

/** 奖励行"名称"格内容（输入框优先，无输入框的服务器展示行退回单元格文本，用于重复检测） */
function awardCellName(row: HTMLTableRowElement, nameIdx: number): string {
  if (nameIdx < 0 || !row.cells[nameIdx]) return '';
  const cell = row.cells[nameIdx];
  const el = cell.querySelector('input') as HTMLInputElement | null;
  if (el && el.value.trim()) return el.value.trim();
  return (cell.textContent || '').trim();
}

/** 奖励行"时间"格内容（归一化文本，用于重复检测） */
function awardCellTime(row: HTMLTableRowElement, timeIdx: number): string {
  if (timeIdx < 0 || !row.cells[timeIdx]) return '';
  const el = row.cells[timeIdx].querySelector('input') as HTMLInputElement | null;
  if (el && el.value.trim()) return normalizeText(el.value);
  return normalizeText(row.cells[timeIdx].textContent || '');
}

/** 奖励情况全自动填写：去重 + 行数不够时自动点击"新增一行/保存"扩展（断点续填） */
export async function fillAwardRows(
  profile: Profile,
  doc: Document,
  startIndex = 0,
  beforeAdd?: (i: number) => void | number,
  maxAddAttempts = 10,
  allowCommitActions = true,
  onProcessed?: (nextIndex: number) => void,
  isCancelled?: () => boolean,
): Promise<number> {
  const spec: DynamicTableSpec<AwardTableInfo, Profile['awards'][number]> = {
    kind: 'awards',
    entries: profile.awards.filter((a) => a.content && a.content.trim()).slice(0, 20),
    findTable: findAwardTable,
    // 去重键 = 名称+时间：同名但获奖时间不同是两条不同记录；月份两侧统一规范化（页面可能用 202410 紧凑格式）。
    // 已有同名同时间的行：只补空白单元格（如漏填的获奖地点/级别），绝不覆盖已有内容（巨能填"差量同步·先补缺"同款）。
    // 补缺后视为已处理并推进断点，否则外层会对同一行反复空转直到误判失败。
    matchExisting: (info, entry, ctx) => {
      const key = `${normalizeText(entry.content.trim())}|${monthKeyOf(entry.date)}`;
      const existingRow = dataRowsOf(info.table).find((r) => `${normalizeText(awardCellName(r, info.nameIdx))}|${monthKeyOf(awardCellTime(r, info.timeIdx))}` === key);
      if (!existingRow) return null;
      const setIfEmpty = (idx: number, val: string): void => {
        if (idx < 0 || !val || !existingRow.cells[idx]) return;
        const el = (existingRow.cells[idx].querySelector('input:not([type="hidden"])') || existingRow.cells[idx].querySelector('input')) as HTMLInputElement | null;
        if (!el || el.value.trim()) return;
        setInputValue(el, val);
        markEl(el, 'filled');
        logRowDecision(ctx.doc, { kind: 'awards', index: ctx.index, decision: 'gap-filled' });
      };
      setIfEmpty(info.unitIdx, (entry.place || '').trim());
      setIfEmpty(info.reasonIdx, (entry.level || '').trim());
      return 'present';
    },
    isEmptyRow: (row, info) =>
      !awardCellName(row, info.nameIdx) && cellHasControl(row, info.nameIdx) && rowFullyEmpty(row, [info.timeIdx, info.nameIdx, info.unitIdx, info.reasonIdx]),
    fillRow: (row, info, entry) => {
      const setCell = (idx: number, val: string) => {
        if (idx < 0 || !val || !row.cells[idx]) return;
        const el = (row.cells[idx].querySelector('input:not([type="hidden"])') || row.cells[idx].querySelector('input')) as HTMLInputElement | null;
        if (!el) return;
        setInputValue(el, val);
        markEl(el, 'filled');
      };
      const month = normalizeMonth(entry.date) || entry.date;
      setCell(info.timeIdx, month);
      setCell(info.unitIdx, (entry.place || '').trim());
      setCell(info.reasonIdx, entry.level || '');
      setCell(info.nameIdx, entry.content.trim());
      return true;
    },
  };
  return runDynamicTableFill(spec, doc, startIndex, beforeAdd, maxAddAttempts, allowCommitActions, onProcessed, isCancelled);
}

interface LanguageTableInfo {
  table: HTMLTableElement;
  typeIdx: number;
  scoreIdx: number;
  dateIdx: number;
  noteIdx: number;
  fullDateHint: boolean;
}

interface LanguageEntry {
  kind: string;
  score: string;
  date: string;
  field: string;
}

/** 功能：把档案考试名称规范成高校页面常见选项；必须精确区分 CET 与英语专业等级。 */
function languageKindAliases(raw: string): { page: string; display: string; known: boolean } {
  const kind = (raw || '').trim();
  const low = normalizeText(kind).toLowerCase().replace(/[－—_\s]/g, '-');
  if (/专业.*八级|tem-?8|temⅷ/i.test(low)) return { page: '英语专业八级', display: '英语专业八级（TEM-8）', known: true };
  if (/专业.*四级|tem-?4|temⅳ/i.test(low)) return { page: '英语专业四级', display: '英语专业四级（TEM-4）', known: true };
  if (/六级|cet-?6/i.test(low)) return { page: '六级', display: '大学英语六级（CET-6）', known: true };
  if (/四级|cet-?4/i.test(low)) return { page: '四级', display: '大学英语四级（CET-4）', known: true };
  if (/托福|toefl/i.test(low)) return { page: '托福', display: '托福（TOEFL）', known: true };
  if (/雅思|ielts/i.test(low)) return { page: '雅思', display: '雅思（IELTS）', known: true };
  return { page: kind, display: kind, known: false };
}

/** 功能：生成考试类型、成绩和日期不可拆分的原子记录，防止六级类型误配四级成绩。 */
function languageEntries(profile: Profile): LanguageEntry[] {
  const entries: LanguageEntry[] = [];
  for (let i = 0; i < profile.languageExams.length; i++) {
    const exam = profile.languageExams[i];
    const kind = (exam.kind || exam.level || '').trim();
    const score = (exam.score || '').trim();
    if (!kind || !score || /^0(?:\.0+)?$/.test(score)) continue;
    entries.push({ kind, score, date: (exam.date || '').trim(), field: `languageExams[${i}]` });
  }
  const addLegacy = (kind: string, scoreRaw: string | undefined, dateRaw: string | undefined, field: string) => {
    const score = (scoreRaw || '').trim();
    if (!score || /^0(?:\.0+)?$/.test(score)) return;
    const alias = languageKindAliases(kind).page;
    // V2 原子表是权威来源：同一考试类型已经存在时，不再混入旧教育字段中的另一个成绩。
    if (entries.some((entry) => languageKindAliases(entry.kind).page === alias)) return;
    entries.push({ kind, score, date: (dateRaw || '').trim(), field });
  };
  addLegacy('CET-4', profile.education.cet4, profile.education.cet4Date, 'education.cet4');
  addLegacy('CET-6', profile.education.cet6, profile.education.cet6Date, 'education.cet6');
  return entries.slice(0, 10);
}

/** 功能：供页面任务调度器读取本次需要填写的有效语言考试条数。 */
export function languageExamEntryCount(profile: Profile): number {
  return languageEntries(profile).length;
}

/** 功能：识别“外语水平/英语等级 + 成绩 + 时间”表格，首列允许 input 或 select。 */
export function findLanguageTable(doc: Document): LanguageTableInfo | null {
  for (const table of Array.from(doc.querySelectorAll<HTMLTableElement>('table'))) {
    if (table.rows.length < 2) continue;
    const header = rowTexts(table.rows[0]);
    const typeIdx = header.findIndex((text) => /外语水平|英语等级|外语等级|考试类型|名称|类别/.test(text));
    const scoreIdx = header.findIndex((text) => /成绩|分数/.test(text) && !/时间|日期/.test(text));
    if (typeIdx < 0 || scoreIdx < 0 || !header.some((text) => /外语|英语|考试/.test(text))) continue;
    const typeControl = table.rows[1]?.cells[typeIdx]?.querySelector('input:not([type="hidden"]),select');
    const scoreControl = table.rows[1]?.cells[scoreIdx]?.querySelector('input:not([type="hidden"]),select');
    if (!typeControl || !scoreControl) continue;
    return {
      table,
      typeIdx,
      scoreIdx,
      dateIdx: header.findIndex((text) => /时间|日期/.test(text)),
      noteIdx: header.findIndex((text) => /备注|说明/.test(text)),
      fullDateHint: header.some((text) => /日期格式|20\d{2}-\d{1,2}-\d{1,2}/.test(text)),
    };
  }
  return null;
}

function languageTypeText(control: HTMLInputElement | HTMLSelectElement): string {
  return control.tagName === 'SELECT'
    ? normalizeText((control as HTMLSelectElement).selectedOptions[0]?.text || control.value || '')
    : normalizeText(control.value || '');
}

/** 功能：严格设置外语考试选项；目标选项不存在时只允许回退“其它”，并把真实考试名写入备注。 */
function setLanguageType(control: HTMLInputElement | HTMLSelectElement, kind: string): { ok: boolean; usedOther: boolean; display: string } {
  const alias = languageKindAliases(kind);
  if (control.tagName === 'SELECT') {
    const select = control as HTMLSelectElement;
    if (setSelectValue(select, alias.page)) return { ok: true, usedOther: false, display: alias.page };
    if (setSelectValue(select, '其它') || setSelectValue(select, '其他')) return { ok: true, usedOther: true, display: kind };
    return { ok: false, usedOther: false, display: kind };
  }
  setInputValue(control as HTMLInputElement, alias.display);
  return { ok: normalizeText(control.value) === normalizeText(alias.display), usedOther: false, display: alias.display };
}

function fillLanguageRow(
  row: HTMLTableRowElement,
  info: LanguageTableInfo,
  entry: LanguageEntry,
  doc: Document,
  handled?: Set<Element>,
  items?: FillItem[],
  stats?: { filled: number; profileEmpty: number },
): boolean {
  const controlAt = <T extends Element>(idx: number, selector: string): T | null =>
    idx >= 0 && row.cells[idx] ? row.cells[idx].querySelector<T>(selector) : null;
  const typeEl = controlAt<HTMLInputElement | HTMLSelectElement>(info.typeIdx, 'input:not([type="hidden"]),select');
  const scoreEl = controlAt<HTMLInputElement>(info.scoreIdx, 'input:not([type="hidden"])');
  const dateEl = controlAt<HTMLInputElement>(info.dateIdx, 'input:not([type="hidden"])');
  const noteEl = controlAt<HTMLInputElement | HTMLTextAreaElement>(info.noteIdx, 'input:not([type="hidden"]),textarea');
  if (!typeEl || !scoreEl) return false;

  const alias = languageKindAliases(entry.kind);
  const currentType = languageTypeText(typeEl);
  const currentScore = (scoreEl.value || '').trim();
  const typeMatches = currentType === normalizeText(alias.page) || currentType === normalizeText(alias.display) ||
    (/^(其它|其他)$/.test(currentType) && !!noteEl && normalizeText(noteEl.value).includes(normalizeText(entry.kind)));
  if ((currentType && !/请选择/.test(currentType)) || currentScore) {
    if (!typeMatches || currentScore !== entry.score) return false; // 用户已有不同内容：整行保护，不覆盖。
  } else {
    const selected = setLanguageType(typeEl, entry.kind);
    if (!selected.ok) return false;
    setInputValue(scoreEl, entry.score);
    if (selected.usedOther && noteEl && !(noteEl.value || '').trim()) setInputValue(noteEl, entry.kind);
  }

  handled?.add(typeEl);
  handled?.add(scoreEl);
  markEl(typeEl, 'filled');
  markEl(scoreEl, 'filled');
  if (noteEl && (noteEl.value || '').trim()) {
    handled?.add(noteEl);
    markEl(noteEl, 'filled');
  }
  if (dateEl) {
    const month = entry.date ? normalizeMonth(entry.date) : null;
    if (month) {
      const value = info.fullDateHint ? `${month}-01` : month;
      setInputValue(dateEl, value);
      if (dateEl.readOnly) {
        syncReadonlyPicker(dateEl, doc);
        restoreAfterPickerSync(dateEl, value, doc);
      }
      handled?.add(dateEl);
      markEl(dateEl, 'filled');
    } else if (handled && items && stats) {
      handled.add(dateEl);
      markEl(dateEl, 'empty');
      stats.profileEmpty++;
      const dateField = entry.field.startsWith('languageExams[') ? `${entry.field}.date` : `${entry.field}Date`;
      items.push({ label: `外语水平取得时间（请在档案“语言考试”补充 ${entry.kind} 时间）`, field: dateField, status: 'profileEmpty', el: dateEl });
    }
  }
  if (items && stats) {
    stats.filled++;
    items.push({ label: `外语水平：${alias.page} ${entry.score}`, field: entry.field, status: 'filled', valuePreview: entry.score, el: typeEl });
  }
  return true;
}

/** 外语水平表即时填充：已有几行就先安全填写几条，其余交给异步加行任务。 */
function fillCetTables(profile: Profile, doc: Document, handled: Set<Element>, items: FillItem[], stats: { filled: number; profileEmpty: number }): void {
  const entries = languageEntries(profile);
  const info = entries.length ? findLanguageTable(doc) : null;
  if (!info) return;
  markGridHandled(info.table, handled);
  const rows = validDataRows(info.table);
  for (const entry of entries) {
    const existing = rows.find((row) => fillLanguageRow(row, info, entry, doc));
    if (existing) {
      fillLanguageRow(existing, info, entry, doc, handled, items, stats);
      continue;
    }
    const empty = rows.find((row) => rowFullyEmpty(row, [info.typeIdx, info.scoreIdx, info.dateIdx, info.noteIdx]));
    if (empty) fillLanguageRow(empty, info, entry, doc, handled, items, stats);
  }
}

/** 功能：外语表安全加行并逐条填写；只点击语义明确的“新增一行”，不点击保存或下一步。 */
export async function fillLanguageExams(
  profile: Profile,
  doc: Document,
  startIndex = 0,
  beforeAdd?: (nextIndex: number) => number | void,
  maxAddAttempts = 10,
  allowCommitActions = false,
  isCancelled?: () => boolean,
): Promise<number> {
  const spec: DynamicTableSpec<LanguageTableInfo, LanguageEntry> = {
    kind: 'language',
    entries: languageEntries(profile),
    findTable: findLanguageTable,
    // 外语表语义：第一条可写/已匹配的行就地写入（整行保护由 fillLanguageRow 内部保证），写入成功即视为已处理；
    // 全部行拒绝写入时内核才走"新增一行"路径，新空行出现后同样经 matchExisting 写入
    matchExisting: (info, entry, ctx) => {
      const hit = validDataRows(info.table).find((row) => fillLanguageRow(row, info, entry, ctx.doc));
      return hit ? 'filled' : null;
    },
    isEmptyRow: (row, info) => rowFullyEmpty(row, [info.typeIdx, info.scoreIdx, info.dateIdx, info.noteIdx]),
    fillRow: (row, info, entry, ctxDoc) => fillLanguageRow(row, info, entry, ctxDoc),
    useSaveButton: false, // 外语表绝不借"保存"按钮制造下一行
  };
  return runDynamicTableFill(spec, doc, startIndex, beforeAdd, maxAddAttempts, allowCommitActions, undefined, isCancelled);
}

/** 家庭成员表格信息（列头：姓名/关系/单位/电话/政治面貌） */
export interface FamilyTableInfo {
  table: HTMLTableElement;
  nameIdx: number;
  relIdx: number;
  orgIdx: number;
  phoneIdx: number;
  polIdx: number;
}

function rowTexts(row: HTMLTableRowElement): string[] {
  return Array.from(row.cells).map((c) => normalizeText(c.textContent || ''));
}

/** 网格表格的全部数据行控件标记为"已处理"：表格输入框绝不能漏进通用字段匹配（否则会被按属性名误填成本人姓名/专业/电话等） */
function markGridHandled(table: HTMLTableElement, handled: Set<Element>): void {
  dataRowsOf(table).forEach((r) => r.querySelectorAll('input, select, textarea').forEach((el) => handled.add(el)));
}

/** 清空一行的可写控件（用于"本人姓名误入家庭成员行"的自愈） */
function clearRowControls(row: HTMLTableRowElement): void {
  row.querySelectorAll('input:not([type="hidden"])').forEach((el) => setInputValue(el as HTMLInputElement, ''));
  row.querySelectorAll('select').forEach((sel) => {
    const s = sel as HTMLSelectElement;
    if (s.options.length) s.selectedIndex = 0;
  });
  row.querySelectorAll('textarea').forEach((t) => {
    (t as HTMLTextAreaElement).value = '';
  });
}

/** 定位家庭成员表格（表头含"姓名/成员"+关系列） */
export function findFamilyTable(doc: Document): FamilyTableInfo | null {
  for (const table of Array.from(doc.querySelectorAll<HTMLTableElement>('table'))) {
    const allRows = Array.from(table.rows);
    if (allRows.length < 2) continue;
    const thead = table.querySelector('thead');
    let headerRow: HTMLTableRowElement | null = thead ? thead.rows[0] : null;
    if (!headerRow) {
      const first = rowTexts(allRows[0]);
      if (first.some((h) => h.includes('姓名') || h.includes('成员')) && first.some((h) => /关系|称谓|与本人/.test(h))) headerRow = allRows[0];
    }
    if (!headerRow) continue;
    const headers = rowTexts(headerRow);
    const nameIdx = headers.findIndex((h) => h.includes('姓名') || h.includes('成员'));
    const relIdx = headers.findIndex((h) => /关系|称谓|与本人/.test(h));
    const orgIdx = headers.findIndex((h) => /单位|工作/.test(h) && !/电话|手机/.test(h));
    const phoneIdx = headers.findIndex((h) => /电话|手机|联系方式/.test(h));
    const polIdx = headers.findIndex((h) => h.includes('政治面貌') || h.includes('党团'));
    if (nameIdx < 0 || relIdx < 0) continue;
    return { table, nameIdx, relIdx, orgIdx, phoneIdx, polIdx };
  }
  return null;
}

/** 家庭成员行"姓名"格内容（可见输入框优先、其次隐藏输入、无输入框的服务器展示行退回单元格文本，用于重复检测） */
function familyRowName(row: HTMLTableRowElement, info: FamilyTableInfo): string {
  if (info.nameIdx < 0 || !row.cells[info.nameIdx]) return '';
  const cell = row.cells[info.nameIdx];
  const el = (cell.querySelector('input:not([type="hidden"]), select') || cell.querySelector('input, select')) as HTMLInputElement | HTMLSelectElement | null;
  if (el && (el as HTMLInputElement).value && (el as HTMLInputElement).value.trim()) return (el as HTMLInputElement).value.trim();
  return normalizeText(cell.textContent || '');
}

/** 行是否"空"：姓名格必须有可见输入框且值为空（空白模板行/仅图标按钮的行不算可填空行） */
function familyRowEmpty(row: HTMLTableRowElement, info: FamilyTableInfo): boolean {
  if (info.nameIdx < 0 || !row.cells[info.nameIdx]) return false;
  const el = row.cells[info.nameIdx].querySelector('input:not([type="hidden"]), select') as HTMLInputElement | HTMLSelectElement | null;
  if (!el) return false;
  // 整行全空才算可填行：任一格已有内容（用户手填/半填）都不覆盖
  return rowFullyEmpty(row, [info.nameIdx, info.relIdx, info.orgIdx, info.phoneIdx, info.polIdx]);
}

/** 填写一行家庭成员 */
function fillFamilyRow(row: HTMLTableRowElement, m: FamilyMember, info: FamilyTableInfo): boolean {
  let wrote = false;
  const set = (i: number, val: string | undefined) => {
    if (i < 0 || !val || !val.trim() || !row.cells[i]) return;
    const el = row.cells[i].querySelector('input, select') as HTMLInputElement | HTMLSelectElement | null;
    if (!el) return;
    if (el.tagName === 'SELECT') {
      if (!setSelectValue(el as HTMLSelectElement, val)) return;
    } else {
      setInputValue(el as HTMLInputElement, val);
    }
    markEl(el, 'filled');
    wrote = true;
  };
  set(info.nameIdx, m.name);
  set(info.relIdx, m.relation);
  set(info.orgIdx, m.org);
  set(info.phoneIdx, m.phone);
  set(info.polIdx, m.politicalStatus);
  return wrote;
}

/** 家庭成员表格同步填充：按姓名匹配去重（含文本展示行），仅填空白可写行；跨多个家庭成员表格 */
function fillFamilyTables(profile: Profile, doc: Document, handled: Set<Element>, items: FillItem[], stats: { filled: number }): void {
  const members = profile.familyMembers.filter((m) => m.name && m.name.trim()).slice(0, 10);
  if (!members.length) return;
  const done = new Set<number>(); // 跨表格连续计数：已处理（已填/已存在）的成员不再到下一张表
  for (const table of Array.from(doc.querySelectorAll<HTMLTableElement>('table'))) {
    const allRows = Array.from(table.rows);
    if (allRows.length < 2) continue;
    const thead = table.querySelector('thead');
    let headerRow: HTMLTableRowElement | null = thead ? thead.rows[0] : null;
    if (!headerRow) {
      const first = rowTexts(allRows[0]);
      if (first.some((h) => h.includes('姓名') || h.includes('成员')) && first.some((h) => /关系|称谓|与本人/.test(h))) headerRow = allRows[0];
    }
    if (!headerRow) continue;
    const headers = rowTexts(headerRow);
    const info: FamilyTableInfo = {
      table,
      nameIdx: headers.findIndex((h) => h.includes('姓名') || h.includes('成员')),
      relIdx: headers.findIndex((h) => /关系|称谓|与本人/.test(h)),
      orgIdx: headers.findIndex((h) => /单位|工作/.test(h) && !/电话|手机/.test(h)),
      phoneIdx: headers.findIndex((h) => /电话|手机|联系方式/.test(h)),
      polIdx: headers.findIndex((h) => h.includes('政治面貌') || h.includes('党团')),
    };
    if (info.nameIdx < 0 || info.relIdx < 0) continue;
    // 整表控件标记"已处理"：空插入行也不能漏进通用字段匹配
    markGridHandled(table, handled);
    const selfName = normalizeText(profile.basic.name || '');
    // 自愈：行内姓名=本人姓名（通用字段误填进网格）→ 清空该行
    if (selfName) {
      dataRowsOf(table).forEach((r) => {
        if (normalizeText(familyRowName(r, info)) === selfName) clearRowControls(r);
      });
    }
    const allData = dataRowsOf(table);
    const writable = validDataRows(table);
    let filledThisTable = 0;
    const steps: string[] = [];
    members.forEach((m, i) => {
      if (done.has(i)) {
        steps.push(`m${i}:done-before`);
        return;
      }
      const norm = normalizeText(m.name);
      // 已在任意行（本表或服务器展示行）→ 标记已存在并跳过
      if (allData.some((r) => normalizeText(familyRowName(r, info)) === norm)) {
        done.add(i);
        steps.push(`m${i}:exists`);
        return;
      }
      const row = writable.find((r) => familyRowEmpty(r, info));
      if (!row) {
        steps.push(`m${i}:no-empty-row`);
        return;
      }
      const wrote = fillFamilyRow(row, m, info);
      steps.push(`m${i}:wrote=${wrote}`);
      if (!wrote) return;
      row.querySelectorAll('input, select').forEach((el) => handled.add(el));
      stats.filled++;
      done.add(i);
      filledThisTable++;
      items.push({ label: `家庭成员 ${i + 1}：${m.name}`, field: `familyMembers[${i}]`, status: 'filled', valuePreview: m.name, el: row.cells[info.nameIdx]?.querySelector('input, select') || undefined });
    });
    // 诊断：记录本表可见状态（网格异步渲染时排查"没填上"用）
    try {
      const store = (doc.defaultView as Window | null)?.sessionStorage;
      store?.setItem(
        'tui-family-debug',
        JSON.stringify({
          at: Date.now(),
          idx: { nameIdx: info.nameIdx, relIdx: info.relIdx, orgIdx: info.orgIdx, phoneIdx: info.phoneIdx, polIdx: info.polIdx },
          members: members.map((m) => m.name),
          rowNames: allData.map((r) => (familyRowName(r, info) || '<空>').slice(0, 10)),
          rowNameCellHtml: allData.map((r) => (r.cells[info.nameIdx] ? (r.cells[info.nameIdx].innerHTML || '').slice(0, 80) : '<无格>')),
          writableCount: writable.length,
          filledThisTable,
          steps,
        }),
      );
    } catch {
      // 忽略
    }
  }
}

/**
 * 家庭成员全自动填写：按姓名匹配去重，行数不够时自动点击"新增一行/保存"扩展（含整页回发后的断点续填）。
 * 北邮式逐行网格：填完立即点行内「添加」落库（自动换行），输入行里残留的未保存内容也会被补点「添加」保存。
 */
export async function fillFamilyMembers(
  profile: Profile,
  doc: Document,
  startIndex = 0,
  beforeAdd?: (i: number) => void | number,
  maxAddAttempts = 10,
  allowCommitActions = true,
  onProcessed?: (nextIndex: number) => void,
  isCancelled?: () => boolean,
): Promise<number> {
  const spec: DynamicTableSpec<FamilyTableInfo, FamilyMember> = {
    kind: 'family',
    entries: profile.familyMembers.filter((m) => m.name && m.name.trim()).slice(0, 10),
    findTable: findFamilyTable,
    // 页面已有该成员（含服务器文本展示行）→ 跳过；输入行里已填但未落库 → 补点本行 DoPostback「添加」
    matchExisting: async (info, entry, ctx) => {
      const existingRow = dataRowsOf(info.table).find((r) => normalizeText(familyRowName(r, info)) === normalizeText(entry.name));
      if (!existingRow) return null;
      if (!rowHasInput(existingRow)) return 'present'; // 已保存的服务器文本展示行
      const rowBtn = findAddButton(info.table, existingRow);
      if (ctx.allowCommitActions && rowBtn && isDoPostbackAction(rowBtn)) {
        await clickPageAction(rowBtn, clickAttempt(ctx.beforeAdd, ctx.index, ctx.attempt));
        await sleep(1500); // 北邮等服务器回发较慢：给足新行出现的时间再继续
        return 'retry';
      }
      return 'present'; // 其他站点旧行为：输入行内容视为已处理
    },
    isEmptyRow: (row, info) => familyRowEmpty(row, info),
    fillRow: (row, info, entry) => fillFamilyRow(row, entry, info),
    // 自愈：行内姓名=本人姓名（通用字段误填进网格）→ 清空该行
    beforeFillRow: (info) => {
      const selfName = normalizeText(profile.basic.name || '');
      if (!selfName) return;
      dataRowsOf(info.table).forEach((r) => {
        if (normalizeText(familyRowName(r, info)) === selfName) clearRowControls(r);
      });
    },
    rowCommitButton: (info, row) => findAddButton(info.table, row),
  };
  return runDynamicTableFill(spec, doc, startIndex, beforeAdd, maxAddAttempts, allowCommitActions, onProcessed, isCancelled);
}

/** 同源 iframe 内的文档列表（EasyUI 弹窗常在窗口里嵌 iframe 加载树/列表） */
function frameDocs(doc: Document): Document[] {
  const docs: Document[] = [doc];
  for (const f of Array.from(doc.querySelectorAll('iframe'))) {
    try {
      const d = f.contentDocument;
      if (d && d.body) docs.push(d);
    } catch {
      // 跨域 iframe 无法读取，忽略
    }
  }
  return docs;
}

/** 在页面浮层中查找与目标值匹配的选项候选（按匹配度排序：完全相等 > 包含且短；支持 el-select/select2/ant 等组件；含同源 iframe 弹层） */
function findPickerOptionCandidates(doc: Document, value: string): Element[] {
  const want = normalizeText(value);
  if (!want) return [];
  const sels =
    '[role="option"], .select2-results__option, .dropdown-item, .ant-select-item-option, .el-select-dropdown__item, ul[role="listbox"] li, .dropdown-menu li, .datagrid-row, .combobox-item, .jqx-item, [class*="listitem"], .combotree .tree-title, .tree-title, li, dd';
  const scored: Array<{ el: Element; len: number; exact: boolean }> = [];
  for (const d of frameDocs(doc)) {
    for (const cand of Array.from(d.querySelectorAll<HTMLElement>(sels))) {
      if (!isVisible(cand)) continue;
      const t = normalizeText(cand.textContent || '');
      if (!t) continue;
      if (t === want) scored.push({ el: cand, len: t.length, exact: true });
      else if (want.length >= 2 && t.includes(want) && t.length < 40) scored.push({ el: cand, len: t.length, exact: false });
    }
  }
  scored.sort((a, b) => (b.exact ? 1 : 0) - (a.exact ? 1 : 0) || a.len - b.len);
  return scored.map((s) => s.el);
}

/** 在页面浮层中查找与目标值匹配的选项（支持常见选择器组件：role=option、select2、el-select、ant-select、bootstrap dropdown 等；含同源 iframe 弹层） */
export function findPickerOption(doc: Document, value: string): Element | null {
  return findPickerOptionCandidates(doc, value)[0] || null;
}

/** 引导模式下的重试：联动下拉可能在上级字段选定后才加载出选项 */
export function trySetSelect(el: HTMLSelectElement, value: string): boolean {
  return setSelectValue(el, value);
}

/** 找出与当前页面（按适配器名）匹配的报考意向条目 */
function pickApplication(profile: Profile, url: string): Application | undefined {
  const apps = profile.applications.filter((a) => a.school && a.school.trim());
  if (!apps.length) return undefined;
  const adapter = matchAdapter(url);
  const hint = adapter ? adapter.name : '';
  const hit = apps.find((a) => hint.includes(a.school.trim()) || a.school.trim().includes(hint));
  if (hit) return hit;
  return apps.length === 1 ? apps[0] : undefined;
}

function parseScore(s: string): number | undefined {
  const m = /(\d{2,3}(?:\.\d+)?)/.exec(s || '');
  return m ? parseFloat(m[1]) : undefined;
}

/** 把 "2025-06 / 2025.06 / 2025/06 / 2025年6月" 等写法统一为 YYYY-MM */
function normalizeMonth(text: string): string | null {
  const t = (text || '').trim();
  const m = /^(\d{4})\s*[-/.]\s*(\d{1,2})$/.exec(t) || /^(\d{4})\s*年\s*(\d{1,2})\s*月?$/.exec(t);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}`;
}

/** 功能：奖励去重键用的月份规范形——兼容页面紧凑格式（202410）与分隔格式（2024-10）互认；无法解析时退回归一化原文本。 */
function monthKeyOf(text: string): string {
  const t = (text || '').trim();
  const m = /^(\d{4})\D?(\d{1,2})/.exec(t);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}` : normalizeText(t);
}

/** 高校名称片段 → 所在省份（按列表顺序取首个命中，越具体越靠前） */
const UNI_PROVINCE: Array<[string, string]> = [
  ['大连理工', '辽宁'], ['大连海事', '辽宁'], ['东北大学', '辽宁'], ['东北财经', '辽宁'], ['辽宁大学', '辽宁'], ['沈阳', '辽宁'],
  ['哈尔滨工业', '黑龙江'], ['哈尔滨工程', '黑龙江'], ['东北林业', '黑龙江'], ['黑龙江', '黑龙江'],
  ['吉林大学', '吉林'], ['东北师范', '吉林'], ['长春理工', '吉林'], ['延边大学', '吉林'],
  ['北京大学', '北京'], ['清华大学', '北京'], ['中国人民大学', '北京'], ['北京师范', '北京'], ['北京航空', '北京'], ['北京理工', '北京'], ['北京交通', '北京'], ['北京邮电', '北京'], ['北京科技', '北京'], ['北京化工', '北京'], ['北京工业', '北京'], ['北京林业', '北京'], ['中国农业', '北京'], ['中国政法', '北京'], ['中央财经', '北京'], ['中央民族', '北京'], ['对外经济贸易', '北京'], ['中国矿业(北京)', '北京'], ['中国地质(北京)', '北京'], ['中国石油(北京)', '北京'], ['中国科学院', '北京'], ['北京', '北京'],
  ['南开大学', '天津'], ['天津大学', '天津'], ['天津', '天津'],
  ['燕山大学', '河北'], ['河北工业', '河北'], ['河北大学', '河北'], ['河北', '河北'],
  ['太原理工', '山西'], ['山西大学', '山西'], ['中北大学', '山西'], ['山西', '山西'],
  ['内蒙古大学', '内蒙古'], ['内蒙古', '内蒙古'],
  ['复旦大学', '上海'], ['同济大学', '上海'], ['上海交通', '上海'], ['华东师范', '上海'], ['华东理工', '上海'], ['上海大学', '上海'], ['东华大学', '上海'], ['上海财经', '上海'], ['上海外国语', '上海'], ['上海科技', '上海'], ['上海', '上海'],
  ['南京大学', '江苏'], ['东南大学', '江苏'], ['南京理工', '江苏'], ['南京航空', '江苏'], ['河海大学', '江苏'], ['中国矿业', '江苏'], ['苏州大学', '江苏'], ['江南大学', '江苏'], ['南京农业', '江苏'], ['南京师范', '江苏'], ['中国药科', '江苏'], ['南京邮电', '江苏'], ['南京林业', '江苏'], ['南京中医药', '江苏'], ['南京信息工程', '江苏'], ['江苏大学', '江苏'], ['扬州大学', '江苏'], ['南京', '江苏'],
  ['浙江大学', '浙江'], ['浙江工业', '浙江'], ['杭州电子', '浙江'], ['宁波大学', '浙江'], ['浙江师范', '浙江'], ['温州医科', '浙江'], ['浙江', '浙江'],
  ['中国科学技术', '安徽'], ['合肥工业', '安徽'], ['安徽大学', '安徽'], ['安徽', '安徽'],
  ['厦门大学', '福建'], ['福州大学', '福建'], ['福建师范', '福建'], ['福建', '福建'],
  ['南昌大学', '江西'], ['江西财经', '江西'], ['江西', '江西'],
  ['山东大学', '山东'], ['中国海洋', '山东'], ['中国石油(华东)', '山东'], ['山东科技', '山东'], ['山东师范', '山东'], ['青岛大学', '山东'], ['山东第一医科', '山东'], ['山东', '山东'],
  ['郑州大学', '河南'], ['河南大学', '河南'], ['河南工业', '河南'], ['河南', '河南'],
  ['武汉大学', '湖北'], ['华中科技', '湖北'], ['武汉理工', '湖北'], ['华中师范', '湖北'], ['华中农业', '湖北'], ['中南财经政法', '湖北'], ['中国地质(武汉)', '湖北'], ['湖北大学', '湖北'], ['武汉科技', '湖北'], ['武汉', '湖北'], ['湖北', '湖北'],
  ['中南大学', '湖南'], ['湖南大学', '湖南'], ['湘潭大学', '湖南'], ['湖南农业', '湖南'], ['长沙理工', '湖南'], ['湖南', '湖南'],
  ['中山大学', '广东'], ['华南理工', '广东'], ['暨南大学', '广东'], ['深圳大学', '广东'], ['南方科技', '广东'], ['华南师范', '广东'], ['广东工业', '广东'], ['广州医科', '广东'], ['南方医科', '广东'], ['广东', '广东'],
  ['广西大学', '广西'], ['广西', '广西'],
  ['海南大学', '海南'], ['海南', '海南'],
  ['重庆大学', '重庆'], ['西南大学', '重庆'], ['重庆邮电', '重庆'], ['重庆', '重庆'],
  ['四川大学', '四川'], ['电子科技大学', '四川'], ['西南财经', '四川'], ['西南交通', '四川'], ['四川农业', '四川'], ['四川', '四川'],
  ['贵州大学', '贵州'], ['贵州', '贵州'],
  ['云南大学', '云南'], ['昆明理工', '云南'], ['昆明医科', '云南'], ['云南', '云南'],
  ['西藏大学', '西藏'], ['西藏', '西藏'],
  ['西安电子', '陕西'], ['西北工业', '陕西'], ['西安交通', '陕西'], ['西北大学', '陕西'], ['长安大学', '陕西'], ['西北农林', '陕西'], ['西安建筑', '陕西'], ['陕西师范', '陕西'], ['西安', '陕西'], ['陕西', '陕西'],
  ['兰州大学', '甘肃'], ['西北师范', '甘肃'], ['兰州理工', '甘肃'], ['兰州', '甘肃'], ['甘肃', '甘肃'],
  ['青海大学', '青海'], ['青海', '青海'],
  ['宁夏大学', '宁夏'], ['宁夏', '宁夏'],
  ['新疆大学', '新疆'], ['新疆', '新疆'],
];

function universityProvince(university: string): string | undefined {
  const u = (university || '').trim();
  if (!u) return undefined;
  for (const [key, prov] of UNI_PROVINCE) {
    if (u.includes(key)) return prov;
  }
  return undefined;
}

/** 从档案推导填充值（四六级是否通过、报考意向、院校省份等） */
export function deriveValue(profile: Profile, kind: NonNullable<FieldRule['derive']>, doc: Document): string | undefined {
  switch (kind) {
    case 'cet4Pass': {
      const sc = parseScore(profile.education.cet4);
      return sc === undefined ? undefined : sc >= 425 ? '通过' : '未通过';
    }
    case 'cet6Pass': {
      const sc = parseScore(profile.education.cet6);
      return sc === undefined ? undefined : sc >= 425 ? '通过' : '未通过';
    }
    case 'cetSummary': {
      // 外语水平单输入框：合成四六级摘要（海大式）
      const c4 = (profile.education.cet4 || '').trim();
      const c6raw = (profile.education.cet6 || '').trim();
      const c6 = c6raw && Number(parseScore(c6raw) || 0) > 0 ? c6raw : '';
      const parts: string[] = [];
      if (c4) parts.push(`大学英语四级（CET-4）${c4}分`);
      if (c6) parts.push(`大学英语六级（CET-6）${c6}分`);
      return parts.length ? parts.join('；') : undefined;
    }
    case 'rankPercent': {
      /**
       * 计算公式：排名百分比 = 专业名次 / 专业同年级人数 × 100%。
       * 只在两个来源均为正数且名次不大于人数时计算，避免用缺失或矛盾档案猜值。
       */
      const rank = Number((profile.education.rank || '').trim());
      const rankBase = Number((profile.education.rankBase || '').trim());
      if (!Number.isFinite(rank) || !Number.isFinite(rankBase) || rank <= 0 || rankBase <= 0 || rank > rankBase) return undefined;
      return (Math.round((rank / rankBase) * 10000) / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
    }
    case 'studyDuration': {
      /**
       * 计算公式：学制年数 = round((毕业年月 - 入学年月) / 12)。
       * 国内本科通常 9 月入学、6 月毕业，四年制实际月份差为 45 个月，四舍五入后为 4。
       * 仅接受页面实际提供的 3/4/5 年制，且与整年差距不超过 3 个月，证据不足时保持人工填写。
       */
      // 档案可能保存 YYYY-MM，也可能保存 YYYY-MM-DD；学制只需要年月，允许忽略“日”。
      const start = /^(\d{4})\D?(\d{1,2})/.exec((profile.education.startDate || '').trim());
      const end = /^(\d{4})\D?(\d{1,2})/.exec((profile.education.endDate || '').trim());
      if (!start || !end) return undefined;
      const startYear = Number(start[1]);
      const startMonth = Number(start[2]);
      const endYear = Number(end[1]);
      const endMonth = Number(end[2]);
      const monthSpan = (endYear - startYear) * 12 + endMonth - startMonth;
      const years = Math.round(monthSpan / 12);
      if (years < 3 || years > 5 || Math.abs(monthSpan - years * 12) > 3) return undefined;
      return ['零年制', '一年制', '二年制', '三年制', '四年制', '五年制'][years];
    }
    case 'applyMajor': {
      const app = pickApplication(profile, doc.location ? doc.location.href : '');
      return app && app.major ? app.major : undefined;
    }
    case 'applyType': {
      const app = pickApplication(profile, doc.location ? doc.location.href : '');
      if (!app || !app.degreeType) return undefined;
      if (/博/.test(app.degreeType)) return '直博';
      if (/硕/.test(app.degreeType)) return '硕士';
      return app.degreeType;
    }
    case 'applyCollege': {
      const app = pickApplication(profile, doc.location ? doc.location.href : '');
      return app && app.college ? app.college : undefined;
    }
    case 'applyDirection': {
      const app = pickApplication(profile, doc.location ? doc.location.href : '');
      return app && app.direction ? app.direction : undefined;
    }
    case 'universityProvince': {
      if (profile.education.province && profile.education.province.trim()) return profile.education.province.trim();
      return universityProvince(profile.education.university);
    }
    case 'hasSupervisor': {
      const app = pickApplication(profile, doc.location ? doc.location.href : '');
      if (!app) return undefined;
      return app.supervisor && app.supervisor.trim() ? '有' : '无';
    }
  }
  return undefined;
}

/** 弹层里的关键字搜索框（院校/专业选择弹窗常见：先输入关键字过滤出列表；含同源 iframe 弹层） */
function findPopupSearchInput(doc: Document): HTMLInputElement | null {
  for (const d of frameDocs(doc)) {
    const cands = Array.from(d.querySelectorAll<HTMLInputElement>('input')).filter((i) => {
      const type = (i.getAttribute('type') || 'text').toLowerCase();
      return isVisible(i) && !i.value && !['radio', 'checkbox', 'hidden', 'password'].includes(type);
    });
    for (const i of cands) {
      if (i.closest('[role="dialog"], .layui-layer, .popup, .dialog, [class*="layer"], [class*="modal"], [class*="panel"], [class*="pop"], [class*="select"], [class*="window"]')) {
        return i;
      }
    }
  }
  return null;
}

/** 去掉"省/市/区"等后缀再比较（南理工弹层节点文字可能是"陕西"不带"省"） */
function regionName(s: string): string {
  return normalizeText(s).replace(/(省|市|区|县|州|盟|旗|地区)$/g, '');
}

/** 省市县树形选择器兜底：按行政区划数据把"陕西省西安市未央区"拆成 省/市/区 逐级点击可见树节点（先点父级展开，末级选中）；
 *  兼容同源 iframe 弹层与东华大学式 `<a class="level0">陕西省</a>` 分层树：
 *  - 点击前中和空 href（防 `<a href="">` 触发 iframe 自身刷新把树重置）；
 *  - 节点点击带完整鼠标事件序列，兼容绑定在 mousedown/span 上的展开处理；
 *  - 子级异步加载：每级最多等 6 秒；
 *  - 层级长时间找不到时，用弹层关键字框"搜索市名"定位后再补点（东华正常操作流：搜→点→确定）；
 *  - 末级点选成功后自动点弹层「确定」提交。 */
async function pickRegionTree(doc: Document, el: Element, value: string): Promise<'picked' | 'none'> {
  // 数据驱动拆分优先（能识别直辖市/自治区/不带后缀写法）；解析不出再退回正则切分
  const tokens =
    regionTreeTokens(value).length >= 2
      ? regionTreeTokens(value)
      : (value || '')
          .split(/(?<=省|市|区|县|州|盟|旗|地区)/)
          .map((s) => s.trim())
          .filter((t) => t.length >= 2);
  if (tokens.length < 2) return 'none';
  const steps: string[] = ['tree-start'];
  const findTarget = (token: string): HTMLElement | null => {
    const tk = regionName(token);
    let best: HTMLElement | null = null;
    let bestScore = -1;
    for (const d of frameDocs(doc)) {
      const nodes = Array.from(
        d.querySelectorAll<HTMLElement>('.tree-node, .tree-title, [role="treeitem"], [class*="tree"] [class*="title"], a, li, dd, dt, div, span'),
      ).filter((n) => {
        if (!isVisible(n)) return false;
        const t = regionName(n.textContent || '');
        return t.length >= 2 && t.length <= 16;
      });
      for (const n of nodes) {
        const t = regionName(n.textContent || '');
        if (!(t === tk || (t.length >= 2 && (tk.endsWith(t) || t.endsWith(tk))))) continue;
        let score = 0;
        const cls = (n.getAttribute('class') || '').toLowerCase();
        const lv = /level(\d)/.exec(cls);
        if (lv) score += 10 + Math.min(Number(lv[1]), 5); // 分层树节点（东华大学式 level0/1/2）优先且更深的层更具体
        if (n.children.length === 0) score += 6; // 无子元素的叶节点优先：真实点击落在最内层文本（<a><span>陕西省</span></a> 的 span）上
        if (n.tagName === 'A') score += 2;
        if (/tree/.test(cls)) score += 3;
        if (score > bestScore) {
          bestScore = score;
          best = n;
        }
      }
    }
    return best;
  };
  const clickNode = (n: HTMLElement): void => {
    if (n.tagName === 'A') {
      const href = (n.getAttribute('href') || '').trim();
      if (!href || href === '#') {
        try {
          n.setAttribute('href', 'javascript:void(0)'); // 中和空链接，防止 iframe 整页刷新丢树
        } catch {
          // 忽略
        }
      }
    }
    try {
      n.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      n.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    } catch {
      // 忽略
    }
    n.click();
  };
  const findKeywordBox = (): { input: HTMLInputElement; btn: HTMLElement | null } | null => {
    for (const d of frameDocs(doc)) {
      const inputs = Array.from(d.querySelectorAll<HTMLInputElement>('input')).filter(
        (i) => isVisible(i) && (i.getAttribute('type') || 'text').toLowerCase() === 'text',
      );
      // 只认明确的关键字输入框（id/name/placeholder 带 keyword/关键字/txtWord 等），避免把无关表单字段当搜索框写入
      const input = inputs.find((i) => /keyword|关键字|txtword|txtkey|search/i.test(`${i.id || ''} ${i.name || ''} ${i.getAttribute('placeholder') || ''}`)) as HTMLInputElement | undefined;
      if (!input) continue;
      const btn = Array.from(d.querySelectorAll<HTMLElement>('button, a, input[type="button"], input[type="submit"], span')).find(
        (b) => isVisible(b) && /^(搜索|查询|查找)$/.test(normalizeText(b.textContent || b.getAttribute('value') || '')),
      ) || null;
      return { input, btn };
    }
    return null;
  };
  // 搜索关键字阶梯：6 位区划码优先（树按码直查最准，成熟填表软件同款做法），其次市名
  const searchKws = ((): string[] => {
    const out: string[] = [];
    const c = regionCode6(value);
    const n = regionKeywords(value)[0];
    for (const k of [c, n]) {
      if (k && out.indexOf(k) < 0) out.push(k);
    }
    return out;
  })();
  let searchIdx = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const isLast = i === tokens.length - 1;
    let target: HTMLElement | null = null;
    // 东华实测：点开父级后子级节点异步加载要 9 秒以上才出现 → 每级最多等 12 秒（命中即提前跳出）
    for (let attempt = 0; attempt < 20 && !target; attempt++) {
      target = findTarget(token);
      if (!target) await sleep(600);
    }
    if (!target) {
      // 后面的层级若已可见则跳过本级（关键字过滤后树上可能只剩末级链）
      let laterVisible = false;
      for (let j = i + 1; j < tokens.length && !laterVisible; j++) {
        laterVisible = !!findTarget(tokens[j]);
      }
      if (laterVisible) {
        steps.push('skip:' + token);
        continue;
      }
      // 展开没生效：改用弹层关键字框搜索定位（东华正常操作流：搜→点→确定）
      if (searchIdx < searchKws.length) {
        const kw = findKeywordBox();
        if (kw) {
          const kwText = searchKws[searchIdx] as string;
          searchIdx++;
          setInputValue(kw.input, kwText);
          steps.push('typed:' + kwText);
          if (kw.btn) {
            kw.btn.click();
            steps.push('clicked-search');
          }
          await sleep(1000); // 等搜索结果渲染
          i--; // 本轮重试：搜索后目标节点通常直接出现
          continue;
        }
      }
      steps.push('no-node:' + token);
      writePickDebug(doc, el, steps, false, 'none');
      return 'none';
    }
    steps.push('click:' + token + (isLast ? ':leaf' : ''));
    clickNode(target);
    await sleep(isLast ? 400 : 800); // 展开下一层需要更久（可能异步加载子级）
  }
  // 东华大学式 layui 弹层：点完末级后可能还需点弹层「确定」提交（未选好时点确定会提前关窗，故只在末级点选成功后才点）
  const confirmScopes: Document[] = [doc, ...frameDocs(doc).filter((d) => d !== doc)];
  const confirmCands = confirmScopes.flatMap((d) => Array.from(d.querySelectorAll<HTMLElement>('a, button, input[type="button"]')));
  const confirm =
    confirmCands.find(
      (b) => isVisible(b) && /layui-layer-btn/i.test(b.getAttribute('class') || '') && /^(确定|确认|完成|选中)$/.test(normalizeText(b.textContent || b.getAttribute('value') || '')),
    ) ||
    confirmCands.find(
      (b) => isVisible(b) && /^(确定|确认|完成|选中)$/.test(normalizeText(b.textContent || b.getAttribute('value') || '')) && /layer|dialog|window|modal/.test((b.closest('[class*="layer"], [class*="dialog"], [class*="window"], [class*="modal"]')?.getAttribute('class') || '')),
    );
  if (confirm) {
    confirm.click();
    steps.push('confirm-click');
    await sleep(400);
  }
  writePickDebug(doc, el, steps, false, 'picked');
  return 'picked';
}

/**
 * 地区三联直写：代码框(名/id 以 dm 结尾)+名称框+显示框直接写入 6 位区划码与名称，免开树弹窗。
 * 东华/北理工式 chooseArea 三联（hkszdm/hkszd/hkszdmc）用同源 6 位码直写即可，成熟填表软件同款做法；
 * 弹窗树点选仅作兜底。写过的输入框标记 filled，弹窗阶段会因值非空自动跳过。
 * 返回直写成功的组数。
 */
export function directFillRegionTriplets(doc: Document, items: FillItem[]): number {
  let done = 0;
  // 直写前解除 disabled/readonly（部分校把显示框锁到弹窗点选为止，成熟填表软件同款 enable 处理）
  const enable = (el: HTMLInputElement) => {
    try {
      el.removeAttribute('disabled');
      el.removeAttribute('readonly');
      (el as unknown as { readOnly?: boolean }).readOnly = false;
    } catch {
      // 忽略
    }
  };
  for (const it of items) {
    if (it.status !== 'picker' || !it.el || !(it.el instanceof HTMLInputElement)) continue;
    if (!doc.documentElement.contains(it.el)) continue;
    const code6 = regionCode6(it.valuePreview || '');
    if (!code6) continue;
    // 只从代码框入口处理一次（避免同一组三个框各写一遍）
    const isCodeBox = /(dm|bm|wm|cm)$/i.test(it.el.name || '') || /(dm|bm|wm|cm)$/i.test(it.el.id || '');
    if (!isCodeBox) continue;
    const cell = it.el.closest('td,th') || it.el.closest('tr') || it.el.parentElement;
    if (!cell) continue;
    const siblings = Array.from(cell.querySelectorAll<HTMLInputElement>('input')).filter((i) => i !== it.el);
    const displayEl = siblings.find((i) => /mc$/i.test((i.name || i.id || '').replace(/^\$/, '')));
    const nameEl = siblings.find((i) => i !== displayEl) || null;
    const full = (it.valuePreview || '').trim();
    if (!displayEl && !nameEl) continue;
    enable(it.el);
    setInputValue(it.el, code6);
    markEl(it.el, 'filled');
    if (nameEl) {
      enable(nameEl);
      setInputValue(nameEl, full);
      markEl(nameEl, 'filled');
    }
    if (displayEl) {
      enable(displayEl);
      setInputValue(displayEl, full);
      markEl(displayEl, 'filled');
    }
    done++;
    // 同组条目状态改为已填（弹窗阶段将跳过，不再弹树）
    for (const o of items) {
      if (o.el && (o.el === it.el || o.el === nameEl || o.el === displayEl)) {
        o.status = 'filled';
        o.reason = '地区三联直写（6 位区划码）';
      }
    }
    writePickDebug(doc, it.el, ['direct-code:' + code6, 'direct-name:' + full.slice(0, 12)], false, 'picked');
  }
  return done;
}

/** 关闭可能遗留的地区/院校选择弹层（layui/lhg/art 等常见壳；成熟填表软件同款清理，防止旧弹窗挡住后续字段） */
export function closeLeftoverPickers(doc: Document): void {
  const sels = [
    '.layui-layer-close',
    'a.layui-layer-close',
    '.layui-layer-btn2',
    '.lhgdialog_close',
    '.artDialog_close',
    'input[value="关闭"]',
  ];
  for (const sel of sels) {
    try {
      doc.querySelectorAll(sel).forEach((el) => {
        if (isVisible(el)) (el as HTMLElement).click();
      });
    } catch {
      // 忽略
    }
  }
  try {
    doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  } catch {
    // 忽略
  }
}

/** 选择器窗口上下文：新打开的同源 iframe（南理工 SelUniversity/SelMajor 等）或同文档可见窗口容器 */
interface SelectorCtx {
  d: Document;
  scope: HTMLElement;
  score: number;
}

function selectorContexts(doc: Document): SelectorCtx[] {
  const out: SelectorCtx[] = [];
  for (const f of Array.from(doc.querySelectorAll('iframe'))) {
    try {
      const d = f.contentDocument;
      if (!d || !d.body) continue;
      const url = f.src || '';
      if (/datepicker|calendar/i.test(url)) continue; // 日期选择器 iframe 排除
      const t = d.body.textContent || '';
      const empty = !t.trim();
      let score = empty ? -1 : 0; // 加载中的空白 iframe 降权但保留（回发期间短暂空白）
      if (/(sel|select|choose|pick|list|search|query|dict|dictionary|code)/i.test(url)) score += 3;
      if (/查询|搜索|查找/.test(t)) score += 1;
      if (/选择|选取|选中|确定/.test(t)) score += 1;
      if (/关键字|编\s*码|名\s*称/.test(t)) score += 1;
      if (isVisible(f)) score += 5; // 当前打开（可见）的选择器窗口优先于历史隐藏窗口
      out.push({ d, scope: d.body, score });
    } catch {
      // 跨域 iframe 无法读取，忽略
    }
  }
  for (const win of Array.from(doc.querySelectorAll<HTMLElement>('[class*="window"], [class*="panel"], [role="dialog"], [class*="layer"], [class*="modal"]'))) {
    if (!isVisible(win)) continue;
    const t = win.textContent || '';
    if (!/查询|搜索|查找|选择|选取|选中/.test(t)) continue;
    out.push({ d: doc, scope: win, score: 1 });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** 专业/院校名称 → 学科门类（选择器弹窗常需先选"类别"才能搜到目标） */
const CATEGORY_HINTS: Array<[RegExp, string]> = [
  [/哲学/, '哲学'],
  [/经济|金融|财政|贸易|保险|投资/, '经济学'],
  [/法学|法律|政治学|社会学|公安学/, '法学'],
  [/教育|学前|体育教育|特殊教育/, '教育学'],
  [/文学|英语|日语|汉语言|新闻|传播|翻译|外语/, '文学'],
  [/历史|考古|文物/, '历史学'],
  [/数学|物理|化学|生物|地理|天文|大气|海洋|心理|统计|力学/, '理学'],
  [/工程|机械|电气|电子|计算机|软件|网络|自动化|测控|仪器|信息|通信|材料|化工|土木|建筑|环境|能源|动力|交通|车辆|船舶|航空|航天|兵器|安全|食品|纺织|轻工|生物|制药|工业|理工|科技|智能|数据/, '工学'],
  [/农学|园艺|植物|动物|兽医|林学|水产|草业/, '农学'],
  [/医学|临床|口腔|护理|药学|中药|预防|卫生/, '医学'],
  [/管理|工商|行政|物流|旅游|图书|档案|公共事业/, '管理学'],
  [/艺术|美术|音乐|设计|舞蹈|戏剧|影视/, '艺术学'],
];

function categoryOf(value: string): string | null {
  for (const [re, cat] of CATEGORY_HINTS) {
    if (re.test(value)) return cat;
  }
  return null;
}

/** 回发型选择器窗口通用点选：类别下拉（若有）→ 关键字搜索框 → 查询按钮 → 表格行匹配目标值 → 点行内"选择"控件（南理工 SelUniversity/SelBkdzZydm 等）。
 * 三阶段、每步重新定位上下文（下拉 AutoPostBack / 查询回发都会重载 iframe）。 */
/** 选择器弹层里的"类别/门类"下拉（南理工专业选择器 SelBkdzZydm：选项 ≥6 且首项为请选择才算） */
function findCategorySelect(scope: HTMLElement): HTMLSelectElement | null {
  const sels = Array.from(scope.querySelectorAll<HTMLSelectElement>('select')).filter((s) => isVisible(s));
  for (const s of sels) {
    if (s.options.length < 6) continue;
    const first = normalizeText(s.options[0] ? s.options[0].text : '');
    if (first.includes('请选择')) return s;
  }
  return null;
}

/** 学科门类关键词 → 门类名（南理工专业库按门类过滤后才能查出结果）；命中不了返回 null 走逐类兜底 */
const MAJOR_CATEGORY_HINTS: Array<[RegExp, string]> = [
  [/计算机|软件|网络|人工智能|大数据|自动化|电气|电子|通信|信息|测控|仪器|机械|材料|化工|化学工程|环境|土木|建筑|车辆|能源|动力|航空航天|船舶|兵器|安全|光电|物联网|集成电路|智能制造|机器人|控制|冶金|采矿|石油|纺织|食品|生物工程|制药|包装|印刷|工业|工程|智能/, '工学'],
  [/数学|物理|化学|生物|地理|地质|天文|大气|海洋|统计|心理|生态|地球|空间/, '理学'],
  [/管理|工商|行政|人力|物流|工程管理|图书|档案|旅游|酒店|会计|审计/, '管理学'],
  [/经济|金融|财政|贸易|保险|投资/, '经济学'],
  [/法|政治|社会|公安|马克思/, '法学'],
  [/教育|学前|体育|运动|特殊教育/, '教育学'],
  [/汉语言|英语|日语|法语|德语|翻译|新闻|广告|传播|文学|艺术|音乐|美术|设计|戏剧|影视/, '文学'],
  [/医学|临床|口腔|护理|药学|中药|预防|基础医学/, '医学'],
  [/农|园艺|植物|动物|兽医|林|水产/, '农学'],
  [/哲学/, '哲学'],
  [/历史|考古|文物/, '历史学'],
];

function guessMajorCategory(value: string): string | null {
  const v = normalizeText(value);
  if (!v) return null;
  for (const [re, cat] of MAJOR_CATEGORY_HINTS) {
    if (re.test(v)) return cat;
  }
  return null;
}

/** 代码/名称树弹层里的关键字框（东华 treeSelectPage?lbcode=getZY/getSchool 等 layui 树） */
function findTreeKeywordBox(doc: Document): { d: Document; input: HTMLInputElement; btn: HTMLElement | null } | null {
  for (const d of frameDocs(doc)) {
    const input = Array.from(d.querySelectorAll<HTMLInputElement>('input')).find(
      (i) => isVisible(i) && (i.getAttribute('type') || 'text').toLowerCase() === 'text' && /keyword|关键字|txtword|txtkey|search/i.test(`${i.id || ''} ${i.name || ''} ${i.getAttribute('placeholder') || ''}`),
    ) as HTMLInputElement | undefined;
    if (!input) continue;
    const btn = Array.from(d.querySelectorAll<HTMLElement>('button, a, input[type="button"], input[type="submit"], span')).find(
      (b) => isVisible(b) && /^(搜索|查询|查找)$/.test(normalizeText(b.textContent || b.getAttribute('value') || '')),
    ) || null;
    return { d, input, btn };
  }
  return null;
}

/** 树里找目标名节点（允许"080301 测控技术与仪器"这类编码前缀；层级越深越优先，叶节点加分） */
function findTreeNameNode(doc: Document, full: string): HTMLElement | null {
  const want = normalizeText(full);
  if (want.length < 2) return null;
  let best: HTMLElement | null = null;
  let bestScore = -1;
  for (const d of frameDocs(doc)) {
    const nodes = Array.from(d.querySelectorAll<HTMLElement>('a, li, span, div')).filter((n) => {
      if (!isVisible(n)) return false;
      const cls = (n.getAttribute('class') || '').toLowerCase();
      return /level\d|tree/.test(cls) && !/请选择/.test(normalizeText(n.textContent || ''));
    });
    for (const n of nodes) {
      const t = normalizeText(n.textContent || '');
      if (!t || t.length > 60 || !t.includes(want)) continue;
      let score = 0;
      const lv = /level(\d)/.exec(n.getAttribute('class') || '');
      if (lv) score += Number(lv[1]);
      if (t === want) score += 10;
      if (n.children.length === 0) score += 2; // 叶节点优先
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }
  }
  return best;
}

/** 代码/名称树弹层（东华 getZY/getSchool 等）：关键字搜索 → 点击匹配节点 → 点「确定」（成熟填表软件同款套路） */
async function pickCodeTree(doc: Document, el: Element, value: string): Promise<'picked' | 'none'> {
  const want = (value || '').trim();
  if (want.length < 2) return 'none';
  const steps: string[] = ['codetree-start'];
  const kws = [want, want.slice(0, 4)].filter((k, i, a) => k && k.length >= 2 && a.indexOf(k) === i);
  const confirmBtn = (): HTMLElement | null => {
    const scopes: Document[] = [doc, ...frameDocs(doc).filter((d) => d !== doc)];
    return scopes
      .flatMap((d) => Array.from(d.querySelectorAll<HTMLElement>('a, button, input[type="button"]')))
      .find((b) => isVisible(b) && /layui-layer-btn/i.test(b.getAttribute('class') || '') && /^(确定|确认|完成|选中)$/.test(normalizeText(b.textContent || b.getAttribute('value') || ''))) || null;
  };
  const cat = guessMajorCategory(want);
  for (let round = 0; round < 2; round++) {
    if (round === 1 && cat) {
      // 搜索没直接露出叶子：先点门类节点展开（如 工学）
      const catNode = findTreeNameNode(doc, cat);
      if (catNode) {
        catNode.click();
        steps.push('click-cat:' + cat);
        await sleep(800);
      }
    }
    for (const kw of kws) {
      const box = findTreeKeywordBox(doc);
      if (!box) {
        steps.push('no-keyword-box');
        break;
      }
      setInputValue(box.input, kw);
      steps.push('typed:' + kw);
      if (box.btn) {
        box.btn.click();
        steps.push('clicked-search');
      }
      let target: HTMLElement | null = null;
      for (let a = 0; a < 14 && !target; a++) {
        await sleep(500);
        target = findTreeNameNode(doc, want);
      }
      if (target) {
        target.click();
        steps.push('click-node:' + want.slice(0, 12));
        await sleep(500);
        const confirm = confirmBtn();
        if (confirm) {
          confirm.click();
          steps.push('confirm-click');
          await sleep(400);
        }
        writePickDebug(doc, el, steps, false, 'picked');
        return 'picked';
      }
      steps.push('no-node:' + kw);
    }
  }
  writePickDebug(doc, el, steps, false, 'none');
  return 'none';
}

async function pickSelectorWindow(doc: Document, el: Element, value: string, isAborted?: () => boolean, context?: PopupPickContext): Promise<'picked' | 'none'> {
  const aborted = isAborted || (() => false);
  const want = normalizeText(value);
  if (!want) return 'none';
  const full = value.trim().length > 10 ? value.trim().slice(0, 10) : value.trim();
  // 地区值：用行政区划数据生成短关键字与行匹配 token（"西安市"/"未央区"远比整串地址命中率高）
  const regionToks = regionMatchTokens(value);
  const rowNeedle = regionToks[0] || want.slice(0, 4);
  const steps: string[] = ['selector-start'];
  const logResult = (result: 'picked' | 'none') => {
    writePickDebug(doc, el, steps, false, result);
    return result;
  };
  // 精确绑定当前字段自己的代码/名称框；禁止退化为“整个表单的第一个 dm + 第一个 mc”。
  const pairInputs = () => resolveCodeNameBinding(doc, el, context);
  const pairReady = (): boolean => {
    const binding = pairInputs();
    return !!binding && verifyCodeNameBinding(binding, value, context);
  };
  const findRowControl = (scope: HTMLElement, needle: string): { control: HTMLElement; text: string; code: string } | null => {
    const rows = Array.from(scope.querySelectorAll<HTMLTableRowElement>('tr')).filter((r) => {
      if (!isVisible(r)) return false;
      const t = normalizeText(r.textContent || '');
      return t.length >= 2 && !!r.querySelector('a, button, input[type="button"], input[type="submit"], input[type="image"], [onclick]');
    });
    if (!rows.length) return null;
    const normNeedle = normalizeText(needle);
    const hits = normNeedle
      ? rows.filter((r) => normalizeText(r.textContent || '').includes(normNeedle))
      : rows;
    const row = hits.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)[0];
    if (!row) return null;
    const cands = Array.from(row.querySelectorAll<HTMLElement>('a, button, input[type="button"], input[type="submit"], input[type="image"], span'));
    const control =
      cands.find((c) => /^(选择|选取|选中|确定)$/.test(normalizeText(c.textContent || c.getAttribute('value') || ''))) ||
      cands.find((c) => /(select|choose|pick)/.test((c.getAttribute('class') || '').toLowerCase())) ||
      cands.find((c) => c.tagName === 'INPUT' && (c.getAttribute('type') || '').toLowerCase() === 'image') ||
      cands[cands.length - 1] ||
      null;
    if (!control) return null;
    const text = (row.textContent || '').trim().slice(0, 30);
    const code = ((text.match(/\d{4,8}/) || [])[0] || '') as string;
    return { control, text, code };
  };
  // 点击行内选择控件后：确认按钮 → 成对校验 → 明文兜底（参考成熟填表软件的南理工配方）
  const clickAndSettle = async (hit: { control: HTMLElement; text: string; code: string }): Promise<'picked' | 'none'> => {
    steps.push('row:' + hit.text);
    steps.push('control:' + hit.control.tagName.toLowerCase() + (hit.control.getAttribute('type') || ''));
    hit.control.click();
    steps.push('clicked-select');
    await sleep(1200);
    const confirmScopes: HTMLElement[] = [];
    const ctxAfter = selectorContexts(doc)[0];
    if (ctxAfter) confirmScopes.push(ctxAfter.scope);
    confirmScopes.push(doc.body);
    const confirm = confirmScopes
      .flatMap((s) => Array.from(s.querySelectorAll<HTMLElement>('a, button, input[type="button"], input[type="submit"], input[type="image"], span')))
      .filter((b) => isVisible(b))
      .find((b) => {
        const t = normalizeText(b.textContent || b.getAttribute('value') || '');
        const cls = (b.getAttribute('class') || '').toLowerCase();
        const src = (b.getAttribute('src') || '').toLowerCase();
        if (/^(确定|确认|完成|选中)$/.test(t)) return true;
        if (/(check|ok|confirm|finish)/.test(cls)) return true;
        return /(check|ok|confirm|gou|dui|yes|sure)/.test(src);
      });
    if (confirm) {
      confirm.click();
      steps.push('clicked-confirm:' + confirm.tagName.toLowerCase());
    }
    const ctxAgain = selectorContexts(doc)[0];
    if (ctxAgain) {
      const hit2 = findRowControl(ctxAgain.scope, rowNeedle);
      if (hit2) {
        hit2.control.click();
        steps.push('clicked-select-again');
      }
    }
    // 成对校验：码框数字 + 名框中文才算成功；短轮询 5 次（2.5s）无回填立即转明文兜底（成熟页面回填都在 1s 内，纯空等没有价值）
    for (let v = 0; v < 5; v++) {
      if (pairReady()) {
        steps.push('pair-ok');
        return logResult('picked');
      }
      await sleep(500);
    }
    // 明文兜底：行文本取码 + 档案值取名，成对写入（弹窗失败时的最后一手）
    const binding = pairInputs();
    let wrote = false;
    if (binding?.code && hit.code) {
      setInputValue(binding.code, hit.code);
      wrote = true;
    }
    if (binding?.name) {
      setInputValue(binding.name, value.trim());
      wrote = true;
    }
    if (wrote) steps.push('plaintext-fallback:' + hit.code);
    for (let v = 0; v < 8; v++) {
      if (pairReady()) {
        steps.push('pair-ok-fallback');
        return logResult('picked');
      }
      await sleep(500);
    }
    steps.push('pair-incomplete');
    return logResult('none');
  };

  // 关键字阶梯：地区值按数据生成短关键字（市/区/市+区，最多 3 个）；其余全名 → 前 6 字 → 前 4 字。
  // 带"类别"下拉的选择器（南理工专业选择器 SelBkdzZydm）：先按门类设置类别再查询，否则关键字查不出结果
  const keywords: string[] = [];
  // 学校/专业优先按目标系统代码查询，再尝试国家标准/新旧目录别名，最后才按名称模糊查询。
  // 代码查询可避免同名院校、专业简称和名称变更造成误选。
  const codeKws = [context?.expectedCode || '', ...(context?.codeAliases || [])].filter((item) => /^[a-z0-9._-]{2,20}$/i.test(item));
  const candKws = regionToks.length ? regionKeywords(value) : [...codeKws, full, full.slice(0, 6), full.slice(0, 4)];
  for (const k of candKws) {
    if (k && k.length >= 2 && keywords.indexOf(k) < 0) keywords.push(k);
  }
  let queryDone = false;
  let pageScopeAbort = false;
  for (const kw of keywords) {
    if (aborted() || pageScopeAbort) {
      steps.push('aborted');
      break;
    }
    let ctx = selectorContexts(doc)[0];
    if (!ctx) {
      steps.push('no-context');
      break;
    }
    // 类别下拉：门类过滤（选项 ≥6 且首项为"请选择"才算），猜测门类置前，其余依次兜底
    const catSel0 = findCategorySelect(ctx.scope);
    const cats: Array<string | null> = catSel0
      ? (() => {
          const order: Array<string | null> = [];
          const opts = Array.from(catSel0.options)
            .map((o) => (o.text || '').trim())
            .filter((t) => t && !/请选择/.test(t));
          const guess = guessMajorCategory(value);
          if (guess && opts.indexOf(guess) >= 0) order.push(guess);
          for (const o of opts) {
            if (order.indexOf(o) < 0) order.push(o);
          }
          return order.slice(0, 12);
        })()
      : [null];
    let kwDone = false;
    for (const cat of cats) {
      if (aborted()) {
        steps.push('aborted');
        kwDone = true;
        break;
      }
      ctx = selectorContexts(doc)[0];
      if (!ctx) break;
      if (cat) {
        // 类别变更可能触发回发换掉 iframe 文档 → 重新定位下拉
        const sel = findCategorySelect(ctx.scope);
        if (sel && !setSelectValue(sel, cat)) {
          steps.push('no-cat:' + cat);
          continue;
        }
        steps.push('cat:' + cat);
        // 等回发后的 iframe 文档稳定（旧文档可能已 detached，此时输入会写丢）
        let stable = false;
        for (let s = 0; s < 10 && !stable; s++) {
          await sleep(500);
          const c = selectorContexts(doc)[0];
          if (c) {
            try {
              const wd = c.d.defaultView;
              if (wd && wd.document === c.d && c.scope.querySelector('input[type="text"], input:not([type])')) stable = true;
            } catch {
              // 忽略
            }
          }
        }
        ctx = selectorContexts(doc)[0];
        if (!ctx) break;
      }
      const scope = ctx.scope;
      // 弹层上下文若是主页面/主表单（ctx 误命中页面容器）：绝不把关键字打进主表单输入框（曾把"共青团员"打进姓名框）
      const scopeIsPage = !ctx || scope === doc.body || scope === doc.documentElement || scope.contains(el);
      const btn = Array.from(scope.querySelectorAll<HTMLElement>('a, button, input[type="button"], input[type="submit"], span')).find((b) =>
        isVisible(b) && /^(查询|搜索|查找|确定|查 询|搜 索)$/.test(normalizeText(b.textContent || b.getAttribute('value') || '')),
      );
      if (!btn && scopeIsPage) {
        steps.push('no-query-btn-page');
        pageScopeAbort = true; // 页面级误判：放弃关键字路径与末尾空等扫描（防误打字、提速）
        break;
      }
      const input = Array.from(scope.querySelectorAll<HTMLInputElement>('input')).find((i) => {
        const type = (i.getAttribute('type') || 'text').toLowerCase();
        if (!isVisible(i) || type !== 'text') return false;
        if (scopeIsPage) return false; // 主表单输入框绝不充当弹层搜索框
        if (detectField(i).rule) return false; // 已识别为档案字段的输入框绝不打字
        return true;
      });
      if (input) {
        setInputValue(input, kw);
        steps.push('typed-kw:' + kw);
      } else {
        steps.push('no-kw-input');
      }
      await sleep(400);
      if (aborted()) {
        steps.push('aborted');
        kwDone = true;
        break;
      }
      ctx = selectorContexts(doc)[0];
      if (btn) {
        // javascript:__doPostBack 型查询链接：在弹层 iframe 的主世界执行（成熟填表软件同款做法，隔离世界 click 不稳定）
        const href = (btn.getAttribute('href') || '').trim();
        if (btn.tagName === 'A' && /^javascript:/i.test(href) && /dopostback/i.test(href)) {
          try {
            const w = (ctx ? ctx.d.defaultView : null) as Window | null;
            if (w) {
              w.location.href = `javascript:void(${href.replace(/^javascript:/i, '')})`;
              steps.push('clicked-query(mainworld):' + kw);
            } else {
              btn.click();
              steps.push('clicked-query:' + kw);
            }
          } catch {
            btn.click();
            steps.push('clicked-query:' + kw);
          }
        } else {
          btn.click();
          steps.push('clicked-query:' + kw);
        }
        queryDone = true;
      } else {
        steps.push('no-query-btn');
      }
      writePickDebug(doc, el, steps, true, 'none');
      // 地区值：查询后树节点通常已定位到目标（东华树形弹层），直接交给树点选逐级点击，别再空等 tr 结果行
      if (regionToks.length) {
        if ((await pickRegionTree(doc, el, value)) === 'picked') return logResult('picked');
      }
      // 等结果行（loading... 可长达 10s+；设了类别时每类别少等几轮，避免超预算）
      // 查询会触发 iframe 回发：重载瞬间 contentDocument 短暂不可读，此时继续等而不是放弃本关键字
      const polls = cat ? 5 : 12;
      for (let a = 0; a < polls; a++) {
        const c2 = selectorContexts(doc)[0];
        if (!c2) {
          await sleep(600);
          continue;
        }
        const hit = findRowControl(c2.scope, kw);
        if (hit) {
          const res = await clickAndSettle(hit);
          if (res === 'picked') return res;
          kwDone = true; // 该关键字已点过行但未成功 → 换下一关键字（不再试其他类别）
          break;
        }
        if (a % 5 === 4) writePickDebug(doc, el, steps, true, 'none');
        await sleep(600);
      }
      if (kwDone) break;
    }
    if (pageScopeAbort) break;
  }
  // 最后：直接扫弹窗当前已加载的行（无查询也常有全量列表；服务器不返回结果时仍可点行）；
  // 地区值依次尝试 市/区 token，命中率远高于整串地址
  if (pageScopeAbort) return logResult('none');
  const finalNeedles = regionToks.length ? [...regionToks, want] : [want];
  for (let a = 0; a < 8; a++) {
    const cFinal = selectorContexts(doc)[0];
    if (!cFinal) {
      await sleep(600); // 回发重载间隙：继续等
      continue;
    }
    let hit: { control: HTMLElement; text: string; code: string } | null = null;
    for (const n of finalNeedles) {
      hit = findRowControl(cFinal.scope, n);
      if (hit) break;
    }
    if (hit) {
      const res = await clickAndSettle(hit);
      if (res === 'picked') return res;
    }
    await sleep(600);
  }
  steps.push('exhausted' + (queryDone ? '' : '-no-query'));
  return logResult('none');
}

/** 记录弹窗点选调试信息（报告里可见，用于远程定位"卡在哪一步"） */
function writePickDebug(doc: Document, el: Element, attempts: string[], opened: boolean, result: string): void {
  try {
    const store = (doc.defaultView as Window | null)?.sessionStorage;
    if (!store) return;
    let arr: Array<Record<string, unknown>> = [];
    try {
      arr = JSON.parse(store.getItem('tui-pick-debug') || '[]') as Array<Record<string, unknown>>;
    } catch {
      arr = [];
    }
    arr.push({ at: Date.now(), name: (el as HTMLElement).getAttribute('name') || (el as HTMLElement).id || '', attempts, opened, result });
    store.setItem('tui-pick-debug', JSON.stringify(sanitizeDiagnosticValue(arr.slice(-10))));
  } catch {
    // 忽略
  }
}

/** 逐级尝试打开选择器弹层：外层 linkbutton <a> → 触发元素 → 输入框本身 → 完整鼠标事件序列；未检测到弹层也不中断（浮层可能本来就渲染在页面里） */
async function tryOpenPicker(doc: Document, inputEl: Element, trigger: Element): Promise<boolean> {
  const popupVisible = (): number =>
    Array.from(
      doc.querySelectorAll<HTMLElement>(
        '[class*="window"], [class*="panel"], [role="dialog"], [class*="layer"], [class*="modal"], [role="listbox"], [class*="tree"], [class*="popper"], iframe',
      ),
    ).filter((e) => isVisible(e)).length;
  const before = popupVisible();
  const a = trigger.closest('a, button') as HTMLElement | null;
  const strategies: Array<{ name: string; fire: () => void }> = [];
  strategies.push({ name: a && a !== trigger ? 'closest-a' : 'trigger', fire: () => (a && a !== trigger ? a : (trigger as HTMLElement)).click() });
  strategies.push({
    name: 'mouse-seq',
    fire: () => {
      const t = a || (trigger as HTMLElement);
      t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      t.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    },
  });
  strategies.push({ name: 'input', fire: () => (inputEl as HTMLElement).click() });
  const log: string[] = [];
  for (const s of strategies) {
    log.push(s.name);
    try {
      s.fire();
    } catch {
      // 忽略点击异常
    }
    await sleep(350);
    // 打开即停：el-select 等组件是"点一下开、再点一下关"的 toggle，后续策略会把刚打开的下拉再点关
    if (popupVisible() > before) {
      writePickDebug(doc, inputEl, log, true, 'opened');
      return true;
    }
  }
  writePickDebug(doc, inputEl, log, false, 'unknown');
  return false;
}

/** 弹窗选择框半自动：点「选择」按钮打开选择器，若浮层选项可定位则自动点选；必要时先在弹层搜索框输入关键字过滤 */
export async function pickInPage(doc: Document, el: Element, value: string, context?: PopupPickContext, isCancelled?: () => boolean): Promise<'picked' | 'opened' | 'none'> {
  // 组件下拉（jqx 等"请选择..."组件，页面上无原生 select）：进入组件下拉内核
  const widget = resolveWidgetDropdown(doc, el);
  if (widget) {
    return await pickWidgetDropdown(doc, widget, value, isCancelled);
  }
  // 本科院校和本科专业先进入各自独立内核；不适用时才回落到通用地区树/浮层流程。
  if (context?.profilePath === 'education.university') {
    const result = await pickSchool(doc, el, value, context, isCancelled);
    if (result !== 'not-applicable') return result === 'failed' ? 'none' : result;
  }
  if (context?.profilePath === 'education.major') {
    const result = await pickMajor(doc, el, value, context, isCancelled);
    if (result !== 'not-applicable') return result === 'failed' ? 'none' : result;
  }
  if (context?.componentDriver) {
    const component = await pickComponentOption(el, value, context, isCancelled);
    if (component.status !== 'not-applicable') return component.status === 'failed' ? 'none' : component.status;
  }
  // Element-UI 等组件无独立"选择"按钮：点输入框自身即可展开下拉（海大式 el-select）
  const trigger = findPickerTrigger(el) || (el.closest('.el-select, [class*="el-select"]') ? (el as Element) : null);
  if (!trigger) return 'none';
  let aborted = false;
  const timed = new Promise<'picked' | 'opened' | 'none'>((resolve) => {
    setTimeout(() => {
      aborted = true; // 超时后内部流程立即中止，不再继续打字/点击（防止污染主表单、拖慢整体）
      writePickDebug(doc, el, ['flow:timeout-20s'], true, 'none');
      resolve('none');
    }, 20_000); // 弹窗选择整体预算 20s（原 30s）：配合兜底提前写入，失败更快转人工
  });
  try {
    return await Promise.race([pickInPageInner(doc, el, trigger, value, () => aborted || !!isCancelled?.() || !el.isConnected, context), timed]);
  } catch (e) {
    writePickDebug(doc, el, ['pick-exception:' + String((e as Error).message || e).slice(0, 60)], false, 'none');
    return 'none';
  }
}

/** 功能：把字段控件（隐藏值域或组件本体）解析成组件下拉的可点击本体。 */
function resolveWidgetDropdown(doc: Document, el: Element): HTMLElement | null {
  if (!(el instanceof (el.ownerDocument?.defaultView || doc.defaultView)!.HTMLElement) && !(el instanceof HTMLElement)) return null;
  const html = el as HTMLElement;
  if (html.getAttribute('data-tui-widget') === 'dropdown') return html;
  const key = html.getAttribute('data-tui-widget-key');
  if (!key) return null;
  return doc.querySelector<HTMLElement>(`[data-tui-widget="dropdown"][data-tui-widget-key="${key}"]`);
}

/**
 * 功能：组件下拉（无原生 select 的 jqx/自定义组件）点选内核：
 * 点开组件 → 按档案值及其别名（男→male/m/1 等，兼容英文选项）轮询浮层选项 → 逐个尝试点选 → 回读验证。
 * 回读以值载体（隐藏域/组件显示输入框）为准——jqx 会把选项列表预渲染在容器里，组件文本不可作为选中依据；
 * 页面自身的组件脚本负责写入真实值与联动；扩展只负责“替用户点”，绝不猜测隐藏域编码。
 */
async function pickWidgetDropdown(doc: Document, widget: HTMLElement, value: string, isCancelled?: () => boolean): Promise<'picked' | 'opened' | 'none'> {
  const target = normalizeText(value);
  if (!target) return 'opened';
  const key = widget.getAttribute('data-tui-widget-key') || '';
  const targetSel = widget.getAttribute('data-tui-widget-target') || '';
  // 值载体统一按 key 解析（jqx 显示输入框可能没有 id/name，target 属性此时为空）
  const valueEl = (targetSel ? doc.querySelector<HTMLInputElement>(targetSel) : null) || (key ? doc.querySelector<HTMLInputElement>(`[data-tui-widget="dropdown-value"][data-tui-widget-key="${key}"]`) : null);
  // 选项与回读都按“档案值 + 编码别名”匹配（ VALUE_ALIASES：男→male/m/1、女→female/f/2 等，兼容英文选项页面）
  const aliasSet = [target, ...((VALUE_ALIASES[normalizeText(value)] || []).map((a) => normalizeText(a)))].filter((a, i, arr) => a && arr.indexOf(a) === i);
  const committed = (): boolean => {
    if (valueEl) {
      const v = normalizeText(valueEl.value || '');
      if (v && aliasSet.some((a) => v === a || (a.length >= 2 && v.includes(a)))) return true;
    }
    // 组件文本回读对有/无值载体都生效：博思等框架可能只更新组件显示文本、不写隐藏域；
    // 只认精确等于别名（jqx 弹层若渲染在组件内部，includes 会被预渲染选项误判，绝不能用）
    const text = normalizeText(widget.textContent || '');
    return !!text && text !== '请选择' && aliasSet.some((a) => text === a);
  };
  // 页面已预选：无需再点
  if (committed()) {
    widget.setAttribute('data-tui-value', (valueEl && valueEl.value.trim()) || value);
    markEl(widget, 'filled');
    if (valueEl) markEl(valueEl, 'filled');
    return 'picked';
  }
  const widgetSteps: string[] = [];
  // jqx 学校列表使用虚拟渲染，目标学校可能根本不在当前 DOM 中。
  // 优先通过主世界白名单桥调用组件 getItems/selectItem；失败才回退到可见选项点选。
  const jqxResult = await mainWorldJqxSelectLabel(doc, widget, value);
  if (isCancelled?.()) return 'none'; // I01:主世界点选返回后原轮可能已失效
  widgetSteps.push(jqxResult.ok ? 'jqx-api-selected' : `jqx-api-${jqxResult.reason || 'failed'}`);
  if (jqxResult.ok) {
    await sleep(180);
    if (committed()) {
      widget.setAttribute('data-tui-value', (valueEl && valueEl.value.trim()) || value);
      markEl(widget, 'filled');
      if (valueEl) markEl(valueEl, 'filled');
      writePickDebug(doc, widget, ['widget-api-pick'], false, 'picked');
      return 'picked';
    }
  }
  const open = (): void => {
    try {
      widget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      widget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    } catch {
      // 忽略
    }
    try {
      widget.click();
    } catch {
      // 忽略
    }
  };
  open();
  let filterFilled = false;
  const tried = new Set<Element>();
  for (let round = 0; round < 14; round++) {
    await sleep(300);
    if (!docAlive(doc)) return 'opened';
    if (isCancelled?.()) return 'none'; // I01:轮询浮层期间原轮失效 → 不再点选/写隐藏代码
    if (committed()) {
      widget.setAttribute('data-tui-value', (valueEl && valueEl.value.trim()) || value);
      markEl(widget, 'filled');
      if (valueEl) markEl(valueEl, 'filled');
      writePickDebug(doc, widget, ['widget-pick'], false, 'picked');
      return 'picked';
    }
    // jqx 大数据下拉采用虚拟列表：DOM 初始只渲染前几所学校，其余项是空壳。
    // 广工大列表自带“请查找”过滤框；输入档案值后由页面组件自行筛选，再按原流程点选并回读隐藏模型。
    if (!filterFilled) {
      const listBoxId = widget.getAttribute('aria-owns') || '';
      let filterInput: HTMLInputElement | null = null;
      if (listBoxId) {
        filterInput = doc.getElementById(listBoxId)?.querySelector<HTMLInputElement>('.jqx-listbox-filter-input') || null;
      }
      filterInput ||= Array.from(doc.querySelectorAll<HTMLInputElement>('.jqx-listbox-filter-input')).find((input) => isVisible(input)) || null;
      if (filterInput) {
        widgetSteps.push('filter-found');
        await setJqxFilterValue(filterInput, value);
        filterFilled = true;
        // jqx 会在 keyup 后异步过滤并重新渲染虚拟行，给远端数据源留出首轮响应时间。
        await sleep(700);
        if (isCancelled?.()) return 'none'; // I01:过滤等待后复核原轮
        const visibleOptionCount = Array.from(doc.querySelectorAll<HTMLElement>('[role="option"],.jqx-item,[class*="listitem"]'))
          .filter((item) => isVisible(item) && !!(item.textContent || '').trim()).length;
        widgetSteps.push(`filter-visible:${Math.min(visibleOptionCount, 999)}`);
      }
    }
    // 依次按“档案值 → 别名”找浮层选项（英文选项页面靠别名命中）
    let clicked = false;
    for (const alias of aliasSet) {
      const cands = findPickerOptionCandidates(doc, alias).filter((c) => !tried.has(c));
      if (round === 0 && alias === aliasSet[0]) widgetSteps.push(`exact-candidates:${Math.min(cands.length, 99)}`);
      if (!cands.length) continue;
      if (round === 3) open(); // 列表可能被收起：重新展开一次
      for (const cand of cands.slice(0, 3)) {
        tried.add(cand);
        try {
          const h = cand as HTMLElement;
          h.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          h.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          h.click();
        } catch {
          // 忽略
        }
        await sleep(350);
        clicked = true;
        if (committed()) {
          widget.setAttribute('data-tui-value', (valueEl && valueEl.value.trim()) || value);
          markEl(widget, 'filled');
          if (valueEl) markEl(valueEl, 'filled');
          writePickDebug(doc, widget, ['widget-pick'], false, 'picked');
          return 'picked';
        }
      }
      if (clicked) break; // 该别名已点过选项：本轮不再换别名连点，等回读或下一轮重试
    }
  }
  // 未能安全点选：收起浮层（Escape），留下醒目提示交人工处理
  try {
    widget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
  } catch {
    // 忽略
  }
  // 组件下拉没有候选时已经发送 Escape 收起；它不同于“需人工确认的弹窗”，不能返回 opened。
  // 返回 none 后上层会继续处理后续 picker（例如本科学制），避免学校失败阻塞整条队列。
  writePickDebug(doc, widget, ['widget-no-option', ...widgetSteps], false, 'none');
  return 'none';
}
async function pickInPageInner(doc: Document, el: Element, trigger: Element, value: string, isAborted: () => boolean, context?: PopupPickContext): Promise<'picked' | 'opened' | 'none'> {
  await tryOpenPicker(doc, el, trigger); // 多策略点开弹层（检测不到也不中断）
  if (isAborted()) return 'none';
  writePickDebug(doc, el, ['flow:open-done'], true, 'none');
  const inputEl = el as HTMLInputElement;
  // 巨能填式点选：选项可能异步渲染 → 轮询查找；点选后校验回填，未回填换下一候选/重新点开下拉再试
  const tried = new Set<Element>();
  for (let round = 0; round < 10; round++) {
    if (!docAlive(doc) || isAborted()) return 'none';
    if (round > 0 && round % 3 === 0) await tryOpenPicker(doc, el, trigger); // 下拉可能已收起：再点开
    await sleep(round === 0 ? 400 : 300);
    const cands = findPickerOptionCandidates(doc, value).filter((c) => !tried.has(c));
    if (!cands.length) {
      if (round === 1) writePickDebug(doc, el, ['flow:opt=none'], true, 'none');
      continue;
    }
    writePickDebug(doc, el, ['flow:opt=found'], true, 'none');
    for (const cand of cands.slice(0, 4)) {
      tried.add(cand);
      // el-select 选项选择依赖 mousedown/mouseup/click 三连（巨能填同款）
      try {
        const h = cand as HTMLElement;
        h.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        h.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        h.click();
      } catch {
        // 忽略
      }
      await sleep(450);
      const binding = resolveCodeNameBinding(doc, el, context);
      const committed = binding ? verifyCodeNameBinding(binding, value, context) : !!(inputEl.value || '').trim();
      if (committed) {
        writePickDebug(doc, el, ['opt-click'], false, 'picked');
        return 'picked';
      }
      writePickDebug(doc, el, ['opt-click-no-fill'], true, 'none');
      if (!docAlive(doc) || isAborted()) return 'none';
    }
  }
  if (isAborted()) return 'none';
  // 轮询未果：继续走"通用弹层搜索框 / 选择器窗口 / 树形"路径
  // 注意：不再走"通用弹层搜索框"分支——它会误把 Enter/查询点到无关弹窗或主页面按钮，
  // 触发整页回发重载（南理工学校弹窗循环的根因）。关键字+查询统一由 pickSelectorWindow 处理。
  writePickDebug(doc, el, ['flow:selector-window'], true, 'none');
  const finish = (result: 'picked' | 'opened' | 'none') => {
    writePickDebug(doc, el, [], false, result);
    return result;
  };
  // 地区类值（省/市/区多级）只走树形点选；表格行关键字路径对地区树无用（东华实测只浪费预算），失败直接留给下一轮/人工
  const regionLike = isRegionLike(value || '') || (value || '').split(/(?<=省|市|区|县|州|盟|旗|地区)/).filter((s) => s.trim().length >= 2).length >= 2;
  if (regionLike) {
    if ((await pickRegionTree(doc, el, value)) === 'picked') return finish('picked');
    return finish('opened');
  }
  // 代码/名称树弹层（东华 getZY/getSchool 等 layui treeSelectPage）：关键字搜索 + 点节点 + 确定
  const ctxTree = selectorContexts(doc)[0];
  if (ctxTree && ctxTree.scope.querySelector('a[class*="level"]') && !ctxTree.scope.querySelector('table')) {
    if ((await pickCodeTree(doc, el, value)) === 'picked') return finish('picked');
    return finish('opened');
  }
  if ((await pickSelectorWindow(doc, el, value, isAborted, context)) === 'picked') return finish('picked');
  if (isAborted()) return finish('opened');
  if ((await pickRegionTree(doc, el, value)) === 'picked') return finish('picked');
  return finish('opened');
}
