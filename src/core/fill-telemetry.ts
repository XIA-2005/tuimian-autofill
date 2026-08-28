// 填写运行遥测：只记录字段语义、阶段和结果，禁止保存档案原值及页面真实内容。

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

export interface FillTelemetryCounts {
  total: number;
  completed: number;
  filled: number;
  skipped: number;
  failed: number;
  waiting: number;
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

/** 功能：判断运行是否仍应锁定互斥操作按钮。 */
export function isTelemetryBusy(stage: FillTelemetryStage): boolean {
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
    action: redactTelemetryText(input.action, 80),
    targetLabel: input.targetLabel ? safeTelemetryLabel(input.targetLabel, input.field) : undefined,
    reason: input.reason ? redactTelemetryText(input.reason, 120) : undefined,
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

/** 功能：写入普通字段汇总，使用真实总数而非估算百分比。 */
export function applyFillTelemetryCounts(state: FillTelemetryState, counts: Partial<FillTelemetryCounts>): FillTelemetryState {
  const next = { ...state.counts, ...counts };
  next.completed = Math.min(next.total || Number.MAX_SAFE_INTEGER, next.filled + next.skipped + next.failed);
  return { ...state, counts: next, progress: next.total ? { current: next.completed, total: next.total } : state.progress, updatedAt: Date.now() };
}

/** 功能：校验从 sessionStorage 恢复的数据，过期或结构不完整时返回空状态。 */
export function restoreFillTelemetryState(raw: string | null, now = Date.now()): FillTelemetryState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as FillTelemetryState;
    if (!value?.runId || !Array.isArray(value.events) || now - Number(value.updatedAt || 0) > 30 * 60_000) return null;
    return { ...value, active: isTelemetryBusy(value.stage), events: value.events.slice(-MAX_EVENTS) };
  } catch {
    return null;
  }
}
