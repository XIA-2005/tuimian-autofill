// 合同结果与通用结果合并(PLAN v3 · P03)
// 目标:同一逻辑目标一轮只执行一次主要写入;契约专有字段保留在结果里(不丢统计);
// 合并以"内存元素同一性"去重(el 在页面内存中引用同一节点),跨消息不得携带 el。
import type { FillItem, FillResult } from './filler';
import type { ContractFillItem } from './control-drivers';

/**
 * 功能：合并人工续填的完整页面快照；新验证结论优先，不能用旧成功覆盖新失败/冲突。
 * 原目标本轮未重新出现时标记未确认，不沿用旧Element的成功状态。
 */
export function mergeResumeResults(prev: FillResult | null, round: FillResult): FillResult {
  if (!prev?.items.length) return round;
  const merged = [...round.items];
  for (const older of prev.items) {
    // 旧结果带真实控件时只能按 Element 身份确认；同一档案字段可能映射到页面上的多个控件，
    // 不能因另一个同字段控件在续填轮出现，就把当前旧目标误判为已经重新验证。
    const reconfirmed = round.items.some((item) => {
      if (item === older) return true;
      if (older.el) return item.el === older.el;
      // 无 Element 的旧条目只是逻辑目标（例如合同控件当时不存在），此时才允许按字段路径合并。
      return !!older.field && item.field === older.field;
    });
    if (reconfirmed) continue;
    if (!older.field) continue;
    merged.push({ ...older, el: undefined, status: 'failed', reason: '续填时原目标未重新确认，请核对当前页面' });
  }
  const stats = { ...round.stats, total: merged.length, filled: 0, failed: 0, skipped: 0, profileEmpty: 0, noMatch: 0, picker: 0 };
  for (const item of merged) {
    if (item.status === 'filled' || item.status === 'failed' || item.status === 'skipped' || item.status === 'profileEmpty' || item.status === 'noMatch' || item.status === 'picker') stats[item.status] += 1;
  }
  return { items: merged, stats };
}

/** 功能:从契约结果构建"已认领目标"集合。
 * 规则(P03):filled/failed 的合同目标已被真实写入或尝试写入,通用链不得再写;
 * 带 pickerContext 的 skipped 是"等待弹窗驱动",真正点选由通用 picker 链执行一次,因此不在此占用(由合并兜底去重)。 */
export function buildClaimedTargets(contractItems: ContractFillItem[]): Set<Element> {
  const claimed = new Set<Element>();
  for (const item of contractItems) {
    // G01:歧义/阻塞项的候选节点全部进入禁止写集合(整链不得绕过)。
    for (const node of item.ambiguousNodes || []) claimed.add(node);
    if (!item.el) continue;
    if (item.status === 'filled' || item.status === 'failed') claimed.add(item.el);
  }
  return claimed;
}

/** 功能:判断通用结果中是否已存在"占用了该逻辑目标"的条目(仅 picker/filled/failed;
 * noMatch/profileEmpty 等观察项不代表占用,合同权威仍可补充 picker 任务——兼容"合同控件=可见显示框被通用链记为 noMatch"的页面)。 */
function hasActiveTarget(items: FillItem[], el: Element): boolean {
  return items.some((item) => item.el === el && (item.status === 'picker' || item.status === 'filled' || item.status === 'failed'));
}

/**
 * 功能:把契约结果合并进通用结果(原地更新 result 并返回同一对象)。
 * 规则(P03):
 * - 已存在于通用结果中的 el 不重复追加(去重);
 * - filled/failed 契约项按各自状态追加并计入统计;
 * - 带 pickerContext 的 skipped 契约项追加为 picker 状态(等待人工/弹窗驱动);
 * - 无 el 的契约项(档案为空/控件不存在)不追加,保持通用链的既有能力;
 * - 合并后 total 重算为 items 长度,保证 filled 不可能超过 total。
 */
export function mergeContractFillResult(result: FillResult, contractItems: ContractFillItem[]): FillResult {
  const pushItem = (item: FillItem): void => {
    result.items.push(item);
    result.stats.total += 1;
    switch (item.status) {
      case 'filled':
        result.stats.filled += 1;
        break;
      case 'failed':
        result.stats.failed += 1;
        break;
      case 'picker':
        result.stats.picker += 1;
        break;
      case 'skipped':
        result.stats.skipped += 1;
        break;
      default:
        break;
    }
  };
  for (const contract of contractItems) {
    if (!contract.profilePath) continue;
    // G01:无 el 的合同失败/阻塞是"逻辑目标结果",必须保留(不能被丢弃);
    // 有 el 的按元素同一性去重,无 el 的按字段路径去重。
    if (!contract.el) {
      if (contract.status === 'failed') {
        if (!result.items.some((i) => i.field === contract.profilePath && i.status === 'failed')) {
          result.items.push({ label: contract.profilePath, field: contract.profilePath, status: 'failed', reason: contract.reason, issueCode: contract.issueCode });
          result.stats.total = result.items.length;
          result.stats.failed += 1;
        }
      }
      continue;
    }
    if (hasActiveTarget(result.items, contract.el)) continue;
    const label = contract.profilePath;
    if (contract.status === 'filled') {
      pushItem({ label, field: contract.profilePath, status: 'filled', reason: contract.reason, el: contract.el, expectedValue: contract.expectedValue });
    } else if (contract.status === 'failed') {
      pushItem({ label, field: contract.profilePath, status: 'failed', reason: contract.reason, el: contract.el, issueCode: contract.issueCode });
    } else if (contract.pickerContext) {
      pushItem({ label, field: contract.profilePath, status: 'picker', reason: contract.reason, valuePreview: contract.valuePreview, el: contract.el, pickerContext: contract.pickerContext });
    }
  }
  result.stats.total = result.items.length;
  return result;
}
