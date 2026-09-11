// G07a：真实扩展内容脚本 + 仅测试构建静态适配包；正式 dist 不加入测试契约/消息注入口。
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const fixture = readFileSync('test/fixtures/dependency-async.html', 'utf8');
const contract = JSON.parse(readFileSync('test/fixtures/dependency-contract.json', 'utf8'));
const testRoot = mkdtempSync(join(tmpdir(), 'tuimian-dependency-e2e-'));
const extensionPath = join(testRoot, 'extension');
cpSync('dist', extensionPath, { recursive: true });
const profile = { version: 2, basic: { email: 'dependency@example.invalid' }, education: { province: '陕西省', university: '测试大学', major: '计算机科学与技术' } };
const results = [];
let context;
let external = 0;
const NEGATIVE = process.argv.includes('--negative-sync');

/** 功能：只在临时构建中追加合成契约；内核和内容脚本均使用实际生产源码。 */
async function buildTestExtension() {
  await build({ entryPoints: ['src/content/index.ts'], outfile: join(extensionPath, 'content.js'), bundle: true, format: 'iife', platform: 'browser', target: 'chrome110', plugins: [{
    name: 'test-only-contract',
    setup(builder) {
      // 负向变异仅影响临时测试构建；退回同步执行时正常依赖场景必须失败。
      if (NEGATIVE) builder.onLoad({ filter: /[\\/]src[\\/]core[\\/]dependency-executor\.ts$/ }, (args) => {
        const original = readFileSync(args.path, 'utf8');
        const anchor = 'const pageRes = resolveAdapterPage(adapter, doc, url);';
        assert.equal(original.split(anchor).length - 1, 1, '同步退化变异必须命中唯一生产锚点');
        return {
          loader: 'ts',
          resolveDir: dirname(args.path),
          contents: original.replace(anchor, `return fillAdapterContract(profile, doc, url, adapter);\n  ${anchor}`),
        };
      });
      builder.onLoad({ filter: /[\\/]src[\\/]core[\\/]adapter-packages\.ts$/ }, (args) => ({ loader: 'ts', resolveDir: dirname(args.path), contents: readFileSync(args.path, 'utf8') + '\nSCHOOL_ADAPTER_PACKAGES.push(validateAdapterPackage(' + JSON.stringify(contract) + '));\n' }));
    },
  }] });
}

/** 功能：读取字段与事件证据；不读取站点账号或外部资源。 */
async function snapshot(page) {
  return page.evaluate(() => ({
    province: document.querySelector('#province').value,
    school: document.querySelector('#school').value,
    major: document.querySelector('#major').value,
    email: document.querySelector('#email').value,
    oldSchool: window.oldSchool.value,
    events: window.depEvents,
    counts: JSON.parse(sessionStorage.getItem('tui-fill-telemetry-v1') || 'null')?.counts,
  }));
}

try {
  await buildTestExtension();
  const executablePath = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
  context = await chromium.launchPersistentContext(join(testRoot, 'profile'), { headless: true, ...(executablePath ? { executablePath } : { channel: 'chromium' }), args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('https://dependency.test/form')) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture });
    if (url.startsWith('chrome-extension://')) return route.continue();
    external++; return route.abort();
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const options = await context.newPage();
  await options.goto(`chrome-extension://${new URL(worker.url()).host}/options.html`);
  for (const mode of ['normal', 'same', 'conflict', 'empty', 'timeout', 'cancel', 'replace-parent', 'parent-rejected']) {
    const data = structuredClone(profile);
    if (mode === 'empty') data.education.province = '';
    await options.evaluate((p) => chrome.storage.local.set({ profile: p }), data);
    const page = await context.newPage();
    await page.goto(`https://dependency.test/form?mode=${mode}`);
    await page.waitForSelector('#tui-panel');
    await page.click('#tui-panel [data-act="fill"]');
    if (mode === 'cancel') {
      await page.waitForFunction(() => window.depEvents.some((e) => e.target === 'province' && e.kind === 'change'));
      await options.evaluate((p) => chrome.storage.local.set({ profile: p }), { ...data, basic: { email: 'new-run@example.invalid' } });
    }
    if (mode === 'normal' || mode === 'same') {
      if (NEGATIVE) {
        // 故障注入已由唯一锚点断言确认；等待页面异步选项就绪后直接读状态，
        // 让负向用例以字段断言失败，而不是用通用 Playwright 超时冒充保护生效。
        await page.waitForTimeout(1800);
      } else {
        await page.waitForFunction(() => document.querySelector('#major').value === '080901', null, { timeout: 6000 });
        await page.waitForTimeout(900);
      }
    } else {
      await page.waitForTimeout(1800);
    }
    const state = await snapshot(page);
    if (mode !== 'same') assert.equal(state.oldSchool, '', `${mode}: 不得写入已被替换的旧子控件`);
    assert.equal(state.events.some((e) => e.kind === 'forbidden'), false, `${mode}: 不得提交`);
    if (mode === 'normal' || mode === 'same') {
      assert.equal(state.school, '10700'); assert.equal(state.major, '080901');
      assert.equal(state.counts?.failed, 0, `${mode}: 正确的代码选项不得因与名称格式不同而被判失败`);
      const eventAt = (kind, target) => state.events.findIndex((e) => e.kind === kind && e.target === target);
      if (mode === 'normal') assert.ok(eventAt('ready', 'province') < eventAt('change', 'school') && eventAt('ready', 'province') >= 0, '父异步确认后才能选择新院校');
      else assert.equal(eventAt('change', 'province'), -1, '父同值必须零写事件');
      assert.ok(eventAt('ready', 'school') < eventAt('change', 'major') && eventAt('ready', 'school') >= 0, '院校异步确认后才能填写专业');
    } else {
      assert.equal(state.school, '', `${mode}: 子院校不得被写入`);
      assert.equal(state.major, '', `${mode}: 子专业不得被写入`);
      assert.equal(state.events.filter((e) => e.kind === 'change' && ['school', 'major'].includes(e.target)).length, 0, `${mode}: 子字段零写事件`);
    }
    if (mode !== 'cancel') assert.equal(state.email, profile.basic.email, `${mode}: 独立字段照常填写`);
    results.push({ mode, ...state });
    console.log(`PASS dependency extension: ${mode}`);
    await page.close();
  }
  assert.equal(external, 0, '无未知外联');
  if (process.env.DEPENDENCY_EVIDENCE_FILE) writeFileSync(process.env.DEPENDENCY_EVIDENCE_FILE, JSON.stringify({ results, external }, null, 2));
} finally {
  await context?.close();
  // 删除范围只允许本次 mkdtemp 创建的目录，校验其绝对父路径后才递归删除。
  const realRoot = realpathSync(testRoot);
  assert.equal(dirname(realRoot), realpathSync(tmpdir()));
  assert.ok(realRoot.startsWith(join(realpathSync(tmpdir()), 'tuimian-dependency-e2e-')));
  rmSync(realRoot, { recursive: true, force: true });
}
