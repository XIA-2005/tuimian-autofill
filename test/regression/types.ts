// 回归样本与断言模型(PLAN v3 · P01)
// 约束:类型层不复制生产填充逻辑;观测器只记录事实;样本绝不允许触发网络。
import type { Profile } from '../../src/core/profile';

/** 样本证据类型:真实验收必须 live-evidence;合成页不得冒充真实验收。 */
export type SampleKind = 'static-snapshot' | 'behavioral-fixture' | 'live-evidence';

/** 期望类别:hard=当前实现必须通过;baseline-defect=红项,由 ownerTask 接管后才转 hard。 */
export type ExpectClass = 'hard' | 'baseline-defect';

/** 应写且写对:name 为控件 name(本批样本全部使用 name 定位),expected 为精确页面值。 */
export interface MustWriteField {
  name: string;
  expected: string;
}

/** 已有值必须原样保留(值/选中态)。 */
export interface MustPreserveField {
  name: string;
  reason: string;
}

/** 禁止触碰:value=写值或事件;click=禁止点击。 */
export interface MustNotTouchField {
  name: string;
  kind: 'value' | 'click';
  reason: string;
}

export interface SampleDef {
  id: string;
  kind: SampleKind;
  /** 期望类别与接管任务卡(ownerTask 为空表示 hard)。 */
  expectation: ExpectClass;
  ownerTask?: string;
  /** 覆盖的机制用例编号(R01–R24),用于覆盖率矩阵。 */
  rxx: string[];
  /** 脱敏/合成说明。 */
  sourceNote: string;
  /** 逻辑测试 URL(脱敏,不落任何真实地址)。 */
  logicalUrl: string;
  /** 页面身份/结构说明。 */
  pageIdentity: string;
  /** 是否需要真实浏览器(行为样本=false 时用 jsdom)。 */
  browserRequired: boolean;
  /** 是否依赖 jsdom 可见性 shim(带 shim 的样本不得证明真实页面可见性)。 */
  jsdomVisibleShim: boolean;
  /** 合成档案。 */
  profile: Profile;
  /** 填充前预置值(name -> value),用于"已有值"场景。 */
  prefill?: Record<string, string>;
  /** 行为样本的内联 HTML(纯本地结构,无远程引用、无可执行脚本)。 */
  html?: string;
  /** 静态快照文件(相对项目根,由脱敏脚本生成)。 */
  staticFile?: string;
}

export interface ObserverHit {
  target: string;
  type: string;
}

/** 单样本执行报告。 */
export interface SampleReport {
  sampleId: string;
  hardOk: string[];
  hardFail: string[];
  defectObserved: string[];
  defectAbsent: string[];
  info: string[];
}
