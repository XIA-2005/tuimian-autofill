// 蓝色报名系统学校/专业三联选择器：代码框、名称框、展示框必须作为一个整体写入和回读。

import { dispatchValueEvents } from './event-policy';
import { PopupPickContext } from './popup-binding';
import { sanitizeDiagnosticValue } from './fill-telemetry';

export type BlueFlatPickStatus = 'picked' | 'opened' | 'failed' | 'not-applicable';

interface BlueFlatBinding {
  code: HTMLInputElement;
  name: HTMLInputElement;
  display: HTMLInputElement;
}

interface ParsedIdentity {
  code: string;
  name: string;
}

interface PickerScope {
  doc: Document;
  root: HTMLElement;
}

interface RowHit extends ParsedIdentity {
  control: HTMLElement;
  score: number;
}

interface OptionHit extends ParsedIdentity {
  select: HTMLSelectElement;
  option: HTMLOptionElement;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function visible(el: Element): boolean {
  const html = el as HTMLElement;
  if (html.hidden) return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(html);
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  const rect = html.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0 || !!html.offsetParent;
}

function normalized(value: string): string {
  return value
    .replace(/^[\s|｜]*[a-z0-9._-]{4,20}[\s|｜:：-]*/i, '')
    .replace(/（[^）]*）|\([^)]*\)/g, '')
    .replace(/[\s|｜·]/g, '')
    .toLowerCase();
}

/** 功能：归一化省级行政区名称，兼容”陕西/陕西省””广西/广西壮族自治区”等写法。 */
function normalizedCascade(value: string): string {
  return normalized(value).replace(/(壮族|回族|维吾尔)?自治区$|特别行政区$|省$|市$/g, '');
}

/**
 * 功能：名称模糊匹配，兼容简写/别名。
 * 规则：去掉”大学/学院/学校”后，看短串是否是长串的子串。
 * 例：”南京航空航天大学”≈”南京航空大学”，”中国科学技术大学”≈”中科大”。
 */
function fuzzyMatch(actual: string, wanted: string): boolean {
  if (!actual || !wanted) return false;
  const strip = (s: string) => s.replace(/大学|学院|学校$/g, '').replace(/[\s（）()·]/g, '').toLowerCase();
  const a = strip(actual), w = strip(wanted);
  if (!a || !w) return false;
  return a.startsWith(w) || w.startsWith(a) || levenshtein(a, w) <= Math.floor(Math.min(a.length, w.length) / 4);
}

/** 功能：计算两个字符串的编辑距离（Levenshtein）。 */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  }
  return dp[m][n];
}

/** 功能：写入不含档案值的蓝色选择器诊断，便于区分“未弹出、级联失败、回读失败”。 */
function writeBlueDebug(doc: Document, context: PopupPickContext, stages: string[], result: BlueFlatPickStatus): void {
  try {
    const store = doc.defaultView?.sessionStorage;
    if (!store) return;
    let entries: Array<Record<string, unknown>> = [];
    try {
      entries = JSON.parse(store.getItem('tui-pick-debug') || '[]') as Array<Record<string, unknown>>;
    } catch {
      entries = [];
    }
    entries.push({
      at: Date.now(),
      driver: 'blue-flat',
      field: context.profilePath || '',
      attempts: stages,
      opened: stages.includes('scope-found'),
      result,
    });
    store.setItem('tui-pick-debug', JSON.stringify(sanitizeDiagnosticValue(entries.slice(-10))));
  } catch {
    // 某些隐私模式禁止访问 sessionStorage；诊断失败不能影响填表。
  }
}

/**
 * 功能：拆分蓝色系统使用的“代码 名称”身份串。
 * 原理：显式代码优先；否则取最后一个紧邻中文名称的 5/6 位代码，避免“省份|代码 校名”被拼成脏展示值。
 */
function parseIdentity(value: string, expectedCode = ''): ParsedIdentity {
  const raw = String(value || '').trim();
  const pairs = Array.from(raw.matchAll(/(?:^|[\s|｜])([a-z0-9._-]{4,20})\s+([\u4e00-\u9fff].*)/gi));
  const pair = pairs[pairs.length - 1];
  const code = String(expectedCode || pair?.[1] || '').trim();
  let name = String(pair?.[2] || raw).trim();
  if (code) name = name.replace(new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`), '').trim();
  name = name.replace(/^[^\u4e00-\u9fff]*(?=[\u4e00-\u9fff])/, '').replace(/（注[:：][^）]*）/g, '').trim();
  return { code, name };
}

function firstInput(doc: Document, selectors: string[] | undefined): HTMLInputElement | null {
  for (const selector of selectors || []) {
    try {
      const hit = doc.querySelector(selector);
      if (hit instanceof doc.defaultView!.HTMLInputElement) return hit;
    } catch {
      // 声明式适配包已校验；这里继续防御运行时 DOM 变化。
    }
  }
  return null;
}

/** 功能：只接受适配包明确声明的蓝色三联字段，禁止从整页猜测并串写其他代码框。 */
function resolveBinding(doc: Document, context: PopupPickContext): BlueFlatBinding | null {
  const code = firstInput(doc, context.codeSelectors);
  const name = firstInput(doc, context.nameSelectors);
  const display = firstInput(doc, context.displaySelectors);
  if (!code || !name || !display || code === name || code === display || name === display) return null;
  return { code, name, display };
}

function setInput(input: HTMLInputElement, value: string): void {
  const win = input.ownerDocument.defaultView;
  const setter = Object.getOwnPropertyDescriptor(win?.HTMLInputElement.prototype || HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  // A1:派发收敛至 event-policy（tail=blur-bubble 与原三事件逐字面等价）。
  dispatchValueEvents(input, { tail: 'blur-bubble' });
}

/**
 * 功能：完整回读三联字段，兼容 chooser 结果保留。
 * 原理：
 *  - 代码必须是纯码；名称必须含中文；展示框同时含两者。
 *  - 与 expected 比对时：若码完全匹配则允许多义词（简写/别名）通过；
 *    若码尚未填充但已含 expected 关键词，也认为是 chooser 已触发，保留其结果。
 *  这样做的好处：避免在 chooser 填充后再次以纯文本覆盖，保持"服务端选中"数据。
 */
function verifyBinding(binding: BlueFlatBinding, expected: ParsedIdentity): boolean {
  const code = binding.code.value.trim();
  const name = binding.name.value.trim();
  const display = binding.display.value.trim();
  if (!/^[a-z0-9._-]{4,20}$/i.test(code) || !/[\u4e00-\u9fff]{2,}/.test(name)) return false;
  // 码必须完全匹配；若已有码则不能被覆盖
  if (expected.code && code !== expected.code) return false;
  const wantedName = normalized(expected.name);
  const actualName = normalized(name);
  if (!wantedName) return true; // 无名称目标，保留 chooser 填入的任何结果
  // 名称兼容多义词：精确/包含/被包含
  const nameOk = !wantedName || !actualName || actualName === wantedName
    || actualName.includes(wantedName) || wantedName.includes(actualName)
    || fuzzyMatch(actualName, wantedName);
  if (!nameOk) return false;
  // 展示框可包含代码和名称关键词之一即可通过（某些系统展示框格式不同）
  return display.includes(code) || normalized(display).includes(wantedName) || normalized(display).includes(actualName);
}

/** 功能：供声明式填充阶段复用完整三联回读，避免只凭隐藏代码和名称误报成功。 */
export function verifyBlueFlatContext(doc: Document, value: string, context: PopupPickContext): boolean {
  const binding = resolveBinding(doc, context);
  return !!binding && verifyBinding(binding, parseIdentity(value, context.expectedCode));
}

function click(element: HTMLElement): void {
  const MouseCtor = element.ownerDocument.defaultView?.MouseEvent || MouseEvent;
  element.dispatchEvent(new MouseCtor('mousedown', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new MouseCtor('mouseup', { bubbles: true, cancelable: true }));
  // `.click()` 会执行 input[type=image]、链接默认行为和页面主世界的内联 onclick；
  // 仅 dispatchEvent(new MouseEvent('click')) 在部分 Edge 页面不会触发控件激活行为。
  element.click();
}

function findTrigger(doc: Document, selectors: string[] | undefined): HTMLElement | null {
  for (const selector of selectors || []) {
    try {
      const hit = Array.from(doc.querySelectorAll<HTMLElement>(selector)).find(visible);
      if (hit) return hit;
    } catch {
      // 忽略页面结构变化后的无效选择器。
    }
  }
  return null;
}

function wildcard(pattern: string): RegExp {
  return new RegExp(pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'), 'i');
}

function frameToken(frame: HTMLIFrameElement): string {
  let liveUrl = '';
  try {
    liveUrl = frame.contentDocument?.location.href || '';
  } catch {
    // 跨域 frame 只能使用元素属性判断。
  }
  return `${frame.id} ${frame.name} ${frame.getAttribute('src') || ''} ${liveUrl}`;
}

function declaredFrame(frame: HTMLIFrameElement, context: PopupPickContext, patterns: RegExp[]): boolean {
  const token = frameToken(frame);
  return (context.frameNames || []).some((name) => token.toLowerCase().includes(name.toLowerCase())) || patterns.some((pattern) => pattern.test(token));
}

function looksLikePicker(root: HTMLElement): boolean {
  const text = (root.textContent || '').replace(/\s+/g, ' ').slice(0, 1200);
  return !!root.querySelector('select,table,[role="listbox"],[role="tree"],[onclick]') || /(查询|搜索|选择|选取|确定|学校|院校|专业)/.test(text);
}

/**
 * 扩展自身 UI 容器：这些元素永远不是页面的选择器弹层。
 * 面板运行日志会显示“弹窗选择框…”等文案且 class/id 命中 [class*="panel"] 弹层选择器，
 * 若不排除会被误判成“选择器已打开”，触发按钮永远不会被点击（合工大教育步骤 scope-found→exhausted 的根因）。
 */
const EXTENSION_UI_SEL = '[id^="tui-"], [class*="tui-panel"], [class*="tui-banner"], [class*="tui-fill-banner"]';

/** 功能：定位 chooseSch/chooseZy 打开的同源 iframe，以及常见 UI 框架的页内弹层。 */
function pickerScopes(doc: Document, context: PopupPickContext): PickerScope[] {
  const scopes: PickerScope[] = [];
  const seen = new Set<HTMLElement>();
  const add = (scopeDoc: Document, root: HTMLElement): void => {
    if (seen.has(root)) return;
    if (root.closest(EXTENSION_UI_SEL)) return;
    if (visible(root) && looksLikePicker(root)) {
      seen.add(root);
      scopes.push({ doc: scopeDoc, root });
    }
  };
  const patterns = (context.frameSrcPatterns || []).map(wildcard);
  const constrained = !!(context.frameNames?.length || context.frameSrcPatterns?.length);
  for (const frame of Array.from(doc.querySelectorAll<HTMLIFrameElement>('iframe'))) {
    const declared = declaredFrame(frame, context, patterns);
    const layerFrame = !!frame.closest('.layui-layer,.layui-layer-iframe,.bh-dialog,[role="dialog"],.emap-dialog,.jqx-window,.modal,.bh-modal');
    try {
      // 有学校专项契约时只接受该字段声明的 frame，防止专业任务复用尚未关闭的院校 SelUniversity。
      const body = frame.contentDocument?.body;
      if (body && (constrained ? declared : (declared || layerFrame || looksLikePicker(body)))) add(frame.contentDocument!, body);
    } catch {
      // 跨域弹窗不可读取，保留为已打开并交给用户手动选择。
    }
  }
  const dialogSelector = '.layui-layer,.bh-dialog,[role="dialog"],.emap-dialog,.jqx-window,.modal,.bh-modal,[class*="window"],[class*="panel"],[class*="layer"],[class*="modal"]';
  for (const root of Array.from(doc.querySelectorAll<HTMLElement>(dialogSelector))) {
    if (constrained) {
      const childFrames = Array.from(root.querySelectorAll<HTMLIFrameElement>('iframe'));
      if (childFrames.length && !childFrames.some((frame) => declaredFrame(frame, context, patterns))) continue;
    }
    add(doc, root);
  }
  return scopes;
}

function setSelectOption(select: HTMLSelectElement, option: HTMLOptionElement): void {
  const win = select.ownerDocument.defaultView;
  const setter = Object.getOwnPropertyDescriptor(win?.HTMLSelectElement.prototype || HTMLSelectElement.prototype, 'value')?.set;
  if (setter) setter.call(select, option.value);
  else select.value = option.value;
  // A1:派发收敛至 event-policy（tail=none 与原两件套逐字面等价）。
  dispatchValueEvents(select, { tail: 'none' });
}

function exactOption(select: HTMLSelectElement, value: string, cascade = false): HTMLOptionElement | null {
  const wanted = cascade ? normalizedCascade(value) : normalized(value);
  if (!wanted) return null;
  return Array.from(select.options).find((option) => {
    if (option.disabled || !option.value || /^(请选择|选择|--)/.test((option.textContent || '').trim())) return false;
    const text = option.textContent || '';
    const candidates = [text, ...text.split(/[|｜,，;；]/).reverse()];
    return candidates.some((candidate) => (cascade ? normalizedCascade(candidate) : normalized(candidate)) === wanted);
  }) || null;
}

/** 功能：从同一个学校选项中同时读取目标系统代码和名称，避免名称与其他行的代码拼接。 */
function optionIdentity(option: HTMLOptionElement, expected: ParsedIdentity): ParsedIdentity | null {
  const text = (option.textContent || '').replace(/\s+/g, ' ').trim();
  const parsed = parseIdentity(text);
  const rawAttributes = [option.value, option.getAttribute('data-value') || '', option.getAttribute('data-code') || ''];
  const attrCode = expected.code && rawAttributes.some((item) => item.includes(expected.code))
    ? expected.code
    : rawAttributes.map((item) =>
        (/^[a-z0-9._-]{4,20}$/i.test(item) && !/^(0|-1|请选择)$/i.test(item) ? item : (item.match(/(?:^|[^0-9])(\d{5})(?=$|[^0-9])/) || [])[1] || ''),
      ).find(Boolean) || '';
  const code = parsed.code || attrCode || expected.code;
  const nameParts = text.split(/[|｜,，;；]/).map((item) => item.trim()).filter(Boolean);
  const name = nameParts.find((item) => normalized(item) === normalized(expected.name)) || parsed.name || text;
  if (expected.code && code && expected.code !== code) return null;
  if (normalized(name) !== normalized(expected.name)) return null;
  return code ? { code, name: expected.name || name } : null;
}

function confirmButton(scope: PickerScope): HTMLElement | null {
  return Array.from(scope.root.querySelectorAll<HTMLElement>('a,button,input[type="button"],[role="button"],span')).find((item) => {
    if (!visible(item)) return false;
    const text = (item.textContent || item.getAttribute('value') || '').replace(/\s+/g, '').trim();
    return /^(确定|确认|完成|选中)$/.test(text) && !/(保存|下一步|提交|锁定)/.test(text);
  }) || null;
}

/**
 * 功能：定位与当前选择器 iframe 一一对应的外层确认按钮。
 * 原理：北科大院校结果位于 universitySelectPage iframe，而 Layui 的“确定”按钮位于父文档弹层；
 * 仅沿当前 iframe 向上查找所属弹层，不扫描页面上的其他按钮，避免误点保存、下一步或提交。
 */
function pickerConfirmButton(doc: Document, scope: PickerScope): HTMLElement | null {
  const local = confirmButton(scope);
  if (local) return local;
  if (scope.doc === doc) return null;

  const frame = Array.from(doc.querySelectorAll<HTMLIFrameElement>('iframe')).find((candidate) => {
    try {
      return candidate.contentDocument === scope.doc;
    } catch {
      return false;
    }
  });
  if (!frame) return null;

  const layer = frame.closest<HTMLElement>(
    '.layui-layer,.layui-layer-iframe,.bh-dialog,[role="dialog"],.emap-dialog,.jqx-window,.modal,.bh-modal',
  );
  return layer && visible(layer) ? confirmButton({ doc, root: layer }) : null;
}

/** 功能：识别搜索结果是否已经被页面标记为当前选中项，用于保留可诊断的选择阶段。 */
function resultSelected(control: HTMLElement): boolean {
  const selectedSelector = '.choosen,.chosen,.selected,.active,.layui-this,[aria-selected="true"],[aria-checked="true"]';
  return control.matches(selectedSelector) || !!control.closest(selectedSelector);
}

async function waitBinding(binding: BlueFlatBinding, expected: ParsedIdentity, polls = 10): Promise<boolean> {
  for (let index = 0; index < polls; index++) {
    if (verifyBinding(binding, expected)) return true;
    await delay(200);
  }
  return verifyBinding(binding, expected);
}

function exactNode(scope: PickerScope, value: string): HTMLElement | null {
  const wanted = normalized(value);
  const candidates = Array.from(scope.root.querySelectorAll<HTMLElement>('li,a,button,[role="option"],[role="treeitem"],td,span[onclick],div[onclick]'));
  return candidates.find((item) => {
    if (!visible(item)) return false;
    const text = (item.textContent || '').replace(/\s+/g, ' ').trim();
    return normalized(text) === wanted;
  }) || null;
}

/**
 * 功能：执行“省份 → 本科院校”的逐级选择。
 * 原理：每一级都按显示名称精确匹配，叶子选项携带的代码与名称作为同一原子结果写入；无可靠代码时不直写隐藏框。
 */
async function pickCascade(
  doc: Document,
  binding: BlueFlatBinding,
  expected: ParsedIdentity,
  context: PopupPickContext,
  stages: string[],
): Promise<boolean> {
  // 弹窗已具备“关键字+查询”能力、又没有级联下拉或级联标签时，逐级点选没有着力点：
  // 结果表行由下方搜索路径的 findRow 精确处理（裸文本格不是可激活控件，点击无效果），
  // 直接交给搜索路径，避免 16 轮空转烧掉整轮时间预算。
  const hasVisibleSelect = pickerScopes(doc, context).some((scope) =>
    Array.from(scope.root.querySelectorAll('select')).some(visible),
  );
  const hasSearchable = pickerScopes(doc, context).some((scope) => !!queryInput(scope) && !!queryButton(scope));
  if (!(context.cascadeLabels || []).length && !hasVisibleSelect && hasSearchable) return false;

  const chooseLeaf = async (): Promise<boolean> => {
    for (const scope of pickerScopes(doc, context)) {
      const selects = Array.from(scope.root.querySelectorAll<HTMLSelectElement>('select')).filter(visible);
      for (const select of selects) {
        const option = exactOption(select, expected.name);
        if (!option) continue;
        const identity = optionIdentity(option, expected);
        if (!identity) {
          stages.push('cascade-leaf-no-code');
          continue;
        }
        setSelectOption(select, option);
        stages.push('cascade-leaf');
        if (await waitBinding(binding, identity, 3)) return true;
        const confirm = pickerConfirmButton(doc, scope);
        if (confirm) {
          click(confirm);
          if (scope.doc !== doc) stages.push('layer-confirm');
          stages.push('cascade-confirm');
          if (await waitBinding(binding, identity, 8)) return true;
        }
        return writeBinding(binding, identity);
      }

      const node = exactNode(scope, expected.name);
      if (node) {
        click(node);
        stages.push('cascade-leaf-node');
        if (await waitBinding(binding, expected, 4)) return true;
        const confirm = pickerConfirmButton(doc, scope);
        if (confirm) {
          click(confirm);
          if (scope.doc !== doc) stages.push('layer-confirm');
          stages.push('cascade-confirm');
          if (await waitBinding(binding, expected, 8)) return true;
        }
        // 节点没有可靠代码时，只信任网站自身完成的三联回填。
        if (expected.code && writeBinding(binding, expected)) return true;
      }
    }
    return false;
  };

  for (const label of context.cascadeLabels || []) {
    let selected = false;
    for (const scope of pickerScopes(doc, context)) {
      for (const select of Array.from(scope.root.querySelectorAll<HTMLSelectElement>('select')).filter(visible)) {
        const option = exactOption(select, label, true);
        if (!option) continue;
        setSelectOption(select, option);
        stages.push('cascade-parent');
        selected = true;
        break;
      }
      if (!selected) {
        const node = exactNode(scope, label);
        if (node) {
          click(node);
          stages.push('cascade-parent-node');
          selected = true;
        }
      }
      if (selected) break;
    }
    if (selected) await delay(350);
  }

  if (await chooseLeaf()) return true;

  // 档案没有省份时，识别“省级行政区”下拉并逐项探测其学校子列表。
  // 只改变弹窗内下拉，不触碰主表单，也不点击任何保存/下一步/提交按钮。
  if (!(context.cascadeLabels || []).length) {
    const provincePattern = /^(北京|天津|上海|重庆|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|台湾|内蒙古|广西|西藏|宁夏|新疆)(省|市|壮族自治区|回族自治区|维吾尔自治区|自治区)?$/;
    const parentCandidates = pickerScopes(doc, context).flatMap((scope) =>
      Array.from(scope.root.querySelectorAll<HTMLSelectElement>('select')).filter((select) =>
        visible(select) && Array.from(select.options).filter((option) => provincePattern.test((option.textContent || '').replace(/\s+/g, ''))).length >= 3,
      ),
    );
    for (const parent of parentCandidates) {
      const options = Array.from(parent.options).filter((option) => !option.disabled && !!option.value && provincePattern.test((option.textContent || '').replace(/\s+/g, ''))).slice(0, 40);
      for (const option of options) {
        setSelectOption(parent, option);
        if (!stages.includes('cascade-parent-scan')) stages.push('cascade-parent-scan');
        await delay(220);
        if (await chooseLeaf()) return true;
      }
    }
  }

  // 级联变化可能异步重建第二级 select 或整个 iframe，因此每轮都重新定位上下文。
  for (let poll = 0; poll < 10; poll++) {
    if (await chooseLeaf()) return true;
    await delay(250);
  }
  return false;
}

function queryInput(scope: PickerScope): HTMLInputElement | null {
  return Array.from(scope.root.querySelectorAll<HTMLInputElement>('input[type="text"],input:not([type])')).find(visible) || null;
}

function queryButton(scope: PickerScope): HTMLElement | null {
  return Array.from(scope.root.querySelectorAll<HTMLElement>('a,button,input[type="button"],input[type="submit"],span')).find((item) =>
    visible(item) && /^(查询|搜索|查找|查 询|搜 索)$/.test((item.textContent || item.getAttribute('value') || '').trim()),
  ) || null;
}

/** 功能：从蓝色弹窗结果表中精确选出院校/专业行，并兼容 span、td、tr onclick 选择控件。 */
function findRow(scope: PickerScope, expected: ParsedIdentity): RowHit | null {
  const wanted = normalized(expected.name);
  const rows = Array.from(scope.root.querySelectorAll<HTMLTableRowElement>('tr')).filter(visible);
  const hits = rows.map((row): RowHit | null => {
    const text = (row.textContent || '').replace(/\s+/g, ' ').trim();
    // td 之间不一定存在空格（如 `10190长春工业大学`），学校五位码优先。
    const code = (text.match(/(?:^|[^0-9])(\d{5})(?=$|[^0-9])/) || [])[1]
      || (text.match(/(?:^|[^a-z0-9])([a-z0-9._-]{4,20})(?=$|[^a-z0-9])/i) || [])[1]
      || '';
    const name = text.replace(code, '').replace(/选择|选取|选中|确定/g, '').trim();
    const flat = normalized(name || text);
    let score = 0;
    if (expected.code && code === expected.code) score += 120;
    if (wanted && flat === wanted) score += 100;
    else if (wanted && (flat.includes(wanted) || wanted.includes(flat))) score += 65;
    if (expected.code && code && code !== expected.code) score -= 200;
    const controls = Array.from(row.querySelectorAll<HTMLElement>('input[type="image"],a,img,button,input[type="button"],input[type="submit"],[role="button"],[onclick],span.addon,i'));
    // 蓝色系统真实结果行常只有无文字的图片按钮；与成熟实现一致，优先激活 image 控件。
    let control: HTMLElement | null | undefined = row.querySelector<HTMLElement>('input[type="image"]');
    control ||= controls.find((item) => /^(选择|选取|选中|确定)$/.test((item.textContent || item.getAttribute('value') || item.getAttribute('alt') || item.getAttribute('title') || '').trim()));
    control ||= controls.find((item) => /(choose|select|pick)/i.test(`${item.className || ''} ${item.getAttribute('onclick') || ''}`));
    control ||= row.querySelector<HTMLElement>('a,img') || row.querySelector<HTMLElement>('td[onclick],tr[onclick]') || (row.hasAttribute('onclick') ? row : null);
    control ||= controls[controls.length - 1] || null;
    return control && score > 0 ? { control, code, name, score } : null;
  }).filter((item): item is RowHit => !!item).sort((a, b) => b.score - a.score);
  return hits[0] || null;
}

/** 功能：兼容搜索结果不是 table/tr，而是列表、树节点或可点击文本的学校弹窗。 */
function findResultNode(scope: PickerScope, expected: ParsedIdentity): RowHit | null {
  const wanted = normalized(expected.name);
  if (!wanted) return null;
  const candidates = Array.from(scope.root.querySelectorAll<HTMLElement>(
    '[role="option"],[role="treeitem"],li,a,button,input[type="image"],img,[onclick],td,span',
  )).filter(visible);
  const hits = candidates.map((item): RowHit | null => {
    const text = (item.textContent || item.getAttribute('alt') || item.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
    const flat = normalized(text);
    if (!flat || !(flat === wanted || flat.includes(wanted))) return null;
    // 大容器包含整份结果列表时不能作为一条结果点击。
    if (flat.length > wanted.length + 24) return null;
    const attrText = `${item.getAttribute('value') || ''} ${item.getAttribute('data-value') || ''} ${item.getAttribute('data-code') || ''} ${item.getAttribute('onclick') || ''}`;
    const combined = `${text} ${attrText}`;
    const code = expected.code && combined.includes(expected.code)
      ? expected.code
      : (combined.match(/(?:^|[^0-9])(\d{5})(?=$|[^0-9])/) || [])[1] || '';
    if (expected.code && code && expected.code !== code) return null;
    let control: HTMLElement | null = null;
    if (item.matches('a,button,input[type="image"],img,[onclick],[role="option"],[role="treeitem"]')) control = item;
    control ||= item.querySelector<HTMLElement>('input[type="image"],a,img,button,[onclick],[role="button"]');
    let parent = item.parentElement;
    for (let depth = 0; !control && parent && parent !== scope.root && depth < 3; depth++, parent = parent.parentElement) {
      if (parent.matches('a,button,[onclick],[role="option"],[role="treeitem"]')) control = parent;
    }
    if (!control) return null;
    return { control, code, name: expected.name, score: (flat === wanted ? 100 : 70) + (code ? 20 : 0) };
  }).filter((item): item is RowHit => !!item).sort((a, b) => b.score - a.score);
  return hits[0] || null;
}

/** 功能：仅在代码和名称来自同一精确结果行时，用三联直写兜底页面脚本未回填的情况。 */
function writeBinding(binding: BlueFlatBinding, hit: ParsedIdentity): boolean {
  if (!/^[a-z0-9._-]{4,20}$/i.test(hit.code) || !/[\u4e00-\u9fff]{2,}/.test(hit.name)) return false;
  setInput(binding.code, hit.code);
  setInput(binding.name, hit.name);
  setInput(binding.display, `${hit.code} ${hit.name}`);
  return verifyBinding(binding, hit);
}

/**
 * 功能：执行蓝色系统 chooseSch/chooseZy 弹窗点选，并保证代码、名称、展示值完整回读。
 * 安全边界：没有可靠代码时绝不凭校名/专业名伪造隐藏码，也不点击保存、下一步或提交。
 */
export async function pickBlueFlatIdentity(doc: Document, value: string, context: PopupPickContext, isCancelled?: () => boolean): Promise<BlueFlatPickStatus> {
  if (context.pickerProtocol !== 'blue-flat') return 'not-applicable';
  const stages = ['blue-flat:start'];
  const finish = (status: BlueFlatPickStatus): BlueFlatPickStatus => {
    writeBlueDebug(doc, context, stages, status);
    return status;
  };
  const binding = resolveBinding(doc, context);
  if (!binding) return finish('failed');
  const expected = parseIdentity(value, context.expectedCode);
  if (verifyBinding(binding, expected)) {
    stages.push('triad-ok');
    return finish('picked');
  }

  const trigger = findTrigger(doc, context.triggerSelectors);
  let scopes = pickerScopes(doc, context);
  if (!trigger && !scopes.length) {
    stages.push('no-trigger');
    return finish(expected.code && writeBinding(binding, expected) ? 'picked' : 'failed');
  }
  if (trigger && !scopes.length) {
    click(trigger);
    stages.push('trigger');
  }
  for (let attempt = 0; attempt < 16 && !scopes.length; attempt++) {
    await delay(250);
    if (isCancelled?.()) { stages.push('cancelled'); return finish('not-applicable'); } // I01:原轮失效即停止等待/点击
    scopes = pickerScopes(doc, context);
  }
  if (!scopes.length) {
    stages.push('no-scope');
    return finish(expected.code && writeBinding(binding, expected) ? 'picked' : 'opened');
  }
  stages.push('scope-found');

  if (await pickCascade(doc, binding, expected, context, stages)) {
    stages.push('triad-ok');
    return finish('picked');
  }

  const queries = [expected.code, expected.name, expected.name.slice(0, 8), expected.name.slice(0, 6), expected.name.slice(0, 4)]
    .filter((item, index, all) => item.length >= 2 && all.indexOf(item) === index);
  for (const query of queries) {
    if (isCancelled?.()) { stages.push('cancelled'); return finish('not-applicable'); } // I01:查询/点选前复核原轮
    scopes = pickerScopes(doc, context);
    for (const scope of scopes) {
      const input = queryInput(scope);
      if (input) setInput(input, query);
      const button = queryButton(scope);
      if (button) click(button);
    }
    for (let poll = 0; poll < 10; poll++) {
      await delay(250);
      if (isCancelled?.()) { stages.push('cancelled'); return finish('not-applicable'); }
      scopes = pickerScopes(doc, context);
      const hit = scopes.flatMap((scope) => [findRow(scope, expected), findResultNode(scope, expected)]
        .filter((item): item is RowHit => !!item)
        .map((item) => ({ item, scope })))
        .sort((a, b) => b.item.score - a.item.score)[0];
      if (!hit) continue;
      const { item: rowHit, scope: hitScope } = hit;
      const controlKind = rowHit.control.matches('input[type="image"]') ? 'image-input' : rowHit.control.tagName.toLowerCase();
      stages.push(`table-hit:${controlKind}`);
      if (isCancelled?.()) { stages.push('cancelled'); return finish('not-applicable'); } // I01:点击结果行前复核
      click(rowHit.control);
      stages.push('table-click');
      await delay(120);
      if (resultSelected(rowHit.control)) stages.push('result-selected');

      // 搜索结果 iframe 只负责标记 choosen；代码、名称三联值要在父层“确定”后才会回填。
      const confirm = pickerConfirmButton(doc, hitScope);
      if (confirm) {
        click(confirm);
        stages.push('layer-confirm');
      }
      for (let readback = 0; readback < 12; readback++) {
        await delay(200);
        if (isCancelled?.()) { stages.push('cancelled'); return finish('not-applicable'); } // I01:等待回填期间原轮失效 → 不宣称成功
        if (verifyBinding(binding, { code: expected.code || rowHit.code, name: expected.name || rowHit.name })) {
          stages.push('table-row', 'triad-ok');
          return finish('picked');
        }
      }
      const exact = { code: expected.code || rowHit.code, name: expected.name || rowHit.name };
      if (isCancelled?.()) { stages.push('cancelled'); return finish('not-applicable'); } // I01:写代码/名称前最后复核
      if ((!expected.code || !rowHit.code || expected.code === rowHit.code) && writeBinding(binding, exact)) {
        stages.push('table-row-fallback', 'triad-ok');
        return finish('picked');
      }
      break;
    }
  }
  stages.push('exhausted');
  if (isCancelled?.()) { stages.push('cancelled'); return finish('not-applicable'); } // I01:兜底写入前复核
  return finish(expected.code && writeBinding(binding, expected) ? 'picked' : 'opened');
}
