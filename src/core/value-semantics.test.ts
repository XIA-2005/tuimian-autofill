// P04 值语义单元测试(PLAN v3 · P04;R05/R21 基础)
import {
  compareKindForField,
  isEmptyValue,
  isPlaceholderOption,
  isSemanticEqual,
  isTextFieldEqual,
  normalizeIdCard,
  parseDateParts,
} from './value-semantics';

const failures: string[] = [];
function test(name: string, cond: boolean): void {
  if (!cond) failures.push(name);
}

export function runValueSemanticsTests(): void {
  // 空值语义:'' 为空;'0' 不是空。
  test('P04: 空串为空', isEmptyValue('') && isEmptyValue('   '));
  test('P04: 0 不是空', !isEmptyValue('0'));
  // 占位 option:文本含请选择(即使值为 '0')与空值首项都算占位。
  test('P04: 文本占位(值为0)识别', isPlaceholderOption('0', '--请选择--'));
  test('P04: 空值首项识别', isPlaceholderOption('', ''));
  test('P04: 真实选项不误判占位', !isPlaceholderOption('1', '男'));
  // 身份证末位 X 归一。
  test('P04: 身份证末位 X 大小写等价', normalizeIdCard('21021120030501123x') === normalizeIdCard('21021120030501123X'));
  test('P04: 非 18 位身份证不做归一变换', normalizeIdCard('123') === '123');
  // 文本等价:trim;邮箱本地部分大小写不归一;长文不合并空白。
  test('P04: 文本 trim 后等价', isTextFieldEqual('basic.name', ' 张三 ', '张三'));
  test('P04: 邮箱不做本地部分大小写归一', !isTextFieldEqual('basic.email', 'Zhang@Example.com', 'zhang@example.com') && isTextFieldEqual('basic.email', 'Zhang@example.com', 'Zhang@example.com'));
  test('P04: 长文不擅自合并空白', !isTextFieldEqual('compose.awards', 'a  b', 'a b') && isTextFieldEqual('compose.awards', 'a b', 'a b'));
  // 数字代码保留前导零:不做数值归一。
  test('P04: 前导零代码不是数值等价', !isTextFieldEqual('education.rank', '03', '3'));
  // 日期:精度判定与宽容格式解析。
  test('P04: 日期按精度比较(年月 vs 同年同日)', isSemanticEqual('month', '2024-01-15', '2024年01月'));
  test('P04: 日期精度 day 区分同日', !isSemanticEqual('day', '2024-01-15', '2024-01-16'));
  test('P04: 日期解析宽容分隔符', !!parseDateParts('2024/01/15') && !!parseDateParts('2024.1') && !parseDateParts('abc'));
  test('P04: 无法解析时不判等', !isSemanticEqual('day', 'abc', '2024-01-15'));
  test('P04: compareKindForField 精度映射', compareKindForField('education.startDate').precision === 'month' && compareKindForField('basic.birthday').precision === 'day' && compareKindForField('basic.name').kind === 'text');
}

export function getValueSemanticsFailures(): string[] {
  return failures;
}
