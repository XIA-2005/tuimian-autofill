// 声明式适配包控件驱动。适配包只能描述字段，实际 DOM 操作固定由本模块实现。

import { AdapterFieldContract, SchoolAdapterPackage } from './adapters';
import { resolveAdapterPage } from './adapter-packages';
import { Profile, getByPath, getProfileCode } from './profile';
import { fillDateControl } from './date-drivers';
import { resolveCodeNameBinding, verifyCodeNameBinding } from './popup-binding';
import { PopupPickContext } from './popup-binding';
import { syncNativeComponentSelect } from './component-select-drivers';
import { verifyBlueFlatContext } from './blue-flat-picker-driver';
import { withUnlocked } from './unlock';
import { VALUE_ALIASES, captureBeforeValue, radioGroupOf, registerWriteOwnership, readNativeControlValue } from './filler';
import { compareKindForField, isEmptyValue, isPlaceholderOption, isSemanticEqual, isTextFieldEqual } from './value-semantics';
import { blockedDependents, buildDepOrder } from './dependency';

export interface ContractFillItem {
  /** 同值只读确认，可用于放行依赖；不把普通 skipped 当作成功。 */
  alreadyCorrect?: boolean;
  /** 异步依赖的执行结论，仅保存在当前文档内。 */
  dependencyState?: 'verified' | 'blocked' | 'cancelled' | 'failed' | 'waiting';
  profilePath: string;
  status: 'filled' | 'skipped' | 'failed';
  reason: string;
  el?: Element;
  valuePreview?: string;
  pickerContext?: PopupPickContext;
  /** G01:歧义/阻塞时的候选节点集合(整链禁止写集合;通用链不得绕过)。 */
  ambiguousNodes?: Element[];
  /** G03:本轮期望写入值(合同结果必须带,供稳定验证比较;无此值不得报告成功)。 */
  expectedValue?: string;
}

function emitChange(el: Element): void {
  const win = el.ownerDocument.defaultView;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  if (win) el.dispatchEvent(new win.Event('blur', { bubbles: true }));
}

function escapeCssIdent(value: string): string {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (ch) => `\${ch}`);
}

interface ControlResolution {
  ok: boolean;
  el?: HTMLElement;
  reason: string;
  /** G01:歧义时的全部候选节点(进入整链禁止写集合)。 */
  candidates?: HTMLElement[];
}

/**
 * 功能:F01 严格控件解析(取代旧 findControl 的"首个命中即用")。
 * 规则:nativeId 唯一命中为最高证据(重复 id → 歧义,拒绝猜测);
 * selectors 为"有序回退":前一表达式无命中才试下一个,单表达式命中多个逻辑目标即歧义,不得用下一个表达式掩盖;
 * label 回退仅当全文档同义标签唯一;radio 组按组折叠为一个逻辑目标。
 */
export function resolveContractControl(doc: Document, contract: AdapterFieldContract): ControlResolution {
  if (contract.nativeId) {
    let hits: Element[];
    try {
      hits = Array.from(doc.querySelectorAll(`#${escapeCssIdent(contract.nativeId)}`));
    } catch {
      hits = [];
    }
    if (hits.length === 1) return { ok: true, el: hits[0] as HTMLElement, reason: 'nativeId 唯一命中' };
    if (hits.length > 1) return { ok: false, reason: '控件歧义:重复的 nativeId,拒绝猜测', candidates: hits as HTMLElement[] };
    const byName = Array.from(doc.getElementsByName(contract.nativeId)) as HTMLElement[];
    if (byName.length === 1) return { ok: true, el: byName[0], reason: 'nativeId 经 name 唯一命中' };
    if (byName.length > 1) return { ok: false, reason: '控件歧义:name 匹配多个候选,拒绝猜测', candidates: byName };
    // nativeId 无命中:继续 selectors 回退链(漂移容错)。
  }
  for (const selector of contract.selectors || []) {
    let hits: Element[];
    try {
      hits = Array.from(doc.querySelectorAll(selector));
    } catch {
      continue; // 无效选择器按无命中处理,继续回退表达式
    }
    if (!hits.length) continue;
    if (contract.driver === 'radio') {
      // radio 同 name 成组折叠为一个逻辑目标;组数>1 才歧义。
      // H01:组身份 = name + 所属 form;无 name 的 radio 各自独立(不得合成同一组)。
      const groups = new Map<string, Map<HTMLFormElement | null, Element>>();
      const nonRadio = hits.filter((el) => el.tagName !== 'INPUT' || (el.getAttribute('type') || 'text').toLowerCase() !== 'radio');
      for (const el of hits) {
        if (el.tagName === 'INPUT' && (el.getAttribute('type') || 'text').toLowerCase() === 'radio') {
          const name = el.getAttribute('name') || '';
          if (!name) { nonRadio.push(el); continue; }
          const form = (el as HTMLInputElement).form || null;
          let byForm = groups.get(name);
          if (!byForm) { byForm = new Map(); groups.set(name, byForm); }
          if (!byForm.has(form)) byForm.set(form, el);
        }
      }
      const logical = [...nonRadio, ...Array.from(groups.values()).flatMap((byForm) => Array.from(byForm.values()))];
      if (logical.length === 1) return { ok: true, el: logical[0] as HTMLElement, reason: 'selector 唯一(radio 组合法成组)' };
      if (logical.length > 1) return { ok: false, reason: `控件歧义:${selector} 命中多个逻辑目标,拒绝猜测`, candidates: logical as HTMLElement[] };
      continue;
    }
    if (hits.length === 1) return { ok: true, el: hits[0] as HTMLElement, reason: `selector 唯一命中:${selector}` };
    return { ok: false, reason: `控件歧义:${selector} 命中 ${hits.length} 个候选,拒绝猜测`, candidates: hits as HTMLElement[] };
  }
  // 标签回退:同义标签必须全文档唯一;带 for 关联的以 for 目标为准。
  for (const wantedLabel of contract.labels || []) {
    const wanted = normalized(wantedLabel);
    const labels = Array.from(doc.querySelectorAll<HTMLElement>('label,th,td,.form-label,.layui-form-label,.el-form-item__label,.ant-form-item-label')).filter((label) => normalized(label.textContent || '') === wanted);
    if (!labels.length) continue;
    if (labels.length > 1) return { ok: false, reason: '控件歧义:同义标签出现多次,拒绝猜测', candidates: labels as HTMLElement[] };
    const label = labels[0];
    const forId = label.getAttribute('for');
    if (forId) {
      // H01:label[for] 必须收集全部同 id 目标——重复 id 时不得取首(全文档同 id 可能多个)。
      let linked: Element[] = [];
      try {
        linked = Array.from(doc.querySelectorAll(`#${escapeCssIdent(forId)}`));
      } catch {
        linked = [];
      }
      if (linked.length === 1) return { ok: true, el: linked[0] as HTMLElement, reason: 'label[for] 唯一命中' };
      if (linked.length > 1) return { ok: false, reason: '控件歧义:label[for] 命中重复 id,拒绝猜测', candidates: linked as HTMLElement[] };
    }
    const scope = label.closest('tr,.form-item,.layui-form-item,.el-form-item,.ant-form-item') || label.parentElement;
    // H01:标签容器内有多个控件时不得 querySelector 取首,必须整体判歧义。
    const scoped = scope ? (Array.from(scope.querySelectorAll('select,input,textarea,.ant-select,.el-select,.select2-container,.layui-form-select')) as HTMLElement[]) : [];
    if (scoped.length === 1) return { ok: true, el: scoped[0], reason: '标签作用域内唯一命中' };
    if (scoped.length > 1) return { ok: false, reason: '控件歧义:标签容器内多个控件,拒绝猜测', candidates: scoped };
  }
  return { ok: false, reason: '页面契约控件不存在' };
}

function normalized(value: string): string {
  return value.replace(/^\s*\d+[|\s-]*/, '').replace(/\s+/g, '').toLowerCase();
}

function fillSelect(select: HTMLSelectElement, label: string, code: string): { ok: boolean; reason: string } {
  const options = Array.from(select.options);
  const byCode = code ? options.find((option) => option.value === code) : undefined;
  const byName = options.find((option) => normalized(option.textContent || '') === normalized(label));
  const option = byCode || byName;
  if (!option) return { ok: false, reason: '页面选项中没有对应代码或名称' };
  if (byCode && label && normalized(byCode.textContent || '') !== normalized(label)) return { ok: false, reason: '目标系统代码与档案显示名称不一致' };
  // 写前临时解锁：禁用下拉的选中值会被表单序列化忽略，造成"回读通过、保存丢失"
  if (select.ownerDocument) captureBeforeValue(select.ownerDocument, select);
  withUnlocked(select, () => {
    select.value = option.value;
    emitChange(select);
  });
  const selected = select.selectedOptions[0];
  if (!selected || selected.value !== option.value || (label && normalized(selected.textContent || '') !== normalized(label))) return { ok: false, reason: '写入后代码/名称回读不一致' };
  // G02:合同 select 写入登记所有权(清除依赖记录,不依赖 UI 标记)。
  if (select.ownerDocument) registerWriteOwnership(select.ownerDocument, select, option.value, 'native-select');
  return { ok: true, reason: '代码和显示名称回读一致' };
}

function fillText(control: HTMLInputElement | HTMLTextAreaElement, value: string): { ok: boolean; reason: string } {
  const type = control.tagName === 'INPUT' ? (control as HTMLInputElement).type.toLowerCase() : '';
  if (['password', 'file', 'hidden', 'submit', 'button'].includes(type) || /captcha|verify|验证码/i.test(`${control.id} ${control.getAttribute('name') || ''}`)) return { ok: false, reason: '秘密、文件、隐藏或验证码控件禁止写入' };
  if (control.ownerDocument) captureBeforeValue(control.ownerDocument, control);
  withUnlocked(control, () => {
    control.value = value;
    emitChange(control);
  });
  // G02/F06:回读用真实 DOM 值(受控框架实例级 value 不可信),成功后登记所有权。
  if (readNativeControlValue(control) !== value) return { ok: false, reason: '写入后可见值回读不一致' };
  if (control.ownerDocument) registerWriteOwnership(control.ownerDocument, control, value, 'text');
  return { ok: true, reason: '可见值回读一致' };
}

function fillRadioGroup(control: HTMLInputElement, value: string, code: string): { ok: boolean; reason: string } {
  // G01/G02:radio 组按 name+所属表单限定(同 name 跨 form 不串组)。
  const radios = radioGroupOf(control);
  const target = radios.find((radio) => {
    if (code && radio.value === code) return true;
    const label = radio.labels?.[0]?.textContent || radio.closest('label')?.textContent || radio.nextElementSibling?.textContent || '';
    return normalized(label) === normalized(value) || normalized(radio.value) === normalized(value);
  });
  if (!target) return { ok: false, reason: '单选组没有对应代码或名称' };
  if (target.ownerDocument) captureBeforeValue(target.ownerDocument, target);
  withUnlocked(target, () => {
    target.checked = true;
    emitChange(target);
  });
  if (!target.checked) return { ok: false, reason: '单选模型回读不一致' };
  if (target.ownerDocument) registerWriteOwnership(target.ownerDocument, target, value, 'radio');
  return { ok: true, reason: '单选模型回读一致' };
}

/**
 * 功能:F02 合同写入前统一已有值语义(标量驱动:text/radio/native-select/date/month)。
 * empty→继续写入;equal→跳过(零事件);different→跳过并保留页面原值(零事件);
 * 其它(复杂/弹窗/组件)返回 unknown,维持既有驱动路径。
 */
function guardExistingScalar(doc: Document, contract: AdapterFieldContract, control: Element, target: string, code: string): 'empty' | 'equal' | 'different' | 'unknown' {
  const field = contract.profilePath || '';
  const tag = control.tagName;
  const inputType = tag === 'INPUT' ? ((control as HTMLInputElement).type || 'text').toLowerCase() : '';
  // G02:门禁按"控件类型 + 字段语义"判定,不因 driver 名(school-picker 等)而绕过。
  if (tag === 'SELECT') {
    const sel = control as HTMLSelectElement;
    const opt = sel.selectedOptions[0];
    if (!opt || isPlaceholderOption(opt.value, opt.text || '')) return 'empty';
    // H01:首项同样是合法值——不得用"无 selected 属性且停在首项"推断为空(用户点选首项不写 selected 属性)。
    const candidates = [opt.text.trim(), opt.value.trim()];
    const aliases = VALUE_ALIASES[target] || [];
    if (candidates.includes(target.trim()) || aliases.some((a) => candidates.includes(a))) return 'equal';
    // 代码型选择:档案代码与选中值相同也算同值(代码/名称角色由 G07a 进一步验收)。
    if (code && opt.value.trim() === code.trim()) return 'equal';
    return 'different';
  }
  if (tag === 'INPUT' && inputType === 'radio') {
    const radios = radioGroupOf(control as HTMLInputElement);
    const checked = radios.find((r) => r.checked);
    if (!checked) return 'empty';
    const label = (checked.labels?.[0]?.textContent || checked.closest('label')?.textContent || '').replace(/\s+/g, '');
    const candidates = [label, checked.value].map((x) => String(x).replace(/\s+/g, ''));
    const aliases = VALUE_ALIASES[target] || [];
    const targetN = String(target).replace(/\s+/g, '');
    if (candidates.includes(targetN) || aliases.some((a) => candidates.includes(a))) return 'equal';
    if (code && checked.value === code) return 'equal';
    return 'different';
  }
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    const input = control as HTMLInputElement;
    if (['hidden', 'password', 'file', 'submit', 'button', 'checkbox'].includes(inputType)) return 'unknown';
    // 组件下拉值载体/触发本体由组件驱动处理,不做标量门禁。
    if (input.getAttribute('data-tui-widget') || input.getAttribute('data-tui-picker-profile')) return 'unknown';
    const current = input.value;
    if (isEmptyValue(current)) return 'empty';
    const kind = compareKindForField(field);
    if (kind.kind === 'date' || contract.driver === 'date' || contract.driver === 'month-picker' || contract.driver === 'date-range') {
      const precision = contract.datePrecision || kind.precision;
      if (precision) return isSemanticEqual(precision, current, target) ? 'equal' : 'different';
      return 'unknown';
    }
    return isTextFieldEqual(field, current, target) ? 'equal' : 'different';
  }
  return 'unknown';
}

/** 填写当前页面已声明的字段；绝不点击保存、下一步、上传或提交按钮。 */
export function fillAdapterContract(profile: Profile, doc: Document, url: string, adapter?: SchoolAdapterPackage): ContractFillItem[] {
  if (!adapter) return [];
  // F01:生产合同页解析消费同一 resolver;同等级多页歧义 → 整页合同拒绝(由通用链保持既有填写),不静默取首。
  const pageRes = resolveAdapterPage(adapter, doc, url);
  if (pageRes.ambiguous || !pageRes.winner) return [];
  const page = pageRes.winner.page;
  if (!page.fields?.length) return [];
  const results: ContractFillItem[] = [];
  // F08b:按声明式依赖排序执行;父字段失败只阻塞其依赖者,独立字段照常。
  const depNodes = page.fields
    .filter((f) => !!f.profilePath && !f.readonly && f.driver !== 'table')
    .map((f) => ({ id: f.profilePath as string, dependsOn: (f.dependsOn || []).slice() }));
  const depOrder = buildDepOrder(depNodes);
  const orderedFields = depOrder.cycle
    ? page.fields // 环:契约校验本应拒绝,兜底保持原顺序(不阻断整页)
    : [...page.fields].sort((a, b) => depOrder.order.indexOf(a.profilePath || '') - depOrder.order.indexOf(b.profilePath || ''));
  const blockedPaths = new Set<string>();
  /** 功能:父字段失败时把其依赖者加入阻塞集合(所有失败分支统一调用)。 */
  const markBlocked = (path: string): void => {
    for (const blocked of blockedDependents(depNodes, path)) blockedPaths.add(blocked);
  };
  for (const contract of orderedFields) {
    if (!contract.profilePath || contract.readonly || contract.driver === 'table') continue;
    if (blockedPaths.has(contract.profilePath)) {
      results.push({ profilePath: contract.profilePath, status: 'skipped', reason: '依赖字段未成功填写,已跳过(不阻塞其它独立字段)' });
      continue;
    }
    const value = String(getByPath(profile, contract.profilePath) || '').trim();
    if (!value) { results.push({ profilePath: contract.profilePath, status: 'skipped', reason: '档案为空' }); markBlocked(contract.profilePath); continue; }
    const resolved = resolveContractControl(doc, contract);
    if (!resolved.ok || !resolved.el) {
      results.push({
        profilePath: contract.profilePath,
        status: 'failed',
        reason: resolved.reason,
        ambiguousNodes: resolved.candidates?.length ? resolved.candidates : undefined,
      });
      markBlocked(contract.profilePath);
      continue;
    }
    let control: HTMLElement | null = resolved.el;
    if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(control.tagName) && ['layui', 'ant', 'select2', 'element', 'kendo', 'school-picker', 'major-picker'].includes(contract.driver)) {
      control = control.querySelector('select,input,textarea') as HTMLElement | null;
      if (!control) { results.push({ profilePath: contract.profilePath, status: 'failed', reason: `${contract.driver} 容器没有可回读的内部模型` }); markBlocked(contract.profilePath); continue; }
    }
    if (!control) { results.push({ profilePath: contract.profilePath, status: 'failed', reason: '控件解析为空' }); markBlocked(contract.profilePath); continue; }
    let outcome: { ok: boolean; reason: string };
    const namespaces = [contract.codeNamespace, ...(adapter.codeNamespaces || [])].filter((item): item is string => !!item);
    const code = getProfileCode(profile, contract.profilePath, namespaces);
    // F02:标量驱动写前统一已有值语义(empty 才写;equal/different 零事件跳过并保留页面值)。
    {
      const verdict = guardExistingScalar(doc, contract, control, value, code);
      if (verdict === 'equal') {
        results.push({ profilePath: contract.profilePath, status: 'skipped', reason: '页面已有相同值,跳过写入', el: control, alreadyCorrect: true });
        continue;
      }
      if (verdict === 'different') {
        // G07a:父字段冲突 → 阻塞其依赖者(独立字段照常)。
        results.push({ profilePath: contract.profilePath, status: 'skipped', reason: '页面已有不同值,已保留(未覆盖)', el: control });
        markBlocked(contract.profilePath);
        continue;
      }
    }
    if ((contract.driver === 'school-picker' || contract.driver === 'major-picker') && control.tagName === 'SELECT') {
      outcome = fillSelect(control as HTMLSelectElement, value, code);
      if (outcome.ok) syncNativeComponentSelect(control as HTMLSelectElement, contract.componentDriver);
    } else if (contract.driver === 'school-picker' || contract.driver === 'major-picker') {
      const binding = resolveCodeNameBinding(doc, control, {
        profilePath: contract.profilePath,
        expectedCode: code,
        codeSelectors: contract.codeSelectors,
        nameSelectors: contract.nameSelectors,
      });
      const pickContext: PopupPickContext = {
        profilePath: contract.profilePath,
        expectedCode: code || undefined,
        codeSelectors: contract.codeSelectors,
        nameSelectors: contract.nameSelectors,
        displaySelectors: contract.displaySelectors,
        pickerProtocol: contract.picker?.protocol,
        cascadeLabels: contract.profilePath === 'education.university' && profile.education.province ? [profile.education.province] : undefined,
      };
      const complete = contract.picker?.protocol === 'blue-flat'
        ? verifyBlueFlatContext(doc, value, pickContext)
        : !!binding && verifyCodeNameBinding(binding, value, { profilePath: contract.profilePath, expectedCode: code });
      if (complete) {
        outcome = { ok: true, reason: '弹窗代码和名称已成对回读一致' };
      } else {
        // 弹窗点击由异步填充阶段完成；这里绝不把名称直接写进代码型/受控组件。
        control.setAttribute('data-tui-picker-profile', contract.profilePath);
        if (code) control.setAttribute('data-tui-picker-code', code);
        if (contract.codeSelectors?.length) control.setAttribute('data-tui-picker-code-selectors', JSON.stringify(contract.codeSelectors));
        if (contract.nameSelectors?.length) control.setAttribute('data-tui-picker-name-selectors', JSON.stringify(contract.nameSelectors));
        if (contract.displaySelectors?.length) control.setAttribute('data-tui-picker-display-selectors', JSON.stringify(contract.displaySelectors));
        if (contract.picker?.protocol) control.setAttribute('data-tui-picker-protocol', contract.picker.protocol);
        if (contract.profilePath === 'education.university' && profile.education.province) control.setAttribute('data-tui-picker-cascade-labels', JSON.stringify([profile.education.province]));
        if (contract.picker?.triggerSelectors?.length) control.setAttribute('data-tui-picker-trigger-selectors', JSON.stringify(contract.picker.triggerSelectors));
        if (contract.picker?.frameNames?.length) control.setAttribute('data-tui-picker-frame-names', JSON.stringify(contract.picker.frameNames));
        if (contract.picker?.frameSrcPatterns?.length) control.setAttribute('data-tui-picker-frame-patterns', JSON.stringify(contract.picker.frameSrcPatterns));
        if (contract.componentDriver) control.setAttribute('data-tui-component-driver', contract.componentDriver);
        markBlocked(contract.profilePath); // G07a:picker pending 直到完成验证才释放依赖
        results.push({
          profilePath: contract.profilePath,
          status: 'skipped',
          reason: '等待学校/专业弹窗驱动成对选择',
          el: control,
          valuePreview: value,
          pickerContext: {
            profilePath: contract.profilePath,
            expectedCode: code || undefined,
            codeSelectors: contract.codeSelectors,
            nameSelectors: contract.nameSelectors,
            displaySelectors: contract.displaySelectors,
            pickerProtocol: contract.picker?.protocol,
            cascadeLabels: contract.profilePath === 'education.university' && profile.education.province ? [profile.education.province] : undefined,
            componentDriver: contract.componentDriver,
            triggerSelectors: contract.picker?.triggerSelectors,
            frameNames: contract.picker?.frameNames,
            frameSrcPatterns: contract.picker?.frameSrcPatterns,
          },
        });
        continue;
      }
    } else if ((contract.driver === 'date' || contract.driver === 'month-picker') && control.tagName === 'INPUT') {
      if (contract.datePrecision) control.setAttribute('data-tui-date-precision', contract.datePrecision);
      if (contract.dateFormat) control.setAttribute('data-tui-date-format', contract.dateFormat);
      if (contract.dateModelSelectors?.length) control.setAttribute('data-tui-date-model-selectors', JSON.stringify(contract.dateModelSelectors));
      if (contract.datePanelSelectors?.length) control.setAttribute('data-tui-date-panel-selectors', JSON.stringify(contract.datePanelSelectors));
      const result = fillDateControl(control as HTMLInputElement, value, { precision: contract.datePrecision, format: contract.dateFormat });
      outcome = { ok: result.ok, reason: result.reason };
    } else if (control.tagName === 'SELECT') {
      outcome = fillSelect(control as HTMLSelectElement, value, code);
      const componentKind = contract.componentDriver || (['layui', 'ant', 'select2', 'element'].includes(contract.driver) ? contract.driver as 'layui' | 'ant' | 'select2' | 'element' : undefined);
      if (outcome.ok && componentKind) syncNativeComponentSelect(control as HTMLSelectElement, componentKind);
    } else if (contract.driver === 'radio' && control.tagName === 'INPUT') {
      outcome = fillRadioGroup(control as HTMLInputElement, value, code);
    } else if (control.tagName === 'INPUT' || control.tagName === 'TEXTAREA') {
      // 有代码命名空间的组件必须通过真实选项或弹窗选择，禁止只改可见文本造成隐藏代码仍为空。
      if (contract.codeNamespace && ['layui', 'ant', 'select2', 'element', 'kendo', 'aspnet'].includes(contract.driver)) {
        const componentDriver = contract.componentDriver || (['layui', 'ant', 'select2', 'element'].includes(contract.driver) ? contract.driver as 'layui' | 'ant' | 'select2' | 'element' : undefined);
        if (componentDriver) control.setAttribute('data-tui-component-driver', componentDriver);
        markBlocked(contract.profilePath); // G07a:组件等待同样阻塞依赖者
        results.push({
          profilePath: contract.profilePath,
          status: 'skipped',
          reason: `${contract.driver} 代码型组件等待专用选项驱动，未直接注入文本`,
          el: control,
          valuePreview: value,
          pickerContext: { profilePath: contract.profilePath, expectedCode: code || undefined, componentDriver },
        });
        continue;
      }
      outcome = fillText(control as HTMLInputElement | HTMLTextAreaElement, value);
    } else {
      outcome = { ok: false, reason: `${contract.driver} 控件没有可回读的输入模型` };
    }
    if (outcome.ok) control.classList.add('tui-filled');
    // P03:成功/失败结果补齐 el,供"合同已认领目标"登记与结果合并(跨消息仍不得发送 el)。
    // 驱动已验证代码/名称或日期格式；后续原生回读必须使用同一 DOM 表示，不能拿代码与名称比较。
    const resultControl = contract.driver === 'radio' && control.tagName === 'INPUT'
      ? radioGroupOf(control as HTMLInputElement).find((radio) => radio.checked) || control
      : control;
    results.push({ profilePath: contract.profilePath, status: outcome.ok ? 'filled' : 'failed', reason: outcome.reason, el: resultControl, expectedValue: outcome.ok ? readNativeControlValue(resultControl) : undefined });
    if (!outcome.ok) markBlocked(contract.profilePath);
  }
  return results;
}
