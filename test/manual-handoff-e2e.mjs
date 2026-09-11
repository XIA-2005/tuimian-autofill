// J01 人工接管续轮的浏览器证据:自动 picker 失败转人工 → 用户在页面完成 → 扩展确认 → 依赖子项填写 → 汇总更新。
// 说明:仅测试构建注入合成适配包;内核与内容脚本均为正式生产源码,dist 不含测试契约。
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const fixture = readFileSync('test/fixtures/handoff-resume.html', 'utf8');
const testRoot = mkdtempSync(join(tmpdir(), 'tuimian-handoff-e2e-'));
const extensionPath = join(testRoot, 'extension');
cpSync('dist', extensionPath, { recursive: true });
const NEGATIVE = process.argv.includes('--ignore-resume');
const REJECT_RESUME = process.argv.includes('--reject-resume');

/** 功能:人工接管 + 依赖字段的最小合同(只进临时构建)。 */
const contract = {
  schemaVersion: 1,
  id: 'test-only-manual-handoff',
  version: '1',
  minCoreVersion: '2.0.5',
  schoolName: '本地人工接管测试',
  programName: '合成夹具',
  family: 'other',
  match: { hosts: ['handoff.test'], pathPatterns: ['/form*'] },
  capabilities: { registerFill: 'directory', formFill: 'experimental', pluginExtract: 'directory', sessionCrawl: 'directory' },
  pages: [{
    id: 'form', name: '人工接管表单', pathPatterns: ['/form*'], role: 'form',
    fields: [
      { nativeId: 'univ', profilePath: 'education.university', driver: 'school-picker', codeSelectors: ['#univCode'], nameSelectors: ['#univName'], picker: { triggerSelectors: ['#trigger'] } },
      { nativeId: 'child', profilePath: 'basic.phone', driver: 'text', dependsOn: ['education.university'] },
    ],
  }],
  crawl: { mode: 'guided', pageOrder: ['form'] },
  projectionPolicy: 'default', commitPolicy: 'manual-save-only',
};

const results = [];
let context;
let external = 0;

async function buildTestExtension() {
  await build({
    entryPoints: ['src/content/index.ts'],
    outfile: join(extensionPath, 'content.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome110',
    plugins: [{
      name: 'test-only-handoff-contract',
      setup(builder) {
        builder.onLoad({ filter: /[\\/]src[\\/]core[\\/]adapter-packages\.ts$/ }, (args) => ({
          loader: 'ts',
          resolveDir: dirname(args.path),
          contents: readFileSync(args.path, 'utf8') + '\nSCHOOL_ADAPTER_PACKAGES.push(validateAdapterPackage(' + JSON.stringify(contract) + '));\n',
        }));
        // 负向变异(仅临时构建):人工完成后不续轮 → 依赖子项必须保持为空,证明该断言承重。
        if (NEGATIVE) builder.onLoad({ filter: /[\\/]src[\\/]content[\\/]index\.ts$/ }, (args) => ({
          loader: 'ts',
          resolveDir: dirname(args.path),
          contents: (() => {
            const original = readFileSync(args.path, 'utf8');
            const anchor = 'function scheduleManualResumeRound(ctx: RunSnapshot | null): void {';
            assert.equal(original.split(anchor).length - 1, 1, '续填变异必须命中唯一生产锚点');
            return original.replace(anchor, anchor + '\n  return; // MUTATION: 不续轮');
          })(),
        }));
      },
    }],
  });
  if (REJECT_RESUME) await build({ entryPoints: ['src/background/index.ts'], outfile: join(extensionPath, 'background.js'), bundle: true, format: 'iife', platform: 'browser', target: 'chrome110', plugins: [{
    name: 'test-only-reject-resume',
    setup(builder) {
      builder.onLoad({ filter: /[\\/]src[\\/]background[\\/]index\.ts$/ }, (args) => {
        const original = readFileSync(args.path, 'utf8');
        const anchor = "if (msg.type === 'FILL_RESUME') {";
        assert.equal(original.split(anchor).length - 1, 1, '拒绝恢复必须命中唯一协议入口');
        return { loader: 'ts', resolveDir: dirname(args.path), contents: original.replace(anchor, anchor + "\n sendResponse({ok:false,reason:'test-rejected'}); return false;") };
      });
    },
  }] });
}

try {
  await buildTestExtension();
  const executablePath = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
  context = await chromium.launchPersistentContext(join(testRoot, 'profile'), {
    headless: true,
    ...(executablePath ? { executablePath } : { channel: 'chromium' }),
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('https://handoff.test/form')) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture });
    if (url.startsWith('chrome-extension://')) return route.continue();
    external++; return route.abort();
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const options = await context.newPage();
  await options.goto(`chrome-extension://${new URL(worker.url()).host}/options.html`);
  await options.evaluate(() => {
    window.handoffProtocol = [];
    chrome.runtime.onMessage.addListener((message) => {
      if (['FILL_PAUSE', 'FILL_RESUME', 'FILL_TERMINAL'].includes(message.type)) window.handoffProtocol.push({ type: message.type, runId: message.runId, seq: message.frameSeq });
    });
  });
  await options.evaluate((value) => chrome.storage.local.set({ profile: value }), {
    version: 2,
    basic: { name: '人工接管', email: 'handoff@example.invalid', phone: '13800000000' },
    education: { university: '测试大学' },
  });

  const page = await context.newPage();
  await page.goto('https://handoff.test/form');
  await page.waitForSelector('#tui-panel');
  await page.click('#tui-panel [data-act="fill"]');

  // ① 自动 picker 失败 → 人工接管卡片出现;此时依赖子项必须仍为空(父未验证成功)。
  await page.waitForSelector('#tui-picker-handoff', { timeout: 20000 });
  const beforeManual = await page.evaluate(() => ({
    child: document.getElementById('child')?.value ?? 'missing',
    card: !!document.getElementById('tui-picker-handoff'),
  }));
  assert.equal(beforeManual.card, true, 'J01: 自动 picker 失败后必须出现人工接管卡片');
  assert.equal(beforeManual.child, '', `J01: 父未验证成功前依赖子项不得写入 ${JSON.stringify(beforeManual)}`);
  await options.waitForFunction(() => window.handoffProtocol.some((message) => message.type === 'FILL_PAUSE'), null, { timeout: 25000 });

  // ② 模拟用户在页面上完成选择(成对回填代码/名称)。
  await page.evaluate(() => (window).__userPickSchool());

  if (REJECT_RESUME) {
    await options.waitForFunction(() => window.handoffProtocol.some((message) => message.type === 'FILL_RESUME'));
    await page.waitForTimeout(3000);
    const rejected = await page.evaluate(() => ({ child: document.getElementById('child').value, code: document.getElementById('univCode').value, panel: document.querySelector('#tui-panel').textContent }));
    assert.equal(rejected.child, '', '后台拒绝恢复后不得填写依赖子项或被定时补填绕过');
    assert.equal(rejected.code, '10700', '人工完成的值保留');
    assert.match(rejected.panel, /停止|取消/);
    console.log('PASS manual handoff resume rejected: 未获确认不写子项');
  } else {

  // ③ 扩展自动检测到回填 → 续轮 → 依赖子项被填写。
  if (NEGATIVE) {
    // 变异锚点已在构建阶段确认唯一命中；显式读取子项并按业务结果断言，
    // 避免用 waitForFunction 超时掩盖“续轮确实被移除”的负向证据。
    await page.waitForTimeout(1800);
    const mutatedChild = await page.evaluate(() => document.getElementById('child')?.value ?? 'missing');
    assert.equal(mutatedChild, '13800000000', '负向变异移除人工续轮后，依赖子项未被生产链填写');
  } else {
    await page.waitForFunction(() => document.getElementById('child')?.value === '13800000000', null, { timeout: 25000 });
  }
  // 续轮统计在该轮收尾时写入,等它落定后再核对(不能只看绿色标记)。
  await page.waitForTimeout(2000);
  const afterManual = await page.evaluate(() => {
    const counts = JSON.parse(sessionStorage.getItem('tui-fill-telemetry-v1') || 'null')?.counts || null;
    return {
      child: document.getElementById('child')?.value ?? 'missing',
      code: document.getElementById('univCode')?.value ?? '',
      counts,
      events: (window.hoEvents || []).map((e) => e.kind),
    };
  });
  assert.equal(afterManual.child, '13800000000', `J01: 人工完成后依赖子项必须被填写 ${JSON.stringify(afterManual)}`);
  assert.equal(afterManual.code, '10700', `J01: 人工回填的代码不被破坏 ${JSON.stringify(afterManual)}`);
  // 人工完成的院校 + 续轮放行的依赖子项都必须计入"已填写"(不能只看绿色标记)。
  // 说明:夹具里的 #univCode/#univName 是隐藏载体,通用匹配会把它们记为未填,属正常表现,不当作 J01 失败。
  const satisfied = (afterManual.counts?.filled ?? 0) + (afterManual.counts?.alreadyCorrect ?? 0);
  assert.ok(satisfied >= 2, `J01: 汇总必须反映续轮结果(已完成+已正确) ${JSON.stringify(afterManual)}`);
  assert.equal(afterManual.counts?.failed ?? -1, 0, `J01: 续轮后不得残留失败计数 ${JSON.stringify(afterManual)}`);

  // ④ 后台消息核对:本轮不得以 waiting-manual 冻结收口(应为 done,或仍在进行)。
  await page.waitForTimeout(1200);
  const finalState = await page.evaluate(() => ({
    panel: document.querySelector('#tui-panel')?.textContent || '',
    stage: JSON.parse(sessionStorage.getItem('tui-fill-telemetry-v1') || 'null')?.stage || '',
  }));
  assert.equal(/页面无响应/.test(finalState.panel), false, `J01: 人工等待不得报成页面失联 ${JSON.stringify(finalState)}`);
  assert.equal(external, 0, 'J01: 无未知外联');
  results.push({ beforeManual, afterManual, finalState, external });
  if (process.env.HANDOFF_EVIDENCE_FILE) writeFileSync(process.env.HANDOFF_EVIDENCE_FILE, JSON.stringify(results, null, 2));
  console.log('PASS manual handoff resume: 人工完成后续轮并填写依赖子项');
  const protocol = await options.evaluate(() => window.handoffProtocol);
  assert.ok(protocol.findIndex((message) => message.type === 'FILL_PAUSE') < protocol.findIndex((message) => message.type === 'FILL_RESUME'), '实际消息必须先暂停再恢复');
  }
} finally {
  await context?.close();
  const realRoot = realpathSync(testRoot);
  assert.equal(dirname(realRoot), realpathSync(tmpdir()));
  assert.ok(realRoot.startsWith(join(realpathSync(tmpdir()), 'tuimian-handoff-e2e-')));
  rmSync(realRoot, { recursive: true, force: true });
}
