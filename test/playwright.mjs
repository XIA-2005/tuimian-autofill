// 本地 Manifest V3 扩展端到端测试：仅访问本机夹具，不登录或访问任何真实高校系统。

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const extensionPath = resolve('dist');
const fixture = readFileSync(resolve('test/fixture-form.html'));
const profile = {
  version: 2,
  basic: { name: '端到端测试用户', phone: '13800000001', email: 'e2e@example.invalid' },
  education: {
    university: '西安理工大学', major: '测控技术与仪器', startDate: '2022-09', endDate: '2026-06',
    rank: '1', rankBase: '100', cet6: '518', cet6Date: '2025-06',
  },
  academicPapers: [{ kind: '论文', start: '', end: '2025-01', title: '脱敏论文', source: '测试期刊', role: '一作', authors: '', itemType: '', level: '', status: '', summary: '', advisor: '', partition: '', state: { id: 'e2e-paper', locked: true, source: 'manual', updatedAt: '2026-01-01T00:00:00.000Z', confidence: 'verified' } }],
  fieldStates: { 'basic.name': { locked: true, source: 'manual', updatedAt: '2026-01-01T00:00:00.000Z', confidence: 'verified' } },
};

// 北科大学术成果回归档案：蓝色系统投影为科研项目 1 条 + 竞赛 13 条，共 14 条。
const academicProfile = {
  ...structuredClone(profile),
  academicPapers: [],
  academicPatents: [],
  academicProjects: [{
    kind: '项目', start: '2024-01', end: '2024-06', title: '成果1', source: '测试来源', role: '1/1', authors: '',
    itemType: '', level: '', status: '', summary: '', advisor: '', partition: '',
    state: { id: 'e2e-project-1', locked: true, source: 'manual', updatedAt: '2026-01-01T00:00:00.000Z', confidence: 'verified' },
  }],
  academicCompetitions: Array.from({ length: 13 }, (_, index) => ({
    kind: '学术', time: '2025-01', name: `成果${index + 2}`, issuer: '测试来源', place: '', level: '国家级', grade: '一等奖', rank: '1/1', content: '',
    state: { id: `e2e-competition-${index + 1}`, locked: true, source: 'manual', updatedAt: '2026-01-01T00:00:00.000Z', confidence: 'verified' },
  })),
};

const server = createServer((req, res) => {
  if (req.url?.startsWith('/fixture')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fixture);
  } else {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((resolveReady) => server.listen(0, '127.0.0.1', resolveReady));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('本地夹具服务器启动失败');

const userDataDir = mkdtempSync(join(tmpdir(), 'tuimian-e2e-'));
const edgeCandidates = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const executablePath = edgeCandidates.find((candidate) => existsSync(candidate));

let context;
try {
  context = await chromium.launchPersistentContext(userDataDir, {
    ...(executablePath ? { executablePath } : {}),
    headless: process.env.PW_HEADLESS === '1',
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const extensionId = new URL(worker.url()).host;

  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
  await optionsPage.evaluate((value) => chrome.storage.local.set({ profile: value }), profile);
  await optionsPage.reload();
  await optionsPage.waitForSelector('#list-academicPapers .row');
  assert.equal(await optionsPage.locator('[data-field="basic.name"]').isDisabled(), true, '已锁标量应在档案页禁用');
  assert.equal(await optionsPage.locator('#list-academicPapers .row').count(), 1, '八类原子表应在档案页渲染');
  assert.equal(await optionsPage.locator('#list-awards').count(), 0, '旧四表编辑入口不应继续出现');

  const formPage = await context.newPage();
  await formPage.goto(`http://127.0.0.1:${address.port}/fixture`);
  await formPage.waitForSelector('#tui-panel');
  assert.equal(await formPage.locator('#tui-panel [data-act="autofill"]').count(), 1, '面板应提供连续填写入口');
  assert.equal(await formPage.locator('#tui-panel [data-act="stopauto"]').count(), 1, '面板应提供停止连续填写入口');
  formPage.on('dialog', (dialog) => dialog.accept());
  await formPage.click('#tui-panel [data-act="fill"]');
  await formPage.waitForFunction(() => document.querySelector('[name="xm"]')?.value === '端到端测试用户', null, { timeout: 10000 });
  await formPage.waitForSelector('#tui-panel .tui-log-item');
  await formPage.waitForFunction(() => (document.querySelector('#tui-panel .tui-live-log')?.textContent || '').includes('已填写并回读通过'), null, { timeout: 10000 });
  await formPage.waitForSelector('.tui-fill-banner');
  const bannerStyle = await formPage.locator('.tui-fill-banner').evaluate((element) => {
    const title = element.querySelector('.tui-banner-title');
    return {
      width: element.getBoundingClientRect().width,
      titleSize: title ? Number.parseFloat(getComputedStyle(title).fontSize) : 0,
      noticeDisplay: element.querySelector('.tui-banner-notice') ? getComputedStyle(element.querySelector('.tui-banner-notice')).display : '',
    };
  });
  assert.equal(bannerStyle.width <= 540, true, '自动填写横幅应缩为紧凑状态提示');
  assert.equal(bannerStyle.titleSize >= 15 && bannerStyle.titleSize < 24, true, '紧凑横幅标题应清晰但不遮挡页面');
  assert.equal(bannerStyle.noticeDisplay, 'none', '详细安全说明应移入操作中心而不是长期占用横幅');
  const operationCenter = await formPage.locator('#tui-panel').evaluate((panel) => ({
    log: panel.querySelector('.tui-live-log')?.textContent || '',
    progress: panel.querySelector('.tui-progress-text')?.textContent || '',
    filled: panel.querySelector('[data-count="filled"]')?.textContent || '',
    fillDisabled: panel.querySelector('[data-act="fill"]')?.disabled || false,
  }));
  assert.match(operationCenter.log, /姓名.*已填写并回读通过/s, '操作中心应逐字段显示实时填写结果');
  assert.doesNotMatch(operationCenter.log, /端到端测试用户|13800000001|e2e@example\.invalid/, '实时日志不得包含档案真实值');
  assert.match(operationCenter.progress, /^\d+\/\d+$/, '操作中心应显示真实完成数而非估算百分比');
  assert.equal(Number(operationCenter.filled) > 0, true, '操作中心应显示成功数量');
  assert.equal(operationCenter.fillDisabled, true, '运行中应禁用重复填充按钮');
  assert.equal(await formPage.locator('[name="pwd"]').inputValue(), '', '密码不得自动填写');
  assert.equal(await formPage.locator('[name="yzm"]').inputValue(), '', '验证码不得自动填写');

  // 使用实际 Edge 内核模拟北科大已验收页面：回读通过后进入下一页，最终提交按钮必须保持未点击。
  await context.route('https://yjsy.ustb.edu.cn/ksxt/ssxly/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const isSummary = path.endsWith('/summary');
    const isLanguage = path.endsWith('/language');
    const isAchievements = path.endsWith('/achievements');
    const isRewards = path.endsWith('/rewards');
    const existingAchievementRows = Array.from({ length: 8 }, (_, index) =>
      `<tr><td>2025-01</td><td>测试来源</td><td>成果${index + 1}</td><td>1/1</td></tr>`,
    ).join('');
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: isSummary
        ? '<!doctype html><meta charset="utf-8"><title>报名汇总</title><button id="finalSubmit" type="submit" onclick="localStorage.setItem(\'finalSubmitClicked\',\'1\')">最终提交</button>'
        : isRewards
          ? '<!doctype html><meta charset="utf-8"><title>奖励情况</title><h1>奖励情况</h1><p>连续填写应在此安全停止。</p>'
        : isAchievements
          ? '<!doctype html><meta charset="utf-8"><title>学术成果</title>' +
            '<table id="achievementTable"><tbody><tr><th>时间</th><th>发表刊物或出版社</th><th>标题</th><th>作者排名</th></tr>' +
            existingAchievementRows + '<tr><td><input></td><td><input></td><td><input></td><td><input></td></tr></tbody></table>' +
            '<button id="addNewRow" type="button">新增一行</button><button class="button bg-sub" type="button">下一步</button>' +
            `<script>
              const table = document.querySelector('#achievementTable tbody');
              const updateAcademicEvidence = () => {
                const rows = [...table.querySelectorAll('tr')].slice(1);
                const titles = rows.map((row) => row.cells[2].querySelector('input')?.value || row.cells[2].textContent || '').filter((value) => value.trim());
                sessionStorage.setItem('academicRows', String(rows.length));
                sessionStorage.setItem('academicNonEmpty', String(titles.length));
              };
              document.querySelector('#addNewRow').addEventListener('click', () => {
                const row = table.insertRow();
                row.innerHTML = '<td><input></td><td><input></td><td><input></td><td><input></td>';
                updateAcademicEvidence();
              });
              table.addEventListener('input', updateAcademicEvidence);
              table.addEventListener('change', updateAcademicEvidence);
              document.querySelector('.button.bg-sub').addEventListener('click', () => {
                updateAcademicEvidence();
                sessionStorage.setItem('academicNextClicked', '1');
                location.href = '/ksxt/ssxly/rewards';
              });
              updateAcademicEvidence();
            </script>`
        : isLanguage
          ? '<!doctype html><meta charset="utf-8"><title>外语水平</title><table><tbody><tr><th>外语水平</th><th>成绩</th><th>取得成绩时间（日期格式：2019-11-11）</th><th>备注</th><th>操作</th></tr>' +
            '<tr><td><select id="lbmc0"><option value="">----请选择----</option><option value="4">四级</option><option value="6">六级</option><option value="toefl">托福</option><option value="ielts">雅思</option><option value="other">其它</option></select></td>' +
            '<td><input id="cj0" name="cj"></td><td><input id="sj0" name="sj"></td><td><input id="bz0"></td><td></td></tr></tbody></table><button class="button bg-sub">下一步</button>'
        : '<!doctype html><meta charset="utf-8"><title>教育信息</title><form>' +
          '<input id="bydwm" type="hidden" value="10700"><input id="bydw" type="hidden" value="西安理工大学"><input id="bkbydwShow" value="10700 西安理工大学">' +
          '<input id="byzydm" type="hidden" value="080301"><input id="byzymc" type="hidden" value="测控技术与仪器"><input id="bkbyzyShow" value="080301 测控技术与仪器">' +
          '<input id="rxny"><input id="byny"><button class="button bg-sub" type="button" onclick="location.href=\'/ksxt/ssxly/summary\'">下一步</button>' +
          '</form>',
    });
  });
  const languagePage = await context.newPage();
  await languagePage.goto('https://yjsy.ustb.edu.cn/ksxt/ssxly/language');
  await languagePage.waitForSelector('#tui-panel');
  await languagePage.locator('#tui-panel [data-act="fill"]').click({ force: true });
  await languagePage.waitForFunction(() => document.querySelector('#lbmc0')?.value === '6');
  assert.equal(await languagePage.locator('#cj0').inputValue(), '518', 'Edge 下英语等级与六级成绩应成对填写');
  assert.equal(await languagePage.locator('#sj0').inputValue(), '2025-06-01', 'Edge 下外语考试日期应符合页面格式');

  // 真实扩展流程回归：已有 8 行时补齐到 14 行，等待行任务完成后自动进入下一步。
  await optionsPage.evaluate((value) => chrome.storage.local.set({ profile: value }), academicProfile);
  const achievementPage = await context.newPage();
  await achievementPage.goto('https://yjsy.ustb.edu.cn/ksxt/ssxly/achievements');
  await achievementPage.waitForSelector('#tui-panel');
  const achievementStartedAt = Date.now();
  await achievementPage.locator('#tui-panel [data-act="autofill"]').click({ force: true });
  await achievementPage.waitForURL('**/ksxt/ssxly/rewards', { timeout: 30_000 });
  const achievementElapsedMs = Date.now() - achievementStartedAt;
  const academicEvidence = await achievementPage.evaluate(() => ({
    rows: Number(sessionStorage.getItem('academicRows') || 0),
    nonEmpty: Number(sessionStorage.getItem('academicNonEmpty') || 0),
    nextClicked: sessionStorage.getItem('academicNextClicked'),
  }));
  console.log(`Playwright 性能采样：北科大 14 项成果连续填写 ${achievementElapsedMs}ms`);
  assert.equal(achievementElapsedMs > 0, true, '北科大成果流程应记录有效耗时');
  assert.deepEqual(academicEvidence, { rows: 14, nonEmpty: 14, nextClicked: '1' }, '北科大学术成果应补齐 14 行后自动进入下一步');
  assert.equal(await achievementPage.locator('h1').textContent(), '奖励情况', '自动下一步应到达后续步骤而非最终提交页');

  await optionsPage.evaluate((value) => chrome.storage.local.set({ profile: value }), profile);

  const wizardPage = await context.newPage();
  await wizardPage.goto('https://yjsy.ustb.edu.cn/ksxt/ssxly/education');
  await wizardPage.waitForSelector('#tui-panel');
  await wizardPage.locator('#tui-panel [data-act="autofill"]').click({ force: true });
  await wizardPage.waitForURL('**/ksxt/ssxly/summary', { timeout: 15000 });
  await wizardPage.waitForSelector('#finalSubmit');
  await wizardPage.waitForTimeout(1500);
  assert.equal(await wizardPage.evaluate(() => localStorage.getItem('finalSubmitClicked')), null, '连续填写不得点击最终提交');

  // 合肥工业大学 12 步加密向导：专项契约应点击真正的“下一步”，到上传步骤后立即安全停止。
  await context.route('https://yzbm.hfut.edu.cn/sstm/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const isEducation = path.includes('education-step');
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: path.includes('upload-step')
        ? '<!doctype html><meta charset="utf-8"><title>研究生报考服务系统</title><h1>上传照片</h1><input type="file"><button class="button bg-sub">下一步</button>'
        : isEducation
          ? '<!doctype html><meta charset="utf-8"><title>研究生报考服务系统</title>' +
            '<input id="bydwm" type="hidden"><input id="bydw" type="hidden"><input id="bkbydwShow"><span id="schoolTrigger" class="addon">选择</span>' +
            '<input id="byzydm" type="hidden"><input id="byzymc" type="hidden"><input id="bkbyzyShow"><span id="majorTrigger" class="addon">选择</span>' +
            '<input id="rxny"><input id="byny"><button id="hfutEducationNext" class="button bg-sub">下一步</button>' +
            '<div id="schoolDialog" class="layui-layer" style="display:none"><input type="text"><button>查询</button><table><tr><td>10700</td><td>西安理工大学</td><td><button id="chooseHfutSchool">选择</button></td></tr></table></div>' +
            '<div id="majorDialog" class="layui-layer" style="display:none"><input type="text"><button>查询</button><table><tr><td>080301</td><td>测控技术与仪器</td><td><button id="chooseHfutMajor">选择</button></td></tr></table></div>' +
            `<script>
              schoolTrigger.onclick = () => schoolDialog.style.display = 'block';
              majorTrigger.onclick = () => majorDialog.style.display = 'block';
              chooseHfutSchool.onclick = () => { bydwm.value = '10700'; bydw.value = '西安理工大学'; bkbydwShow.value = '10700 西安理工大学'; schoolDialog.style.display = 'none'; };
              chooseHfutMajor.onclick = () => { byzydm.value = '080301'; byzymc.value = '测控技术与仪器'; bkbyzyShow.value = '080301 测控技术与仪器'; majorDialog.style.display = 'none'; };
              hfutEducationNext.onclick = () => { sessionStorage.setItem('hfutSchoolCode', bydwm.value); sessionStorage.setItem('hfutMajorCode', byzydm.value); location.href = '/sstm/upload-step'; };
            </script>`
        : '<!doctype html><meta charset="utf-8"><title>研究生报考服务系统</title>' +
          '<input id="xm"><input id="xmpy"><select id="mz"><option value="">请选择</option><option>汉族</option></select>' +
          '<a class="button bg-sub">显示敏感信息</a><button id="hfutNext" class="button bg-sub" onclick="location.href=\'/sstm/upload-step\'">下一步</button>',
    });
  });
  const hfutPage = await context.newPage();
  await hfutPage.goto('https://yzbm.hfut.edu.cn/sstm/encrypted-basic-step');
  await hfutPage.waitForSelector('#tui-panel');
  const hfutStartedAt = Date.now();
  await hfutPage.locator('#tui-panel [data-act="autofill"]').click({ force: true });
  await hfutPage.waitForURL('**/sstm/upload-step', { timeout: 15000 });
  console.log(`Playwright 性能采样：合工大基本信息连续填写 ${Date.now() - hfutStartedAt}ms`);
  await hfutPage.waitForSelector('h1');
  assert.equal(await hfutPage.locator('h1').textContent(), '上传照片', '合工大连续填写应自动进入下一步');
  await hfutPage.waitForTimeout(1200);
  assert.equal(await hfutPage.url().endsWith('/sstm/upload-step'), true, '合工大连续填写到上传页后必须停止，不继续点击');

  const hfutEducationPage = await context.newPage();
  await hfutEducationPage.goto('https://yzbm.hfut.edu.cn/sstm/encrypted-education-step');
  await hfutEducationPage.waitForSelector('#tui-panel');
  await hfutEducationPage.locator('#tui-panel [data-act="autofill"]').click({ force: true });
  await hfutEducationPage.waitForURL('**/sstm/upload-step', { timeout: 20000 });
  const hfutPairEvidence = await hfutEducationPage.evaluate(() => ({
    school: sessionStorage.getItem('hfutSchoolCode'),
    major: sessionStorage.getItem('hfutMajorCode'),
  }));
  assert.deepEqual(hfutPairEvidence, { school: '10700', major: '080301' }, '合工大本科院校和专业应分别选中并完成代码名称三联回读');

  console.log('Playwright 本地扩展测试全部通过 ✅');
} finally {
  await context?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
  rmSync(userDataDir, { recursive: true, force: true });
}
