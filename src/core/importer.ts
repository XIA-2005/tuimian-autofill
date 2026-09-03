// 反向提取：从当前页面读取"用户已填写"的值，导入本地档案。
// 场景：用户在某个学校系统已手填过信息（如南航），一键把数据搬进档案，供其他学校复用。
// 全程本地执行，不联网、不上传。
// 适用范围：本页及同源 iframe 内、能被字段规则识别的控件；验证码/密码/长文自述不提取；已有档案值不覆盖。

import { detectField, FIELD_RULES, FieldRule, normalizeText } from './matcher';
import { getByPath, Profile, setByPath } from './profile';

export interface ImportResult {
  summary: string[];
}

export interface ImportOptions {
  /** 允许读取 DOMParser 解析出的离屏控件；调用前必须先完成页面白名单和结构契约校验。 */
  includeDetachedControls?: boolean;
  /** 排除页面保存的历史值或仅用于流程控制的字段。 */
  excludeSelectors?: string[];
}

/** 合成/推导字段不入档案 */
const SKIP_FIELDS = /^(compose\.|#)/;

/** 本页 + 同源 iframe（主表单嵌在 iframe 里的站点也能提取；跨域 iframe 无法读取则忽略） */
function importDocs(doc: Document): Document[] {
  const docs: Document[] = [doc];
  for (const f of Array.from(doc.querySelectorAll('iframe'))) {
    try {
      const d = f.contentDocument;
      if (d && d.body) docs.push(d);
    } catch {
      // 跨域 iframe 忽略
    }
  }
  return docs;
}

function selectedOptionText(el: HTMLSelectElement): string {
  if (el.selectedIndex < 0) return (el.value || '').trim();
  const parts = (el.options[el.selectedIndex].text || '').split(/[|｜:：]/).map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0] || (el.value || '').trim();
}

/** 单选/复选项的可见标签（如"男"/"是"） */
function choiceLabel(r: HTMLInputElement): string {
  const wrap = r.closest('label');
  if (wrap && wrap.textContent && wrap.textContent.trim()) return wrap.textContent.trim().slice(0, 20);
  const next = r.nextSibling;
  if (next && next.nodeType === Node.TEXT_NODE && next.textContent && next.textContent.trim()) return next.textContent.trim();
  const parent = r.parentElement;
  if (parent) {
    const t = parent.textContent ? parent.textContent.trim() : '';
    if (t && t.length <= 10 && !/[|｜,，;；]/.test(t)) return t;
  }
  return '';
}

function rowTexts(row: HTMLTableRowElement): string[] {
  return Array.from(row.cells).map((c) => normalizeText(c.textContent || ''));
}

function cellControlValue(row: HTMLTableRowElement, i: number): string {
  if (i < 0 || !row.cells[i]) return '';
  const c = (row.cells[i].querySelector('input:not([type="hidden"]), select') || row.cells[i].querySelector('input, select')) as HTMLInputElement | HTMLSelectElement | null;
  if (!c) return '';
  if (c.tagName === 'SELECT') return selectedOptionText(c as HTMLSelectElement);
  return (c as HTMLInputElement).value.trim();
}

/** 家庭主要成员表格 → familyMembers（整表替换） */
function importFamilyTables(doc: Document, p: Profile, summary: string[]): void {
  const rows: Array<{ name: string; relation: string; org: string; phone: string; politicalStatus: string }> = [];
  for (const table of Array.from(doc.querySelectorAll<HTMLTableElement>('table'))) {
    const allRows = Array.from(table.rows);
    if (!allRows.length) continue;
    const first = rowTexts(allRows[0]);
    const nameIdx = first.findIndex((h) => h.includes('姓名') || h.includes('成员'));
    const relIdx = first.findIndex((h) => /关系|称谓|与本人/.test(h));
    if (nameIdx < 0 || relIdx < 0) continue;
    const orgIdx = first.findIndex((h) => /单位|工作/.test(h) && !/电话|手机/.test(h));
    const phoneIdx = first.findIndex((h) => /电话|手机|联系方式/.test(h));
    const polIdx = first.findIndex((h) => h.includes('政治面貌') || h.includes('党团'));
    for (const row of allRows.slice(1)) {
      const name = cellControlValue(row, nameIdx);
      if (!name) continue;
      rows.push({
        name,
        relation: cellControlValue(row, relIdx),
        org: cellControlValue(row, orgIdx),
        phone: cellControlValue(row, phoneIdx),
        politicalStatus: cellControlValue(row, polIdx),
      });
    }
  }
  if (rows.length) {
    // 按姓名合并：同名更新、新名追加，绝不删除档案已有成员（防止页面成员不全时覆盖丢数据）
    for (const r of rows) {
      const existing = p.familyMembers.find((m) => (m.name || '').trim() === r.name);
      if (existing) Object.assign(existing, r);
      else p.familyMembers.push(r);
    }
    summary.push(`家庭主要成员 → 合并 ${rows.length} 行（按姓名去重，不删除已有成员）`);
  }
}

/**
 * 功能：提取外语考试表，并同步四六级兼容字段。
 * 原理：按“考试类别 + 成绩 + 日期”生成稳定记录；四、六级同时回写旧字段，兼容已有填充规则。
 */
function importLanguageExamTables(doc: Document, p: Profile, summary: string[]): void {
  for (const table of Array.from(doc.querySelectorAll<HTMLTableElement>('table'))) {
    const allRows = Array.from(table.rows);
    if (allRows.length < 2) continue;
    const first = rowTexts(allRows[0]);
    const nameIdx = first.findIndex((h) => /名称|类别|外语水平|考试项目/.test(h));
    const scoreIdx = first.findIndex((h) => h.includes('成绩') && !/时间|日期/.test(h));
    const dateIdx = first.findIndex((h) => /时间|日期/.test(h));
    const levelIdx = first.findIndex((h) => /等级|级别/.test(h));
    const certificateIdx = first.findIndex((h) => /证书号|证书编号/.test(h));
    if (nameIdx < 0 || scoreIdx < 0 || !first.some((h) => /外语|英语|四级|六级|托福|雅思/.test(h))) continue;
    const toMonth = (v: string): string => {
      const m = /^(\d{4})[-/.](\d{1,2})/.exec(v);
      return m ? `${m[1]}-${m[2].padStart(2, '0')}` : v;
    };
    const data = allRows.slice(1);
    for (const row of data) {
      const kind = cellControlValue(row, nameIdx);
      const score = cellControlValue(row, scoreIdx);
      const date = cellControlValue(row, dateIdx);
      if (!kind || (!score && !date)) continue;
      const exam = {
        kind,
        score,
        date,
        level: cellControlValue(row, levelIdx),
        certificateNo: cellControlValue(row, certificateIdx),
      };
      const duplicate = p.languageExams.some((item) => normalizeText(item.kind) === normalizeText(kind) && item.score.trim() === score.trim() && item.date.trim() === date.trim());
      if (!duplicate) p.languageExams.push(exam);
    }
    const rowHas = (kw: string): HTMLTableRowElement | undefined =>
      data.find((r) => new RegExp(kw, 'i').test(normalizeText(cellControlValue(r, nameIdx))));
    const row4 = rowHas('四级|cet4|cet-4');
    if (row4) {
      const c4 = cellControlValue(row4, scoreIdx);
      if (c4 && !p.education.cet4) {
        p.education.cet4 = c4;
        summary.push(`英语四级成绩 → ${c4}`);
      }
      const d4 = toMonth(cellControlValue(row4, dateIdx));
      if (d4 && !p.education.cet4Date) {
        p.education.cet4Date = d4;
        summary.push(`四级取得时间 → ${d4}`);
      }
    }
    const row6 = rowHas('六级|cet6|cet-6');
    if (row6) {
      const c6 = cellControlValue(row6, scoreIdx);
      if (c6 && !p.education.cet6) {
        p.education.cet6 = c6;
        summary.push(`英语六级成绩 → ${c6}`);
      }
      const d6 = toMonth(cellControlValue(row6, dateIdx));
      if (d6 && !p.education.cet6Date) {
        p.education.cet6Date = d6;
        summary.push(`六级取得时间 → ${d6}`);
      }
    }
    if (p.languageExams.length) summary.push(`外语考试 → 提取 ${p.languageExams.length} 条`);
  }
}

/** 学术成果/获奖/社会实践表格 → research / awards / socialPractice 列表（跨表上下文：标题表设定区块，数据表按列头取值） */
function importAchievementTables(doc: Document, p: Profile, summary: string[]): void {
  // 南航等系统把栏目标题放在表格外；先用只读页面的稳定容器确定区块，再由表头复核。
  let mode: 'awards' | 'practice' | 'research' | null = doc.querySelector('#xxgzjlForm,#xxgzjl')
    ? 'practice'
    : doc.querySelector('#xslwyzzForm,#fblwzz')
      ? 'research'
      : doc.querySelector('#jlcfForm,#jlcf')
        ? 'awards'
        : null;
  for (const table of Array.from(doc.querySelectorAll<HTMLTableElement>('table'))) {
    const allRows = Array.from(table.rows);
    if (!allRows.length) continue;
    const first = rowTexts(allRows[0]);
    const firstText = first.join(' ');
    if (/奖励|获奖|处分|荣誉/.test(firstText)) mode = 'awards';
    else if (/学习和工作经历|学习工作经历|学习或工作|工作经历|实践|社会工作|实习|学生工作|社团/.test(firstText)) mode = 'practice';
    else if (/论文|成果|学术|竞赛|科研|刊物|期刊|出版社/.test(firstText)) mode = 'research';
    if (allRows.length < 2) continue; // 纯标题表，只更新区块
    const timeIdx = first.findIndex((h) => /时间|日期/.test(h) && !/结束/.test(h));
    const startIdx = first.findIndex((h) => /起始|开始/.test(h));
    const endIdx = first.findIndex((h) => /结束/.test(h));
    const placeIdx = first.findIndex((h) => /地点/.test(h));
    const orgIdx = first.findIndex((h) => /单位/.test(h));
    const contentIdx = first.findIndex((h) => h.includes('内容') || h.includes('标题') || h.includes('名称'));
    const roleIdx = first.findIndex((h) => /职务|排名|次序|角色/.test(h));
    const journalIdx = first.findIndex((h) => /刊物|出版社|期刊/.test(h));
    const levelIdx = first.findIndex((h) => /级别|等级/.test(h));
    for (const row of allRows.slice(1)) {
      const content = cellControlValue(row, contentIdx);
      const time = cellControlValue(row, startIdx >= 0 ? startIdx : timeIdx);
      if (mode === 'awards') {
        if (!content) continue;
        const place = cellControlValue(row, placeIdx);
        if (p.awards.some((a) => a.content === content)) continue;
        p.awards.push({
          date: time,
          place,
          content,
          level: cellControlValue(row, levelIdx) || undefined,
          role: cellControlValue(row, roleIdx) || undefined,
        });
        summary.push(`获奖 → ${content}`);
      } else if (mode === 'practice') {
        const org = cellControlValue(row, orgIdx >= 0 ? orgIdx : placeIdx);
        const place = cellControlValue(row, placeIdx);
        // 含"起止/起始/结束时间"列 → 学习/工作经历（experiences）；否则 → 社会实践（socialPractice）
        const isExperience = first.some((h) => /起止|起始|开始时间|结束时间/.test(h));
        if (isExperience) {
          if (!org) continue;
          const start = cellControlValue(row, startIdx >= 0 ? startIdx : timeIdx);
          const end = cellControlValue(row, endIdx);
          if (p.experiences.some((x) => x.org === org && x.start === start)) continue;
          p.experiences.push({ start, end, org, role: cellControlValue(row, roleIdx) });
          summary.push(`学习/工作经历 → ${org.slice(0, 20)}`);
        } else {
          const name = content || org;
          if (!name) continue;
          const desc = endIdx >= 0 ? `结束时间：${cellControlValue(row, endIdx)}` : '';
          const detail = content ? (place ? `地点：${place}` : '') : desc;
          if (p.socialPractice.some((s) => s.name === name)) continue;
          p.socialPractice.push({ date: time, name, role: cellControlValue(row, roleIdx), detail });
          summary.push(`社会实践 → ${name.slice(0, 20)}`);
        }
      } else if (mode === 'research') {
        if (!content) continue;
        if (p.research.some((r) => r.title === content)) continue;
        // 类型按内容关键词推导：竞赛/大赛 → 竞赛；刊物列存在 → 论文；否则 其他
        const type = journalIdx >= 0 ? '论文' : /竞赛|大赛|比赛|挑战杯/.test(content) ? '竞赛' : '其他';
        p.research.push({
          title: content,
          type,
          date: time,
          role: cellControlValue(row, roleIdx),
          description: journalIdx >= 0 ? `发表刊物或出版社：${cellControlValue(row, journalIdx)}` : cellControlValue(row, placeIdx),
        });
        summary.push(`学术成果 → ${content}`);
      }
    }
  }
}

/** 从当前页面提取已填值到档案（仅覆盖空字段；列表去重追加/替换；含同源 iframe；单选/复选组按选中项提取） */
export function importFromPage(profile: Profile, doc: Document, rules: FieldRule[] = FIELD_RULES, options: ImportOptions = {}): ImportResult {
  const p = profile;
  const summary: string[] = [];
  const seen = new Set<string>();
  const choiceSeen = new Set<string>();

  for (const d of importDocs(doc)) {
    d.querySelectorAll<HTMLElement>('input, select, textarea').forEach((el) => {
      if (options.excludeSelectors?.some((selector) => el.matches(selector))) return;
      const isChoice = el.tagName === 'INPUT' && ['radio', 'checkbox'].includes((el as HTMLInputElement).type);
      if (isChoice) {
        // 单选/复选组：整组只处理一次，取"选中项"的标签（如 男/是）
        const input = el as HTMLInputElement;
        const name = input.name || input.id;
        if (!name || choiceSeen.has(name)) return;
        choiceSeen.add(name);
        const dd = detectField(el, rules, { ignoreVisibility: options.includeDetachedControls });
        if (dd.skip === 'captcha' || dd.skip === 'password' || dd.skip === 'other') return;
        if (!dd.rule || SKIP_FIELDS.test(dd.rule.field)) return;
        const cur = getByPath(p, dd.rule.field);
        if (cur != null && String(cur).trim() !== '') return; // 已有数据不覆盖
        const group = Array.from(d.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"], input[type="checkbox"][name="${name}"]`));
        const checked = group.find((r) => r.checked);
        if (!checked) return; // 未选中：不写入（避免"否"类噪声）
        const value = input.type === 'checkbox' ? '是' : choiceLabel(checked) || checked.value;
        if (!value) return;
        setByPath(p, dd.rule.field, value);
        seen.add(dd.rule.field);
        summary.push(`${dd.label} → ${value}`);
        return;
      }
      const dd = detectField(el, rules, { ignoreVisibility: options.includeDetachedControls });
      if (dd.skip === 'captcha' || dd.skip === 'password' || dd.skip === 'other') return;
      if (!dd.rule) return;
      if (SKIP_FIELDS.test(dd.rule.field)) return;
      let value = '';
      if (el.tagName === 'SELECT') value = selectedOptionText(el as HTMLSelectElement);
      else value = (el as HTMLInputElement | HTMLTextAreaElement).value.trim();
      if (!value) return;
      if (seen.has(dd.rule.field)) return;
      const cur = getByPath(p, dd.rule.field);
      if (cur != null && String(cur).trim() !== '') return; // 已有数据不覆盖
      setByPath(p, dd.rule.field, value);
      seen.add(dd.rule.field);
      summary.push(`${dd.label} → ${value}`);
    });
  }

  importFamilyTables(doc, p, summary);
  importLanguageExamTables(doc, p, summary);
  importAchievementTables(doc, p, summary);
  return { summary };
}
