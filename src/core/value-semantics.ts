// 值语义比较(PLAN v3 · P04)
// 纯函数,无 DOM 依赖。规则(与 PLAN §P04 一致):
// - 空值:'' 为空;'0' 不是空;select 占位 option(值为空且文本含"请选择/----")视为空,由调用方传入 placeholder 标记。
// - 文本:默认 trim 两端比较;身份证只对末位 X 大小写归一;数字代码保留前导零,禁止数字归一化比较;
// - 邮箱:不做本地部分大小写归一,仅 trim 后比较;
// - 长文:不擅自合并空白/截断/改标点,trim 后比较;
// - 日期:拆出年月日数字后按 precision 比较(YYYY[-/.年]MM[-/.月]DD[日] 等宽容格式),避免"年月"被比成"同日"。

export type ComparePrecision = 'year' | 'month' | 'day' | 'text';

/** 功能:判断字符串是否为空(保留 '0' 等有意义值)。 */
export function isEmptyValue(value: string): boolean {
  return value === undefined || value === null || String(value).trim() === '';
}

/** 功能:select 占位 option 判定(文本含"请选择/----"或值为空的首项;值 '0' 且文本像占位也算占位)。 */
export function isPlaceholderOption(optionValue: string, optionText: string): boolean {
  const text = optionText || '';
  if (/请选择|----|请选取|请下拉选择/.test(text)) return true;
  return isEmptyValue(optionValue);
}

/** 功能:身份证末位 X 大小写归一(其余字符不动)。 */
export function normalizeIdCard(s: string): string {
  const t = s.trim();
  return t.length === 18 && /^\d{17}[xX]$/.test(t) ? `${t.slice(0, 17)}${t[17].toUpperCase()}` : t;
}

const MONTH_DAY_CN = /(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2})?日?)?/;

/** 功能:把宽容日期文本拆成 y/m/d(拆不出返回 null)。 */
export function parseDateParts(s: string): { y: number; m: number; d: number } | null {
  const m = MONTH_DAY_CN.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  const d = m[3] === undefined ? 1 : Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mm) || !Number.isFinite(d)) return null;
  return { y, m: mm, d };
}

/** 功能:按精度比较两个文本值是否语义相等。precision=text 时退化为 trim 比较。 */
export function isSemanticEqual(precision: ComparePrecision, a: string, b: string): boolean {
  const A = String(a ?? '');
  const B = String(b ?? '');
  if (precision === 'text') return A.trim() === B.trim();
  const pa = parseDateParts(A);
  const pb = parseDateParts(B);
  if (!pa || !pb) return false; // 有一侧无法解析时不做日期等价(宁可不判等,防止格式误读)
  if (pa.y !== pb.y) return false;
  if (precision === 'year') return true;
  if (pa.m !== pb.m) return false;
  if (precision === 'month') return true;
  return pa.d === pb.d;
}

/**
 * 功能:普通文本语义比较(带按字段的特化规则)。
 * field 特化:idCard 末位 X;email 不做大小写归一;其余 trim 比较。
 */
export function isTextFieldEqual(field: string, current: string, target: string): boolean {
  const cur = String(current ?? '');
  const tgt = String(target ?? '');
  if (field === 'basic.idCard') return normalizeIdCard(cur) === normalizeIdCard(tgt);
  if (field === 'basic.email' || field.endsWith('.email')) return cur.trim() === tgt.trim();
  return cur.trim() === tgt.trim();
}

/** 功能:比较规则类别判定(文本/日期;日期需按字段取精度)。 */
export function compareKindForField(field: string): { kind: 'text' | 'date'; precision?: ComparePrecision } {
  if (field === 'basic.birthday') return { kind: 'date', precision: 'day' };
  if (/startDate|endDate$/.test(field)) return { kind: 'date', precision: 'month' };
  return { kind: 'text' };
}
