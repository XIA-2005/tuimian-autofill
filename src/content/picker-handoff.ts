/**
 * 弹窗选择器人工接管 UI。
 *
 * 本模块只负责卡片生命周期、真实回填校验和用户动作分发；picker 状态机、
 * 队列恢复、字段高亮与遥测均由 content 入口统一处理，避免 UI 层改写业务状态。
 */

export type PickerHandoffCompleteSource = 'button' | 'automatic';

export interface PickerHandoffTask {
  fieldLabel: string;
  safeReason: string;
  targetEl: Element;
  isFilled(): boolean;
  /** 提供时用于检测用户直接关闭弹窗；返回 false 会静默结束卡片并通知业务层。 */
  isPopupOpen?(): boolean;
  onComplete(source: PickerHandoffCompleteSource): void;
  onSkip(): void;
  onPopupClosed?(): void;
  /** 测试可缩短轮询间隔；生产环境默认 600ms。 */
  pollIntervalMs?: number;
}

interface ActiveHandoff {
  token: number;
  task: PickerHandoffTask;
  card: HTMLElement;
  timer: ReturnType<typeof setInterval>;
  settled: boolean;
  onContinue: () => void;
  onSkip: () => void;
}

const CARD_ID = 'tui-picker-handoff';
const EMPTY_MESSAGE = '尚未检测到该字段已回填，请先在弹窗中完成选择';

/**
 * 功能：管理页面中唯一的人工接管卡片。
 *
 * 关键不变量：任意时刻最多一个活动任务；替换、销毁或目标元素断连后，旧任务的
 * 定时器和按钮监听都会被释放。完成动作使用 settled 锁保证自动轮询和按钮点击
 * 即使同时发生，也只会触发一次业务回调。
 */
export class PickerHandoffController {
  private active: ActiveHandoff | null = null;
  private token = 0;

  constructor(private readonly doc: Document) {}

  /** 功能：返回当前是否存在仍在等待用户操作的接管任务。 */
  hasActiveTask(): boolean {
    return this.active !== null;
  }

  /**
   * 功能：展示新的人工接管任务，并原子替换旧任务。
   * 所有来自页面或调用方的文字均通过 textContent 写入，禁止 HTML 注入。
   */
  show(task: PickerHandoffTask): void {
    this.disposeActive();
    const token = ++this.token;
    const card = this.buildCard(task);
    (this.doc.body || this.doc.documentElement).appendChild(card);
    this.positionAwayFromDialogs(card);

    const continueButton = card.querySelector<HTMLButtonElement>('[data-tui-handoff-action="continue"]')!;
    const skipButton = card.querySelector<HTMLButtonElement>('[data-tui-handoff-action="skip"]')!;
    const onContinue = (): void => {
      if (!this.isCurrent(token) || !task.targetEl.isConnected) {
        this.disposeActive();
        return;
      }
      if (!this.readFilled(task)) {
        const feedback = card.querySelector<HTMLElement>('.tui-picker-handoff-feedback');
        if (feedback) feedback.textContent = EMPTY_MESSAGE;
        return;
      }
      this.complete(token, 'button');
    };
    const onSkip = (): void => this.skip(token);
    continueButton.addEventListener('click', onContinue);
    skipButton.addEventListener('click', onSkip);

    const timer = setInterval(() => {
      if (!this.isCurrent(token)) return;
      if (!task.targetEl.isConnected) {
        this.disposeActive();
        return;
      }
      this.positionAwayFromDialogs(card);
      if (this.readFilled(task)) this.complete(token, 'automatic');
      else if (task.isPopupOpen && !this.readPopupOpen(task)) this.popupClosed(token);
    }, Math.max(20, task.pollIntervalMs ?? 600));

    this.active = { token, task, card, timer, settled: false, onContinue, onSkip };
  }

  /** 功能：销毁当前卡片并使所有旧任务回调失效；页面切换或新一轮填写时调用。 */
  destroy(): void {
    this.token++;
    this.disposeActive();
  }

  /** 功能：构造可访问的紧凑卡片；动态文本只使用 textContent。 */
  private buildCard(task: PickerHandoffTask): HTMLElement {
    const card = this.doc.createElement('section');
    card.id = CARD_ID;
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'false');
    card.setAttribute('aria-labelledby', 'tui-picker-handoff-title');
    card.setAttribute('aria-describedby', 'tui-picker-handoff-instruction');

    const heading = this.doc.createElement('div');
    heading.className = 'tui-picker-handoff-heading';
    const eyebrow = this.doc.createElement('span');
    eyebrow.className = 'tui-picker-handoff-eyebrow';
    eyebrow.textContent = '需要人工接管';
    const title = this.doc.createElement('strong');
    title.id = 'tui-picker-handoff-title';
    title.textContent = task.fieldLabel;
    heading.append(eyebrow, title);

    const state = this.doc.createElement('div');
    state.className = 'tui-picker-handoff-state';
    state.textContent = '已打开选择窗口，等待你确认';

    const instruction = this.doc.createElement('p');
    instruction.id = 'tui-picker-handoff-instruction';
    instruction.className = 'tui-picker-handoff-instruction';
    instruction.textContent = '请在当前弹窗中选择匹配项，完成后点击“我已选好，继续”';

    const reason = this.doc.createElement('p');
    reason.className = 'tui-picker-handoff-reason';
    reason.textContent = task.safeReason;

    const feedback = this.doc.createElement('div');
    feedback.className = 'tui-picker-handoff-feedback';
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    feedback.setAttribute('aria-atomic', 'true');

    const actions = this.doc.createElement('div');
    actions.className = 'tui-picker-handoff-actions';
    const continueButton = this.doc.createElement('button');
    continueButton.type = 'button';
    continueButton.className = 'tui-picker-handoff-continue';
    continueButton.dataset.tuiHandoffAction = 'continue';
    continueButton.textContent = '我已选好，继续';
    const skipButton = this.doc.createElement('button');
    skipButton.type = 'button';
    skipButton.className = 'tui-picker-handoff-skip';
    skipButton.dataset.tuiHandoffAction = 'skip';
    skipButton.textContent = '跳过此项';
    actions.append(continueButton, skipButton);

    card.append(heading, state, instruction, reason, feedback, actions);
    return card;
  }

  /** 功能：安全执行回填判定；页面脚本异常不得中断接管控制器。 */
  private readFilled(task: PickerHandoffTask): boolean {
    try {
      return task.isFilled();
    } catch {
      return false;
    }
  }

  /** 功能：安全读取原弹窗可见状态；异常时按仍打开处理，避免误开后续 picker。 */
  private readPopupOpen(task: PickerHandoffTask): boolean {
    try {
      return task.isPopupOpen ? task.isPopupOpen() : true;
    } catch {
      return true;
    }
  }

  /**
   * 功能：在操作中心附近的候选位置中选择与学校弹窗重叠面积最小的位置。
   * 原理：对“面板左侧、面板下方、四角”计算矩形交集；优先采用无交叠且靠近面板的候选。
   * 窄屏无足够空白时仍把卡片限制在视口内，避免按钮溢出屏幕。
   */
  private positionAwayFromDialogs(card: HTMLElement): void {
    try {
      const view = this.doc.defaultView;
      if (!view) return;
      const viewportWidth = Math.max(1, view.innerWidth);
      const viewportHeight = Math.max(1, view.innerHeight);
      const measured = card.getBoundingClientRect();
      const width = Math.min(measured.width || 360, Math.max(1, viewportWidth - 20));
      const height = Math.min(measured.height || 250, Math.max(1, viewportHeight - 20));
      const panelRect = this.doc.getElementById('tui-panel')?.getBoundingClientRect();
      const gap = 12;
      const clampLeft = (left: number): number => Math.max(10, Math.min(viewportWidth - width - 10, left));
      const clampTop = (top: number): number => Math.max(10, Math.min(viewportHeight - height - 10, top));
      const candidates = [
        { left: clampLeft((panelRect?.left ?? viewportWidth) - width - gap), top: clampTop(panelRect?.top ?? 16) },
        { left: clampLeft(panelRect?.left ?? viewportWidth - width - 16), top: clampTop((panelRect?.bottom ?? 16) + gap) },
        { left: 10, top: viewportHeight - height - 10 },
        { left: viewportWidth - width - 10, top: viewportHeight - height - 10 },
        { left: 10, top: 10 },
        { left: viewportWidth - width - 10, top: 10 },
      ];
      const dialogSelector = '.layui-layer, .bh-dialog, [role="dialog"], .emap-dialog, .jqx-window, .modal, .bh-modal, [class*="dialog" i], [class*="modal" i], [class*="window" i], [class*="layer" i]';
      const dialogRects = Array.from(this.doc.querySelectorAll<HTMLElement>(dialogSelector))
        .filter((node) => node !== card && !card.contains(node) && !node.closest('#tui-panel'))
        .map((node) => ({ node, rect: node.getBoundingClientRect() }))
        .filter(({ node, rect }) => {
          const style = view.getComputedStyle(node);
          return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        })
        .map(({ rect }) => rect);
      const overlapArea = (candidate: { left: number; top: number }): number => dialogRects.reduce((sum, rect) => {
        const overlapWidth = Math.max(0, Math.min(candidate.left + width, rect.right) - Math.max(candidate.left, rect.left));
        const overlapHeight = Math.max(0, Math.min(candidate.top + height, rect.bottom) - Math.max(candidate.top, rect.top));
        return sum + overlapWidth * overlapHeight;
      }, 0);
      const best = candidates.reduce((chosen, candidate) => overlapArea(candidate) < overlapArea(chosen) ? candidate : chosen, candidates[0]);
      card.style.setProperty('left', `${best.left}px`, 'important');
      card.style.setProperty('top', `${best.top}px`, 'important');
      card.style.setProperty('right', 'auto', 'important');
      card.style.setProperty('bottom', 'auto', 'important');
    } catch {
      // 布局探测失败时保留 CSS 的固定兜底位置，不影响接管逻辑。
    }
  }

  /** 功能：确认回填并完成任务；settled 保证业务回调至多执行一次。 */
  private complete(token: number, source: PickerHandoffCompleteSource): void {
    const active = this.active;
    if (!active || active.token !== token || active.settled) return;
    active.settled = true;
    const callback = active.task.onComplete;
    this.disposeActive();
    callback(source);
  }

  /** 功能：结束当前接管卡片并通知业务层保留人工待处理状态。 */
  private skip(token: number): void {
    const active = this.active;
    if (!active || active.token !== token || active.settled) return;
    active.settled = true;
    const callback = active.task.onSkip;
    this.disposeActive();
    callback();
  }

  /** 功能：检测到用户直接关闭空弹窗时移除孤立卡片，并让业务层安全恢复队列。 */
  private popupClosed(token: number): void {
    const active = this.active;
    if (!active || active.token !== token || active.settled) return;
    active.settled = true;
    const callback = active.task.onPopupClosed;
    this.disposeActive();
    callback?.();
  }

  /** 功能：判断异步事件是否仍属于当前活动任务。 */
  private isCurrent(token: number): boolean {
    return !!this.active && this.active.token === token && !this.active.settled;
  }

  /** 功能：解绑监听、清除轮询并移除卡片；不触发业务回调。 */
  private disposeActive(): void {
    const active = this.active;
    if (!active) {
      this.doc.getElementById(CARD_ID)?.remove();
      return;
    }
    clearInterval(active.timer);
    active.card.querySelector('[data-tui-handoff-action="continue"]')?.removeEventListener('click', active.onContinue);
    active.card.querySelector('[data-tui-handoff-action="skip"]')?.removeEventListener('click', active.onSkip);
    active.card.remove();
    this.active = null;
  }
}
