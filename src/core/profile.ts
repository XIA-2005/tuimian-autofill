// 个人档案 Schema：所有字段均保存在浏览器本地，由用户自行填写。
// V2 在保留 V1 兼容字段的同时，引入八类原子表、来源、锁定、代码簿和学校扩展字段。

export type ProfileSourceKind = 'manual' | 'crawl' | 'migration' | 'derived';
export type ProfileConfidence = 'verified' | 'inferred' | 'needs-review';

export interface ProfileValueState {
  locked: boolean;
  source: ProfileSourceKind;
  sourceAdapterId?: string;
  sourcePageId?: string;
  updatedAt: string;
  confidence: ProfileConfidence;
}

export interface ProfileRowState extends ProfileValueState {
  /** 稳定行 ID，用于跨页面去重和逐行锁定。 */
  id: string;
}

interface AtomicRowBase {
  state?: ProfileRowState;
}

export interface AcademicRow extends AtomicRowBase {
  kind: string;
  start: string;
  end: string;
  title: string;
  source: string;
  role: string;
  authors: string;
  itemType: string;
  level: string;
  status: string;
  summary: string;
  advisor: string;
  partition: string;
}

export interface HonorRow extends AtomicRowBase {
  kind: string;
  time: string;
  name: string;
  issuer: string;
  place: string;
  level: string;
  grade: string;
  rank: string;
  content: string;
}

export interface ActivityRow extends AtomicRowBase {
  kind: string;
  start: string;
  end: string;
  org: string;
  role: string;
  place: string;
  content: string;
}

export interface LanguageExam extends AtomicRowBase {
  kind: string;
  score: string;
  date: string;
  level: string;
  certificateNo: string;
}

export interface ComputerCertificate extends AtomicRowBase {
  kind: string;
  level: string;
  score: string;
  date: string;
  certificateNo: string;
}

export interface Essay extends AtomicRowBase {
  kind: string;
  content: string;
  charLimit: number;
}

export type AtomicTableId =
  | 'academicPapers'
  | 'academicPatents'
  | 'academicProjects'
  | 'academicCompetitions'
  | 'honorsScholarships'
  | 'internships'
  | 'socialService'
  | 'studentWorkExperiences';

export const ATOMIC_TABLE_IDS: AtomicTableId[] = ['academicPapers', 'academicPatents', 'academicProjects', 'academicCompetitions', 'honorsScholarships', 'internships', 'socialService', 'studentWorkExperiences'];

export interface PendingClassification {
  id: string;
  sourceKind: 'research' | 'award' | 'practice' | 'experience';
  original: Record<string, unknown>;
  candidates: AtomicTableId[];
  reason: string;
}

export interface ProfileCodebookEntry {
  label: string;
  /** namespace -> code，例如 moe.school / adapter:lzu-ytms */
  codes: Record<string, string>;
  updatedAt: string;
  sourceAdapterId?: string;
}

export interface ProfileCodebook {
  [profilePath: string]: ProfileCodebookEntry;
}

export interface SchoolExtensionData {
  scalars: Record<string, string>;
  tables: Record<string, Array<Record<string, string>>>;
}

export interface Award {
  date: string;
  place: string;
  content: string;
  level?: string;
  role?: string;
}

export interface ResearchItem {
  title: string;
  type: string;
  date: string;
  role: string;
  description?: string;
}

export interface SocialPractice {
  date: string;
  name: string;
  role: string;
  detail: string;
}

export interface Experience {
  start: string;
  end: string;
  org: string;
  role: string;
}

export interface FamilyMember {
  name: string;
  relation: string;
  org: string;
  phone: string;
  politicalStatus: string;
  jobTitle?: string;
  address?: string;
}

export interface SelfStatement {
  title: string;
  content: string;
}

export interface Application {
  school: string;
  college: string;
  major: string;
  direction: string;
  degreeType: string;
  supervisor: string;
  note: string;
  programType?: string;
  year?: string;
  programId?: string;
  adapterId?: string;
  schoolCode?: string;
  collegeCode?: string;
  majorCode?: string;
  directionCode?: string;
}

export interface Profile {
  version: number;
  basic: {
    name: string;
    namePinyin: string;
    gender: string;
    idType: string;
    idCard: string;
    birthday: string;
    nation: string;
    politicalStatus: string;
    hometown: string;
    birthPlace: string;
    hukou: string;
    country: string;
    address: string;
    postalCode: string;
    phone: string;
    landline: string;
    email: string;
    qq: string;
    wechat: string;
    maritalStatus: string;
    health: string;
    emergencyName: string;
    emergencyPhone: string;
    tuimianQual: string;
    militaryStatus: string;
  };
  education: {
    university: string;
    province: string;
    college: string;
    major: string;
    className: string;
    studentId: string;
    startDate: string;
    endDate: string;
    gpa: string;
    score: string;
    rank: string;
    comprehensiveRank: string;
    gradeRank: string;
    rankBase: string;
    rankUnit: string;
    foreignLang: string;
    cet4: string;
    cet4Date: string;
    cet6: string;
    cet6Date: string;
    otherExams: string;
    obeyAdjust: string;
  };

  /** V1 兼容视图：旧填充器和旧导入文件仍可使用，V2 原子表是新的权威来源。 */
  awards: Award[];
  research: ResearchItem[];
  socialPractice: SocialPractice[];
  experiences: Experience[];

  academicPapers: AcademicRow[];
  academicPatents: AcademicRow[];
  academicProjects: AcademicRow[];
  academicCompetitions: HonorRow[];
  honorsScholarships: HonorRow[];
  internships: ActivityRow[];
  socialService: ActivityRow[];
  studentWorkExperiences: ActivityRow[];
  languageExams: LanguageExam[];
  computerCertificates: ComputerCertificate[];
  essays: Essay[];

  familyMembers: FamilyMember[];
  selfStatements: SelfStatement[];
  applications: Application[];
  fieldStates: Record<string, ProfileValueState>;
  blockLocks: Record<string, boolean>;
  codebook: ProfileCodebook;
  schoolExtensions: Record<string, SchoolExtensionData>;
  pendingClassifications: PendingClassification[];
  migration: {
    v1Backup?: {
      awards: Award[];
      research: ResearchItem[];
      socialPractice: SocialPractice[];
      experiences: Experience[];
    };
    confirmed: boolean;
  };
}

const ACADEMIC_EMPTY: Omit<AcademicRow, 'state'> = {
  kind: '', start: '', end: '', title: '', source: '', role: '', authors: '', itemType: '', level: '', status: '', summary: '', advisor: '', partition: '',
};
const HONOR_EMPTY: Omit<HonorRow, 'state'> = { kind: '', time: '', name: '', issuer: '', place: '', level: '', grade: '', rank: '', content: '' };
const ACTIVITY_EMPTY: Omit<ActivityRow, 'state'> = { kind: '', start: '', end: '', org: '', role: '', place: '', content: '' };

export function emptyProfile(): Profile {
  return {
    version: 2,
    basic: {
      name: '', namePinyin: '', gender: '', idType: '居民身份证', idCard: '', birthday: '', nation: '', politicalStatus: '', hometown: '', birthPlace: '', hukou: '', country: '中国', address: '', postalCode: '', phone: '', landline: '', email: '', qq: '', wechat: '', maritalStatus: '', health: '', emergencyName: '', emergencyPhone: '', tuimianQual: '', militaryStatus: '非军人',
    },
    education: {
      university: '', province: '', college: '', major: '', className: '', studentId: '', startDate: '', endDate: '', gpa: '', score: '', rank: '', comprehensiveRank: '', gradeRank: '', rankBase: '', rankUnit: '', foreignLang: '英语', cet4: '', cet4Date: '', cet6: '', cet6Date: '', otherExams: '', obeyAdjust: '',
    },
    awards: [], research: [], socialPractice: [], experiences: [],
    academicPapers: [], academicPatents: [], academicProjects: [], academicCompetitions: [], honorsScholarships: [], internships: [], socialService: [], studentWorkExperiences: [],
    languageExams: [], computerCertificates: [], essays: [],
    familyMembers: [], selfStatements: [], applications: [],
    fieldStates: {}, blockLocks: {}, codebook: {}, schoolExtensions: {}, pendingClassifications: [],
    migration: { confirmed: true },
  };
}

function text(v: unknown): string {
  return v == null ? '' : String(v);
}

function hashText(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function createRowState(source: ProfileSourceKind, seed: string, confidence: ProfileConfidence = 'verified'): ProfileRowState {
  return { id: `row_${hashText(seed)}_${Date.now().toString(36)}`, locked: source === 'manual', source, updatedAt: new Date().toISOString(), confidence };
}

function normalizeState(raw: unknown, seed: string, source: ProfileSourceKind): ProfileRowState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    id: text(r.id) || `row_${hashText(seed)}`,
    locked: !!r.locked,
    source: (['manual', 'crawl', 'migration', 'derived'].includes(text(r.source)) ? text(r.source) : source) as ProfileSourceKind,
    sourceAdapterId: text(r.sourceAdapterId) || undefined,
    sourcePageId: text(r.sourcePageId) || undefined,
    updatedAt: text(r.updatedAt) || new Date(0).toISOString(),
    confidence: (['verified', 'inferred', 'needs-review'].includes(text(r.confidence)) ? text(r.confidence) : 'inferred') as ProfileConfidence,
  };
}

/** 旧版获奖结构迁移。 */
function migrateAwards(raw: unknown, university: string): Award[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((it): Award => {
    const a = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>;
    if (a.content !== undefined || a.place !== undefined) return { date: text(a.date), place: text(a.place), content: text(a.content), level: a.level ? text(a.level) : undefined, role: a.role ? text(a.role) : undefined };
    const name = text(a.name);
    const sep = name.indexOf('·');
    return { date: text(a.date), place: sep > 0 ? name.slice(0, sep) : university, content: sep > 0 ? name.slice(sep + 1) : name, level: a.level ? text(a.level) : undefined, role: a.role ? text(a.role) : undefined };
  }).filter((a) => a.content || a.place || a.date);
}

function normalizeAcademicRows(raw: unknown, defaultKind: string): AcademicRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((it, i) => {
    const r = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>;
    const row: AcademicRow = { ...ACADEMIC_EMPTY, ...r, kind: text(r.kind) || defaultKind } as AcademicRow;
    row.state = normalizeState(r.state, `${defaultKind}|${row.title}|${row.start}|${row.end}|${i}`, 'migration');
    return row;
  }).filter((r) => r.title || r.summary || r.source);
}

function normalizeHonorRows(raw: unknown, defaultKind: string): HonorRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((it, i) => {
    const r = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>;
    const row: HonorRow = { ...HONOR_EMPTY, ...r, kind: text(r.kind) || defaultKind } as HonorRow;
    row.state = normalizeState(r.state, `${defaultKind}|${row.name}|${row.time}|${i}`, 'migration');
    return row;
  }).filter((r) => r.name || r.content || r.issuer);
}

function normalizeActivityRows(raw: unknown, defaultKind: string): ActivityRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((it, i) => {
    const r = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>;
    const row: ActivityRow = { ...ACTIVITY_EMPTY, ...r, kind: text(r.kind) || defaultKind } as ActivityRow;
    row.state = normalizeState(r.state, `${defaultKind}|${row.org}|${row.start}|${row.end}|${i}`, 'migration');
    return row;
  }).filter((r) => r.org || r.content || r.role);
}

function legacyToAtomic(profile: Profile): void {
  const pending: PendingClassification[] = [];
  for (const [i, r] of profile.research.entries()) {
    const type = `${r.type} ${r.title}`;
    const academic: AcademicRow = { ...ACADEMIC_EMPTY, kind: r.type || '其他', start: r.date, end: r.date, title: r.title, role: r.role, summary: r.description || '', state: normalizeState(undefined, `research|${r.title}|${r.date}|${i}`, 'migration') };
    if (/专利|软著|软件著作/.test(type)) profile.academicPatents.push(academic);
    else if (/项目|科研|训练|经历/.test(type)) profile.academicProjects.push(academic);
    else if (/竞赛|比赛|大赛/.test(type)) profile.academicCompetitions.push({ ...HONOR_EMPTY, kind: /创新|创业/.test(type) ? '创新创业' : '学术', time: r.date, name: r.title, rank: r.role, content: r.description || '', state: academic.state });
    else if (/论文|著作|文章|期刊|会议/.test(type)) profile.academicPapers.push(academic);
    else pending.push({ id: `pending_${hashText(`${r.title}|${i}`)}`, sourceKind: 'research', original: { ...r }, candidates: ['academicPapers', 'academicPatents', 'academicProjects', 'academicCompetitions'], reason: '旧科研记录类型不明确，需要人工选择原子表' });
  }
  for (const [i, a] of profile.awards.entries()) {
    const row: HonorRow = { ...HONOR_EMPTY, kind: /奖学金/.test(a.content) ? '奖学金' : '荣誉', time: a.date, name: a.content, issuer: a.place, place: a.place, level: a.level || '', rank: a.role || '', state: normalizeState(undefined, `award|${a.content}|${a.date}|${i}`, 'migration') };
    if (/竞赛|比赛|大赛|挑战杯|互联网\+/.test(a.content)) profile.academicCompetitions.push({ ...row, kind: /创新|创业|互联网\+/.test(a.content) ? '创新创业' : '学术' });
    else profile.honorsScholarships.push(row);
  }
  for (const [i, s] of profile.socialPractice.entries()) {
    const all = `${s.name} ${s.role} ${s.detail}`;
    const row: ActivityRow = { ...ACTIVITY_EMPTY, kind: '社会实践', start: s.date, end: s.date, org: s.name, role: s.role, content: s.detail, state: normalizeState(undefined, `practice|${s.name}|${s.date}|${i}`, 'migration') };
    if (/实习|见习|实训/.test(all)) profile.internships.push({ ...row, kind: '实习' });
    else if (/学生会|社团|协会|班长|团支书|部长|主席/.test(all)) profile.studentWorkExperiences.push({ ...row, kind: '学生工作' });
    else profile.socialService.push({ ...row, kind: /志愿/.test(all) ? '志愿服务' : '社会实践' });
  }
  for (const [i, e] of profile.experiences.entries()) {
    const all = `${e.org} ${e.role}`;
    const row: ActivityRow = { ...ACTIVITY_EMPTY, kind: '学习和工作经历', start: e.start, end: e.end, org: e.org, role: e.role, state: normalizeState(undefined, `experience|${e.org}|${e.start}|${i}`, 'migration') };
    if (/实习|见习|实训/.test(all)) profile.internships.push({ ...row, kind: '实习' });
    else profile.studentWorkExperiences.push(row);
  }
  profile.pendingClassifications.push(...pending);
}

function syncLanguageExams(profile: Profile): void {
  if (!profile.languageExams.length) {
    if (profile.education.cet4) profile.languageExams.push({ kind: 'CET-4', score: profile.education.cet4, date: profile.education.cet4Date, level: '', certificateNo: '', state: normalizeState(undefined, `CET4|${profile.education.cet4}`, 'migration') });
    if (profile.education.cet6) profile.languageExams.push({ kind: 'CET-6', score: profile.education.cet6, date: profile.education.cet6Date, level: '', certificateNo: '', state: normalizeState(undefined, `CET6|${profile.education.cet6}`, 'migration') });
  }
}

/** 当 V2 档案从新原子表导入时，为旧填充器生成兼容视图。 */
export function deriveLegacyViews(profile: Profile): void {
  if (!profile.research.length) profile.research = [...profile.academicPapers, ...profile.academicPatents, ...profile.academicProjects].map((r) => ({ title: r.title, type: r.kind, date: r.end || r.start, role: r.role, description: r.summary }));
  if (!profile.awards.length) profile.awards = [...profile.academicCompetitions, ...profile.honorsScholarships].map((r) => ({ date: r.time, place: r.issuer || r.place, content: r.name, level: r.level || r.grade, role: r.rank }));
  if (!profile.socialPractice.length) profile.socialPractice = [...profile.internships, ...profile.socialService].map((r) => ({ date: r.start && r.end ? `${r.start}-${r.end}` : r.start || r.end, name: r.org, role: r.role, detail: r.content }));
  if (!profile.experiences.length) profile.experiences = profile.studentWorkExperiences.map((r) => ({ start: r.start, end: r.end, org: r.org, role: r.role }));
}

/** 把任意来源的对象安全地归一化为 Profile（兼容 V1、V2 和手工编辑 JSON）。 */
export function normalizeProfile(raw: unknown): Profile {
  const base = emptyProfile();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const basic = (r.basic && typeof r.basic === 'object' ? r.basic : {}) as Record<string, unknown>;
  const education = (r.education && typeof r.education === 'object' ? r.education : {}) as Record<string, unknown>;
  const oldAwards = migrateAwards(r.awards, text(education.university));
  const oldResearch = Array.isArray(r.research) ? (r.research as ResearchItem[]) : [];
  const oldPractice = Array.isArray(r.socialPractice) ? (r.socialPractice as Array<Record<string, unknown>>).map((it) => ({ date: text(it.date ?? it.time), name: text(it.name ?? it.org), role: text(it.role), detail: text(it.detail ?? it.description) })) : [];
  const oldExperiences = Array.isArray(r.experiences) ? (r.experiences as Experience[]) : [];
  const profile: Profile = {
    ...base,
    version: 2,
    basic: { ...base.basic, ...(basic as Partial<Profile['basic']>) },
    education: { ...base.education, ...(education as Partial<Profile['education']>) },
    awards: oldAwards, research: oldResearch, socialPractice: oldPractice, experiences: oldExperiences,
    academicPapers: normalizeAcademicRows(r.academicPapers, '论文'),
    academicPatents: normalizeAcademicRows(r.academicPatents, '专利'),
    academicProjects: normalizeAcademicRows(r.academicProjects, '项目'),
    academicCompetitions: normalizeHonorRows(r.academicCompetitions, '学术'),
    honorsScholarships: normalizeHonorRows(r.honorsScholarships, '荣誉'),
    internships: normalizeActivityRows(r.internships, '实习'),
    socialService: normalizeActivityRows(r.socialService, '社会实践'),
    studentWorkExperiences: normalizeActivityRows(r.studentWorkExperiences, '学习和工作经历'),
    languageExams: Array.isArray(r.languageExams) ? (r.languageExams as LanguageExam[]).map((row, i) => ({ ...row, kind: text(row.kind), score: text(row.score), date: text(row.date), level: text(row.level), certificateNo: text(row.certificateNo), state: normalizeState(row.state, `language|${row.kind}|${row.score}|${i}`, 'migration') })) : [],
    computerCertificates: Array.isArray(r.computerCertificates) ? (r.computerCertificates as ComputerCertificate[]).map((row, i) => ({ ...row, kind: text(row.kind), level: text(row.level), score: text(row.score), date: text(row.date), certificateNo: text(row.certificateNo), state: normalizeState(row.state, `computer|${row.kind}|${row.level}|${i}`, 'migration') })) : [],
    essays: Array.isArray(r.essays) ? (r.essays as Essay[]).map((row, i) => ({ ...row, kind: text(row.kind), content: text(row.content), charLimit: Number(row.charLimit || 0), state: normalizeState(row.state, `essay|${row.kind}|${i}`, 'migration') })) : [],
    familyMembers: Array.isArray(r.familyMembers) ? (r.familyMembers as FamilyMember[]) : [],
    selfStatements: Array.isArray(r.selfStatements) ? (r.selfStatements as SelfStatement[]) : [],
    applications: Array.isArray(r.applications) ? (r.applications as Application[]) : [],
    fieldStates: r.fieldStates && typeof r.fieldStates === 'object' ? (r.fieldStates as Record<string, ProfileValueState>) : {},
    blockLocks: r.blockLocks && typeof r.blockLocks === 'object' ? (r.blockLocks as Record<string, boolean>) : {},
    codebook: r.codebook && typeof r.codebook === 'object' ? (r.codebook as ProfileCodebook) : {},
    schoolExtensions: r.schoolExtensions && typeof r.schoolExtensions === 'object' ? (r.schoolExtensions as Record<string, SchoolExtensionData>) : {},
    pendingClassifications: Array.isArray(r.pendingClassifications) ? (r.pendingClassifications as PendingClassification[]) : [],
    migration: r.migration && typeof r.migration === 'object' ? { ...base.migration, ...(r.migration as Profile['migration']) } : { confirmed: Number(r.version || 1) >= 2 },
  };
  const hasAtomic = (['academicPapers', 'academicPatents', 'academicProjects', 'academicCompetitions', 'honorsScholarships', 'internships', 'socialService', 'studentWorkExperiences'] as AtomicTableId[]).some((k) => profile[k].length > 0);
  if (!hasAtomic && Number(r.version || 1) < 2 && (oldAwards.length || oldResearch.length || oldPractice.length || oldExperiences.length)) {
    profile.migration = { v1Backup: { awards: oldAwards.map((x) => ({ ...x })), research: oldResearch.map((x) => ({ ...x })), socialPractice: oldPractice.map((x) => ({ ...x })), experiences: oldExperiences.map((x) => ({ ...x })) }, confirmed: false };
    legacyToAtomic(profile);
  }
  syncLanguageExams(profile);
  if (!profile.essays.length && profile.selfStatements.length) {
    profile.essays = profile.selfStatements.map((row, i) => ({ kind: row.title || '个人陈述', content: row.content || '', charLimit: 0, state: normalizeState(undefined, `statement|${row.title}|${i}`, 'migration') }));
  }
  if (!profile.selfStatements.length && profile.essays.length) profile.selfStatements = profile.essays.map((row) => ({ title: row.kind, content: row.content }));
  deriveLegacyViews(profile);
  return profile;
}

export function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj);
}

const FIELD_LOCK_GROUPS = [['education.rank', 'education.rankBase']];

function lockGroup(path: string): string[] {
  return FIELD_LOCK_GROUPS.find((group) => group.includes(path)) || [path];
}

function validDateText(value: string): boolean {
  const match = /^(\d{4})(?:[./-](0?[1-9]|1[0-2]))?(?:[./-](0?[1-9]|[12]\d|3[01]))?$/.exec(value);
  if (!match) return false;
  const normalized = value.replace(/[./]/g, '-');
  if (/^\d{4}$/.test(normalized) || /^\d{4}-\d{1,2}$/.test(normalized)) return true;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function canLockProfileValue(path: string, value: unknown): boolean {
  const content = text(value).trim();
  if (!content || /测试数据|占位数据|示例内容|test@example\.com/i.test(content)) return false;
  if (/(^|\.)(birthday|date|start|end|time)$/i.test(path) && !validDateText(content)) return false;
  return true;
}

export function canLockProfileRow(row: Record<string, unknown>): boolean {
  const values = Object.entries(row).filter(([key]) => key !== 'state');
  if (!values.some(([, value]) => text(value).trim())) return false;
  if (values.some(([, value]) => /测试数据|占位数据|示例内容|test@example\.com/i.test(text(value)))) return false;
  return !values.some(([key, value]) => /^(date|start|end|time)$/.test(key) && text(value).trim() && !validDateText(text(value).trim()));
}

/** 将“待分类”旧记录人工归入一个原子表；分类动作视为手工确认并锁定该行。 */
export function classifyPendingRecord(profile: Profile, pendingId: string, target: AtomicTableId): boolean {
  const index = profile.pendingClassifications.findIndex((item) => item.id === pendingId);
  if (index < 0) return false;
  const pending = profile.pendingClassifications[index];
  if (!pending.candidates.includes(target)) return false;
  const source = pending.original;
  const date = text(source.date ?? source.time);
  const commonState = createRowState('manual', `${pending.id}|${target}`);
  if (target === 'academicCompetitions' || target === 'honorsScholarships') {
    const row: HonorRow = { ...HONOR_EMPTY, kind: text(source.type) || (target === 'academicCompetitions' ? '学术' : '荣誉'), time: date, name: text(source.title ?? source.name ?? source.content), issuer: text(source.place ?? source.issuer), place: text(source.place), level: text(source.level), grade: text(source.grade), rank: text(source.role ?? source.rank), content: text(source.description ?? source.detail), state: commonState };
    (profile[target] as HonorRow[]).push(row);
  } else if (target === 'internships' || target === 'socialService' || target === 'studentWorkExperiences') {
    const row: ActivityRow = { ...ACTIVITY_EMPTY, kind: text(source.type) || text(source.kind), start: text(source.start) || date, end: text(source.end) || date, org: text(source.org ?? source.name), role: text(source.role), place: text(source.place), content: text(source.detail ?? source.description ?? source.content), state: commonState };
    (profile[target] as ActivityRow[]).push(row);
  } else {
    const row: AcademicRow = { ...ACADEMIC_EMPTY, kind: text(source.type) || text(source.kind), start: text(source.start) || date, end: text(source.end) || date, title: text(source.title ?? source.name), source: text(source.source ?? source.place), role: text(source.role), summary: text(source.description ?? source.detail ?? source.content), state: commonState };
    (profile[target] as AcademicRow[]).push(row);
  }
  profile.pendingClassifications.splice(index, 1);
  return true;
}

/** 人工纠正原子表路由。转换只保留有语义对应的列，源行删除，目标行重新标记为手工来源并锁定。 */
export function moveAtomicRow(profile: Profile, from: AtomicTableId, index: number, target: AtomicTableId): boolean {
  if (from === target || index < 0 || index >= profile[from].length) return false;
  const source = (profile[from] as unknown as Array<Record<string, unknown>>)[index];
  if ((source.state as ProfileRowState | undefined)?.locked || profile.blockLocks[from]) return false;
  const state = createRowState('manual', `move|${from}|${target}|${source.state && (source.state as ProfileRowState).id || index}`);
  if (target === 'academicCompetitions' || target === 'honorsScholarships') {
    (profile[target] as HonorRow[]).push({ ...HONOR_EMPTY, kind: text(source.kind), time: text(source.time ?? source.end ?? source.start), name: text(source.name ?? source.title ?? source.org), issuer: text(source.issuer ?? source.source ?? source.org), place: text(source.place), level: text(source.level), grade: text(source.grade), rank: text(source.rank ?? source.role), content: text(source.content ?? source.summary), state });
  } else if (target === 'internships' || target === 'socialService' || target === 'studentWorkExperiences') {
    (profile[target] as ActivityRow[]).push({ ...ACTIVITY_EMPTY, kind: text(source.kind), start: text(source.start ?? source.time), end: text(source.end ?? source.time), org: text(source.org ?? source.source ?? source.issuer), role: text(source.role ?? source.rank), place: text(source.place), content: text(source.content ?? source.summary ?? source.title ?? source.name), state });
  } else {
    (profile[target] as AcademicRow[]).push({ ...ACADEMIC_EMPTY, kind: text(source.kind), start: text(source.start ?? source.time), end: text(source.end ?? source.time), title: text(source.title ?? source.name ?? source.org), source: text(source.source ?? source.issuer ?? source.org), role: text(source.role ?? source.rank), authors: text(source.authors), itemType: text(source.itemType), level: text(source.level), status: text(source.status), summary: text(source.summary ?? source.content), advisor: text(source.advisor), partition: text(source.partition), state });
  }
  (profile[from] as unknown as Array<Record<string, unknown>>).splice(index, 1);
  return true;
}

export function setByPath(obj: unknown, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur = obj as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

export function isProfileFieldLocked(profile: Profile, path: string): boolean {
  return lockGroup(path).some((member) => !!profile.fieldStates[member]?.locked);
}

export function setProfileFieldLock(profile: Profile, path: string, locked: boolean, source: ProfileSourceKind = 'manual'): boolean {
  const group = lockGroup(path);
  if (locked && !group.every((member) => canLockProfileValue(member, getByPath(profile, member)))) return false;
  for (const member of group) {
    const prev = profile.fieldStates[member];
    profile.fieldStates[member] = { locked, source: prev?.source || source, sourceAdapterId: prev?.sourceAdapterId, sourcePageId: prev?.sourcePageId, updatedAt: new Date().toISOString(), confidence: prev?.confidence || 'verified' };
  }
  return true;
}

export interface ProfileWriteResult { ok: boolean; conflict: boolean; reason?: string; }

/** 统一写入口：锁定值不可被爬取/迁移覆盖；手工写入在成功后自动锁定。 */
export function writeProfileValue(profile: Profile, path: string, value: unknown, source: ProfileSourceKind, sourceAdapterId?: string, sourcePageId?: string): ProfileWriteResult {
  const old = text(getByPath(profile, path));
  const next = text(value);
  if (isProfileFieldLocked(profile, path) && old.trim() !== next.trim()) return { ok: false, conflict: true, reason: '字段组已锁定' };
  if (old.trim() && next.trim() && old.trim() !== next.trim() && source !== 'manual') return { ok: false, conflict: true, reason: '档案已有不同值' };
  setByPath(profile, path, next);
  const group = lockGroup(path);
  const shouldLock = source === 'manual' && group.every((member) => canLockProfileValue(member, member === path ? next : getByPath(profile, member)));
  for (const member of group) {
    profile.fieldStates[member] = { locked: shouldLock, source, sourceAdapterId, sourcePageId, updatedAt: new Date().toISOString(), confidence: source === 'crawl' || !shouldLock ? 'inferred' : 'verified' };
  }
  return { ok: true, conflict: false };
}

export function setProfileCode(profile: Profile, path: string, namespace: string, code: string, label: string, sourceAdapterId?: string): void {
  const old = profile.codebook[path];
  profile.codebook[path] = { label: label || old?.label || text(getByPath(profile, path)), codes: { ...(old?.codes || {}), [namespace]: code }, updatedAt: new Date().toISOString(), sourceAdapterId };
}

export function getProfileCode(profile: Profile, path: string, namespaces: string[]): string {
  const rec = profile.codebook[path];
  if (!rec) return '';
  for (const ns of namespaces) if (rec.codes[ns]) return rec.codes[ns];
  return '';
}

/** 把结构化列表合成一段文本，用于目标站点的长文本域。 */
export function composeListText(profile: Profile, kind: 'awards' | 'research' | 'socialPractice' | 'experiences'): string {
  if (kind === 'awards') return [...profile.academicCompetitions, ...profile.honorsScholarships].map((a) => [a.time, a.issuer || a.place, a.name, a.grade || a.level].filter(Boolean).join('，')).join('；') || profile.awards.map((a) => [a.date, a.place, a.content].filter(Boolean).join('，')).join('；');
  if (kind === 'research') return [...profile.academicPapers, ...profile.academicPatents, ...profile.academicProjects].map((r) => [r.title, r.kind, r.end || r.start, r.role, r.summary].filter(Boolean).join('，')).join('；') || profile.research.map((r) => [r.title, r.type, r.date, r.role, r.description].filter(Boolean).join('，')).join('；');
  if (kind === 'experiences') return profile.studentWorkExperiences.map((e) => [e.start && e.end ? `${e.start}至${e.end}` : e.start || e.end, e.org, e.role, e.content].filter(Boolean).join('，')).join('；') || profile.experiences.map((e) => [e.start && e.end ? `${e.start}至${e.end}` : e.start || e.end, e.org, e.role].filter(Boolean).join('，')).join('；');
  return [...profile.internships, ...profile.socialService].map((s) => [s.start && s.end ? `${s.start}至${s.end}` : s.start || s.end, s.org, s.role, s.content].filter(Boolean).join('，')).join('；') || profile.socialPractice.map((s) => [s.date, s.name, s.role, s.detail].filter(Boolean).join('，')).join('；');
}
