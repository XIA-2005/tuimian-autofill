// 主世界桥的隔离世界侧客户端：发送白名单命令并等待主世界结果。
// 传输层只有 DOM 属性 + 自定义事件（两个世界共享 DOM），不需要 eval、不注入 script，天然抗 CSP。

export interface WorldResult {
  ok: boolean;
  reason?: string;
  value?: unknown;
}

let seq = 0;

/** 主世界桥是否已就绪（manifest world:"MAIN" 注入成功时 documentElement 会带标记） */
export function mainWorldReady(doc: Document): boolean {
  try {
    return !!doc.documentElement?.hasAttribute('data-tui-world-ready');
  } catch {
    return false;
  }
}

function elementSelector(doc: Document, el: Element): string {
  if (el.id) return `#${el.id}`;
  const key = `tui-el-${++seq}`;
  try {
    el.setAttribute('data-tui-el', key);
  } catch {
    return '';
  }
  void doc;
  return `[data-tui-el="${key}"]`;
}

/**
 * 功能：向主世界发送一条白名单命令并等待结果。
 * 原理：写入 data-tui-cmd 并派发事件；主世界把结果写到 data-tui-res-<id> 唯一属性；
 * 监听 tui-world-result 立即读取，另有短轮询兜底；超时或桥未就绪都快速返回失败，不让调用方空等。
 */
export function requestMainWorld(doc: Document, cmd: string, payload?: Record<string, unknown>, timeoutMs = 1200): Promise<WorldResult> {
  return new Promise((resolve) => {
    if (!mainWorldReady(doc)) {
      resolve({ ok: false, reason: 'no-bridge' });
      return;
    }
    const id = `t${Date.now().toString(36)}${++seq}`;
    const root = doc.documentElement!;
    const resAttr = `data-tui-res-${id}`;
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      doc.removeEventListener('tui-world-result', onResult);
      const raw = root.getAttribute(resAttr);
      root.removeAttribute(resAttr);
      if (!raw) {
        resolve({ ok: false, reason: 'timeout' });
        return;
      }
      try {
        resolve(JSON.parse(raw) as WorldResult);
      } catch {
        resolve({ ok: false, reason: 'bad-result' });
      }
    };
    const check = (): void => {
      if (settled) return;
      if (root.hasAttribute(resAttr)) finish();
    };
    const onResult = (): void => check();
    doc.addEventListener('tui-world-result', onResult);
    const timer = setInterval(check, 40);
    setTimeout(finish, timeoutMs);
    try {
      root.setAttribute('data-tui-cmd', JSON.stringify({ id, cmd, payload: payload || {} }));
      doc.dispatchEvent(new Event('tui-world-cmd'));
    } catch (e) {
      settled = true;
      clearInterval(timer);
      doc.removeEventListener('tui-world-result', onResult);
      resolve({ ok: false, reason: String((e as Error)?.message || e).slice(0, 80) });
    }
  });
}

/** 主世界 jQuery trigger：隔离世界合成事件对 jQuery 绑定可能不生效时的可靠通道 */
export async function mainWorldJqueryClick(doc: Document, el: Element, type = 'click'): Promise<boolean> {
  const res = await requestMainWorld(doc, 'jquery-click', { selector: elementSelector(doc, el), type }, 900);
  return !!res.ok;
}

/**
 * 功能：在页面主世界中按显示名精确选中 jqxDropDownList 选项。
 * 原理：虚拟列表只把少量行渲染到 DOM，通过白名单桥调用页面自身 getItems/selectItem API，
 * 既能访问完整数据模型，又会触发组件正常的值回写与联动。
 */
export function mainWorldJqxSelectLabel(doc: Document, el: Element, label: string): Promise<WorldResult> {
  return requestMainWorld(doc, 'jqx-select-label', { selector: elementSelector(doc, el), label }, 1200);
}

/** v-model 直写：页内模板编译的 Vue2 老后台（保留 v-model 属性）的事件模拟兜底 */
export async function mainWorldVueModelWrite(doc: Document, el: Element, value: unknown): Promise<boolean> {
  const res = await requestMainWorld(doc, 'vue-model-write', { selector: elementSelector(doc, el), value }, 900);
  return !!res.ok;
}
