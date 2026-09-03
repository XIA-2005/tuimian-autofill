// 弹窗字段绑定：把当前“名称显示框”精确关联到同一语义字段的代码框，防止学校、专业、地区互相串写。

export interface PopupPickContext {
  /** 档案字段路径，用来区分本科院校、本科专业、地区和报考志愿。 */
  profilePath?: string;
  /** 档案代码簿中的目标系统代码或国家标准代码。 */
  expectedCode?: string;
  /** 兼容新旧专业目录代码；任意一个匹配即可。 */
  codeAliases?: string[];
  /** 适配包显式声明的代码框选择器，优先级最高。 */
  codeSelectors?: string[];
  /** 适配包显式声明的名称框选择器，优先级最高。 */
  nameSelectors?: string[];
  /** 只负责给用户展示“代码 名称”的显示框；蓝色系统保存时不能只写此框。 */
  displaySelectors?: string[];
  /** 弹窗协议。blue-flat 表示代码、名称、展示值三联字段。 */
  pickerProtocol?: 'minimal' | 'blue-flat';
  /** 级联选择器的上级显示名称，例如本科院校所在省份。 */
  cascadeLabels?: string[];
  /** 强制使用某一前端选择组件驱动。 */
  componentDriver?: 'ant' | 'select2' | 'element' | 'layui';
  /** 学校适配包声明的安全触发器与同源选择器 iframe。 */
  triggerSelectors?: string[];
  frameNames?: string[];
  frameSrcPatterns?: string[];
  /**
   * 断点续填（修复）：从 sessionStorage.tui-fill-snapshot 恢复的上次 value。
   * 用于人工/自动点选时参考，比如"用户上次想填北京大学"——刷新页面后识别器用它做模糊匹配提示。
   */
  priorValue?: string;
}

export interface CodeNameBinding {
  code: HTMLInputElement;
  name: HTMLInputElement;
  source: 'explicit' | 'same-stem' | 'scored';
}

type SemanticKind = 'school' | 'major' | 'region' | 'other';

/** 控件标识归一化后去掉代码/名称/显示框后缀，用于识别 `txtBkbydwm` 与 `txtBkbydwmc` 这类配对。 */
function fieldStem(el: Element): string {
  const token = el.getAttribute('name') || (el as HTMLElement).id || '';
  return token
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]/g, '')
    .replace(/(show|display|text|txt|value)$/g, '')
    .replace(/(dwmc|zymc|xxmc|yxmc|mc|name)$/g, '')
    .replace(/(zydm|xxdm|yxdm|dwdm|dwm|dm|bm|code|id)$/g, '');
}

function semanticText(el: Element, context?: PopupPickContext): string {
  const parent = el.closest('td,th,.form-item,.layui-form-item,.el-form-item,.ant-form-item,label,div');
  return `${context?.profilePath || ''} ${el.getAttribute('name') || ''} ${(el as HTMLElement).id || ''} ${el.getAttribute('data-label') || ''} ${parent?.textContent || ''}`.toLowerCase();
}

function semanticKind(el: Element, context?: PopupPickContext): SemanticKind {
  const text = semanticText(el, context);
  if (/education\.university|本科.{0,4}(学校|院校)|毕业(学校|院校)|bkby(dw|xx)|university|school/.test(text)) return 'school';
  if (/education\.major|本科.{0,4}专业|所学专业|bkzy|major|specialty|zydm/.test(text)) return 'major';
  if (/birthplace|hometown|hukou|籍贯|出生地|户口|地区|region|area/.test(text)) return 'region';
  return 'other';
}

function kindCompatible(el: Element, kind: SemanticKind): boolean {
  if (kind === 'other') return true;
  const text = `${el.getAttribute('name') || ''} ${(el as HTMLElement).id || ''}`.toLowerCase();
  if (kind === 'school') return !/(zydm|zymc|major|specialty|region|area|jgdm|hkdm)/.test(text);
  if (kind === 'major') return !/(dwdm|dwmc|xxdm|xxmc|school|university|region|area|jgdm|hkdm)/.test(text);
  return !/(zydm|zymc|major|school|university|dwdm|dwmc)/.test(text);
}

function firstSelector(doc: Document, selectors: string[] | undefined): HTMLInputElement | null {
  for (const selector of selectors || []) {
    try {
      const el = doc.querySelector(selector);
      if (el instanceof doc.defaultView!.HTMLInputElement) return el;
    } catch {
      // 远程声明式规则已经过 Schema 校验；运行时仍防御无效选择器。
    }
  }
  return null;
}

function commonContainerScore(a: Element, b: Element, anchor: Element): number {
  // 真实页面经常只用无 class 的 div/span 包裹一组“显示框 + 隐藏代码 + 隐藏名称 + 选择按钮”。
  // 先奖励最近的普通父容器，避免同一页面另一组同后缀字段抢到更高分。
  let parent = anchor.parentElement;
  for (let depth = 0; parent && depth < 4; depth++, parent = parent.parentElement) {
    if (parent.contains(a) && parent.contains(b)) return 85 - depth * 12;
  }
  const containers = ['td', 'tr', '.form-item', '.layui-form-item', '.el-form-item', '.ant-form-item', 'fieldset', 'form'];
  let score = 0;
  for (let i = 0; i < containers.length; i++) {
    const ca = anchor.closest(containers[i]);
    if (ca && ca.contains(a) && ca.contains(b)) {
      score = Math.max(score, 45 - i * 5);
      break;
    }
  }
  return score;
}

/**
 * 功能：解析当前弹窗字段对应的“代码 + 名称”输入对。
 * 原理：显式契约优先；否则按同词干、字段语义和最近公共容器评分。不会退化为整个表单的第一个代码框。
 */
export function resolveCodeNameBinding(doc: Document, anchor: Element, context?: PopupPickContext): CodeNameBinding | null {
  const explicitCode = firstSelector(doc, context?.codeSelectors);
  const explicitName = firstSelector(doc, context?.nameSelectors);
  if (explicitCode && explicitName && explicitCode !== explicitName) return { code: explicitCode, name: explicitName, source: 'explicit' };

  const kind = semanticKind(anchor, context);
  const root = anchor.closest('tr,.form-item,.layui-form-item,.el-form-item,.ant-form-item,fieldset,form') || doc.body;
  const inputs = Array.from(root.querySelectorAll<HTMLInputElement>('input')).filter((input) => {
    const type = (input.type || 'text').toLowerCase();
    return !['password', 'file', 'button', 'submit', 'image', 'checkbox', 'radio'].includes(type);
  });
  const codeLike = (input: HTMLInputElement): boolean => {
    const ids = [input.name || '', input.id || ''].filter(Boolean);
    return ids.some((id) => /(dwm|zydm|xxdm|yxdm|dwdm|dm|bm|code|(^|[_$])id)$/i.test(id)) &&
      !ids.some((id) => /(yzbm|postcode|zip|phone|mobile|sjh|tel|email|mail)/i.test(id));
  };
  const nameLike = (input: HTMLInputElement): boolean => {
    if (input === anchor) return true;
    return /(dwmc|zymc|xxmc|yxmc|mc|name|show|display|text)/i.test(`${input.name || ''} ${input.id || ''}`);
  };
  const codes = inputs.filter((input) => codeLike(input) && kindCompatible(input, kind));
  const names = inputs.filter((input) => nameLike(input) && kindCompatible(input, kind));
  // `*dm/*mc`、`*dwm/*dwmc`、`*zydm/*zymc` 是服务端系统最可靠的配对约定。
  // 专用名称框优先于当前 Show 显示框；Show 框常只负责展示，并不参与服务端保存。
  const exactPairs = codes.flatMap((code) =>
    names
      .filter((name) => name !== anchor && /(dwmc|zymc|xxmc|yxmc|mc|name)$/i.test(name.name || name.id || ''))
      .filter((name) => !!fieldStem(code) && fieldStem(code) === fieldStem(name))
      .map((name) => ({ code, name, score: commonContainerScore(code, name, anchor) })),
  ).sort((a, b) => b.score - a.score);
  if (exactPairs[0]) return { code: exactPairs[0].code, name: exactPairs[0].name, source: 'same-stem' };
  let best: { code: HTMLInputElement; name: HTMLInputElement; score: number; sameStem: boolean } | null = null;
  for (const code of codes) {
    for (const name of names) {
      if (code === name) continue;
      const codeStem = fieldStem(code);
      const nameStem = fieldStem(name);
      const anchorStem = fieldStem(anchor);
      const sameStem = !!codeStem && !!nameStem && (codeStem === nameStem || codeStem.startsWith(nameStem) || nameStem.startsWith(codeStem));
      const anchorMatch = !!anchorStem && (codeStem === anchorStem || nameStem === anchorStem || codeStem.startsWith(anchorStem) || nameStem.startsWith(anchorStem));
      let score = commonContainerScore(code, name, anchor);
      if (sameStem) score += 100;
      if (anchorMatch) score += 70;
      if (name === anchor) score += 35;
      if (code.type === 'hidden') score += 8;
      if (!best || score > best.score) best = { code, name, score, sameStem };
    }
  }
  // 低分意味着只能靠“同一表单”猜测，宁可交给人工也不冒险串写代码。
  if (!best || best.score < 65) return null;
  return { code: best.code, name: best.name, source: best.sameStem ? 'same-stem' : 'scored' };
}

function normalizedName(value: string): string {
  return value.replace(/^\s*[a-z0-9-]{2,12}\s*[|｜:：-]?\s*/i, '').replace(/[\s（）()·]/g, '').toLowerCase();
}

/** 功能：同时验证代码和名称，拒绝“只写代码”或“只写可见文本”的伪成功。 */
export function verifyCodeNameBinding(binding: CodeNameBinding, expectedName: string, context?: PopupPickContext): boolean {
  const code = (binding.code.value || '').trim();
  const name = (binding.name.value || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{1,19}$/i.test(code) || !/[\u4e00-\u9fff]{2,}/.test(name)) return false;
  const expectedCodes = [context?.expectedCode || '', ...(context?.codeAliases || [])].filter(Boolean);
  if (expectedCodes.length && !expectedCodes.includes(code)) return false;
  const actualName = normalizedName(name);
  const wantedName = normalizedName(expectedName);
  return !!actualName && !!wantedName && (actualName === wantedName || actualName.includes(wantedName) || wantedName.includes(actualName));
}
