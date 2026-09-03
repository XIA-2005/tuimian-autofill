// 操作中心回归测试：确认兼容性体检撤销后恢复统一的一键填充入口。

import { JSDOM } from 'jsdom';
import { initPanel, setPanelBusy } from './panel';

const failures: string[] = [];

/** 功能：记录操作中心回归断言结果，失败信息交由主测试入口统一汇总。 */
function check(condition: boolean, message: string): void {
  if (condition) {
    console.log(`PASS ${message}`);
    return;
  }
  failures.push(message);
  console.error(`FAIL ${message}`);
}

/**
 * 功能：验证面板仅显示原有“一键填充”和字段报告入口。
 *
 * 兼容性状态区、安全辅助文案和 blocked 门禁均不应残留；忙态仍需正常禁用并恢复填写按钮。
 */
export function runPanelTests(): void {
  console.log('\n=== panel 一键填充回归测试 ===');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.edu.cn/apply' });
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  (globalThis as { document: Document }).document = dom.window.document;
  (globalThis as { window: Window }).window = dom.window as unknown as Window;

  initPanel({ onAction: () => undefined });
  const fillButton = dom.window.document.querySelector('[data-act="fill"]') as HTMLButtonElement | null;
  const reportButton = dom.window.document.querySelector('[data-act="copyreport"]') as HTMLButtonElement | null;
  check(!!fillButton && /一键填充/.test(fillButton.textContent || '') && !/安全辅助|已验证|禁止填写/.test(fillButton.textContent || ''), '填写按钮恢复统一的一键填充文案');
  check(!dom.window.document.querySelector('.tui-compatibility'), '操作中心不再渲染页面兼容性状态区');
  check(/复制字段报告/.test(reportButton?.textContent || ''), '报告按钮恢复复制字段报告文案');

  setPanelBusy(true);
  check(!!fillButton?.disabled, '填写运行期间按钮仍会禁用');
  setPanelBusy(false);
  check(!fillButton?.disabled, '填写结束后按钮恢复可用');

  dom.window.document.getElementById('tui-panel')?.remove();
  (globalThis as { document: Document }).document = previousDocument;
  (globalThis as { window: Window }).window = previousWindow;
  dom.window.close();
  console.log(`\npanel 用例：${5 - failures.length} PASS, ${failures.length} FAIL`);
}

/** 功能：返回操作中心回归测试失败列表，供主测试入口计入退出码。 */
export function getPanelFailures(): string[] {
  return [...failures];
}
