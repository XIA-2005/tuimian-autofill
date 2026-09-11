// P06 稳定回读与可归因验证测试(接入 npm test)
import { makeDom } from '../../test/regression/observer';
import { attributableValidationError, findNewAttributableError, stableReadback, stableVerifyWritten } from './task-executor';

const failures: string[] = [];
function test(name: string, cond: boolean): void {
  if (!cond) failures.push(name);
}
export async function runTaskExecutorTests(): Promise<void> {
  return (async () => {
    // 即时一致且 settle 后仍一致。
    {
      let value = '男';
      const res = await stableReadback(() => value, (a, b) => a === b, '男', 'text', { settleMs: 60 });
      test('P06: 即时+settle 稳定 → ok', res.ok === true);
    }
    // 写入后被异步清空、稍后恢复(延迟选项真实到达)。
    {
      let value = '';
      setTimeout(() => { value = ''; }, 10);
      setTimeout(() => { value = '男'; }, 90);
      const res = await stableReadback(() => value, (a, b) => a === b, '男', 'text', { settleMs: 40, stableTimeoutMs: 400 });
      test('P06: 延迟选项真实到达 → 成功', res.ok === true);
    }
    // 写入后清空且不再恢复(受控组件即时成功但稍后清空)。
    {
      let value = '男';
      setTimeout(() => { value = ''; }, 20);
      const res = await stableReadback(() => value, (a, b) => a === b, '男', 'text', { settleMs: 10, stableTimeoutMs: 200 });
      test('P06: 稍后清空不再恢复 → failed', res.ok === false);
    }
    // 取消信号:提前返回、不无限轮询。
    {
      let value = '';
      let active = true;
      setTimeout(() => { active = false; }, 40);
      const started = Date.now();
      const res = await stableReadback(() => value, (a, b) => a === b, '男', 'text', { settleMs: 0, stableTimeoutMs: 5000, pollMs: 20, stillActive: () => active });
      test('P06: 取消后提前返回(不挂起)', res.ok === false && Date.now() - started < 2000);
    }
    // validation 归因:隐藏容器不归因;带字段关联的新错误可归因。
    {
      const { doc } = makeDom(
        '<html><body><div id="errBox" style="display:none">姓名错误</div>' +
        '<div id="errBox2"><span>sjh 手机号格式错误</span></div>' +
        '<input name="sjh"><input name="other"></body></html>',
        'https://example.edu.cn/tmybm/x.do',
      );
      const hidden = attributableValidationError(doc, doc.querySelector('[name="sjh"]') as Element, '#errBox', []);
      test('P06: 隐藏容器不归因', hidden === null);
      const related = attributableValidationError(doc, doc.querySelector('[name="sjh"]') as Element, '#errBox2', ['旧错误']);
      test('P06: 关联字段的新错误可归因(且 isNew)', !!related && related.isNew && related.text.includes('手机号'));
      const baselineSame = attributableValidationError(doc, doc.querySelector('[name="sjh"]') as Element, '#errBox2', ['sjh 手机号格式错误']);
      test('P06: 基线已有相同错误不算新增', !!baselineSame && baselineSame.isNew === false);
      // F06 修正:与目标无关联的错误不得归因(禁止回退到任意可见错误)。
      const unassociated = attributableValidationError(doc, doc.querySelector('[name="other"]') as Element, '#errBox2', []);
      test('P06(Q10): 无关联错误不归因本字段', unassociated === null);
      // G03:多个声明选择器时,第二个选择器的新增关联错误也必须被处理。
      {
        const multi = makeDom(
          '<html><body><div id="e1"><span>other-field 错误</span></div>' +
          '<div id="e2"><span>sjh 手机号格式错误</span></div>' +
          '<input name="sjh"></body></html>',
          'https://example.edu.cn/tmybm/y.do',
        );
        const hit = findNewAttributableError(multi.doc, multi.doc.querySelector('[name="sjh"]') as Element, ['#e1', '#e2'], []);
        test('G03: 第二个错误选择器也生效', !!hit && hit.selector === '#e2' && hit.text.includes('手机号'));
      }
    }
    // 稳定校正:只挑"本轮写入但值已偏离"的 filled 项。
    {
      const owned = new Map<Element, string>();
      const elA = { tagName: 'INPUT' } as Element;
      const elB = { tagName: 'INPUT' } as Element;
      owned.set(elA, '张三');
      owned.set(elB, '5');
      const items = [
        { status: 'filled', el: elA },
        { status: 'filled', el: elB },
        { status: 'conflict', el: elA },
      ];
      const read = new Map<Element, string>([[elA, '李四'], [elB, '5']]);
      const corrected = stableVerifyWritten(items, (el) => owned.get(el), (el) => read.get(el) || '');
      test('P06: 校正只命中值偏离的 filled 项', corrected.length === 1 && corrected[0].el === elA);
    }
  })();
}

export function getTaskExecutorFailures(): string[] {
  return failures;
}
