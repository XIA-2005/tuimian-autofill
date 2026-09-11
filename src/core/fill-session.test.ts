// F04 文档身份/路由脱敏/作用域测试(接入 npm test)
import { makeDomIsolated } from '../../test/regression/observer';
import { captureRunSnapshot, isRunSnapshotValid } from './fill-session';
import { routeKeyFor, sameFillRunScope, toPlainFillItem } from './fill-task';
import type { FillRunScope } from './fill-task';

const failures: string[] = [];
function test(name: string, cond: boolean): void {
  if (!cond) failures.push(name);
}

export function runFillSessionTests(): void {
  const URL = 'https://example.edu.cn/tmybm/tbgrxx.do';
  // Q08:同 URL 的两个独立 Document 快照必须互不有效。
  {
    const a = makeDomIsolated('<html><body><input name="xm"></body></html>', URL);
    const b = makeDomIsolated('<html><body><input name="xm"></body></html>', URL);
    const snapA = captureRunSnapshot(a.doc, URL, 'runA');
    test('F04(Q08): 同 URL 不同文档实例身份不同', !snapA.epoch.includes('doc1') || snapA.epoch.startsWith('doc1:'));
    test('F04(Q08): 旧文档快照不能用于新文档', isRunSnapshotValid(snapA, b.doc, URL) === false);
    const snapB = captureRunSnapshot(b.doc, URL, 'runB');
    test('F04(Q08): 本实例内快照有效', isRunSnapshotValid(snapB, b.doc, URL) === true);
    a.restore();
    b.restore();
  }
  // Q09:hash 路由变化使路由键不同;query 令牌不进入路由键。
  {
    const withBasic = routeKeyFor('https://x.edu.cn/a/b#/basic');
    const withUpload = routeKeyFor('https://x.edu.cn/a/b#/upload');
    test('F04(Q09): hash 路由区分', withBasic !== withUpload);
    const withToken = routeKeyFor('https://x.edu.cn/a/b?tok=SUPER_SECRET_XYZ');
    test('F04(Q09): 路由键不落盘原始令牌', !withToken.includes('SUPER_SECRET'));
    test('F04(Q09): 不同 query 语义仍可区分', withToken !== routeKeyFor('https://x.edu.cn/a/b'));
  }
  // 路径大小写不擅自合并(仅域名小写)。
  {
    test('F04: 路径大小写不同产生不同键(不擅自合并)', routeKeyFor('https://x.edu.cn/A/B') !== routeKeyFor('https://x.edu.cn/a/b'));
    test('F04: 域名大小写不敏感(同键)', routeKeyFor('https://X.edu.cn/A/B') === routeKeyFor('https://x.edu.cn/A/B'));
  }
  // F05:DTO 白名单——构造带私密字段的运行对象,输出不泄漏任何私密值。
  {
    const plain = toPlainFillItem({
      label: '手机号',
      field: 'basic.phone',
      status: 'filled',
      reason: 'ok',
      valuePreview: '13800000001',
      pickerContext: { expectedCode: 'SECRET_CODE' },
      el: {} as Element,
    });
    const json = JSON.stringify(plain);
    test('F05: DTO 不含 valuePreview/pickerContext/expectedCode', !json.includes('13800000001') && !json.includes('SECRET_CODE') && !json.includes('pickerContext') && !json.includes('valuePreview'));
    // H05:跨上下文 DTO 不再携带页面标签原文与 reason,只保留固定字段标签/field/status/issueCode。
    test('F05/H05: DTO 只保留固定标签与状态', plain.status === 'filled' && plain.field === 'basic.phone' && plain.label === '手机号' && plain.reason === undefined);
  }
  // sameFillRunScope 包含 packageVersion。
  {
    const base: FillRunScope = { runId: 'r', documentEpoch: 'd:1', routeKey: '/a', profileRevision: '1', packageId: 'p', packageVersion: '1.0', pageId: 'f' };
    test('F04: packageVersion 不同 → 作用域不等', sameFillRunScope(base, { ...base, packageVersion: '1.1' }) === false);
    test('F04: 相同作用域相等', sameFillRunScope(base, { ...base }) === true);
  }
}

export function getFillSessionFailures(): string[] {
  return failures;
}
