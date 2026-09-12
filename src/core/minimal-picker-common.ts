// 简约系统 ASP.NET 选择器公共流程，只供院校/专业两个独立内核复用。

import { CodeNameBinding, PopupPickContext, resolveCodeNameBinding, verifyCodeNameBinding } from './popup-binding';
import { dispatchValueEvents } from './event-policy';

export interface MinimalPickerSpec {
  triggerSelectors: string[];
  codeSelectors: string[];
  nameSelectors: string[];
  frameNames: string[];
  frameSrcPattern: RegExp;
  category?: string;
}

export type MinimalPickStatus = 'picked' | 'opened' | 'failed' | 'not-applicable';

function visible(el: Element): boolean {
  const h = el as HTMLElement;
  if (h.hidden) return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(h);
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  const rect = h.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0 || !!h.offsetParent;
}

function setInput(el: HTMLInputElement, value: string): void {
  const win = el.ownerDocument.defaultView;
  const setter = Object.getOwnPropertyDescriptor(win?.HTMLInputElement.prototype || HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  // A1/W-6:派发收敛至 event-policy（tail=blur-only 与原三事件逐字面等价：blur 无 focusout、不冒泡）。
  dispatchValueEvents(el, { tail: 'blur-only' });
}

function findBySelectors<T extends Element>(doc: Document, selectors: string[]): T | null {
  for (const selector of selectors) {
    try {
      const byId = /^[a-z_$][\w$-]*$/i.test(selector) ? doc.getElementById(selector) : null;
      const hit = (byId || doc.querySelector(selector)) as T | null;
      if (hit) return hit;
    } catch {
      // 忽略无效选择器。
    }
  }
  return null;
}

function findTrigger(doc: Document, spec: MinimalPickerSpec): HTMLElement | null {
  for (const selector of spec.triggerSelectors) {
    const hits: Element[] = [];
    const byId = doc.getElementById(selector);
    if (byId) hits.push(byId);
    try { hits.push(...Array.from(doc.querySelectorAll(selector))); } catch { /* id 简写可能不是合法 CSS */ }
    const visibleHit = hits.find(visible) as HTMLElement | undefined;
    if (visibleHit) return visibleHit;
  }
  return null;
}

function click(el: HTMLElement): void {
  const MouseCtor = el.ownerDocument.defaultView?.MouseEvent || MouseEvent;
  el.dispatchEvent(new MouseCtor('mousedown', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseCtor('mouseup', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseCtor('click', { bubbles: true, cancelable: true }));
}

function frameDocument(doc: Document, spec: MinimalPickerSpec): Document | null {
  const frames = Array.from(doc.querySelectorAll<HTMLIFrameElement>('iframe')).filter((frame) => {
    const token = `${frame.name} ${frame.id} ${frame.getAttribute('src') || ''}`;
    return spec.frameNames.some((name) => token.toLowerCase().includes(name.toLowerCase())) || spec.frameSrcPattern.test(token);
  });
  frames.sort((a, b) => Number(visible(b)) - Number(visible(a)));
  for (const frame of frames) {
    try {
      if (frame.contentDocument?.body) return frame.contentDocument;
    } catch {
      // 跨域 frame 不可读，交给人工。
    }
  }
  return null;
}

function queryButton(doc: Document): HTMLElement | null {
  return Array.from(doc.querySelectorAll<HTMLElement>('a,button,input[type="button"],input[type="submit"]')).find((button) =>
    visible(button) && /^(查询|搜索|查找|查 询|搜 索)$/.test((button.textContent || button.getAttribute('value') || '').trim()),
  ) || null;
}

function queryInput(doc: Document): HTMLInputElement | null {
  const preferred = findBySelectors<HTMLInputElement>(doc, ['#txtWord', '[name="txtWord"]', '#keyword', '[name="keyword"]', 'input[name*="key" i]', 'input[name*="word" i]']);
  if (preferred && visible(preferred)) return preferred;
  return Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="text"],input:not([type])')).find(visible) || null;
}

function chooseRow(doc: Document, value: string, codes: string[]): { control: HTMLElement; code: string; name: string } | null {
  const wanted = value.replace(/\s+/g, '');
  const rows = Array.from(doc.querySelectorAll<HTMLTableRowElement>('tr')).filter(visible);
  const scored = rows.map((row) => {
    const text = (row.textContent || '').trim();
    const flat = text.replace(/\s+/g, '');
    const code = (text.match(/[a-z0-9][a-z0-9._-]{3,19}/i) || [])[0] || '';
    let score = codes.includes(code) ? 100 : 0;
    if (flat.includes(wanted)) score += 70;
    const controls = Array.from(row.querySelectorAll<HTMLElement>('a,button,input[type="button"],input[type="submit"],input[type="image"],[onclick]'));
    const control = controls.find((item) => /^(选择|选取|选中|确定)$/.test((item.textContent || item.getAttribute('value') || '').trim())) || controls[controls.length - 1];
    return { control, code, name: text.replace(code, '').replace(/选择|选取|选中/g, '').trim(), score };
  }).filter((item) => !!item.control && item.score > 0).sort((a, b) => b.score - a.score);
  return scored[0] ? { control: scored[0].control, code: scored[0].code, name: scored[0].name } : null;
}

function bindingFor(doc: Document, anchor: Element, spec: MinimalPickerSpec, context?: PopupPickContext): CodeNameBinding | null {
  return resolveCodeNameBinding(doc, anchor, {
    ...context,
    codeSelectors: context?.codeSelectors?.length ? context.codeSelectors : spec.codeSelectors,
    nameSelectors: context?.nameSelectors?.length ? context.nameSelectors : spec.nameSelectors,
  });
}

/** 功能：执行简约系统 iframe 查询、行选择和代码名称回读。 */
export async function runMinimalPicker(doc: Document, anchor: Element, value: string, spec: MinimalPickerSpec, context?: PopupPickContext, isCancelled?: () => boolean): Promise<MinimalPickStatus> {
  const effective: MinimalPickerSpec = {
    ...spec,
    triggerSelectors: context?.triggerSelectors?.length ? context.triggerSelectors : spec.triggerSelectors,
    frameNames: context?.frameNames?.length ? context.frameNames : spec.frameNames,
    frameSrcPattern: context?.frameSrcPatterns?.length
      ? new RegExp(context.frameSrcPatterns.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*')).join('|'), 'i')
      : spec.frameSrcPattern,
  };
  const trigger = findTrigger(doc, effective);
  const existingFrame = frameDocument(doc, effective);
  if (!trigger && !existingFrame) return 'not-applicable';
  if (trigger) click(trigger);
  let pickerDoc = existingFrame;
  for (let i = 0; i < 16 && !pickerDoc; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    pickerDoc = frameDocument(doc, effective);
  }
  if (!pickerDoc) return trigger ? 'opened' : 'failed';
  if (isCancelled?.()) return 'not-applicable'; // H04:原轮失效 → 不得再操作弹窗

  if (spec.category) {
    const categories = Array.from(pickerDoc.querySelectorAll<HTMLSelectElement>('select')).filter((select) => visible(select) && select.options.length >= 6);
    const category = categories[0];
    const option = category ? Array.from(category.options).find((item) => item.text.trim() === spec.category) : undefined;
    if (category && option && category.value !== option.value) {
      category.value = option.value;
      // A1/W-6:派发收敛至 event-policy（tail=change-only 与原单 change 逐字面等价——分类联动不派 input）。
      dispatchValueEvents(category, { tail: 'change-only' });
      await new Promise((resolve) => setTimeout(resolve, 450));
      pickerDoc = frameDocument(doc, effective) || pickerDoc;
    }
  }

  const codes = [context?.expectedCode || '', ...(context?.codeAliases || [])].filter(Boolean);
  const queries = [...codes, value, value.slice(0, 6), value.slice(0, 4)].filter((item, index, all) => item.length >= 2 && all.indexOf(item) === index);
  for (const query of queries) {
    if (isCancelled?.()) return 'not-applicable'; // H04:每轮查询前复核原轮
    const input = queryInput(pickerDoc);
    const button = queryButton(pickerDoc);
    if (input) setInput(input, query);
    if (button) click(button);
    await new Promise((resolve) => setTimeout(resolve, 500));
    pickerDoc = frameDocument(doc, effective) || pickerDoc;
    const hit = chooseRow(pickerDoc, value, codes.length ? codes : [query]);
    if (!hit) continue;
    if (isCancelled?.()) return 'not-applicable'; // H04:点击结果行之前复核原轮
    click(hit.control);
    for (let attempt = 0; attempt < 12; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (isCancelled?.()) return 'not-applicable'; // H04:等待回填期间原轮失效 → 不宣称成功
      const binding = bindingFor(doc, anchor, effective, context);
      if (binding && verifyCodeNameBinding(binding, value, context)) return 'picked';
    }
    // 服务器回填失败时，只允许对精确声明的代码/名称对进行明文兜底。
    const binding = bindingFor(doc, anchor, effective, context);
    if (binding && hit.code) {
      setInput(binding.code, hit.code);
      setInput(binding.name, value);
      if (verifyCodeNameBinding(binding, value, context)) return 'picked';
    }
  }
  return 'opened';
}
