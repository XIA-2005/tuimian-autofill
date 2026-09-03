// 弹窗选择器人工接管卡片 jsdom 测试。
// 每个场景使用独立 Document，验证单例替换、回填确认、跳过和异步清理均无跨用例状态。

import { JSDOM } from 'jsdom';
import { PickerHandoffController } from './picker-handoff';

let passCount = 0;
let failCount = 0;
const failures: string[] = [];

function check(condition: boolean, message: string): void {
  if (condition) {
    passCount++;
    console.log('PASS: ' + message);
  } else {
    failCount++;
    failures.push(message);
    console.error('FAIL: ' + message);
  }
}

function createDocument(): { dom: JSDOM; doc: Document; input: HTMLInputElement } {
  const dom = new JSDOM('<!doctype html><html><body><input id="picker-target"></body></html>', { url: 'https://example.edu.cn/form' });
  const doc = dom.window.document;
  return { dom, doc, input: doc.getElementById('picker-target') as HTMLInputElement };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 功能：执行人工接管卡片的全部 jsdom 场景，并把失败注入主测试汇总。 */
export async function runPickerHandoffTests(): Promise<void> {
  console.log('\n=== picker-handoff 人工接管测试 ===');

  // 用户完成弹窗选择后点击继续：先回读，再且仅触发一次完成回调。
  {
    const { dom, doc, input } = createDocument();
    const controller = new PickerHandoffController(doc);
    let completed = 0;
    let skipped = 0;
    let source = '';
    controller.show({
      fieldLabel: '本科毕业院校',
      safeReason: '未找到可安全确认的唯一结果',
      targetEl: input,
      isFilled: () => input.value.trim() !== '',
      onComplete: (value) => { completed++; source = value; },
      onSkip: () => { skipped++; },
      pollIntervalMs: 1000,
    });
    input.value = '已由页面回填';
    doc.querySelector<HTMLButtonElement>('[data-tui-handoff-action="continue"]')!.click();
    check(completed === 1 && source === 'button' && skipped === 0 && !doc.getElementById('tui-picker-handoff'), '手动回填后点击继续：回读成功、关闭卡片并仅完成一次');
    controller.destroy();
    dom.window.close();
  }

  // 字段仍为空时继续按钮只更新 aria-live 提示，不得误报完成。
  {
    const { dom, doc, input } = createDocument();
    const controller = new PickerHandoffController(doc);
    let completed = 0;
    controller.show({
      fieldLabel: '本科毕业院校',
      safeReason: '等待人工确认',
      targetEl: input,
      isFilled: () => input.value.trim() !== '',
      onComplete: () => { completed++; },
      onSkip: () => undefined,
      pollIntervalMs: 1000,
    });
    doc.querySelector<HTMLButtonElement>('[data-tui-handoff-action="continue"]')!.click();
    const feedback = doc.querySelector('.tui-picker-handoff-feedback')?.textContent || '';
    check(completed === 0 && feedback === '尚未检测到该字段已回填，请先在弹窗中完成选择' && !!doc.getElementById('tui-picker-handoff'), '字段未回填：点击继续保持卡片且不误报成功');
    controller.destroy();
    dom.window.close();
  }

  // 跳过立即关闭 UI，业务层只收到一次跳过动作。
  {
    const { dom, doc, input } = createDocument();
    const controller = new PickerHandoffController(doc);
    let skipped = 0;
    controller.show({
      fieldLabel: '本科专业',
      safeReason: '自动结果不唯一',
      targetEl: input,
      isFilled: () => false,
      onComplete: () => undefined,
      onSkip: () => { skipped++; },
    });
    const skipButton = doc.querySelector<HTMLButtonElement>('[data-tui-handoff-action="skip"]')!;
    skipButton.click();
    skipButton.click();
    check(skipped === 1 && !doc.getElementById('tui-picker-handoff'), '跳过此项：关闭卡片且回调只执行一次');
    controller.destroy();
    dom.window.close();
  }

  // 新字段原子替换旧字段，旧按钮和旧轮询均不得再触发。
  {
    const { dom, doc, input: firstInput } = createDocument();
    const secondInput = doc.createElement('input');
    doc.body.appendChild(secondInput);
    const controller = new PickerHandoffController(doc);
    let firstCompleted = 0;
    let secondCompleted = 0;
    controller.show({
      fieldLabel: '旧字段', safeReason: '旧原因', targetEl: firstInput,
      isFilled: () => firstInput.value !== '', onComplete: () => { firstCompleted++; }, onSkip: () => undefined, pollIntervalMs: 20,
    });
    const oldButton = doc.querySelector<HTMLButtonElement>('[data-tui-handoff-action="continue"]')!;
    controller.show({
      fieldLabel: '最新字段', safeReason: '新原因', targetEl: secondInput,
      isFilled: () => secondInput.value !== '', onComplete: () => { secondCompleted++; }, onSkip: () => undefined, pollIntervalMs: 20,
    });
    firstInput.value = '旧字段回填';
    oldButton.click();
    await wait(50);
    check(doc.querySelectorAll('#tui-picker-handoff').length === 1 && doc.querySelector('#tui-picker-handoff strong')?.textContent === '最新字段' && firstCompleted === 0 && secondCompleted === 0, '连续两个字段接管：只保留最新卡片且旧任务完全失效');
    controller.destroy();
    dom.window.close();
  }

  // 字段名和原因按纯文本写入，不能生成攻击者提供的 HTML 节点。
  {
    const { dom, doc, input } = createDocument();
    const controller = new PickerHandoffController(doc);
    const fieldLabel = '<img src=x onerror=alert(1)>本科院校';
    const safeReason = '<script>bad()</script>结果不唯一';
    controller.show({ fieldLabel, safeReason, targetEl: input, isFilled: () => false, onComplete: () => undefined, onSkip: () => undefined });
    check(doc.querySelector('#tui-picker-handoff strong')?.textContent === fieldLabel && doc.querySelector('.tui-picker-handoff-reason')?.textContent === safeReason && !doc.querySelector('#tui-picker-handoff img, #tui-picker-handoff script'), '字段名和失败原因含 HTML：按纯文本显示且不创建注入节点');
    controller.destroy();
    dom.window.close();
  }

  // 不点击按钮时，页面回填也会被轮询检测并自动完成。
  {
    const { dom, doc, input } = createDocument();
    const controller = new PickerHandoffController(doc);
    let completed = 0;
    let source = '';
    controller.show({
      fieldLabel: '籍贯', safeReason: '等待树形弹窗确认', targetEl: input,
      isFilled: () => input.value !== '', onComplete: (value) => { completed++; source = value; }, onSkip: () => undefined, pollIntervalMs: 20,
    });
    input.value = '已回填';
    await wait(60);
    check(completed === 1 && source === 'automatic' && !doc.getElementById('tui-picker-handoff'), '自动检测人工回填：自动关闭卡片并仅完成一次');
    controller.destroy();
    dom.window.close();
  }

  // 元素销毁会静默回收卡片；随后重复 destroy 不得触发任何业务回调。
  {
    const { dom, doc, input } = createDocument();
    const controller = new PickerHandoffController(doc);
    let callbacks = 0;
    controller.show({
      fieldLabel: '地区', safeReason: '等待人工选择', targetEl: input,
      isFilled: () => input.value !== '', onComplete: () => { callbacks++; }, onSkip: () => { callbacks++; }, pollIntervalMs: 20,
    });
    input.remove();
    await wait(60);
    controller.destroy();
    controller.destroy();
    check(callbacks === 0 && !doc.getElementById('tui-picker-handoff') && !controller.hasActiveTask(), '页面元素销毁或重复清理：不触发回调且不残留轮询卡片');
    dom.window.close();
  }

  // 用户直接关闭空弹窗时，卡片必须自动消失且只通知一次关闭事件。
  {
    const { dom, doc, input } = createDocument();
    const controller = new PickerHandoffController(doc);
    let popupOpen = true;
    let closed = 0;
    let completed = 0;
    controller.show({
      fieldLabel: '院校', safeReason: '等待人工选择', targetEl: input,
      isFilled: () => false, isPopupOpen: () => popupOpen,
      onComplete: () => { completed++; }, onSkip: () => undefined,
      onPopupClosed: () => { closed++; }, pollIntervalMs: 20,
    });
    popupOpen = false;
    await wait(60);
    controller.destroy();
    check(closed === 1 && completed === 0 && !doc.getElementById('tui-picker-handoff'), '用户关闭未回填弹窗：自动清理卡片且不误报完成');
    dom.window.close();
  }

  console.log(`\npicker-handoff 用例：${passCount} PASS, ${failCount} FAIL`);
}

export function getPickerHandoffFailures(): string[] {
  return [...failures];
}
