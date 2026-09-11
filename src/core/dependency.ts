// 最小 dependsOn 有向无环调度(F08b)
// 只建立"实际需要"的父子依赖:父任务 id → 依赖它的子任务 id 列表。
export interface DepNode {
  id: string;
  dependsOn: string[]; // 父任务 id
}

export interface DepGraphResult {
  /** 拓扑稳定顺序(父在前)。 */
  order: string[];
  cycle: string[] | null;
}

/** 功能:校验依赖引用与环;返回稳定拓扑序或环成员(缺依赖视为独立任务并记录? 由调用方提供完整节点集合,引用不存在即报缺依赖)。 */
export function buildDepOrder(nodes: DepNode[]): DepGraphResult & { missing: string[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ids = new Set(byId.keys());
  const missing: string[] = [];
  for (const n of nodes) {
    for (const p of n.dependsOn) if (!ids.has(p)) missing.push(`${n.id}->${p}`);
  }
  const indegree = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    indegree.set(n.id, n.dependsOn.length);
    for (const p of n.dependsOn) {
      const list = children.get(p) || [];
      list.push(n.id);
      children.set(p, list);
    }
  }
  const queue: string[] = nodes.filter((n) => (indegree.get(n.id) || 0) === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const cur = queue.shift()!;
    order.push(cur);
    for (const child of children.get(cur) || []) {
      indegree.set(child, (indegree.get(child) || 0) - 1);
      if (indegree.get(child) === 0) queue.push(child);
    }
  }
  const cycle = order.length === nodes.length ? null : nodes.filter((n) => !order.includes(n.id)).map((n) => n.id);
  return { order, cycle, missing };
}

/** 功能:父任务未完成时,返回应被阻塞的直接/间接依赖者(独立任务不受影响)。 */
export function blockedDependents(nodes: DepNode[], failedParentId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const n of nodes) for (const p of n.dependsOn) {
    const list = children.get(p) || [];
    list.push(n.id);
    children.set(p, list);
  }
  const out = new Set<string>();
  const stack = [failedParentId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const child of children.get(cur) || []) {
      if (out.has(child)) continue;
      out.add(child);
      stack.push(child);
    }
  }
  return out;
}
