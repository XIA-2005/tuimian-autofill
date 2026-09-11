import assert from 'node:assert/strict';
import { buildDiagnosticSummary, createFillTelemetryState, reduceFillTelemetry, safeTelemetryLabelText, sanitizeDiagnosticValue } from './fill-telemetry';
import { sanitizeScanForDiagnostics } from './scanner';
import { toPlainFillItem } from './fill-task';

/** 功能：独立测试短姓名、ASCII令牌、对象键和URL，不再把所有标记混成一条含中文的字符串。 */
export function runV8ReviewTests(): void {
  for (const marker of ['Alice', '张三', 'PRIVATE_TOKEN_ASCII', '秘密住址甲乙丙']) {
    const debug = sanitizeDiagnosticValue({ [marker]: marker, nested: [{ value: marker }] });
    const event = reduceFillTelemetry(createFillTelemetryState(), { stage: 'failed', level: 'error', action: marker, targetLabel: marker, field: marker, reason: marker, issueCode: marker });
    const summary = buildDiagnosticSummary({ stats: { total: 1, [marker]: marker }, items: [{ field: marker, status: marker, issue: marker, label: marker }] });
    const dto = toPlainFillItem({ label: marker, field: marker, status: marker, issueCode: marker });
    assert.equal(JSON.stringify({ debug, event, summary, dto }).includes(marker), false, `${marker}: 原文不得进入诊断值、键、标签、action或字段标识`);
    assert.notEqual(safeTelemetryLabelText(marker, 'basic.name'), marker);
    const scan = sanitizeScanForDiagnostics({ url: `https://audit.invalid/${encodeURIComponent(marker)}?token=${encodeURIComponent(marker)}#${encodeURIComponent(marker)}`, inputs: 1, selects: 0, textareas: 0,
      gridTables: [{ header: [marker], rows: 1, dataRows: 0, writableRows: 0, purpose: 'family', samples: [{ cells: [marker] }], addButtons: [{ tag: 'button', text: marker, cls: marker, name: marker }], hasSaveButton: false }],
      pickers: [{ name: marker, triggerTag: 'a', triggerCls: marker }] });
    assert.equal(JSON.stringify(scan).includes(marker), false);
    assert.equal(JSON.stringify(scan).includes(encodeURIComponent(marker)), false);
  }
  assert.equal(safeTelemetryLabelText('姓名', 'basic.name'), '姓名');
  assert.equal(toPlainFillItem({ label: '姓名', field: 'basic.name', status: 'filled' }).field, 'basic.name');
  assert.deepEqual(buildDiagnosticSummary({ stats: { total: 2, failed: 1 }, items: [] })?.stats, { total: 2, failed: 1 });
}
