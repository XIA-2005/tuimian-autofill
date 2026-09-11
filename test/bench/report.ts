// bench 报表 P9 脱敏(承接 fill-telemetry.ts 既有纪律:禁止字段原文值与页面原文落盘)
// 报表只存:计数/字段键/值形状(正则化)/sha256 短摘要;拒填理由为规格文本,允许落盘。
import { createHash } from 'node:crypto';

/** 功能:值形状正则化——数字→9、英文→a、中文→c、空白→空格,泄露面只剩形状。 */
export function shapeValue(v: string): string {
  return String(v)
    .replace(/\d/g, '9')
    .replace(/[A-Za-z]/g, 'a')
    .replace(/[\u4e00-\u9fff]/g, 'c')
    .replace(/\s/g, ' ');
}

/** 功能:原文 sha256 短摘要(供跨次运行比对同值,不回传原文)。 */
export function digestValue(v: string): string {
  return createHash('sha256').update(String(v), 'utf8').digest('hex').slice(0, 12);
}

export interface BenchReportInput {
  fixtureId: string;
  rows: Array<{
    key: string;
    tag: string;
    cls: string;
    attempted: boolean;
    readShape: string;
    readDigest: string;
    expectedShape?: string;
    expectedDigest?: string;
    reason?: string;
    gapId?: string;
  }>;
  tally: { overfill: number; wrong: number; missing: number; refused: number; filled: number; untracked: number };
}

/** 功能:构建脱敏报表对象。确定性纪律:不含时间戳/随机源,同输入→同字节输出。 */
export function buildBenchReport(input: BenchReportInput): Record<string, unknown> {
  return {
    schema: 'bench_report_v0',
    fixtureId: input.fixtureId,
    tally: input.tally,
    // P7:报表枚举全部控件(含被拒者与理由),不只列填过的。
    controls: input.rows.map((row) => ({
      key: row.key,
      tag: row.tag,
      cls: row.cls,
      attempted: row.attempted,
      read: { shape: row.readShape, digest: row.readDigest },
      expected: row.expectedShape === undefined ? undefined : { shape: row.expectedShape, digest: row.expectedDigest },
      reason: row.reason,
      gapId: row.gapId,
    })),
  };
}
