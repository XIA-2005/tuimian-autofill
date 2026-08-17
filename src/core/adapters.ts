// 平台适配器：按"平台指纹"（URL 特征）识别学校系统，一个平台规则可覆盖一批学校。

import { FieldRule } from './matcher';

export interface PlatformAdapter {
  id: string;
  name: string;
  match: (url: string) => boolean;
  /** 命中后自动显示悬浮面板 */
  autoShow: boolean;
  /** 平台专属的补充匹配规则（在通用规则之后追加，优先级更高时靠更长关键词取胜） */
  extraRules?: FieldRule[];
  note?: string;
}

export const ADAPTERS: PlatformAdapter[] = [
  {
    id: 'wisedu-gsapp',
    name: '研招统一平台（gsapp + 统一身份认证 authserver）',
    match: (u) => /gsapp\/sys\//i.test(u) || /\/authserver\/(login|index)/i.test(u),
    autoShow: true,
    note: '西安电子科技大学等高校共用平台；登录页验证码需人工填写。',
  },
  {
    id: 'dlut',
    name: '大连理工大学研究生报考服务系统',
    match: (u) => /yjszs\.dlut\.edu\.cn/i.test(u),
    autoShow: true,
    note: '自建系统（jQuery + 服务端表格表单），推免生预报名入口为系统内"推免生预报名"。',
  },
  {
    id: 'ecust',
    name: '华东理工大学招生考务管理平台',
    match: (u) => /yz\.ecust\.edu\.cn/i.test(u),
    autoShow: true,
    note: '表单常位于子框架（iframe）内；学院/专业等多为页内浮层选择。',
  },
  {
    id: 'hhu',
    name: '河海大学研究生招生管理系统',
    match: (u) => /yzss\.hhu\.edu\.cn/i.test(u),
    autoShow: true,
    note: '多页签表单；政治面貌选项为全称；含"现役军人码"字段。',
  },
  {
    id: 'nuaa',
    name: '南京航空航天大学研究生报考服务系统',
    match: (u) => /yzsbm\.nuaa\.edu\.cn/i.test(u),
    autoShow: true,
    note: '已提交/查看状态下控件多为只读或禁用；可用「从本页提取档案」把已填信息搬进本地档案。',
  },
  {
    id: 'njust',
    name: '南京理工大学硕士（推荐免试）研究生招生预报名系统',
    match: (u) => /202\.119\.85\.163|RecruitTkssTmYbm|ExamineeEditTmYbm/i.test(u),
    autoShow: true,
    note: 'ASP.NET WebForms；籍贯/出生地/户口地为"显示框+隐藏编码"弹窗对，学习或工作经历为表格。',
  },
  {
    id: 'bupt',
    name: '北京邮电大学推免生招生系统（MasterTm）',
    match: (u) => /yzfs\.bupt\.edu\.cn/i.test(u),
    autoShow: true,
    note: 'ASP.NET 多页签（Apply1 外语/成绩/排名、Apply2 志愿、Apply3 表格）。志愿院系/专业走"选择"弹窗；家庭成员/经历/课程用"添加"加行；请先在档案里填好"平均成绩"。',
  },
  {
    id: 'dhu',
    name: '东华大学研究生报考服务系统',
    match: (u) => /yzbm\.dhu\.edu\.cn/i.test(u),
    autoShow: true,
    note: '12 步报名流程（基本信息/家庭主要成员/学习信息/外语水平/学习和工作经历/学术成果/奖励情况/申请信息/上传照片/上传材料）。出生地/籍贯/户口所在地为 layui 弹层内嵌地区树（treeSelectPage?lbcode=area），逐级点选后自动回填隐藏编码与名称框。',
  },
];

export interface RemoteAdapterSet {
  adapters?: PlatformAdapter[];
}

export function matchAdapter(url: string, adapters: PlatformAdapter[] = ADAPTERS): PlatformAdapter | undefined {
  return adapters.find((a) => a.match(url));
}

/** URL 出现这些特征时也自动显示面板（覆盖未登记的平台） */
export const AUTO_SHOW_PATTERN = /yjszs|yzss|yzsbm|gsapp|tmybm|zsbm|yzb|sstm|authserver|yjspt|graduate|kaoyan|研究生|推免|保研|夏令营/i;

export function extraRulesFor(url: string, adapters: PlatformAdapter[] = ADAPTERS): FieldRule[] {
  const a = matchAdapter(url, adapters);
  return a && a.extraRules ? a.extraRules : [];
}

/** 静态 + 远程适配器合并 */
export function allAdapters(remote: RemoteAdapterSet | null | undefined): PlatformAdapter[] {
  return remote && remote.adapters && remote.adapters.length ? [...ADAPTERS, ...remote.adapters] : ADAPTERS;
}
