// 八类原子表 → 目标学校旧式接收栏投影。
// 投影只生成临时兼容视图，不修改用户的原子档案，也不会把无接收栏的数据硬塞进相近栏目。

import { ActivityRow, AtomicTableId, HonorRow, Profile, ResearchItem } from './profile';

export interface ProjectionPolicy {
  id: string;
  research: AtomicTableId[];
  awards: AtomicTableId[];
  socialPractice: AtomicTableId[];
  experiences: AtomicTableId[];
}

export interface ProjectionReport {
  policyId: string;
  included: Record<string, number>;
  skipped: Array<{ table: AtomicTableId; count: number; reason: string }>;
}

export const PROJECTION_POLICIES: Record<string, ProjectionPolicy> = {
  default: {
    id: 'default',
    research: ['academicPapers', 'academicPatents', 'academicProjects'],
    awards: ['academicCompetitions', 'honorsScholarships'],
    socialPractice: ['internships', 'socialService'],
    experiences: ['studentWorkExperiences'],
  },
  blue: {
    id: 'blue',
    research: ['academicPapers', 'academicPatents', 'academicProjects', 'academicCompetitions'],
    awards: ['honorsScholarships'],
    socialPractice: ['internships', 'socialService'],
    experiences: ['studentWorkExperiences'],
  },
  seu: {
    id: 'seu',
    research: ['academicPapers', 'academicPatents', 'academicCompetitions'],
    awards: ['honorsScholarships'],
    socialPractice: ['academicProjects', 'internships', 'studentWorkExperiences', 'socialService'],
    experiences: [],
  },
  hit: {
    id: 'hit',
    research: ['academicPapers', 'academicPatents', 'academicProjects'],
    awards: ['academicCompetitions', 'honorsScholarships'],
    socialPractice: ['internships', 'socialService'],
    experiences: ['studentWorkExperiences'],
  },
  zju: {
    id: 'zju',
    research: ['academicPapers', 'academicPatents', 'academicProjects'],
    awards: ['academicCompetitions', 'honorsScholarships'],
    socialPractice: ['internships', 'socialService'],
    experiences: ['studentWorkExperiences'],
  },
};

function academicToResearch(row: any): ResearchItem {
  return {
    title: String(row.title || row.name || ''),
    type: String(row.kind || ''),
    date: String(row.end || row.start || row.time || ''),
    role: String(row.role || row.rank || ''),
    description: String(row.summary || row.content || row.source || row.issuer || ''),
  };
}

function honorToAward(row: HonorRow) {
  return {
    date: row.time,
    place: row.issuer || row.place,
    content: row.name,
    level: row.grade || row.level,
    role: row.rank,
  };
}

function activityToPractice(row: ActivityRow) {
  return {
    date: row.start && row.end ? `${row.start}-${row.end}` : row.start || row.end,
    name: row.org,
    role: row.role,
    detail: row.content,
  };
}

function activityToExperience(row: ActivityRow) {
  return { start: row.start, end: row.end, org: row.org, role: row.role };
}

function rows(profile: Profile, id: AtomicTableId): any[] {
  return Array.isArray(profile[id]) ? profile[id] as any[] : [];
}

export function projectionPolicy(id?: string): ProjectionPolicy {
  return PROJECTION_POLICIES[id || ''] || PROJECTION_POLICIES.default;
}

/**
 * 为现有填充内核生成临时 Profile。原子表保持原样，只有四个 V1 兼容列表按目标校策略重建。
 */
export function projectProfile(profile: Profile, policyOrId?: ProjectionPolicy | string): { profile: Profile; report: ProjectionReport } {
  const policy = typeof policyOrId === 'string' || !policyOrId ? projectionPolicy(policyOrId || '') : policyOrId;
  const out = { ...profile } as Profile;
  const hasAtomicRows = (Object.keys(PROJECTION_POLICIES.default) as Array<keyof ProjectionPolicy>)
    .filter((key) => Array.isArray(PROJECTION_POLICIES.default[key]))
    .flatMap((key) => PROJECTION_POLICIES.default[key] as AtomicTableId[])
    .some((id) => rows(profile, id).length > 0);
  if (!hasAtomicRows) {
    return { profile: out, report: { policyId: policy.id, included: {}, skipped: [] } };
  }
  out.research = policy.research.flatMap((id) => rows(profile, id).map(academicToResearch));
  out.awards = policy.awards.flatMap((id) => rows(profile, id).map((row) => honorToAward(row as HonorRow)));
  out.socialPractice = policy.socialPractice.flatMap((id) => rows(profile, id).map((row) => {
    if (id === 'academicProjects') {
      const r = row as any;
      return { date: r.start && r.end ? `${r.start}-${r.end}` : r.start || r.end, name: r.title, role: r.role, detail: r.summary || r.source };
    }
    return activityToPractice(row as ActivityRow);
  }));
  out.experiences = policy.experiences.flatMap((id) => rows(profile, id).map((row) => activityToExperience(row as ActivityRow)));

  const used = new Set<AtomicTableId>([...policy.research, ...policy.awards, ...policy.socialPractice, ...policy.experiences]);
  const all: AtomicTableId[] = ['academicPapers', 'academicPatents', 'academicProjects', 'academicCompetitions', 'honorsScholarships', 'internships', 'socialService', 'studentWorkExperiences'];
  const included: Record<string, number> = {};
  for (const id of used) included[id] = rows(profile, id).length;
  const skipped = all.filter((id) => !used.has(id) && rows(profile, id).length).map((id) => ({ table: id, count: rows(profile, id).length, reason: '目标学校没有声明对应接收栏' }));
  return { profile: out, report: { policyId: policy.id, included, skipped } };
}
