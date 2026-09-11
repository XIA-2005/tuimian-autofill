// J00 超时停止原轮的浏览器证据：仅测试构建把后台 deadline 缩短,构造比 deadline 更慢的任务。
// 断言:超时后 content 收到 scoped 停止 → 迟到的选项出现也不再写入;汇总如实报超时缺失。
// 说明:正式 dist 不加入任何测试开关;本文件的变异只改临时构建的常量。
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const testRoot = mkdtempSync(join(tmpdir(), 'tuimian-deadline-e2e-'));
const extensionPath = join(testRoot, 'extension');
cpSync('dist', extensionPath, { recursive: true });
const NEGATIVE = process.argv.includes('--ignore-deadline-stop');

const results = [];
let context;
let external = 0;

/** 功能:仅测试构建把 content 的级联等待判定保持原样,把后台 deadline 缩短到 1500ms。 */
async function buildTestExtension() {
  // 后台:缩短 deadline(负向模式下跳过停止通知,用于证明该断言承重)。
  await build({
    entryPoints: ['src/background/index.ts'],
    outfile: join(extensionPath, 'background.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome110',
    plugins: [{
      name: 'test-only-deadline',
      setup(builder) {
        builder.onLoad({ filter: /[\\/]src[\\/]background[\\/]index\.ts$/ }, (args) => {
          let contents = readFileSync(args.path, 'utf8');
          const deadlineAnchor = 'const FILL_DEADLINE_MS = 25000;';
          assert.equal(contents.split(deadlineAnchor).length - 1, 1, '缩短deadline必须命中唯一生产锚点');
          contents = contents.replace(deadlineAnchor, 'const FILL_DEADLINE_MS = 1500;');
          if (NEGATIVE) {
            const stopAnchor = "  if (reason !== 'all-terminal') stopParticipants(tabId, agg, reason);";
            assert.equal(contents.split(stopAnchor).length - 1, 1, '移除停止通知必须命中唯一生产锚点');
            contents = contents.replace(stopAnchor, '  // MUTATION: 不发送停止通知');
          }
          return { loader: 'ts', resolveDir: dirname(args.path), contents };
        });
      },
    }],
  });
  // 内容脚本:生产源码原样。
  await build({ entryPoints: ['src/content/index.ts'], outfile: join(extensionPath, 'content.js'), bundle: true, format: 'iife', platform: 'browser', target: 'chrome110' });
}

try {
  await buildTestExtension();
  const executablePath = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
  context = await chromium.launchPersistentContext(join(testRoot, 'profile'), {
    headless: true,
    ...(executablePath ? { executablePath } : { channel: 'chromium' }),
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  const parentHtml = readFileSync('test/fixtures/frame-parent.html', 'utf8');
  const childHtml = readFileSync('test/fixtures/frame-child.html', 'utf8');
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('https://deadline.test/form')) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: parentHtml });
    if (url.startsWith('https://deadline.test/frame-child')) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: childHtml });
    if (url.startsWith('chrome-extension://')) return route.continue();
    external++; return route.abort();
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const options = await context.newPage();
  await options.goto(`chrome-extension://${new URL(worker.url()).host}/options.html`);
  await options.evaluate((value) => chrome.storage.local.set({ profile: value }), {
    version: 2,
    basic: { name: '超时测试', email: 'deadline@example.invalid', phone: '13800000000' },
    education: { university: '测试大学', major: '软件工程' },
  });

  const page = await context.newPage();
  // 子 frame 的选项必须晚于测试构建的 1500ms deadline 才出现(通过夹具的 delay 参数)。
  await page.goto('https://deadline.test/form?delay=12000');
  await page.waitForSelector('#tui-panel');
  // 子 frame 的选项 12 秒后才出现 —— 远慢于测试构建的 1500ms deadline。
  const childFrame = page.frames().find((f) => f.url().includes('/frame-child'));
  assert.ok(childFrame, 'J00: 子 frame 必须存在');
  await childFrame.waitForLoadState('load');
  await page.waitForTimeout(900);
  await page.click('#tui-panel [data-act="fill"]');

  // deadline 到点后:后台应报超时并列出未终态区域;顶层提示不得宣称成功。
  await page.waitForFunction(() => /未完成|超时/.test(document.querySelector('#tui-panel')?.textContent || ''), null, { timeout: 15000 });
  const atTimeout = await page.evaluate(() => ({
    panel: document.querySelector('#tui-panel')?.textContent || '',
    events: (JSON.parse(sessionStorage.getItem('tui-fill-telemetry-v1') || 'null')?.events || []).map((e) => e.action || ''),
  }));
  assert.equal(/未完成|超时/.test(atTimeout.panel), true, `J00: 超时必须如实提示 ${JSON.stringify(atTimeout)}`);

  // 迟到 12 秒的选项出现后,该帧已在超时时被停止 → 不得再写入。
  // 必须跨过 15 秒补填轮:否则“没写”只说明补填还没轮到,不能证明停止生效。
  await page.waitForTimeout(20000);
  const childState = await childFrame.evaluate(() => {
    const zy = document.querySelector('[name="zy"]');
    return { options: zy ? zy.options.length : -1, value: zy ? zy.value : 'missing' };
  });
  assert.ok(childState.options > 1, `J00: 迟到选项确实已出现(否则断言无意义) ${JSON.stringify(childState)}`);
  assert.equal(childState.value, '', `J00: 超时停止后不得写入迟到选项 ${JSON.stringify(childState)}`);
  assert.equal(external, 0, 'J00: 无未知外联');
  results.push({ atTimeout, childState, external });
  if (process.env.DEADLINE_EVIDENCE_FILE) writeFileSync(process.env.DEADLINE_EVIDENCE_FILE, JSON.stringify(results, null, 2));
  console.log('PASS deadline stop: 超时后迟到选项不再写入');
} finally {
  await context?.close();
  const realRoot = realpathSync(testRoot);
  assert.equal(dirname(realRoot), realpathSync(tmpdir()));
  assert.ok(realRoot.startsWith(join(realpathSync(tmpdir()), 'tuimian-deadline-e2e-')));
  rmSync(realRoot, { recursive: true, force: true });
}
