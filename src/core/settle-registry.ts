// H04:单轮内多个补填阶段的 settle 验证登记表。
// 职责:登记/取出/按轮收口——取出过的条目不得再次取出(不重复计数),未被取出的条目不得被后来者覆盖丢弃。
// 纯逻辑,不接触 DOM;由 content 的定时器与 FILL_DONE 收口共同消费。
import type { RunSnapshot } from './fill-session';

export interface SettleRun<T> {
  /** 所属轮次(用于收口时按轮取回)。 */
  runId: string;
  /** 本轮待验证的条目(原对象引用,验证就地更新状态)。 */
  items: T[];
  /** 本轮统计(就地更新)。 */
  stats: unknown;
  /** 本条目已判定的失败数。 */
  failed: number;
  /** 登记序号(定位用;与轮次无关)。 */
  token: number;
  /** 登记时的原轮快照(验证前必须复核)。 */
  ctx: RunSnapshot | null;
}

export class SettleRegistry<T> {
  private runs: SettleRun<T>[] = [];
  private nextToken = 0;

  /** 功能:登记一个待验证阶段;返回登记项供定时器持有。 */
  register(runId: string, items: T[], stats: unknown, ctx: RunSnapshot | null): SettleRun<T> {
    const run: SettleRun<T> = { runId, items, stats, failed: 0, token: ++this.nextToken, ctx };
    this.runs.push(run);
    return run;
  }

  /** 功能:定时器到期时取回自己登记的条目;已被收口消费或不存在时返回 null(不得重复验证)。 */
  take(run: SettleRun<T>): SettleRun<T> | null {
    const idx = this.runs.indexOf(run);
    if (idx < 0) return null;
    this.runs.splice(idx, 1);
    return run;
  }

  /** 功能:按轮次取出全部尚未验证的阶段(收口时一次性处理,避免较早阶段被覆盖丢弃)。 */
  consumeRun(runId: string): SettleRun<T>[] {
    const taken = this.runs.filter((run) => run.runId === runId);
    if (taken.length) this.runs = this.runs.filter((run) => run.runId !== runId);
    return taken;
  }

  /** 功能:J00 丢弃某轮全部待验证登记(该轮已取消/超时,不得再验证或计分)。 */
  dropRun(runId: string): void {
    this.runs = this.runs.filter((run) => run.runId !== runId);
  }

  /** 功能:当前待验证条目数(诊断用)。 */
  size(): number {
    return this.runs.length;
  }

  /** 功能：只检查指定轮次的未验证阶段，旧轮的条目不延迟当前轮收口。 */
  hasRun(runId: string): boolean {
    return this.runs.some((run) => run.runId === runId);
  }
}
