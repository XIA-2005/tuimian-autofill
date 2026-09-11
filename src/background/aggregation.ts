// 跨 frame 填充聚合器(PLAN v5 · G05)
// 纯逻辑,无 chrome 依赖,便于单测:参与者注册 → 结果更新 → 终态 → 汇总。
// 协议要点:
// - 参与者身份 = (frameId, documentId);注册后才计入"应完成集合"。
// - 每帧只保留最新 seq 结果(迟到旧 seq 拒绝);旧 runId 一律拒绝。
// - 只有全部已注册参与者都到达终态才算正常完成;硬 deadline 只产生 timedOut + missing。
import type { FillStats } from '../core/filler';

export interface PlainFillItem {
  label: string;
  field: string | null;
  status: string;
  reason?: string;
  issueCode?: string;
}

export interface FrameFillReport {
  runId: string;
  frameId: number;
  /** 文档实例标识(同 frame 新旧文档区分)。 */
  docId: string;
  frameSeq: number;
  stats: FillStats;
  items: PlainFillItem[];
  /** H03:终态类别(缺省按 done;取消/等待人工必须显式区分,不得一律当成功完成)。 */
  terminalKind?: 'done' | 'waiting-manual' | 'cancelled';
}

export interface Participant {
  frameId: number;
  docId: string;
  seq: number;
  terminal: boolean;
  /** H03:该参与者声明的终态类别。 */
  terminalKind?: 'done' | 'waiting-manual' | 'cancelled';
  /** J01:等待人工接管中(可恢复暂停)——不是终态,轮次继续保留。 */
  paused?: boolean;
  stats: FillStats;
  items: PlainFillItem[];
}

export interface AggregatedRun {
  runId: string;
  framesReported: number;
  participants: number;
  terminalCount: number;
  missing: string[];
  /** H03:各终态类别的参与者计数(done/waiting-manual/cancelled)。 */
  terminalKinds: Record<string, number>;
  stats: FillStats;
  items: PlainFillItem[];
  timedOut: boolean;
}

function emptyStats(): FillStats {
  return { total: 0, filled: 0, skipped: 0, noMatch: 0, profileEmpty: 0, failed: 0, picker: 0, pickerResumeCount: 0 };
}

function addStats(target: FillStats, src: FillStats): void {
  target.total += src.total;
  target.filled += src.filled;
  target.skipped += src.skipped;
  target.noMatch += src.noMatch;
  target.profileEmpty += src.profileEmpty;
  target.failed += src.failed;
  target.picker += src.picker;
  target.pickerResumeCount += src.pickerResumeCount;
}

function keyOf(frameId: number, docId: string): string {
  return `${frameId}::${docId}`;
}

export class RunAggregator {
  readonly runId: string;
  private readonly participants = new Map<string, Participant>();
  private readonly order: string[] = [];

  constructor(runId: string) {
    this.runId = runId;
  }

  /** 功能:参与者注册(收到 FILL 后由各 frame 主动上报);同 (frame,doc) 重复注册忽略。 */
  register(frameId: number, docId: string): boolean {
    const key = keyOf(frameId, docId);
    if (this.participants.has(key)) return false;
    this.participants.set(key, { frameId, docId, seq: 0, terminal: false, stats: emptyStats(), items: [] });
    this.order.push(key);
    return true;
  }

  /** 功能:接收一次结果更新(runId 不符 / 同帧旧 seq / 该帧已终态一律拒绝)。
   * I00:终态即最终——终态后的更高 seq 不再改统计,与 background"收口即删轮"保持同一语义。 */
  accept(report: FrameFillReport): boolean {
    if (report.runId !== this.runId) return false;
    if (!Number.isSafeInteger(report.frameSeq) || report.frameSeq < 1) return false;
    const key = keyOf(report.frameId, report.docId);
    let entry = this.participants.get(key);
    if (!entry) {
      // 未注册的 frame 也接受结果(注册消息可能晚到),但默认非终态。
      this.register(report.frameId, report.docId);
      entry = this.participants.get(key);
      if (!entry) return false;
    }
    if (entry.terminal) return false; // I00:终态后不得再更新(避免"单测允许、background 已删轮"的自相矛盾)
    if (report.frameSeq <= entry.seq) return false;
    entry.seq = report.frameSeq;
    entry.stats = report.stats;
    entry.items = report.items;
    return true;
  }

  /** 功能:标记参与者终态(带最终结果);终态一旦确立即不再被更高 seq 更改。 */
  terminalize(report: FrameFillReport): boolean {
    const key = keyOf(report.frameId, report.docId);
    const existing = this.participants.get(key);
    if (existing?.terminal) return false; // I00:重复终态不改变已有结论
    const ok = this.accept(report);
    if (!ok) return false; // 被拒绝的旧轮/旧序号不能改变终态。
    const entry = this.participants.get(key);
    if (entry) {
      entry.terminal = true;
      entry.terminalKind = report.terminalKind || 'done';
      entry.paused = false;
    }
    return ok;
  }

  participantsCount(): number {
    return this.participants.size;
  }

  /** 功能:J01 标记/解除参与者的"等待人工"暂停(暂停不是终态,轮次继续保留)。 */
  setPaused(report: FrameFillReport, paused: boolean): boolean {
    if (report.runId !== this.runId) return false;
    const key = keyOf(report.frameId, report.docId);
    const entry = this.participants.get(key);
    if (!entry) return false;
    if (entry.terminal) return false; // 已是终态:不再因人工回调重新打开
    if (!Number.isSafeInteger(report.frameSeq) || report.frameSeq <= entry.seq) return false;
    entry.seq = report.frameSeq;
    entry.paused = paused;
    if (report.stats) {
      // 暂停和恢复也属于同一有序消息流，旧快照不得覆盖新快照。
      entry.stats = report.stats;
      entry.items = report.items;
    }
    return true;
  }

  /** 功能:J01 是否所有未终态参与者都在等待人工(用于把硬 deadline 换成暂停预算)。 */
  pausedOnlyPending(): boolean {
    let pending = 0;
    for (const entry of this.participants.values()) {
      if (entry.terminal) continue;
      pending += 1;
      if (!entry.paused) return false;
    }
    return pending > 0;
  }

  /** 功能:J00 列出"已注册但尚未终态"的参与者(deadline 时用于发送 scoped 停止通知)。 */
  unterminatedParticipants(): Array<{ frameId: number; docId: string }> {
    const out: Array<{ frameId: number; docId: string }> = [];
    for (const key of this.order) {
      const entry = this.participants.get(key);
      if (!entry || entry.terminal) continue;
      out.push({ frameId: entry.frameId, docId: entry.docId });
    }
    return out;
  }

  /** 功能：返回有界的已覆盖区域身份摘要，供完成回执识别重复注册；不返回字段资料。 */
  registeredRegions(limit = 256): string[] {
    return Array.from(this.participants.keys()).slice(0, limit);
  }

  terminalCount(): number {
    let n = 0;
    for (const p of this.participants.values()) if (p.terminal) n += 1;
    return n;
  }

  /** 功能:全部已注册参与者都到达终态(无参与者时不算完成)。 */
  allTerminal(): boolean {
    if (this.participants.size === 0) return false;
    for (const p of this.participants.values()) if (!p.terminal) return false;
    return true;
  }

  /** 功能:汇总已终态参与者的结果(未终态参与者的结果不进入成功汇总)。 */
  summarize(): AggregatedRun {
    const stats = emptyStats();
    const items: PlainFillItem[] = [];
    let framesReported = 0;
    const missing: string[] = [];
    const terminalKinds: Record<string, number> = {};
    for (const key of this.order) {
      const entry = this.participants.get(key);
      if (!entry) continue;
      if (!entry.terminal) {
        missing.push(keyOf(entry.frameId, entry.docId));
        continue;
      }
      framesReported += 1;
      const kind = entry.terminalKind || 'done';
      terminalKinds[kind] = (terminalKinds[kind] || 0) + 1;
      addStats(stats, entry.stats);
      items.push(...entry.items);
    }
    return {
      runId: this.runId,
      framesReported,
      participants: this.participants.size,
      terminalCount: this.terminalCount(),
      missing,
      terminalKinds,
      stats,
      items,
      timedOut: false,
    };
  }

  /** 功能:deadline 收口——未终态参与者列为 missing,timedOut=true(不得伪装成功)。 */
  summarizeTimeout(): AggregatedRun {
    const base = this.summarize();
    // 人工暂停前已经上报的稳定快照仍须保留；missing/terminalCount继续表明该区域未完成。
    for (const entry of this.participants.values()) {
      if (entry.terminal || !entry.paused || entry.seq === 0) continue;
      addStats(base.stats, entry.stats);
      base.items.push(...entry.items);
      base.framesReported += 1;
    }
    base.timedOut = !this.allTerminal();
    return base;
  }
}
