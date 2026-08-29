// 动态表格（自动加行的网格）统一机器层与填充内核。
// 从 filler.ts 收敛而来：五类动态表（学术成果/学习工作经历/奖励情况/外语水平/家庭成员）
// 共享"定位表 → 已存在差量处理 → 找空行 → 验证式加行 → 保存按钮兜底 → 回读填写 → 行内落库"骨架，
// 每表差异通过 DynamicTableSpec 钩子表达；新增动态表只需实现 spec，不再复制整个循环。

import { isVisible, normalizeText } from './matcher';
import { mainWorldJqueryClick } from './world-bridge';
import { syncTableBlobs } from './hidden-blob';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 表格末列的图标型"新增"按钮（EasyUI 无文字 linkbutton，如 icon-search） */
function findTableActionLink(table: HTMLElement): HTMLElement | null {
  const rows = Array.from(table.querySelectorAll('tr'));
  for (const row of rows) {
    const cells = Array.from(row.cells);
    if (!cells.length) continue;
    const last = cells[cells.length - 1];
    const cands = Array.from(last.querySelectorAll<HTMLElement>('a, button, span, i')).filter((c) => {
      const cls = (c.getAttribute('class') || '').toLowerCase();
      if (/delete|remove|del|close/.test(cls)) return false;
      const t = (c.textContent || '').trim();
      if (/×|删除|移除|清空/.test(t)) return false;
      if (c.tagName === 'SPAN' || c.tagName === 'I') return /icon|btn|add/.test(cls);
      return true;
    });
    if (cands.length) return cands[0];
  }
  return null;
}

/** 找页面的「保存」按钮（南理工式：保存后服务器才多出一行；排除"提交"类） */
export function findSaveButton(table: HTMLElement): HTMLElement | null {
  const search = (scope: HTMLElement | null): HTMLElement | null => {
    if (!scope) return null;
    const cands = Array.from(scope.querySelectorAll<HTMLElement>('a, button, input[type="submit"], input[type="button"], span'));
    for (const c of cands) {
      if (!isVisible(c)) continue;
      if (c.closest(OWN_UI_SEL)) continue; // 扩展自身 UI 不是页面按钮
      const label = normalizeText(c.textContent || c.getAttribute('value') || '');
      if (!/^保存$|^保存草稿$|^暂存$/.test(label)) continue;
      const t = c.closest('table');
      if (t && t !== table) continue; // 不点其他表格里的保存
      return c;
    }
    return null;
  };
  return search(table.parentElement) || search(document.body);
}

/** 页面文档是否仍为当前活动文档（整页回发后旧文档会被替换，继续操作它是徒劳甚至误伤新页面） */
export function docAlive(doc: Document): boolean {
  try {
    const w = doc.defaultView;
    return !!w && w.document === doc;
  } catch {
    return false;
  }
}

const pbWired = new WeakSet<Document>();

/** 监听页面卸载：整页回发/跳转时落盘时间戳，供旧文档里的循环及时刹车，避免对回发中的页面连点 */
function wirePostbackSignal(doc: Document): void {
  if (pbWired.has(doc)) return;
  pbWired.add(doc);
  try {
    const w = doc.defaultView as Window | null;
    w?.addEventListener('pagehide', () => {
      try {
        w.sessionStorage.setItem('tui-pb-fired', JSON.stringify({ at: Date.now() }));
      } catch {
        // 忽略
      }
    });
  } catch {
    // 忽略
  }
}

/** 最近（默认 8 秒内）是否发生过整页回发/跳转 */
export function postbackJustFired(doc: Document, within = 8000): boolean {
  try {
    const raw = (doc.defaultView as Window | null)?.sessionStorage.getItem('tui-pb-fired');
    if (!raw) return false;
    const at = Number(JSON.parse(raw).at) || 0;
    return Date.now() - at < within;
  } catch {
    return false;
  }
}

/** 解析 javascript:DoPostback(...) 链接的前两个参数（事件目标 / 事件参数） */
function parsePostbackArgs(href: string): { target: string; arg: string } | null {
  const m = /^javascript:\s*[A-Za-z_$][\w$]*\s*\(\s*(['"])(.*?)\1\s*,\s*(['"])(.*?)\3/i.exec(href);
  if (!m) return null;
  return { target: m[2] || '', arg: m[4] || '' };
}

/** 标准 ASP.NET 整页回发：设置 __EVENTTARGET/__EVENTARGUMENT 后提交表单（与页面自带 __doPostBack 完全等价） */
function fireStandardPostback(doc: Document, anchor: HTMLElement, target: string, arg: string): boolean {
  const form = anchor.closest('form') as HTMLFormElement | null;
  if (!form) return false;
  const setHidden = (name: string, value: string) => {
    let el = form.querySelector(`input[name="${name}"]`) as HTMLInputElement | null;
    if (!el) {
      el = doc.createElement('input');
      el.type = 'hidden';
      el.name = name;
      form.appendChild(el);
    }
    el.value = value;
  };
  setHidden('__EVENTTARGET', target);
  setHidden('__EVENTARGUMENT', arg);
  // 兼容自定义回发包装：部分站点用 eventTarget/eventArgument 自定义隐藏域替代标准域
  setHidden('eventTarget', target);
  setHidden('eventArgument', arg);
  form.submit();
  return true;
}

/** 按钮是否为 javascript:DoPostback 型（服务器回发保存，如北邮行内「添加」）；纯客户端加行按钮不算 */
export function isDoPostbackAction(c: HTMLElement): boolean {
  const href = (c.getAttribute('href') || '').trim();
  return /^javascript:/i.test(href) && /dopostback|__doPostBack/i.test(href);
}

/**
 * 是否是语义明确的“新增空行”动作。仅有“添加/保存”的行内按钮可能会把当前行落库，
 * 在安全模式下不能把它误当作新增空行。
 */
export function isExplicitAddRowAction(c: HTMLElement): boolean {
  const label = normalizeText(`${c.textContent || ''} ${c.getAttribute('value') || ''} ${c.getAttribute('title') || ''}`);
  const identity = `${c.id || ''} ${c.getAttribute('name') || ''}`;
  return /新增一行|添加一行|增加一行|插入一行|再添一行/.test(label) || /addnewrow|addrow|addline/i.test(identity);
}

/** 调用 beforeAdd 并取得本轮点击序号（点击方式按序号轮换：0 标准回发 / 1 主世界 location 求值 / 2 原生点击） */
export function clickAttempt(beforeAdd: ((i: number) => void | number) | undefined, i: number, fallback: number): number {
  const r = beforeAdd ? beforeAdd(i) : undefined;
  return typeof r === 'number' ? r : fallback;
}

/**
 * 点击"添加/保存"类动作。javascript:DoPostback 链接按点击序号轮换三种方式：
 * 0 = 标准整页回发（等价 __doPostBack，北邮等自定义 WebForm_DoPostback 包装的页面最可靠）；
 * 1 = 主世界 location 求值执行原 href（void 包裹不导航，CSP 拦不住 location 求值）；
 * 2 = 原生 click。每轮先落盘主世界函数形态探测，失败时下轮自动换方式重试。
 */
export async function clickPageAction(c: HTMLElement, attempt = 0): Promise<void> {
  const doc = c.ownerDocument || document;
  if (!docAlive(doc)) return; // 页面已整页刷新：旧文档不再有效，交给断点续填接管
  wirePostbackSignal(doc);
  const href = (c.getAttribute('href') || '').trim();
  if (/^javascript:/i.test(href) && /dopostback|__doPostBack/i.test(href)) {
    const args = parsePostbackArgs(href);
    const target = args?.target || '';
    const strategy = attempt % 3;
    // 诊断：注入 <script> 会被 CSP 拦截，改用 location 求值写回主世界函数形态（javascript: URL 与页面自身链接同等待遇）
    try {
      const w = doc.defaultView as Window | null;
      if (w) {
        w.location.href = `javascript:void(document.documentElement.setAttribute('data-tui-wfp',(function(){try{return typeof window.WebForm_DoPostback==='function'?String(window.WebForm_DoPostback).slice(0,300):(typeof window.WebForm_DoPostBack==='function'?'STD-CAP-B-ONLY':'MISSING')}catch(e){return 'ERR:'+e.message}})()))`;
        await sleep(120);
      }
    } catch {
      // 忽略
    }
    const probe = doc.documentElement.getAttribute('data-tui-wfp') || 'NO-ATTR';
    // fired：本轮实际采用的触发方式（std=标准整页回发 / void=主世界 location 求值 / click=原生点击）
    const fired = strategy === 0 ? 'std' : strategy === 1 ? 'void' : 'click';
    try {
      const store = (doc.defaultView as Window | null)?.sessionStorage;
      if (store) {
        const arr = (() => {
          try {
            return JSON.parse(store.getItem('tui-wfp-probe') || '[]') as unknown[];
          } catch {
            return [] as unknown[];
          }
        })();
        arr.push({ at: Date.now(), strategy, target: target.slice(0, 70), probe: probe.slice(0, 320), fired });
        store.setItem('tui-wfp-probe', JSON.stringify(arr.slice(-12)));
      }
    } catch {
      // 忽略
    }
    if (strategy === 0) {
      if (fireStandardPostback(doc, c, target, args?.arg || '')) return; // 整页回发：页面即将刷新，断点续填接管
    } else if (strategy === 1) {
      // 主世界执行回发：location 求值（void 包裹保证不导航）；javascript: 导航不受 CSP 限制
      try {
        const w = doc.defaultView as Window | null;
        if (w) {
          w.location.href = `javascript:void(${href.replace(/^javascript:/i, '')})`;
          return;
        }
      } catch {
        // 忽略，回退原生点击
      }
    }
    try {
      c.click();
    } catch {
      // 忽略
    }
    return;
  }
  // 非 DoPostback 控件按轮次选择一种点击策略。不能在同一轮连续执行原生 click 和
  // jQuery trigger，否则两个策略都生效时会一次新增两行。
  const elInfo = {
    tag: c.tagName.toLowerCase(),
    id: c.getAttribute('id') || '',
    cls: (c.getAttribute('class') || '').slice(0, 40),
    text: (c.textContent || (c as HTMLInputElement).value || '').replace(/\s+/g, ' ').trim().slice(0, 20),
    disabled: !!(c as HTMLButtonElement).disabled || c.getAttribute('aria-disabled') === 'true',
    hasOnclick: typeof ((c as HTMLElement & { onclick?: unknown }).onclick) === 'function',
  };
  if (elInfo.disabled) {
    logClickDebug(doc, { ...elInfo, fired: 'blocked-disabled' });
    return;
  }
  const w2 = doc.defaultView as Window | null;
  const strategy = attempt % 3;
  const fireEv = (type: string): void => {
    try {
      const ev = new MouseEvent(type, { bubbles: true, cancelable: true, view: w2 || undefined });
      c.dispatchEvent(ev);
    } catch {
      // 忽略
    }
  };
  try {
    c.scrollIntoView({ block: 'center', inline: 'nearest' });
  } catch {
    // 忽略
  }
  let fired = strategy === 0 ? 'native-sequence' : strategy === 1 ? 'jquery-click' : 'dispatch-click';
  try {
    if (strategy === 0) {
      // 模拟一次完整的用户点击序列；最终只触发一次 click，不再叠加 jQuery trigger。
      fireEv('pointerdown');
      fireEv('mousedown');
      try {
        c.focus();
      } catch {
        // 忽略
      }
      fireEv('pointerup');
      fireEv('mouseup');
      c.click();
    } else if (strategy === 1 && w2) {
      // 主世界 jQuery 触发兜底：优先走主世界桥（DOM 属性通道，无导航副作用）；桥不可用时退回 location 求值。
      const bridged = await mainWorldJqueryClick(doc, c);
      if (!bridged) {
        const sel = JSON.stringify(cssPathOf(c));
        w2.location.href = `javascript:void((function(){try{var j=window.jQuery;if(j&&j.fn){var el=document.querySelector(${sel});if(el&&!el.disabled){j(el).trigger('click');}}}catch(e){}})())`;
      }
    } else {
      fireEv('click');
    }
  } catch {
    fired += '-error';
  }
  logClickDebug(doc, { ...elInfo, fired });
}

/** 点击调试：记录被点元素签名与触发策略，供"点了没反应"类问题定位 */
function logClickDebug(doc: Document, entry: Record<string, unknown>): void {
  try {
    const store = (doc.defaultView as Window | null)?.sessionStorage;
    if (!store) return;
    const arr = (() => {
      try {
        return JSON.parse(store.getItem('tui-click-debug') || '[]') as unknown[];
      } catch {
        return [] as unknown[];
      }
    })();
    arr.push({ at: Date.now(), ...entry });
    store.setItem('tui-click-debug', JSON.stringify(arr.slice(-20)));
  } catch {
    // 忽略
  }
}

/** 元素 CSS 路径（供主世界脚本重新定位元素） */
function cssPathOf(el: HTMLElement): string {
  if (el.id) return `#${el.id}`;
  const parts: string[] = [];
  let cur: HTMLElement | null = el;
  while (cur && cur !== (cur.ownerDocument?.documentElement || null) && parts.length < 6) {
    let part = cur.tagName.toLowerCase();
    if (cur.className && typeof cur.className === 'string') {
      const cls = cur.className.trim().split(/\s+/).slice(0, 2).join('.');
      if (cls) part += `.${cls}`;
    }
    const parent: HTMLElement | null = cur.parentElement;
    if (parent) {
      const idx = Array.from(parent.children).indexOf(cur);
      if (idx >= 0) part += `:nth-child(${idx + 1})`;
    }
    parts.unshift(part);
    cur = parent;
  }
  return parts.join(' > ');
}

/**
 * 点击加行/保存后等待行数增长：短轮询（东华等客户端 JS 加行即时生效，行一出现就继续，不再固定等 2.5 秒）；
 * 页面整页回发（doc 失效）→ 返回 false 交给断点续填；上限内未增长 → 返回 false（外层停止连点）。
 */
export async function waitForRowGrowth(
  doc: Document,
  findTable: (d: Document) => { table: HTMLTableElement } | null,
  rowsBefore: number,
  capMs = 3000,
): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < capMs) {
    await sleep(120);
    if (!docAlive(doc)) return false; // 整页回发已刷新：断点续填接管
    const info = findTable(doc);
    if (!info) return false;
    if (validDataRows(info.table).length > rowsBefore) return true;
  }
  return false;
}

/** 同一页、同一按钮的有效点击策略短期记忆；不跨 Document/iframe，不保存档案内容。 */
const addRowStrategyCache = new WeakMap<Document, Map<string, number>>();

function addRowButtonKey(btn: HTMLElement): string {
  const text = normalizeText(`${btn.textContent || ''} ${btn.getAttribute('value') || ''}`).slice(0, 30);
  const table = btn.closest('table');
  const header = table?.rows[0] ? Array.from(table.rows[0].cells).map((cell) => normalizeText(cell.textContent || '')).join('|').slice(0, 80) : '';
  return `${btn.tagName}|${btn.id}|${btn.getAttribute('name') || ''}|${(btn.className || '').toString().slice(0, 50)}|${text}|${header}`;
}

/**
 * 加行点击 + 行数验证：单次点击（点击策略按全局点击序号轮换、跨轮升级）→ 短轮询等待行数增长。
 * 不在同一轮连点多种策略：服务器加行可能延迟数秒，未验证就连点会造成一次尝试多行。
 * 同一页同一按钮一旦成功，后续优先复用成功策略；页面重建后 WeakMap 自动失效。
 */
export async function clickAddRowVerified(
  doc: Document,
  btn: HTMLElement,
  findTable: (d: Document) => { table: HTMLTableElement } | null,
  rowsBefore: number,
  beforeAdd?: (i: number) => void | number,
  entryIndex = 0,
  fallbackStrategy = 0,
): Promise<boolean> {
  if (!docAlive(doc)) return false;
  const key = addRowButtonKey(btn);
  const cache = addRowStrategyCache.get(doc) || new Map<string, number>();
  addRowStrategyCache.set(doc, cache);
  const remembered = cache.get(key);
  const callbackStrategy = beforeAdd?.(entryIndex);
  const strategy = remembered ?? (typeof callbackStrategy === 'number' ? callbackStrategy : fallbackStrategy);
  await clickPageAction(btn, strategy);
  const grown = await waitForRowGrowth(doc, findTable, rowsBefore);
  if (grown) {
    cache.set(key, strategy);
    return true;
  }
  if (remembered !== undefined) cache.delete(key);
  return false;
}

/** “已达最大行数”类系统弹窗/提示文案（巨能填 known_table_row_limits 同款关键词族） */
const ROW_LIMIT_TEXT =
  /(?:超过|超出|达到|已达)(?:系统)?(?:最大|限定)?(?:记录数|行数|条数)|(?:记录数|行数|条数)(?:已)?(?:达|到)(?:了)?(?:最大|上限)|不能超过\s*\d+|最多(?:只能)?(?:添加|填写|录入)?\s*\d+\s*(?:条|行|项)/;
const ROW_LIMIT_DIALOG_SEL =
  '.layui-layer, .ui-dialog, .artdialog, [role="dialog"], [class*="dialog" i], [class*="modal" i], [class*="popup" i], [class*="alert" i], [class*="toast" i]';

/**
 * 功能：检测“已达最大行数”类阻断（系统弹窗可见文案）。命中返回脱敏原因文本，未命中返回 null。
 * 巨能填在行数不增长时先查此类弹窗再决定是否重试；我们也据此停止连点并如实告知用户。
 */
export function detectRowLimitBlocked(doc: Document): string | null {
  try {
    for (const el of Array.from(doc.querySelectorAll<HTMLElement>(ROW_LIMIT_DIALOG_SEL))) {
      if (!isVisible(el)) continue;
      const t = normalizeText(el.textContent || '');
      if (!t || t.length > 200) continue;
      if (ROW_LIMIT_TEXT.test(t)) return `系统提示行数上限：${t.slice(0, 80)}`;
    }
  } catch {
    // 忽略
  }
  return null;
}

/** 动态表逐条决策诊断：每条记录的填写/跳过/停止决策落盘（不含档案内容），字段报告可直接定位停在哪一条。 */
export function logRowDecision(doc: Document, entry: Record<string, unknown>): void {
  try {
    const store = (doc.defaultView as Window | null)?.sessionStorage;
    if (!store) return;
    const arr = (() => {
      try {
        return JSON.parse(store.getItem('tui-row-decision') || '[]') as unknown[];
      } catch {
        return [] as unknown[];
      }
    })();
    arr.push({ at: Date.now(), ...entry });
    store.setItem('tui-row-decision', JSON.stringify(arr.slice(-30)));
  } catch {
    // 忽略
  }
}

// ===================== 弹窗式加行：误开检测与差量填写 =====================
// 巨能填厦大协议同款安全规则：点击"新增"后若打开的是"修改/编辑"弹窗，绝不能在里面填写——
// 那会把已有行覆盖掉。只承认明确的新增证据（标题/iframe 地址/隐藏操作字段），可疑一律中止并关闭。

export interface OpenDialogInfo {
  root: HTMLElement;
  /** 弹窗内嵌 iframe 的文档（iframe 式弹窗） */
  innerDoc: Document | null;
  kind: 'add' | 'edit' | 'unknown';
  confirmBtn: HTMLElement | null;
}

const DIALOG_ROOT_SEL =
  '.layui-layer, .bh-dialog, [role="dialog"], .emap-dialog, .jqx-window, .modal, .bh-modal, [class*="dialog" i], [class*="modal" i], [class*="window" i], [class*="layer" i]';

/** 功能：收集当前可见的弹窗根节点（供点击前后对比，归责"这次点击打开了哪个弹窗"）。只保留最外层容器。 */
export function visibleDialogRoots(doc: Document): HTMLElement[] {
  try {
    return Array.from(doc.querySelectorAll<HTMLElement>(DIALOG_ROOT_SEL)).filter((root) => {
      if (!isVisible(root)) return false;
      // close 图标等内层元素同 class 命中时不算弹窗：只有外层容器参与归责
      return !root.parentElement?.closest(DIALOG_ROOT_SEL);
    });
  } catch {
    return [];
  }
}

function sameRootSet(a: HTMLElement[], b: HTMLElement[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((root) => set.has(root));
}

function dialogInnerText(scope: HTMLElement | Document): string {
  // 不用 `instanceof Document`：测试/无 DOM 环境未注入 Document 构造器，按 body 属性存在与否区分
  const doc = scope as Document;
  const root = doc.body !== undefined ? (doc.body || doc.documentElement) : (scope as HTMLElement);
  return normalizeText(root?.textContent || '');
}

/** 功能：把点击后新出现的弹窗分类为 新增/编辑/未知。编辑证据：标题"修改/编辑"、iframe 地址含 change/edit、隐藏 act 字段为 edit。 */
function classifyDialog(root: HTMLElement): OpenDialogInfo {
  let innerDoc: Document | null = null;
  const frame = root.querySelector('iframe');
  if (frame) {
    try {
      innerDoc = frame.contentDocument || null;
    } catch {
      innerDoc = null; // 跨域弹窗：只能靠外层证据判断
    }
  }
  let kind: OpenDialogInfo['kind'] = 'unknown';
  const src = (frame?.getAttribute('src') || '').toLowerCase();
  if (/change|edit|modify|update/.test(src)) kind = 'edit';
  else if (/add|create|append|new/.test(src)) kind = 'add';
  if (kind === 'unknown' && innerDoc) {
    const ops = Array.from(innerDoc.querySelectorAll<HTMLInputElement>('input[type="hidden"]')).filter((el) =>
      /^(act|op|action|mode|oper|type|do)$/i.test(`${el.name} ${el.id}`),
    );
    if (ops.some((el) => /edit|change|update|modify/i.test(el.value))) kind = 'edit';
    else if (ops.some((el) => /add|insert|new|create/i.test(el.value))) kind = 'add';
  }
  if (kind === 'unknown') {
    const title = normalizeText(root.querySelector('.layui-layer-title,.modal-title,[class*="title" i],h1,h2,h3')?.textContent || '');
    if (/修改|编辑|变更|更改/.test(title)) kind = 'edit';
    else if (/新增|添加|增加|新建|录入/.test(title)) kind = 'add';
  }
  if (kind === 'unknown' && innerDoc) {
    const text = dialogInnerText(innerDoc).slice(0, 400);
    if (/^修改|编辑信息|修改记录/.test(text)) kind = 'edit';
    else if (/^新增|添加记录|添加信息/.test(text)) kind = 'add';
  }
  return { root, innerDoc, kind, confirmBtn: null };
}

/** 功能：温和关闭弹窗——只点关闭/取消类控件，绝不点"确定/保存"（编辑弹窗里点确定会提交覆盖）。 */
function closeDialogSoft(root: HTMLElement): void {
  const closer = Array.from(root.querySelectorAll<HTMLElement>('.layui-layer-close, [class*="close" i], a, button, span, i')).find((el) => {
    if (!isVisible(el) || el.closest(OWN_UI_SEL)) return false;
    const text = normalizeText(`${el.textContent || ''} ${el.getAttribute('title') || ''}`);
    const cls = (el.className || '').toString();
    if (/^(取消|关闭|返回|收起|放弃)$/.test(text)) return true;
    return /close|cancel/i.test(cls) && !/确定|保存|提交/.test(text);
  });
  if (closer) {
    try {
      closer.click();
    } catch {
      // 忽略
    }
    return;
  }
  // 无关闭控件：派发 Escape（多数弹窗组件支持 Esc 关闭），仍不碰确定/保存
  try {
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    root.ownerDocument.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
  } catch {
    // 忽略
  }
}

/**
 * 功能：加行点击未带来行增长时的弹窗归责处理。
 * 原理：只处理"本次点击新出现"的弹窗（避免误关选择器弹窗）；编辑/未知弹窗立即温和关闭并中止本条；
 * 新增弹窗且调用方提供填写回调时执行弹窗内填写并确认。返回是否已消化本次点击（filled=true 视为成功）。
 */
export async function handleDialogAfterClick(
  doc: Document,
  beforeRoots: HTMLElement[],
  kindLabel: string,
  entryIndex: number,
  fillAdd?: (dialog: OpenDialogInfo) => Promise<boolean>,
): Promise<'filled' | 'closed-edit' | 'closed-new' | 'left-open' | 'none'> {
  const after = visibleDialogRoots(doc);
  if (sameRootSet(beforeRoots, after)) return 'none';
  const fresh = after.filter((root) => !beforeRoots.includes(root));
  for (const root of fresh) {
    const info = classifyDialog(root);
    if (info.kind === 'add' && fillAdd) {
      if (await fillAdd(info)) {
        // 确认成功后若弹窗仍开着（部分站点不自动关闭）：温和关闭，避免遮挡后续字段与选择器
        if (isVisible(info.root)) closeDialogSoft(info.root);
        return 'filled';
      }
    }
    closeDialogSoft(root);
    logRowDecision(doc, { kind: kindLabel, index: entryIndex, decision: info.kind === 'edit' ? 'edit-dialog-aborted' : 'new-dialog-unsupported', issue: 'E1204' });
    return info.kind === 'edit' ? 'closed-edit' : 'closed-new';
  }
  return 'left-open';
}

/** 扩展自身 UI 容器：查找页面按钮时绝不选中（防"正在自动加行"等横幅文字被当按钮） */
export const OWN_UI_SEL = '#tui-panel, #tui-guide-hint, #tui-check-report, #tui-schools, #tui-autotest-result, [class*="tui-banner"], [class*="tui-panel"]';

/** 加行按钮查找诊断：记录被跳过的候选（disabled/其他表格/扩展自身 UI）——"点了没反应"类问题定位用 */
function logAddSkip(c: HTMLElement, why: string): void {
  try {
    const doc = c.ownerDocument || document;
    const store = (doc.defaultView as Window | null)?.sessionStorage;
    if (!store) return;
    const arr = (() => {
      try {
        return JSON.parse(store.getItem('tui-addbtn-debug') || '[]') as unknown[];
      } catch {
        return [] as unknown[];
      }
    })();
    arr.push({
      at: Date.now(),
      why,
      tag: c.tagName.toLowerCase(),
      id: c.getAttribute('id') || '',
      cls: (c.getAttribute('class') || '').slice(0, 40),
      text: (c.textContent || (c as HTMLInputElement).value || '').replace(/\s+/g, ' ').trim().slice(0, 20),
      disabled: !!(c as HTMLButtonElement).disabled,
    });
    store.setItem('tui-addbtn-debug', JSON.stringify(arr.slice(-16)));
  } catch {
    // 忽略
  }
}

/** 找"新增/添加一行"按钮：文字按钮 → 表格内图标按钮 → 父容器（排除其他表格）→ 页面全局（排除其他表格）；withinRow 限定行内（北邮式逐行「添加」） */
export function findAddButton(table: HTMLElement, withinRow?: HTMLTableRowElement): HTMLElement | null {
  const isMatch = (c: HTMLElement): boolean => {
    const label = normalizeText(`${c.textContent || ''} ${c.getAttribute('value') || ''} ${c.getAttribute('alt') || ''} ${c.getAttribute('title') || ''}`);
    // 只用明确的加行措辞（"自动加行"这类进度文案不是按钮）
    if (/新增一行|添加一行|增加一行|插入一行|新增|添加|增加|插入/.test(label)) return true;
    const cls = `${c.getAttribute('class') || ''} ${c.getAttribute('id') || ''} ${c.getAttribute('name') || ''}`.toLowerCase();
    if (/(^|[-_])add([-_]|$)|btnadd|addbtn|addrow|addline|append|insert/i.test(cls)) return true;
    const js = `${c.getAttribute('onclick') || ''} ${c.getAttribute('href') || ''}`;
    if (/dopostback|__doPostBack/i.test(js) && /add|insert|append|newrow/i.test(js)) return true;
    return false;
  };
  const search = (scope: HTMLElement | null, excludeOtherTables: boolean): HTMLElement | null => {
    if (!scope) return null;
    const cands = Array.from(
      scope.querySelectorAll<HTMLElement>('button, a, span, i, div[role="button"], input[type="button"], input[type="submit"], input[type="image"]'),
    );
    let best: HTMLElement | null = null;
    let bestScore = -1;
    for (const c of cands) {
      if (!isVisible(c)) continue;
      if (!isMatch(c)) continue;
      if (c.closest(OWN_UI_SEL)) {
        logAddSkip(c, 'own-ui');
        continue; // 扩展自己的横幅/面板绝不是页面按钮
      }
      if ((c as HTMLButtonElement).disabled || c.getAttribute('aria-disabled') === 'true') {
        logAddSkip(c, 'disabled');
        continue; // 禁用按钮点了也没反应
      }
      if (withinRow && c.closest('tr') !== withinRow) continue; // 只点本行的「添加」
      if (excludeOtherTables) {
        const t = c.closest('table');
        // 只排除"无关表"里的按钮；若网格嵌套在外层布局表内（东华式：按钮在外层表、网格在内层表），
        // 外层表是目标表的祖先 → 其按钮是合法的加行按钮（巨能填全局兜底同款思路）
        if (t && t !== table && !t.contains(table)) {
          logAddSkip(c, 'other-table');
          continue;
        }
      }
      // 多候选打分：真实按钮 > 链接/输入 > 装饰性 span/div；带内联 onclick、class 含 add 的加分（避免点到无处理器的文本节点）
      const tag = c.tagName.toLowerCase();
      let s = tag === 'button' ? 4 : tag === 'a' || tag === 'input' ? 3 : 1;
      if (typeof ((c as HTMLElement & { onclick?: unknown }).onclick) === 'function') s += 2;
      if (/(^|[-_])add([-_]|$)|btnadd|addbtn|addrow|addline|append|insert/i.test((c.getAttribute('class') || '').toLowerCase())) s += 1;
      if (s > bestScore) {
        best = c;
        bestScore = s;
      }
    }
    return best;
  };
  if (withinRow) return search(withinRow, false);
  return search(table, false) || findTableActionLink(table) || search(table.parentElement, true) || search(document.body, true);
}

// ===================== 通用行工具 =====================

export function dataRowsOf(table: HTMLTableElement): HTMLTableRowElement[] {
  return Array.from(table.rows).slice(1);
}

/** 行内是否含有可写控件（输入框/文本域/可编辑元素） */
export function rowHasInput(row: HTMLTableRowElement): boolean {
  return !!row.querySelector('input:not([type="hidden"]), textarea, [contenteditable="true"]');
}

/** "没有数据/暂无数据"占位行（无输入框的提示行） */
export function isPlaceholderRow(row: HTMLTableRowElement): boolean {
  if (rowHasInput(row)) return false;
  return /没有数据|暂无数据|无记录|暂无记录|nodata/i.test(normalizeText(row.textContent || ''));
}

/** 表格的有效数据行：跳过表头、占位行与无输入框的行 */
export function validDataRows(table: HTMLTableElement): HTMLTableRowElement[] {
  return Array.from(table.rows).slice(1).filter((r) => rowHasInput(r) && !isPlaceholderRow(r));
}

/** 单元格内是否有可见输入/选择控件（空白模板行、仅图标按钮的行不算可填） */
export function cellHasControl(row: HTMLTableRowElement, idx: number): boolean {
  return idx >= 0 && !!row.cells[idx] && !!row.cells[idx].querySelector('input:not([type="hidden"]), select, textarea, [contenteditable="true"]');
}

/** 单元格值是否视为"空"（请选择/--/无 等占位选项不算内容） */
function cellValueEmpty(v: string): boolean {
  const t = (v || '').trim();
  return !t || /^(请选择|--+|-|无)$/.test(t);
}

/** 行的所有可写格均为空（保护用户已填/半填的行——绝不覆盖用户数据） */
export function rowFullyEmpty(row: HTMLTableRowElement, idxs: number[]): boolean {
  for (const idx of idxs) {
    if (idx < 0 || !row.cells[idx]) continue;
    const el = row.cells[idx].querySelector('input:not([type="hidden"]), select, textarea') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    if (el && !cellValueEmpty(el.value || '')) return false;
  }
  return true;
}

// ===================== 统一填充内核 =====================

/** 内核上下文：传递给每表差异钩子的公共能力（只读） */
export interface TableFillCtx {
  doc: Document;
  beforeAdd?: (i: number) => void | number;
  /** 当前连续加行失败轮次 */
  attempt: number;
  /** 当前条目序号（spec.entries 内的下标） */
  index: number;
  allowCommitActions: boolean;
}

/**
 * 已存在行的差量处理结果：
 * - 'present'：页面已有该条目，已处理（跳过、推进断点，不计入返回值）
 * - 'filled'：页面已有该条目且已处理完成（计入返回值，外语表语义）
 * - 'retry'：钩子已点击行内落库按钮（北邮式"添加"），继续等待落库后再判定
 * - null：无已有行，内核继续找空行/加行
 */
export type ExistingRowOutcome = 'present' | 'filled' | 'retry' | null;

/** 每张动态表的差异配置：内核负责安全骨架，spec 只描述"这张表长什么样、怎么填" */
export interface DynamicTableSpec<TInfo extends { table: HTMLTableElement }, TEntry> {
  /** 决策日志/弹窗归责用的表名（achievements/experiences/awards/language/family） */
  kind: string;
  /** 本次要填的条目（调用方已完成过滤与截断） */
  entries: TEntry[];
  /** 定位表格（每次轮询都重新调用：加行可能重建 DOM 或整页刷新） */
  findTable: (doc: Document) => TInfo | null;
  /** 已存在行匹配与差量处理（补缺/归一化/行内落库）；不提供则视为无去重 */
  matchExisting?: (info: TInfo, entry: TEntry, ctx: TableFillCtx) => Promise<ExistingRowOutcome> | ExistingRowOutcome;
  /** 空行判定（整行全空才可用，绝不覆盖用户半填的行） */
  isEmptyRow: (row: HTMLTableRowElement, info: TInfo) => boolean;
  /** 填写一行；返回 false 视为写不进（整函数停止，交外层预算与人工核对） */
  fillRow: (row: HTMLTableRowElement, info: TInfo, entry: TEntry, doc: Document) => boolean;
  /** 填写前的表级准备（家庭成员自愈：本人姓名误入网格行 → 清空） */
  beforeFillRow?: (info: TInfo, doc: Document) => void;
  /** 北邮式逐行网格：填写后取行内 DoPostback「添加」落库 */
  rowCommitButton?: (info: TInfo, row: HTMLTableRowElement) => HTMLElement | null;
  /** 加行点击打开"新增"弹窗时，弹窗内按语义填写并确认（仅学术成果等支持弹窗加行的表） */
  fillAddDialog?: (doc: Document, dialog: OpenDialogInfo, entry: TEntry, index: number) => Promise<boolean>;
  /** EasyUI click-to-edit 网格：无加行/保存按钮时返回可点击激活的模板行单元格 */
  findTemplateCell?: (info: TInfo) => HTMLElement | null;
  /** 南理工式「保存」按钮落库（默认开启；外语表等绝不点保存的表显式关闭） */
  useSaveButton?: boolean;
  /** 加行点击策略回退基值：默认 0；成果表按连续失败轮次轮换（strategy=attempt） */
  strategyForAttempt?: (attempt: number) => number;
  /** 隐藏行串同步（川大/长大式"可见子表+隐藏行码串"）：默认开启；无隐藏串形态的页面自动空转无害 */
  blobSync?: boolean;
}

/**
 * 统一动态表填充内核：按条目逐条填写，行数不够时验证式加行（连续失败计数封顶，成功清零）。
 * 安全骨架（与巨能填对齐的安全规则）：
 * - 只填整行全空的行，绝不覆盖用户半填内容；
 * - 加行单次点击 + 行数增长验证，未增长立即整体停止（跨轮由外层断点续填按连续失败预算重试并轮换策略）；
 * - 行数上限弹窗出现即停止；点击打开编辑弹窗立即温和关闭（绝不覆盖已有行）；
 * - 整页回发等待与旧文档刹车由内核统一处理。
 */
export async function runDynamicTableFill<TInfo extends { table: HTMLTableElement }, TEntry>(
  spec: DynamicTableSpec<TInfo, TEntry>,
  doc: Document,
  startIndex = 0,
  beforeAdd?: (i: number) => void | number,
  maxAddAttempts = 10,
  allowCommitActions = true,
  onProcessed?: (nextIndex: number) => void,
): Promise<number> {
  const entries = spec.entries;
  let filled = 0;
  for (let i = startIndex; i < entries.length; i++) {
    const entry = entries[i];
    let row: HTMLTableRowElement | null = null;
    let doneKind: 'present' | 'filled' | null = null;
    let abort = false; // 本轮失败/中止：整体停止（跨轮由外层断点续填接管）
    let attempt = 0; // 连续加行失败计数：仅"点击后行数未增长"才 +1，成功增长不计数
    let retries = 0; // 已存在行的行内落库重试预算（北邮式"添加"）
    let pbWaits = 0; // 回发等待次数：与失败分开计，防止回发窗口把失败预算烧光后卡死
    let iters = 0; // 安全阀：单条记录总迭代上限，防"行一直加但永远不被判定可用"的异常页面无限点击
    while (attempt <= maxAddAttempts && ++iters <= maxAddAttempts * 2 + 6) {
      if (!docAlive(doc)) return filled; // 整页回发已刷新：续填接管，旧文档不再操作
      if (postbackJustFired(doc)) {
        if (++pbWaits <= 4) {
          await sleep(2000); // 回发进行中：等刷新，不连点
          continue;
        }
        // 回发窗口（约 8 秒）已耗尽而文档仍在：不再空等，按当前页面状态继续
      }
      const info = spec.findTable(doc);
      if (!info) {
        logRowDecision(doc, { kind: spec.kind, index: i, decision: 'table-missing' });
        abort = true;
        break;
      }
      const ctx: TableFillCtx = { doc, beforeAdd, attempt, index: i, allowCommitActions };
      const existing = spec.matchExisting ? await spec.matchExisting(info, entry, ctx) : null;
      if (existing === 'present' || existing === 'filled') {
        doneKind = existing;
        break;
      }
      if (existing === 'retry') {
        if (++retries > maxAddAttempts) {
          abort = true; // 行内落库始终未生效：停止空转
          break;
        }
        continue;
      }
      // 优先填空行（关键格为空且有关键输入框；整行全空才用，避免覆盖用户半填的行）
      const empty = validDataRows(info.table).find((r) => spec.isEmptyRow(r, info));
      if (empty) {
        row = empty;
        break;
      }
      // 系统已提示行数上限：不再点击，停止并如实报告（巨能填 known_table_row_limits 同款停止条件）
      const limit = detectRowLimitBlocked(doc);
      if (limit) {
        logRowDecision(doc, { kind: spec.kind, index: i, decision: 'limit-blocked', issue: 'E1202', reason: limit });
        abort = true;
        break;
      }
      if (attempt >= maxAddAttempts) {
        logRowDecision(doc, { kind: spec.kind, index: i, decision: 'add-fail-cap', issue: 'E1201', failRound: attempt });
        abort = true; // 纯填充模式（maxAddAttempts=0）不点按钮
        break;
      }
      const addBtn = findAddButton(info.table);
      if (addBtn && (allowCommitActions || isExplicitAddRowAction(addBtn))) {
        const rowsBefore = validDataRows(info.table).length;
        const dialogsBefore = visibleDialogRoots(doc);
        // 单次点击（策略跨轮轮换）+ 行数验证；整页回发由断点续填接管
        if (await clickAddRowVerified(doc, addBtn, spec.findTable, rowsBefore, beforeAdd, i, spec.strategyForAttempt ? spec.strategyForAttempt(attempt) : 0)) continue;
        if (!docAlive(doc)) continue;
        // 行数上限弹窗最先判定：命中时保留弹窗给用户看，不关闭不继续
        const limitAfterClick = detectRowLimitBlocked(doc);
        if (limitAfterClick) {
          logRowDecision(doc, { kind: spec.kind, index: i, decision: 'limit-blocked', issue: 'E1202', failRound: attempt, reason: limitAfterClick });
          abort = true;
          break;
        }
        // 点击打开的是弹窗而非直接加行：新增弹窗就地填写确认，编辑弹窗立即关闭（防止覆盖已有行）
        const dialogOutcome = await handleDialogAfterClick(doc, dialogsBefore, spec.kind, i, spec.fillAddDialog ? (dialog) => spec.fillAddDialog!(doc, dialog, entry, i) : undefined);
        if (dialogOutcome === 'filled') continue;
        if (dialogOutcome !== 'none') {
          abort = true; // 弹窗已处理（关闭/无法安全填写）：本条中止，交由外层预算与人工核对
          break;
        }
        attempt++;
        logRowDecision(doc, { kind: spec.kind, index: i, decision: 'no-growth', issue: 'E1201', failRound: attempt });
        abort = true; // 行数未增长：本轮停止连点，跨轮由外层按连续失败预算重试并轮换点击策略
        break;
      }
      // 南理工式：保存后服务器才多出一行 → 自动点「保存」
      const saveBtn = spec.useSaveButton === false || !allowCommitActions ? null : findSaveButton(info.table);
      if (saveBtn) {
        const rowsBefore = validDataRows(info.table).length;
        if (await clickAddRowVerified(doc, saveBtn, spec.findTable, rowsBefore, beforeAdd, i, spec.strategyForAttempt ? spec.strategyForAttempt(attempt) : 0)) continue;
        if (!docAlive(doc)) continue;
        attempt++;
        logRowDecision(doc, { kind: spec.kind, index: i, decision: 'save-no-growth', issue: 'E1201', failRound: attempt });
        abort = true;
        break;
      }
      // 无加行按钮：尝试点击空白模板行激活编辑（EasyUI click-to-edit 网格）
      if (spec.findTemplateCell) {
        const cell = spec.findTemplateCell(info);
        if (cell) {
          cell.click();
          await sleep(700);
          continue;
        }
      }
      logRowDecision(doc, { kind: spec.kind, index: i, decision: 'no-add-btn', issue: 'E1207' });
      abort = true;
      break;
    }
    if (doneKind) {
      if (doneKind === 'filled') filled++;
      onProcessed?.(i + 1); // 已存在/已处理的条目也必须推进断点，防止外层空转误判失败
      continue;
    }
    if (abort || !row) break;
    const info = spec.findTable(doc);
    if (!info) break;
    spec.beforeFillRow?.(info, doc);
    if (!spec.fillRow(row, info, entry, doc)) break;
    filled++;
    onProcessed?.(i + 1); // 本条已完整写入：显式推进断点（n 计数不含"已存在跳过"的条目）
    if (spec.blobSync !== false) {
      try {
        // 隐藏行串同步：以页面实况回读重编码写入关联隐藏域（页面脚本对值做过变换时以页面为准），并落盘跨页 stash（富者优先）
        syncTableBlobs(doc, info.table, { stashKey: `table:${spec.kind}` });
      } catch {
        // blob 同步失败绝不影响填写主流程
      }
    }
    // 北邮式逐行网格：填完立即点本行 DoPostback「添加」落库（自动换行/自动添加）
    if (spec.rowCommitButton && allowCommitActions && maxAddAttempts > 0) {
      const rowBtn = spec.rowCommitButton(info, row);
      if (rowBtn && isDoPostbackAction(rowBtn)) {
        await clickPageAction(rowBtn, clickAttempt(beforeAdd, i, 0));
        await sleep(1500); // 北邮等服务器回发较慢：给足新行出现的时间再继续
      }
    }
  }
  return filled;
}
