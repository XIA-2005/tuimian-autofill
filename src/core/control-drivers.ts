// 声明式适配包控件驱动。适配包只能描述字段，实际 DOM 操作固定由本模块实现。

import { AdapterFieldContract, SchoolAdapterPackage } from './adapters';
import { matchAdapterPage } from './adapter-packages';
import { Profile, getByPath, getProfileCode } from './profile';
import { fillDateControl } from './date-drivers';
import { resolveCodeNameBinding, verifyCodeNameBinding } from './popup-binding';
import { PopupPickContext } from './popup-binding';
import { syncNativeComponentSelect } from './component-select-drivers';
import { verifyBlueFlatContext } from './blue-flat-picker-driver';
import { withUnlocked } from './unlock';

export interface ContractFillItem {
  profilePath: string;
  status: 'filled' | 'skipped' | 'failed';
  reason: string;
  el?: Element;
  valuePreview?: string;
  pickerContext?: PopupPickContext;
}

function emitChange(el: Element): void {
  const win = el.ownerDocument.defaultView;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  if (win) el.dispatchEvent(new win.Event('blur', { bubbles: true }));
}

function findControl(doc: Document, contract: AdapterFieldContract): HTMLElement | null {
  if (contract.nativeId) {
    const byId = doc.getElementById(contract.nativeId);
    if (byId) return byId;
    const byName = doc.getElementsByName(contract.nativeId)[0] as HTMLElement | undefined;
    if (byName) return byName;
  }
  for (const selector of contract.selectors || []) {
    try {
      const found = doc.querySelector(selector) as HTMLElement | null;
      if (found) return found;
    } catch { /* 无效选择器由契约校验后的运行时保护兜底 */ }
  }
  for (const wantedLabel of contract.labels || []) {
    const wanted = normalized(wantedLabel);
    for (const label of Array.from(doc.querySelectorAll<HTMLElement>('label,th,td,.form-label,.layui-form-label,.el-form-item__label,.ant-form-item-label'))) {
      if (normalized(label.textContent || '') !== wanted) continue;
      const forId = label.getAttribute('for');
      if (forId) {
        const linked = doc.getElementById(forId);
        if (linked) return linked;
      }
      const scope = label.closest('tr,.form-item,.layui-form-item,.el-form-item,.ant-form-item') || label.parentElement;
      const linked = scope?.querySelector('select,input,textarea,.ant-select,.el-select,.select2-container,.layui-form-select') as HTMLElement | null;
      if (linked) return linked;
    }
  }
  return null;
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
  withUnlocked(select, () => {
    select.value = option.value;
    emitChange(select);
  });
  const selected = select.selectedOptions[0];
  if (!selected || selected.value !== option.value || (label && normalized(selected.textContent || '') !== normalized(label))) return { ok: false, reason: '写入后代码/名称回读不一致' };
  return { ok: true, reason: '代码和显示名称回读一致' };
}

function fillText(control: HTMLInputElement | HTMLTextAreaElement, value: string): { ok: boolean; reason: string } {
  const type = control.tagName === 'INPUT' ? (control as HTMLInputElement).type.toLowerCase() : '';
  if (['password', 'file', 'hidden', 'submit', 'button'].includes(type) || /captcha|verify|验证码/i.test(`${control.id} ${control.getAttribute('name') || ''}`)) return { ok: false, reason: '秘密、文件、隐藏或验证码控件禁止写入' };
  withUnlocked(control, () => {
    control.value = value;
    emitChange(control);
  });
  return control.value === value ? { ok: true, reason: '可见值回读一致' } : { ok: false, reason: '写入后可见值回读不一致' };
}

function fillRadioGroup(control: HTMLInputElement, value: string, code: string): { ok: boolean; reason: string } {
  const doc = control.ownerDocument;
  const name = control.name;
  const radios = Array.from(name ? doc.getElementsByName(name) : doc.querySelectorAll(`input[type="radio"][id^="${control.id}"]`)).filter((item): item is HTMLInputElement => item.tagName === 'INPUT' && (item as HTMLInputElement).type === 'radio');
  const target = radios.find((radio) => {
    if (code && radio.value === code) return true;
    const label = radio.labels?.[0]?.textContent || radio.closest('label')?.textContent || radio.nextElementSibling?.textContent || '';
    return normalized(label) === normalized(value) || normalized(radio.value) === normalized(value);
  });
  if (!target) return { ok: false, reason: '单选组没有对应代码或名称' };
  withUnlocked(target, () => {
    target.checked = true;
    emitChange(target);
  });
  return target.checked ? { ok: true, reason: '单选模型回读一致' } : { ok: false, reason: '单选模型回读不一致' };
}

/** 填写当前页面已声明的字段；绝不点击保存、下一步、上传或提交按钮。 */
export function fillAdapterContract(profile: Profile, doc: Document, url: string, adapter?: SchoolAdapterPackage): ContractFillItem[] {
  if (!adapter) return [];
  const page = matchAdapterPage(adapter, doc, url);
  if (!page.allowed || !page.page?.fields?.length) return [];
  const results: ContractFillItem[] = [];
  for (const contract of page.page.fields) {
    if (!contract.profilePath || contract.readonly || contract.driver === 'table') continue;
    const value = String(getByPath(profile, contract.profilePath) || '').trim();
    if (!value) { results.push({ profilePath: contract.profilePath, status: 'skipped', reason: '档案为空' }); continue; }
    let control = findControl(doc, contract);
    if (!control) { results.push({ profilePath: contract.profilePath, status: 'failed', reason: '页面契约控件不存在' }); continue; }
    if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(control.tagName) && ['layui', 'ant', 'select2', 'element', 'kendo', 'school-picker', 'major-picker'].includes(contract.driver)) {
      control = control.querySelector('select,input,textarea') as HTMLElement | null;
      if (!control) { results.push({ profilePath: contract.profilePath, status: 'failed', reason: `${contract.driver} 容器没有可回读的内部模型` }); continue; }
    }
    let outcome: { ok: boolean; reason: string };
    const namespaces = [contract.codeNamespace, ...(adapter.codeNamespaces || [])].filter((item): item is string => !!item);
    const code = getProfileCode(profile, contract.profilePath, namespaces);
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
    results.push({ profilePath: contract.profilePath, status: outcome.ok ? 'filled' : 'failed', reason: outcome.reason });
  }
  return results;
}
