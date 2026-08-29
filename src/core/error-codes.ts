// 填写问题码体系：稳定错误码 + 一句话问题 + "用户该做什么"。
// 对标成熟填表软件的 E12xx 惯例，但只保留与填表质量相关的码；
// 桥接/登录类环境错误不属于填写问题，不进目录。
// 码出现在：FillItem.issueCode、逐条决策日志、漏填清单与字段报告。

export interface IssueMeta {
  /** 一句话问题描述（不含档案内容） */
  summary: string;
  /** 用户该做什么 */
  action: string;
}

export const ISSUE_CATALOG: Record<string, IssueMeta> = {
  E1101: {
    summary: '页面没有识别到这个字段对应的规则',
    action: '若该字段应自动填写，请用「复制字段报告」反馈给开发者补充规则',
  },
  E1102: {
    summary: '档案中缺少该字段内容',
    action: '在档案编辑器中补充后重新填充',
  },
  E1103: {
    summary: '下拉/单选没有匹配的选项',
    action: '手动选择一次；若是联动下拉请先选择上级字段再重试',
  },
  E1104: {
    summary: '页面未就绪或加载超时',
    action: '等待页面加载完成后刷新重试',
  },
  E1201: {
    summary: '点击加行按钮后行数未增长',
    action: '查看页面是否有行数上限提示；可手动新增一行后重试',
  },
  E1202: {
    summary: '行数已达系统上限',
    action: '删除不再需要的行，或联系招生老师调整限额',
  },
  E1203: {
    summary: '弹窗已打开但无法安全完成选择',
    action: '请手动在弹窗中选择；本扩展绝不代替你点击最终确认',
  },
  E1204: {
    summary: '新打开的弹窗疑似"修改"而非"新增"，已安全关闭',
    action: '为避免覆盖已有内容已中止该条；请人工核对该表格',
  },
  E1205: {
    summary: '疑似假保存：保存后表格内容丢失',
    action: '不要重复提交；重新填充并核对必填项后再人工保存',
  },
  E1206: {
    summary: '长文未自动填写',
    action: '页面未给出可信字数上限或档案长文超限；请人工粘贴档案中的长文',
  },
  E1207: {
    summary: '本页没有找到可用的加行按钮',
    action: '确认该表格是否支持自动加行；可手动新增一行后重新填充',
  },
};

export function issueMeta(code: string): IssueMeta | null {
  return ISSUE_CATALOG[code] || null;
}

/** 面板/清单用的一行式呈现：[E1202] 问题 —— 建议：... */
export function formatIssue(code: string): string {
  const meta = issueMeta(code);
  if (!meta) return code;
  return `[${code}] ${meta.summary} —— 建议：${meta.action}`;
}
