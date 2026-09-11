// 第三方 Edge UI 审计：使用临时 profile 加载当前 dist，并从 edge://extensions 读取卡片状态。
// 该脚本不接触日常 Edge profile；退出时关闭浏览器并删除临时目录。

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const currentDir = dirname(fileURLToPath(import.meta.url));
const extensionPath = resolve('dist');
const screenshotPath = join(currentDir, 'edge-temp-profile-extensions.png');
const resultPath = join(currentDir, 'edge-temp-profile-result.json');
const edgeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const edgePath = edgeCandidates.find(existsSync);

assert.ok(edgePath, '未找到本机 Microsoft Edge');
assert.ok(existsSync(join(extensionPath, 'manifest.json')), 'dist/manifest.json 不存在，请先构建扩展');

const temporaryProfileDir = mkdtempSync(join(tmpdir(), 'tuimian-edge-ui-audit-'));
let context;

try {
  context = await chromium.launchPersistentContext(temporaryProfileDir, {
    executablePath: edgePath,
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 30_000 });
  }
  const extensionId = new URL(serviceWorker.url()).host;

  const extensionsPage = await context.newPage();
  await extensionsPage.goto('edge://extensions/');
  const extensionName = extensionsPage.getByText('预推免填表助手', { exact: true });
  await extensionName.waitFor({ state: 'visible', timeout: 20_000 });

  // Edge 148 已不再使用 Chromium 旧版 extensions-item 标签，因此以用户实际可见的卡片文案与操作核验。
  const bodyText = await extensionsPage.locator('body').innerText();
  const cardEvidence = {
    nameVisible: await extensionName.isVisible(),
    descriptionVisible: bodyText.includes('辅助填写高校预推免/夏令营报名系统'),
    detailActionVisible: bodyText.includes('详细信息'),
    removeActionVisible: bodyText.includes('删除'),
    reloadActionVisible: bodyText.includes('重新加载'),
    otherSourceSectionVisible: bodyText.includes('来自其他源'),
    serviceWorkerAlive: serviceWorker.url().startsWith('chrome-extension://'),
  };

  assert.equal(cardEvidence.nameVisible, true, 'edge://extensions 未显示扩展名称');
  assert.equal(cardEvidence.descriptionVisible, true, 'edge://extensions 未显示扩展描述');
  assert.equal(cardEvidence.detailActionVisible, true, 'edge://extensions 未显示“详细信息”操作');
  assert.equal(cardEvidence.removeActionVisible, true, 'edge://extensions 未显示“删除”操作');
  assert.equal(cardEvidence.reloadActionVisible, true, 'edge://extensions 未显示“重新加载”操作');
  assert.equal(cardEvidence.otherSourceSectionVisible, true, '扩展未出现在“来自其他源”区域');
  assert.equal(cardEvidence.serviceWorkerAlive, true, '扩展 service worker 未运行');

  await extensionsPage.screenshot({ path: screenshotPath, fullPage: true });

  const result = {
    schema: 'edge_temp_profile_audit_v1',
    edgePath,
    extensionPath,
    extensionId,
    extensionName: '预推免填表助手',
    enabled: true,
    cardEvidence,
    serviceWorkerUrl: serviceWorker.url(),
    pageUrl: extensionsPage.url(),
    temporaryProfile: true,
    dailyProfileTouched: false,
  };

  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result, null, 2));
  console.log(`EDGE_TEMP_PROFILE_AUDIT=PASS`);
} finally {
  await context?.close();
  rmSync(temporaryProfileDir, { recursive: true, force: true });
}
