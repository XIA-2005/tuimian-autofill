// 写前临时解锁：readonly/disabled 控件的值虽然 JS 可写，但页面校验器和表单序列化通常忽略它们，
// 造成"回读通过、保存丢失"。写前临时移除状态、写后立即恢复（巨能填复古 ASP 批量临时解锁同款思路）。

interface LockState {
  readonlyAttr: string | null;
  disabled: boolean;
  ariaDisabled: string | null;
}

const LOCKED = new WeakSet<Element>();

/** 功能：在解锁窗口内执行写入；仅临时恢复我们本会话锁定的状态，写后立即还原，不遗留改动。 */
export function withUnlocked<T>(el: Element, write: () => T): T {
  const html = el as HTMLInputElement;
  const toggle = el as unknown as { disabled: boolean };
  let state: LockState | null = null;
  try {
    const readonlyAttr = html.getAttribute('readonly');
    const disabled = toggle.disabled === true;
    const ariaDisabled = el.getAttribute('aria-disabled');
    if (readonlyAttr !== null || disabled || ariaDisabled === 'true') {
      if (LOCKED.has(el)) return write(); // 已在上层解锁窗口内，不重复翻转
      state = { readonlyAttr, disabled, ariaDisabled };
      LOCKED.add(el);
      if (readonlyAttr !== null) html.removeAttribute('readonly');
      if (disabled) toggle.disabled = false;
      if (ariaDisabled === 'true') el.removeAttribute('aria-disabled');
    }
    return write();
  } finally {
    if (state) {
      LOCKED.delete(el);
      try {
        if (state.readonlyAttr !== null) html.setAttribute('readonly', state.readonlyAttr);
        if (state.disabled) toggle.disabled = true;
        if (state.ariaDisabled === 'true') el.setAttribute('aria-disabled', 'true');
      } catch {
        // 元素可能在写入过程中被页面替换：恢复失败无碍
      }
    }
  }
}

/** 只读判断：与解锁窗口配套的"当前是否处于锁定态"探测（避免无谓翻转）。 */
export function isLockedControl(el: Element): boolean {
  const html = el as HTMLInputElement;
  return html.getAttribute('readonly') !== null || (el as unknown as { disabled: boolean }).disabled === true || el.getAttribute('aria-disabled') === 'true';
}
