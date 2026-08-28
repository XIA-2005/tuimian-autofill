// 安全填充器：兼容 React/Vue 受控组件（原生 setter + 事件派发），支持文本框/下拉/单选/文本域，
// 日期值按输入框 placeholder 提示的格式自适应，长文本域由结构化列表合成。

import { DetectedField, detectAllFields, detectField, FIELD_RULES, FieldRule, findPickerTrigger, isVisible, normalizeText } from './matcher';
import { isRegionLike, regionCode6, regionFromIdCard, regionKeywords, regionMatchTokens, regionTreeTokens } from './regionutil';
import { composeListText, Experience, FamilyMember, getByPath, Profile, Application } from './profile';
import { matchAdapter } from './adapters';
import { fillDateControl } from './date-drivers';
import { PopupPickContext, resolveCodeNameBinding, verifyCodeNameBinding } from './popup-binding';
import { pickSchool } from './school-picker-driver';
import { pickMajor } from './major-picker-driver';
import { pickComponentOption } from './component-select-drivers';
import { withUnlocked } from './unlock';
import { mainWorldJqueryClick } from './world-bridge';

export interface FillItem {
  label: string;
  field: string | null;
  status: 'filled' | 'profileEmpty' | 'noMatch' | 'failed' | 'skipped' | 'picker';
  reason?: string;
  valuePreview?: string;
  /** 对应页面控件（仅内存使用，跨消息传递时会被剥离） */
  el?: Element;
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
}

export interface FillResult {
  stats: FillStats;
  items: FillItem[];
}

/** 常见编码值 → 显示文本 的别名映射（用于下拉框/单选） */
const VALUE_ALIASES: Record<string, string[]> = {
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

function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  // 写前临时解锁：readonly/disabled 控件的值页面校验器与表单序列化会忽略，造成"回读通过、保存丢失"
  withUnlocked(el, () => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    // 部分系统在失焦时校验/同步内部状态，补发 blur/focusout
    el.dispatchEvent(new Event('blur', { bubbles: false }));
    el.dispatchEvent(new Event('focusout', { bubbles: true }));
  });
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
  // 禁用下拉的选中值会被表单序列化忽略；写前临时启用，写后恢复
  withUnlocked(el, () => {
    const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    if (desc && desc.set) desc.set.call(el, el.options[index].value);
    else el.selectedIndex = index;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
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

function setRadioGroup(el: HTMLInputElement, value: string): boolean {
  const name = el.getAttribute('name') || el.id;
  if (!name) return false;
  const doc = el.ownerDocument || document;
  const group = Array.from(doc.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${escapeAttr(name)}"]`));
  if (!group.length) return false;
  const want = normalizeText(value);
  const candidates = VALUE_ALIASES[want] || [value];
  for (const r of group) {
    const rl = normalizeText(radioLabel(r));
    if (!rl) continue;
    if (candidates.some((c) => rl.includes(normalizeText(c)))) {
      if (!r.checked) {
        r.checked = true;
        r.click();
        r.dispatchEvent(new Event('change', { bubbles: true }));
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
    setInputValue(el as HTMLTextAreaElement, String(value));
    return true;
  }
  const input = el as HTMLInputElement;
  switch (input.type) {
    case 'radio':
      return setRadioGroup(input, String(value));
    case 'checkbox':
      // 复选框语义复杂（如"是否服从调剂"、多选获奖类别），一律留人工确认
      return false;
    default:
      setInputValue(input, formatDateForInput(String(value), input));
      return true;
  }
}

export function markEl(el: Element, kind: 'filled' | 'missing' | 'empty'): void {
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

/** 判断控件是否有"弹窗选择"行为：带"选择"触发按钮的输入框一律走弹窗（真实值常是隐藏编码/弹窗点选结果，直接注入文本会写坏代码列导致数据库截断） */
function hasPopupBehavior(d: DetectedField): boolean {
  const el = d.el;
  if (el.tagName !== 'INPUT') return false;
  const input = el as HTMLInputElement;
  const isChoice = ['radio', 'checkbox'].includes(input.type);
  if (isChoice) return false;
  if (input.type === 'hidden') return !!d.pickerTrigger;
  if (d.pickerTrigger) return true;
  if (input.readOnly || input.disabled) return true;
  return false;
}

export function fillAll(profile: Profile, doc: Document, rules: FieldRule[] = FIELD_RULES): FillResult {
  clearHighlights(doc);
  // 先处理"家庭成员表格"与"外语/计算机水平表格"（列头定义含义的裸表格），其单元格不再参与常规匹配
  const handled = new Set<Element>();
  const preItems: FillItem[] = [];
  const preStats = { filled: 0, profileEmpty: 0 };
  fillFamilyTables(profile, doc, handled, preItems, preStats);
  fillCetTables(profile, doc, handled, preItems, preStats);
  fillExperienceTables(profile, doc, handled, preItems, preStats);
  fillAwardTables(profile, doc, handled, preItems, preStats);

  const detected = detectAllFields(doc, rules).filter((d) => !handled.has(d.el));
  const items: FillItem[] = [...preItems];
  const stats: FillStats = { total: detected.length + preItems.length, filled: preStats.filled, skipped: 0, noMatch: 0, profileEmpty: preStats.profileEmpty, failed: 0, picker: 0 };

  for (const d of detected) {
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
      items.push({ label: d.label, field: null, status: 'noMatch', el: d.el });
      markEl(d.el, 'missing');
      continue;
    }
    if (d.rule.manual) {
      // 人工长文类（个人陈述/自述/研究计划等）：无档案数据，标记跳过并提示人工撰写
      stats.skipped++;
      items.push({ label: d.label, field: d.rule.field, status: 'skipped', reason: d.rule.manual, el: d.el });
      markEl(d.el, 'missing');
      continue;
    }
    let value: unknown;
    if (d.rule.derive) value = deriveValue(profile, d.rule.derive, doc);
    else if (d.rule.compose) value = composeListText(profile, d.rule.compose);
    else value = getByPath(profile, d.rule.field);
    // 地区字段空时：用身份证前 6 位区划码推导出生地/籍贯/户口地（成熟填表软件同款；仅兜底，不覆盖已填值）
    if ((value === undefined || value === null || String(value).trim() === '') && /^basic\.(birthPlace|hometown|hukou)$/.test(d.rule.field || '')) {
      const fromId = regionFromIdCard(profile);
      if (fromId) value = fromId;
    }
    if (value === undefined || value === null || String(value).trim() === '') {
      stats.profileEmpty++;
      items.push({ label: d.label, field: d.rule.field, status: 'profileEmpty', el: d.el });
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
    // 长字段保守截断：部分学校数据库列长较小，超长会报"将截断字符串或二进制数据"
    const cap = FIELD_LENGTH_CAPS[d.rule.field];
    if (cap && v.length > cap) v = v.slice(0, cap);
    // 弹窗选择框（只读/禁用/隐藏输入框 + 选择按钮、Show 显示框）：不直接注入文本（真实值往往是隐藏编码），交给自动点选处理。
    // 日期类字段除外：值本质就是文本（年月格式），直接注入并同步页面状态。
    const input = d.el as HTMLInputElement;
    const isDateLike =
      d.rule.field === 'basic.birthday' ||
      /(?:^|\.)(?:startDate|endDate|date|birthday)$/i.test(d.rule.field || '') ||
      (d.el.tagName === 'INPUT' && ['date', 'month'].includes((d.el as HTMLInputElement).type));
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
      items.push({
        label: d.label,
        field: d.rule.field,
        status: 'picker',
        reason: '弹窗选择框：将按当前字段精确匹配代码和名称',
        valuePreview: v,
        el: d.el,
        pickerContext: {
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
        },
      });
      markEl(d.el, 'missing');
      continue;
    }
    const dateOutcome = isDateLike && d.el.tagName === 'INPUT' ? fillDateControl(d.el as HTMLInputElement, v) : null;
    const ok = dateOutcome ? dateOutcome.ok : fillControl(d, v);
    if (ok) {
      stats.filled++;
      items.push({ label: d.label, field: d.rule.field, status: 'filled', reason: dateOutcome?.reason, valuePreview: dateOutcome?.written || v, el: d.el });
      markEl(d.el, 'filled');
    } else {
      stats.failed++;
      const reason =
        dateOutcome
          ? dateOutcome.reason
          : d.el.tagName === 'SELECT' && (d.el as HTMLSelectElement).options.length <= 1
          ? '下拉暂无选项（可能是联动下拉，请先选择上级字段后重试）'
          : '下拉/单选选项不匹配，请人工选择';
      items.push({ label: d.label, field: d.rule.field, status: 'failed', reason, valuePreview: v, el: d.el });
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
          // 档案关键内容快照（诊断"为什么没填"用：报告里可见家庭成员/奖项/经历清单）
          profileLists: {
            name: profile.basic.name || '',
            university: profile.education.university || '',
            major: profile.education.major || '',
            familyMembers: profile.familyMembers.map((m) => m.name).filter(Boolean),
            awards: profile.awards.map((a) => (a.content && a.content.trim() ? `${a.content.trim()}${a.date ? '（' + a.date + '）' : ''}` : '')).filter(Boolean),
            experiences: profile.experiences.map((e) => e.org).filter(Boolean),
            research: profile.research.map((r) => r.title).filter(Boolean),
          },
          items: items
            .map((i) => ({ label: i.label, field: i.field, status: i.status, value: String(i.valuePreview || '').slice(0, 30), reason: i.reason || '' }))
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

/** 表格末列的图标型"新增"按钮（EasyUI 无文字 linkbutton，如 icon-search） */
function findTableActionLink(table: HTMLElement): HTMLElement | null {
  const rows = Array.from(table.querySelectorAll('tr'));
  for (const row of rows) {
    const cells = Array.from(row.cells);
    if (!cells.length) continue;
    const last = cells[cells.length - 1];
    const cands = Array.from(last.querySelectorAll<HTMLElement>('a, button, span, i')).filter((c) => {
      const cls = (c.getAttribute('class') || '').toLowerCase();
      if (/delete|remove|del|close/.test(cls)) return false;
      const t = (c.textContent || '').trim();
      if (/×|删除|移除|清空/.test(t)) return false;
      if (c.tagName === 'SPAN' || c.tagName === 'I') return /icon|btn|add/.test(cls);
      return true;
    });
    if (cands.length) return cands[0];
  }
  return null;
}

/** 找页面的「保存」按钮（南理工式：保存后服务器才多出一行；排除"提交"类） */
function findSaveButton(table: HTMLElement): HTMLElement | null {
  const search = (scope: HTMLElement | null): HTMLElement | null => {
    if (!scope) return null;
    const cands = Array.from(scope.querySelectorAll<HTMLElement>('a, button, input[type="submit"], input[type="button"], span'));
    for (const c of cands) {
      if (!isVisible(c)) continue;
      if (c.closest(OWN_UI_SEL)) continue; // 扩展自身 UI 不是页面按钮
      const label = normalizeText(c.textContent || c.getAttribute('value') || '');
      if (!/^保存$|^保存草稿$|^暂存$/.test(label)) continue;
      const t = c.closest('table');
      if (t && t !== table) continue; // 不点其他表格里的保存
      return c;
    }
    return null;
  };
  return search(table.parentElement) || search(document.body);
}

/** 页面文档是否仍为当前活动文档（整页回发后旧文档会被替换，继续操作它是徒劳甚至误伤新页面） */
function docAlive(doc: Document): boolean {
  try {
    const w = doc.defaultView;
    return !!w && w.document === doc;
  } catch {
    return false;
  }
}

const pbWired = new WeakSet<Document>();

/** 监听页面卸载：整页回发/跳转时落盘时间戳，供旧文档里的循环及时刹车，避免对回发中的页面连点 */
function wirePostbackSignal(doc: Document): void {
  if (pbWired.has(doc)) return;
  pbWired.add(doc);
  try {
    const w = doc.defaultView as Window | null;
    w?.addEventListener('pagehide', () => {
      try {
        w.sessionStorage.setItem('tui-pb-fired', JSON.stringify({ at: Date.now() }));
      } catch {
        // 忽略
      }
    });
  } catch {
    // 忽略
  }
}

/** 最近（默认 8 秒内）是否发生过整页回发/跳转 */
function postbackJustFired(doc: Document, within = 8000): boolean {
  try {
    const raw = (doc.defaultView as Window | null)?.sessionStorage.getItem('tui-pb-fired');
    if (!raw) return false;
    const at = Number(JSON.parse(raw).at) || 0;
    return Date.now() - at < within;
  } catch {
    return false;
  }
}

/** 解析 javascript:DoPostback(...) 链接的前两个参数（事件目标 / 事件参数） */
function parsePostbackArgs(href: string): { target: string; arg: string } | null {
  const m = /^javascript:\s*[A-Za-z_$][\w$]*\s*\(\s*(['"])(.*?)\1\s*,\s*(['"])(.*?)\3/i.exec(href);
  if (!m) return null;
  return { target: m[2] || '', arg: m[4] || '' };
}

/** 标准 ASP.NET 整页回发：设置 __EVENTTARGET/__EVENTARGUMENT 后提交表单（与页面自带 __doPostBack 完全等价） */
function fireStandardPostback(doc: Document, anchor: HTMLElement, target: string, arg: string): boolean {
  const form = anchor.closest('form') as HTMLFormElement | null;
  if (!form) return false;
  const setHidden = (name: string, value: string) => {
    let el = form.querySelector(`input[name="${name}"]`) as HTMLInputElement | null;
    if (!el) {
      el = doc.createElement('input');
      el.type = 'hidden';
      el.name = name;
      form.appendChild(el);
    }
    el.value = value;
  };
  setHidden('__EVENTTARGET', target);
  setHidden('__EVENTARGUMENT', arg);
  // 兼容自定义回发包装：部分站点用 eventTarget/eventArgument 自定义隐藏域替代标准域
  setHidden('eventTarget', target);
  setHidden('eventArgument', arg);
  form.submit();
  return true;
}

/** 按钮是否为 javascript:DoPostback 型（服务器回发保存，如北邮行内「添加」）；纯客户端加行按钮不算 */
function isDoPostbackAction(c: HTMLElement): boolean {
  const href = (c.getAttribute('href') || '').trim();
  return /^javascript:/i.test(href) && /dopostback|__doPostBack/i.test(href);
}

/**
 * 是否是语义明确的“新增空行”动作。仅有“添加/保存”的行内按钮可能会把当前行落库，
 * 在安全模式下不能把它误当作新增空行。
 */
function isExplicitAddRowAction(c: HTMLElement): boolean {
  const label = normalizeText(`${c.textContent || ''} ${c.getAttribute('value') || ''} ${c.getAttribute('title') || ''}`);
  const identity = `${c.id || ''} ${c.getAttribute('name') || ''}`;
  return /新增一行|添加一行|增加一行|插入一行|再添一行/.test(label) || /addnewrow|addrow|addline/i.test(identity);
}

/** 调用 beforeAdd 并取得本轮点击序号（点击方式按序号轮换：0 标准回发 / 1 主世界 location 求值 / 2 原生点击） */
function clickAttempt(beforeAdd: ((i: number) => void | number) | undefined, i: number, fallback: number): number {
  const r = beforeAdd ? beforeAdd(i) : undefined;
  return typeof r === 'number' ? r : fallback;
}

/**
 * 点击"添加/保存"类动作。javascript:DoPostback 链接按点击序号轮换三种方式：
 * 0 = 标准整页回发（等价 __doPostBack，北邮等自定义 WebForm_DoPostback 包装的页面最可靠）；
 * 1 = 主世界 location 求值执行原 href（void 包裹不导航，CSP 拦不住 location 求值）；
 * 2 = 原生 click。每轮先落盘主世界函数形态探测，失败时下轮自动换方式重试。
 */
export async function clickPageAction(c: HTMLElement, attempt = 0): Promise<void> {
  const doc = c.ownerDocument || document;
  if (!docAlive(doc)) return; // 页面已整页刷新：旧文档不再有效，交给断点续填接管
  wirePostbackSignal(doc);
  const href = (c.getAttribute('href') || '').trim();
  if (/^javascript:/i.test(href) && /dopostback|__doPostBack/i.test(href)) {
    const args = parsePostbackArgs(href);
    const target = args?.target || '';
    const strategy = attempt % 3;
    // 诊断：注入 <script> 会被 CSP 拦截，改用 location 求值写回主世界函数形态（javascript: URL 与页面自身链接同等待遇）
    try {
      const w = doc.defaultView as Window | null;
      if (w) {
        w.location.href = `javascript:void(document.documentElement.setAttribute('data-tui-wfp',(function(){try{return typeof window.WebForm_DoPostback==='function'?String(window.WebForm_DoPostback).slice(0,300):(typeof window.WebForm_DoPostBack==='function'?'STD-CAP-B-ONLY':'MISSING')}catch(e){return 'ERR:'+e.message}})()))`;
        await sleep(120);
      }
    } catch {
      // 忽略
    }
    const probe = doc.documentElement.getAttribute('data-tui-wfp') || 'NO-ATTR';
    // fired：本轮实际采用的触发方式（std=标准整页回发 / void=主世界 location 求值 / click=原生点击）
    const fired = strategy === 0 ? 'std' : strategy === 1 ? 'void' : 'click';
    try {
      const store = (doc.defaultView as Window | null)?.sessionStorage;
      if (store) {
        const arr = (() => {
          try {
            return JSON.parse(store.getItem('tui-wfp-probe') || '[]') as unknown[];
          } catch {
            return [] as unknown[];
          }
        })();
        arr.push({ at: Date.now(), strategy, target: target.slice(0, 70), probe: probe.slice(0, 320), fired });
        store.setItem('tui-wfp-probe', JSON.stringify(arr.slice(-12)));
      }
    } catch {
      // 忽略
    }
    if (strategy === 0) {
      if (fireStandardPostback(doc, c, target, args?.arg || '')) return; // 整页回发：页面即将刷新，断点续填接管
    } else if (strategy === 1) {
      // 主世界执行回发：location 求值（void 包裹保证不导航）；javascript: 导航不受 CSP 限制
      try {
        const w = doc.defaultView as Window | null;
        if (w) {
          w.location.href = `javascript:void(${href.replace(/^javascript:/i, '')})`;
          return;
        }
      } catch {
        // 忽略，回退原生点击
      }
    }
    try {
      c.click();
    } catch {
      // 忽略
    }
    return;
  }
  // 非 DoPostback 控件按轮次选择一种点击策略。不能在同一轮连续执行原生 click 和
  // jQuery trigger，否则两个策略都生效时会一次新增两行。
  const elInfo = {
    tag: c.tagName.toLowerCase(),
    id: c.getAttribute('id') || '',
    cls: (c.getAttribute('class') || '').slice(0, 40),
    text: (c.textContent || (c as HTMLInputElement).value || '').replace(/\s+/g, ' ').trim().slice(0, 20),
    disabled: !!(c as HTMLButtonElement).disabled || c.getAttribute('aria-disabled') === 'true',
    hasOnclick: typeof ((c as HTMLElement & { onclick?: unknown }).onclick) === 'function',
  };
  if (elInfo.disabled) {
    logClickDebug(doc, { ...elInfo, fired: 'blocked-disabled' });
    return;
  }
  const w2 = doc.defaultView as Window | null;
  const strategy = attempt % 3;
  const fireEv = (type: string): void => {
    try {
      const ev = new MouseEvent(type, { bubbles: true, cancelable: true, view: w2 || undefined });
      c.dispatchEvent(ev);
    } catch {
      // 忽略
    }
  };
  try {
    c.scrollIntoView({ block: 'center', inline: 'nearest' });
  } catch {
    // 忽略
  }
  let fired = strategy === 0 ? 'native-sequence' : strategy === 1 ? 'jquery-click' : 'dispatch-click';
  try {
    if (strategy === 0) {
      // 模拟一次完整的用户点击序列；最终只触发一次 click，不再叠加 jQuery trigger。
      fireEv('pointerdown');
      fireEv('mousedown');
      try {
        c.focus();
      } catch {
        // 忽略
      }
      fireEv('pointerup');
      fireEv('mouseup');
      c.click();
    } else if (strategy === 1 && w2) {
      // 主世界 jQuery 触发兜底：优先走主世界桥（DOM 属性通道，无导航副作用）；桥不可用时退回 location 求值。
      const bridged = await mainWorldJqueryClick(doc, c);
      if (!bridged) {
        const sel = JSON.stringify(cssPathOf(c));
        w2.location.href = `javascript:void((function(){try{var j=window.jQuery;if(j&&j.fn){var el=document.querySelector(${sel});if(el&&!el.disabled){j(el).trigger('click');}}}catch(e){}})())`;
      }
    } else {
      fireEv('click');
    }
  } catch {
    fired += '-error';
  }
  logClickDebug(doc, { ...elInfo, fired });
}

/** 点击调试：记录被点元素签名与触发策略，供"点了没反应"类问题定位 */
function logClickDebug(doc: Document, entry: Record<string, unknown>): void {
  try {
    const store = (doc.defaultView as Window | null)?.sessionStorage;
    if (!store) return;
    const arr = (() => {
      try {
        return JSON.parse(store.getItem('tui-click-debug') || '[]') as unknown[];
      } catch {
        return [] as unknown[];
      }
    })();
    arr.push({ at: Date.now(), ...entry });
    store.setItem('tui-click-debug', JSON.stringify(arr.slice(-20)));
  } catch {
    // 忽略
  }
}

/** 元素 CSS 路径（供主世界脚本重新定位元素） */
function cssPathOf(el: HTMLElement): string {
  if (el.id) return `#${el.id}`;
  const parts: string[] = [];
  let cur: HTMLElement | null = el;
  while (cur && cur !== (cur.ownerDocument?.documentElement || null) && parts.length < 6) {
    let part = cur.tagName.toLowerCase();
    if (cur.className && typeof cur.className === 'string') {
      const cls = cur.className.trim().split(/\s+/).slice(0, 2).join('.');
      if (cls) part += `.${cls}`;
    }
    const parent: HTMLElement | null = cur.parentElement;
    if (parent) {
      const idx = Array.from(parent.children).indexOf(cur);
      if (idx >= 0) part += `:nth-child(${idx + 1})`;
    }
    parts.unshift(part);
    cur = parent;
  }
  return parts.join(' > ');
}

/**
 * 点击加行/保存后等待行数增长：短轮询（东华等客户端 JS 加行即时生效，行一出现就继续，不再固定等 2.5 秒）；
 * 页面整页回发（doc 失效）→ 返回 false 交给断点续填；上限内未增长 → 返回 false（外层停止连点）。
 */
async function waitForRowGrowth(
  doc: Document,
  findTable: (d: Document) => { table: HTMLTableElement } | null,
  rowsBefore: number,
  capMs = 3000,
): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < capMs) {
    await sleep(120);
    if (!docAlive(doc)) return false; // 整页回发已刷新：断点续填接管
    const info = findTable(doc);
    if (!info) return false;
    if (validDataRows(info.table).length > rowsBefore) return true;
  }
  return false;
}

/** 同一页、同一按钮的有效点击策略短期记忆；不跨 Document/iframe，不保存档案内容。 */
const addRowStrategyCache = new WeakMap<Document, Map<string, number>>();

function addRowButtonKey(btn: HTMLElement): string {
  const text = normalizeText(`${btn.textContent || ''} ${btn.getAttribute('value') || ''}`).slice(0, 30);
  const table = btn.closest('table');
  const header = table?.rows[0] ? Array.from(table.rows[0].cells).map((cell) => normalizeText(cell.textContent || '')).join('|').slice(0, 80) : '';
  return `${btn.tagName}|${btn.id}|${btn.getAttribute('name') || ''}|${(btn.className || '').toString().slice(0, 50)}|${text}|${header}`;
}

/**
 * 加行点击 + 行数验证：单次点击（点击策略按全局点击序号轮换、跨轮升级）→ 短轮询等待行数增长。
 * 不在同一轮连点多种策略：服务器加行可能延迟数秒，未验证就连点会造成一次尝试多行。
 * 同一页同一按钮一旦成功，后续优先复用成功策略；页面重建后 WeakMap 自动失效。
 */
export async function clickAddRowVerified(
  doc: Document,
  btn: HTMLElement,
  findTable: (d: Document) => { table: HTMLTableElement } | null,
  rowsBefore: number,
  beforeAdd?: (i: number) => void | number,
  entryIndex = 0,
  fallbackStrategy = 0,
): Promise<boolean> {
  if (!docAlive(doc)) return false;
  const key = addRowButtonKey(btn);
  const cache = addRowStrategyCache.get(doc) || new Map<string, number>();
  addRowStrategyCache.set(doc, cache);
  const remembered = cache.get(key);
  const callbackStrategy = beforeAdd?.(entryIndex);
  const strategy = remembered ?? (typeof callbackStrategy === 'number' ? callbackStrategy : fallbackStrategy);
  await clickPageAction(btn, strategy);
  const grown = await waitForRowGrowth(doc, findTable, rowsBefore);
  if (grown) {
    cache.set(key, strategy);
    return true;
  }
  if (remembered !== undefined) cache.delete(key);
  return false;
}

/** “已达最大行数”类系统弹窗/提示文案（巨能填 known_table_row_limits 同款关键词族） */
const ROW_LIMIT_TEXT =
  /(?:超过|超出|达到|已达)(?:系统)?(?:最大|限定)?(?:记录数|行数|条数)|(?:记录数|行数|条数)(?:已)?(?:达|到)(?:了)?(?:最大|上限)|不能超过\s*\d+|最多(?:只能)?(?:添加|填写|录入)?\s*\d+\s*(?:条|行|项)/;
const ROW_LIMIT_DIALOG_SEL =
  '.layui-layer, .ui-dialog, .artdialog, [role="dialog"], [class*="dialog" i], [class*="modal" i], [class*="popup" i], [class*="alert" i], [class*="toast" i]';

/**
 * 功能：检测“已达最大行数”类阻断（系统弹窗可见文案）。命中返回脱敏原因文本，未命中返回 null。
 * 巨能填在行数不增长时先查此类弹窗再决定是否重试；我们也据此停止连点并如实告知用户。
 */
export function detectRowLimitBlocked(doc: Document): string | null {
  try {
    for (const el of Array.from(doc.querySelectorAll<HTMLElement>(ROW_LIMIT_DIALOG_SEL))) {
      if (!isVisible(el)) continue;
      const t = normalizeText(el.textContent || '');
      if (!t || t.length > 200) continue;
      if (ROW_LIMIT_TEXT.test(t)) return `系统提示行数上限：${t.slice(0, 80)}`;
    }
  } catch {
    // 忽略
  }
  return null;
}

/** 动态表逐条决策诊断：每条记录的填写/跳过/停止决策落盘（不含档案内容），字段报告可直接定位停在哪一条。 */
export function logRowDecision(doc: Document, entry: Record<string, unknown>): void {
  try {
    const store = (doc.defaultView as Window | null)?.sessionStorage;
    if (!store) return;
    const arr = (() => {
      try {
        return JSON.parse(store.getItem('tui-row-decision') || '[]') as unknown[];
      } catch {
        return [] as unknown[];
      }
    })();
    arr.push({ at: Date.now(), ...entry });
    store.setItem('tui-row-decision', JSON.stringify(arr.slice(-30)));
  } catch {
    // 忽略
  }
}

// ===================== 弹窗式加行：误开检测与差量填写 =====================
// 巨能填厦大协议同款安全规则：点击"新增"后若打开的是"修改/编辑"弹窗，绝不能在里面填写——
// 那会把已有行覆盖掉。只承认明确的新增证据（标题/iframe 地址/隐藏操作字段），可疑一律中止并关闭。

export interface OpenDialogInfo {
  root: HTMLElement;
  /** 弹窗内嵌 iframe 的文档（iframe 式弹窗） */
  innerDoc: Document | null;
  kind: 'add' | 'edit' | 'unknown';
  confirmBtn: HTMLElement | null;
}

const DIALOG_ROOT_SEL =
  '.layui-layer, .bh-dialog, [role="dialog"], .emap-dialog, .jqx-window, .modal, .bh-modal, [class*="dialog" i], [class*="modal" i], [class*="window" i], [class*="layer" i]';

/** 功能：收集当前可见的弹窗根节点（供点击前后对比，归责"这次点击打开了哪个弹窗"）。只保留最外层容器。 */
export function visibleDialogRoots(doc: Document): HTMLElement[] {
  try {
    return Array.from(doc.querySelectorAll<HTMLElement>(DIALOG_ROOT_SEL)).filter((root) => {
      if (!isVisible(root)) return false;
      // close 图标等内层元素同 class 命中时不算弹窗：只有外层容器参与归责
      return !root.parentElement?.closest(DIALOG_ROOT_SEL);
    });
  } catch {
    return [];
  }
}

function sameRootSet(a: HTMLElement[], b: HTMLElement[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((root) => set.has(root));
}

function dialogInnerText(scope: HTMLElement | Document): string {
  const root = scope instanceof Document ? (scope.body || scope.documentElement) : scope;
  return normalizeText(root?.textContent || '');
}

/** 功能：把点击后新出现的弹窗分类为 新增/编辑/未知。编辑证据：标题"修改/编辑"、iframe 地址含 change/edit、隐藏 act 字段为 edit。 */
function classifyDialog(root: HTMLElement): OpenDialogInfo {
  let innerDoc: Document | null = null;
  const frame = root.querySelector('iframe');
  if (frame) {
    try {
      innerDoc = frame.contentDocument || null;
    } catch {
      innerDoc = null; // 跨域弹窗：只能靠外层证据判断
    }
  }
  let kind: OpenDialogInfo['kind'] = 'unknown';
  const src = (frame?.getAttribute('src') || '').toLowerCase();
  if (/change|edit|modify|update/.test(src)) kind = 'edit';
  else if (/add|create|append|new/.test(src)) kind = 'add';
  if (kind === 'unknown' && innerDoc) {
    const ops = Array.from(innerDoc.querySelectorAll<HTMLInputElement>('input[type="hidden"]')).filter((el) =>
      /^(act|op|action|mode|oper|type|do)$/i.test(`${el.name} ${el.id}`),
    );
    if (ops.some((el) => /edit|change|update|modify/i.test(el.value))) kind = 'edit';
    else if (ops.some((el) => /add|insert|new|create/i.test(el.value))) kind = 'add';
  }
  if (kind === 'unknown') {
    const title = normalizeText(root.querySelector('.layui-layer-title,.modal-title,[class*="title" i],h1,h2,h3')?.textContent || '');
    if (/修改|编辑|变更|更改/.test(title)) kind = 'edit';
    else if (/新增|添加|增加|新建|录入/.test(title)) kind = 'add';
  }
  if (kind === 'unknown' && innerDoc) {
    const text = dialogInnerText(innerDoc).slice(0, 400);
    if (/^修改|编辑信息|修改记录/.test(text)) kind = 'edit';
    else if (/^新增|添加记录|添加信息/.test(text)) kind = 'add';
  }
  return { root, innerDoc, kind, confirmBtn: null };
}

/** 功能：温和关闭弹窗——只点关闭/取消类控件，绝不点"确定/保存"（编辑弹窗里点确定会提交覆盖）。 */
function closeDialogSoft(root: HTMLElement): void {
  const closer = Array.from(root.querySelectorAll<HTMLElement>('.layui-layer-close, [class*="close" i], a, button, span, i')).find((el) => {
    if (!isVisible(el) || el.closest(OWN_UI_SEL)) return false;
    const text = normalizeText(`${el.textContent || ''} ${el.getAttribute('title') || ''}`);
    const cls = (el.className || '').toString();
    if (/^(取消|关闭|返回|收起|放弃)$/.test(text)) return true;
    return /close|cancel/i.test(cls) && !/确定|保存|提交/.test(text);
  });
  if (closer) {
    try {
      closer.click();
    } catch {
      // 忽略
    }
    return;
  }
  // 无关闭控件：派发 Escape（多数弹窗组件支持 Esc 关闭），仍不碰确定/保存
  try {
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    root.ownerDocument.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
  } catch {
    // 忽略
  }
}

/**
 * 功能：加行点击未带来行增长时的弹窗归责处理。
 * 原理：只处理"本次点击新出现"的弹窗（避免误关选择器弹窗）；编辑/未知弹窗立即温和关闭并中止本条；
 * 新增弹窗且调用方提供填写回调时执行弹窗内填写并确认。返回是否已消化本次点击（filled=true 视为成功）。
 */
export async function handleDialogAfterClick(
  doc: Document,
  beforeRoots: HTMLElement[],
  kindLabel: string,
  entryIndex: number,
  fillAdd?: (dialog: OpenDialogInfo) => Promise<boolean>,
): Promise<'filled' | 'closed-edit' | 'closed-new' | 'left-open' | 'none'> {
  const after = visibleDialogRoots(doc);
  if (sameRootSet(beforeRoots, after)) return 'none';
  const fresh = after.filter((root) => !beforeRoots.includes(root));
  for (const root of fresh) {
    const info = classifyDialog(root);
    if (info.kind === 'add' && fillAdd) {
      if (await fillAdd(info)) return 'filled';
    }
    closeDialogSoft(root);
    logRowDecision(doc, { kind: kindLabel, index: entryIndex, decision: info.kind === 'edit' ? 'edit-dialog-aborted' : 'new-dialog-unsupported' });
    return info.kind === 'edit' ? 'closed-edit' : 'closed-new';
  }
  return 'left-open';
}

/** 功能：在"新增"弹窗内按语义映射填写学术成果字段并确认，行真实增长才算成功。 */
async function fillAchievementDialog(doc: Document, dialog: OpenDialogInfo, entry: { title: string; date: string; role: string; description: string }): Promise<boolean> {
  const scope: HTMLElement | Document = dialog.innerDoc || dialog.root;
  const rootEl = scope instanceof Document ? (scope.body || scope.documentElement) : scope;
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
    if (hit && !hit.value.trim()) {
      setInputValue(hit, val);
      return true;
    }
    return false;
  };
  setInputValue(titleInput, entry.title);
  if (!titleInput.value.trim() || normalizeText(titleInput.value) !== normalizeText(entry.title)) return false; // 弹窗写入被组件拒绝：不确认，交给人工
  const monthStart = (s: string): string => {
    const m = /^(\d{4})[-/.](\d{1,2})/.exec((s || '').trim());
    return m ? `${m[1]}-${m[2].padStart(2, '0')}` : (s || '').trim();
  };
  trySet(titleInput, monthStart(entry.date), /时间|日期|年月/);
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

/** 扩展自身 UI 容器：查找页面按钮时绝不选中（防"正在自动加行"等横幅文字被当按钮） */
const OWN_UI_SEL = '#tui-panel, #tui-guide-hint, #tui-check-report, #tui-schools, #tui-autotest-result, [class*="tui-banner"], [class*="tui-panel"]';

/** 加行按钮查找诊断：记录被跳过的候选（disabled/其他表格/扩展自身 UI）——"点了没反应"类问题定位用 */
function logAddSkip(c: HTMLElement, why: string): void {
  try {
    const doc = c.ownerDocument || document;
    const store = (doc.defaultView as Window | null)?.sessionStorage;
    if (!store) return;
    const arr = (() => {
      try {
        return JSON.parse(store.getItem('tui-addbtn-debug') || '[]') as unknown[];
      } catch {
        return [] as unknown[];
      }
    })();
    arr.push({
      at: Date.now(),
      why,
      tag: c.tagName.toLowerCase(),
      id: c.getAttribute('id') || '',
      cls: (c.getAttribute('class') || '').slice(0, 40),
      text: (c.textContent || (c as HTMLInputElement).value || '').replace(/\s+/g, ' ').trim().slice(0, 20),
      disabled: !!(c as HTMLButtonElement).disabled,
    });
    store.setItem('tui-addbtn-debug', JSON.stringify(arr.slice(-16)));
  } catch {
    // 忽略
  }
}

/** 找"新增/添加一行"按钮：文字按钮 → 表格内图标按钮 → 父容器（排除其他表格）→ 页面全局（排除其他表格）；withinRow 限定行内（北邮式逐行「添加」） */
function findAddButton(table: HTMLElement, withinRow?: HTMLTableRowElement): HTMLElement | null {
  const isMatch = (c: HTMLElement): boolean => {
    const label = normalizeText(`${c.textContent || ''} ${c.getAttribute('value') || ''} ${c.getAttribute('alt') || ''} ${c.getAttribute('title') || ''}`);
    // 只用明确的加行措辞（"自动加行"这类进度文案不是按钮）
    if (/新增一行|添加一行|增加一行|插入一行|新增|添加|增加|插入/.test(label)) return true;
    const cls = `${c.getAttribute('class') || ''} ${c.getAttribute('id') || ''} ${c.getAttribute('name') || ''}`.toLowerCase();
    if (/(^|[-_])add([-_]|$)|btnadd|addbtn|addrow|addline|append|insert/i.test(cls)) return true;
    const js = `${c.getAttribute('onclick') || ''} ${c.getAttribute('href') || ''}`;
    if (/dopostback|__doPostBack/i.test(js) && /add|insert|append|newrow/i.test(js)) return true;
    return false;
  };
  const search = (scope: HTMLElement | null, excludeOtherTables: boolean): HTMLElement | null => {
    if (!scope) return null;
    const cands = Array.from(
      scope.querySelectorAll<HTMLElement>('button, a, span, i, div[role="button"], input[type="button"], input[type="submit"], input[type="image"]'),
    );
    let best: HTMLElement | null = null;
    let bestScore = -1;
    for (const c of cands) {
      if (!isVisible(c)) continue;
      if (!isMatch(c)) continue;
      if (c.closest(OWN_UI_SEL)) {
        logAddSkip(c, 'own-ui');
        continue; // 扩展自己的横幅/面板绝不是页面按钮
      }
      if ((c as HTMLButtonElement).disabled || c.getAttribute('aria-disabled') === 'true') {
        logAddSkip(c, 'disabled');
        continue; // 禁用按钮点了也没反应
      }
      if (withinRow && c.closest('tr') !== withinRow) continue; // 只点本行的「添加」
      if (excludeOtherTables) {
        const t = c.closest('table');
        // 只排除"无关表"里的按钮；若网格嵌套在外层布局表内（东华式：按钮在外层表、网格在内层表），
        // 外层表是目标表的祖先 → 其按钮是合法的加行按钮（巨能填全局兜底同款思路）
        if (t && t !== table && !t.contains(table)) {
          logAddSkip(c, 'other-table');
          continue;
        }
      }
      // 多候选打分：真实按钮 > 链接/输入 > 装饰性 span/div；带内联 onclick、class 含 add 的加分（避免点到无处理器的文本节点）
      const tag = c.tagName.toLowerCase();
      let s = tag === 'button' ? 4 : tag === 'a' || tag === 'input' ? 3 : 1;
      if (typeof ((c as HTMLElement & { onclick?: unknown }).onclick) === 'function') s += 2;
      if (/(^|[-_])add([-_]|$)|btnadd|addbtn|addrow|addline|append|insert/i.test((c.getAttribute('class') || '').toLowerCase())) s += 1;
      if (s > bestScore) {
        best = c;
        bestScore = s;
      }
    }
    return best;
  };
  if (withinRow) return search(withinRow, false);
  return search(table, false) || findTableActionLink(table) || search(table.parentElement, true) || search(document.body, true);
}

function dataRowsOf(table: HTMLTableElement): HTMLTableRowElement[] {
  return Array.from(table.rows).slice(1);
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
): Promise<number> {
  const entries = profile.research.filter((r) => r.title && r.title.trim()).slice(0, 20);
  if (!entries.length) return 0;
  const stripJournal = (s: string) => s.replace(/^发表刊物(?:或出版社)?[：:]?\s*/, '');
  const toMonthStart = (s: string) => {
    const m = /^(\d{4})[-/.](\d{1,2})/.exec((s || '').trim());
    return m ? `${m[1]}-${m[2].padStart(2, '0')}` : (s || '').trim();
  };
  const rowTitle = (row: HTMLTableRowElement, titleIdx: number): string => {
    if (titleIdx < 0 || !row.cells[titleIdx]) return '';
    const cell = row.cells[titleIdx];
    const el = cell.querySelector('input:not([type="hidden"])') as HTMLInputElement | null;
    if (el) return el.value.trim();
    const hidden = cell.querySelector('input') as HTMLInputElement | null;
    if (hidden && hidden.value.trim()) return hidden.value.trim();
    // 服务器渲染的纯文本展示行：退回单元格文本
    return (cell.textContent || '').trim();
  };
  let filled = 0;
  // 去重键 = 标题（巨能填 page_protocol_fill 同款：页面已有同题名行即跳过，宁可不填也不产生重复行；
  // 同题不同月的档案条目会被跳过，决策日志记为 duplicate，字段报告可直接看到跳过了哪几条）
  for (let i = startIndex; i < entries.length; i++) {
    const entry = entries[i];
    let row: HTMLTableRowElement | null = null;
    let alreadyPresent = false;
    let attempt = 0; // 连续加行失败计数：仅"点击后行数未增长"才 +1，成功增长不计数（不再按总点击封顶）
    let pbWaits = 0; // 回发等待次数：与失败分开计，防止回发窗口把失败预算烧光后卡死
    let iters = 0; // 安全阀：单条记录总迭代上限，防"行一直加但永远不被判定可用"的异常页面无限点击
    while (attempt <= maxAddAttempts && ++iters <= maxAddAttempts * 2 + 6) {
      if (!docAlive(doc)) return filled; // 整页回发已刷新：续填接管，旧文档不再操作
      if (postbackJustFired(doc)) {
        if (++pbWaits <= 4) {
          await sleep(2000); // 回发进行中：等刷新，不连点
          continue;
        }
        // 回发窗口（约 8 秒）已耗尽而文档仍在：不再空等，按当前页面状态继续
      }
      const info = findAchievementTable(doc);
      if (!info) {
        logRowDecision(doc, { kind: 'achievements', index: i, decision: 'table-missing' });
        break;
      }
      // 页面已有该条目（含无输入框的服务器展示行）→ 跳过，避免重复
      if (dataRowsOf(info.table).some((r) => normalizeText(rowTitle(r, info.titleIdx)) === normalizeText(entry.title))) {
        alreadyPresent = true;
        logRowDecision(doc, { kind: 'achievements', index: i, decision: 'duplicate' });
        break;
      }
      // 优先填空行（标题格为空且有关键输入框；整行全空才用，避免覆盖用户半填的行）
      const rows = validDataRows(info.table);
      const empty = rows.find((r) => !rowTitle(r, info.titleIdx) && cellHasControl(r, info.titleIdx) && rowFullyEmpty(r, [info.timeIdx, info.titleIdx, info.journalIdx, info.roleIdx]));
      if (empty) {
        row = empty;
        break;
      }
      // 系统已提示行数上限：不再点击，停止并如实报告（巨能填 known_table_row_limits 同款停止条件）
      const limit = detectRowLimitBlocked(doc);
      if (limit) {
        logRowDecision(doc, { kind: 'achievements', index: i, decision: 'limit-blocked', reason: limit });
        break;
      }
      if (attempt >= maxAddAttempts) {
        logRowDecision(doc, { kind: 'achievements', index: i, decision: 'add-fail-cap', failRound: attempt });
        break; // 纯填充模式（maxAddAttempts=0）不点按钮
      }
      const addBtn = findAddButton(info.table);
      if (addBtn && (allowCommitActions || isExplicitAddRowAction(addBtn))) {
        const rowsBefore = validDataRows(info.table).length;
        const dialogsBefore = visibleDialogRoots(doc);
        // 单次点击（策略跨轮轮换）+ 行数验证；整页回发由断点续填接管
        if (await clickAddRowVerified(doc, addBtn, findAchievementTable, rowsBefore, beforeAdd, i, attempt)) continue;
        if (!docAlive(doc)) continue;
        // 行数上限弹窗最先判定：命中时保留弹窗给用户看，不关闭不继续
        const limit = detectRowLimitBlocked(doc);
        if (limit) {
          logRowDecision(doc, { kind: 'achievements', index: i, decision: 'limit-blocked', failRound: attempt, reason: limit });
          break;
        }
        // 点击打开的是弹窗而非直接加行：新增弹窗就地填写确认，编辑弹窗立即关闭（防止覆盖已有行）
        const dialogOutcome = await handleDialogAfterClick(doc, dialogsBefore, 'achievements', i, (dialog) =>
          fillAchievementDialog(doc, dialog, { title: entry.title, date: entry.date, role: entry.role || '', description: entry.description || '' }),
        );
        if (dialogOutcome === 'filled') continue;
        if (dialogOutcome !== 'none') break; // 弹窗已处理（关闭/无法安全填写）：本条中止，交由外层预算与人工核对
        attempt++;
        logRowDecision(doc, { kind: 'achievements', index: i, decision: 'no-growth', failRound: attempt });
        break; // 行数未增长：本轮停止连点，跨轮由外层按连续失败预算重试并轮换点击策略
      }
      // 南理工式：保存后服务器才多出一行 → 自动点「保存」
      const saveBtn = allowCommitActions ? findSaveButton(info.table) : null;
      if (saveBtn) {
        const rowsBefore = validDataRows(info.table).length;
        if (await clickAddRowVerified(doc, saveBtn, findAchievementTable, rowsBefore, beforeAdd, i, attempt)) continue;
        if (!docAlive(doc)) continue;
        attempt++;
        logRowDecision(doc, { kind: 'achievements', index: i, decision: 'save-no-growth', failRound: attempt });
        break;
      }
      logRowDecision(doc, { kind: 'achievements', index: i, decision: 'no-add-btn' });
      break;
    }
    if (alreadyPresent) {
      // 已存在行无需重写，但已经完成，续填内核必须据此推进游标。
      onProcessed?.(i + 1);
      continue;
    }
    if (!row) break;
    const info = findAchievementTable(doc);
    if (!info) break;
    const set = (idx: number, val: string) => {
      if (idx < 0 || !val || !row) return;
      const cell = row.cells[idx];
      if (!cell) return;
      const el = (cell.querySelector('input:not([type="hidden"])') || cell.querySelector('input')) as HTMLInputElement | null;
      if (!el) return;
      setInputValue(el, val);
      markEl(el, 'filled');
    };
    set(info.titleIdx, entry.title);
    set(info.timeIdx, toMonthStart(entry.date));
    set(info.roleIdx, entry.role || '');
    set(info.journalIdx, stripJournal(entry.description || ''));
    filled++;
    onProcessed?.(i + 1);
  }
  return filled;
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

/** 行内是否含有可写控件（输入框/文本域/可编辑元素） */
function rowHasInput(row: HTMLTableRowElement): boolean {
  return !!row.querySelector('input:not([type="hidden"]), textarea, [contenteditable="true"]');
}

/** "没有数据/暂无数据"占位行（无输入框的提示行） */
function isPlaceholderRow(row: HTMLTableRowElement): boolean {
  if (rowHasInput(row)) return false;
  return /没有数据|暂无数据|无记录|暂无记录|nodata/i.test(normalizeText(row.textContent || ''));
}

/** 表格的有效数据行：跳过表头、占位行与无输入框的行 */
function validDataRows(table: HTMLTableElement): HTMLTableRowElement[] {
  return Array.from(table.rows).slice(1).filter((r) => rowHasInput(r) && !isPlaceholderRow(r));
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
): Promise<number> {
  const entries = profile.experiences.filter((e) => (e.org && e.org.trim()) || (e.start && e.start.trim())).slice(0, 20);
  if (!entries.length) return 0;
  let filled = 0;
  for (let i = startIndex; i < entries.length; i++) {
    const e = entries[i];
    let row: HTMLTableRowElement | null = null;
    let alreadyPresent = false;
    for (let attempt = 0; attempt <= maxAddAttempts; attempt++) {
      if (!docAlive(doc)) return filled; // 整页回发已刷新：续填接管，旧文档不再操作
      if (postbackJustFired(doc)) {
        await sleep(2000); // 回发进行中：等刷新，不连点
        continue;
      }
      const info = findExperienceTable(doc); // 每次重新定位（加行可能重建 DOM 或整页刷新）
      if (!info) break;
      const rows = validDataRows(info.table);
      // 页面已有该条目（含无输入框的服务器展示行）→ 仅归一化时间格式后跳过，避免重复
      const existingRow = dataRowsOf(info.table).find((r) => normalizeText(experienceRowOrg(r, info.orgIdx)) === normalizeText(e.org));
      if (existingRow) {
        // 已存在的行先归一化时间格式（含输入行，旧长格式 → YYYY.MM-YYYY.MM）
        normalizeExperienceTime(existingRow, e, info);
        if (!rowHasInput(existingRow)) {
          alreadyPresent = true; // 已保存的服务器文本展示行
          break;
        }
        // 输入行里已填但未落库（上次「添加」没生效）→ 点本行 DoPostback「添加」保存，实现自动换行
        const rowBtn = findAddButton(info.table, existingRow);
        if (allowCommitActions && rowBtn && isDoPostbackAction(rowBtn)) {
          if (attempt >= maxAddAttempts) break;
          await clickPageAction(rowBtn, clickAttempt(beforeAdd, i, attempt));
          await sleep(1500); // 北邮等服务器回发较慢：给足新行出现的时间再继续
          continue;
        }
        alreadyPresent = true; // 其他站点旧行为：输入行内容视为已处理
        break;
      }
      // 优先填空行（单位格为空且有关键输入框；整行全空才用，避免覆盖用户半填的行）
      const empty = rows.find((r) => !experienceRowOrg(r, info.orgIdx) && cellHasControl(r, info.orgIdx) && rowFullyEmpty(r, [info.timeIdx, info.orgIdx, info.roleIdx, info.endIdx]));
      if (empty) {
        row = empty;
        break;
      }
      if (attempt >= maxAddAttempts) break; // 纯填充模式（maxAddAttempts=0）不点按钮
      const addBtn = findAddButton(info.table);
      if (addBtn && (allowCommitActions || isExplicitAddRowAction(addBtn))) {
        const rowsBefore = validDataRows(info.table).length;
        const dialogsBefore = visibleDialogRoots(doc);
        // 验证式点击：单策略生效即停，确认未增长才换策略；行数上限弹窗出现即停止
        if (await clickAddRowVerified(doc, addBtn, findExperienceTable, rowsBefore, beforeAdd, i)) continue;
        if (!docAlive(doc)) continue; // 整页回发已刷新：断点续填接管
        // 行数上限弹窗最先判定：命中时保留弹窗给用户看；其余新开弹窗若非本表可安全填写的形态则温和关闭
        const limit = detectRowLimitBlocked(doc);
        if (limit) {
          logRowDecision(doc, { kind: 'experiences', index: i, decision: 'limit-blocked', reason: limit });
          break;
        }
        if ((await handleDialogAfterClick(doc, dialogsBefore, 'experiences', i)) !== 'none') break;
        logRowDecision(doc, { kind: 'experiences', index: i, decision: 'no-growth' });
        break; // 等待超时且行数未增长：停止连点，防「无限新增一行」
      }
      // 南理工式：保存后服务器才多出一行 → 自动点「保存」（回发刷新后由断点续填接管）
      const saveBtn = allowCommitActions ? findSaveButton(info.table) : null;
      if (saveBtn) {
        const rowsBefore = validDataRows(info.table).length;
        await clickPageAction(saveBtn, clickAttempt(beforeAdd, i, attempt));
        if (await waitForRowGrowth(doc, findExperienceTable, rowsBefore)) continue;
        if (!docAlive(doc)) continue;
        break;
      }
      // 无加行按钮：尝试点击空白模板行激活编辑（EasyUI click-to-edit 网格）
      const template = Array.from(info.table.rows).slice(1).find((r) => !rowHasInput(r) && !isPlaceholderRow(r));
      if (template) {
        const cell = (template.cells[info.orgIdx] || template.cells[0]) as HTMLElement | undefined;
        if (cell) {
          cell.click();
          await sleep(700);
          continue;
        }
      }
      break;
    }
    if (alreadyPresent) {
      onProcessed?.(i + 1); // 已存在的经历行也必须推进断点，防止外层空转误判失败
      continue;
    }
    if (!row) break;
    const info = findExperienceTable(doc);
    if (!info) break;
    if (!fillExperienceRow(row, e, info)) break;
    filled++;
    onProcessed?.(i + 1); // 本条已完整写入：显式推进断点（n 计数不含"已存在跳过"的条目）
    // 北邮式逐行网格：填完立即点本行 DoPostback「添加」落库（自动换行/自动添加）
    if (allowCommitActions && maxAddAttempts > 0) {
      const rowBtn = findAddButton(info.table, row);
      if (rowBtn && isDoPostbackAction(rowBtn)) {
        await clickPageAction(rowBtn, clickAttempt(beforeAdd, i, 0));
        await sleep(1500);
      }
    }
  }
  return filled;
}

/** 定位"奖励情况"表格（表头含 奖励/荣誉 + 时间列 + 名称列，如南理工"奖励单位/奖励原因/奖励名称"、北邮等） */
export function findAwardTable(doc: Document): { table: HTMLTableElement; timeIdx: number; nameIdx: number; unitIdx: number; reasonIdx: number } | null {
  const matches: Array<{ table: HTMLTableElement; timeIdx: number; nameIdx: number; unitIdx: number; reasonIdx: number }> = [];
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

/** 奖励情况全自动填写：去重 + 行数不够时自动点击"新增一行/保存"扩展（断点续填） */
export async function fillAwardRows(
  profile: Profile,
  doc: Document,
  startIndex = 0,
  beforeAdd?: (i: number) => void | number,
  maxAddAttempts = 10,
  allowCommitActions = true,
  onProcessed?: (nextIndex: number) => void,
): Promise<number> {
  const entries = profile.awards.filter((a) => a.content && a.content.trim()).slice(0, 20);
  if (!entries.length) return 0;
  let filled = 0;
  for (let i = startIndex; i < entries.length; i++) {
    const a = entries[i];
    const name = a.content.trim();
    const unit = (a.place || '').trim();
    let row: HTMLTableRowElement | null = null;
    let alreadyPresent = false;
    for (let attempt = 0; attempt <= maxAddAttempts; attempt++) {
      const found = findAwardTable(doc);
      if (!found) break;
      const cellNameOf = (r: HTMLTableRowElement): string => {
        if (!r.cells[found.nameIdx]) return '';
        const cell = r.cells[found.nameIdx];
        const el = cell.querySelector('input') as HTMLInputElement | null;
        if (el && el.value.trim()) return el.value.trim();
        return (cell.textContent || '').trim();
      };
      const cellTimeOf = (r: HTMLTableRowElement): string => {
        if (!r.cells[found.timeIdx]) return '';
        const el = r.cells[found.timeIdx].querySelector('input') as HTMLInputElement | null;
        if (el && el.value.trim()) return normalizeText(el.value);
        return normalizeText(r.cells[found.timeIdx].textContent || '');
      };
      // 去重键 = 名称+时间：同名但获奖时间不同是两条不同记录；月份两侧统一规范化（页面可能用 202410 紧凑格式）
      const entryKey = `${normalizeText(name)}|${monthKeyOf(a.date)}`;
      const existingRow = dataRowsOf(found.table).find((r) => `${normalizeText(cellNameOf(r))}|${monthKeyOf(cellTimeOf(r))}` === entryKey);
      if (existingRow) {
        // 已有同名同时间的行：只补空白单元格（如漏填的获奖地点/级别），绝不覆盖已有内容（巨能填"差量同步·先补缺"同款）。
        // 补缺后视为已处理并推进断点，否则外层会对同一行反复空转直到误判失败。
        const setIfEmpty = (idx: number, val: string): void => {
          if (idx < 0 || !val || !existingRow.cells[idx]) return;
          const cell = existingRow.cells[idx];
          const el = (cell.querySelector('input:not([type="hidden"])') || cell.querySelector('input')) as HTMLInputElement | null;
          if (!el || el.value.trim()) return;
          setInputValue(el, val);
          markEl(el, 'filled');
          logRowDecision(doc, { kind: 'awards', index: i, decision: 'gap-filled' });
        };
        setIfEmpty(found.unitIdx, unit);
        setIfEmpty(found.reasonIdx, (a.level || '').trim());
        alreadyPresent = true;
        break;
      }
      const rows = validDataRows(found.table);
      const empty = rows.find((r) => !cellNameOf(r) && cellHasControl(r, found.nameIdx) && rowFullyEmpty(r, [found.timeIdx, found.nameIdx, found.unitIdx, found.reasonIdx]));
      if (empty) {
        row = empty;
        break;
      }
      if (attempt >= maxAddAttempts) break;
      const addBtn = findAddButton(found.table);
      if (addBtn && (allowCommitActions || isExplicitAddRowAction(addBtn))) {
        const rowsBefore = validDataRows(found.table).length;
        const dialogsBefore = visibleDialogRoots(doc);
        // 验证式点击：单策略生效即停，确认未增长才换策略；行数上限弹窗出现即停止
        if (await clickAddRowVerified(doc, addBtn, findAwardTable, rowsBefore, beforeAdd, i)) continue;
        if (!docAlive(doc)) continue; // 整页回发已刷新：断点续填接管
        const limit = detectRowLimitBlocked(doc);
        if (limit) {
          logRowDecision(doc, { kind: 'awards', index: i, decision: 'limit-blocked', reason: limit });
          break;
        }
        if ((await handleDialogAfterClick(doc, dialogsBefore, 'awards', i)) !== 'none') break;
        logRowDecision(doc, { kind: 'awards', index: i, decision: 'no-growth' });
        break; // 行数未增长：停止连点，防「无限新增一行」
      }
      const saveBtn = allowCommitActions ? findSaveButton(found.table) : null;
      if (saveBtn) {
        const rowsBefore = validDataRows(found.table).length;
        await clickPageAction(saveBtn, clickAttempt(beforeAdd, i, attempt));
        if (await waitForRowGrowth(doc, findAwardTable, rowsBefore)) continue;
        if (!docAlive(doc)) continue;
        break;
      }
      break;
    }
    if (alreadyPresent) {
      // 已存在（含只补了空格）的行同样算已处理：续填内核必须据此推进游标，
      // 否则外层会对同一行空转直至误判失败并丢弃剩余条目（合工大奖励地点漏填的根因）。
      onProcessed?.(i + 1);
      continue;
    }
    if (!row) break;
    const found2 = findAwardTable(doc);
    if (!found2) break;
    const setCell = (idx: number, val: string) => {
      if (idx < 0 || !val || !row || !row.cells[idx]) return;
      const el = (row.cells[idx].querySelector('input:not([type="hidden"])') || row.cells[idx].querySelector('input')) as HTMLInputElement | null;
      if (!el) return;
      setInputValue(el, val);
      markEl(el, 'filled');
    };
    const month = normalizeMonth(a.date) || a.date;
    setCell(found2.timeIdx, month);
    setCell(found2.unitIdx, unit);
    setCell(found2.reasonIdx, a.level || '');
    setCell(found2.nameIdx, name);
    filled++;
    onProcessed?.(i + 1); // 本条已完整写入：显式推进断点（n 计数不含"已存在跳过"的条目，单靠 n 会使游标滞后）
  }
  return filled;
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
): Promise<number> {
  const entries = languageEntries(profile);
  let processed = 0;
  for (let i = startIndex; i < entries.length; i++) {
    let info = findLanguageTable(doc);
    if (!info) break;
    const entry = entries[i];
    const rows = validDataRows(info.table);
    const existing = rows.find((row) => fillLanguageRow(row, info!, entry, doc));
    if (existing) {
      fillLanguageRow(existing, info, entry, doc);
      processed++;
      continue;
    }
    let empty = rows.find((row) => rowFullyEmpty(row, [info!.typeIdx, info!.scoreIdx, info!.dateIdx, info!.noteIdx]));
    if (!empty) {
      const addButton = findAddButton(info.table);
      if (!addButton || (!allowCommitActions && !isExplicitAddRowAction(addButton)) || i - startIndex >= maxAddAttempts) break;
      const beforeRows = validDataRows(info.table).length;
      const dialogsBefore = visibleDialogRoots(doc);
      // 验证式点击：单策略生效即停，确认未增长才换策略
      if (!(await clickAddRowVerified(doc, addButton, findLanguageTable, beforeRows, beforeAdd, i))) {
        const limit = detectRowLimitBlocked(doc);
        if (limit) {
          logRowDecision(doc, { kind: 'language', index: i, decision: 'limit-blocked', reason: limit });
          break;
        }
        if ((await handleDialogAfterClick(doc, dialogsBefore, 'language', i)) !== 'none') break;
        logRowDecision(doc, { kind: 'language', index: i, decision: 'no-growth' });
        break;
      }
      info = findLanguageTable(doc);
      if (!info) break;
      empty = validDataRows(info.table).find((row) => rowFullyEmpty(row, [info!.typeIdx, info!.scoreIdx, info!.dateIdx, info!.noteIdx]));
    }
    if (!empty || !fillLanguageRow(empty, info, entry, doc)) break;
    processed++;
  }
  return processed;
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

/** 单元格内是否有可见输入/选择控件（空白模板行、仅图标按钮的行不算可填） */
function cellHasControl(row: HTMLTableRowElement, idx: number): boolean {
  return idx >= 0 && !!row.cells[idx] && !!row.cells[idx].querySelector('input:not([type="hidden"]), select, textarea, [contenteditable="true"]');
}

/** 单元格值是否视为"空"（请选择/--/无 等占位选项不算内容） */
function cellValueEmpty(v: string): boolean {
  const t = (v || '').trim();
  return !t || /^(请选择|--+|-|无)$/.test(t);
}

/** 行的所有可写格均为空（保护用户已填/半填的行——绝不覆盖用户数据） */
function rowFullyEmpty(row: HTMLTableRowElement, idxs: number[]): boolean {
  for (const idx of idxs) {
    if (idx < 0 || !row.cells[idx]) continue;
    const el = row.cells[idx].querySelector('input:not([type="hidden"]), select, textarea') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    if (el && !cellValueEmpty(el.value || '')) return false;
  }
  return true;
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
): Promise<number> {
  const members = profile.familyMembers.filter((m) => m.name && m.name.trim()).slice(0, 10);
  if (!members.length) return 0;
  let filled = 0;
  for (let i = startIndex; i < members.length; i++) {
    const m = members[i];
    let row: HTMLTableRowElement | null = null;
    let alreadyPresent = false;
    for (let attempt = 0; attempt <= maxAddAttempts; attempt++) {
      if (!docAlive(doc)) return filled; // 整页回发已刷新：续填接管，旧文档不再操作
      if (postbackJustFired(doc)) {
        await sleep(2000); // 回发进行中：等刷新，不连点
        continue;
      }
      const info = findFamilyTable(doc);
      if (!info) break;
      const existingRow = dataRowsOf(info.table).find((r) => normalizeText(familyRowName(r, info)) === normalizeText(m.name));
      if (existingRow) {
        if (!rowHasInput(existingRow)) {
          alreadyPresent = true; // 已保存的服务器文本展示行
          break;
        }
        // 输入行里已填但未落库（上次「添加」没生效）→ 点本行 DoPostback「添加」保存，实现自动换行
        const rowBtn = findAddButton(info.table, existingRow);
        if (allowCommitActions && rowBtn && isDoPostbackAction(rowBtn)) {
          if (attempt >= maxAddAttempts) break;
          await clickPageAction(rowBtn, clickAttempt(beforeAdd, i, attempt));
          await sleep(1500); // 北邮等服务器回发较慢：给足新行出现的时间再继续
          continue;
        }
        alreadyPresent = true; // 其他站点旧行为：输入行内容视为已处理
        break;
      }
      const rows = validDataRows(info.table);
      const empty = rows.find((r) => familyRowEmpty(r, info));
      if (empty) {
        row = empty;
        break;
      }
      if (attempt >= maxAddAttempts) break; // 纯填充模式不点按钮
      const addBtn = findAddButton(info.table);
      if (addBtn && (allowCommitActions || isExplicitAddRowAction(addBtn))) {
        const rowsBefore = validDataRows(info.table).length;
        const dialogsBefore = visibleDialogRoots(doc);
        // 验证式点击：单策略生效即停，确认未增长才换策略；行数上限弹窗出现即停止
        if (await clickAddRowVerified(doc, addBtn, findFamilyTable, rowsBefore, beforeAdd, i)) continue;
        if (!docAlive(doc)) continue; // 整页回发已刷新：断点续填接管
        const limit = detectRowLimitBlocked(doc);
        if (limit) {
          logRowDecision(doc, { kind: 'family', index: i, decision: 'limit-blocked', reason: limit });
          break;
        }
        if ((await handleDialogAfterClick(doc, dialogsBefore, 'family', i)) !== 'none') break;
        logRowDecision(doc, { kind: 'family', index: i, decision: 'no-growth' });
        break; // 行数未增长：停止连点，防「无限新增一行」
      }
      // 南理工式：保存后服务器才多出一行
      const saveBtn = allowCommitActions ? findSaveButton(info.table) : null;
      if (saveBtn) {
        const rowsBefore = validDataRows(info.table).length;
        await clickPageAction(saveBtn, clickAttempt(beforeAdd, i, attempt));
        if (await waitForRowGrowth(doc, findFamilyTable, rowsBefore)) continue;
        if (!docAlive(doc)) continue;
        break;
      }
      break;
    }
    if (alreadyPresent) {
      onProcessed?.(i + 1); // 已存在的家庭成员行也必须推进断点，防止外层空转误判失败
      continue;
    }
    if (!row) break;
    const info = findFamilyTable(doc);
    if (!info) break;
    // 自愈：行内姓名=本人姓名（通用字段误填进网格）→ 清空该行
    const selfName = normalizeText(profile.basic.name || '');
    if (selfName) {
      dataRowsOf(info.table).forEach((r) => {
        if (normalizeText(familyRowName(r, info)) === selfName) clearRowControls(r);
      });
    }
    if (!fillFamilyRow(row, m, info)) break;
    filled++;
    onProcessed?.(i + 1); // 本条已完整写入：显式推进断点（n 计数不含"已存在跳过"的条目）
    // 北邮式逐行网格：填完立即点本行 DoPostback「添加」落库（自动换行/自动添加）
    if (allowCommitActions && maxAddAttempts > 0) {
      const rowBtn = findAddButton(info.table, row);
      if (rowBtn && isDoPostbackAction(rowBtn)) {
        await clickPageAction(rowBtn, clickAttempt(beforeAdd, i, 0));
        await sleep(1500);
      }
    }
  }
  return filled;
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
    '[role="option"], .select2-results__option, .dropdown-item, .ant-select-item-option, .el-select-dropdown__item, ul[role="listbox"] li, .dropdown-menu li, .datagrid-row, .combobox-item, .combotree .tree-title, .tree-title, li, dd';
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

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    // 成对校验：码框数字 + 名框中文才算成功
    for (let v = 0; v < 14; v++) {
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
    store.setItem('tui-pick-debug', JSON.stringify(arr.slice(-10)));
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
export async function pickInPage(doc: Document, el: Element, value: string, context?: PopupPickContext): Promise<'picked' | 'opened' | 'none'> {
  // 本科院校和本科专业先进入各自独立内核；不适用时才回落到通用地区树/浮层流程。
  if (context?.profilePath === 'education.university') {
    const result = await pickSchool(doc, el, value, context);
    if (result !== 'not-applicable') return result === 'failed' ? 'none' : result;
  }
  if (context?.profilePath === 'education.major') {
    const result = await pickMajor(doc, el, value, context);
    if (result !== 'not-applicable') return result === 'failed' ? 'none' : result;
  }
  if (context?.componentDriver) {
    const component = await pickComponentOption(el, value, context);
    if (component.status !== 'not-applicable') return component.status === 'failed' ? 'none' : component.status;
  }
  // Element-UI 等组件无独立"选择"按钮：点输入框自身即可展开下拉（海大式 el-select）
  const trigger = findPickerTrigger(el) || (el.closest('.el-select, [class*="el-select"]') ? (el as Element) : null);
  if (!trigger) return 'none';
  let aborted = false;
  const timed = new Promise<'picked' | 'opened' | 'none'>((resolve) => {
    setTimeout(() => {
      aborted = true; // 超时后内部流程立即中止，不再继续打字/点击（防止污染主表单、拖慢整体）
      writePickDebug(doc, el, ['flow:timeout-30s'], true, 'none');
      resolve('none');
    }, 30_000);
  });
  try {
    return await Promise.race([pickInPageInner(doc, el, trigger, value, () => aborted, context), timed]);
  } catch (e) {
    writePickDebug(doc, el, ['pick-exception:' + String((e as Error).message || e).slice(0, 60)], false, 'none');
    return 'none';
  }
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
