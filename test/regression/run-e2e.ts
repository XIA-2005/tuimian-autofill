// 真实打包扩展行为回归(PLAN v3 · P01)
// 入口:npm run test:regression:e2e(=node build.mjs && node test/regression/run-e2e.js)
// 原则:加载真实 dist/ 扩展;所有高校域名类请求一律拦截到本地夹具;未知请求直接 abort 并计数;
// 断言既验证"该写的写对",也验证"密码/验证码/提交/下一步不被触碰"。
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { e2eFormHtml, e2eProfile } from './samples';

async function main(): Promise<void> {
  const extensionPath = resolve('dist');
  // 监听脚本置于表单之后 + 事件委托:按钮点击一律由 document 捕获层统计,不再依赖"生成前绑定"。
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>回归夹具</title></head><body>
${e2eFormHtml}
<script>
  window.__obsInstalled = false;
  window.__clicks = { btnNext: 0, btnSubmit: 0, btnAddRow: 0 };
  document.addEventListener('click', function (e) {
    var t = e.target;
    var b = t && t.closest ? t.closest('button[id]') : null;
    if (b && Object.prototype.hasOwnProperty.call(window.__clicks, b.id)) window.__clicks[b.id] += 1;
  }, true);
  window.__obsInstalled = true;
</script>
</body></html>`;

  const semanticsHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>语义页</title></head><body>
<table>
<tr><td>姓名*</td><td><input name="xm" value="PAGE_VALUE"></td></tr>
<tr><td>手机号码*</td><td><input name="sjh" value="13800000001"></td></tr>
<tr><td>出生日期*</td><td><input type="date" name="csrq" value="2001-01-01"></td></tr>
<tr><td>性别*</td><td><label>男<input type="radio" name="xb" value="男"></label><label>女<input type="radio" name="xb" value="女" checked></label></td></tr>
<tr><td>通讯地址</td><td><input name="txdz"></td></tr>
</table>
<script>
  window.__semEvents = {};
  document.addEventListener('input', function (e) {
    var t = e.target;
    var n = t && t.getAttribute ? (t.getAttribute('name') || t.id) : '';
    if (n) window.__semEvents[n] = (window.__semEvents[n] || 0) + 1;
  }, true);
</script>
</body></html>`;
  const clearsHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>清空反例</title></head><body>
<table>
<tr><td>姓名*</td><td><input name="xm"></td></tr>
<tr><td>手机号码*</td><td><input name="sjh"></td></tr>
</table>
<script>
  window.__clearTimer = null;
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute('name') === 'xm') {
      clearTimeout(window.__clearTimer);
      window.__clearTimer = setTimeout(function () {
        t.value = '';
        t.dispatchEvent(new Event('change', { bubbles: true }));
      }, 200);
    }
  }, true);
</script>
</body></html>`;
  // F06:本地框架 vendor(从 node_modules 读取,绝不用 CDN)与受控组件夹具页。
  const vendorFiles: Record<string, string> = {
    '/vendor/react.js': 'node_modules/react/umd/react.development.js',
    '/vendor/react-dom.js': 'node_modules/react-dom/umd/react-dom.development.js',
    '/vendor/vue.js': 'node_modules/vue/dist/vue.global.js',
  };
  const fixtureFiles: Record<string, string> = {
    '/react-controlled': 'test/fixtures/react-controlled.html',
    '/vue-controlled': 'test/fixtures/vue-controlled.html',
    '/recover-semantics': 'test/fixtures/recover-semantics.html',
    '/first-option': 'test/fixtures/first-option.html',
    '/frame-parent': 'test/fixtures/frame-parent.html',
    '/frame-child': 'test/fixtures/frame-child.html',
    '/rowjobs': 'test/fixtures/rowjobs-achievements.html',
    '/picker-page': 'test/fixtures/picker-page.html',
    '/picker-dialog': 'test/fixtures/picker-dialog.html',
  };
  const server = createServer((req, res) => {
    const url = req.url || '';
    const vendor = Object.entries(vendorFiles).find(([prefix]) => url.startsWith(prefix));
    if (vendor) {
      res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' });
      res.end(readFileSync(vendor[1], 'utf8'));
      return;
    }
    const fixture = Object.entries(fixtureFiles).find(([prefix]) => url.startsWith(prefix));
    if (fixture) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(readFileSync(fixture[1], 'utf8'));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    if (url.startsWith('/semantics')) res.end(semanticsHtml);
    else if (url.startsWith('/clears')) res.end(clearsHtml);
    else res.end(html);
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('本地夹具服务器启动失败');
  const base = `http://127.0.0.1:${addr.port}`;

  const userDataDir = mkdtempSync(join(tmpdir(), 'tuimian-reg-e2e-'));
  const edgeCandidates = [
    process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean) as string[];
  const executablePath = edgeCandidates.find((c) => existsSync(c));

  let unknownRequests = 0;
  const unknownUrls: string[] = [];
  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      ...(executablePath ? { executablePath } : {}),
      headless: process.env.PW_HEADLESS === '1',
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    // 网络隔离门禁:只允许本机夹具源与扩展自身资源(chrome-extension://,本地必需);
    // 其余 http(s) 请求(高校域/外网)一律 abort 并计数。
    // G03:合同路径 + 原生延迟清空反例(LZU 形状,本地返回,不出网)。
    const lzuContractHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>信息填报</title></head><body>
<form>
<label for="email">邮箱 SYNTH_NAME_张三</label><input id="email" name="email">
<input id="xm" name="xm"><input id="zjhm" name="zjhm"><input id="mz" name="mz"><input id="rxnf" name="rxnf">
</form>
<script>
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t && t.id === 'xm') { setTimeout(function () { t.value = ''; }, 200); }
    // G06:zjhm 写入后出现"本字段关联"的校验错误(值仍是自动写值)→ 应恢复写前空值。
    if (t && t.id === 'zjhm') {
      setTimeout(function () {
        var box = document.querySelector('.field-validation-error');
        if (!box) { box = document.createElement('div'); box.className = 'field-validation-error'; document.body.appendChild(box); }
        box.textContent = 'SYNTH_TITLE_脱敏论文标题 SYNTH_ADDR_西安市测试路1号 zjhm 证件号码格式错误';
      }, 150);
    }
  }, true);
</script>
</body></html>`;
    // 门禁单处理器:LZU 域一律本地返回(不出网);本机夹具与扩展资源放行;其余中止并计数。
    await context.route('**/*', (route) => {
      const u = route.request().url();
      if (u.startsWith('https://yjszs.lzu.edu.cn/')) {
        void route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: lzuContractHtml });
        return;
      }
      if (u.startsWith(base) || u.startsWith('chrome-extension://')) void route.continue();
      else {
        unknownRequests += 1;
        if (unknownUrls.length < 10) unknownUrls.push(u);
        void route.abort();
      }
    });

    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    const extensionId = new URL(worker.url()).host;

    // 用生产档案页面通道写入 profile(与既有 E2E 相同,避免绕过真实存储)。
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    const semanticsProfile = JSON.parse(JSON.stringify(e2eProfile));
    semanticsProfile.basic.birthday = '2003-05-12';
    semanticsProfile.basic.gender = '男';
    semanticsProfile.basic.address = '陕西省西安市未央区测试路1号';
    await optionsPage.evaluate((value) => chrome.storage.local.set({ profile: value }), e2eProfile);
    await optionsPage.close();

    const formPage = await context.newPage();
    await formPage.goto(`${base}/basic`);
    await formPage.waitForSelector('#tui-panel');
    await formPage.click('#tui-panel [data-act="fill"]');
    await formPage.waitForFunction(() => (document.querySelector('[name="xm"]') as HTMLInputElement | null)?.value === '张三', null, { timeout: 15000 });

    // mustWrite:该写的写对(真实扩展链:识别→任务→写入→回读)。
    const expectations: Array<[string, string]> = [
      ['xm', '张三'],
      ['sjh', '13800000000'],
      ['email', 'zhangsan@example.com'],
      ['byyx', '大连理工大学'],
      ['zy', '软件工程'],
      ['xb', '男'],
      ['mz', '汉族'],
      ['zzmm', '共青团员'],
    ];
    for (const [name, expected] of expectations) {
      const cur = await formPage.locator(`[name="${name}"]`).inputValue();
      assert.equal(cur, expected, `mustWrite: [${name}] 期望 ${expected} 实际 ${JSON.stringify(cur)}`);
    }
    console.log(`PASS: e2e mustWrite ${expectations.length} 项全部写对`);

    // R24:密码/验证码不写;提交/下一步/新增行零点击;不离开当前页。
    assert.equal(await formPage.locator('[name="pwd"]').inputValue(), '', '密码不得自动填写');
    assert.equal(await formPage.locator('[name="yzm"]').inputValue(), '', '验证码不得自动填写');
    const obsState = await formPage.evaluate(() => (window as unknown as { __obsInstalled: boolean; __clicks: Record<string, number> }).__obsInstalled);
    assert.equal(obsState, true, '防提交哨兵监听必须已安装(不能以缺省 0 掩盖漏装)');
    const clicks = await formPage.evaluate(() => (window as unknown as { __clicks: Record<string, number> }).__clicks || {});
    for (const id of ['btnNext', 'btnSubmit', 'btnAddRow']) {
      assert.equal(clicks[id] || 0, 0, `${id} 不得被自动点击`);
    }
    assert.equal(new URL(formPage.url()).pathname, '/basic', '填写后不得自动翻页');
    // 面板在填写结束后恢复可用(可再次点击)。
    await formPage.waitForFunction(() => {
      const b = document.querySelector('#tui-panel [data-act="fill"]') as HTMLButtonElement | null;
      return !!b && !b.disabled;
    }, null, { timeout: 20000 });
    // 锁定档案(R23)仍用于填写,且覆盖了 xm/byyx(上方 mustWrite 已隐式断言)。
    // F02 浏览器语义页:已有不同值保留;同值零事件;日期/单选不覆盖;独立空字段照常填。
    const semOptions = await context.newPage();
    await semOptions.goto(`chrome-extension://${extensionId}/options.html`);
    await semOptions.evaluate((value) => chrome.storage.local.set({ profile: value }), semanticsProfile);
    await semOptions.close();
    const semPage = await context.newPage();
    await semPage.goto(`${base}/semantics`);
    await semPage.waitForSelector('#tui-panel');
    await semPage.click('#tui-panel [data-act="fill"]');
    await semPage.waitForTimeout(2500);
    const sem = await semPage.evaluate(() => ({
      xm: (document.querySelector('[name="xm"]') as HTMLInputElement)?.value,
      sjh: (document.querySelector('[name="sjh"]') as HTMLInputElement)?.value,
      csrq: (document.querySelector('[name="csrq"]') as HTMLInputElement)?.value,
      male: (document.querySelector('input[name="xb"][value="男"]') as HTMLInputElement)?.checked,
      female: (document.querySelector('input[name="xb"][value="女"]') as HTMLInputElement)?.checked,
      txdz: (document.querySelector('[name="txdz"]') as HTMLInputElement)?.value,
      events: (window as unknown as { __semEvents: Record<string, number> }).__semEvents || {},
    }));
    assert.equal(sem.xm, 'PAGE_VALUE', 'F02(Q01): 已有不同姓名必须保留(未被档案覆盖)');
    assert.equal(sem.sjh, '13800000001', 'F02(Q02): 同值手机号保持不变');
    assert.equal(sem.events.sjh || 0, 0, 'F02(Q02): 同值手机号零 input 事件');
    assert.equal(sem.csrq, '2001-01-01', 'F02(Q04): 已有不同日期必须保留');
    assert.equal(sem.female, true, 'F02(Q05): 已选不同性别(女)必须保留');
    assert.equal(sem.male, false, 'F02(Q05): 男不得被自动选中');
    assert.ok(sem.txdz && sem.txdz.length > 0, 'F02: 独立空字段(通讯地址)照常填写');
    await semPage.close();
    // F06:200ms 清空反例——写入后稳定验证必须把该字段转 failed,telemetry 不得报 filled。
    const clearPage = await context.newPage();
    await clearPage.goto(`${base}/clears`);
    await clearPage.waitForSelector('#tui-panel');
    await clearPage.click('#tui-panel [data-act="fill"]');
    await clearPage.waitForTimeout(16500); // 等待全部补填轮次结束(末轮 15s 写入后再清空)
    const clearState = await clearPage.evaluate(() => {
      let telemetry = null;
      try {
        telemetry = JSON.parse(sessionStorage.getItem('tui-fill-telemetry-v1') || 'null');
      } catch { /* ignore */ }
      return {
        xm: (document.querySelector('[name="xm"]') as HTMLInputElement)?.value || '',
        sjh: (document.querySelector('[name="sjh"]') as HTMLInputElement)?.value || '',
        counts: telemetry && telemetry.counts ? telemetry.counts : null,
        events: telemetry && Array.isArray(telemetry.events) ? telemetry.events.map((ev: { reason?: string }) => ev.reason || '') : [],
      };
    });
    assert.equal(clearState.xm, '', 'F06: 被页面持续清空的姓名最终为空(未伪装成功)');
    assert.ok(clearState.sjh === String(e2eProfile.basic.phone), 'F06: 稳定字段正常保留 ' + JSON.stringify(clearState));
    assert.ok(clearState.counts && clearState.counts.failed >= 1, 'F06: telemetry 必须含失败计数 ' + JSON.stringify(clearState.counts));
    assert.ok(clearState.events.some((r: string) => r.includes('未稳定接受')), 'F06: telemetry 事件含"未稳定接受"原因');
    await clearPage.close();
    // F06:真实框架受控组件夹具(react 18.3.1 / vue 3.5.13,本地 vendor,非 CDN)。
    // 期望:框架在 300ms 重置的字段最终为空且不得标 filled;同页对照组字段正常保持。
    for (const [label, url, readyFlag] of [
      ['React', `${base}/react-controlled`, '__reactFixtureReady'],
      ['Vue', `${base}/vue-controlled`, '__vueFixtureReady'],
    ] as const) {
      const fwPage = await context.newPage();
      await fwPage.goto(url);
      await fwPage.waitForFunction((flag) => (window as unknown as Record<string, boolean>)[flag] === true, readyFlag, { timeout: 15000 });
      await fwPage.waitForSelector('#tui-panel');
      await fwPage.click('#tui-panel [data-act="fill"]');
      await fwPage.waitForTimeout(5000); // 覆盖首轮写入 + settle(420ms) + FILL_DONE 收口(1200ms)与一轮补填
      const fw = await fwPage.evaluate(() => {
        const xm = document.querySelector('[name="xm"]') as HTMLInputElement | null;
        const sjh = document.querySelector('[name="sjh"]') as HTMLInputElement | null;
        const email = document.querySelector('[name="email"]') as HTMLInputElement | null;
        let telemetry: { counts?: { failed?: number }; events?: Array<{ reason?: string }> } | null = null;
        try {
          telemetry = JSON.parse(sessionStorage.getItem('tui-fill-telemetry-v1') || 'null');
        } catch { /* ignore */ }
        return {
          xm: xm ? xm.value : 'missing',
          xmMark: xm ? xm.getAttribute('data-tui') : 'missing',
          sjh: sjh ? sjh.value : 'missing',
          sjhMark: sjh ? sjh.getAttribute('data-tui') : 'missing',
          email: email ? email.value : 'missing',
          emailMark: email ? email.getAttribute('data-tui') : 'missing',
          failed: telemetry && telemetry.counts ? telemetry.counts.failed : -1,
          reasons: telemetry && Array.isArray(telemetry.events) ? telemetry.events.map((ev) => ev.reason || '') : [],
        };
      });
      assert.equal(fw.xm, '', `F06[${label}]: 框架重置字段最终为空(未伪装成功) ${JSON.stringify(fw)}`);
      assert.notEqual(fw.xmMark, 'filled', `F06[${label}]: 被框架重置的字段不得标记 filled`);
      assert.equal(fw.sjh, String(e2eProfile.basic.phone), `F06[${label}]: 对照组字段稳定保持`);
      assert.equal(fw.sjhMark, 'filled', `F06[${label}]: 对照组字段应标记 filled`);
      assert.ok((fw.failed ?? 0) >= 1 || fw.reasons.some((r) => r.includes('未稳定接受')), `F06[${label}]: 必须记录未稳定接受 ${JSON.stringify(fw)}`);
      if (label === 'React') {
        // 框架拒绝接受:值被 React 强制回空,扩展不得标记 filled。
        assert.equal(fw.email, '', `F06[React]: 框架拒绝字段最终为空 ${JSON.stringify(fw)}`);
        assert.notEqual(fw.emailMark, 'filled', 'F06[React]: 框架拒绝字段不得标记 filled');
      }
      await fwPage.close();
      console.log(`PASS: F06 ${label} 受控组件夹具通过(重置字段 failed、对照组 filled)`);
    }
    // F07:恢复语义——不可恢复(来源不明)不覆盖、可恢复(已回原值)不残留、恢复过程不触发提交。
    const recPage = await context.newPage();
    await recPage.goto(`${base}/recover-semantics`);
    await recPage.waitForSelector('#tui-panel');
    await recPage.click('#tui-panel [data-act="fill"]');
    await recPage.waitForTimeout(16500); // 等到末轮(15s)稳定校正 + conditionalRestore 执行完毕
    const rec = await recPage.evaluate(() => {
      const q = (n: string): string => (document.querySelector(`[name="${n}"]`) as HTMLInputElement | null)?.value ?? 'missing';
      return {
        xm: q('xm'),
        sjh: q('sjh'),
        email: q('email'),
        submitClicked: (window as unknown as { __submitClicked?: number }).__submitClicked || 0,
      };
    });
    assert.equal(rec.xm, '第三方修改', `F07: 来源不明的修改不得被自动恢复 ${JSON.stringify(rec)}`);
    assert.equal(rec.sjh, '', 'F07: 回到写前空值属可恢复判定(不残留错误值)');
    assert.equal(rec.email, String(e2eProfile.basic.email), 'F07: 对照组字段正常保持');
    assert.equal(rec.submitClicked, 0, 'F07: 恢复过程绝不得触发业务提交');
    await recPage.close();
    console.log('PASS: F07 恢复语义夹具通过(不可恢复不覆盖、可恢复不残留、零提交)');
    // G03:合同路径 + 页面延迟清空 → 最终必须 failed,不得报告成功。
    const lzuProfile = JSON.parse(JSON.stringify(e2eProfile));
    lzuProfile.basic.idCard = '210211200305011233';
    lzuProfile.basic.nation = '汉族';
    lzuProfile.education.startDate = '2022-09';
    const lzuOptions = await context.newPage();
    await lzuOptions.goto(`chrome-extension://${extensionId}/options.html`);
    await lzuOptions.evaluate((value) => chrome.storage.local.set({ profile: value }), lzuProfile);
    await lzuOptions.close();
    const lzuPage = await context.newPage();
    await lzuPage.goto('https://yjszs.lzu.edu.cn/lzuyjsytms/info?token=ASCII_PRIVATE_QUERY');
    await lzuPage.waitForSelector('#tui-panel');
    await lzuPage.click('#tui-panel [data-act="fill"]');
    await lzuPage.waitForTimeout(16800);
    const lzu = await lzuPage.evaluate(() => {
      const q = (id: string): { v: string; mark: string | null } => {
        const el = document.getElementById(id) as HTMLInputElement | null;
        return { v: el ? el.value : 'missing', mark: el ? el.getAttribute('data-tui') : 'missing' };
      };
      let telemetry: { counts?: { filled?: number; failed?: number; total?: number } } | null = null;
      try { telemetry = JSON.parse(sessionStorage.getItem('tui-fill-telemetry-v1') || 'null'); } catch { /* ignore */ }
      return { xm: q('xm'), zjhm: q('zjhm'), mz: q('mz'), counts: telemetry?.counts ?? null };
    });
    assert.equal(lzu.xm.v, '', `G03: 合同字段被页面清空后最终为空 ${JSON.stringify(lzu)}`);
    assert.notEqual(lzu.xm.mark, 'filled', 'G03: 被清空的合同字段不得标记 filled');
    assert.ok((lzu.counts?.failed ?? 0) >= 1, `G03: telemetry 必须记录失败 ${JSON.stringify(lzu.counts)}`);
    // G06:zjhm 出现本字段关联校验错误 → 值虽正确仍判失败,并按驱动策略恢复写前空值。
    assert.equal(lzu.zjhm.v, '', `G06: 关联校验错误出现后应恢复写前空值 ${JSON.stringify(lzu)}`);
    assert.equal(lzu.mz.v, '汉族', 'G03: 无错误的合同字段正常保持');
    // G07a:父字段(院校)在页面缺失 → 依赖者(入学时间)不得写入。
    const rxnf = await lzuPage.evaluate(() => (document.querySelector('#rxnf') as HTMLInputElement | null)?.value ?? 'missing');
    assert.equal(rxnf, '', `G07a: 父失败时依赖字段不得写入 ${JSON.stringify(lzu)}`);
    // I02:合成姓名/标题/地址标记进入页面标签与页面错误容器后,不得出现在任何落盘诊断里。
    const redaction = await lzuPage.evaluate(() => {
      const keys = ['tui-fill-telemetry-v1', 'tui-fill-summary', 'tui-site-scan'];
      const blob = keys.map((k) => sessionStorage.getItem(k) || '').join('|');
      return { blob, markers: ['SYNTH_NAME_张三', 'SYNTH_TITLE_脱敏论文标题', 'SYNTH_ADDR_西安市测试路1号', 'ASCII_PRIVATE_QUERY'].filter((m) => blob.includes(m)), hasFixedLabel: blob.includes('basic.email') };
    });
    assert.deepEqual(redaction.markers, [], `I02: 落盘诊断不得含页面原文/资料标记 ${JSON.stringify(redaction.markers)}`);
    assert.equal(redaction.hasFixedLabel, true, 'I02: 诊断仍保留固定字段标签以便定位');
    await lzuPage.close();
    console.log('PASS: I02 页面原文与资料标记不落诊断通过(遥测/摘要/站点扫描)');
    console.log('PASS: G03 合同路径清空反例通过(最终 failed、稳定字段保持)');
    // G04:档案修订使旧轮失效——改档案后,旧轮的迟到回调不得写入新档案值(不得冒充新轮)。
    const staleProfile = JSON.parse(JSON.stringify(e2eProfile));
    staleProfile.basic.name = 'AAA_OLD';
    const staleOptions = await context.newPage();
    await staleOptions.goto(`chrome-extension://${extensionId}/options.html`);
    await staleOptions.evaluate((value) => chrome.storage.local.set({ profile: value }), staleProfile);
    await staleOptions.close();
    const stalePage = await context.newPage();
    await stalePage.goto(`${base}/basic`);
    await stalePage.waitForSelector('#tui-panel');
    await stalePage.click('#tui-panel [data-act="fill"]');
    await stalePage.waitForFunction(() => (document.querySelector('[name="xm"]') as HTMLInputElement | null)?.value === 'AAA_OLD', null, { timeout: 15000 });
    // 轮次进行中修改档案(触发 profileRevision 变化)。
    const newerProfile = JSON.parse(JSON.stringify(staleProfile));
    newerProfile.basic.name = 'BBB_NEW';
    const newerOptions = await context.newPage();
    await newerOptions.goto(`chrome-extension://${extensionId}/options.html`);
    await newerOptions.evaluate((value) => chrome.storage.local.set({ profile: value }), newerProfile);
    await newerOptions.close();
    await stalePage.waitForTimeout(3200); // 覆盖 2500ms 补填轮次
    const staleName = await stalePage.evaluate(() => (document.querySelector('[name="xm"]') as HTMLInputElement | null)?.value || '');
    assert.equal(staleName, 'AAA_OLD', `G04: 档案修订后旧轮不得写入新档案值(不冒充新轮) ${staleName}`);
    await stalePage.close();
    console.log('PASS: G04 档案修订失效断言通过(旧轮保持原值,不冒充新轮)');
    // H01:首项是合法值(用户点选)不得被覆盖;占位首项仍照常填写(真实扩展链,非 resolver 单测)。
    const h01Profile = JSON.parse(JSON.stringify(e2eProfile));
    h01Profile.basic.gender = '女';
    const h01Options = await context.newPage();
    await h01Options.goto(`chrome-extension://${extensionId}/options.html`);
    await h01Options.evaluate((value) => chrome.storage.local.set({ profile: value }), h01Profile);
    await h01Options.close();
    const h01Page = await context.newPage();
    await h01Page.goto(`${base}/first-option`);
    await h01Page.waitForSelector('#tui-panel');
    await h01Page.click('#tui-panel [data-act="fill"]');
    await h01Page.waitForFunction((email: string) => (document.getElementById('email') as HTMLInputElement | null)?.value === email, String(h01Profile.basic.email), { timeout: 15000 });
    await h01Page.waitForTimeout(600);
    const h01 = await h01Page.evaluate(() => {
      const first = (document.getElementById('xbFirst') as HTMLSelectElement | null)?.value ?? 'missing';
      const placeholder = (document.getElementById('xbPlaceholder') as HTMLSelectElement | null)?.value ?? 'missing';
      const events = (window as unknown as { optEvents: Array<{ id: string }> }).optEvents || [];
      return { first, placeholder, firstEvents: events.filter((e) => e.id === 'xbFirst').length };
    });
    assert.equal(h01.first, '1', `H01: 首项合法值不得被覆盖 ${JSON.stringify(h01)}`);
    assert.equal(h01.firstEvents, 0, `H01: 首项冲突/同值都不得触发写事件 ${JSON.stringify(h01)}`);
    assert.equal(h01.placeholder, '2', `H01: 占位首项必须照常填写(女=2) ${JSON.stringify(h01)}`);
    await h01Page.close();
    console.log('PASS: H01 首项保护浏览器正负例通过(首项保留且零事件、占位首项照常填写)');
    // H03:真实两 frame——顶层快速完成,子 frame 延迟终态(>1200ms);注册未封口前不得提前收口。
    const framePage = await context.newPage();
    await framePage.goto(`${base}/frame-parent`);
    await framePage.waitForSelector('#tui-panel');
    const childFrame = framePage.frames().find((f) => f.url().includes('/frame-child'));
    assert.ok(childFrame, 'H03: 子 frame 必须存在');
    // 子 frame 的 content script 在 document_idle 注入:先等子文档加载完成再触发填充。
    await childFrame!.waitForLoadState('load');
    await framePage.waitForTimeout(900);
    await framePage.click('#tui-panel [data-act="fill"]');
    await framePage.waitForFunction((email: string) => (document.querySelector('[name="email"]') as HTMLInputElement | null)?.value === email, String(e2eProfile.basic.email), { timeout: 15000 });
    await framePage.waitForTimeout(2000);
    const early = await framePage.evaluate(() => document.querySelector('#tui-panel')?.textContent || '');
    const childXm = await childFrame!.evaluate(() => (document.querySelector('[name="xm"]') as HTMLInputElement | null)?.value || '');
    assert.equal(childXm, String(e2eProfile.basic.name), `H03: 子 frame 字段照常填写 ${childXm}`);
    // 子 frame 仍有补填工作(联动下拉)时,顶层不得提前把汇总当作完成。
    assert.ok(!/识别\s*[2-9]/.test(early), `H03: 子 frame 未终态前顶层汇总不得计入其目标 ${early}`);
    await framePage.waitForTimeout(15500);
    const finalText = await framePage.evaluate(() => document.querySelector('#tui-panel')?.textContent || '');
    const frameCounts = await framePage.evaluate(() => JSON.parse(sessionStorage.getItem('tui-fill-telemetry-v1') || 'null')?.counts);
    assert.equal(frameCounts?.total, 5, '复审：顶层遥测必须包含顶层1项与子frame4项，不能只看面板文字');
    const childZy = await childFrame!.evaluate(() => (document.querySelector('[name="zy"]') as HTMLSelectElement | null)?.value || '');
    const childMz = await childFrame!.evaluate(() => (document.querySelector('[name="mz"]') as HTMLSelectElement | null)?.value || '');
    assert.ok(/识别\s*[2-9]/.test(finalText), `H03: 完成后汇总必须包含两 frame 目标 ${finalText}`);
    assert.ok(!/填充未完成/.test(finalText), `H03: 两 frame 全部终态时不得报超时 ${finalText}`);
    assert.ok(/需人工\s*[1-9]/.test(finalText), `H03: 子 frame 失败字段必须计入汇总 ${finalText}`);
    assert.equal(childZy, '软件工程', `H03: 子 frame 延迟出现的选项必须被补填 ${childZy}`);
    assert.equal(childMz, '', `H03: 子 frame 无匹配选项的字段不得被写入 ${childMz}`);
    await framePage.close();
    console.log('PASS: H03 跨 frame 终态协议通过(顶层快速完成、子 frame 延迟终态、汇总含两 frame 且失败可见)');
    // 复审：12秒才出现选项。10秒轮询用尽不能把尚未完成的子frame当终态。
    const slowPage = await context.newPage();
    await slowPage.goto(`${base}/frame-parent?delay=12000`);
    await slowPage.waitForSelector('#tui-panel');
    await slowPage.waitForTimeout(500);
    const slowChild = slowPage.frames().find((frame) => frame.url().includes('/frame-child?delay=12000'));
    assert.ok(slowChild);
    await slowChild!.waitForLoadState('load');
    await slowPage.click('#tui-panel [data-act="fill"]');
    await slowPage.waitForTimeout(10500);
    const beforeSlow = await slowPage.evaluate(() => JSON.parse(sessionStorage.getItem('tui-fill-telemetry-v1') || 'null')?.counts);
    assert.equal(beforeSlow?.total, 1, 'v8: 子frame仍在等待时不得提前公布全页终态');
    await slowPage.waitForTimeout(7000);
    assert.equal(await slowChild!.locator('[name="zy"]').inputValue(), '软件工程');
    const afterSlow = await slowPage.evaluate(() => JSON.parse(sessionStorage.getItem('tui-fill-telemetry-v1') || 'null')?.counts);
    assert.equal(afterSlow?.total, 5);
    assert.equal(afterSlow?.failed, 1, 'v8: 终态必须包含延迟补填后的最新结果，不能冻结补填前的两个失败');
    await slowPage.close();
    console.log('PASS: v8 10秒后仍等待、15秒补填后才发布最新终态');
    // H04:行任务 await 期间换档案 → 旧轮必须停止加行/写入,不得用新档案继续。
    const rowProfile = JSON.parse(JSON.stringify(e2eProfile));
    rowProfile.academicPapers = [];
    rowProfile.academicPatents = [];
    rowProfile.academicProjects = Array.from({ length: 6 }, (_, index) => ({
      kind: '项目', start: '2024-01', end: '2024-06', title: `成果${index + 1}`, source: '测试来源', role: '1/1', authors: '',
      itemType: '', level: '', status: '', summary: '', advisor: '', partition: '',
      state: { id: `e2e-project-${index + 1}`, locked: true, source: 'manual', updatedAt: '2026-01-01T00:00:00.000Z', confidence: 'verified' },
    }));
    const rowOptions = await context.newPage();
    await rowOptions.goto(`chrome-extension://${extensionId}/options.html`);
    await rowOptions.evaluate((value) => chrome.storage.local.set({ profile: value }), rowProfile);
    await rowOptions.close();
    const rowPage = await context.newPage();
    await rowPage.goto(`${base}/rowjobs`);
    await rowPage.waitForSelector('#tui-panel');
    await rowPage.click('#tui-panel [data-act="fill"]');
    await rowPage.waitForFunction(() => (window as unknown as { rowEvents: Array<{ kind: string }> }).rowEvents.some((e) => e.kind === 'input'), null, { timeout: 15000 });
    // 第一行写入后立刻提高档案修订(模拟用户在填写过程中改档案)。
    const changedRowProfile = JSON.parse(JSON.stringify(rowProfile));
    changedRowProfile.academicProjects = changedRowProfile.academicProjects.map((item: { title: string }) => ({ ...item, title: 'BBB_NEW_ROW' }));
    const rowOptions2 = await context.newPage();
    await rowOptions2.goto(`chrome-extension://${extensionId}/options.html`);
    await rowOptions2.evaluate((value) => chrome.storage.local.set({ profile: value }), changedRowProfile);
    await rowOptions2.close();
    await rowPage.waitForTimeout(5000);
    const rowState = await rowPage.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#achievementTable tbody tr')).slice(1);
      const values = rows.flatMap((row) => Array.from(row.querySelectorAll('input')).map((input) => (input as HTMLInputElement).value));
      return { rows: rows.length, nonEmpty: values.filter((value) => value.trim()).length, hasNew: values.some((value) => value.includes('BBB_NEW_ROW')) };
    });
    assert.ok(rowState.rows < 6, `H04: 换档案后旧轮必须停止加行 ${JSON.stringify(rowState)}`);
    assert.equal(rowState.hasNew, false, `H04: 旧轮不得写入新档案值 ${JSON.stringify(rowState)}`);
    // J00:换档案应"及时以取消类别停止",而不是让旧轮继续跑、最后被后台误报 25 秒超时。
    const cancelState = await rowPage.evaluate(() => ({
      panel: document.querySelector('#tui-panel')?.textContent || '',
      lifeKind: (() => {
        try { return JSON.parse(sessionStorage.getItem('tui-fill-telemetry-v1') || 'null')?.stage || ''; } catch { return ''; }
      })(),
    }));
    assert.ok(/已取消|已停止|已取代/.test(cancelState.panel), `J00: 换档案后必须明确提示本轮已停止 ${JSON.stringify(cancelState)}`);
    assert.equal(/页面无响应/.test(cancelState.panel), false, `J00: 主动取消不得被报成页面无响应 ${JSON.stringify(cancelState)}`);
    await rowPage.close();
    console.log('PASS: H04 行任务 await 期间换档案停止写入通过');
    console.log('PASS: J00 换档案及时取消提示通过(非超时)');
    // H04:picker await 期间换档案 → 不得再点击弹窗结果行,也不得写入代码/名称。
    const pickerProfile = JSON.parse(JSON.stringify(e2eProfile));
    pickerProfile.education.university = '测试大学';
    const pickerOptions = await context.newPage();
    await pickerOptions.goto(`chrome-extension://${extensionId}/options.html`);
    await pickerOptions.evaluate((value) => chrome.storage.local.set({ profile: value }), pickerProfile);
    await pickerOptions.close();
    const pickerPage = await context.newPage();
    await pickerPage.goto(`${base}/picker-page`);
    await pickerPage.waitForSelector('#tui-panel');
    await pickerPage.click('#tui-panel [data-act="fill"]');
    await pickerPage.waitForFunction(() => (window as unknown as { pickerEvents: Array<{ kind: string }> }).pickerEvents.some((e) => e.kind === 'trigger'), null, { timeout: 15000 });
    const changedPickerProfile = JSON.parse(JSON.stringify(pickerProfile));
    changedPickerProfile.basic.email = 'picker-new@example.invalid';
    const pickerOptions2 = await context.newPage();
    await pickerOptions2.goto(`chrome-extension://${extensionId}/options.html`);
    await pickerOptions2.evaluate((value) => chrome.storage.local.set({ profile: value }), changedPickerProfile);
    await pickerOptions2.close();
    await pickerPage.waitForTimeout(6000);
    const pickerState = await pickerPage.evaluate(() => ({
      events: (window as unknown as { pickerEvents: Array<{ kind: string }> }).pickerEvents.map((e) => e.kind),
      code: (document.getElementById('txtBkbydwm') as HTMLInputElement | null)?.value || '',
      name: (document.getElementById('txtBkbydwmc') as HTMLInputElement | null)?.value || '',
    }));
    assert.equal(pickerState.events.includes('choose'), false, `H04: 换档案后 picker 不得再点击结果行 ${JSON.stringify(pickerState)}`);
    assert.equal(pickerState.code, '', `H04: 换档案后 picker 不得写入代码 ${JSON.stringify(pickerState)}`);
    assert.equal(pickerState.name, '', `H04: 换档案后 picker 不得写入名称 ${JSON.stringify(pickerState)}`);
    await pickerPage.close();
    console.log('PASS: H04 picker await 期间换档案停止写入通过');
    console.log('PASS: e2e 安全与所有权断言通过(密码/验证码/按钮零副作用)');
  } finally {
    await context?.close();
    await new Promise<void>((ok) => server.close(() => ok()));
    rmSync(userDataDir, { recursive: true, force: true });
  }
  assert.equal(unknownRequests, 0, `出现 ${unknownRequests} 次未声明网络请求(网络隔离门禁失败): ${unknownUrls.join(', ')}`);
  console.log('PASS: 网络隔离门禁生效(0 次未知请求)');
  console.log('P01 扩展 E2E 回归全部通过 ✅');
}

main().catch((err) => {
  console.error('P01 扩展 E2E 回归失败:', err);
  process.exit(1);
});
