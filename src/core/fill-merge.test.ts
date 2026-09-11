// P03 合同/通用结果合并与认领集合测试(PLAN v3 · P03)
// 纯内存测试(元素同一性只依赖引用),不需要 DOM 写;真实扩展链的双写消除由既有 E2E 冒烟覆盖。
import type { FillItem, FillResult, FillStats } from './filler';
import type { ContractFillItem } from './control-drivers';
import { buildClaimedTargets, mergeContractFillResult } from './fill-merge';

const failures: string[] = [];
function test(name: string, cond: boolean): void {
  if (!cond) failures.push(name);
}

function emptyResult(): FillResult {
  const stats: FillStats = {
    total: 0, filled: 0, skipped: 0, noMatch: 0, profileEmpty: 0, failed: 0, picker: 0, pickerResumeCount: 0,
  };
  return { stats, items: [] };
}

function fakeEl(): Element {
  return {} as Element;
}

export function runFillMergeTests(): void {
  // 1. filled 契约项追加并计数(契约专有字段不丢统计)
  {
    const el = fakeEl();
    const res = emptyResult();
    const contract: ContractFillItem[] = [{ profilePath: 'education.university', status: 'filled', reason: '代码和显示名称回读一致', el }];
    mergeContractFillResult(res, contract);
    test('P03: 契约 filled 项追加进结果', res.items.length === 1 && res.items[0].status === 'filled' && res.items[0].el === el);
    test('P03: filled 统计与 total 一致', res.stats.filled === 1 && res.stats.total === 1);
  }
  // 2. 同 el 去重:通用结果已含该目标时不重复追加
  {
    const el = fakeEl();
    const res = emptyResult();
    res.items.push({ label: '姓名', field: 'basic.name', status: 'filled', reason: '已填', el });
    res.stats.total = 1;
    res.stats.filled = 1;
    const contract: ContractFillItem[] = [{ profilePath: 'basic.name', status: 'filled', reason: '合同写', el }];
    mergeContractFillResult(res, contract);
    test('P03: 同 el 契约项不重复追加', res.items.length === 1 && res.stats.filled === 1);
  }
  // 3. failed 契约项追加为 failed(目标仍占用,通用链不重写)
  {
    const el = fakeEl();
    const res = emptyResult();
    const contract: ContractFillItem[] = [{ profilePath: 'basic.birthday', status: 'failed', reason: '写入后可见值回读不一致', el }];
    mergeContractFillResult(res, contract);
    test('P03: failed 契约项追加并计数', res.items.length === 1 && res.items[0].status === 'failed' && res.stats.failed === 1 && res.stats.total === 1);
  }
  // 4. picker 等待项:带 pickerContext 的 skipped 追加为 picker;generic 已有同 el picker 时不重复
  {
    const elA = fakeEl();
    const res = emptyResult();
    const contract: ContractFillItem[] = [{
      profilePath: 'education.major', status: 'skipped', reason: '等待学校/专业弹窗驱动成对选择', el: elA,
      pickerContext: { profilePath: 'education.major' },
    }];
    mergeContractFillResult(res, contract);
    test('P03: 契约 picker 等待项追加为 picker', res.items.length === 1 && res.items[0].status === 'picker' && res.stats.picker === 1);
    const elB = fakeEl();
    const res2 = emptyResult();
    res2.items.push({ label: 'p', field: 'education.major', status: 'picker', reason: '通用链等待', el: elB });
    res2.stats.total = 1;
    res2.stats.picker = 1;
    const dup: ContractFillItem[] = [{ profilePath: 'education.major', status: 'skipped', reason: 'x', el: elB, pickerContext: { profilePath: 'education.major' } }];
    mergeContractFillResult(res2, dup);
    test('P03: 同 el picker 不重复追加', res2.items.length === 1 && res2.stats.picker === 1);
  }
  // 5. 无 el(档案为空/控件不存在)不追加,通用链保持既有能力
  {
    const res = emptyResult();
    const contract: ContractFillItem[] = [{ profilePath: 'basic.name', status: 'skipped', reason: '档案为空' }];
    mergeContractFillResult(res, contract);
    test('P03: 无 el 契约项不追加', res.items.length === 0 && res.stats.total === 0);
  }
  // 5b. 合同控件=可见显示框且被通用链记为 noMatch 时,合同 picker 任务仍须追加(兼容合工大教育页实测形态)
  {
    const el = fakeEl();
    const res = emptyResult();
    res.items.push({ label: 'bkbydwShow', field: null, status: 'noMatch', issueCode: 'E1101', el });
    res.stats.total = 1;
    res.stats.noMatch = 1;
    const contract: ContractFillItem[] = [{ profilePath: 'education.university', status: 'skipped', reason: '等待弹窗驱动', el, pickerContext: { profilePath: 'education.university' } }];
    mergeContractFillResult(res, contract);
    test('P03: noMatch 同 el 不阻挡合同 picker 追加', res.items.some((i) => i.status === 'picker' && i.el === el));
  }
  // 5c. 通用链已产生同 el picker 时合同 picker 不重复追加
  {
    const el = fakeEl();
    const res = emptyResult();
    res.items.push({ label: 'x', field: 'education.major', status: 'picker', reason: '通用', el });
    res.stats.total = 1;
    res.stats.picker = 1;
    const contract: ContractFillItem[] = [{ profilePath: 'education.major', status: 'skipped', reason: '等待弹窗驱动', el, pickerContext: { profilePath: 'education.major' } }];
    mergeContractFillResult(res, contract);
    test('P03: 同 el picker 不重复追加', res.items.length === 1 && res.stats.picker === 1);
  }
  // 6. 混合场景:total 重算为 items 长度
  {
    const el1 = fakeEl();
    const el2 = fakeEl();
    const res = emptyResult();
    res.items.push({ label: 'g', field: 'basic.name', status: 'filled', reason: '通用', el: el2 });
    res.stats.total = 1;
    res.stats.filled = 1;
    const contract: ContractFillItem[] = [
      { profilePath: 'education.university', status: 'filled', reason: 'ok', el: el1 },
      { profilePath: 'education.major', status: 'failed', reason: 'bad', el: fakeEl() },
    ];
    mergeContractFillResult(res, contract);
    test('P03: 混合合并 total==items.length', res.stats.total === res.items.length && res.items.length === 3);
  }
  // 7. buildClaimedTargets:filled/failed 占用目标;picker 等待项不占用(由通用 picker 链驱动一次);无 el/普通 skipped 不占用
  {
    const elFilled = fakeEl();
    const elFailed = fakeEl();
    const elPicker = fakeEl();
    const elPlain = fakeEl();
    const set = buildClaimedTargets([
      { profilePath: 'a', status: 'filled', reason: '', el: elFilled },
      { profilePath: 'b', status: 'failed', reason: '', el: elFailed },
      { profilePath: 'c', status: 'skipped', reason: '', el: elPicker, pickerContext: { profilePath: 'c' } },
      { profilePath: 'd', status: 'skipped', reason: '档案为空' },
      { profilePath: 'e', status: 'skipped', reason: '', el: elPlain },
    ]);
    test('P03: 认领集合覆盖 filled/failed', set.has(elFilled) && set.has(elFailed));
    test('P03: 认领集合不覆盖 picker 等待项(通用 picker 链驱动)', !set.has(elPicker) && !set.has(elPlain));
  }
}

export function getFillMergeFailures(): string[] {
  return failures;
}
