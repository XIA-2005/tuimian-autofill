// 连续填写安全导航内核：只识别适配包声明的“下一步”，永不识别最终提交、上传或锁定按钮。

import { AdapterPageContract } from './adapters';

function visible(element: Element): boolean {
  const html = element as HTMLElement;
  if (html.hidden || html.getAttribute('aria-hidden') === 'true') return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(html);
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  const rect = html.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0 || !!html.offsetParent;
}

function buttonText(element: HTMLElement): string {
  return (element.textContent || element.getAttribute('value') || element.getAttribute('aria-label') || element.getAttribute('title') || '')
    .replace(/\s+/g, '')
    .trim();
}

/**
 * 功能：从页面契约声明的候选中寻找真正的“下一步”按钮。
 * 安全原则：选择器和按钮文案必须同时匹配；任何含提交、锁定、上传、完成报名语义的控件一律拒绝。
 */
export function findDeclaredNextButton(doc: Document, page: AdapterPageContract): HTMLElement | null {
  const candidates: HTMLElement[] = [];
  for (const selector of page.nextSelectors || []) {
    try {
      candidates.push(...Array.from(doc.querySelectorAll<HTMLElement>(selector)));
    } catch {
      // 远程适配包校验之外仍防御页面运行时的无效选择器。
    }
  }
  return Array.from(new Set(candidates)).find((element) => {
    if (!visible(element) || element.closest('#tui-panel,#tui-check-report,#tui-schools,.tui-fill-banner')) return false;
    const text = buttonText(element);
    if (/(最终提交|确认提交|提交申请|锁定报名|完成报名|上传|缴费|删除)/.test(text)) return false;
    return /^(下一步|保存并下一步|保存并继续|下一页|继续)$/.test(text);
  }) || null;
}

/** 功能：收集当前页可见的服务器或组件校验错误，内容只用于本地状态提示。 */
export function visibleValidationErrors(doc: Document, page: AdapterPageContract): HTMLElement[] {
  const selectors = page.validationErrorSelectors?.length ? page.validationErrorSelectors : [
    '.field-validation-error', '.validation-error', '.invalid-feedback', '.layui-form-danger', '.has-error', '.is-error',
    '.easyui-validatebox-invalid', '[aria-invalid="true"]',
  ];
  const errors: HTMLElement[] = [];
  for (const selector of selectors) {
    try {
      for (const element of Array.from(doc.querySelectorAll<HTMLElement>(selector))) {
        if (!visible(element) || element.closest('#tui-panel,#tui-check-report,#tui-schools,.tui-fill-banner')) continue;
        errors.push(element);
      }
    } catch {
      // 忽略结构变化后的无效选择器。
    }
  }
  return Array.from(new Set(errors));
}

/** 功能：生成不含字段值的页面步骤签名，用于限制同一错误页面的自动重试次数。 */
export function autoAdvancePageKey(doc: Document, page: AdapterPageContract): string {
  const ids = Array.from(doc.querySelectorAll<HTMLElement>('input,select,textarea'))
    .filter(visible)
    .map((element) => element.id || element.getAttribute('name') || element.tagName.toLowerCase())
    .filter(Boolean)
    .slice(0, 30)
    .sort()
    .join('|');
  let path = '';
  try { path = `${doc.location.origin}${doc.location.pathname}`; } catch { path = page.id; }
  return `${path}#${page.id}#${ids}`.slice(0, 800);
}

/** 功能：按真实鼠标事件顺序激活下一步，兼容 Edge 页面绑定的 mousedown/click 处理器。 */
export function clickDeclaredNext(element: HTMLElement): void {
  const MouseCtor = element.ownerDocument.defaultView?.MouseEvent || MouseEvent;
  element.dispatchEvent(new MouseCtor('mousedown', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new MouseCtor('mouseup', { bubbles: true, cancelable: true }));
  element.click();
}
