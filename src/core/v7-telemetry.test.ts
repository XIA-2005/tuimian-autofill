// v7 遥测/报告脱敏测试(PLAN v7 · I02,复审 C06)。
// 目标:合成姓名/地址/标题/路径令牌放入 label/reason/页面错误文本后,实际消息与 sessionStorage 诊断中都不出现。
import { buildDiagnosticSummary, createFillTelemetryState, reduceFillTelemetry, sanitizeDiagnosticValue, fixedFieldLabel } from './fill-telemetry';
import { sanitizeScanForDiagnostics } from './scanner';
import type { SiteScan } from './scanner';
import { ISSUE_CATALOG } from './error-codes';

const failures: string[] = [];
function test(name: string, cond: boolean, detail?: unknown): void {
  if (cond) return;
  failures.push(detail === undefined ? name : `${name} :: ${JSON.stringify(detail)}`);
}

const MARKERS = ['SYNTH_NAME_张三', 'SYNTH_ADDR_西安市测试路1号', 'SYNTH_TITLE_脱敏论文标题', 'SYNTH_TOKEN_path123'];
const dirty = (text: string): string => `${text} ${MARKERS.join(' ')}`;
const leaks = (value: unknown): string[] => {
  const json = JSON.stringify(value) ?? '';
  return MARKERS.filter((marker) => json.includes(marker));
};

export function runV7TelemetryTests(): void {
  // C06:持久化 reason 不得携带页面原文/资料值。
  {
    let state = createFillTelemetryState(1_000);
    state = reduceFillTelemetry(state, { stage: 'filling', level: 'warning', action: '写入或回读失败', field: 'basic.name', reason: `值已写入但页面报本字段错误:${dirty('请检查')}`, timestamp: 1_100 });
    test('v7-C06-遥测reason不落页面原文', leaks(state).length === 0 && String(state.events[0].reason || '').includes('页面报本字段错误'), { reason: state.events[0].reason, leaks: leaks(state) });
    test('v7-C06-固定原因仍保留可定位信息', reduceFillTelemetry(createFillTelemetryState(1), { stage: 'verifying', level: 'error', action: '验证失败', field: 'basic.name', reason: '写入后未稳定接受:页面在 settle 窗口内改写或清空了该值' }).events[0].reason?.includes('未稳定接受') === true);
  }
  // C06:有 issueCode 时使用问题码固定文案(且不再拼接页面文本)。
  {
    const state = reduceFillTelemetry(createFillTelemetryState(1), { stage: 'filling', level: 'warning', action: '需人工', field: 'basic.name', issueCode: 'E1103', reason: dirty('下拉不匹配') });
    test('v7-C06-有issueCode时用固定文案', state.events[0].reason === ISSUE_CATALOG.E1103.summary && leaks(state).length === 0, { reason: state.events[0].reason });
  }
  // C06:持久化标签只允许固定字段类别,不回退到页面原文。
  {
    const state = reduceFillTelemetry(createFillTelemetryState(1), { stage: 'filling', level: 'success', action: '已填写', targetLabel: dirty('手机号'), field: 'basic.phone' });
    test('v7-C06-持久化标签为固定类别', state.events[0].targetLabel === fixedFieldLabel('basic.phone') && leaks(state).length === 0, { targetLabel: state.events[0].targetLabel });
  }
  // C06:诊断摘要(报告唯一来源)不得携带页面标签原文、资料值或页面错误原文。
  {
    const raw = {
      at: 1,
      stats: { total: 1, filled: 0, failed: 1 },
      profileLists: { name: dirty('张三'), awards: [dirty('奖项')] },
      items: [{ label: dirty('父亲姓名'), field: 'familyMembers[0].name', status: 'failed', value: dirty('值'), reason: dirty('页面错误'), issue: 'E1103' }],
    };
    const summary = buildDiagnosticSummary(raw);
    test('v7-C06-诊断摘要不携带资料', leaks(summary).length === 0 && summary?.items[0].label === '家庭成员 · 第 1 行' && summary?.items[0].issue === 'E1103' && !('profileLists' in (summary as object)), { summary });
    test('v7-C06-未登记问题码被丢弃', buildDiagnosticSummary({ items: [{ field: 'basic.name', status: 'failed', issue: 'NOT_A_CODE' }] })?.items[0].issue === '');
  }
  // C06:站点扫描(会落 sessionStorage)只保留结构签名。
  {
    const scan: SiteScan = {
      url: 'https://audit.invalid/form',
      inputs: 1,
      selects: 0,
      textareas: 0,
      gridTables: [{
        header: [dirty('姓名'), dirty('关系')],
        rows: 2,
        dataRows: 1,
        writableRows: 1,
        purpose: 'family',
        samples: [{ cells: [dirty('单元格')] }],
        addButtons: [{ tag: 'button', text: dirty('新增一行'), cls: 'add', name: 'add' }],
        hasSaveButton: false,
      }],
      pickers: [{ name: 'byyx', triggerTag: 'a', triggerCls: 'addon' }],
    };
    const safe = sanitizeScanForDiagnostics(scan);
    test('v7-C06-站点扫描只留结构签名', leaks(safe).length === 0 && safe.gridTables[0].samples.length === 0 && safe.gridTables[0].purpose === 'family', { safe });
  }
  // C06:调试块字符串一律清洗且长度有界。
  {
    const safe = sanitizeDiagnosticValue({ a: dirty('页面按钮'), nested: [{ b: dirty('页面文本') }], long: 'A'.repeat(500) }) as { a: string; nested: Array<{ b: string }>; long: string };
    const serialized = JSON.stringify(safe);
    test('v7-C06-调试块不落页面原文', !serialized.includes('张三') && serialized.includes('文本(') && safe.long.length <= 120, safe);
  }
}

export function getV7TelemetryFailures(): string[] {
  return failures;
}
