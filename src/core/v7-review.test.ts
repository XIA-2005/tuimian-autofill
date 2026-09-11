import assert from 'node:assert/strict';
import { makeDomIsolated } from '../../test/regression/observer';
import { createTableEvidenceEnvelope, detectFakeSave, makeTableEvidenceScope, readScopedTableEvidence, snapshotTableEvidence } from './save-guard';
import { emptyProfile } from './profile';
import { captureRunSnapshot } from './fill-session';
import { getWriteRecord } from './filler';
import { runFillPipelineAsync } from './fill-pipeline';
import type { SchoolAdapterPackage } from './adapters';

/** 功能：验收表格证据范围、空行判定和两个异步轮次交错时的写入记录身份。 */
export async function runV7ReviewTests(): Promise<void> {
  const tableHtml = '<table id="papers"><tr><th>时间</th><th>发表刊物或出版社</th><th>标题</th><th>作者排名</th></tr><tr><td><input></td><td><input></td><td><input id="title" value="SYNTHETIC_TITLE"><button>编辑</button></td><td><input></td></tr></table>';
  const context = makeDomIsolated(tableHtml, 'https://example.invalid/form');
  try {
    const scope = makeTableEvidenceScope('origin#opaque', 'pkg', '1', 'page', { fields: ['title'] });
    const envelope = createTableEvidenceEnvelope(context.doc, scope, 1000000);
    assert.equal(envelope.tables[0]?.filled, 1, '同格有编辑按钮不能掩盖真实输入');
    const raw = JSON.stringify(envelope);
    assert.equal(raw.includes('SYNTHETIC_TITLE'), false, '证据不得包含填写值');
    assert.equal(readScopedTableEvidence(raw, scope, 1000001).length, 1);
    for (const key of ['routeKey', 'packageId', 'packageVersion', 'pageId', 'contractHash'] as const) {
      assert.equal(readScopedTableEvidence(raw, { ...scope, [key]: 'changed' }, 1000001).length, 0, `${key} 变更使证据失效`);
    }
    assert.equal(readScopedTableEvidence(raw, scope, 1000000 + 30 * 60_000 + 1).length, 0);
    assert.equal(readScopedTableEvidence(raw, scope, 999999).length, 0, '未来时间拒绝');
    assert.equal(readScopedTableEvidence(JSON.stringify({ at: 1000000, tables: envelope.tables }), scope, 1000001).length, 0, '旧格式不参与比较');
    (context.doc.querySelector('#title') as HTMLInputElement).value = '';
    assert.equal(detectFakeSave(envelope.tables, context.doc, scope.routeKey), 'achievements');
    context.doc.querySelector('table')!.id = 'other-table';
    assert.equal(detectFakeSave(envelope.tables, context.doc, scope.routeKey), null, '另一张同类表不是原表保存证据');
    context.doc.querySelector('#title')!.outerHTML = '<select><option value="">请选择</option></select>';
    assert.equal(snapshotTableEvidence(context.doc)[0]?.filled, 0, '占位选项的文本不能把空行算成已填');
  } finally { context.restore(); }

  const concurrent = makeDomIsolated('<input id="parent"><input id="child">', 'https://scope.invalid/form');
  try {
    const adapter: SchoolAdapterPackage = {
      schemaVersion: 1, id: 'scope', version: '1', minCoreVersion: '2.0.5', schoolName: '合成', programName: '合成', family: 'other',
      match: { hosts: ['scope.invalid'] }, capabilities: { registerFill: 'directory', formFill: 'experimental', pluginExtract: 'directory', sessionCrawl: 'directory' },
      pages: [{ id: 'form', name: 'form', pathPatterns: ['*'], role: 'form', fields: [
        { nativeId: 'parent', profilePath: 'basic.name', driver: 'text', dependencyWait: { timeoutMs: 1000, settleMs: 60 } },
        { nativeId: 'child', profilePath: 'basic.phone', driver: 'text', dependsOn: ['basic.name'], dependencyWait: { timeoutMs: 1000, settleMs: 60 } },
      ] }], crawl: { mode: 'guided', pageOrder: ['form'] }, projectionPolicy: 'default', commitPolicy: 'manual-save-only',
    };
    const profile = emptyProfile(); profile.basic.name = 'SYNTHETIC'; profile.basic.phone = '13800000000';
    const runA = captureRunSnapshot(concurrent.doc, concurrent.doc.location.href, 'run-A');
    const runB = captureRunSnapshot(concurrent.doc, concurrent.doc.location.href, 'run-B');
    let aActive = true;
    const first = runFillPipelineAsync(profile, concurrent.doc, concurrent.doc.location.href, { adapterPackage: adapter, run: runA, stillActive: () => aActive });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = runFillPipelineAsync(profile, concurrent.doc, concurrent.doc.location.href, { adapterPackage: adapter, run: runB, stillActive: () => true });
    aActive = false;
    await Promise.all([first, second]);
    assert.equal(getWriteRecord(concurrent.doc, concurrent.doc.querySelector('#parent')!)?.runId, 'run-B', '旧轮finally不得清除新轮写入作用域');
    assert.equal(getWriteRecord(concurrent.doc, concurrent.doc.querySelector('#child')!)?.runId, 'run-B');
  } finally { concurrent.restore(); }
}
