// F02 长文写前保护测试(manual/compose;接入 npm test)
import { makeDomIsolated } from '../../test/regression/observer';
import { emptyProfile } from './profile';
import { fillAll } from './filler';

const failures: string[] = [];
function test(name: string, cond: boolean): void {
  if (!cond) failures.push(name);
}

export function runEssayGuardTests(): void {
  const URL = 'https://example.edu.cn/gsapp/sys/wdyjsbm/tmybm/tbgrxx.do';
  // compose:页面已有不同科研内容 → 保留不覆盖;空 → 自动合成。
  {
    const ctx = makeDomIsolated('<html><body><label>科研经历</label><textarea name="kygz" rows="4"></textarea></body></html>', URL);
    const profile = emptyProfile();
    profile.research.push({ title: '校级大创', type: '项目', date: '2023-2024', role: '主要成员', description: '负责文献综述' });
    const textarea = ctx.doc.querySelector('[name="kygz"]') as HTMLTextAreaElement;
    textarea.value = '用户已有的科研描述,不能被静默覆盖';
    const res = fillAll(profile, ctx.doc);
    const item = res.items.find((i) => i.el === textarea);
    test('F02(compose): 已有不同长文保留不覆盖', textarea.value === '用户已有的科研描述,不能被静默覆盖' && !!item && item.status === 'conflict');
    ctx.restore();
  }
  {
    const ctx = makeDomIsolated('<html><body><label>科研经历</label><textarea name="kygz" rows="4"></textarea></body></html>', URL);
    const profile = emptyProfile();
    profile.research.push({ title: '校级大创', type: '项目', date: '2023-2024', role: '主要成员', description: '负责文献综述' });
    const res = fillAll(profile, ctx.doc);
    const textarea = ctx.doc.querySelector('[name="kygz"]') as HTMLTextAreaElement;
    test('F02(compose): 空长文可自动合成', textarea.value.length > 0 && res.items.some((i) => i.el === textarea && i.status === 'filled'));
    ctx.restore();
  }
  // manual:页面已有个人陈述内容 → 保留;不自动覆盖用户自写。
  {
    const ctx = makeDomIsolated('<html><body><label>个人陈述</label><textarea name="grcs" maxlength="5000" rows="4"></textarea></body></html>', URL);
    const profile = emptyProfile();
    profile.essays.push({ kind: '个人陈述', content: '档案中的个人陈述正文……'.repeat(20), charLimit: 5000, state: { id: 'e1', locked: true, source: 'manual', updatedAt: '2026-01-01T00:00:00.000Z', confidence: 'verified' } });
    const textarea = ctx.doc.querySelector('[name="grcs"]') as HTMLTextAreaElement;
    textarea.value = '用户自己撰写并粘贴的个人陈述';
    const res = fillAll(profile, ctx.doc);
    const item = res.items.find((i) => i.el === textarea);
    test('F02(manual): 已有用户长文保留不覆盖', textarea.value === '用户自己撰写并粘贴的个人陈述' && !!item && item.status === 'skipped' && /保留现有内容/.test(item.reason || ''));
    ctx.restore();
  }
}

export function getEssayGuardFailures(): string[] {
  return failures;
}
