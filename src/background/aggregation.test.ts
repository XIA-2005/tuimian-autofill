// G05 跨 frame 参与者终态协议测试(纯逻辑;接入 npm test)
import { RunAggregator } from './aggregation';
import type { FrameFillReport } from './aggregation';
import type { FillStats } from '../core/filler';

const failures: string[] = [];
function test(name: string, cond: boolean, detail?: unknown): void {
  if (!cond) failures.push(detail === undefined ? name : `${name} :: ${JSON.stringify(detail)}`);
}
function stats(partial: Partial<FillStats>): FillStats {
  return { total: 0, filled: 0, skipped: 0, noMatch: 0, profileEmpty: 0, failed: 0, picker: 0, pickerResumeCount: 0, ...partial };
}
function report(runId: string, frameId: number, docId: string, frameSeq: number, s: Partial<FillStats>, items: FrameFillReport['items'] = []): FrameFillReport {
  return { runId, frameId, docId, frameSeq, stats: stats(s), items };
}

export function runAggregationTests(): void {
  // 旧终态消息必须与旧结果一样被拒绝，不能只拒数据却改变 terminal 标志。
  {
    const agg = new RunAggregator('current');
    agg.register(0, 'doc');
    agg.accept(report('current', 0, 'doc', 2, { total: 1, filled: 1 }));
    test('复审: 旧轮终态被拒绝', !agg.terminalize(report('old', 0, 'doc', 9, {})));
    test('复审: 旧轮消息不改变完成状态', !agg.allTerminal());
    test('复审: 旧序号终态被拒绝', !agg.terminalize(report('current', 0, 'doc', 1, {})));
    test('复审: 旧序号消息不改变完成状态', !agg.allTerminal());
    test('复审: 当前轮新序号终态正常接受', agg.terminalize(report('current', 0, 'doc', 3, { total: 1, filled: 1 })) && agg.allTerminal());
  }
  // 全部参与者终态后才汇总。
  {
    const agg = new RunAggregator('r1');
    test('G05: 无参与者不算完成', agg.allTerminal() === false);
    agg.register(0, 'd0');
    agg.register(1, 'd1');
    agg.terminalize(report('r1', 0, 'd0', 1, { total: 2, filled: 2 }, [{ label: 'a', field: 'basic.name', status: 'filled' }]));
    test('G05: 部分终态不算完成', agg.allTerminal() === false);
    agg.terminalize(report('r1', 1, 'd1', 1, { total: 1, picker: 1 }));
    test('G05: 全部终态后完成', agg.allTerminal() === true);
    const sum = agg.summarize();
    test('G05: 汇总合并各终态参与者', sum.framesReported === 2 && sum.stats.total === 3 && sum.stats.filled === 2 && sum.stats.picker === 1 && sum.items.length === 1, sum);
    test('G05: 参与者与终态计数一致', sum.participants === 2 && sum.terminalCount === 2 && sum.missing.length === 0);
  }
  // 未终态参与者的结果不进入成功汇总,并列为 missing。
  {
    const agg = new RunAggregator('r2');
    agg.register(0, 'd0');
    agg.register(2, 'd2');
    agg.terminalize(report('r2', 0, 'd0', 1, { total: 1, filled: 1 }));
    agg.accept(report('r2', 2, 'd2', 1, { total: 1, filled: 1 })); // 仅结果,未终态
    const sum = agg.summarizeTimeout();
    test('G05: 未终态结果不计入完成汇总', sum.stats.filled === 1 && sum.framesReported === 1, sum);
    test('G05: 未终态参与者列为 missing', sum.missing.length === 1 && sum.missing[0] === '2::d2');
    test('G05: 未全部终态时 timedOut=true', sum.timedOut === true);
  }
  // 旧 runId / 旧 seq / 旧文档拒绝。
  {
    const agg = new RunAggregator('r3');
    agg.register(0, 'd0');
    agg.terminalize(report('r3', 0, 'd0', 2, { total: 2, filled: 2 }));
    test('G05: 旧 runId 拒绝', agg.accept(report('old', 0, 'd0', 9, { filled: 99 })) === false);
    test('G05: 同帧旧 seq 拒绝', agg.accept(report('r3', 0, 'd0', 2, { filled: 1 })) === false);
    // 同 frame 新文档:独立参与者,不污染旧文档结果。
    agg.register(0, 'd0b');
    agg.terminalize(report('r3', 0, 'd0b', 1, { total: 1, filled: 1 }));
    const sum = agg.summarize();
    test('G05: 同帧新旧文档分别统计', sum.participants === 2 && sum.stats.total === 3, sum);
  }
  // I00:终态即最终——终态后的更高 seq 不再改变统计(与 background"收口即删轮"同一语义)。
  {
    const agg = new RunAggregator('r4');
    agg.register(0, 'd0');
    agg.terminalize(report('r4', 0, 'd0', 1, { total: 1, filled: 1 }));
    test('I00: 终态后更高 seq 更新被拒绝', agg.accept(report('r4', 0, 'd0', 2, { total: 1, failed: 1 })) === false);
    test('I00: 终态后重复终态被拒绝', agg.terminalize(report('r4', 0, 'd0', 3, { total: 1, failed: 1 })) === false);
    const sum = agg.summarize();
    test('I00: 终态结果保持不变', sum.stats.failed === 0 && sum.stats.filled === 1 && sum.terminalKinds['done'] === 1, sum);
  }
}

export function getAggregationFailures(): string[] {
  return failures;
}
