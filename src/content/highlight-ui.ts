// 漏填高亮 UI：把纯逻辑层生成的三色字段路径映射到当前页面控件。

import { FillResult, buildHighlightMap } from '../core/highlight';
import { Profile } from '../core/profile';

/** 三色高亮对应的页面 CSS 类。 */
const HIGHLIGHT_CLASSES = [
  'tui-highlight-green',
  'tui-highlight-yellow',
  'tui-highlight-red',
] as const;

/** 页面高亮数量统计。 */
export interface HighlightRenderStats {
  green: number;
  yellow: number;
  red: number;
}

/**
 * 功能：读取表单控件对应的档案路径。
 *
 * 原理：优先使用填充器写入的 data-tui-path 精确标记；若页面仅提供 name，
 * 则把常见的下划线写法（如 basic_name）归一化为点路径（basic.name）。
 * 没有可靠路径证据的控件不参与高亮，避免误标用户需要人工填写的字段。
 */
function controlProfilePath(control: Element): string {
  const exactPath = (control.getAttribute('data-tui-path') || '').trim();
  if (exactPath) return exactPath;

  const controlName = (control.getAttribute('name') || '').trim();
  if (!controlName) return '';
  return controlName.replace(/^([a-zA-Z]+)_/, '$1.');
}

/**
 * 功能：清除指定容器及其子控件上的三色 UI 高亮。
 *
 * @param container 需要清理的页面容器；为空时安全返回。
 */
export function clearHighlights(container: Element | null): void {
  if (!container) return;

  const highlightedElements: Element[] = [];
  if (HIGHLIGHT_CLASSES.some((className) => container.classList.contains(className))) {
    highlightedElements.push(container);
  }
  highlightedElements.push(...Array.from(container.querySelectorAll(HIGHLIGHT_CLASSES.map((className) => `.${className}`).join(','))));

  for (const element of highlightedElements) {
    element.classList.remove(...HIGHLIGHT_CLASSES);
  }
}

/**
 * 功能：依据本轮填写结果和个人档案，为当前页面控件渲染绿、黄、红三色状态。
 *
 * 计算原则：
 * - 绿色 = 已成功填写；
 * - 黄色 = 档案中没有可用值，且调用方用 data-tui-highlight-empty 明确标记为本轮已识别控件；
 * - 红色 = 档案有值但未能安全填写，或填充器明确报告失败。
 *
 * 同一路径由 buildHighlightMap 保证三色互斥；渲染前先移除旧状态，
 * 因此重复执行不会累积冲突类名。
 *
 * @param result 本轮自动填写结果。
 * @param profile 当前个人档案。
 * @param container 需要渲染的页面容器；为空时返回零统计。
 * @returns 实际被标色的控件数量。
 */
export function renderHighlights(
  result: FillResult,
  profile: Profile,
  container: Element | null,
): HighlightRenderStats {
  const stats: HighlightRenderStats = { green: 0, yellow: 0, red: 0 };
  if (!container) return stats;

  clearHighlights(container);
  const highlightMap = buildHighlightMap(result, profile);
  const greenPaths = new Set(highlightMap.green);
  const yellowPaths = new Set(highlightMap.yellow);
  const redPaths = new Set(highlightMap.red);
  const controls = Array.from(container.querySelectorAll('input,select,textarea'));

  for (const control of controls) {
    const profilePath = controlProfilePath(control);
    if (!profilePath) continue;

    if (redPaths.has(profilePath)) {
      control.classList.add('tui-highlight-red');
      stats.red++;
    } else if (greenPaths.has(profilePath)) {
      control.classList.add('tui-highlight-green');
      stats.green++;
    } else if (yellowPaths.has(profilePath) && control.hasAttribute('data-tui-highlight-empty')) {
      // 空档案路径很多；只标记本轮确认识别到的控件，避免整页无关输入框被染黄。
      control.classList.add('tui-highlight-yellow');
      stats.yellow++;
    }
  }

  return stats;
}
