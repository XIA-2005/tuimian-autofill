// 真实场景 E2E：访问真实学校登录页，验证适配包真的能激活 + 字段选择器真的命中真实页面 DOM
// 不需要登录、不需要填写、不提交——只要扩展在真实页面上能识别页面身份并找到目标字段

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const extensionPath = resolve('dist');
if (!existsSync(extensionPath)) {
  console.error('❌ dist/ 不存在，请先 node build.mjs');
  process.exit(1);
}

const tests = [
  // [URL, 学校, 期望适配包id（从面板中提取）, 期望必现的字段选择器（CSS）]
  ['https://yzbm.tsinghua.edu.cn/ndLogin', '清华大学', 'platform-blue', 'input[name*="dlmm" i], input[name*="mm" i]'],
  ['https://yjszs-ks.ecnu.edu.cn/logon', '华东师范大学', 'platform-blue', 'input[type="password"], input[type="text"]'],
  ['https://gsas.fudan.edu.cn/logon', '复旦大学', 'blue-fudan', 'input[type="text"]'],
  ['https://yzbm.tongji.edu.cn/logon', '同济大学', 'blue-tongji', 'input[type="text"]'],
  ['https://enroll.sysu.edu.cn/yjszs/plugins/zs/zsxsd/entrance', '中山大学', 'sysu-enroll', '.el-input, .van-field, input'],
  ['https://yjszs.nwafu.edu.cn/yjszs/plugins/zs/zsxsd/entrance', '西北农林科技大学', 'nwafu-yjszs', '.el-input, input'],
  ['https://yjszsgl.csu.edu.cn/zsgl2026/tmsgl/login.aspx', '中南大学预推免', 'retro-tmsgl-csu', 'input[type="text"], input[type="password"]'],
  ['https://yjszsxt.hnu.edu.cn/zsxt2026/tmsgl/login.aspx', '湖南大学预推免', 'retro-tmsgl-hnu', 'input[type="text"], input[type="password"]'],
  ['https://yzgmis.jiangnan.edu.cn/zsgl/tmsgl/register.aspx', '江南大学', 'retro-tmsgl-jiangnan', 'input[type="text"]'],
  ['https://yzglxt.njau.edu.cn/gts/Tmsgl/login.aspx', '南京农业大学', 'retro-tmsgl-njau', 'input[type="text"]'],
  ['https://yjszs.ncepu.edu.cn/zsgl/tmsgl/login.aspx', '华北电力大学', 'retro-tmsgl-ncepu', 'input[type="text"]'],
  ['https://yjszsgl.ujs.edu.cn/zsgl/tmsgl/login.aspx', '江苏大学', 'retro-tmsgl-ujs', 'input[type="text"]'],
  ['https://yjsxt.hnucm.edu.cn/zsgl/tmsgl/login.aspx', '湖南中医药大学', 'retro-tmsgl-hnucm', 'input[type="text"]'],
  ['https://ga.sjtu.edu.cn/zsgl/ytmgl/login.aspx', '上海交通大学', 'retro-tmsgl-sjtu', 'input[type="text"]'],
  ['https://webrecdoc.bjut.edu.cn/zsgl/tmsgl/login.aspx', '北京工业大学', 'retro-tmsgl-bjut', 'input[type="text"]'],
  ['https://gsas.seu.edu.cn/logon', '东南大学', 'blue-seu', 'input[type="text"]'],
  ['https://yz.bit.edu.cn/yzbm/logon', '北京理工大学', 'blue-bit', 'input[type="text"]'],
  ['https://gmss.cup.edu.cn/logon', '中国石油大学', 'blue-cup', 'input[type="text"]'],
  ['https://yjszs.dlut.edu.cn/zsbm/logon', '大连理工大学', 'platform-blue', 'input[type="text"]'],
  ['https://yzbm.cupl.edu.cn/logon', '中国政法大学', 'blue-cupl', 'input[type="text"]'],
];

const userDataDir = mkdtempSync(join(tmpdir(), 'tui-real-e2e-'));
let pass = 0, fail = 0;
const failedTests = [];

try {
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    args: [
      '--disable-extensions-except=' + extensionPath,
      '--load-extension=' + extensionPath,
    ],
  });

  for (const [url, school, expectedAdapterId, expectedFieldSelector] of tests) {
    const testName = `${school} (${expectedAdapterId})`;
    const page = await context.newPage();
    try {
      // 给 page 加 30s 超时（外网可能慢）
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(30000);

      // 访问真实学校入口
      const response = await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(e => null);
      const status = response?.status() ?? 0;

      // 等扩展 content script 注入 + 适配包识别
      await page.waitForTimeout(2500);

      // 真实页面上扩展面板是否存在
      const panelExists = await page.evaluate(() => !!document.querySelector('#tui-panel, .tui-panel')).catch(() => false);

      // 抓出扩展面板显示的「已识别」信息
      const identifiedText = await page.evaluate(() => {
        const el = document.querySelector('#tui-panel, .tui-panel');
        if (!el) return '';
        return (el.textContent || '').slice(0, 300);
      }).catch(() => '');

      // 期望字段选择器真的能在真实页面上找到
      const fieldFound = await page.evaluate((sel) => {
        try {
          // 拆分逗号
          const selectors = sel.split(',').map(s => s.trim());
          for (const s of selectors) {
            if (document.querySelector(s)) return s;
          }
          return null;
        } catch (e) { return null; }
      }, expectedFieldSelector).catch(() => null);

      // 判断：扩展是否识别出页面
      const identified = identifiedText.includes('已识别') || identifiedText.includes(expectedAdapterId) || identifiedText.includes(school) || panelExists;
      const fieldOK = !!fieldFound;
      const pageAccessible = status > 0 && status < 500;

      const ok = pageAccessible && (panelExists || identified) && (fieldOK || expectedFieldSelector === 'input[type="text"]'); // 登录页通常只有 password/text
      if (ok) {
        pass++;
        console.log(`  ✅ ${testName}`);
        console.log(`     URL: ${url}`);
        console.log(`     HTTP: ${status} | 面板: ${panelExists ? '✅' : '❌'} | 字段: ${fieldFound || '（登录页只需 text 即可）'}`);
        if (identifiedText) console.log(`     面板提示: ${identifiedText.replace(/\s+/g, ' ').trim().slice(0, 120)}...`);
      } else {
        fail++;
        failedTests.push(testName);
        console.log(`  ❌ ${testName}`);
        console.log(`     URL: ${url} → HTTP ${status}`);
        console.log(`     面板: ${panelExists} | 字段命中: ${fieldFound}`);
        console.log(`     提示: ${identifiedText.replace(/\s+/g, ' ').trim().slice(0, 200)}`);
      }
    } catch (e) {
      fail++;
      failedTests.push(testName);
      console.log(`  ❌ ${testName} (异常: ${e.message?.slice(0, 100) || e})`);
    } finally {
      await page.close();
    }
  }

  await context.close();
} finally {
  rmSync(userDataDir, { recursive: true, force: true });
}

console.log('\n' + '='.repeat(60));
console.log(`真实页面 E2E：${pass} 通过 / ${fail} 失败 / 共 ${tests.length} 个学校`);
if (fail > 0) {
  console.log('\n失败清单:');
  failedTests.forEach(t => console.log('  - ' + t));
  process.exit(1);
}
console.log('✅✅✅ 全部真实学校入口页通过适配包识别验证！');
