// 个人档案 Schema：所有字段均保存在浏览器本地，由用户自行填写。
export interface Award {
  /** 时间（如 2025-12） */
  date: string;
  /** 地点（颁发单位，如 西安理工大学） */
  place: string;
  /** 内容（奖项内容，如 尚真笃学先进个人奖金500元） */
  content: string;
  /** 级别（旧档案迁移保留；南理工"奖励原因"列按此填写） */
  level?: string;
  /** 本人角色/排名（旧档案迁移保留） */
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
  /** 时间 */
  date: string;
  /** 活动名称 */
  name: string;
  /** 担任职务 */
  role: string;
  /** 具体内容 */
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
    /** 是否服从专业调剂（是/否） */
    obeyAdjust: string;
  };
  awards: Award[];
  research: ResearchItem[];
  socialPractice: SocialPractice[];
  experiences: Experience[];
  familyMembers: FamilyMember[];
  selfStatements: SelfStatement[];
  applications: Application[];
}

export function emptyProfile(): Profile {
  return {
    version: 1,
    basic: {
      name: '',
      namePinyin: '',
      gender: '',
      idType: '居民身份证',
      idCard: '',
      birthday: '',
      nation: '',
      politicalStatus: '',
      hometown: '',
      birthPlace: '',
      hukou: '',
      country: '中国',
      address: '',
      postalCode: '',
      phone: '',
      landline: '',
      email: '',
      qq: '',
      wechat: '',
      maritalStatus: '',
      health: '',
      emergencyName: '',
      emergencyPhone: '',
      tuimianQual: '',
      militaryStatus: '非军人',
    },
    education: {
      university: '',
      province: '',
      college: '',
      major: '',
      className: '',
      studentId: '',
      startDate: '',
      endDate: '',
      gpa: '',
      score: '',
      rank: '',
      comprehensiveRank: '',
      gradeRank: '',
      rankBase: '',
      rankUnit: '',
      foreignLang: '英语',
      cet4: '',
      cet4Date: '',
      cet6: '',
      cet6Date: '',
      otherExams: '',
      obeyAdjust: '',
    },
    awards: [],
    research: [],
    socialPractice: [],
    experiences: [],
    familyMembers: [],
    selfStatements: [],
    applications: [],
  };
}

/** 把任意来源的对象安全地归一化为 Profile（兼容旧版本/手工编辑的 JSON） */
/** 旧版获奖结构 {name, level, date, role} → 新版 {date, place, content}（name 带"学校·奖项"前缀时拆成地点+内容；无前缀时地点回退为毕业院校） */
function migrateAwards(raw: unknown, university: string): Award[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it): Award => {
      const a = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>;
      if (a.content !== undefined || a.place !== undefined) {
        return {
          date: String(a.date ?? ''),
          place: String(a.place ?? ''),
          content: String(a.content ?? ''),
          level: a.level ? String(a.level) : undefined,
          role: a.role ? String(a.role) : undefined,
        };
      }
      const name = String(a.name ?? '');
      const sep = name.indexOf('·');
      const place = sep > 0 ? name.slice(0, sep) : university;
      const content = sep > 0 ? name.slice(sep + 1) : name;
      return {
        date: String(a.date ?? ''),
        place,
        content,
        level: a.level ? String(a.level) : undefined,
        role: a.role ? String(a.role) : undefined,
      };
    })
    .filter((a) => a.content || a.place || a.date);
}

export function normalizeProfile(raw: unknown): Profile {
  const base = emptyProfile();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const basic = (r.basic && typeof r.basic === 'object' ? r.basic : {}) as Record<string, unknown>;
  const education = (r.education && typeof r.education === 'object' ? r.education : {}) as Record<string, unknown>;
  return {
    version: 1,
    basic: { ...base.basic, ...(basic as Partial<Profile['basic']>) },
    education: { ...base.education, ...(education as Partial<Profile['education']>) },
    awards: migrateAwards(r.awards, String(education.university || '')),
    research: Array.isArray(r.research) ? (r.research as ResearchItem[]) : [],
    socialPractice: Array.isArray(r.socialPractice)
      ? (r.socialPractice as Array<Record<string, unknown>>).map((it) => ({
          date: String(it.date ?? it.time ?? ''),
          name: String(it.name ?? it.org ?? ''),
          role: String(it.role ?? ''),
          detail: String(it.detail ?? it.description ?? ''),
        }))
      : [],
    experiences: Array.isArray(r.experiences) ? (r.experiences as Experience[]) : [],
    familyMembers: Array.isArray(r.familyMembers) ? (r.familyMembers as FamilyMember[]) : [],
    selfStatements: Array.isArray(r.selfStatements) ? (r.selfStatements as SelfStatement[]) : [],
    applications: Array.isArray(r.applications) ? (r.applications as Application[]) : [],
  };
}

export function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj);
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

/** 把结构化列表合成一段文本，用于填入"获奖情况/科研经历"等长文本域 */
export function composeListText(profile: Profile, kind: 'awards' | 'research' | 'socialPractice' | 'experiences'): string {
  if (kind === 'awards') {
    return profile.awards.map((a) => [a.date, a.place, a.content].filter((x) => x && String(x).trim()).join('，')).join('；');
  }
  if (kind === 'research') {
    return profile.research.map((r) => [r.title, r.type, r.date, r.role, r.description].filter((x) => x && String(x).trim()).join('，')).join('；');
  }
  if (kind === 'experiences') {
    return profile.experiences
      .map((e) => [e.start && e.end ? `${e.start}至${e.end}` : e.start || e.end, e.org, e.role].filter((x) => x && String(x).trim()).join('，'))
      .join('；');
  }
  return profile.socialPractice.map((s) => [s.date, s.name, s.role, s.detail].filter((x) => x && String(x).trim()).join('，')).join('；');
}
