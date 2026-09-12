// 平台适配器：按"平台指纹"（URL 特征）识别学校系统，一个平台规则可覆盖一批学校。

import { FieldRule } from './matcher';

export interface PlatformAdapter {
  id: string;
  name: string;
  /** 内置适配器可保留函数；远程规则必须使用 declarativeMatch。 */
  match?: (url: string) => boolean;
  declarativeMatch?: DeclarativeUrlMatch;
  /** 命中后自动显示悬浮面板 */
  autoShow: boolean;
  /** 平台专属的补充匹配规则（在通用规则之后追加，优先级更高时靠更长关键词取胜） */
  extraRules?: FieldRule[];
  note?: string;
}

export interface DeclarativeUrlMatch {
  hosts: string[];
  /** 简单路径 glob，仅支持 * 通配符；空数组代表任意路径。 */
  pathPatterns?: string[];
  excludePathPatterns?: string[];
}

export type SupportStatus = 'directory' | 'experimental' | 'verified' | 'drifted';

export interface AdapterCapabilities {
  registerFill: SupportStatus;
  formFill: SupportStatus;
  pluginExtract: SupportStatus;
  sessionCrawl: SupportStatus;
}

export type ControlDriverId =
  | 'text'
  | 'radio'
  | 'native-select'
  | 'date'
  | 'month-picker'
  | 'textarea'
  | 'table'
  | 'layui'
  | 'ant'
  | 'select2'
  | 'element'
  | 'school-picker'
  | 'major-picker';
// B4:已收口 driver（date-range/kendo/aspnet）从类型联合剔除——运行时遇旧包声明走 E1301 显式报错（RD-8）。

export interface AdapterFieldContract {
  nativeId?: string;
  profilePath?: string;
  extensionKey?: string;
  labels?: string[];
  selectors?: string[];
  driver: ControlDriverId;
  codeNamespace?: string;
  /** 弹窗型代码框和名称框必须显式成对声明；不得从整个表单猜第一个 dm/mc。 */
  codeSelectors?: string[];
  nameSelectors?: string[];
  /** 蓝色系统的第三个展示框，通常显示“代码 空格 名称”。 */
  displaySelectors?: string[];
  /** 日期精度覆盖；未声明时根据 input 类型、placeholder 和字段标签推断。 */
  datePrecision?: 'year' | 'month' | 'day';
  /** 页面要求的日期字符串格式；用于生成值并执行严格格式回读。 */
  dateFormat?: 'yyyy' | 'yyyyMM' | 'yyyy-MM' | 'yyyy/MM' | 'yyyy年MM月' | 'yyyyMMdd' | 'yyyy-MM-dd' | 'yyyy/MM/dd' | 'yyyy年MM月dd日';
  dateModelSelectors?: string[];
  datePanelSelectors?: string[];
  componentDriver?: 'ant' | 'select2' | 'element' | 'layui';
  /** 仅允许声明式选择器和 frame 名称；执行逻辑固定在扩展内核。 */
  picker?: {
    protocol?: 'minimal' | 'blue-flat';
    triggerSelectors?: string[];
    frameNames?: string[];
    frameSrcPatterns?: string[];
    searchInputSelectors?: string[];
    queryButtonSelectors?: string[];
    resultRowSelectors?: string[];
    chooseSelectors?: string[];
    categorySelectSelectors?: string[];
  };
  readonly?: boolean;
  /** F08b:该字段依赖的其它字段 profilePath(如专业依赖院校);执行器按稳定拓扑序填写,父失败只阻塞依赖者。 */
  dependsOn?: string[];
  /** 依赖控件的就绪证据；只允许声明式选择器及有界时间，不允许执行页面脚本。 */
  dependencyWait?: {
    readySelector?: string;
    timeoutMs?: number;
    settleMs?: number;
  };
}

export interface AdapterPageContract {
  id: string;
  name: string;
  pathPatterns: string[];
  titlePatterns?: string[];
  requiredSelectors?: string[];
  forbiddenSelectors?: string[];
  /** 真实页面验收后记录的允许结构指纹；命中路径但不命中指纹时立即停止专项采集。 */
  expectedFingerprints?: string[];
  role: 'form' | 'crawl-only' | 'shell' | 'upload' | 'print' | 'result';
  safeNavigationSelectors?: string[];
  /** 仅用于用户主动开启“连续填写”后定位下一步；按钮文字仍由内核二次校验。 */
  nextSelectors?: string[];
  /** 点击下一步前及服务器驳回后需要检查的页面错误容器。 */
  validationErrorSelectors?: string[];
  /** 反向采集时必须忽略的历史值、页面标记等控件。 */
  extractIgnoreSelectors?: string[];
  fields?: AdapterFieldContract[];
}

export interface DiscoveredCrawlPage {
  /** 必须与 pages 中的页面 id 一致。 */
  pageId: string;
  /** 只接受链接可见文本的精确匹配，禁止模糊命中上传、提交等页面。 */
  linkTexts: string[];
  /** 动态令牌之外仍稳定的栏目路径白名单；发现链接和发起 GET 前均需命中。 */
  pathPatterns: string[];
}

export interface AdapterCrawlPlan {
  mode: 'plugin' | 'session' | 'guided';
  /** 会话爬取只允许访问这里声明的同源 GET/只读页面。 */
  readOnlyPaths?: string[];
  /** URL 含会话令牌时，从当前登录页面按精确栏目文本发现同源只读页。 */
  discoveredPages?: DiscoveredCrawlPage[];
  pageOrder: string[];
  blockPathPatterns?: string[];
}

export interface SchoolAdapterPackage {
  schemaVersion: 1;
  id: string;
  version: string;
  minCoreVersion: string;
  schoolName: string;
  programName: string;
  family: 'blue' | 'minimal' | 'jingzhi' | 'cover' | 'other';
  match: DeclarativeUrlMatch;
  capabilities: AdapterCapabilities;
  pages: AdapterPageContract[];
  crawl: AdapterCrawlPlan;
  projectionPolicy: string;
  codeNamespaces?: string[];
  commitPolicy: 'never' | 'manual-save-only' | 'validated-next-only';
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
  return adapters.find((a) => adapterMatches(a, url));
}

function globRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

export function declarativeMatchUrl(rule: DeclarativeUrlMatch, rawUrl: string): boolean {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return false; }
  const host = url.hostname.toLowerCase();
  if (!rule.hosts.some((h) => h === '*' || host === h.toLowerCase() || (h.startsWith('*.') && host.endsWith(h.slice(1).toLowerCase())))) return false;
  const path = `${url.pathname}${url.search}`;
  if (rule.excludePathPatterns?.some((p) => globRegex(p).test(path))) return false;
  return !rule.pathPatterns?.length || rule.pathPatterns.some((p) => globRegex(p).test(path));
}

export function adapterMatches(adapter: PlatformAdapter, url: string): boolean {
  if (adapter.declarativeMatch && declarativeMatchUrl(adapter.declarativeMatch, url)) return true;
  return typeof adapter.match === 'function' ? adapter.match(url) : false;
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
