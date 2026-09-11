// P08/F08a picker 状态落盘脱敏、代码冲突与成对角色判定测试(接入 npm test)
import { makeDom } from '../../test/regression/observer';
import { loadPickerState, pickerCodeConflictDecision, pickerPairVerdict, savePickerState } from './picker-state-machine';

const failures: string[] = [];
function test(name: string, cond: boolean): void {
  if (!cond) failures.push(name);
}

export function runPickerStateTests(): void {
  {
    const { doc } = makeDom('<html><body></body></html>', 'https://example.edu.cn/tmybm/x.do');
    const snap = {
      at: 1,
      pickers: {
        'education.university': {
          state: 'done' as const,
          attempt: 0,
          updatedAt: 2,
          value: '西安理工大学',
          context: { profilePath: 'education.university', expectedCode: '10700' },
        },
      },
    };
    savePickerState(snap, doc);
    const raw = doc.defaultView!.sessionStorage.getItem('tui-picker-state') || '';
    test('P08: 落盘不包含真实字段值', !raw.includes('西安理工大学'));
    test('P08: 落盘不包含 expectedCode', !raw.includes('10700'));
    const loaded = loadPickerState(doc);
    test('P08: 落盘保留匿名进度字段', loaded.pickers['education.university']?.state === 'done' && loaded.pickers['education.university']?.attempt === 0);
  }
  {
    test('P08: 无期望代码 → 正常流程', pickerCodeConflictDecision('123', undefined) === 'missing');
    test('P08: 页面代码为空 → 允许自动选择', pickerCodeConflictDecision('', '10700') === 'ok');
    test('P08: 页面代码相同 → 允许', pickerCodeConflictDecision('10700', '10700') === 'ok');
    test('P08: 页面代码不同非空 → conflict 保留原值', pickerCodeConflictDecision('10698', '10700') === 'conflict');
  }
  {
    test('F08a: 名称已填而代码为空 → conflict', pickerPairVerdict({ code: '', expectedCode: '10700', nameFilled: true, displayFilled: false }) === 'conflict');
    test('F08a: 显示框已填而代码为空 → conflict', pickerPairVerdict({ code: '', expectedCode: '10700', nameFilled: false, displayFilled: true }) === 'conflict');
    test('F08a: 代码一致且名称空 → ok', pickerPairVerdict({ code: '10700', expectedCode: '10700', nameFilled: false, displayFilled: false }) === 'ok');
    test('F08a: 合法名称不与代码直接比较', pickerPairVerdict({ code: '10700', expectedCode: '10700', nameFilled: true, displayFilled: false }) === 'ok');
    test('F08a: 代码不同 → conflict', pickerPairVerdict({ code: '10698', expectedCode: '10700', nameFilled: false, displayFilled: false }) === 'conflict');
  }
}

export function getPickerStateFailures(): string[] {
  return failures;
}
