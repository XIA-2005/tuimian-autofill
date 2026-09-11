// 回归观测器 v2(PLAN v4 · F00)
// 审查教训:只靠事件观察会漏"静默 setter 写入后又改回";全局 document 混用多个 realm 会污染用例;
// 按钮监听装错时机造成假阴性。本版:
// 1) makeDomIsolated:创建文档并把 globals 切到该 realm,返回 restore(调用方 finally 还原)。
// 2) 元素身份:WeakMap 稳定 id,快照按元素记录;重复 name/id 不互相覆盖。
// 3) 写入观测:包装该 realm 的 input/textarea/select value 与 input checked setter,记录每次写(含无声写→改回)。
// 4) instrument:捕获事件 + 记录写日志起点;支持 checkpoint 增量计数;restore 成对卸载监听与 globals。
// 边界(如实声明):jsdom 无法观测 isTrusted 真值、真实框架内部模型、canvas/原生 UI——由浏览器夹具覆盖。
import { JSDOM } from 'jsdom';
import type { ObserverHit } from './types';

const elementIds = new WeakMap<Element, number>();
let nextElementId = 1;

/** 功能:返回元素稳定身份编号(同名/同 id 元素互不覆盖)。 */
export function elementId(el: Element): number {
  let id = elementIds.get(el);
  if (id === undefined) {
    id = nextElementId++;
    elementIds.set(el, id);
  }
  return id;
}

export interface ObservedWrite {
  el: Element;
  prop: 'value' | 'checked';
  value: string | boolean;
  at: number;
}

export interface ObserverCheckpoint {
  events: number;
  writes: number;
}

export interface Observer {
  hits: ObserverHit[];
  installed: boolean;
  /** 事件/写入增量计数(自 instrument 或自 checkpoint 起)。 */
  countsSince(checkpoint: ObserverCheckpoint | null, target: string | number, type?: string): { events: number; writes: number };
  checkpoint(): ObserverCheckpoint;
  restore(): void;
}

interface RealmLog {
  writes: ObservedWrite[];
  patched: boolean;
}
const realmLogs = new WeakMap<Window, RealmLog>();

type GlobalKey =
  | 'window' | 'document' | 'HTMLInputElement' | 'HTMLSelectElement' | 'HTMLTextAreaElement'
  | 'getComputedStyle' | 'Event' | 'MouseEvent' | 'KeyboardEvent' | 'Node' | 'DOMParser';

function captureGlobals(): Partial<Record<GlobalKey, unknown>> {
  const g = globalThis as Record<string, unknown>;
  const out: Partial<Record<GlobalKey, unknown>> = {};
  for (const key of ['window', 'document', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'getComputedStyle', 'Event', 'MouseEvent', 'KeyboardEvent', 'Node', 'DOMParser'] as GlobalKey[]) {
    out[key] = g[key];
  }
  return out;
}

function restoreGlobals(saved: Partial<Record<GlobalKey, unknown>> | null): void {
  if (!saved) return;
  const g = globalThis as Record<string, unknown>;
  for (const key of Object.keys(saved) as GlobalKey[]) {
    const value = saved[key];
    if (value === undefined) delete g[key];
    else g[key] = value;
  }
}

function applyGlobals(win: {
  document: Document;
  getComputedStyle: typeof getComputedStyle;
  HTMLInputElement: typeof HTMLInputElement;
  HTMLSelectElement: typeof HTMLSelectElement;
  HTMLTextAreaElement: typeof HTMLTextAreaElement;
  Event: typeof Event;
  MouseEvent: typeof MouseEvent;
  KeyboardEvent: typeof KeyboardEvent;
  Node: typeof Node;
  DOMParser: typeof DOMParser;
}): void {
  const g = globalThis as Record<string, unknown>;
  g.window = win;
  g.document = win.document;
  g.HTMLInputElement = win.HTMLInputElement;
  g.HTMLSelectElement = win.HTMLSelectElement;
  g.HTMLTextAreaElement = win.HTMLTextAreaElement;
  g.getComputedStyle = win.getComputedStyle.bind(win);
  g.Event = win.Event;
  g.MouseEvent = win.MouseEvent;
  g.KeyboardEvent = win.KeyboardEvent;
  g.Node = win.Node;
  g.DOMParser = win.DOMParser;
}

/** 功能:创建隔离文档(globals 切入该 realm)。调用方在 finally 中 restore(),避免污染其它用例。 */
export function makeDomIsolated(html: string, url: string): { dom: JSDOM; doc: Document; restore(): void } {
  const saved = captureGlobals();
  const dom = new JSDOM(html, { url });
  const win = dom.window as unknown as {
    document: Document;
    getComputedStyle: typeof getComputedStyle;
    Element: typeof Element;
    HTMLInputElement: typeof HTMLInputElement;
    HTMLSelectElement: typeof HTMLSelectElement;
    HTMLTextAreaElement: typeof HTMLTextAreaElement;
    Event: typeof Event;
    MouseEvent: typeof MouseEvent;
    KeyboardEvent: typeof KeyboardEvent;
    Node: typeof Node;
    DOMParser: typeof DOMParser;
  };
  applyGlobals(win);
  const rect = () => ({
    width: 200, height: 24, top: 0, left: 0, right: 200, bottom: 24,
    x: 0, y: 0, toJSON: () => ({}),
  });
  win.Element.prototype.getBoundingClientRect = rect as never;
  patchRealmWriters(dom.window as unknown as Window);
  return { dom, doc: win.document, restore: () => restoreGlobals(saved) };
}

/** 功能:包装 realm 的 value/checked setter,记录每次写入(不改写入行为)。每个 realm 只包装一次。 */
function patchRealmWriters(win: Window): void {
  if (realmLogs.has(win)) return;
  const w = win as unknown as {
    HTMLInputElement?: typeof HTMLInputElement;
    HTMLTextAreaElement?: typeof HTMLTextAreaElement;
    HTMLSelectElement?: typeof HTMLSelectElement;
  };
  const log: RealmLog = { writes: [], patched: true };
  realmLogs.set(win, log);
  const record = (el: Element, prop: 'value' | 'checked', value: string | boolean): void => {
    log.writes.push({ el, prop, value, at: Date.now() });
  };
  const patch = <T>(proto: unknown, prop: 'value' | 'checked'): void => {
    try {
      const desc = Object.getOwnPropertyDescriptor(proto as object, prop);
      if (!desc || typeof desc.set !== 'function') return;
      const original = desc.set;
      Object.defineProperty(proto as object, prop, {
        ...desc,
        set(this: Element, value: T) {
          record(this, prop, value as unknown as string | boolean);
          original.call(this, value);
        },
      });
    } catch {
      /* 该 realm 不支持时放弃(记录为不可观测边界) */
    }
  };
  if (w.HTMLInputElement) {
    patch<string>(w.HTMLInputElement.prototype, 'value');
    patch<boolean>(w.HTMLInputElement.prototype, 'checked');
  }
  if (w.HTMLTextAreaElement) patch<string>(w.HTMLTextAreaElement.prototype, 'value');
  if (w.HTMLSelectElement) patch<string>(w.HTMLSelectElement.prototype, 'value');
}

/** 功能:在文档上安装观测并确保 globals 属于该 realm;restore() 成对卸载。 */
export function instrument(doc: Document): Observer {
  const win = doc.defaultView;
  if (!win) throw new Error('instrument: 文档无 defaultView');
  const g = globalThis as Record<string, unknown>;
  const saved = g.document === doc ? null : captureGlobals();
  if (saved) {
    const winAny = win as unknown as {
      document: Document;
      getComputedStyle: typeof getComputedStyle;
      HTMLInputElement: typeof HTMLInputElement;
      HTMLSelectElement: typeof HTMLSelectElement;
      HTMLTextAreaElement: typeof HTMLTextAreaElement;
      Event: typeof Event;
      MouseEvent: typeof MouseEvent;
      KeyboardEvent: typeof KeyboardEvent;
      Node: typeof Node;
      DOMParser: typeof DOMParser;
    };
    applyGlobals(winAny);
    patchRealmWriters(win);
  }
  const hits: ObserverHit[] = [];
  const TYPES = ['input', 'change', 'click', 'focusout', 'submit'];
  const targetName = (el: EventTarget | null): string => {
    const node = el as Element | null;
    if (!node || typeof node.getAttribute !== 'function') return String(el);
    return node.getAttribute('name') || node.getAttribute('id') || node.tagName.toLowerCase();
  };
  const listeners = new Map<string, EventListener>();
  for (const type of TYPES) {
    const fn = ((e: Event) => hits.push({ target: targetName(e.target), type })) as EventListener;
    listeners.set(type, fn);
    doc.addEventListener(type, fn, true);
  }
  const log = realmLogs.get(win);
  const writeStart = log ? log.writes.length : 0;
  const counts = (sinceEvents: number, sinceWrites: number, target: string | number, type?: string): { events: number; writes: number } => {
    const events = hits.slice(sinceEvents).filter((h) => {
      if (type && h.type !== type) return false;
      if (typeof target === 'number') {
        const el = doc.querySelector(`[name="${h.target}"],[id="${h.target}"]`);
        return el ? elementId(el) === target : false;
      }
      return h.target === target;
    }).length;
    const writes = log
      ? log.writes.slice(sinceWrites).filter((w) => {
          if (typeof target === 'number') return elementId(w.el) === target;
          const name = w.el.getAttribute('name') || w.el.getAttribute('id') || w.el.tagName.toLowerCase();
          return name === target;
        }).length
      : 0;
    return { events, writes };
  };
  return {
    hits,
    installed: true,
    checkpoint(): ObserverCheckpoint {
      return { events: hits.length, writes: log ? log.writes.length : 0 };
    },
    countsSince(checkpoint: ObserverCheckpoint | null, target: string | number, type?: string): { events: number; writes: number } {
      const base = checkpoint || { events: 0, writes: writeStart };
      return counts(base.events, base.writes, target, type);
    },
    restore(): void {
      for (const [type, fn] of listeners) doc.removeEventListener(type, fn, true);
      restoreGlobals(saved);
    },
  };
}

// ============ 控件状态快照与操作(元素身份优先,名称仅作便捷查询) ============

export interface ControlSnapshot {
  el: Element;
  name: string;
  tag: string;
  value: string;
  checked: boolean;
  selectedText: string;
}

function snapshotOf(el: Element): ControlSnapshot {
  const tag = el.tagName.toLowerCase();
  let value = '';
  let checked = false;
  let selectedText = '';
  if (tag === 'select') {
    const sel = el as HTMLSelectElement;
    value = sel.value;
    const opt = sel.selectedOptions && sel.selectedOptions[0];
    selectedText = opt ? opt.text : '';
  } else if (tag === 'input') {
    const inp = el as HTMLInputElement;
    if (inp.type === 'checkbox' || inp.type === 'radio') checked = inp.checked;
    else value = inp.value;
  } else if (tag === 'textarea') {
    value = (el as HTMLTextAreaElement).value;
  }
  return { el, name: el.getAttribute('name') || '', tag, value, checked, selectedText };
}

/** 功能:全文档控件快照(按元素身份,重复 name 各自留痕)。 */
export function snapshotControls(doc: Document): Map<Element, ControlSnapshot> {
  const out = new Map<Element, ControlSnapshot>();
  doc.querySelectorAll('input,select,textarea').forEach((el) => out.set(el, snapshotOf(el)));
  return out;
}

/** 功能:按 name 查询(可多个;radio 组等同名场景请用此列表而非首元素)。 */
export function controlsByName(doc: Document, name: string): Element[] {
  return Array.from(doc.querySelectorAll(`[name="${name}"]`));
}

/** 功能:按 name 取首个控件状态(便捷;重复 name 场景用 controlsByName+snapshotOf)。 */
export function controlState(doc: Document, name: string): ControlSnapshot {
  const el = doc.querySelector(`[name="${name}"]`);
  return el ? snapshotOf(el) : { el: doc.documentElement, name, tag: '', value: '', checked: false, selectedText: '' };
}

/** 功能:预置表单初始值(不派发事件)。select 按文本或值找 option。 */
export function prefillForm(doc: Document, prefill: Record<string, string>): void {
  for (const [name, value] of Object.entries(prefill)) {
    const el = doc.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
    if (!el) continue;
    if (el.tagName === 'SELECT') {
      const sel = el as HTMLSelectElement;
      const opt = Array.from(sel.options).find((o) => o.text === value || o.value === value);
      if (opt) sel.value = opt.value;
    } else {
      (el as HTMLInputElement).value = value;
    }
  }
}

/** 功能:用原生 setter+事件模拟写入(trusted 尽力标记;jsdom 限制下 isTrusted 可能不可设)。 */
export function writeControl(doc: Document, name: string, value: string, trusted: boolean): void {
  const el = doc.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
  if (!el) return;
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc && desc.set) desc.set.call(el, value);
  else el.value = value;
  for (const type of ['input', 'change']) {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    if (trusted) {
      try {
        Object.defineProperty(ev, 'isTrusted', { value: true });
      } catch {
        /* jsdom 限制 */
      }
    }
    el.dispatchEvent(ev);
  }
}

/** 功能:静默写入(不派发事件)——模拟页面脚本直接 setter 赋值,观测器应通过写入日志捕获。 */
export function silentWrite(doc: Document, name: string, value: string): void {
  const el = doc.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
  if (!el) return;
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc && desc.set) desc.set.call(el, value);
  else el.value = value;
}


/** 兼容入口(只读用例):创建文档并立即还原 globals;需要生产写入的场景请用 makeDomIsolated+instrument。 */
export function makeDom(html: string, url: string): { dom: JSDOM; doc: Document } {
  const r = makeDomIsolated(html, url);
  r.restore();
  return { dom: r.dom, doc: r.doc };
}
