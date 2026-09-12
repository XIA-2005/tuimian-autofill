// 蓝色系统向导页 → 复古奖励槽（txthjmc/txthjsj/txtpm）识别与填写。
// 上交/中南/南农/湖南大学等蓝色系统页面，奖励页没有动态表格，
// 只有 txthjmc0~4 / txthjsj0~4 / txtpm0~4 三个静态文本输入槽。
// 本模块负责：检测页面上是否有复古奖励槽 → 若有则填写档案奖励数据 → 标记控件已处理。

import { composeListText, Profile } from './profile';
import { withUnlocked } from './unlock';
import { dispatchValueEvents } from './event-policy';

/** 写前临时解锁 + 原生 setter + 事件派发（A1/W-6 收敛：tail=blur-focusout 与原四事件逐字面等价） */
function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  withUnlocked(el, () => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    dispatchValueEvents(el, { tail: 'blur-focusout' });
  });
}

function markEl(el: Element, kind: 'filled' | 'missing' | 'empty'): void {
  try {
    el.setAttribute('data-tui-state', kind);
    if (kind === 'filled') el.classList.add('tui-filled');
    else if (kind === 'empty') el.classList.add('tui-empty');
  } catch {
    // 忽略
  }
}

export interface RetroHonorSlot {
  name: HTMLInputElement;
  time: HTMLInputElement;
  rank: HTMLInputElement;
  index: number;
}

function looksLikeAwardHeaderOrPlaceholder(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  return /^(获奖名称|奖励名称|奖项名称|获奖时间|奖励时间|获奖日期|排名|本人排名|作者排名|地点|颁发单位|主办单位|奖励级别|奖项级别|奖项等级|等级|级别|原因|备注|操作|排名（获奖时间）)$/.test(t);
}

function looksLevel(t: string): boolean {
  return /^(国际|国家|省部|省|市|地市|校|院)级$/.test(t.trim()) ||
    /国际级|国家级|省部级|省级|市级|校级|院级/.test(t);
}

function looksGrade(t: string): boolean {
  return /[一二三四五特]等奖|[金银铜]奖|优秀奖/.test(t) &&
    !/第\s*[一二三四五六七八九十\d]+\s*(名|位|作者)/.test(t);
}

/**
 * 把档案奖励 blob（compose.awards 合成文本）解析成复古三列槽格式。
 * blob 常见格式：
 *   时间|地点|内容(奖名)   —— jlcf 常见
 *   时间|名称|单位|等级   —— hjqk 常见
 */
function parseAwardBlob(blob: string): Array<{ name: string; time: string; rank: string }> {
  const rawRows = String(blob || '')
    .split('#')
    .map(r => String(r || '').split('|').map(c => String(c || '').trim()))
    .filter(r => r.some(c => c));
  const out = [];
  const maxSlots = 5;

  for (const cells of rawRows) {
    if (out.length >= maxSlots) break;

    // 整行都是表头文案 → 丢弃
    if (cells.filter(Boolean).every(c => looksLikeAwardHeaderOrPlaceholder(c))) continue;

    let time = '';
    let name = '';
    let issuer = '';
    let place = '';
    let rank = '';

    // 判断格式
    if (
      cells.length === 3 &&
      /\d{4}/.test(cells[0] || '') &&
      looksGrade(cells[2] || '') &&
      /奖|杯|学金|竞赛|荣誉/.test(cells[1] || '')
    ) {
      // 时间|奖名|等级
      time = cells[0] || '';
      name = cells[1] || '';
      issuer = cells[2] || '';
    } else if (cells.length >= 4 && /奖|杯|学金|竞赛|荣誉/.test(cells[1] || '')) {
      // 时间|名称|单位|等级[+扩展]
      time = cells[0] || '';
      name = cells[1] || '';
      issuer = cells[2] || '';
      if (cells.length > 6) rank = cells[6] || '';
      else if (cells[3] && /第|名|位|作者/.test(cells[3]) && !looksGrade(cells[3])) {
        rank = cells[3];
      }
    } else {
      // 默认：时间|地点|内容(奖名)
      time = cells[0] || '';
      if (cells.length > 2) {
        place = cells[1] || '';
        name = cells[2] || '';
      } else {
        name = cells[1] || cells[0] || '';
      }
      if (cells.length > 6) rank = cells[6] || '';
      else if (cells[3] && /第|名|位|作者/.test(cells[3]) && !looksLevel(cells[3])) {
        rank = cells[3];
      }
    }

    name = String(name || '').trim();
    if (!name || looksLikeAwardHeaderOrPlaceholder(name)) continue;
    if (looksLikeAwardHeaderOrPlaceholder(time)) time = '';
    if (looksLikeAwardHeaderOrPlaceholder(issuer)) issuer = '';
    if (looksLikeAwardHeaderOrPlaceholder(place)) place = '';

    // 地点像「山东省」可附到名称；像「国家级」不当颁发单位
    if (!issuer && place && !looksLevel(place) && !looksGrade(place)) {
      issuer = place;
    }
    let fullName = name;
    if (issuer && issuer !== name && fullName.indexOf(issuer) < 0 && !looksLikeAwardHeaderOrPlaceholder(issuer)) {
      const suffix = `（${issuer}）`;
      if (fullName.length + suffix.length <= 100) fullName += suffix;
    }
    if (looksLikeAwardHeaderOrPlaceholder(fullName)) continue;

    // 清洗排名：只接受"第X名"类本人名次，不接受等级/奖项名
    const sRank = (rank || '').trim();
    if (sRank && (looksLevel(sRank) || looksGrade(sRank) || looksLikeAwardHeaderOrPlaceholder(sRank))) {
      rank = '';
    } else if (sRank) {
      rank = sRank.slice(0, 20);
    }

    out.push({ name: fullName.slice(0, 100), time: time.trim().slice(0, 30), rank });
  }
  return out;
}

/**
 * 检测页面上是否有复古奖励槽。
 * 页面上存在 txthjmc0 / txthjmc1 任一即可认定。
 */
export function findRetroHonorSlots(doc: Document): RetroHonorSlot[] {
  const slots: RetroHonorSlot[] = [];
  for (let i = 0; i < 5; i++) {
    const nameEl = doc.querySelector<HTMLInputElement>(`input[id="txthjmc${i}"], input[name="txthjmc${i}"]`);
    const timeEl = doc.querySelector<HTMLInputElement>(`input[id="txthjsj${i}"], input[name="txthjsj${i}"]`);
    const rankEl = doc.querySelector<HTMLInputElement>(`input[id="txtpm${i}"], input[name="txtpm${i}"]`);
    if (nameEl || timeEl || rankEl) {
      slots.push({ name: nameEl!, time: timeEl!, rank: rankEl!, index: i });
    }
  }
  return slots;
}

export interface RetroHonorFillItem {
  label: string;
  field: string | null;
  status: 'filled' | 'profileEmpty' | 'noMatch' | 'failed' | 'skipped';
  reason?: string;
  valuePreview?: string;
  el?: Element;
}

/**
 * 填写复古奖励槽。
 * 返回 { filled, items }：filled 是已填条数，items 用于主流程汇总到报告。
 *  - 若页面上没有 txthjmc/txthjsj/txtpm 槽 → 返回 { filled: 0, items: [] }（不报错）
 *  - 若档案无奖励数据 → 报告 profileEmpty
 */
export function fillRetroHonorSlots(
  profile: Profile,
  doc: Document,
): { filled: number; items: RetroHonorFillItem[] } {
  const slots = findRetroHonorSlots(doc);
  if (!slots.length) return { filled: 0, items: [] };

  // 从档案合成奖励文本，再解析成槽格式
  const blob = composeListText(profile, 'awards');
  const entries = parseAwardBlob(blob);
  if (!entries.length) {
    return { filled: 0, items: [{
      label: '复古奖励槽（txthjmc/txthjsj/txtpm）',
      field: 'compose.awards',
      status: 'profileEmpty',
      reason: '页面上存在蓝色系统的复古奖励静态槽，但档案中无奖励/荣誉数据',
    }] };
  }

  const items: RetroHonorFillItem[] = [];
  let filled = 0;
  for (let i = 0; i < slots.length && i < entries.length; i++) {
    const slot = slots[i];
    const entry = entries[i];

    if (slot.name) {
      setInputValue(slot.name, entry.name);
      markEl(slot.name, 'filled');
    }
    if (slot.time) {
      setInputValue(slot.time, entry.time);
      markEl(slot.time, 'filled');
    }
    if (slot.rank && entry.rank) {
      setInputValue(slot.rank, entry.rank);
      markEl(slot.rank, 'filled');
    }
    filled++;
    items.push({
      label: `奖励情况 ${i + 1}：${entry.name}${entry.time ? '（' + entry.time + '）' : ''}`,
      field: `awards[${i}]`,
      status: 'filled',
      valuePreview: entry.name,
      el: slot.name,
    });
  }
  return { filled, items };
}
