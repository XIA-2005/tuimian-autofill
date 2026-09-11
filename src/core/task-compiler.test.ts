// P02 只读候选解析与确定性消歧测试(PLAN v3 · P02)
// 运行方式:由 test/run.ts 注入主测试计数(与 highlight.test.ts 同一模式)。
import { makeDom } from '../../test/regression/observer';
import {
  bestMatchedBranch,
  collectAdapterPackageCandidates,
  collectAdapterPageCandidates,
  comparePackageCandidates,
  resolveAdapterPage,
} from './adapter-packages';
import type { AdapterCapabilities, AdapterFieldContract, AdapterPageContract, SchoolAdapterPackage } from './adapters';
import { collectComponentDropdownCandidates, detectComponentDropdownFields } from './matcher';
import { collectContractFieldCandidates } from './task-compiler';

const failures: string[] = [];
function test(name: string, cond: boolean): void {
  if (!cond) failures.push(name);
}

function mkPkg(id: string, hosts: string[], pathPatterns: string[], pages: AdapterPageContract[] = []): SchoolAdapterPackage {
  const caps: AdapterCapabilities = { registerFill: 'directory', formFill: 'experimental', pluginExtract: 'experimental', sessionCrawl: 'directory' };
  return {
    schemaVersion: 1,
    id,
    version: 'test.1',
    minCoreVersion: '2.0.0',
    schoolName: id,
    programName: '测试项目',
    family: 'other',
    match: { hosts, pathPatterns },
    capabilities: caps,
    pages,
    crawl: { mode: 'guided', pageOrder: pages.map((p) => p.id) },
    projectionPolicy: 'default',
    codeNamespaces: [`adapter:${id}`],
    commitPolicy: 'manual-save-only',
  };
}

function mkField(partial: Partial<AdapterFieldContract> & Pick<AdapterFieldContract, 'driver'>): AdapterFieldContract {
  return { profilePath: 'basic.name', ...partial };
}

const URL_EXACT = 'https://gsapp.example.edu.cn/tmybm/tbgrxx.do';
const URL_WIDE = 'https://sub.example.edu.cn/tmybm/tbgrxx.do';

export function runTaskCompilerTests(): void {
  // ===== 1. 包评分:只按实际命中分支,精确 host > 子域通配;无关 host 数量不参与计分 =====
  const exactPkg = mkPkg('exact', ['gsapp.example.edu.cn'], ['*/tmybm/*']);
  const subPkg = mkPkg('sub', ['*.example.edu.cn', '*.unrelated.edu.cn', '*.other.edu.cn', '*.more.edu.cn', '*.extra.edu.cn'], ['*/tmybm/*']);
  const winnerExact = collectAdapterPackageCandidates(URL_EXACT, [subPkg, exactPkg]);
  test('P02: 精确 host 胜出(与数组顺序无关)', winnerExact.winner?.pkg.id === 'exact');
  test('P02: 无关 host 数量不改变排名', winnerExact.candidates[0]?.pkg.id === 'exact' && !winnerExact.ambiguous);
  const branch = bestMatchedBranch(subPkg, URL_EXACT);
  test('P02: 子域包命中精确 host URL 时为 subdomain 阶梯(阶梯语义)', branch?.hostTier === 'subdomain' && branch.pkg.id === 'sub');
  const wideWinner = collectAdapterPackageCandidates(URL_WIDE, [exactPkg, subPkg]);
  test('P02: 通配子域包在子域 URL 上命中', wideWinner.winner?.pkg.id === 'sub');

  // ===== 2. 路径具体程度:字面量更长优先,通配更少优先 =====
  const broadPkg = mkPkg('broad', ['gsapp.example.edu.cn'], ['*']);
  const deepPkg = mkPkg('deep', ['gsapp.example.edu.cn'], ['*/tmybm/*']);
  const deepWinner = collectAdapterPackageCandidates(URL_EXACT, [deepPkg, broadPkg]);
  test('P02: 更长字面量路径优先', deepWinner.winner?.pkg.id === 'deep');
  const a = bestMatchedBranch(broadPkg, URL_EXACT);
  const b = bestMatchedBranch(deepPkg, URL_EXACT);
  test('P02: comparePackageCandidates 与预期方向一致', !!a && !!b && comparePackageCandidates(a, b) > 0);

  // ===== 3. 同等级歧义:两个不同包完全同分 → ambiguous =====
  const twin1 = mkPkg('twin-a', ['gsapp.example.edu.cn'], ['*/tmybm/*']);
  const twin2 = mkPkg('twin-b', ['gsapp.example.edu.cn'], ['*/tmybm/*']);
  const twinRes = collectAdapterPackageCandidates(URL_EXACT, [twin1, twin2]);
  test('P02: 同等级双包标记歧义', twinRes.ambiguous === true);
  test('P02: 同等级双包仍给出确定性 winner(非随机)', !!twinRes.winner);

  // ===== 4. 页面候选:唯一 allowed 与歧义 =====
  const pageA: AdapterPageContract = { id: 'a', name: 'A页', pathPatterns: ['*/tmybm/*'], role: 'form' };
  const pageB: AdapterPageContract = { id: 'b', name: 'B页', pathPatterns: ['*/tmybm/*'], role: 'form' };
  const bothPkg = mkPkg('pages', ['gsapp.example.edu.cn'], ['*/tmybm/*'], [pageA, pageB]);
  {
    const { doc } = makeDom('<html><head><title>报名</title></head><body><input name="xm"></body></html>', URL_EXACT);
    const amb = resolveAdapterPage(bothPkg, doc, URL_EXACT);
    test('P02: 两个同分 allowed 页面 → 歧义', amb.ambiguous === true);
    test('P02: 页面歧义不选数组第一个当胜利者之外的隐藏页', amb.candidates.length === 2);
    const reqB: AdapterPageContract = { ...pageB, requiredSelectors: ['[name="xm"]'] };
    const reqPkg = mkPkg('pages2', ['gsapp.example.edu.cn'], ['*/tmybm/*'], [pageA, reqB]);
    const uniq = resolveAdapterPage(reqPkg, doc, URL_EXACT);
    test('P02: 必需选择器证据唯一消歧到 B 页', uniq.winner?.page.id === 'b' && uniq.ambiguous === false);
    test('P02: 全量候选保留诊断信息', collectAdapterPageCandidates(reqPkg, doc, URL_EXACT).length === 2);
  }

  // ===== 5. 控件候选:回退链、歧义、radio 成组、nativeId =====
  {
    const { doc } = makeDom(
      '<html><body>' +
      '<input name="a1" id="dup"><input name="a2" id="dup">' + // 重复 id
      '<input name="b1" id="b1">' + // 唯一 id 的普通控件
      '<input type="radio" name="sex" value="1"><input type="radio" name="sex" value="2">' + // 合法 radio 组
      '<input name="c1">' +
      '</body></html>',
      URL_EXACT,
    );
    const fb = mkField({ driver: 'text', selectors: ['[name="nope"]', '[name="c1"]'] });
    const fbRes = collectContractFieldCandidates(fb, doc);
    test('P02: 有序回退链在 A 缺失时使用 B', fbRes.reason === 'ok' && fbRes.expressionUsed === '[name="c1"]' && fbRes.logicalTargets.length === 1);
    const multi = mkField({ driver: 'text', selectors: ['[name^="a"]'] });
    const multiRes = collectContractFieldCandidates(multi, doc);
    test('P02: 单表达式命中多控件 → 真歧义(不取第一个)', multiRes.ambiguous === true && multiRes.reason === 'multiple');
    const radioField = mkField({ driver: 'radio', selectors: ['input[name="sex"]'] });
    const radioRes = collectContractFieldCandidates(radioField, doc);
    test('P02: radio 同 name 成组折叠为一个逻辑目标', radioRes.reason === 'ok' && radioRes.logicalTargets.length === 1);
    const dupNative = mkField({ driver: 'text', nativeId: 'dup' });
    const dupRes = collectContractFieldCandidates(dupNative, doc);
    test('P02: 重复 nativeId → 歧义', dupRes.nativeIdUsed === true && dupRes.ambiguous === true);
    const uniqueNative = mkField({ driver: 'text', nativeId: 'b1' });
    const uniqueRes = collectContractFieldCandidates(uniqueNative, doc);
    test('P02: nativeId 精确唯一命中即返回', uniqueRes.nativeIdUsed === true && uniqueRes.reason === 'ok' && uniqueRes.logicalTargets.length === 1);
    const noSel = mkField({ driver: 'text' });
    const noRes = collectContractFieldCandidates(noSel, doc);
    test('P02: 无 nativeId/selectors → no-selector 明确返回', noRes.reason === 'no-selector');
  }

  // ===== 6. 组件下拉:collect 纯只读;detect 执行期标记(行为保持) =====
  {
    const html =
      '<html><body><table><tr>' +
      '<td>政治面貌</td>' +
      '<td><div class="jqx-widget jqx-dropdownlist" role="combobox"><span>请选择</span><input type="hidden" name="zzmmcode"></div></td>' +
      '</tr></table></body></html>';
    const { doc } = makeDom(html, URL_EXACT);
    const pure = collectComponentDropdownCandidates(doc);
    test('P02: collect 识别出组件候选', pure.length === 1);
    test('P02: collect 不写 data-tui 属性(影子编译安全)', !doc.querySelector('[data-tui-widget]'));
    const detected = detectComponentDropdownFields(doc);
    test('P02: detect 复用 collect 后行为一致(返回 1 字段)', detected.length === 1);
    test('P02: detect 执行期打标(值载体+触发本体)', !!doc.querySelector('[data-tui-widget="dropdown"]') && !!doc.querySelector('[data-tui-widget="dropdown-value"]'));
  }

  // ===== 7. 只读原则:包/页/控件解析全程无 DOM 属性与值变化 =====
  {
    const { doc } = makeDom('<html><head><title>报名</title></head><body><input name="xm" value=""></body></html>', URL_EXACT);
    const field = mkField({ driver: 'text', selectors: ['[name="xm"]'] });
    const r = collectContractFieldCandidates(field, doc);
    const input = doc.querySelector('[name="xm"]') as HTMLInputElement;
    test('P02: 候选解析不改控件值', input.value === '' && !!r.logicalTargets.length);
    test('P02: 候选解析不加属性', input.getAttribute('data-tui') === null);
  }
}

export function getTaskCompilerFailures(): string[] {
  return failures;
}
