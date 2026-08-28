// 学校目录的多项目视图。旧 SCHOOLS 仍保持兼容，本模块负责拆分夏令营/预推免/优本计划分支。

import { capabilityStatus, SCHOOL_ADAPTER_PACKAGES } from './adapter-packages';
import { ProgramKind, SchoolEntry, SchoolProgramEntry, SCHOOLS } from './schools';

interface ProgramSeed {
  id: string;
  name: string;
  kind: ProgramKind;
  entry: string;
  adapterId?: string;
}

const OVERRIDES: Record<string, ProgramSeed[]> = {
  '北京邮电大学': [{ id: 'bupt-pre', name: '预推免', kind: 'pre-recommendation', entry: 'https://yzfs.bupt.edu.cn/MasterTm/Signin.aspx', adapterId: 'minimal-bupt-mastertm' }],
  '南京理工大学': [
    { id: 'njust-pre', name: '预推免', kind: 'pre-recommendation', entry: 'http://202.119.85.163/Open/RecruitTkssTmYbm/signin.aspx', adapterId: 'minimal-njust-tm' },
    { id: 'njust-xly', name: '夏令营', kind: 'summer-camp', entry: 'http://202.119.85.163/Open/ZsTkssXly/Signin.aspx', adapterId: 'minimal-njust-xly' },
  ],
  '兰州大学': [{ id: 'lzu-pre', name: '预推免', kind: 'pre-recommendation', entry: 'https://yjszs.lzu.edu.cn/lzuyjsytms/wlogin.html', adapterId: 'lzu-ytms' }],
  '上海海事大学': [{ id: 'shmtu-pre', name: '预推免', kind: 'pre-recommendation', entry: 'https://zhaosheng.eol.cn/10254/user/login/login', adapterId: 'shmtu-sszs' }],
  '中南财经政法大学': [{ id: 'zuel-xly', name: '夏令营', kind: 'summer-camp', entry: 'http://zncjzf.form.360eol.com/', adapterId: 'zuel-360eol-xly' }],
  '中央民族大学': [{ id: 'muc-pre', name: '预推免', kind: 'pre-recommendation', entry: 'https://yjszs.muc.edu.cn/', adapterId: 'muc-tm' }],
  '厦门大学': [{ id: 'xmu-pre', name: '预推免', kind: 'pre-recommendation', entry: 'https://ssyjsbm.xmu.edu.cn/accounts', adapterId: 'xmu-pre' }],
  '南京师范大学': [{ id: 'njnu-pre', name: '预推免', kind: 'pre-recommendation', entry: 'https://yz.njnu.edu.cn/sstm/', adapterId: 'njnu-pre' }],
  '西南财经大学': [{ id: 'swufe-pre', name: '预推免', kind: 'pre-recommendation', entry: 'https://yjsbm.swufe.edu.cn/Stu/StuLog/index', adapterId: 'swufe-pre' }],
  '天津大学': [{ id: 'tju-pre', name: '预推免', kind: 'pre-recommendation', entry: 'https://sszs.tju.edu.cn/10056/user/login', adapterId: 'tju-pre' }],
  '浙江大学': [
    { id: 'zju-xly', name: '夏令营', kind: 'summer-camp', entry: 'https://yjsy.zju.edu.cn/zs/user/login', adapterId: 'zju-xly-pre' },
    { id: 'zju-pre', name: '预推免', kind: 'pre-recommendation', entry: 'https://yjsy.zju.edu.cn/zs/user/login', adapterId: 'zju-xly-pre' },
  ],
  '吉林大学': [{ id: 'jlu-xly', name: '夏令营', kind: 'summer-camp', entry: 'https://yzbbm.jlu.edu.cn/xlybm/login', adapterId: 'jlu-xly' }],
  '昆明医科大学': [{ id: 'kmmu-xly', name: '夏令营', kind: 'summer-camp', entry: 'http://yjsgl.kmmu.edu.cn/ASPX/Student/StuLogin.aspx', adapterId: 'kmmu-xly' }],
  '广西大学': [{ id: 'gxu-pre', name: '预推免', kind: 'pre-recommendation', entry: 'https://yjsglxt.gxu.edu.cn/ZSXT/Login.aspx', adapterId: 'gxu-xly' }],
  '北京语言大学': [{ id: 'blcu-pre', name: '预推免', kind: 'pre-recommendation', entry: 'https://yanzhao.blcu.edu.cn/student/ytmlogin', adapterId: 'blcu-pre' }],
  '中国海洋大学': [{ id: 'ouc-pre', name: '预推免', kind: 'pre-recommendation', entry: 'https://stuouc.molstone.cn/#/login', adapterId: 'ouc-pre' }],
  '南开大学': [{ id: 'nankai-pre', name: '预推免', kind: 'pre-recommendation', entry: 'https://yzxt.nankai.edu.cn/intern/frontend/web/user-action/login', adapterId: 'nankai-pre' }],
  '中国人民大学': [{ id: 'ruc-pre', name: '预推免', kind: 'pre-recommendation', entry: 'https://yjsfs.ruc.edu.cn/tp/zs/login/toLogin/tm', adapterId: 'ruc-pre' }],
  '长安大学': [{ id: 'chd-xly', name: '夏令营', kind: 'summer-camp', entry: 'https://yzfw.chd.edu.cn:9091/xly/login/', adapterId: 'chd-xly' }],
  '华东理工大学': [{ id: 'ecust-pre', name: '预推免', kind: 'pre-recommendation', entry: 'https://yz.ecust.edu.cn/Login.aspx', adapterId: 'ecust-pre' }],
  '哈尔滨工业大学': [{ id: 'hit-pre', name: '预推免', kind: 'pre-recommendation', entry: 'https://hityzb.hit.edu.cn/zhxy-yjs-zs_v2/common/login', adapterId: 'hit-pre' }],
  '电子科技大学': [{ id: 'uestc-yb', name: '优本计划', kind: 'excellent-undergraduate', entry: 'https://yzbm.uestc.edu.cn/logon' }],
  '中国科学院大学': [{ id: 'ucas-pre', name: '预推免（不支持爬取）', kind: 'pre-recommendation', entry: 'https://zxsq.ucas.ac.cn/login/index/sc', adapterId: 'ucas-pre' }],
};

function hostOf(entry: string, fallback: string): string {
  try { return new URL(entry).hostname; } catch { return fallback; }
}

function capabilities(seed: ProgramSeed) {
  const adapter = seed.adapterId ? SCHOOL_ADAPTER_PACKAGES.find((item) => item.id === seed.adapterId) : undefined;
  if (!adapter) return { registerFill: 'directory' as const, formFill: 'directory' as const, pluginExtract: 'directory' as const, sessionCrawl: 'directory' as const };
  return {
    registerFill: capabilityStatus(adapter, 'registerFill'),
    formFill: capabilityStatus(adapter, 'formFill'),
    pluginExtract: capabilityStatus(adapter, 'pluginExtract'),
    sessionCrawl: capabilityStatus(adapter, 'sessionCrawl'),
  };
}

export function programsForSchool(school: SchoolEntry): SchoolProgramEntry[] {
  const seeds = OVERRIDES[school.name] || [{ id: `${school.host}-general`, name: '报名入口', kind: 'general' as ProgramKind, entry: school.entry, adapterId: school.adapter }];
  return seeds.map((seed) => ({ ...seed, host: hostOf(seed.entry, school.host), capabilities: capabilities(seed) }));
}

export const SCHOOLS_WITH_PROGRAMS: SchoolEntry[] = SCHOOLS.map((school) => ({ ...school, programs: programsForSchool(school) }));

export function findProgram(programId: string): { school: SchoolEntry; program: SchoolProgramEntry } | undefined {
  for (const school of SCHOOLS_WITH_PROGRAMS) {
    const program = school.programs?.find((p) => p.id === programId);
    if (program) return { school, program };
  }
  return undefined;
}
