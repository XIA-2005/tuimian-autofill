// 页面内悬浮面板（仅顶层 frame 创建）。

export interface PanelHandlers {
  onAction(action: string): void;
}

let handlers: PanelHandlers | null = null;
let el: HTMLElement | null = null;
let dragState: { sx: number; sy: number; ox: number; oy: number } | null = null;

function ensure(): void {
  if (el || !handlers) return;
  const host = document.createElement('div');
  host.id = 'tui-panel';
  host.innerHTML = [
    '<div class="tui-head"><span>🎓 预推免填表助手</span>',
    '<button type="button" class="tui-close" data-act="close" title="收起">✕</button></div>',
    '<div class="tui-status">登录后进入报名填表页，点「一键填充」。验证码、提交需人工完成。</div>',
    '<div class="tui-btns">',
    '<button type="button" data-act="fill" class="primary">⚡ 一键填充</button>',
    '<button type="button" data-act="schools" class="wide">🏫 学校目录（报名入口）</button>',
    '<button type="button" data-act="check" class="wide">🩺 提交前体检</button>',
    '<button type="button" data-act="importprofile" class="wide">📥 从本页提取档案</button>',
    '<button type="button" data-act="copymissing">📋 复制漏填项</button>',
    '<button type="button" data-act="copyreport">🛠 复制字段报告</button>',
    '<button type="button" data-act="clear">🧹 清除高亮</button>',
    '</div>',
  ].join('');
  (document.body || document.documentElement).appendChild(host);
  el = host;

  host.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const act = btn.dataset.act || '';
      if (act === 'close') hidePanel();
      else if (handlers) handlers.onAction(act);
    });
  });

  const head = host.querySelector('.tui-head') as HTMLElement | null;
  if (head) {
    head.addEventListener('pointerdown', (e: PointerEvent) => {
      // ✕ 按钮点击不进入拖拽：setPointerCapture 会把后续 pointerup/click 重定向到标题栏，导致按钮 click 永远不触发
      if ((e.target as HTMLElement | null)?.closest('button')) return;
      const r = host.getBoundingClientRect();
      dragState = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top };
      head.setPointerCapture(e.pointerId);
    });
    head.addEventListener('pointermove', (e: PointerEvent) => {
      if (!dragState) return;
      host.style.left = `${dragState.ox + e.clientX - dragState.sx}px`;
      host.style.top = `${dragState.oy + e.clientY - dragState.sy}px`;
      host.style.right = 'auto';
    });
    head.addEventListener('pointerup', () => {
      dragState = null;
    });
  }
}

export function initPanel(h: PanelHandlers): void {
  handlers = h;
  ensure();
}

export function showPanel(): void {
  ensure();
  if (el) el.style.display = '';
}

export function hidePanel(): void {
  if (el) el.style.display = 'none';
}

export function setPanelStatus(text: string): void {
  ensure();
  const s = el ? el.querySelector('.tui-status') : null;
  if (s) s.textContent = text;
}
