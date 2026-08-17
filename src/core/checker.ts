// 提交前体检：必填空项、格式校验、一致性校验，返回风险清单（可点击定位）。

import { detectField, FIELD_RULES, FieldRule } from './matcher';

export type CheckLevel = 'error' | 'warn';

export interface CheckItem {
  level: CheckLevel;
  title: string;
  detail: string;
  el?: Element;
}

export interface CheckResult {
  items: CheckItem[];
  summary: string;
}

function isVisibleCheck(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function valueOf(el: Element): string {
  if (el.tagName === 'SELECT') {
    const s = el as HTMLSelectElement;
    if (s.selectedIndex < 0) return '';
    return (s.options[s.selectedIndex].text || s.value).trim();
  }
  return (el as HTMLInputElement | HTMLTextAreaElement).value.trim();
}

/** 身份证 18 位格式 + 校验位校验 */
export function isValidIdCard(v: string): boolean {
  const t = v.trim().toUpperCase();
  if (!/^\d{17}[\dX]$/.test(t)) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checkMap = '10X98765432';
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += parseInt(t[i], 10) * weights[i];
  return t[17] === checkMap[sum % 11];
}

export function runPreSubmitCheck(doc: Document, rules: FieldRule[] = FIELD_RULES): CheckResult {
  const items: CheckItem[] = [];
  const add = (level: CheckLevel, title: string, detail: string, el?: Element) => items.push({ level, title, detail, el });

  let idCard = '';
  let idCardEl: Element | null = null;
  let phone = '';
  let phoneEl: Element | null = null;
  let email = '';
  let emailEl: Element | null = null;
  let postal = '';
  let postalEl: Element | null = null;
  let birthday = '';
  let birthdayEl: Element | null = null;
  let rank = '';
  let rankEl: Element | null = null;
  let rankBase = '';
  let rankBaseEl: Element | null = null;

  doc.querySelectorAll<HTMLElement>('input, select, textarea').forEach((el) => {
    if (!isVisibleCheck(el)) return;
    if (el.tagName === 'INPUT') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (['password', 'hidden', 'submit', 'button', 'reset', 'file', 'image', 'range', 'radio', 'checkbox'].includes(type)) return;
    }
    const d = detectField(el, rules);
    const v = valueOf(el);
    // 必填空项：required 属性或标签带 *
    const isRequired = (el as HTMLInputElement).required || /\*/.test(d.label);
    if (isRequired && !v) {
      add('error', `必填未填：${d.label.replace(/\*/g, '') || el.getAttribute('name') || '未命名字段'}`, '请补充后再提交', el);
      return;
    }
    if (!v || !d.rule) return;
    switch (d.rule.field) {
      case 'basic.idCard':
        idCard = v;
        idCardEl = el;
        break;
      case 'basic.phone':
        phone = v;
        phoneEl = el;
        break;
      case 'basic.email':
        email = v;
        emailEl = el;
        break;
      case 'basic.postalCode':
        postal = v;
        postalEl = el;
        break;
      case 'basic.birthday':
        birthday = v;
        birthdayEl = el;
        break;
      case 'education.rank':
        rank = v;
        rankEl = el;
        break;
      case 'education.rankBase':
        rankBase = v;
        rankBaseEl = el;
        break;
    }
  });

  if (idCard) {
    if (!isValidIdCard(idCard)) {
      add('warn', '身份证号格式或校验位异常', `当前值：${idCard}`, idCardEl || undefined);
    } else if (birthday && /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(birthday)) {
      const b = birthday.replace(/[-/.]/g, '');
      if (b !== idCard.slice(6, 14)) add('warn', '出生日期与身份证不一致', `身份证出生段：${idCard.slice(6, 14)}；填写值：${birthday}`, birthdayEl || undefined);
    }
  }
  if (phone && !/^1\d{10}$/.test(phone)) add('warn', '手机号格式异常', `当前值：${phone}`, phoneEl || undefined);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) add('warn', '邮箱格式异常', `当前值：${email}`, emailEl || undefined);
  if (postal && !/^\d{6}$/.test(postal)) add('warn', '邮政编码格式异常', `当前值：${postal}`, postalEl || undefined);
  if (rank && rankBase) {
    const r = parseInt(rank, 10);
    const b = parseInt(rankBase, 10);
    if (!Number.isNaN(r) && !Number.isNaN(b) && r > b) add('warn', '排名大于总人数', `排名 ${rank} > 总人数 ${rankBase}`, rankEl || undefined);
  }

  // 未完成高亮残留
  const missing = doc.querySelectorAll('[data-tui="missing"]').length;
  const empty = doc.querySelectorAll('[data-tui="empty"]').length;
  if (missing + empty > 0) {
    add('warn', '仍有未完成项', `红色需人工 ${missing} 项、黄色档案未填 ${empty} 项（可点「复制漏填项」处理）`);
  }

  const errors = items.filter((i) => i.level === 'error').length;
  const warns = items.length - errors;
  const summary = errors + warns === 0 ? '体检通过 ✅ 未发现风险' : `发现 ${errors} 项必填缺失、${warns} 项格式/一致性风险（点击条目定位）`;
  return { items, summary };
}
