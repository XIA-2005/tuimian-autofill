// 主世界桥：在页面自己的 JS 环境里执行白名单命令（jQuery 触发、页面全局函数、__doPostBack、Vue 表单读写）。
// 协议：隔离世界写 documentElement 的 data-tui-cmd 属性并派发 tui-world-cmd；本桥执行后把结果写到
// data-tui-res-<id> 唯一属性并派发 tui-world-result。DOM 是两个世界共享的，属性与事件都可互通。
// 安全边界：命令白名单制，没有通用 eval、没有 submit/保存/提交类命令；函数调用限定页面视图上的具名函数。

/** 功能：沿元素向上找最近的 Vue 组件实例（兼容 Vue2 __vue__ 与 Vue3 __vueParentComponent）。 */
function findVueInstance(el: Element | null): any {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const v2 = (node as any).__vue__;
    if (v2 && v2.$data) return v2; // Vue 2 组件实例
    const v3 = (node as any).__vueParentComponent;
    if (v3 && v3.proxy && v3.proxy.$) return v3.proxy; // Vue 3 组件代理
  }
  return null;
}

/**
 * 功能：归一化 jqx 下拉项的显示文本，仅用于安全的精确/单向包含匹配。
 * 原理：去除空白和常见排版标点后转小写，避免学校名中全半角括号或空格造成假性不匹配。
 */
function normalizeJqxLabel(value: unknown): string {
  return String(value ?? '')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[：:＊*（）()【】\[\]{}<>《》、，,。.！!？?~～"'“”‘’·\-_/\\—]/g, '')
    .toLowerCase();
}

/**
 * 功能：从 jqxDropDownList `getItems` 返回项中取出用户看到的显示名称。
 * 原理：jqx 标准项使用 `label`；字符串项直接使用本身，`text` 只作为兼容旧页面的显示字段。
 */
function jqxItemLabel(item: unknown): string {
  if (typeof item === 'string' || typeof item === 'number') return String(item);
  if (!item || typeof item !== 'object') return '';
  const record = item as Record<string, unknown>;
  return String(record.label ?? record.text ?? '');
}

/**
 * 功能：把主世界桥安装到指定文档（每个 frame 一个实例）。
 * 原理：监听 tui-world-cmd 事件，执行白名单命令，结果写入 data-tui-res-<id> 属性后派发 tui-world-result。
 * 命令处理器全部通过 doc.defaultView / doc 取页面全局与元素，绝不引用模块级全局（跨 frame/多文档安全）。
 */
export function installMainWorldBridge(doc: Document): void {
  const root = doc.documentElement;
  if (!root) {
    doc.addEventListener('DOMContentLoaded', () => installMainWorldBridge(doc), { once: true });
    return;
  }
  if (root.hasAttribute('data-tui-world-ready')) return; // 重复注入保护
  const win = (doc.defaultView || null) as (Window & Record<string, any>) | null;

  const handlers: Record<string, (payload: any) => unknown> = {
    // jQuery trigger：隔离世界 dispatch 的合成事件对 jQuery 绑定可能不生效，主世界 trigger 最可靠
    'jquery-click': (p) => {
      const j = win && (win.jQuery || win.$);
      if (!j || !j.fn) return { ok: false, reason: 'no-jquery' };
      const el = doc.querySelector(String(p.selector || ''));
      if (!el) return { ok: false, reason: 'no-element' };
      j(el).trigger(String(p.type || 'click'));
      return { ok: true };
    },
    // jqx 虚拟列表精确选项：选项可能不在 DOM 中，必须在页面主世界调用插件自身 API。
    'jqx-select-label': (p) => {
      const j = win && (win.jQuery || win.$);
      if (!j || !j.fn) return { ok: false, reason: 'no-jquery' };
      if (typeof j.fn.jqxDropDownList !== 'function') return { ok: false, reason: 'no-jqx' };

      const selector = String(p.selector || '');
      if (!selector) return { ok: false, reason: 'bad-selector' };
      let el: Element | null;
      try {
        el = doc.querySelector(selector);
      } catch {
        return { ok: false, reason: 'bad-selector' };
      }
      if (!el) return { ok: false, reason: 'no-element' };

      const target = normalizeJqxLabel(p.label);
      if (!target) return { ok: false, reason: 'bad-label' };

      let widget: any;
      try {
        widget = j(el);
      } catch {
        return { ok: false, reason: 'jqx-init-failed' };
      }
      if (!widget || typeof widget.jqxDropDownList !== 'function') return { ok: false, reason: 'no-jqx' };

      let rawItems: unknown;
      try {
        rawItems = widget.jqxDropDownList('getItems');
      } catch {
        return { ok: false, reason: 'jqx-get-items-failed' };
      }
      if (!Array.isArray(rawItems)) return { ok: false, reason: 'jqx-items-unavailable' };

      // 只投影显示名称跨世界返回，避免 jqx 项内 DOM 引用或循环结构无法 JSON 序列化。
      const items = rawItems.map(jqxItemLabel);
      const normalizedItems = items.map(normalizeJqxLabel);
      const exactIndex = normalizedItems.findIndex((label) => label === target);
      // 单向包含：只允许“选项显示文本包含完整目标”，绝不用 target.includes(item)
      // 把“华南理工大学广州国际校区”错选成过短的“华南理工大学”。
      const containsIndex = exactIndex >= 0 ? -1 : normalizedItems.findIndex((label) => !!label && label.includes(target));
      const matchedIndex = exactIndex >= 0 ? exactIndex : containsIndex;
      if (matchedIndex < 0) return { ok: false, reason: 'no-match', value: { itemCount: items.length } };

      try {
        widget.jqxDropDownList('selectItem', rawItems[matchedIndex]);
      } catch {
        return { ok: false, reason: 'jqx-select-failed' };
      }
      return {
        ok: true,
        value: {
          match: exactIndex >= 0 ? 'exact' : 'contains',
        },
      };
    },
    // 调用页面全局函数（如 __doPostBack、WdatePicker、layui.form.render）；限定具名点路径，绝不 eval
    'invoke-fn': (p) => {
      if (!win) return { ok: false, reason: 'no-view' };
      const name = String(p.name || '');
      if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(name)) return { ok: false, reason: 'bad-name' };
      // 危险全局拒绝：执行/网络/导航/弹窗类函数绝不通过 invoke-fn 暴露
      const rootName = name.split('.')[0];
      if (/^(eval|Function|execScript|open|fetch|setTimeout|setInterval|alert|confirm|prompt|print|close|import|require|XMLHttpRequest|WebSocket|Worker)$/i.test(rootName)) {
        return { ok: false, reason: 'fn-forbidden' };
      }
      const fn = name.split('.').reduce<any>((acc, part) => (acc == null ? acc : acc[part]), win);
      if (typeof fn !== 'function') return { ok: false, reason: 'fn-missing' };
      fn(...(Array.isArray(p.args) ? p.args : []));
      return { ok: true };
    },
    // ASP.NET 标准回发（与页面自身链接等价）
    postback: (p) => {
      const fn = win && (win as any).__doPostBack;
      if (typeof fn !== 'function') return { ok: false, reason: 'no-dopostback' };
      fn(String(p.target || ''), String(p.argument || ''));
      return { ok: true };
    },
    // Vue 表单读取：沿元素向上找最近的组件实例，返回 $data 中指定键（结构化克隆安全化）
    'vue-read': (p) => {
      const vm = findVueInstance(doc.querySelector(String(p.selector || '')));
      if (!vm) return { ok: false, reason: 'no-vue' };
      const value = p.key ? vm.$data?.[p.key] : vm.$data;
      try {
        return { ok: true, value: JSON.parse(JSON.stringify(value ?? null)) };
      } catch {
        return { ok: true, value: null };
      }
    },
    // Vue 表单写入：直改 $data 后强制重渲染（受控组件在事件模拟失败时的兜底）
    'vue-write': (p) => {
      const vm = findVueInstance(doc.querySelector(String(p.selector || '')));
      if (!vm) return { ok: false, reason: 'no-vue' };
      if (!p.key) return { ok: false, reason: 'no-key' };
      vm.$data[String(p.key)] = p.value;
      try {
        vm.$forceUpdate();
      } catch {
        // Vue3 代理可能没有 $forceUpdate
      }
      return { ok: true };
    },
    // v-model 直写：从元素自身的 v-model 属性取键路径，写入最近组件实例的 $data（页内模板编译的 Vue2 老后台最常见）
    'vue-model-write': (p) => {
      const el = doc.querySelector(String(p.selector || ''));
      if (!el) return { ok: false, reason: 'no-element' };
      const model = (el.getAttribute('v-model') || el.getAttribute('v-model.trim') || el.getAttribute('v-model.number') || '').trim();
      if (!model) return { ok: false, reason: 'no-v-model' };
      const vm = findVueInstance(el);
      if (!vm) return { ok: false, reason: 'no-vue' };
      const parts = model.split('.').filter(Boolean);
      if (!parts.length) return { ok: false, reason: 'bad-path' };
      let target = vm.$data;
      for (let i = 0; i < parts.length - 1; i++) {
        const next = target?.[parts[i]];
        if (next == null || typeof next !== 'object') return { ok: false, reason: 'bad-path' };
        target = next;
      }
      const leaf = parts[parts.length - 1];
      if (!target || !(leaf in target)) return { ok: false, reason: 'key-missing' };
      target[leaf] = p.value;
      try {
        vm.$forceUpdate();
      } catch {
        // 忽略
      }
      return { ok: true };
    },
  };

  doc.addEventListener('tui-world-cmd', () => {
    const raw = root.getAttribute('data-tui-cmd');
    if (!raw) return;
    root.removeAttribute('data-tui-cmd');
    let req: { id?: string; cmd?: string; payload?: unknown };
    try {
      req = JSON.parse(raw);
    } catch {
      return;
    }
    if (!req.id || !req.cmd) return;
    const handler = handlers[req.cmd];
    let res: Record<string, unknown>;
    try {
      res = handler ? { ok: true, ...(handler(req.payload) as object) } : { ok: false, reason: 'unknown-cmd' };
    } catch (e) {
      res = { ok: false, reason: String((e as Error)?.message || e).slice(0, 120) };
    }
    try {
      root.setAttribute(`data-tui-res-${req.id}`, JSON.stringify(res));
    } catch {
      return;
    }
    doc.dispatchEvent(new Event('tui-world-result'));
  });
  root.setAttribute('data-tui-world-ready', '1');
}

// MAIN world 注入（manifest world:"MAIN"，document_start）：documentElement 尚未就绪时推迟到 DOMContentLoaded
if (typeof document !== 'undefined' && document.documentElement) installMainWorldBridge(document);
else if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => installMainWorldBridge(document), { once: true });
