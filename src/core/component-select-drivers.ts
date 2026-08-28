// 前端选择组件驱动：分别处理 Ant Select、Select2、Element Select 和 Layui Select。

import { PopupPickContext } from './popup-binding';

export type ComponentSelectKind = 'ant' | 'select2' | 'element' | 'layui';
export type ComponentPickStatus = 'picked' | 'opened' | 'failed' | 'not-applicable';

export interface ComponentPickResult {
  status: ComponentPickStatus;
  kind?: ComponentSelectKind;
  reason: string;
  visibleValue?: string;
  modelCode?: string;
}

/** 功能：原生 select 已选中后同步 Select2/Layui 等组件的可见标签。 */
export function syncNativeComponentSelect(select: HTMLSelectElement, kind?: ComponentSelectKind): void {
  const option = select.selectedOptions[0];
  if (!option) return;
  const label = (option.textContent || '').trim();
  const next = select.nextElementSibling as HTMLElement | null;
  const root = kind === 'select2' && next?.matches('.select2-container')
    ? next
    : (next?.matches('.layui-form-select,.el-select,.ant-select') ? next : select.parentElement);
  if (!root) return;
  const targets = root.querySelectorAll<HTMLElement | HTMLInputElement>('.select2-selection__rendered,.layui-select-title input,.el-select__selected-item,.ant-select-selection-item');
  targets.forEach((target) => {
    if ('value' in target) target.value = label;
    else target.textContent = label;
    target.setAttribute('title', label);
  });
}

function normalized(value: string): string {
  return (value || '').replace(/^\s*[a-z0-9._-]{2,20}\s*[|｜:：-]?\s*/i, '').replace(/[\s（）()·]/g, '').toLowerCase();
}

function visible(el: Element): boolean {
  const h = el as HTMLElement;
  if (h.hidden || h.getAttribute('aria-hidden') === 'true') return false;
  const win = el.ownerDocument.defaultView;
  const style = win?.getComputedStyle(h);
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  const rect = h.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0 || !!h.offsetParent;
}

function setInput(el: HTMLInputElement, value: string): void {
  const win = el.ownerDocument.defaultView;
  const setter = Object.getOwnPropertyDescriptor(win?.HTMLInputElement.prototype || HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  const tracker = (el as HTMLInputElement & { _valueTracker?: { setValue(value: string): void } })._valueTracker;
  tracker?.setValue('');
  const EventCtor = win?.Event || Event;
  el.dispatchEvent(new EventCtor('input', { bubbles: true }));
  el.dispatchEvent(new EventCtor('change', { bubbles: true }));
}

function fireClick(el: HTMLElement): void {
  const win = el.ownerDocument.defaultView;
  const MouseCtor = win?.MouseEvent || MouseEvent;
  el.dispatchEvent(new MouseCtor('mousedown', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseCtor('mouseup', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseCtor('click', { bubbles: true, cancelable: true }));
}

function rootsFor(anchor: Element): Array<{ kind: ComponentSelectKind; root: HTMLElement }> {
  const specs: Array<[ComponentSelectKind, string]> = [
    ['ant', '.ant-select:not(.ant-cascader)'],
    ['select2', '.select2-container'],
    ['element', '.el-select,.res-select'],
    ['layui', '.layui-form-select'],
  ];
  const out: Array<{ kind: ComponentSelectKind; root: HTMLElement }> = [];
  for (const [kind, selector] of specs) {
    const closest = anchor.closest(selector) as HTMLElement | null;
    if (closest) out.push({ kind, root: closest });
  }
  // Select2 的真实 select 通常位于容器前一个兄弟节点。
  if (anchor instanceof anchor.ownerDocument.defaultView!.HTMLSelectElement) {
    const sibling = anchor.nextElementSibling as HTMLElement | null;
    if (sibling?.matches('.select2-container')) out.push({ kind: 'select2', root: sibling });
  }
  return out;
}

export function detectComponentSelect(anchor: Element, forced?: string): { kind: ComponentSelectKind; root: HTMLElement } | null {
  if (forced && ['ant', 'select2', 'element', 'layui'].includes(forced)) {
    const selector: Record<string, string> = { ant: '.ant-select', select2: '.select2-container', element: '.el-select,.res-select', layui: '.layui-form-select' };
    const root = (anchor.closest(selector[forced]) || anchor.querySelector?.(selector[forced])) as HTMLElement | null;
    if (root) return { kind: forced as ComponentSelectKind, root };
  }
  return rootsFor(anchor)[0] || null;
}

function nativeModel(root: HTMLElement, anchor: Element): HTMLSelectElement | null {
  if (anchor instanceof anchor.ownerDocument.defaultView!.HTMLSelectElement) return anchor;
  const inside = root.querySelector('select') as HTMLSelectElement | null;
  if (inside) return inside;
  const prev = root.previousElementSibling;
  return prev instanceof root.ownerDocument.defaultView!.HTMLSelectElement ? prev : null;
}

function componentSelectors(kind: ComponentSelectKind): { opener: string; search: string; option: string; selected: string } {
  if (kind === 'ant') return {
    opener: '.ant-select-selector,.ant-select-selection,.ant-select-arrow',
    search: 'input.ant-select-selection-search-input,input.ant-select-search__field,input[role="combobox"]',
    option: '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option:not(.ant-select-item-option-disabled),.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-dropdown-menu-item:not(.ant-select-dropdown-menu-item-disabled)',
    selected: '.ant-select-selection-item,.ant-select-selection-selected-value',
  };
  if (kind === 'select2') return {
    opener: '.select2-selection',
    search: '.select2-search__field',
    option: '.select2-results__option[aria-selected]:not([aria-disabled="true"]),.select2-results__option:not(.loading-results)',
    selected: '.select2-selection__rendered',
  };
  if (kind === 'element') return {
    opener: '.el-select__wrapper,.el-select__selection,.el-input__inner,.el-select__caret',
    search: 'input.el-select__input,input.el-input__inner',
    option: '.el-select-dropdown__item:not(.is-disabled),li[role="option"]:not(.is-disabled)',
    selected: '.el-select__selected-item,.el-select__tags-text,.el-input__inner',
  };
  return {
    opener: '.layui-select-title,input',
    search: '.layui-select-title input,input.layui-input',
    option: 'dl.layui-anim-upbit dd:not(.layui-disabled),dd[lay-value]:not(.layui-disabled)',
    selected: '.layui-select-title input,dd.layui-this',
  };
}

function readback(root: HTMLElement, anchor: Element, kind: ComponentSelectKind): { label: string; code: string; selected: boolean } {
  const spec = componentSelectors(kind);
  const model = nativeModel(root, anchor);
  const selectedOption = model?.selectedOptions?.[0];
  const visibleNode = root.querySelector(spec.selected) as HTMLElement | HTMLInputElement | null;
  const visibleValue = visibleNode && 'value' in visibleNode ? visibleNode.value : visibleNode?.textContent || '';
  const label = (selectedOption?.textContent || visibleValue || '').trim().replace(/^×\s*/, '');
  const code = (selectedOption?.value || model?.value || root.getAttribute('data-tui-selected-code') || '').trim();
  const selected = !!selectedOption || !!root.querySelector('[aria-selected="true"],.selected,.is-selected,.layui-this,.ant-select-item-option-selected');
  return { label, code, selected };
}

function readbackOk(root: HTMLElement, anchor: Element, kind: ComponentSelectKind, value: string, context?: PopupPickContext): boolean {
  const got = readback(root, anchor, kind);
  const wanted = normalized(value);
  const label = normalized(got.label);
  if (!label || !(label === wanted || label.includes(wanted) || wanted.includes(label))) return false;
  const codes = [context?.expectedCode || '', ...(context?.codeAliases || [])].filter(Boolean);
  if (codes.length && (!got.code || !codes.includes(got.code))) return false;
  // 有底层 select 时必须确认真实 option；无底层 select 的 React/Vue 组件至少要求选中态存在。
  return !!nativeModel(root, anchor)?.selectedOptions?.[0] || got.selected || kind === 'ant' || kind === 'element';
}

/**
 * 功能：驱动 Ant/Select2/Element/Layui 下拉并读取可见标签和底层模型。
 * 安全边界：只点击组件展开、搜索和选项，不点击页面保存、下一步或提交。
 */
export async function pickComponentOption(anchor: Element, value: string, context?: PopupPickContext): Promise<ComponentPickResult> {
  const detected = detectComponentSelect(anchor, context?.componentDriver);
  if (!detected) return { status: 'not-applicable', reason: '当前字段不是已支持的前端选择组件' };
  const { kind, root } = detected;
  if (/disabled/.test(root.className) || root.getAttribute('aria-disabled') === 'true') return { status: 'failed', kind, reason: '组件处于禁用状态' };
  if (readbackOk(root, anchor, kind, value, context)) {
    const got = readback(root, anchor, kind);
    return { status: 'picked', kind, reason: '组件可见标签和底层模型已经一致', visibleValue: got.label, modelCode: got.code };
  }
  const spec = componentSelectors(kind);
  const opener = (root.querySelector(spec.opener) || root) as HTMLElement;
  fireClick(opener);
  await new Promise((resolve) => setTimeout(resolve, 180));

  const doc = anchor.ownerDocument;
  const search = (root.querySelector(spec.search) || doc.querySelector(spec.search)) as HTMLInputElement | null;
  if (search && !search.readOnly) {
    setInput(search, context?.expectedCode || value);
    await new Promise((resolve) => setTimeout(resolve, 260));
  }
  const wantedCodes = [context?.expectedCode || '', ...(context?.codeAliases || [])].filter(Boolean);
  const candidates = Array.from(doc.querySelectorAll<HTMLElement>(spec.option)).filter(visible).map((option) => {
    const label = normalized(option.textContent || option.getAttribute('title') || '');
    const code = option.getAttribute('data-value') || option.getAttribute('value') || option.getAttribute('lay-value') || '';
    let score = 0;
    if (wantedCodes.includes(code)) score += 100;
    if (label === normalized(value)) score += 80;
    else if (label.includes(normalized(value)) || normalized(value).includes(label)) score += 30;
    return { option, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  const hit = candidates[0]?.option;
  if (!hit) return { status: 'opened', kind, reason: '组件已展开，但没有找到匹配代码或名称的选项' };
  const hitCode = hit.getAttribute('data-value') || hit.getAttribute('value') || hit.getAttribute('lay-value') || hit.getAttribute('data-key') || '';
  if (hitCode) root.setAttribute('data-tui-selected-code', hitCode);
  fireClick(hit);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const ok = readbackOk(root, anchor, kind, value, context);
  const got = readback(root, anchor, kind);
  return {
    status: ok ? 'picked' : 'failed',
    kind,
    reason: ok ? '组件可见标签、选中态和底层模型回读一致' : '点击选项后组件模型回读不一致',
    visibleValue: got.label,
    modelCode: got.code,
  };
}
