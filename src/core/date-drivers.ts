// 日期控件驱动：统一处理原生日期框、My97/Laydate、Ant/Element 等文本型日期组件。

export type DatePrecision = 'year' | 'month' | 'day';
export type DateDriverKind = 'native-date' | 'native-month' | 'my97' | 'layui' | 'ant' | 'element' | 'jquery' | 'bootstrap' | 'bhtc' | 'text';
export type DateValueFormat = 'yyyy' | 'yyyyMM' | 'yyyy-MM' | 'yyyy/MM' | 'yyyy年MM月' | 'yyyyMMdd' | 'yyyy-MM-dd' | 'yyyy/MM/dd' | 'yyyy年MM月dd日';

export interface DateFillResult {
  ok: boolean;
  written: string;
  driver: DateDriverKind;
  precision: DatePrecision;
  reason: string;
}

export interface DateDriverContract {
  precision?: DatePrecision;
  /** 显式字符串格式优先于控件推断，并要求回读值严格符合该格式。 */
  format?: DateValueFormat;
  /** 必须与可见日期共同回读的隐藏模型；仅在适配包明确声明时强制要求。 */
  hiddenValueSelectors?: string[];
  panelSelectors?: string[];
}

interface DateParts { year: string; month?: string; day?: string }

function parseDate(raw: string): DateParts | null {
  const m = /^\s*(\d{4})(?:[-/.年]?(\d{1,2}))?(?:[-/.月]?(\d{1,2}))?日?\s*$/.exec(raw);
  if (!m) return null;
  return { year: m[1], month: m[2]?.padStart(2, '0'), day: m[3]?.padStart(2, '0') };
}

function visible(el: Element): boolean {
  const h = el as HTMLElement;
  if (h.hidden || h.getAttribute('aria-hidden') === 'true') return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(h);
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  const rect = h.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0 || !!h.offsetParent;
}

function controlText(el: HTMLInputElement): string {
  const wrap = el.closest<HTMLElement>('.ant-picker,.el-date-editor,.layui-input-inline,.bhtc-input-group,[xtype="date-ym"],.form-item,.layui-form-item,.el-form-item,td,label,div');
  return `${el.type} ${el.className} ${el.id} ${el.name} ${el.placeholder} ${wrap?.className || ''} ${wrap?.getAttribute('xtype') || ''} ${wrap?.getAttribute('data-caption') || ''} ${wrap?.getAttribute('data-name') || ''} ${wrap?.textContent || ''}`.toLowerCase();
}

/** 功能：识别日期组件族，识别结果仅决定安全写入与关闭策略，不执行任何保存操作。 */
export function detectDateDriver(el: HTMLInputElement): DateDriverKind {
  const text = controlText(el);
  if (el.type === 'date') return 'native-date';
  if (el.type === 'month') return 'native-month';
  if (/wdate|my97|wdatepicker/.test(text) || /wdatepicker/i.test(el.getAttribute('onclick') || '')) return 'my97';
  if (/layui|laydate/.test(text) || el.hasAttribute('lay-key')) return 'layui';
  if (/ant-picker|ant-calendar/.test(text)) return 'ant';
  if (/el-date-editor|el-input__inner/.test(text) && /date|month|年月|日期/.test(text)) return 'element';
  if (/datepicker|hasdatepicker|ui-date/.test(text)) return 'jquery';
  if (/bhtc-input-group|date-ym/.test(text)) return 'bhtc';
  if (/datetimepicker|form_datetime/.test(text)) return 'bootstrap';
  return 'text';
}

export function inferDatePrecision(el: HTMLInputElement, raw: string): DatePrecision {
  const text = controlText(el);
  if (el.type === 'month' || /monthpicker|月份|年月|yyyy[-/.年]?mm(?![-/.月]?dd)/i.test(text)) return 'month';
  if (/年份|年度|yyyy(?![-/.]?mm)/i.test(text)) return 'year';
  const parsed = parseDate(raw);
  return parsed?.day ? 'day' : parsed?.month ? 'month' : 'year';
}

/** 功能：读取适配包或页面 WdatePicker 声明的 dateFmt，避免把 yyyyMM 误写成 YYYY-MM。 */
function declaredDateFormat(el: HTMLInputElement, contract?: DateDriverContract): DateValueFormat | undefined {
  const raw = contract?.format || el.getAttribute('data-tui-date-format') || (() => {
    const handlers = `${el.getAttribute('onclick') || ''} ${el.getAttribute('onfocus') || ''}`;
    return (/dateFmt\s*:\s*['"]([^'"]+)['"]/i.exec(handlers) || [])[1] || '';
  })();
  const supported = new Set<DateValueFormat>(['yyyy', 'yyyyMM', 'yyyy-MM', 'yyyy/MM', 'yyyy年MM月', 'yyyyMMdd', 'yyyy-MM-dd', 'yyyy/MM/dd', 'yyyy年MM月dd日']);
  return supported.has(raw as DateValueFormat) ? raw as DateValueFormat : undefined;
}

/** 功能：严格按目标页面声明格式生成日期字符串。 */
function formatDeclaredDate(parts: DateParts, format: DateValueFormat): string {
  const month = parts.month || '01';
  const day = parts.day || '01';
  const values: Record<DateValueFormat, string> = {
    yyyy: parts.year,
    yyyyMM: `${parts.year}${month}`,
    'yyyy-MM': `${parts.year}-${month}`,
    'yyyy/MM': `${parts.year}/${month}`,
    'yyyy年MM月': `${parts.year}年${month}月`,
    yyyyMMdd: `${parts.year}${month}${day}`,
    'yyyy-MM-dd': `${parts.year}-${month}-${day}`,
    'yyyy/MM/dd': `${parts.year}/${month}/${day}`,
    'yyyy年MM月dd日': `${parts.year}年${month}月${day}日`,
  };
  return values[format];
}

function formatDate(parts: DateParts, precision: DatePrecision, el: HTMLInputElement, driver: DateDriverKind, format?: DateValueFormat): string {
  if (format) return formatDeclaredDate(parts, format);
  if (precision === 'year') return parts.year;
  const month = parts.month || '01';
  if (driver === 'native-month') return `${parts.year}-${month}`;
  const text = controlText(el);
  const separator = text.includes('/') ? '/' : text.includes('.') ? '.' : '-';
  if (precision === 'month') {
    // 博思 BHTC 的 date-ym 模型回读格式固定为 YYYY-MM；“入学年月”只是标题，不能据此写成中文日期。
    if (driver === 'bhtc') return `${parts.year}-${month}`;
    if (/yyyy\s*年|年月/.test(text) && !/yyyy[-/.]mm/i.test(text)) return `${parts.year}年${month}月`;
    if (/yyyymm/.test(text) || (driver === 'my97' && /dhu|紧凑/.test(text))) return `${parts.year}${month}`;
    return `${parts.year}${separator}${month}`;
  }
  const day = parts.day || '01';
  if (driver === 'native-date') return `${parts.year}-${month}-${day}`;
  if (/yyyy\s*年|年月日/.test(text) && !/yyyy[-/.]mm/i.test(text)) return `${parts.year}年${month}月${day}日`;
  if (/yyyymmdd/.test(text)) return `${parts.year}${month}${day}`;
  return `${parts.year}${separator}${month}${separator}${day}`;
}

function setNativeValue(el: HTMLInputElement, value: string): void {
  const win = el.ownerDocument.defaultView;
  const proto = win?.HTMLInputElement?.prototype || HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  // React 会用 _valueTracker 判断值是否变化，清除旧快照后事件才能进入受控模型（INV-A1-c：清理不改回读结论）。
  const tracker = (el as HTMLInputElement & { _valueTracker?: { setValue(value: string): void } })._valueTracker;
  if (tracker) tracker.setValue('');
  // A1:事件派发收敛至 event-policy（tail=blur-focusout 与原四事件逐字面等价）。
  dispatchValueEvents(el, { tail: 'blur-focusout', aspPage: isAspLikePage(el.ownerDocument) });
}

function canonical(value: string, precision: DatePrecision): string {
  const p = parseDate(value);
  if (!p) return value.replace(/\D/g, '');
  if (precision === 'year') return p.year;
  if (precision === 'month') return `${p.year}${p.month || '01'}`;
  return `${p.year}${p.month || '01'}${p.day || '01'}`;
}

/** 功能：格式契约存在时同时验证日期含义和原始字符串形状，防止 202109 与 2021-09 被误判等价。 */
function dateValueMatches(value: string, written: string, precision: DatePrecision, format?: DateValueFormat): boolean {
  if (canonical(value, precision) !== canonical(written, precision)) return false;
  return !format || value.trim() === written;
}

function hasComponentError(el: HTMLInputElement): boolean {
  const wrap = el.closest('.ant-picker,.el-date-editor,.layui-form-item,.el-form-item,.form-item,td');
  return !!wrap && (
    wrap.matches('.ant-form-item-has-error,.has-error,.is-error,[aria-invalid="true"]') ||
    !!wrap.querySelector('.ant-form-item-has-error,.has-error,.is-error,[aria-invalid="true"],.field-validation-error')
  );
}

/** 功能：关闭残留日历面板；只发 Escape/失焦，不点击“今天”“确定”或清空按钮。 */
export function dismissDatePicker(el: HTMLInputElement): void {
  const doc = el.ownerDocument;
  const win = doc.defaultView;
  const KeyboardCtor = win?.KeyboardEvent || KeyboardEvent;
  el.dispatchEvent(new KeyboardCtor('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  el.dispatchEvent(new KeyboardCtor('keyup', { key: 'Escape', code: 'Escape', bubbles: true }));
  el.blur();
  const MouseCtor = win?.MouseEvent || MouseEvent;
  (doc.body || doc.documentElement).dispatchEvent(new MouseCtor('mousedown', { bubbles: true }));
}

/**
 * 功能：按组件要求写入日期，并立即验证可见值。
 * 原理：日期统一转为年/月/日三段，再根据 input 类型、placeholder 和组件族生成目标格式。
 */
export function fillDateControl(el: HTMLInputElement, raw: string, contract?: DateDriverContract): DateFillResult {
  const parts = parseDate(raw);
  if (!parts) return { ok: false, written: raw, driver: detectDateDriver(el), precision: 'day', reason: '档案日期格式无法识别' };
  const driver = detectDateDriver(el);
  const attrPrecision = el.getAttribute('data-tui-date-precision');
  const precision = contract?.precision || (attrPrecision === 'year' || attrPrecision === 'month' || attrPrecision === 'day' ? attrPrecision : inferDatePrecision(el, raw));
  const format = declaredDateFormat(el, contract);
  const written = formatDate(parts, precision, el, driver, format);
  setNativeValue(el, written);
  dismissDatePicker(el);
  const ok = dateValueMatches(el.value, written, precision, format) && !hasComponentError(el);
  if (ok) {
    // 某些控件在失焦后异步把日期重置为今天；二次校验失败时恢复档案值，并再次触发模型事件。
    setTimeout(() => {
      if (!el.ownerDocument.documentElement.contains(el)) return;
      if (!dateValueMatches(el.value, written, precision, format)) {
        setNativeValue(el, written);
        dismissDatePicker(el);
      }
    }, 350);
  }
  const formatNote = format ? `（${format}）` : '';
  return { ok, written, driver, precision, reason: ok ? `${driver} 日期${formatNote}的可见值和组件状态回读一致` : `${driver} 日期${formatNote}写入后格式、回读或组件状态不一致` };
}

function hiddenModels(el: HTMLInputElement, contract?: DateDriverContract): HTMLInputElement[] {
  const out: HTMLInputElement[] = [];
  for (const selector of contract?.hiddenValueSelectors || []) {
    try {
      const found = el.ownerDocument.querySelector(selector);
      if (found instanceof el.ownerDocument.defaultView!.HTMLInputElement && found.type === 'hidden') out.push(found);
    } catch {
      // 忽略无效声明。
    }
  }
  return Array.from(new Set(out));
}

function fullReadback(el: HTMLInputElement, written: string, precision: DatePrecision, contract?: DateDriverContract): { ok: boolean; reason: string } {
  const format = declaredDateFormat(el, contract);
  if (!dateValueMatches(el.value, written, precision, format)) return { ok: false, reason: format ? `可见日期未保持 ${format} 格式` : '可见日期回读不一致' };
  if (hasComponentError(el) || el.getAttribute('aria-invalid') === 'true') return { ok: false, reason: '日期组件仍处于校验错误状态' };
  for (const hidden of hiddenModels(el, contract)) {
    if (canonical(hidden.value, precision) !== canonical(written, precision)) return { ok: false, reason: `隐藏日期模型 ${hidden.name || hidden.id} 回读不一致` };
  }
  return { ok: true, reason: hiddenModels(el, contract).length ? '可见值、隐藏模型和校验状态均一致' : '可见值和校验状态一致' };
}

function pickerDocuments(doc: Document): Document[] {
  const docs = [doc];
  for (const frame of Array.from(doc.querySelectorAll<HTMLIFrameElement>('iframe'))) {
    if (!/date|calendar|my97|wdate/i.test(`${frame.name} ${frame.id} ${frame.src}`)) continue;
    try {
      if (frame.contentDocument?.body) docs.push(frame.contentDocument);
    } catch {
      // 跨域日期 iframe 无法操作，保留直接写入结果。
    }
  }
  return docs;
}

function pickerPanel(doc: Document, contract?: DateDriverContract): HTMLElement | null {
  const selectors = contract?.panelSelectors?.length ? contract.panelSelectors : [
    '.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)',
    '.ant-calendar:not([style*="display: none"])',
    '.el-picker-panel:not([style*="display: none"])',
    '.layui-laydate:not([style*="display: none"])',
    '.ui-datepicker:not([style*="display: none"])',
    '.bootstrap-datetimepicker-widget:not([style*="display: none"])',
    '.bhtc-datetimepicker-widget:not([style*="display: none"])',
    '.datepicker:not([style*="display: none"])',
  ];
  for (const pickerDoc of pickerDocuments(doc)) {
    for (const selector of selectors) {
      try {
        const panel = Array.from(pickerDoc.querySelectorAll<HTMLElement>(selector)).find(visible);
        if (panel) return panel;
      } catch {
        // 忽略无效选择器。
      }
    }
    if (pickerDoc !== doc && pickerDoc.body) return pickerDoc.body;
  }
  return null;
}

function panelHeaderMonth(panel: HTMLElement): { year: number; month: number } | null {
  const header = panel.querySelector<HTMLElement>('.ant-picker-header-view,.ant-calendar-month-select,.el-date-picker__header,.layui-laydate-header,.ui-datepicker-title,.datepicker-switch') || panel;
  const text = (header.textContent || '').replace(/\s+/g, ' ');
  const zh = /(20\d{2})\s*年?\s*(\d{1,2})\s*月?/.exec(text);
  if (zh) return { year: Number(zh[1]), month: Number(zh[2]) };
  const en = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d{2})/i.exec(text);
  if (en) return { year: Number(en[2]), month: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(en[1].slice(0, 3).toLowerCase()) + 1 };
  return null;
}

function panelButton(panel: HTMLElement, direction: 'prev' | 'next'): HTMLElement | null {
  const selectors = direction === 'prev'
    ? '.ant-picker-header-prev-btn,.ant-calendar-prev-month-btn,.el-picker-panel__icon-btn.arrow-left,.layui-laydate-prev-m,.ui-datepicker-prev,.prev'
    : '.ant-picker-header-next-btn,.ant-calendar-next-month-btn,.el-picker-panel__icon-btn.arrow-right,.layui-laydate-next-m,.ui-datepicker-next,.next';
  return Array.from(panel.querySelectorAll<HTMLElement>(selectors)).find(visible) || null;
}

function fireMouse(el: HTMLElement): void {
  const MouseCtor = el.ownerDocument.defaultView?.MouseEvent || MouseEvent;
  el.dispatchEvent(new MouseCtor('mousedown', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseCtor('mouseup', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseCtor('click', { bubbles: true, cancelable: true }));
}

/**
 * 功能：操作博思 BHTC 年月面板，依次切换到年份视图、选择年份、再选择月份。
 *
 * 原理说明：`date-ym` 初次展开仍显示“日”视图，直接搜索月份会点到隐藏节点。
 * 因此每一步只操作当前可见的 `.bhtc-datepicker-*` 子面板，并通过
 * `data-action=selectYear/selectMonth` 使用页面自身事件更新内部模型。
 */
async function operateBhtcMonthPanel(panel: HTMLElement, parts: DateParts, isCancelled?: () => boolean): Promise<boolean> {
  if (isCancelled?.() || !panel.isConnected) return false;
  const targetYear = Number(parts.year);
  const targetMonth = Number(parts.month || 1);
  const section = (selector: string): HTMLElement | null =>
    Array.from(panel.querySelectorAll<HTMLElement>(selector)).find(visible) || null;

  let monthSection = section('.bhtc-datepicker-months');
  if (!monthSection) {
    const daySection = section('.bhtc-datepicker-days');
    const switcher = daySection?.querySelector<HTMLElement>('.bhtc-picker-switch');
    if (!switcher) return false;
    fireMouse(switcher);
    await new Promise((resolve) => setTimeout(resolve, 80));
    if (isCancelled?.() || !panel.isConnected) return false;
    monthSection = section('.bhtc-datepicker-months');
  }
  if (!monthSection) return false;

  const yearSwitcher = monthSection.querySelector<HTMLElement>('.bhtc-picker-switch');
  if (!yearSwitcher) return false;
  fireMouse(yearSwitcher);
  await new Promise((resolve) => setTimeout(resolve, 80));
  if (isCancelled?.() || !panel.isConnected) return false;

  let yearSection = section('.bhtc-datepicker-years');
  if (!yearSection) return false;
  let yearChoice: HTMLElement | null = null;
  // 每次翻动一组年份；20 组足以覆盖合理的教育经历范围，同时避免失控点击。
  for (let attempt = 0; attempt < 20; attempt++) {
    const years = Array.from(yearSection.querySelectorAll<HTMLElement>('span.year[data-action="selectYear"]'))
      .filter((item) => visible(item) && !/disabled/.test(item.className));
    yearChoice = years.find((item) => Number((item.textContent || '').trim()) === targetYear) || null;
    if (yearChoice) break;
    const values = years.map((item) => Number((item.textContent || '').trim())).filter(Number.isFinite);
    if (!values.length) break;
    const direction = targetYear < Math.min(...values) ? 'previous' : 'next';
    const nav = yearSection.querySelector<HTMLElement>(`[data-action="${direction}"]`);
    if (!nav || !visible(nav)) break;
    fireMouse(nav);
    await new Promise((resolve) => setTimeout(resolve, 60));
    if (isCancelled?.() || !panel.isConnected) return false;
    yearSection = section('.bhtc-datepicker-years') || yearSection;
  }
  if (!yearChoice) return false;
  fireMouse(yearChoice);
  await new Promise((resolve) => setTimeout(resolve, 80));
  if (isCancelled?.() || !panel.isConnected) return false;

  monthSection = section('.bhtc-datepicker-months');
  if (!monthSection) return false;
  const monthChoice = Array.from(monthSection.querySelectorAll<HTMLElement>('span.month[data-action="selectMonth"]'))
    .find((item) => visible(item) && Number((item.textContent || '').replace(/\D/g, '')) === targetMonth && !/disabled/.test(item.className));
  if (!monthChoice) return false;
  fireMouse(monthChoice);
  await new Promise((resolve) => setTimeout(resolve, 100));
  return true;
}

async function operatePickerPanel(el: HTMLInputElement, parts: DateParts, precision: DatePrecision, contract?: DateDriverContract, isCancelled?: () => boolean): Promise<boolean> {
  if (isCancelled?.() || !el.isConnected) return false;
  fireMouse(el);
  await new Promise((resolve) => setTimeout(resolve, 180));
  if (isCancelled?.() || !el.isConnected) return false;
  let panel = pickerPanel(el.ownerDocument, contract);
  if (!panel) return false;
  if (detectDateDriver(el) === 'bhtc' && precision === 'month') {
    const picked = await operateBhtcMonthPanel(panel, parts, isCancelled);
    if (isCancelled?.() || !el.isConnected) return false;
    dismissDatePicker(el);
    return picked;
  }
  const targetYear = Number(parts.year);
  const targetMonth = Number(parts.month || 1);
  // 月面板可在有限范围内安全翻页；超出 120 个月时保留直接写入，避免大量点击。
  for (let i = 0; i < 120; i++) {
    const current = panelHeaderMonth(panel);
    if (!current) break;
    const delta = (targetYear - current.year) * 12 + targetMonth - current.month;
    if (delta === 0) break;
    const button = panelButton(panel, delta < 0 ? 'prev' : 'next');
    if (!button) break;
    fireMouse(button);
    await new Promise((resolve) => setTimeout(resolve, 35));
    if (isCancelled?.() || !el.isConnected) return false;
    panel = pickerPanel(el.ownerDocument, contract) || panel;
  }
  if (precision === 'year') {
    const year = Array.from(panel.querySelectorAll<HTMLElement>('td,button,span,div')).find((item) => visible(item) && item.textContent?.trim() === parts.year && !/disabled/.test(item.className));
    if (year) fireMouse(year);
  } else if (precision === 'month') {
    const candidates = [`${targetMonth}月`, String(targetMonth), String(targetMonth).padStart(2, '0')];
    const month = Array.from(panel.querySelectorAll<HTMLElement>('td,button,span,div')).find((item) => visible(item) && candidates.includes(item.textContent?.trim() || '') && !/disabled/.test(item.className));
    if (month) fireMouse(month);
  } else {
    const dayText = String(Number(parts.day || 1));
    const days = Array.from(panel.querySelectorAll<HTMLElement>('td,button,span,div')).filter((item) => {
      const cls = item.className || '';
      return visible(item) && item.textContent?.trim() === dayText && !/disabled|prev-month|next-month|other-month|outside/.test(cls);
    });
    if (days[0]) fireMouse(days[0]);
  }
  await new Promise((resolve) => setTimeout(resolve, 120));
  if (isCancelled?.() || !el.isConnected) return false;
  const ok = Array.from(panel.querySelectorAll<HTMLElement>('button,a,span')).find((item) => visible(item) && /^(确定|确认|完成|OK)$/i.test(item.textContent?.trim() || ''));
  if (ok) fireMouse(ok);
  dismissDatePicker(el);
  return true;
}

/**
 * 功能：执行日期直接写入、真实面板交互和最终完整回读。
 * 只有直接写入未持久化时才操作面板，避免无意义地打开日历。
 */
export async function fillDateControlAsync(el: HTMLInputElement, raw: string, contract?: DateDriverContract, isCancelled?: () => boolean): Promise<DateFillResult> {
  const cancelled = () => !!isCancelled?.() || !el.isConnected;
  const stopped = (): DateFillResult => ({ ok: false, written: '', driver: 'text', precision: contract?.precision || 'day', reason: '原轮或日期目标已失效，停止日期操作' });
  if (cancelled()) return stopped();
  const direct = fillDateControl(el, raw, contract);
  const precision = contract?.precision || direct.precision;
  await new Promise((resolve) => setTimeout(resolve, 420));
  if (cancelled()) return stopped();
  let check = fullReadback(el, direct.written, precision, contract);
  if (!check.ok) {
    const parts = parseDate(raw);
    if (parts) await operatePickerPanel(el, parts, precision, contract, cancelled);
    if (cancelled()) return stopped();
    // 面板点击可能只更新组件模型，再统一补写可见输入并触发标准事件。
    if (!dateValueMatches(el.value, direct.written, precision, declaredDateFormat(el, contract))) setNativeValue(el, direct.written);
    await new Promise((resolve) => setTimeout(resolve, 260));
    if (cancelled()) return stopped();
    check = fullReadback(el, direct.written, precision, contract);
  }
  return { ...direct, ok: check.ok, precision, reason: `${direct.driver}：${check.reason}` };
}
import { dispatchValueEvents, isAspLikePage } from './event-policy';
