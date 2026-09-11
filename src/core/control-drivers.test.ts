// F01/F02 生产合同链负例与保护测试(接入 npm test)
// Q03:重复 id 在真实 fillAdapterContract 链中不得写第一个;唯一目标仍填;radio 组不误阻塞。
import { makeDomIsolated } from '../../test/regression/observer';
import { emptyProfile } from './profile';
import type { Profile } from './profile';
import { fillAdapterContract } from './control-drivers';
import { validateAdapterPackage } from './adapter-packages';
import type { AdapterCapabilities, AdapterFieldContract, AdapterPageContract, SchoolAdapterPackage } from './adapters';

const failures: string[] = [];
function test(name: string, cond: boolean): void {
  if (!cond) failures.push(name);
}

function mkAdapter(pages: AdapterPageContract[], id = 'neg-test'): SchoolAdapterPackage {
  const caps: AdapterCapabilities = { registerFill: 'directory', formFill: 'experimental', pluginExtract: 'experimental', sessionCrawl: 'directory' };
  return {
    schemaVersion: 1,
    id,
    version: 'test.1',
    minCoreVersion: '2.0.0',
    schoolName: '负例测试校',
    programName: '测试项目',
    family: 'other',
    match: { hosts: ['neg.example.edu.cn'], pathPatterns: ['*/tmybm/*'] },
    capabilities: caps,
    pages,
    crawl: { mode: 'guided', pageOrder: pages.map((p) => p.id) },
    projectionPolicy: 'default',
    codeNamespaces: [`adapter:${id}`],
    commitPolicy: 'manual-save-only',
  };
}

function withName(profile: Profile, name: string): Profile {
  profile.basic.name = name;
  return profile;
}

export function runContractGuardTests(): void {
  const URL = 'https://neg.example.edu.cn/tmybm/tbgrxx.do';
  // Q03:重复 id → 两个输入都不得被写(歧义拒绝猜测)。
  {
    const ctx = makeDomIsolated('<html><body><input id="dup" name="a1"><input id="dup" name="a2"></body></html>', URL);
    const field: AdapterFieldContract = { profilePath: 'basic.name', nativeId: 'dup', driver: 'text' };
    const adapter = mkAdapter([{ id: 'form', name: '表单', pathPatterns: ['*/tmybm/*'], role: 'form', fields: [field] }]);
    const res = fillAdapterContract(withName(emptyProfile(), '张三'), ctx.doc, URL, adapter);
    const a1 = ctx.doc.querySelector('[name="a1"]') as HTMLInputElement;
    const a2 = ctx.doc.querySelector('[name="a2"]') as HTMLInputElement;
    test('F01(Q03): 重复 nativeId 返回失败项(歧义)', res.length === 1 && res[0].status === 'failed' && /歧义/.test(res[0].reason));
    test('F01(Q03): 重复 id 的两个输入均未被写入', a1.value === '' && a2.value === '');
    ctx.restore();
  }
  // 唯一目标仍写(selector 唯一)。
  {
    const ctx = makeDomIsolated('<html><body><input name="xm"></body></html>', URL);
    const field: AdapterFieldContract = { profilePath: 'basic.name', selectors: ['[name="xm"]'], driver: 'text' };
    const adapter = mkAdapter([{ id: 'form', name: '表单', pathPatterns: ['*/tmybm/*'], role: 'form', fields: [field] }]);
    const res = fillAdapterContract(withName(emptyProfile(), '张三'), ctx.doc, URL, adapter);
    const xm = ctx.doc.querySelector('[name="xm"]') as HTMLInputElement;
    test('F01: 唯一 selector 目标正常写入', res.length === 1 && res[0].status === 'filled' && xm.value === '张三');
    ctx.restore();
  }
  // radio 组:同一 name 多节点合法成组,不误判歧义;已选不同值不覆盖(F02/Q05)。
  {
    const ctx = makeDomIsolated('<html><body><label>性别</label><input type="radio" name="xb" value="女" checked><input type="radio" name="xb" value="男"></body></html>', URL);
    const field: AdapterFieldContract = { profilePath: 'basic.gender', selectors: ['input[name="xb"]'], driver: 'radio' };
    const adapter = mkAdapter([{ id: 'form', name: '表单', pathPatterns: ['*/tmybm/*'], role: 'form', fields: [field] }]);
    const profile = emptyProfile();
    profile.basic.gender = '男';
    const res = fillAdapterContract(profile, ctx.doc, URL, adapter);
    const male = ctx.doc.querySelector('input[value="男"]') as HTMLInputElement;
    const female = ctx.doc.querySelector('input[value="女"]') as HTMLInputElement;
    test('F02(Q05): 已选不同值被保留(radio 不覆盖)', res.length === 1 && res[0].status === 'skipped' && male.checked === false && female.checked === true);
    ctx.restore();
  }
  // 同值零写入零事件(F02/Q02):已填相同文本。
  {
    const ctx = makeDomIsolated('<html><body><input name="xm" value="张三"></body></html>', URL);
    const field: AdapterFieldContract = { profilePath: 'basic.name', selectors: ['[name="xm"]'], driver: 'text' };
    const adapter = mkAdapter([{ id: 'form', name: '表单', pathPatterns: ['*/tmybm/*'], role: 'form', fields: [field] }]);
    const res = fillAdapterContract(withName(emptyProfile(), '张三'), ctx.doc, URL, adapter);
    const xm = ctx.doc.querySelector('[name="xm"]') as HTMLInputElement;
    test('F02(Q02): 同值合同路径跳过写入且值不变', res.length === 1 && res[0].status === 'skipped' && xm.value === '张三');
    ctx.restore();
  }
  // 页面歧义:两个同分 allowed 页面 → 合同整体拒绝(不静默取首)。
  {
    const ctx = makeDomIsolated('<html><head><title>报名</title></head><body><input name="xm"></body></html>', URL);
    const pageA: AdapterPageContract = { id: 'a', name: 'A', pathPatterns: ['*/tmybm/*'], role: 'form', fields: [{ profilePath: 'basic.name', selectors: ['[name="xm"]'], driver: 'text' }] };
    const pageB: AdapterPageContract = { id: 'b', name: 'B', pathPatterns: ['*/tmybm/*'], role: 'form', fields: [{ profilePath: 'basic.phone', selectors: ['[name="xm"]'], driver: 'text' }] };
    const adapter = mkAdapter([pageA, pageB], 'neg-ambig');
    const res = fillAdapterContract(withName(emptyProfile(), '张三'), ctx.doc, URL, adapter);
    const xm = ctx.doc.querySelector('[name="xm"]') as HTMLInputElement;
    test('F01: 同分页面歧义 → 合同拒绝且不写', res.length === 0 && xm.value === '');
    ctx.restore();
  }
}

export function runDependencyContractTests(): void {
  const URL = 'https://neg.example.edu.cn/tmybm/tbgrxx.do';
  // F08b:父字段失败 → 依赖者被跳过;独立字段照常填写;顺序为拓扑序。
  {
    const ctx = makeDomIsolated(
      '<html><body>' +
      '<input name="prov"><input name="city"><input name="name">' +
      '</body></html>',
      URL,
    );
    const fields: AdapterFieldContract[] = [
      // 父字段:页面不存在该控件 → failed
      { profilePath: 'education.province', selectors: ['[name="province-missing"]'], driver: 'text' },
      { profilePath: 'education.major', selectors: ['[name="city"]'], driver: 'text', dependsOn: ['education.province'] },
      { profilePath: 'basic.name', selectors: ['[name="name"]'], driver: 'text' },
    ];
    const adapter = mkAdapter([{ id: 'form', name: '表单', pathPatterns: ['*/tmybm/*'], role: 'form', fields }], 'dep-test');
    const profile = emptyProfile();
    profile.education.province = '陕西省';
    profile.education.major = '软件工程';
    profile.basic.name = '张三';
    const res = fillAdapterContract(profile, ctx.doc, URL, adapter);
    const city = ctx.doc.querySelector('[name="city"]') as HTMLInputElement;
    const name = ctx.doc.querySelector('[name="name"]') as HTMLInputElement;
    const provinceItem = res.find((r) => r.profilePath === 'education.province');
    const majorItem = res.find((r) => r.profilePath === 'education.major');
    test('F08b: 父字段失败被记录', !!provinceItem && provinceItem.status === 'failed');
    test('F08b: 依赖字段被跳过且不写入', !!majorItem && majorItem.status === 'skipped' && city.value === '');
    test('F08b: 独立字段照常填写', name.value === '张三' && res.some((r) => r.profilePath === 'basic.name' && r.status === 'filled'));
    ctx.restore();
  }
  // F08b:环在契约校验期被拒绝(不死循环)。
  {
    const caps: AdapterCapabilities = { registerFill: 'directory', formFill: 'experimental', pluginExtract: 'experimental', sessionCrawl: 'directory' };
    const cyclic: SchoolAdapterPackage = {
      schemaVersion: 1, id: 'cycle-test', version: 't', minCoreVersion: '2.0.0', schoolName: 'c', programName: 'p', family: 'other',
      match: { hosts: ['neg.example.edu.cn'], pathPatterns: ['*/tmybm/*'] },
      capabilities: caps,
      pages: [{ id: 'f', name: 'f', pathPatterns: ['*/tmybm/*'], role: 'form', fields: [
        { profilePath: 'basic.name', selectors: ['[name="name"]'], driver: 'text', dependsOn: ['education.major'] },
        { profilePath: 'education.major', selectors: ['[name="city"]'], driver: 'text', dependsOn: ['basic.name'] },
      ] }],
      crawl: { mode: 'guided', pageOrder: ['f'] }, projectionPolicy: 'default', commitPolicy: 'manual-save-only',
    };
    let rejected = false;
    try {
      validateAdapterPackage(cyclic);
    } catch {
      rejected = true;
    }
    test('F08b: 依赖环在契约校验期被拒绝', rejected);
  }
  // F08b:缺依赖引用被拒绝。
  {
    const caps: AdapterCapabilities = { registerFill: 'directory', formFill: 'experimental', pluginExtract: 'experimental', sessionCrawl: 'directory' };
    const missing: SchoolAdapterPackage = {
      schemaVersion: 1, id: 'missing-dep', version: 't', minCoreVersion: '2.0.0', schoolName: 'c', programName: 'p', family: 'other',
      match: { hosts: ['neg.example.edu.cn'], pathPatterns: ['*/tmybm/*'] },
      capabilities: caps,
      pages: [{ id: 'f', name: 'f', pathPatterns: ['*/tmybm/*'], role: 'form', fields: [
        { profilePath: 'basic.name', selectors: ['[name="name"]'], driver: 'text', dependsOn: ['ghost.field'] },
      ] }],
      crawl: { mode: 'guided', pageOrder: ['f'] }, projectionPolicy: 'default', commitPolicy: 'manual-save-only',
    };
    let rejected = false;
    try {
      validateAdapterPackage(missing);
    } catch {
      rejected = true;
    }
    test('F08b: 缺依赖引用被拒绝', rejected);
  }
}

export function getContractGuardFailures(): string[] {
  return failures;
}
