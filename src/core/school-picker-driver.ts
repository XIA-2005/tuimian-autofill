// 本科院校独立驱动内核：组件选择优先，简约系统 SelUniversity 专项流程其次。

import { pickComponentOption } from './component-select-drivers';
import { pickBlueFlatIdentity } from './blue-flat-picker-driver';
import { runMinimalPicker } from './minimal-picker-common';
import { PopupPickContext } from './popup-binding';
import { standardSchoolCode } from './standard-code-catalog';

const SCHOOL_SPEC = {
  triggerSelectors: ['hykSelBkBydw', '#hykSelBkBydw', 'a[id*="SelBkBydw"]', 'a[id*="hykSelBkBydw"]'],
  codeSelectors: ['#txtBkbydwm', '[name="txtBkbydwm"]', '#ctl00_contentParent_txtBkbydwm', '[name="ctl00$contentParent$txtBkbydwm"]'],
  nameSelectors: ['#txtBkbydwmc', '[name="txtBkbydwmc"]', '#ctl00_contentParent_txtBkbydwmc', '[name="ctl00$contentParent$txtBkbydwmc"]'],
  frameNames: ['SelUniversity'],
  frameSrcPattern: /SelUniversity/i,
};

export type SchoolPickStatus = 'picked' | 'opened' | 'failed' | 'not-applicable';

/** 功能：填写本科院校，保证目标学校代码和名称属于同一字段对。 */
export async function pickSchool(doc: Document, anchor: Element, value: string, context: PopupPickContext = {}): Promise<SchoolPickStatus> {
  const next = { ...context, expectedCode: context.expectedCode || standardSchoolCode(value) || undefined };
  const blue = await pickBlueFlatIdentity(doc, value, next);
  if (blue !== 'not-applicable') return blue;
  const component = await pickComponentOption(anchor, value, next);
  if (component.status !== 'not-applicable') return component.status;
  return runMinimalPicker(doc, anchor, value, SCHOOL_SPEC, { ...next, profilePath: context.profilePath || 'education.university' });
}
