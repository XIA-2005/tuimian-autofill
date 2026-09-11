// F08b 最小依赖图测试(接入 npm test)
import { blockedDependents, buildDepOrder } from './dependency';

const failures: string[] = [];
function test(name: string, cond: boolean): void {
  if (!cond) failures.push(name);
}

export function runDependencyTests(): void {
  {
    const nodes = [
      { id: 'province', dependsOn: [] as string[] },
      { id: 'city', dependsOn: ['province'] },
      { id: 'district', dependsOn: ['city'] },
      { id: 'independent-name', dependsOn: [] as string[] },
    ];
    const res = buildDepOrder(nodes);
    test('F08b: 拓扑序父在前', res.order.indexOf('province') < res.order.indexOf('city') && res.order.indexOf('city') < res.order.indexOf('district'));
    test('F08b: 独立任务不受序约束', res.order.includes('independent-name'));
    test('F08b: 无环无缺依赖', res.cycle === null && res.missing.length === 0);
  }
  {
    const nodes = [
      { id: 'a', dependsOn: ['b'] as string[] },
      { id: 'b', dependsOn: ['a'] as string[] },
    ];
    const res = buildDepOrder(nodes);
    test('F08b: 环被拒绝且不死循环', res.cycle !== null && res.cycle.length === 2);
  }
  {
    const nodes = [
      { id: 'x', dependsOn: ['ghost'] as string[] },
      { id: 'y', dependsOn: [] as string[] },
    ];
    const res = buildDepOrder(nodes);
    test('F08b: 缺依赖显式报告', res.missing.some((m) => m.startsWith('x->ghost')));
  }
  {
    const nodes = [
      { id: 'province', dependsOn: [] as string[] },
      { id: 'city', dependsOn: ['province'] },
      { id: 'district', dependsOn: ['city'] },
      { id: 'independent', dependsOn: [] as string[] },
    ];
    const blocked = blockedDependents(nodes, 'province');
    test('F08b: 父失败仅阻塞子树,独立项不受影响', blocked.has('city') && blocked.has('district') && !blocked.has('independent'));
  }
}

export function getDependencyFailures(): string[] {
  return failures;
}
