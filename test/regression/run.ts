// 本地回归运行器(PLAN v3 · P01)
// 入口:npm run test:regression(=node build.mjs && node test/regression/run.js)
// 原则:直接调用生产导入函数(src/core/filler.fillAll / clearPageFill);禁止网络;观测副作用而非复制逻辑。
// 期望语义:hard 样本失败 => 退出码 1;baseline-defect 样本按"红项清单"显式报告,由 ownerTask 卡接管后转 hard。
import { readFileSync } from 'node:fs';
import { beginWriteScope, clearPageFill, conditionalRestore, endWriteScope, fillAll, getBeforeValue, getOwnedValue } from '../../src/core/filler';
import type { FillResult } from '../../src/core/filler';
import { captureRunSnapshot } from '../../src/core/fill-session';
import { SAMPLES, E2E_SAMPLE_ID } from './samples';
import { controlState, elementId, instrument, makeDomIsolated, prefillForm, writeControl, silentWrite, snapshotControls, controlsByName } from './observer';
import type { Observer } from './observer';

// ============ 断言与报告脚手架 ============
let hardFailed = 0;
let hardPassed = 0;
const defects: string[] = [];
const defectAbsent: string[] = [];
const infos: string[] = [];

function hardOk(text: string): void {
  hardPassed += 1;
  console.log('PASS: ' + text);
}
function hardFail(text: string): void {
  hardFailed += 1;
  console.error('FAIL: ' + text);
}
function defect(text: string): void {
  defects.push(text);
  console.error('DEFECT(预期红项,ownerTask 接管后转 hard): ' + text);
}
function defectGone(text: string): void {
  defectAbsent.push(text);
  console.warn('WARN(缺陷未复现,需复核是否已提前修复): ' + text);
}
function info(text: string): void {
  infos.push(text);
  console.log('INFO: ' + text);
}

// ============ 样本执行 ============

/** 功能:统计某控件的 input+change 事件数(自观测起点)。 */
function evCount(obs: Observer, name: string): number {
  return obs.countsSince(null, name, 'input').events + obs.countsSince(null, name, 'change').events;
}

/** 功能:统计某控件的 click 事件数。 */
function clickCount(obs: Observer, name: string): number {
  return obs.countsSince(null, name, 'click').events;
}

function runBasicSafety(): void {
  const restores: Array<() => void> = [];
  const sample = SAMPLES.find((s) => s.id === 'basic-safety');
  if (!sample || !sample.html) throw new Error('样本 basic-safety 缺失');
  const domCtx = makeDomIsolated(sample.html, sample.logicalUrl);
    const doc = domCtx.doc;
    restores.push(domCtx.restore);
  prefillForm(doc, sample.prefill || {});
  const obs = instrument(doc);
  const before = snapshotControls(doc);

  // 生产导入:一键填充主体(普通字段;不含 content 层 picker/行任务编排)。
  const res: FillResult = fillAll(sample.profile, doc);
  const after = snapshotControls(doc);
  info(`basic-safety: fillAll stats filled=${res.stats.filled} total=${res.stats.total}`);

  // mustWrite:该写的写对。
  const mustWrite: Array<[string, string]> = [
    ['xm', '张三'],
    ['sfzh', '210211200305011233'],
    ['sjh', '13800000000'],
    ['email', 'zhangsan@example.com'],
    ['byyx', '大连理工大学'],
    ['zy', '软件工程'],
    ['pm', '5'],
    ['pmrs', '120'],
    ['jxlxr', '张父'],
    ['jxlxrdh', '13900000000'],
    ['xb', '男'],
    ['mz', '汉族'],
    ['zzmm', '共青团员'],
  ];
  for (const [name, expected] of mustWrite) {
    const cur = controlState(doc, name).value;
    if (cur === expected) hardOk(`basic-safety: [${name}] 写对 = ${expected}`);
    else hardFail(`basic-safety: [${name}] 期望 ${expected} 实际 ${JSON.stringify(cur)}`);
  }
  // R23:锁定档案仍可用于填网页(姓名/学校在 fieldStates 中 locked)。
  if (controlState(doc, 'xm').value === '张三' && controlState(doc, 'byyx').value === '大连理工大学') {
    hardOk('basic-safety(R23): 锁定档案值仍被用于填网页(锁定≠禁止填写)');
  } else {
    hardFail('basic-safety(R23): 锁定档案值未能用于填写');
  }
  // R05:带"请选择"占位 option 的 select 应被视为空并允许写入(上面 xb/mz/zzmm 已覆盖)。
  // mustPreserve:未触碰字段与 hidden token 保持原值。
  const preserve: Array<[string, string]> = [
    ['keepX', '手动内容'],
    ['token', 'abc123'],
  ];
  for (const [name, expected] of preserve) {
    const cur = controlState(doc, name).value;
    if (cur === expected) hardOk(`basic-safety: 保留 [${name}] = ${expected}`);
    else hardFail(`basic-safety: 保留 [${name}] 期望 ${expected} 实际 ${JSON.stringify(cur)}`);
  }
  // R24:密码/验证码不写;hidden token 事件为 0。
  for (const name of ['pwd', 'yzm']) {
    const cur = controlState(doc, name).value;
    if (cur === '') hardOk(`basic-safety(R24): [${name}] 未填写`);
    else hardFail(`basic-safety(R24): [${name}] 被填写为 ${JSON.stringify(cur)}`);
    const evs = evCount(obs, name);
    if (evs === 0) hardOk(`basic-safety(R24): [${name}] 无 input/change 事件`);
    else hardFail(`basic-safety(R24): [${name}] 发生 ${evs} 次写事件`);
  }
  // R24:下一步/提交/新增行按钮零点击。
  for (const name of ['btnNext', 'btnSubmit', 'btnAddRow']) {
    const clicks = clickCount(obs, name);
    if (clicks === 0) hardOk(`basic-safety(R24): ${name} 未被点击`);
    else hardFail(`basic-safety(R24): ${name} 被点击 ${clicks} 次`);
  }
  // 记录留存:任何既有值被本轮填充改动(除已声明 mustWrite 之外的 name)。
  const declared = new Set<string>([...mustWrite.map(([n]) => n), ...preserve.map(([n]) => n), 'pwd', 'yzm', 'token', 'keepX', 'csrq']);
  const unexpected: string[] = [];
  for (const [, snap] of after) {
    const name = snap.name;
    if (declared.has(name)) continue;
    const beforeSnap = before.get(snap.el);
    if (beforeSnap && snap.value !== beforeSnap.value && snap.value !== '') {
      unexpected.push(`${name}:${beforeSnap.value}->${snap.value}`);
    }
  }
  if (unexpected.length === 0) hardOk('basic-safety: 无声明外控件被写入');
  else hardFail(`basic-safety: 声明外控件被写入 ${unexpected.join(', ')}`);

  restores.forEach((fn) => fn());

}

function runExistingValueConflict(): void {
  const restores: Array<() => void> = [];
  const sample = SAMPLES.find((s2) => s2.id === 'existing-value-conflict');
  if (!sample || !sample.html) throw new Error('样本 existing-value-conflict 缺失');
  const domCtx = makeDomIsolated(sample.html, sample.logicalUrl);
    const doc = domCtx.doc;
    restores.push(domCtx.restore);
  prefillForm(doc, sample.prefill || {});
  fillAll(sample.profile, doc);

  // R04(P04 已实现,hard):已有非空不同值必须保留;独立字段继续可填。
  const preserved = ['xm', 'sjh', 'byyx'];
  const pre = sample.prefill || {};
  for (const name of preserved) {
    const cur = controlState(doc, name).value;
    if (cur === pre[name]) hardOk(`existing-value-conflict(R04): [${name}] 已有值 ${pre[name]} 已保留(conflict/preserve)`);
    else hardFail(`existing-value-conflict(R04): [${name}] 期望保留 ${pre[name]} 实际 ${JSON.stringify(cur)}`);
  }
  // 独立字段继续:pm(空)应正常写入档案值 5。
  if (controlState(doc, 'pm').value === '5') hardOk('existing-value-conflict(R04): 独立字段 pm 不受冲突影响,照常填写');
  else hardFail(`existing-value-conflict(R04): 独立字段 pm 期望 5 实际 ${JSON.stringify(controlState(doc, 'pm').value)}`);
  // 无规则字段不被触碰(hard)。
  if (controlState(doc, 'keepX').value === '手动内容') hardOk('existing-value-conflict: 无规则字段 keepX 未被触碰');
  else hardFail(`existing-value-conflict: keepX 被改动为 ${controlState(doc, 'keepX').value}`);
  // 语义诱饵(导师联系电话):matcher 无"导师"负词,今日仍会误填 —— 登记为缺陷,owner=P10b(matcher 语义)。
  const bait = controlState(doc, 'dsdh').value;
  if (bait !== '') defect(`existing-value-conflict: 语义诱饵 dsdh 仍被写入 ${bait}(owner=P10b:basic.phone 规则需补"导师/推荐人"类负词)`);
  else hardOk('existing-value-conflict: 语义诱饵 dsdh 未被写入');

  restores.forEach((fn) => fn());

}

function runSameValueNoop(): void {
  const restores: Array<() => void> = [];
  const sample = SAMPLES.find((s2) => s2.id === 'same-value-noop');
  if (!sample || !sample.html) throw new Error('样本 same-value-noop 缺失');
  // 场景 1:预置相同值 → 零事件(alreadyCorrect,P04 已实现,hard)。
  {
    const domCtx = makeDomIsolated(sample.html, sample.logicalUrl);
    const doc = domCtx.doc;
    restores.push(domCtx.restore);
    prefillForm(doc, sample.prefill || {});
    const obs = instrument(doc);
    fillAll(sample.profile, doc);
    for (const name of ['xm', 'sjh', 'email']) {
      const evs = evCount(obs, name);
      if (evs === 0) hardOk(`same-value-noop(R03): [${name}] 相同值零写事件(alreadyCorrect)`);
      else hardFail(`same-value-noop(R03): [${name}] 相同值仍触发 ${evs} 次写事件`);
      const cur = controlState(doc, name).value;
      if (cur === sample.prefill?.[name]) hardOk(`same-value-noop: [${name}] 值保持 ${cur}`);
      else hardFail(`same-value-noop: [${name}] 值变化为 ${JSON.stringify(cur)}`);
    }
    // 清除所有权:alreadyCorrect 项未写入 → 清除后值保留(不被误清)。
    const cleared = clearPageFill(doc);
    info(`same-value-noop: 场景1 clearPageFill 清除 ${cleared} 项`);
    if (controlState(doc, 'xm').value === '张三') hardOk('same-value-noop(R23): alreadyCorrect 值不被"清除本页"误清');
    else hardFail(`same-value-noop(R23): xm 清除后=${JSON.stringify(controlState(doc, 'xm').value)}(应为 张三)`);
  }
  // 场景 2:写入后用户手工修改 → 清除保留用户值(P04 所有权,hard)。
  {
    const domCtx = makeDomIsolated(sample.html, sample.logicalUrl);
    const doc = domCtx.doc;
    restores.push(domCtx.restore);
    const obs = instrument(doc);
    fillAll(sample.profile, doc);
    if (controlState(doc, 'pm').value === '5') hardOk('same-value-noop: 空字段 pm 已写入(建立所有权)');
    else hardFail('same-value-noop: pm 未写入');
    writeControl(doc, 'pm', '99', true);
    const cleared = clearPageFill(doc);
    info(`same-value-noop: 场景2 clearPageFill 清除 ${cleared} 项`);
    if (controlState(doc, 'pm').value === '99') hardOk('same-value-noop(R23): 用户后改值在清除后保留(所有权让渡)');
    else hardFail(`same-value-noop(R23): 用户后改值被清除为 ${JSON.stringify(controlState(doc, 'pm').value)}`);
    if (controlState(doc, 'xm').value === '' && controlState(doc, 'sjh').value === '') hardOk('same-value-noop: 本轮写入且未被改动的字段被正常清除');
    else hardFail(`same-value-noop: 写入字段清除不完整 xm=${JSON.stringify(controlState(doc, 'xm').value)} sjh=${JSON.stringify(controlState(doc, 'sjh').value)}`);
    void obs;
  }
  // 场景 4(P07):写前快照与有条件恢复——未知状态不自动恢复;回到原值视为已恢复。
  {
    const domCtx = makeDomIsolated(sample.html, sample.logicalUrl);
    const doc = domCtx.doc;
    restores.push(domCtx.restore);
    // H02:写入记录与恢复绑定同一原轮 ctx(直接调用 fillAll 时须显式登记写入作用域)。
    const runCtx = captureRunSnapshot(doc, doc.location.href, 'reg-same-value-noop');
    beginWriteScope(doc, runCtx);
    fillAll(sample.profile, doc);
    endWriteScope();
    const xmEl = doc.querySelector('[name="xm"]') as HTMLInputElement;
    if (getBeforeValue(doc, xmEl) === '') hardOk('same-value-noop(P07): 写前快照保存了空态');
    else hardFail('same-value-noop(P07): 写前快照缺失');
    if (getOwnedValue(doc, xmEl) === '张三') hardOk('same-value-noop(P07): 写后快照为写入值');
    else hardFail('same-value-noop(P07): 写后快照异常');
    // 页面脚本把字段改成第三种状态 → 来源不确定,不自动恢复。
    writeControl(doc, 'xm', 'ZZZ未知态', false);
    const verdictUnknown = conditionalRestore(doc, xmEl, runCtx);
    if (verdictUnknown === 'notAttempted' && controlState(doc, 'xm').value === 'ZZZ未知态') hardOk('same-value-noop(P07): 来源不确定不自动恢复(保留现状)');
    else hardFail(`same-value-noop(P07): 未知态被自动处理(verdict=${verdictUnknown})`);
    // 页面把值重置回写前空态 → 已恢复(无动作路径)。
    writeControl(doc, 'xm', '', false);
    const verdictBack = conditionalRestore(doc, xmEl, runCtx);
    // G06:页面已回原值 → alreadyRestored(无动作,不作为"实际执行恢复"的证据)。
    if (verdictBack === 'alreadyRestored' && controlState(doc, 'xm').value === '') hardOk('same-value-noop(G06): 回到原值判定为 alreadyRestored(无动作)');
    else hardFail(`same-value-noop(G06): 原值恢复判定异常(verdict=${verdictBack})`);
    // Q07:脱离文档的节点不恢复(即使有写前快照)。
    const emailEl = doc.querySelector('[name="email"]') as HTMLInputElement;
    if (getBeforeValue(doc, emailEl) === '') hardOk('same-value-noop(P07/Q07): email 存在写前空态快照');
    else hardFail('same-value-noop(P07/Q07): email 写前快照缺失');
    const detachedValBefore = emailEl.value;
    emailEl.remove();
    const detachedVerdict = conditionalRestore(doc, emailEl, runCtx);
    if (detachedVerdict === 'notAttempted') hardOk('same-value-noop(P07/Q07): 脱离文档节点不自动恢复');
    else hardFail(`same-value-noop(P07/Q07): 脱离节点被恢复(verdict=${detachedVerdict})`);
    void detachedValBefore;
  }
  // 场景 3:写入后未改动 → 清除归零(原有清除能力保留,hard)。
  {
    const domCtx = makeDomIsolated(sample.html, sample.logicalUrl);
    const doc = domCtx.doc;
    restores.push(domCtx.restore);
    prefillForm(doc, { keepX: '手动内容' });
    fillAll(sample.profile, doc);
    const cleared = clearPageFill(doc);
    info(`same-value-noop: 场景3 clearPageFill 清除 ${cleared} 项`);
    if (controlState(doc, 'xm').value === '' && controlState(doc, 'pm').value === '') hardOk('same-value-noop(R23): 本轮写入且未改动的字段可被清除');
    else hardFail(`same-value-noop(R23): 清除后残留 xm=${JSON.stringify(controlState(doc, 'xm').value)} pm=${JSON.stringify(controlState(doc, 'pm').value)}`);
    if (controlState(doc, 'keepX').value === '手动内容') hardOk('same-value-noop: 无规则字段在清除后保留');
    else hardFail('same-value-noop: keepX 清除后丢失');
  }

  restores.forEach((fn) => fn());

}


function runRepeatFillOwnership(): void {
  const sample = SAMPLES.find((s2) => s2.id === 'same-value-noop');
  if (!sample || !sample.html) throw new Error('样本缺失');
  const restores: Array<() => void> = [];
  // 场景 A(Q06):填 → 同值再填 → 清除可清理自动写入(所有权跨轮延续)。
  {
    const domCtx = makeDomIsolated(sample.html, sample.logicalUrl);
    restores.push(domCtx.restore);
    const doc = domCtx.doc;
    fillAll(sample.profile, doc);
    fillAll(sample.profile, doc);
    const cleared = clearPageFill(doc);
    const xm = controlState(doc, 'xm').value;
    if (cleared > 0 && xm === '') hardOk('F03(Q06a): 填→同值再填→清除可清理(所有权跨轮延续)');
    else hardFail(`F03(Q06a): 清除异常 cleared=${cleared} xm=${JSON.stringify(xm)}`);
  }
  // 场景 B:两轮间用户改动,再填(冲突保留)后清除仍保留用户值。
  {
    const domCtx = makeDomIsolated(sample.html, sample.logicalUrl);
    restores.push(domCtx.restore);
    const doc = domCtx.doc;
    fillAll(sample.profile, doc);
    writeControl(doc, 'email', 'user@edited.example', true);
    fillAll(sample.profile, doc);
    const cleared = clearPageFill(doc);
    const email = controlState(doc, 'email').value;
    if (email === 'user@edited.example') hardOk('F03(Q06b): 用户后改值在再次填充与清除后均保留');
    else hardFail(`F03(Q06b): 用户后改值丢失(${JSON.stringify(email)}, cleared=${cleared})`);
  }
  restores.forEach((fn) => fn());
}

function runStaticSample(): void {
  const restores: Array<() => void> = [];
  const sample = SAMPLES.find((s) => s.id === 'static-nwpu-sanitized');
  if (!sample || !sample.staticFile) throw new Error('静态样本声明缺失');
  let html: string;
  try {
    html = readFileSync(sample.staticFile, 'utf8');
  } catch (e) {
    hardFail(`static-nwpu-sanitized: 读取 ${sample.staticFile} 失败 ${String(e)}`);
    return;
  }
  if (!html.includes('SANITIZED-BY tuimian-regression')) hardFail('static-nwpu-sanitized: 缺少脱敏哨兵注释');
  else hardOk('static-nwpu-sanitized: 含脱敏哨兵');
  // 网络隔离门禁:静态样本不得含身份证/手机号/邮箱与远程引用。
  const idcard = /\b\d{17}[\dXx]\b/.test(html);
  const phone = /\b1[3-9]\d{9}\b/.test(html);
  const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(html);
  const remote = /(?:src|href|action)=["'](?:https?:)?\/\//i.test(html);
  if (!idcard && !phone && !email) hardOk('static-nwpu-sanitized: 无身份证/手机/邮箱模式');
  else hardFail(`static-nwpu-sanitized: 残留敏感模式 id=${idcard} phone=${phone} email=${email}`);
  if (!remote) hardOk('static-nwpu-sanitized: 无远程 src/href/action 引用');
  else hardFail('static-nwpu-sanitized: 存在远程引用');
  info(`static-nwpu-sanitized: 文件 ${html.length} 字节(纯结构快照,不执行填充;真实验收另行 live-evidence)`);
  restores.forEach((fn) => fn());

}

// ============ 观测器自校验:能发现"写入后又改回"的副作用 ============
function runSelfCheck(): void {
  const sample = SAMPLES.find((s2) => s2.id === E2E_SAMPLE_ID);
  if (!sample || !sample.html) throw new Error('自校验样本缺失');
  const domCtx = makeDomIsolated(sample.html, sample.logicalUrl);
  const doc = domCtx.doc;
  const obs = instrument(doc);
  // Q11:静默 setter 写入后又改回(无事件)——必须通过写日志捕获,不能是假阴性"0 副作用"。
  silentWrite(doc, 'pwd', 'x');
  silentWrite(doc, 'pwd', '');
  const silentWrites = obs.countsSince(null, 'pwd').writes;
  const silentEvents = evCount(obs, 'pwd');
  if (process.env.TUIMIAN_NEGATIVE_SELFCHECK === '1') {
    // 负向自检(一次性):故意断言"静默写不可能被捕获"。检测器真实生效时该断言必须失败并使进程非零退出。
    if (silentWrites === 0) hardOk('自校验[负向注入]: 未捕获任何写入(本断言在检测器生效时应失败)');
    else hardFail('自校验[负向注入]: 检测到写入 -> 负向断言失败,证明非零退出路径真实存在');
    domCtx.restore();
    return;
  }
  if (silentWrites >= 2) hardOk(`自校验(Q11): 静默写→改回被写入日志捕获(${silentWrites} 次写)`);
  else hardFail(`自校验(Q11): 静默写未被捕获(writes=${silentWrites})`);
  if (silentEvents === 0) hardOk('自校验(Q11): 静默写确实无事件(事件与写分离)');
  else hardFail(`自校验(Q11): 静默写出现事件(${silentEvents})`);
  // 无操作时计数为 0(同一样本未触碰的字段)。
  if (obs.countsSince(null, 'keepX').events === 0 && obs.countsSince(null, 'keepX').writes === 0) hardOk('自校验: 无操作目标计数为 0');
  else hardFail('自校验: 无操作目标出现计数');
  // Q12:故意调用按钮 click 必须被捕获(防提交哨兵不能假阴性)。
  const nextBtn = doc.getElementById('btnNext');
  if (nextBtn) {
    nextBtn.click();
    const clicks = clickCount(obs, 'btnNext');
    if (clicks >= 1) hardOk('自校验(Q12): 故意 click 被捕获');
    else hardFail('自校验(Q12): 故意 click 漏报');
  } else {
    hardFail('自校验(Q12): 样本缺少 btnNext');
  }
  // 同名不同元素分别留痕(身份快照互不覆盖)。
  const dupHtml = '<html><body><input name="dup"><input name="dup"></body></html>';
  const dupCtx = makeDomIsolated(dupHtml, sample.logicalUrl);
  const dupDoc = dupCtx.doc;
  const dupObs = instrument(dupDoc);
  const els = controlsByName(dupDoc, 'dup');
  if (els.length === 2) {
    silentWrite(dupDoc, 'dup', 'first-only');
    const [a, b] = els;
    const writesA = dupObs.countsSince(null, elementId(a)).writes;
    const writesB = dupObs.countsSince(null, elementId(b)).writes;
    const valA = (a as HTMLInputElement).value;
    const valB = (b as HTMLInputElement).value;
    if (writesA === 1 && writesB === 0 && valA === 'first-only' && valB === '') hardOk('自校验: 同名元素按身份分别留痕,写入互不串扰');
    else hardFail(`自校验: 同名元素留痕异常(A:${writesA}/${valA} B:${writesB}/${valB})`);
  } else {
    hardFail('自校验: 同名样本结构错误');
  }
  dupObs.restore();
  dupCtx.restore();
  obs.restore();
  domCtx.restore();
}

// ============ 汇总 ============
runBasicSafety();
runExistingValueConflict();
runSameValueNoop();
runRepeatFillOwnership();
runStaticSample();
runSelfCheck();

console.log('---- P01 回归汇总 ----');
console.log(`HARD PASS: ${hardPassed} / HARD FAIL: ${hardFailed}`);
console.log(`DEFECT 红项(待接管): ${defects.length} 项`);
defects.forEach((d) => console.log('  - ' + d));
console.log(`DEFECT 未复现(需复核): ${defectAbsent.length} 项`);
defectAbsent.forEach((d) => console.log('  - ' + d));

if (hardFailed > 0) {
  console.error(`P01 回归失败:${hardFailed} 项 hard 断言未通过`);
  process.exit(1);

}
console.log('P01 jsdom 回归完成:hard 全绿;红项均为已登记 baseline-defect(见账本)。');
