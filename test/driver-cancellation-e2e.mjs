// 浏览器中的真实生产 driver 测试；DOM 协议夹具，不冒充真实 Ant/Element 框架或完整扩展链。
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { existsSync, writeFileSync } from 'node:fs';

const source = await build({ stdin: { contents: "export { pickComponentOption } from './src/core/component-select-drivers'; export { fillDateControlAsync } from './src/core/date-drivers'; export { pickBlueFlatIdentity } from './src/core/blue-flat-picker-driver'; export { pickInPage } from './src/core/filler';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'browser', format: 'iife', globalName: 'reviewDrivers', write: false });
const executablePath = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const context = await browser.newContext();
let external = 0;
await context.route('**/*', (route) => { external++; return route.abort(); });
const results = [];
const ignoreCancellation = process.argv.includes('--ignore-cancellation');
try {
  const specs = [
    ['ant', 'ant-select', 'ant-select-selector', 'ant-select-selection-search-input', 'ant-select-dropdown', 'ant-select-item-option'],
    ['select2', 'select2-container', 'select2-selection', 'select2-search__field', '', 'select2-results__option'],
    ['element', 'el-select', 'el-select__wrapper', 'el-select__input', '', 'el-select-dropdown__item'],
    ['layui', 'layui-form-select', 'layui-select-title', 'layui-input', 'layui-anim-upbit', ''],
  ];
  for (const [kind, root, opener, search, menu, option] of specs) for (const mode of ['normal', 'cancel', 'detach']) {
    const page = await context.newPage();
    await page.setContent(`<div class="${root}"><button id="opener" class="${opener}">展开</button><input id="anchor" class="${search}"><select id="model" hidden><option value="">请选择</option><option value="61">陕西省</option></select><dl class="${menu}"><dd id="option" class="${option}" aria-selected="false" data-value="61" lay-value="61">陕西省</dd></dl></div>`);
    await page.addScriptTag({ content: source.outputFiles[0].text });
    const state = await page.evaluate(async ({ kind, mode, ignoreCancellation }) => {
      let cancelled = false; const events = []; const anchor = document.querySelector('#anchor');
      anchor.addEventListener('input', () => events.push('search'));
      document.querySelector('#option').addEventListener('click', () => { events.push('choose'); document.querySelector('#model').value = '61'; });
      if (mode !== 'normal') setTimeout(() => { cancelled = true; if (mode === 'detach') anchor.remove(); }, 50);
      const result = await reviewDrivers.pickComponentOption(anchor, '陕西省', { componentDriver: kind, expectedCode: '61' }, () => ignoreCancellation ? false : cancelled);
      return { result: result.status, events, model: document.querySelector('#model').value };
    }, { kind, mode, ignoreCancellation });
    if (mode === 'normal') { assert.equal(state.result, 'picked'); assert.equal(state.model, '61'); assert.ok(state.events.includes('choose')); }
    else { assert.equal(state.events.length, 0, `${kind}/${mode}: 取消/移除后不得搜索或选择`); assert.equal(state.model, ''); }
    results.push({ kind, mode, ...state }); await page.close();
    console.log(`PASS component driver: ${kind}/${mode}`);
  }
  for (const mode of ['normal', 'panel-success', 'cancel-early', 'cancel-panel', 'detach']) {
    const page = await context.newPage();
    await page.setContent('<input id="date"><div id="calendar"><button id="day">2</button><button id="confirm">确定</button></div>');
    await page.addScriptTag({ content: source.outputFiles[0].text });
    const state = await page.evaluate(async ({ mode, ignoreCancellation }) => {
      let cancelled = false; const events = []; const input = document.querySelector('#date');
      input.addEventListener('input', () => { events.push('write'); if (mode !== 'normal' && events.filter((e) => e === 'write').length === 1) input.value = ''; });
      input.addEventListener('click', () => { events.push('open'); if (mode === 'cancel-panel') setTimeout(() => { cancelled = true; }, 20); });
      document.querySelector('#day').addEventListener('click', () => { events.push('choose'); input.value = '2024-01-02'; });
      document.querySelector('#confirm').addEventListener('click', () => events.push('confirm'));
      if (mode === 'cancel-early' || mode === 'detach') setTimeout(() => { cancelled = true; if (mode === 'detach') input.remove(); }, 100);
      const result = await reviewDrivers.fillDateControlAsync(input, '2024-01-02', { precision: 'day', panelSelectors: ['#calendar'] }, () => ignoreCancellation ? false : cancelled);
      return { ok: result.ok, events, value: input.value };
    }, { mode, ignoreCancellation });
    if (mode === 'normal' || mode === 'panel-success') { assert.equal(state.ok, true); assert.equal(state.value, '2024-01-02'); }
    else { assert.equal(state.ok, false); assert.equal(state.events.includes('choose'), false); assert.equal(state.events.includes('confirm'), false); assert.equal(state.events.filter((e) => e === 'write').length, 1, `${mode}: 取消后不得再次写日期`); }
    results.push({ kind: 'date', mode, ...state }); await page.close();
    console.log(`PASS date driver: ${mode}`);
  }
  // I01:BlueFlat 蓝色系统身份选择——搜索/分类/结果点选/代码回填等待都必须可取消。
  for (const mode of ['normal', 'cancel', 'detach']) {
    const page = await context.newPage();
    const pickerBody = `<html><body><input id="kw" type="text"><button id="query">查询</button><table><tr><td>10700</td><td>测试大学</td><td><button id="rowChoose">选择</button></td></tr></table></body></html>`;
    await page.setContent('<div><input id="code"><input id="name"><input id="display"><a id="trigger" href="javascript:void(0)">选择</a><iframe name="Picker" srcdoc="' + pickerBody.replace(/"/g, '&quot;') + '"></iframe></div>');
    await page.addScriptTag({ content: source.outputFiles[0].text });
    const state = await page.evaluate(async ({ mode, ignoreCancellation }) => {
      let cancelled = false; let cancelledAt = Infinity; const events = [];
      const frame = document.querySelector('iframe');
      const fdoc = frame.contentDocument;
      fdoc.querySelector('#query').addEventListener('click', () => events.push({ kind: 'search', at: performance.now() }));
      fdoc.querySelector('#rowChoose').addEventListener('click', () => {
        events.push({ kind: 'choose', at: performance.now() });
        document.querySelector('#code').value = '10700';
        document.querySelector('#name').value = '测试大学';
        document.querySelector('#display').value = '10700 测试大学';
      });
      // 取消发生在 driver 已进入流程之后:只要求"取消之后"不再搜索/选择/回填。
      if (mode !== 'normal') setTimeout(() => { cancelled = true; cancelledAt = performance.now(); if (mode === 'detach') document.querySelector('#code').remove(); }, 50);
      const result = await reviewDrivers.pickBlueFlatIdentity(document, '测试大学', {
        pickerProtocol: 'blue-flat',
        triggerSelectors: ['#trigger'],
        frameNames: ['Picker'],
        codeSelectors: ['#code'],
        nameSelectors: ['#name'],
        displaySelectors: ['#display'],
        expectedCode: '10700',
      }, () => ignoreCancellation ? false : cancelled);
      return { result, events, afterCancel: events.filter((e) => e.at >= cancelledAt).map((e) => e.kind), code: document.querySelector('#code')?.value || '' };
    }, { mode, ignoreCancellation });
    if (mode === 'normal') { assert.equal(state.result, 'picked'); assert.ok(state.events.some((e) => e.kind === 'choose')); assert.equal(state.code, '10700'); }
    else {
      assert.equal(state.afterCancel.includes('search'), false, `blue-flat/${mode}: 取消后不得再搜索`);
      assert.equal(state.afterCancel.includes('choose'), false, `blue-flat/${mode}: 取消后不得选择结果行`);
      assert.equal(state.code, '', `blue-flat/${mode}: 取消后不得回填代码`);
    }
    results.push({ kind: 'blue-flat', mode, ...state }); await page.close();
    console.log(`PASS blue-flat driver: ${mode}`);
  }
  // I01:组件下拉(jqx 形状)取消后不得再搜索/点选/写隐藏代码。
  for (const mode of ['normal', 'cancel']) {
    const page = await context.newPage();
    await page.setContent('<div id="widget" data-tui-widget="dropdown" data-tui-widget-key="k">请选择</div><input id="model" data-tui-widget="dropdown-value" data-tui-widget-key="k"><div role="option" id="opt">男</div>');
    await page.addScriptTag({ content: source.outputFiles[0].text });
    const state = await page.evaluate(async ({ mode, ignoreCancellation }) => {
      let cancelled = false; let cancelledAt = Infinity; const events = [];
      document.querySelector('#opt').addEventListener('click', () => {
        events.push({ kind: 'choose', at: performance.now() });
        document.querySelector('#model').value = '男';
        document.querySelector('#widget').textContent = '男';
      });
      if (mode !== 'normal') setTimeout(() => { cancelled = true; cancelledAt = performance.now(); }, 50);
      const result = await reviewDrivers.pickInPage(document, document.querySelector('#widget'), '男', undefined, () => ignoreCancellation ? false : cancelled);
      return { result, afterCancel: events.filter((e) => e.at >= cancelledAt).map((e) => e.kind), model: document.querySelector('#model').value };
    }, { mode, ignoreCancellation });
    if (mode === 'normal') { assert.equal(state.model, '男', 'widget/normal: 正常点选须写入隐藏值'); }
    else { assert.equal(state.afterCancel.includes('choose'), false, 'widget/cancel: 取消后不得点选选项'); assert.equal(state.model, '', 'widget/cancel: 取消后不得写隐藏代码'); }
    results.push({ kind: 'widget-dropdown', mode, ...state }); await page.close();
    console.log(`PASS widget dropdown: ${mode}`);
  }
  assert.equal(external, 0);
  if (process.env.DRIVER_EVIDENCE_FILE) writeFileSync(process.env.DRIVER_EVIDENCE_FILE, JSON.stringify({ results, external }, null, 2));
} finally { await browser.close(); }
