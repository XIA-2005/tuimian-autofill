import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDomIsolated } from '../../test/regression/observer';
import { validateAdapterPackage } from './adapter-packages';
import { emptyProfile } from './profile';
import { fillAdapterContractAsync } from './dependency-executor';
import { runFillPipelineAsync } from './fill-pipeline';

/** 功能：验证坏图和坏时间配置在任何写入前被拒绝，取消后不运行通用补写。 */
export async function runDependencyExecutorTests(): Promise<void> {
  const base = JSON.parse(readFileSync('test/fixtures/dependency-contract.json', 'utf8'));
  for (const badWait of [{ timeoutMs: Infinity }, { timeoutMs: 10 }, { settleMs: -1 }, { timeoutMs: 100, settleMs: 90 }]) {
    const bad = structuredClone(base);
    bad.pages[0].fields[0].dependencyWait = badWait;
    assert.throws(() => validateAdapterPackage(bad), /依赖等待/);
  }
  for (const mode of ['cycle', 'missing', 'cancelled']) {
    const adapter = structuredClone(base);
    const context = makeDomIsolated('<label>邮箱<input id="email" name="email"></label><input id="province"><input id="school"><input id="major">', 'https://dependency.test/form');
    try {
      const profile = emptyProfile(); profile.basic.email = 'test@example.invalid'; profile.education.province = '陕西省';
      if (mode === 'cycle') adapter.pages[0].fields[0].dependsOn = ['education.major'];
      if (mode === 'missing') adapter.pages[0].fields[0].dependsOn = ['missing.field'];
      if (mode === 'cancelled') {
        const trace = await runFillPipelineAsync(profile, context.doc, context.doc.location.href, { adapterPackage: adapter, stillActive: () => false });
        assert.equal(trace.result.items.length, 0);
      } else {
        const items = await fillAdapterContractAsync(profile, context.doc, context.doc.location.href, adapter, { stillActive: () => true });
        assert.equal(items.length, 4);
        assert.ok(items.every((item) => item.dependencyState === 'blocked'));
      }
      assert.ok(Array.from(context.doc.querySelectorAll('input')).every((input) => input.value === ''), `${mode}: 不得写入任何值`);
    } finally { context.restore(); }
  }
}
