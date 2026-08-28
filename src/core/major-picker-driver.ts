// 本科专业独立驱动内核：包含新旧目录代码别名和简约系统 SelBkdzZydm 门类查询。

import { pickComponentOption } from './component-select-drivers';
import { pickBlueFlatIdentity } from './blue-flat-picker-driver';
import { runMinimalPicker } from './minimal-picker-common';
import { PopupPickContext } from './popup-binding';
import { standardMajorCode } from './standard-code-catalog';

const MAJOR_CODE_ALIASES: Record<string, string[]> = {
  '080605': ['080901'],
  '080901': ['080605'],
  '080611': ['080902'],
  '080902': ['080611'],
};

const MAJOR_SPEC = {
  triggerSelectors: ['hykSelfszydm', '#hykSelfszydm', 'a[id*="Selfszydm"]', 'hykSelBkzydm', '#hykSelBkzydm', 'a[id*="SelBkzydm"]'],
  codeSelectors: ['#txtBkzydm', '[name="txtBkzydm"]', '#ctl00_contentParent_txtBkzydm', '[name="ctl00$contentParent$txtBkzydm"]'],
  nameSelectors: ['#txtBkzymc', '[name="txtBkzymc"]', '#ctl00_contentParent_txtBkzymc', '[name="ctl00$contentParent$txtBkzymc"]'],
  frameNames: ['SelBkdzZydm', 'SelMajor', 'SelSubject', 'Selfszydm'],
  frameSrcPattern: /SelBkdzZydm|SelMajor|SelSubject|SelZy|SelBkdz|Selfszydm/i,
};

const CATEGORY_HINTS: Array<[RegExp, string]> = [
  [/计算机|软件|网络|人工智能|自动化|电气|电子|通信|信息|测控|仪器|机械|材料|化工|环境|土木|建筑|能源|动力|工程/, '工学'],
  [/数学|物理|化学|生物|地理|统计|心理|生态/, '理学'],
  [/管理|工商|行政|物流|会计|审计/, '管理学'],
  [/经济|金融|财政|贸易|保险|投资/, '经济学'],
  [/法学|法律|政治|社会|公安/, '法学'],
  [/教育|学前|体育|运动/, '教育学'],
  [/汉语言|英语|日语|翻译|新闻|传播|文学|艺术|设计/, '文学'],
  [/医学|临床|口腔|护理|药学|预防/, '医学'],
  [/农学|园艺|植物|动物|兽医|林学|水产/, '农学'],
];

function majorCategory(value: string): string | undefined {
  return CATEGORY_HINTS.find(([pattern]) => pattern.test(value))?.[1];
}

function aliases(context: PopupPickContext): string[] {
  const all = new Set(context.codeAliases || []);
  for (const code of [context.expectedCode || '', ...(context.codeAliases || [])]) {
    for (const alias of MAJOR_CODE_ALIASES[code] || []) all.add(alias);
  }
  return Array.from(all);
}

export type MajorPickStatus = 'picked' | 'opened' | 'failed' | 'not-applicable';

/** 功能：填写本科专业，按目标代码、新旧目录别名、名称和学科门类依次检索。 */
export async function pickMajor(doc: Document, anchor: Element, value: string, context: PopupPickContext = {}): Promise<MajorPickStatus> {
  const inferredCode = context.expectedCode || standardMajorCode(value) || undefined;
  const next = { ...context, expectedCode: inferredCode, profilePath: context.profilePath || 'education.major', codeAliases: aliases({ ...context, expectedCode: inferredCode }) };
  const blue = await pickBlueFlatIdentity(doc, value, next);
  if (blue !== 'not-applicable') return blue;
  const component = await pickComponentOption(anchor, value, next);
  if (component.status !== 'not-applicable') return component.status;
  return runMinimalPicker(doc, anchor, value, { ...MAJOR_SPEC, category: majorCategory(value) }, next);
}
