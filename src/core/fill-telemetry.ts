// 填写运行遥测：只记录字段语义、阶段和结果，禁止保存档案原值及页面真实内容。
import { ISSUE_CATALOG } from './error-codes';
import { emptyProfile } from './profile';

export type FillTelemetryStage =
  | 'idle'
  | 'identifying'
  | 'filling'
  | 'picking'
  | 'addingRows'
  | 'verifying'
  | 'correcting'
  | 'navigating'
  | 'paused'
  | 'succeeded'
  | 'partial'
  | 'blocked'
  | 'cancelled'
  | 'failed';

export type FillTelemetryLevel = 'info' | 'success' | 'warning' | 'error';

/** 功能:一轮填充的目标终态分区(互斥;total = 唯一逻辑目标数;completed 定义见下)。
 * completed = filled + skipped + failed + alreadyCorrect(终态已定);
 * waiting = profileEmpty + picker + conflict(等待人工/弹窗/冲突待处理);
 * total 是目标数,不是写入次数(重试次数由调用方单独统计,不混入 total)。
 */
export interface FillTelemetryCounts {
  total: number;
  completed: number;
  filled: number;
  skipped: number;
  failed: number;
  waiting: number;
  /** P12:alreadyCorrect 不混作写入计数,但计入"已完成"进度。 */
  alreadyCorrect?: number;
  /** P12:conflict 计入等待人工。 */
  conflict?: number;
}

/**
 * 功能:I02 持久化原因只允许固定模板——页面原文与资料值一律不落盘。
 * 说明:页面错误容器文本、资料值都可能出现在 reason 里(如"页面报本字段错误:xxx"),它们只允许留在当前页内存 UI。
 * 规则:有 issueCode 用问题码固定文案;否则只接受本模块登记的固定前缀模板;其余折叠为通用文案。
 */
export function safeTelemetryReason(reason: unknown, issueCode?: string | null): string | undefined {
  const text = String(reason || '').replace(/\s+/g, ' ').trim();
  if (issueCode) {
    const meta = ISSUE_CATALOG[issueCode];
    if (meta) return meta.summary;
  }
  if (!text) return undefined;
  for (const template of FIXED_REASON_TEMPLATES) {
    if (text.startsWith(template.prefix)) return template.text;
  }
  return '该字段未完成,详见页面提示';
}

export interface FillTelemetryEvent {
  runId: string;
  sequence: number;
  timestamp: number;
  stage: FillTelemetryStage;
  level: FillTelemetryLevel;
  action: string;
  targetLabel?: string;
  field?: string | null;
  /** I02:稳定问题码(持久化诊断只保留码与固定文案,不保留页面原文)。 */
  issueCode?: string;
  reason?: string;
  current?: number;
  total?: number;
  recoverable?: boolean;
}

export interface FillTelemetryState {
  runId: string;
  startedAt: number;
  updatedAt: number;
  stage: FillTelemetryStage;
  active: boolean;
  title: string;
  detail: string;
  currentLabel: string;
  counts: FillTelemetryCounts;
  progress: { current: number; total: number };
  events: FillTelemetryEvent[];
}

export interface FillTelemetryEventInput extends Omit<FillTelemetryEvent, 'runId' | 'sequence' | 'timestamp'> {
  timestamp?: number;
}

const MAX_EVENTS = 100;
const SENSITIVE_VALUE_PATTERNS = [
  /\b1\d{10}\b/g,
  /\b\d{17}[\dXx]\b/g,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
];

/**
 * I02:允许持久化的固定原因模板(本仓库自有文案的前缀 → 固定成句)。
 * 这里只登记"代码生成"的原因;任何拼接了页面文本的原因都不得进入该列表。
 */
const FIXED_REASON_TEMPLATES: Array<{ prefix: string; text: string }> = [
  { prefix: '写入后未稳定接受', text: '写入后未稳定接受:页面在验证窗口内改写或清空了该值' },
  { prefix: '值已写入但页面报本字段错误', text: '值已写入但页面报本字段错误(详情见页面提示)' },
  { prefix: '验证时节点已离开文档', text: '验证时节点已离开文档(可能被页面重建),结果不可信' },
  { prefix: '缺少写入记录或期望值', text: '缺少写入记录或期望值,无法完成稳定验证' },
  { prefix: '稳定回读失败', text: '稳定回读失败:写入未被页面稳定接受' },
  { prefix: '依赖字段尚未验证成功', text: '依赖字段尚未验证成功,未填写子字段' },
  { prefix: '父控件被替换或改值', text: '父控件被替换或改值,依赖授权已失效' },
  { prefix: '父字段出现新增关联校验错误', text: '父字段出现新增关联校验错误,未放行子字段' },
  { prefix: '等待依赖控件就绪超时', text: '等待依赖控件就绪超时,未写入旧控件' },
  { prefix: '原轮已取消', text: '原轮已取消或页面已变化,未继续填写' },
  { prefix: '页面含声明式依赖字段', text: '页面含声明式依赖字段,须由异步执行器调度' },
  { prefix: '页面已有不同值', text: '页面已有不同值,已保留原值(未覆盖)' },
  { prefix: '页面已有相同值', text: '页面已有相同值,跳过写入' },
  { prefix: '档案为空', text: '档案为空,未填写' },
  { prefix: '下拉/单选选项不匹配', text: '下拉/单选选项不匹配,请人工选择' },
  { prefix: '下拉暂无选项', text: '下拉暂无选项(可能是联动下拉,请先选择上级字段后重试)' },
  { prefix: '写入或回读失败', text: '写入或回读失败' },
  { prefix: '等待学校/专业弹窗驱动成对选择', text: '等待学校/专业弹窗驱动成对选择' },
  { prefix: '控件歧义', text: '控件解析存在歧义,拒绝猜测' },
  { prefix: '页面契约控件不存在', text: '页面契约控件不存在' },
  { prefix: '控件解析为空', text: '控件解析为空' },
];

const FIELD_LABELS: Record<string, string> = {
  academicPapers: '论文/著作',
  academicPatents: '专利/软件著作权',
  academicProjects: '科研项目',
  academicCompetitions: '学术/创新创业竞赛',
  honorsScholarships: '荣誉/奖学金',
  internships: '实习经历',
  socialService: '社会实践/志愿服务',
  studentWorkExperiences: '学生工作/学习工作经历',
  research: '科研成果',
  awards: '奖励情况',
  experiences: '学习/工作经历',
  familyMembers: '家庭成员',
  languageExams: '外语水平',
};

/** 功能：生成新的运行状态；所有展示数据均为页面语义，不包含用户档案原值。 */
export function createFillTelemetryState(now = Date.now()): FillTelemetryState {
  return {
    runId: `fill_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    startedAt: now,
    updatedAt: now,
    stage: 'idle',
    active: false,
    title: '准备就绪',
    detail: '可填写当前页，或连续填写并在校验通过后进入下一步。',
    currentLabel: '',
    counts: { total: 0, completed: 0, filled: 0, skipped: 0, failed: 0, waiting: 0 },
    progress: { current: 0, total: 0 },
    events: [],
  };
}

/** 功能：去除遥测文字中可能出现的手机号、身份证号和邮箱，避免运行日志泄露档案内容。 */
export function redactTelemetryText(raw: unknown, maxLength = 120): string {
  let text = String(raw || '').replace(/\s+/g, ' ').trim();
  for (const pattern of SENSITIVE_VALUE_PATTERNS) text = text.replace(pattern, '[已脱敏]');
  return text.slice(0, maxLength);
}

/** 功能：把数组字段路径转换为安全类别和行号，避免把姓名、奖项名称或论文标题写进日志。 */
export function safeTelemetryLabel(label: unknown, field?: string | null): string {
  const path = String(field || '');
  const array = /^([A-Za-z]+)\[(\d+)\]/.exec(path);
  if (array) return `${FIELD_LABELS[array[1]] || '表格记录'} · 第 ${Number(array[2]) + 1} 行`;
  const clean = redactTelemetryText(label, 60);
  if (!clean) return path ? redactTelemetryText(path, 60) : '当前项目';
  // 含长串具体内容的动态表格标签只保留冒号前的字段类别。
  if (clean.length > 32 && /[：:]/.test(clean)) return clean.split(/[：:]/)[0].slice(0, 28);
  return clean;
}

/**
 * 功能:H05 跨上下文 DTO 的固定标签——只允许字段类别/路径等本地生成内容,
 * 绝不携带页面标签原文(可能含家庭成员姓名、证件号等资料值)。
 */
/**
 * 功能:I02 面板/遥测可用的短标签——只接受"短纯文字"的字段名(如 姓名/手机号),
 * 含数字、标点、下划线或超长的页面文本一律回退到固定字段标签,避免把"父亲姓名：张三"这类含值文本落盘。
 */
export function safeTelemetryLabelText(label: unknown, field?: string | null): string {
  const raw = String(label || '').replace(/\s+/g, ' ').trim();
  if (SAFE_FIELD_LABELS.has(raw)) return raw;
  return fixedFieldLabel(field);
}

// 字符短或纯ASCII不代表安全；只保留本地字段词表，不能把姓名/地址当标签。
const SAFE_FIELD_LABELS = new Set('姓名 手机号 手机号码 邮箱 电子邮箱 性别 出生日期 出生年月 民族 政治面貌 身份证号 证件号码 证件类型 国籍 籍贯 户籍 联系电话 通讯地址 邮政编码 本科院校 本科专业 本科省份 入学年月 毕业年月 学号 年级 班级 学院 专业 学校 排名 成绩 绩点'.split(' '));
const diagnosticProfile = emptyProfile();
const SAFE_SCALAR_FIELDS = new Set([
  ...Object.keys(diagnosticProfile.basic).map((key) => `basic.${key}`),
  ...Object.keys(diagnosticProfile.education).map((key) => `education.${key}`),
]);
const FIXED_SCALAR_LABELS: Record<string, string> = {
  'basic.name': '姓名', 'basic.namePinyin': '姓名拼音', 'basic.gender': '性别', 'basic.phone': '手机号', 'basic.email': '电子邮箱',
  'basic.idType': '证件类型', 'basic.idCard': '证件号码', 'basic.birthday': '出生日期', 'basic.nation': '民族',
  'basic.politicalStatus': '政治面貌', 'basic.address': '通讯地址', 'basic.postalCode': '邮政编码', 'basic.landline': '固定电话',
  'basic.hometown': '籍贯', 'basic.birthPlace': '出生地', 'basic.hukou': '户籍', 'basic.country': '国籍',
  'basic.emergencyName': '紧急联系人', 'basic.emergencyPhone': '紧急联系电话', 'basic.militaryStatus': '军人状态',
  'education.university': '本科院校', 'education.major': '本科专业', 'education.province': '本科省份', 'education.college': '学院',
  'education.startDate': '入学年月', 'education.endDate': '毕业年月', 'education.studentId': '学号', 'education.gpa': '绩点', 'education.score': '成绩',
};

/** 功能：只允许档案中登记过的标量字段和数组类别，未知页面标识不进入诊断出口。 */
export function safeDiagnosticField(field: unknown): string | null {
  if (typeof field !== 'string') return null;
  if (SAFE_SCALAR_FIELDS.has(field)) return field;
  const array = /^([A-Za-z]+)\[(\d{1,4})\](?:\.[A-Za-z]+)?$/.exec(field);
  if (array && (FIELD_LABELS[array[1]] || ['essays', 'applications', 'selfStatements', 'computerCertificates'].includes(array[1]))) return `${array[1]}[${Number(array[2])}]`;
  if (field.startsWith('compose.') && FIELD_LABELS[field.slice(8)]) return field;
  return null;
}

export function fixedFieldLabel(field: string | null | undefined, fallback = '当前字段'): string {
  const path = safeDiagnosticField(field) || '';
  const array = /^([A-Za-z]+)\[(\d+)\]/.exec(path);
  if (array) return `${FIELD_LABELS[array[1]] || '表格记录'} · 第 ${Number(array[2]) + 1} 行`;
  return FIXED_SCALAR_LABELS[path] || path || fallback;
}

/** 功能:I02 诊断报告条目——只保留固定字段类别/状态/问题码。 */
export interface DiagnosticFillItem {
  label: string;
  field: string | null;
  status: string;
  issue: string;
}

/**
 * 功能:I02 把页面内的填写摘要转换为"无资料诊断摘要"——不携带页面标签原文、资料值或页面错误原文。
 * 说明:这是普通诊断报告的唯一条目来源;需要带资料的用户导出必须另设显式入口。
 */
export function buildDiagnosticSummary(raw: unknown): { at?: number; stats?: unknown; items: DiagnosticFillItem[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = raw as { at?: unknown; stats?: unknown; items?: unknown };
  const items: DiagnosticFillItem[] = Array.isArray(parsed.items)
    ? parsed.items
        .filter((item) => !!item && typeof item === 'object')
        .slice(0, 80)
        .map((item) => {
          const it = item as Record<string, unknown>;
          const field = safeDiagnosticField(it.field);
          const issue = String(it.issue || '');
          return {
            label: fixedFieldLabel(field),
            field,
            status: safeDiagnosticStatus(it.status),
            issue: ISSUE_CATALOG[issue] ? issue : '',
          };
        })
    : [];
  return { at: typeof parsed.at === 'number' && Number.isFinite(parsed.at) ? parsed.at : undefined, stats: safeDiagnosticCounts(parsed.stats), items };
}

/** 功能：诊断状态使用枚举，不能利用status夹带页面数据。 */
export function safeDiagnosticStatus(value: unknown): string {
  return typeof value === 'string' && ['filled', 'failed', 'skipped', 'noMatch', 'profileEmpty', 'picker', 'conflict', 'alreadyCorrect', 'pending', 'cancelled'].includes(value) ? value : 'unknown';
}

/** 功能：摘要只保留已知计数，不原样透传stats中的任意附加内容。 */
function safeDiagnosticCounts(value: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  if (!value || typeof value !== 'object') return result;
  for (const key of ['total', 'filled', 'failed', 'skipped', 'noMatch', 'profileEmpty', 'picker', 'pickerResumeCount', 'alreadyCorrect', 'conflict']) {
    const count = (value as Record<string, unknown>)[key];
    if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 && count <= 1_000_000) result[key] = count;
  }
  return result;
}

const DIAGNOSTIC_KEYS = new Set('at stats items field status issue total filled failed skipped noMatch profileEmpty picker pickerResumeCount alreadyCorrect conflict name id tag type class cls rows dataRows writableRows purpose header samples cells addButtons hasSaveButton pickers triggerTag triggerCls inputs selects textareas nested long mode steps result strategy target before after count index attempt kind readonly disabled visible expanded success ok matched optionCount hasPickerTrigger hasOnclick hrefKind text value alt elapsedMs stage action reason runId frameId'.split(' '));
const DIAGNOSTIC_ENUMS = new Set('input select textarea button table tr td th div span a text hidden radio checkbox submit reset native-select ant element select2 layui jquery bhtc jqx done failed filled picked opened skipped none unknown not-applicable achievements experiences awards family language form shell success error warning info true false'.split(' '));
// 内核生成的固定阶段码允许保留；不放行任意以这些文字开头的页面字符串。
const DRIVER_STAGE_CODES = new Set('blue-flat blue-flat:start cascade-leaf-no-code cascade-leaf cascade-confirm cascade-leaf-node cascade-parent cascade-parent-node cascade-parent-scan layer-confirm triad-ok no-trigger trigger cancelled no-scope scope-found table-click result-selected table-row table-row-fallback exhausted'.split(' '));
const SAFE_ACTIONS = new Set(['正在识别当前页面', '正在扫描页面并填充', '常规字段填充', '本轮填写完成', '本轮填写已结束，仍有项目需要核对', '已填写并回读通过', '页面已有相同值,已跳过写入', '页面已有不同值,已保留原值', '等待弹窗精确选择', '档案没有可用数据', '未匹配到安全填写规则', '已按安全规则跳过', '写入或回读失败', '人工选择已确认并回读通过', '已自动检测到人工选择回填', '选择窗口已关闭，字段仍待人工处理', '已跳过当前弹窗字段', '弹窗选中并确认完成', '弹窗回填并回读通过', '验证失败', '需人工', '已填写']);

/** 功能:I02 诊断用值清洗——字符串一律截断+脱敏,数组/对象有界,防止页面原文随调试块落盘。 */
export function sanitizeDiagnosticValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return undefined;
  if (typeof value === 'string') {
    if (DIAGNOSTIC_ENUMS.has(value) || DRIVER_STAGE_CODES.has(value) || Object.hasOwn(ISSUE_CATALOG, value)) return value;
    const field = safeDiagnosticField(value);
    if (field) return field;
    return `文本(${value.length}字)`;
  }
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= 1_000_000_000 ? value : '数值';
  if (typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeDiagnosticValue(item, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).slice(0, 20).forEach(([key, item], index) => {
      out[DIAGNOSTIC_KEYS.has(key) ? key : `entry${index}`] = sanitizeDiagnosticValue(item, depth + 1);
    });
    return out;
  }
  return undefined;
}
/** 功能：判断运行是否仍应锁定互斥操作按钮。 */export function isTelemetryBusy(stage: FillTelemetryStage): boolean {
  return ['identifying', 'filling', 'picking', 'addingRows', 'verifying', 'correcting', 'navigating'].includes(stage);
}

/** 功能：合并一条运行事件，并将日志限制在最近 100 条。 */
export function reduceFillTelemetry(state: FillTelemetryState, input: FillTelemetryEventInput): FillTelemetryState {
  const timestamp = input.timestamp || Date.now();
  const event: FillTelemetryEvent = {
    ...input,
    runId: state.runId,
    sequence: (state.events[state.events.length - 1]?.sequence || 0) + 1,
    timestamp,
    action: SAFE_ACTIONS.has(input.action) ? input.action : '填写状态更新',
    // I02:持久化标签只允许固定字段类别;原因只允许问题码/固定模板(页面原文与资料值不落盘)。
    targetLabel: input.targetLabel ? safeTelemetryLabelText(input.targetLabel, input.field) : (input.field ? fixedFieldLabel(input.field) : undefined),
    field: safeDiagnosticField(input.field),
    issueCode: input.issueCode && ISSUE_CATALOG[input.issueCode] ? input.issueCode : undefined,
    reason: safeTelemetryReason(input.reason, input.issueCode),
  };
  const events = [...state.events, event].slice(-MAX_EVENTS);
  const progress = input.total != null
    ? { current: Math.max(0, Math.min(input.current || 0, input.total)), total: Math.max(0, input.total) }
    : state.progress;
  const currentLabel = event.targetLabel || state.currentLabel;
  const terminal = ['succeeded', 'partial', 'blocked', 'cancelled', 'failed'].includes(input.stage);
  return {
    ...state,
    updatedAt: timestamp,
    stage: input.stage,
    active: !terminal && isTelemetryBusy(input.stage),
    title: event.action || state.title,
    detail: event.reason || (event.targetLabel ? `当前项目：${event.targetLabel}` : state.detail),
    currentLabel,
    progress,
    events,
  };
}

/** 功能：写入普通字段汇总，使用真实总数而非估算百分比。 */export function applyFillTelemetryCounts(state: FillTelemetryState, counts: Partial<FillTelemetryCounts>): FillTelemetryState {
  const next = { ...state.counts, ...counts };
  next.completed = Math.min(next.total || Number.MAX_SAFE_INTEGER, next.filled + next.skipped + next.failed + (next.alreadyCorrect || 0));
  return { ...state, counts: next, progress: next.total ? { current: next.completed, total: next.total } : state.progress, updatedAt: Date.now() };
}

/**
 * 功能:J02 校验从 sessionStorage 恢复的数据——旧版本落盘的事件/字段一律按当前 schema 重建。
 * 说明:禁止用对象展开把旧 title/action/label/reason、未知键与旧 URL 原样带回当前状态;
 * 保留合法计数、固定字段、问题码与阶段码;数组/深度/容量有界。结构不合法则返回 null(不恢复)。
 */
export function restoreFillTelemetryState(raw: string | null, now = Date.now()): FillTelemetryState | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const value = parsed as Record<string, unknown>;
  const legacyRunId = typeof value.runId === 'string' && value.runId.length > 0 && value.runId.length <= 64 ? value.runId : null;
  if (!legacyRunId) return null;
  // 旧runId同样来自不可信持久化数据，不能成为绕过标签/原因清洗的出口。
  let legacyHash = 2166136261;
  for (const char of legacyRunId) legacyHash = Math.imul(legacyHash ^ char.charCodeAt(0), 16777619);
  const runId = `restored_${(legacyHash >>> 0).toString(16)}`;
  const updatedAt = typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? value.updatedAt : 0;
  if (updatedAt < 0 || updatedAt > now || now - updatedAt > 30 * 60_000) return null;
  const startedAt = typeof value.startedAt === 'number' && Number.isFinite(value.startedAt) ? value.startedAt : updatedAt;
  if (startedAt < 0 || startedAt > updatedAt) return null;
  const stage = TELEMETRY_STAGES.has(value.stage as FillTelemetryStage) ? (value.stage as FillTelemetryStage) : 'idle';
  const rawEvents = Array.isArray(value.events) ? value.events.slice(-MAX_EVENTS) : [];
  const events: FillTelemetryEvent[] = [];
  for (const entry of rawEvents) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const action = typeof item.action === 'string' && SAFE_ACTIONS.has(item.action) ? item.action : '填写状态更新';
    const field = safeDiagnosticField(typeof item.field === 'string' ? item.field : null);
    events.push({
      runId,
      sequence: typeof item.sequence === 'number' && Number.isFinite(item.sequence) ? item.sequence : events.length + 1,
      timestamp: typeof item.timestamp === 'number' && Number.isFinite(item.timestamp) ? item.timestamp : updatedAt,
      stage: TELEMETRY_STAGES.has(item.stage as FillTelemetryStage) ? (item.stage as FillTelemetryStage) : stage,
      level: item.level === 'success' || item.level === 'warning' || item.level === 'error' ? item.level : 'info',
      action,
      targetLabel: typeof item.targetLabel === 'string' ? safeTelemetryLabelText(item.targetLabel, field) : (field ? fixedFieldLabel(field) : undefined),
      field,
      issueCode: typeof item.issueCode === 'string' && Object.hasOwn(ISSUE_CATALOG, item.issueCode) ? item.issueCode : undefined,
      reason: safeTelemetryReason(typeof item.reason === 'string' ? item.reason : undefined, typeof item.issueCode === 'string' ? item.issueCode : undefined),
    });
  }
  const counts = normalizeTelemetryCounts(value.counts);
  const progressRaw = (value.progress && typeof value.progress === 'object' ? value.progress : {}) as Record<string, unknown>;
  const total = boundCount(progressRaw.total);
  const current = Math.max(0, Math.min(boundCount(progressRaw.current), total));
  const last = events[events.length - 1];
  return {
    runId,
    startedAt,
    updatedAt,
    stage,
    active: isTelemetryBusy(stage),
    // 标题/明细/当前项一律由已校验的事件重建,不使用旧字符串(旧数据可能含页面原文)。
    title: last?.action || '填写状态已恢复',
    detail: last?.reason || (last?.targetLabel ? `当前项目：${last.targetLabel}` : '填写状态已恢复'),
    currentLabel: last?.targetLabel || '',
    counts,
    progress: { current, total },
    events,
  };
}

/** 合法阶段枚举(旧数据中的未知阶段一律回落 idle)。 */
const TELEMETRY_STAGES = new Set<FillTelemetryStage>(['idle', 'identifying', 'filling', 'picking', 'addingRows', 'verifying', 'correcting', 'navigating', 'paused', 'succeeded', 'partial', 'blocked', 'cancelled', 'failed']);

function boundCount(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0;
  return Math.max(0, Math.min(n, 1_000_000));
}

/** 功能:J02 只保留已登记的计数键与有界数值(旧 stats 扩展内容一律丢弃)。 */
function normalizeTelemetryCounts(raw: unknown): FillTelemetryCounts {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const keys: Array<keyof FillTelemetryCounts> = ['total', 'completed', 'filled', 'skipped', 'failed', 'waiting', 'alreadyCorrect', 'conflict'];
  const out: FillTelemetryCounts = { total: 0, completed: 0, filled: 0, skipped: 0, failed: 0, waiting: 0 };
  for (const key of keys) {
    const value = boundCount(src[key as string]);
    if (value > 0 || key in src) out[key] = value;
  }
  out.completed = Math.min(out.total || Number.MAX_SAFE_INTEGER, out.filled + out.skipped + out.failed + (out.alreadyCorrect || 0));
  return out;
}
