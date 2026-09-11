// 字段匹配器：根据控件周围的文本（label/表格单元格/父节点）及其属性（name/id/placeholder）
// 推断该控件对应的档案字段。拼音缩写别名只在属性线索上匹配，避免误伤。

export type ControlEl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export interface FieldRule {
  /** 档案字段路径，如 basic.name；compose.* / #xxx 为特殊合成字段 */
  field: string;
  /** 匹配关键词（作用于 标签文本 + 属性，归一化后包含匹配） */
  keywords: string[];
  /** 排除词：出现即不匹配 */
  negative?: string[];
  /** 仅对 name/id/placeholder 属性匹配的拼音/英文缩写 */
  attrOnly?: string[];
  control?: 'input' | 'select' | 'textarea' | 'any';
  /** 从结构化列表合成文本填充 */
  compose?: 'awards' | 'research' | 'socialPractice' | 'experiences';
  /** 从档案推导填充值 */
  derive?: 'cet4Pass' | 'cet6Pass' | 'cetSummary' | 'rankPercent' | 'studyDuration' | 'applyMajor' | 'applyType' | 'hasSupervisor' | 'universityProvince' | 'applyCollege' | 'applyDirection';
  /** 人工长文提示：匹配后标记为跳过并显示该提示（个人陈述/自述等无档案数据的长文） */
  manual?: string;
}

export const FIELD_RULES: FieldRule[] = [
  // ============ 基本信息 ============
  { field: 'basic.name', keywords: ['姓名', '名字', '真实姓名', '学生姓名', '考生姓名', '申请人姓名', '本人姓名', '您的姓名'], negative: ['导师', '家长', '父亲', '母亲', '父母', '联系人', '紧急', '担保', '推荐人', '监护人', '家庭成员'], attrOnly: ['name', 'fullname', 'realname', 'xingming', 'xm'], control: 'input' },
  { field: 'basic.namePinyin', keywords: ['姓名拼音', '拼音', '英文姓名', '英文名'], attrOnly: ['namepinyin', 'pinyin', 'englishname'], control: 'input' },
  { field: 'basic.gender', keywords: ['性别'], attrOnly: ['gender', 'sex', 'xingbie', 'xb'], control: 'any' },
  { field: 'basic.idType', keywords: ['证件类型', '证件种类', '身份证件类型'], attrOnly: ['idtype', 'cardtype'], control: 'any' },
  { field: 'basic.idCard', keywords: ['身份证号', '身份证号码', '身份证件号', '证件号码', '公民身份号码', '身份证'], negative: ['类型', '种类'], attrOnly: ['idcard', 'idnumber', 'idno', 'sfzh', 'cardno'], control: 'input' },
  { field: 'basic.birthday', keywords: ['出生日期', '出生年月', '出生时间', '生日'], attrOnly: ['birthday', 'birthdate', 'birth', 'csrq', 'dob'], control: 'input' },
  { field: 'basic.nation', keywords: ['民族'], attrOnly: ['nation', 'ethnic', 'minzu', 'mz'], control: 'select' },
  { field: 'basic.politicalStatus', keywords: ['政治面貌', '政治面目', '政治身份', '党团'], attrOnly: ['politics', 'zzmm'], control: 'any' },
  { field: 'basic.hometown', keywords: ['籍贯', '祖籍', '原籍', '籍贯地', '籍贯所在地', '生源地'], attrOnly: ['nativeplace', 'jg'], control: 'input' },
  { field: 'basic.birthPlace', keywords: ['出生地', '出生地点', '出生所在地'], attrOnly: ['birthplace', 'csd'], control: 'input' },
  { field: 'basic.hukou', keywords: ['户口所在地', '户口地', '户籍所在地', '户籍地', '户口所在地省市区'], attrOnly: ['hkszd', 'hkdm'], control: 'any' },
  { field: 'basic.militaryStatus', keywords: ['现役军人码', '现役军人', '军人身份', '现役军人情况'], control: 'select' },
  { field: 'basic.country', keywords: ['国籍', '国家或地区', '国家地区'], attrOnly: ['country', 'nationality'], control: 'any' },
  { field: 'basic.maritalStatus', keywords: ['婚姻状况', '婚否'], attrOnly: ['marriage', 'marital'], control: 'select' },
  { field: 'basic.health', keywords: ['健康状况', '身体状况'], control: 'any' },
  // ============ 联系方式 ============
  { field: 'basic.phone', keywords: ['手机号', '手机号码', '手机', '移动电话', '联系电话', '电话号码', '联系手机', '联系方式', '本人联系电话', '联系电话常用'], negative: ['紧急', '家长', '父母', '监护人', '家庭', '座机', '固话', '导师', '推荐人', '联系人', '担保', '紧急联系人'], attrOnly: ['phone', 'mobile', 'telephone', 'sjh', 'lxdh'], control: 'input' },
  { field: 'basic.landline', keywords: ['固定电话', '座机', '宅电', '家庭电话'], attrOnly: ['landline', 'gddh'], control: 'input' },
  { field: 'basic.emergencyName', keywords: ['紧急联系人', '联系人姓名', '家长姓名', '父母姓名', '监护人', '应急联系人', '应急联系人姓名', '监护人姓名'], negative: ['电话', '手机'], attrOnly: ['emergencyname', 'emergencycontact', 'lxr'], control: 'input' },
  { field: 'basic.emergencyPhone', keywords: ['紧急联系电话', '联系人电话', '家长电话', '父母电话', '监护人电话', '亲属电话', '应急联系人电话', '应急联系人手机', '监护人手机', '家长手机'], attrOnly: ['emergencyphone', 'lxrdh'], control: 'input' },
  { field: 'basic.postalCode', keywords: ['通信地址邮政编码', '通讯地址邮政编码', '通信地址邮编', '通讯地址邮编', '邮政编码', '邮编', '家庭详细地址邮编'], attrOnly: ['zipcode', 'postcode', 'zip', 'yzbm'], control: 'input' },
  { field: 'basic.address', keywords: ['通讯地址', '通信地址', '联系地址', '家庭住址', '家庭地址', '现居住址', '居住地址', '邮寄地址', '住址', '现居住地址', '详细地址', '收件地址', '家庭详细地址'], attrOnly: ['address', 'addr', 'txdz'], control: 'input' },
  { field: 'basic.email', keywords: ['电子邮箱', '电子信箱', '电子邮件', '邮箱', 'e-mail', 'email', '邮箱地址', '联系邮箱', '常用邮箱'], attrOnly: ['email', 'mail', 'e_mail', 'dzxx'], control: 'input' },
  { field: 'basic.qq', keywords: ['qq号', 'qq号码'], attrOnly: ['qq'], control: 'input' },
  { field: 'basic.wechat', keywords: ['微信号', '微信'], attrOnly: ['wechat', 'weixin', 'wx'], control: 'input' },
  // ============ 教育背景 ============
  { field: 'education.university', keywords: ['本科学校', '毕业学校', '毕业院校', '就读学校', '就读院校', '所在学校', '学校名称', '院校名称', '院校', '本科就读学校', '本科就读学校全称', '本科院校', '本科院校官方全称', '就读高校', '所在高校', '生源学校', '本科所在学校'], negative: ['高中', '中学', '小学', '报考', '拟', '目标', '意向', '硕士', '博士', '研究生'], attrOnly: ['school', 'university', 'byyx', 'bxyz', 'xxmc', 'schoolname'], control: 'input' },
  { field: 'education.province', keywords: ['院校所在省市', '学校所在省市', '就读院校省市', '所在省市', '院校省份'], negative: ['县'], derive: 'universityProvince', control: 'select' },
  { field: 'education.college', keywords: ['所在学院', '学院名称', '所属学院', '院系', '系所', '系别', '二级学院', '学院', '本科所在院系', '本科所在学院', '本科院系', '本科就读院系', '本科专业所属学院'], negative: ['专业', '申请', '报考', '拟', '意向', '目标', '调剂'], attrOnly: ['department', 'faculty', 'yuanxi'], control: 'input' },
  { field: 'education.major', keywords: ['专业名称', '所学专业', '本科专业', '就读专业', '专业', '本科所学专业', '本科所学专业全称', '本科专业全称', '本科就读专业', '院系及专业', '本科所在院系及专业'], negative: ['方向', '拟', '报考', '意向', '志愿', '申请', '调剂', '服从', '招生'], attrOnly: ['major', 'zhuanye', 'zy'], control: 'input' },
  { field: 'education.className', keywords: ['班级'], attrOnly: ['classname', 'bj'], control: 'input' },
  { field: 'education.studentId', keywords: ['学号', '在校学号', '学生证号', '本科学号', '本科生学号', '在校生注册学号'], attrOnly: ['studentid', 'studentno', 'sno', 'xh'], control: 'input' },
  { field: 'education.startDate', keywords: ['入学时间', '入学日期', '入学年月', '入学年份', '本科入学年月', '本科入学年份'], attrOnly: ['enrolldate', 'rxsj', 'rxny'], control: 'input' },
  { field: 'education.endDate', keywords: ['毕业时间', '毕业日期', '毕业年月', '预计毕业时间', '预毕业年月', '预计毕业', '本科毕业年月', '拟毕业时间', '期望毕业时间', '毕业年份'], attrOnly: ['graduatedate', 'bysj', 'byny'], control: 'input' },
  { field: '#studyDuration', keywords: ['本科学制', '本科学制年限', '本科年制'], attrOnly: ['bkxz'], derive: 'studyDuration', control: 'any' },
  { field: 'education.gpa', keywords: ['gpa', '绩点', '平均学分绩', '平均绩点', '学分绩点', '成绩绩点', '平均学分绩点', '专业绩点', 'gpa绩点'], attrOnly: ['jidian', 'jd'], control: 'input' },
  { field: 'education.score', keywords: ['平均成绩', '加权成绩', '加权平均分', '平均分', '学业成绩', '本人本科前三年平均成绩', '本科成绩'], attrOnly: ['averagescore'], control: 'input' },
  // 广工大 PMBFB 要求“排名百分比”，档案只保存整数名次和总人数，因此按 名次÷人数×100 推导。
  { field: '#rankPercent', keywords: ['排名（百分比）', '排名百分比', '排名比例', '专业排名百分比'], negative: ['整数'], attrOnly: ['pmbfb'], derive: 'rankPercent', control: 'input' },
  // “专业同年级的排名（整数）”虽含“年级”，语义仍是专业整数名次，必须先于通用年级排名规则命中。
  { field: 'education.rank', keywords: ['专业同年级的排名（整数）', '专业同年级排名（整数）', '排名（整数）'], negative: ['人数', '比例', '百分比'], attrOnly: ['szzytnjpm'], control: 'input' },
  { field: 'education.rank', keywords: ['专业排名', '专业内排名', '成绩排名', '排名名次', '排名', '本科专业排名', '本科排名', '本科所在专业排名', '专业课排名'], negative: ['人数', '比例', '百分比', '综合', '年级'], attrOnly: ['majorrank', 'pm'], control: 'input' },
  { field: 'education.comprehensiveRank', keywords: ['综合排名', '综合测评排名', '综测排名'], negative: ['人数'], attrOnly: ['comprehensiverank', 'zhpm'], control: 'input' },
  { field: 'education.gradeRank', keywords: ['年级排名', '全年级排名'], negative: ['人数'], attrOnly: ['graderank', 'njpm'], control: 'input' },
  { field: 'education.rankBase', keywords: ['所在专业同年级人数', '专业同年级人数', '专业人数', '排名人数', '总人数', '年级总人数', '排名基数', '专业年级人数', '本科所在专业人数', '专业总人数', '排名总人数', '班级总人数'], attrOnly: ['szzytnjrs', 'ranktotal'], control: 'input' },
  { field: 'education.rankUnit', keywords: ['排名单位', '排名范围'], attrOnly: ['rankunit'], control: 'select' },
  { field: 'education.foreignLang', keywords: ['所学语种', '外语语种', '语种'], attrOnly: ['foreignlang', 'language'], control: 'select' },
  { field: 'basic.tuimianQual', keywords: ['预计能否获得推免资格', '能否获得推免资格', '是否获得推免资格', '是否推免', '推免资格', '保研资格', '有无推免资格', '是否有推免资格', '预计是否拥有保研资格', '预估是否具有推免资格', '是否能取得推免资格', '推免资格情况'], attrOnly: ['tuimian'], control: 'any' },
  { field: 'education.obeyAdjust', keywords: ['是否服从专业调剂', '是否服从调剂', '服从专业调剂', '服从调剂', '是否愿意调剂', '调剂意愿'], control: 'any' },
  { field: 'education.cet4', keywords: ['四级成绩', '英语四级', '英语成绩', 'cet4', 'cet-4'], negative: ['六级'], control: 'input' },
  { field: 'education.cet6', keywords: ['六级成绩', '英语六级', 'cet6', 'cet-6'], control: 'input' },
  // ============ 档案推导字段 ============
  { field: '#cet4Pass', keywords: ['国家四级', '英语四级是否通过', '四级是否通过'], derive: 'cet4Pass', control: 'any' },
  // 外语水平单输入框（海大等）：合成四六级摘要文本
  { field: '#cetSummary', keywords: ['外语水平', '英语水平', '外语水平情况', '英语能力'], negative: ['名称', '成绩', '考试', '时间'], derive: 'cetSummary', control: 'input' },
  { field: '#cet6Pass', keywords: ['国家六级', '英语六级是否通过', '六级是否通过'], derive: 'cet6Pass', control: 'any' },
  { field: '#applyType', keywords: ['申请类型'], derive: 'applyType', control: 'select' },
  { field: '#applyMajor', keywords: ['申请专业', '报考专业', '拟申请专业', '意向报考专业', '意向专业', '志愿专业', '兴趣专业', '第一意向研究生学习专业'], derive: 'applyMajor', control: 'any' },
  { field: '#applyCollege', keywords: ['申请学院', '报考学院', '报考院系', '意向学院', '意向院系'], derive: 'applyCollege', control: 'any' },
  { field: '#applyDirection', keywords: ['研究方向', '意向研究方向', '研究兴趣', '意向深造方向'], derive: 'applyDirection', control: 'any' },
  { field: '#hasSupervisor', keywords: ['是否有意向导师', '有意向导师', '意向导师', '第一意向导师', '报考导师姓名', '意向导师志愿1'], derive: 'hasSupervisor', control: 'any' },
  // ============ 长文本合成（获奖/科研/实践，人工审核） ============
  { field: 'compose.awards', keywords: ['获奖情况', '获奖经历', '奖励情况', '所获奖励', '荣誉奖励', '获奖', '奖励处分', '获奖荣誉', '奖惩记录', '奖惩情况', '申请人获奖', '学生奖惩情况', '曾获奖励', '主要获奖情况', '获奖情况校级及以上', '竞赛获奖', '何时获得何种奖励', '荣誉称号', '奖励正文', '本科期间校级以上', '学生奖励情况'], attrOnly: ['awards', 'honors', 'jlcf'], control: 'textarea', compose: 'awards' },
  { field: 'compose.research', keywords: ['科研经历', '科研情况', '研究经历', '学术经历', '论文发表', '发表论文', '项目经历', '竞赛经历', '竞赛情况', '学科竞赛', '参加科研工作', '参与科研工作', '参与科研工作发表学术成果等情况', '参加科研工作、课外科技活动情况', '科研活动情况', '在校期间参加科研活动', '科研训练', '科研兴趣', '科研经历及成果', '科研经历与成果', '科研及成果', '发表文章情况', '论文发表情况', '发表的主要学术论文', '已发表论文', '论文正文', '学术能力说明', '支撑学术能力', '学术成果', '已取得专利', '专利正文', '获取专利授权', '竞赛正文'], attrOnly: ['research', 'fblw'], control: 'textarea', compose: 'research' },
  { field: 'compose.socialPractice', keywords: ['社会实践', '实践经历', '社会工作', '实习经历', '学生工作', '社团经历', '社会活动', '在校期间参加社会实践', '社会实践情况', '活动总结', '实践描述', '实习实践', '实习工作经历', '含学生工作'], attrOnly: ['practice', 'internship'], control: 'textarea', compose: 'socialPractice' },
  { field: 'compose.experiences', keywords: ['学习和工作经历', '学习工作经历'], attrOnly: ['experience'], control: 'textarea', compose: 'experiences' },
  // ============ 人工长文（个人陈述/自述类：无档案数据，提示人工撰写；放最后避免吞掉上面的合成规则） ============
  { field: '#manualEssay', keywords: ['个人陈述', '个人自述', '本人自述', '本人陈述', '自我陈述', '自我介绍', '个人简介', '个人情况简介', '考生个人自述', '申请理由', '职业规划', '研究计划', '计划从事的研究内容', '计划从事的研究', '个人简历', '特长爱好', '兴趣专长', '第一推荐人', '第二推荐人', '推荐人信息', '作弊情况', '备注', '备注信息', '备用信息', '其他说明', '其它情况说明'], control: 'textarea', manual: '长文自述类（个人陈述/自述/研究计划等）：无档案数据，请人工撰写粘贴' },
];

/** 归一化文本：去空白/标点，转小写，用于模糊匹配 */
export function normalizeText(s: string): string {
  return (s || '')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[：:＊*（）()【】\[\]{}<>《》、，,。.！!？?~～"'“”‘’·\-_/\\—]/g, '')
    .toLowerCase();
}

export function isCaptchaLike(s: string): boolean {
  return /验证码|captcha|securitycode|verifycode/i.test(normalizeText(s));
}

export type SkipReason = 'captcha' | 'password' | 'hidden' | 'disabled' | 'other' | null;
export type LabelSource = 'label' | 'sibling' | 'td' | 'parent' | 'fallback';

export interface LabelInfo {
  text: string;
  source: LabelSource;
}

export interface DetectedField {
  el: ControlEl;
  rule: FieldRule | null;
  label: string;
  labelSource: LabelSource;
  skip: SkipReason;
  /** 只读（弹窗选择框常见形态） */
  readonly: boolean;
  /** 只读输入框旁的"选择/查询"触发按钮 */
  pickerTrigger: Element | null;
}

export interface DetectFieldOptions {
  /** DOMParser 生成的离屏文档没有布局尺寸；仅在已通过适配包白名单校验的只读页面中启用。 */
  ignoreVisibility?: boolean;
}

function escapeSel(s: string): string {
  return (s || '').replace(/["\\]/g, '\\$&');
}

/** 单选/复选组：从最近的、包含同组多个控件的祖先容器里找组标题（如"健康状况"） */
function findGroupLabel(el: ControlEl): string {
  const name = el.getAttribute('name') || el.id || '';
  if (!name) return '';
  const type = el.getAttribute('type') || '';
  // 单选/复选各自成组：不同控件的组互不干扰
  const sel = type === 'checkbox'
    ? `input[type="checkbox"][name="${escapeSel(name)}"]`
    : `input[type="radio"][name="${escapeSel(name)}"]`;
  let p: HTMLElement | null = el.parentElement;
  for (let i = 0; i < 5 && p; i++, p = p.parentElement) {
    if (p.querySelectorAll(sel).length < 2) continue;
    // 表格布局：单选组在单元格里时，标题一般在前一个单元格
    if (p.tagName === 'TD' || p.tagName === 'TH') {
      const prev = p.previousElementSibling;
      const t = prev && prev.textContent ? prev.textContent.trim() : '';
      if (t && t.length <= 30) return t;
    }
    // 标题 = 本组第一个控件之前的文本子元素（短片段拼接，如"是否"+"服从调剂"）；遇到控件即停止，不吸收其它组标题
    const parts: string[] = [];
    for (const child of Array.from(p.children)) {
      if (child.querySelector && child.querySelector('input, select, textarea')) break;
      const t = child.textContent ? child.textContent.trim() : '';
      if (!t) continue;
      parts.push(t);
      if (parts.join('').length > 30) break;
    }
    const joined = parts.join('').trim();
    if (joined.length >= 2 && joined.length <= 30) return joined;
    const first = p.firstChild;
    if (first && first.nodeType === Node.TEXT_NODE && first.textContent && first.textContent.trim()) {
      return first.textContent.trim();
    }
    const t = p.textContent ? p.textContent.trim() : '';
    if (t && t.length <= 30) return t;
  }
  return '';
}

/** 单元格自身文本（去掉其中的控件，保留标签文字） */
function cellOwnText(td: HTMLElement): string {
  const clone = td.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('input, select, textarea').forEach((c) => c.remove());
  const t = (clone.textContent || '').trim();
  return t && t.length <= 30 ? t : '';
}

export function getLabelInfo(el: ControlEl): LabelInfo {
  const type = (el.getAttribute('type') || '').toLowerCase();
  const isChoice = type === 'radio' || type === 'checkbox';

  if (!isChoice) {
    // 博思 bh-form 控件把真实标题放在控件或包装层的 data-caption；它比旁边的“%”后缀、
    // “若无准确排名可不填”等辅助说明更可信，应在兄弟节点和父容器文本之前使用。
    const captionOwner = el.closest<HTMLElement>('[data-caption]');
    const caption = captionOwner?.getAttribute('data-caption');
    if (caption && caption.trim()) return { text: caption.trim(), source: 'label' };
    const id = el.id;
    if (id) {
      const forLabel = document.querySelector<HTMLLabelElement>(`label[for="${escapeSel(id)}"]`);
      if (forLabel && forLabel.textContent && forLabel.textContent.trim()) {
        return { text: forLabel.textContent.trim(), source: 'label' };
      }
    }
    const wrap = el.closest('label');
    if (wrap && wrap.textContent && wrap.textContent.trim()) {
      return { text: wrap.textContent.trim(), source: 'label' };
    }
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return { text: aria.trim(), source: 'label' };
    let sib = el.previousElementSibling;
    for (let i = 0; i < 2 && sib; i++, sib = sib.previousElementSibling) {
      if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A', 'TABLE', 'FORM', 'TBODY', 'THEAD', 'TFOOT', 'TR', 'TH', 'TD', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SECTION', 'UL', 'OL', 'SCRIPT', 'STYLE'].includes(sib.tagName)) continue;
      const t = sib.textContent ? sib.textContent.trim() : '';
      if (t && t.length <= 30 && !sib.querySelector('input, select, textarea')) {
        return { text: t, source: 'sibling' };
      }
    }
    // 同一单元格内紧邻控件的行内标签（如 <td>院校所在省市<select/><select/></td>）；仅在表格单元格内执行
    if (el.closest('td,th')) {
      let node: Node | null = el.previousSibling;
      let intra = '';
      while (node) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent.trim()) {
          intra = node.textContent.trim() + intra;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const tag = (node as Element).tagName;
          if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A', 'TABLE', 'FORM', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tag)) break;
          const t = (node as Element).textContent ? (node as Element).textContent!.trim() : '';
          if (!t || t.length > 30 || (node as Element).querySelector('input, select, textarea')) break;
          intra = t + intra;
        }
        node = node.previousSibling;
      }
      if (intra && intra.length >= 3 && intra.length <= 30) return { text: intra, source: 'sibling' };
    }
  } else {
    const g = findGroupLabel(el);
    if (g) return { text: g, source: 'label' };
  }

  const td = el.closest('td,th');
  if (td) {
    const prev = td.previousElementSibling;
    if (prev) {
      const t = prev.textContent ? prev.textContent.trim() : '';
      if (t && t.length <= 30) return { text: t, source: 'td' };
    }
    // 有些表格用行首 th 作为标签
    const row = td.closest('tr');
    if (row && row.cells && row.cells.length > 0 && row.cells[0] !== td && row.cells[0].tagName === 'TH') {
      const t = row.cells[0].textContent ? row.cells[0].textContent.trim() : '';
      if (t && t.length <= 30) return { text: t, source: 'td' };
    }
    const own = cellOwnText(td as HTMLElement);
    if (own) return { text: own, source: 'td' };
  }

  let p = el.parentElement;
  for (let i = 0; i < 4 && p; i++, p = p.parentElement) {
    if (p.tagName === 'FORM' || p.tagName === 'BODY') break;
    const t = p.textContent ? p.textContent.trim() : '';
    const controls = p.querySelectorAll('input, select, textarea').length;
    if (t && t.length > 0 && t.length <= 40 && controls <= 2 && !/\n/.test(t)) {
      return { text: t, source: 'parent' };
    }
  }

  const fb = el.getAttribute('placeholder') || el.getAttribute('name') || el.id || '';
  return { text: fb, source: 'fallback' };
}

export function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

/** 查找只读输入框旁边的"选择/查询"触发按钮（弹窗选择框形态）；仅在同一单元格/直接父容器内查找，避免跨区域误判 */
export function findPickerTrigger(el: Element): Element | null {
  const wantText = ['选择', '查询', '搜索', '查找', '浏览', '选取'];
  let scope: HTMLElement | null = el.closest('td,th') || null;
  if (!scope) {
    const isHidden = el.tagName === 'INPUT' && (el.getAttribute('type') || 'text').toLowerCase() === 'hidden';
    if (isHidden) return null; // 不在单元格内的隐藏输入框（如 hdIndex）不视为弹窗载体
    scope = el.parentElement;
  }
  if (!scope) return null;
  const cands = Array.from(scope.querySelectorAll('button, a, span, i, em'));
  for (const cand of cands) {
    if (cand === el || cand.contains(el)) continue;
    const cls = `${cand.getAttribute('class') || ''} ${cand.getAttribute('id') || ''}`.toLowerCase();
    if (/(select|picker|choose|choice|search|query|trigger|dropdown)/.test(cls)) return cand;
    const t = normalizeText(cand.textContent || '');
    if (t && t.length <= 4 && wantText.includes(t)) return cand;
  }
  return null;
}

export function detectField(el: HTMLElement, rules: FieldRule[] = FIELD_RULES, options: DetectFieldOptions = {}): DetectedField {
  const li = getLabelInfo(el as ControlEl);
  // 组件下拉已认领的元素（值载体/组件本体）：由组件点选内核处理，常规检测直接排除
  const labelExtra = [el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('data-label')]
    .filter((x) => x && x.trim())
    .join(' ');
  const labelHay = normalizeText(li.text) + ' ' + normalizeText(labelExtra);
  const attrHay = normalizeText(
    (el.getAttribute('name') || '') + ' ' + (el.getAttribute('id') || '') + ' ' + (el.getAttribute('placeholder') || ''),
  );
  const fullHay = labelHay + ' ' + attrHay;
  const readonly = el.hasAttribute('readonly');
  const disabled = (el as HTMLInputElement).disabled === true;
  const isHiddenInput = el.tagName === 'INPUT' && (el.getAttribute('type') || 'text').toLowerCase() === 'hidden';
  const base: DetectedField = {
    el: el as ControlEl,
    rule: null,
    label: li.text,
    labelSource: li.source,
    skip: null,
    readonly,
    pickerTrigger: findPickerTrigger(el),
  };

  const widgetMark = (el as HTMLElement).getAttribute ? (el as HTMLElement).getAttribute('data-tui-widget') : null;
  if (widgetMark === 'dropdown' || widgetMark === 'dropdown-value') return { ...base, skip: 'other' };
  // jqx 虚拟下拉打开后会动态插入“请查找”过滤框。它只是组件内部工具，不是报名字段，
  // 否则一次学校点选失败就会在字段报告里额外产生 E1101 噪音。
  if (el.matches('.jqx-listbox-filter-input') || (normalizeText(el.getAttribute('placeholder') || '') === '请查找' && !!el.closest('.jqx-listbox,[role="listbox"]'))) {
    return { ...base, skip: 'other' };
  }
  if (isCaptchaLike(fullHay)) return { ...base, skip: 'captcha' };
  if (el.tagName === 'INPUT') {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (type === 'password') return { ...base, skip: 'password' };
    if (['submit', 'button', 'reset', 'file', 'image', 'range'].includes(type)) return { ...base, skip: 'other' };
  }
  if (!isHiddenInput && !options.ignoreVisibility && !isVisible(el)) return { ...base, skip: 'hidden' };

  const bestRef: { rule: FieldRule | null; score: number } = { rule: null, score: 0 };
  const tryKeywords = (rule: FieldRule, kws: string[] | undefined, hay: string, tier: number) => {
    if (!kws) return;
    for (const kw of kws) {
      const k = normalizeText(kw);
      if (!k) continue;
      if (!hay.includes(k)) continue;
      if (rule.negative && rule.negative.some((n) => fullHay.includes(normalizeText(n)))) continue;
      const score = tier + k.length * 2;
      if (score > bestRef.score) {
        bestRef.rule = rule;
        bestRef.score = score;
      }
    }
  };
  for (const rule of rules) {
    tryKeywords(rule, rule.keywords, fullHay, 100);
    tryKeywords(rule, rule.attrOnly, attrHay, 40);
  }
  if (disabled && !bestRef.rule) return { ...base, rule: null, skip: 'disabled' };
  if (isHiddenInput) {
    // 隐藏输入框 + 选择按钮 = 弹窗选择框的编码载体；仅对"弹窗选择类"字段保留（防止误匹配如 hdIndex 等杂项隐藏域）
    const PICKER_OK = new Set(['education.university', 'education.college', 'education.major', 'basic.hometown', 'basic.birthPlace', 'basic.hukou', 'education.province']);
    const matchedField = bestRef.rule ? bestRef.rule.field : null;
    return matchedField !== null && base.pickerTrigger && PICKER_OK.has(matchedField) ? { ...base, rule: bestRef.rule, skip: null } : { ...base, rule: null, skip: 'hidden' };
  }
  return { ...base, rule: bestRef.rule };
}

// ===================== 组件下拉（无原生 select 的 JS 组件）通用识别 =====================
// 很多平台（如 ehall gsapp 的 jqx 组件）把“性别/政治面貌”等下拉渲染成 span/div 组件 + 显示输入框/隐藏域，
// 页面上没有原生 <select>，常规检测完全看不见 → 这类字段永远填不上（广东工业大学实测）。
// 难点：jqx 会把选项列表（可能还是英文，如 Male/Female）预渲染在容器里，污染标签匹配。
// 因此标签提取前先剥离选项列表元素；剥离后仍无标签则取前一格（标签格/控件格分离布局）。
// 扩展自有 UI 只有 #tui-panel 是稳定根节点。不得用 `[class*="tui-"]` 排除，
// 因为招生平台自身也可能使用带 tui 字样的组件类名，导致真实下拉整棵祖先链被误伤。
const WIDGET_OWN_UI_SEL = '#tui-panel';
const WIDGET_OPTION_EL_SEL = '[class*="listitem"], .jqx-item';

export interface ComponentDropdownProbe {
  rawTag: string;
  rawVisible: boolean;
  triggerTag: string;
  triggerVisible: boolean;
  triggerId: string;
  triggerCls: string;
  scopeTag: string;
  scopeCls: string;
  previousLabel: string;
  fieldAttrs: string[];
}

/**
 * 功能：当“请选择”文字节点本身为零尺寸时，向上寻找真正可点击且可见的组件本体。
 *
 * 原理说明：部分 jqx 皮肤把文字放在绝对定位或零尺寸 span 中，点击事件绑定在其父级
 * `jqx/dropdown/combobox` 容器。结构扫描能看到文字，但旧版 `isVisible(span)` 会提前丢弃它。
 */
function resolveVisibleWidgetTrigger(raw: HTMLElement): HTMLElement | null {
  // 即使文字 span 自身可见，也必须先寻找真正的组件根节点。广工大实页中点击与字段标签关联均挂在
  // `div[role="combobox"].jqx-widget` 上；若直接返回内层 span，字段作用域只会落到
  // `.jqx-dropdownlist-content`，从而永远看不到旁边的“性别/政治面貌”。
  let component: HTMLElement | null = raw;
  for (let depth = 0; depth < 7 && component; depth++, component = component.parentElement) {
    if (/^(BODY|FORM|TD|TH)$/i.test(component.tagName)) break;
    const cls = `${component.getAttribute('class') || ''}`.toLowerCase();
    const role = `${component.getAttribute('role') || ''}`.toLowerCase();
    const componentRootLike = role === 'combobox'
      || /(^|\s)jqx-widget(\s|$)|jqx-dropdownlist-state-normal|(^|\s)jqx-dropdownlist(\s|$)|dropdown-toggle|(^|\s)combobox(\s|$)/.test(cls);
    if (componentRootLike && isVisible(component)) return component;
  }
  if (isVisible(raw)) return raw;
  let parent = raw.parentElement;
  for (let depth = 0; depth < 6 && parent; depth++, parent = parent.parentElement) {
    if (/^(BODY|FORM|TD|TH)$/i.test(parent.tagName)) break;
    const signature = `${parent.id || ''} ${parent.getAttribute('class') || ''} ${parent.getAttribute('role') || ''}`.toLowerCase();
    if (isVisible(parent) && /jqx|dropdown|combobox|select|picker|input-group/.test(signature)) return parent;
  }
  return null;
}

/** 功能：查找页面中的组件下拉占位节点，并收敛为唯一的可见点击本体。 */
function findComponentDropdownCandidates(doc: Document): Array<{ raw: HTMLElement; trigger: HTMLElement }> {
  const rawCandidates = Array.from(doc.querySelectorAll<HTMLElement>('span, div, a')).filter((el) => {
    if (el.closest(WIDGET_OWN_UI_SEL)) return false;
    const text = normalizeText(el.textContent || '');
    const cls = `${el.getAttribute('class') || ''} ${el.id || ''}`.toLowerCase();
    const placeholderLike = text === '请选择';
    const classLike = /jqx-dropdownlist|dropdownlist|dropdown-toggle|combobox/.test(cls) && text.length <= 6;
    return placeholderLike || classLike;
  });
  const innermost = rawCandidates.filter((el) => !rawCandidates.some((other) => other !== el && el.contains(other)));
  const seenTriggers = new Set<HTMLElement>();
  const out: Array<{ raw: HTMLElement; trigger: HTMLElement }> = [];
  for (const raw of innermost) {
    const trigger = resolveVisibleWidgetTrigger(raw);
    if (!trigger || seenTriggers.has(trigger)) continue;
    seenTriggers.add(trigger);
    out.push({ raw, trigger });
  }
  return out;
}

/**
 * 功能：确定组件下拉所属的字段作用域。
 *
 * 原理说明：jqx 等组件常在控件格内再包一层 `.input-group`。若只取最近的包装层，
 * 就无法看到前一单元格中的“性别/政治面貌”标签，也找不到包装层外的隐藏值字段。
 * 因此表格布局优先提升到当前 `td/th`；非表格布局再退回常见表单字段容器。
 */
function findWidgetFieldScope(widget: HTMLElement): HTMLElement | null {
  const tableCell = widget.closest<HTMLElement>('td,th');
  if (tableCell) return tableCell;
  // [class*="form-group"] 兼容博思 bh-form-group 等带前缀变体（广工大 ehall 实测）
  return widget.closest<HTMLElement>('.form-group,[class*="form-group"],.control-group,.form-item,.field,li') || widget.parentElement;
}

/**
 * 功能：提取组件字段作用域中的标签文本，并移除预渲染选项和“请选择”占位文本。
 */
function cleanWidgetScopeText(scope: HTMLElement): string {
  const clone = scope.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(WIDGET_OPTION_EL_SEL).forEach((el) => el.remove());
  clone.querySelectorAll<HTMLElement>('span,div,a').forEach((el) => {
    if (normalizeText(el.textContent || '') === '请选择') el.remove();
  });
  return clone.textContent || '';
}

/**
 * 功能：收集字段作用域中可用于规则匹配的控件属性。
 *
 * 安全说明：这里只读取字段的 `id/name/class` 结构，不读取或记录任何用户填写值。
 */
function collectWidgetAttributeText(widget: HTMLElement, scope: HTMLElement): string {
  const parts = [widget.id || '', widget.getAttribute('name') || '', widget.getAttribute('class') || ''];
  scope.querySelectorAll<HTMLElement>('input,[role="combobox"],[class*="dropdown"],[id*="jqxWidget"]').forEach((el) => {
    parts.push(el.id || '', el.getAttribute('name') || '', el.getAttribute('class') || '');
  });
  return parts.join(' ');
}

/**
 * 功能：生成组件下拉脱敏结构探针，供现场报告定位“候选为何未识别”。
 *
 * 隐私说明：只输出元素类型、截断后的 id/class、相邻标签和字段属性名；不读取 input.value，
 * 不包含姓名、证件号、电话、邮箱及任何档案内容。
 */
export function probeComponentDropdowns(doc: Document): ComponentDropdownProbe[] {
  return findComponentDropdownCandidates(doc).slice(0, 12).map(({ raw, trigger }) => {
    const scope = findWidgetFieldScope(trigger);
    const previousLabel = scope ? scope.previousElementSibling?.textContent || '' : '';
    const fieldAttrs = scope
      ? Array.from(scope.querySelectorAll<HTMLElement>('input,[role="combobox"]')).slice(0, 8).map((el) => `${el.tagName.toLowerCase()}:${(el.getAttribute('name') || el.id || '').slice(0, 32)}`)
      : [];
    return {
      caption: (raw.closest('[data-caption]') as HTMLElement | null)?.getAttribute('data-caption') || '',
      rawTag: raw.tagName.toLowerCase(),
      rawVisible: isVisible(raw),
      triggerTag: trigger.tagName.toLowerCase(),
      triggerVisible: isVisible(trigger),
      triggerId: (trigger.id || '').slice(0, 40),
      triggerCls: (trigger.getAttribute('class') || '').slice(0, 60),
      scopeTag: (scope?.tagName || '').toLowerCase(),
      scopeCls: (scope?.getAttribute('class') || '').slice(0, 60),
      previousLabel: previousLabel.trim().replace(/\s+/g, ' ').slice(0, 30),
      fieldAttrs,
    };
  });
}

export interface ComponentDropdownCandidate {
  /** 组件触发本体(执行期将获得 data-tui-widget 标记)。 */
  widget: HTMLElement;
  /** 值载体(优先空隐藏域/可见显示框/任意隐藏域;无则 null)。 */
  carrier: HTMLElement | null;
  container: HTMLElement;
  rule: FieldRule;
  key: string;
  label: string;
}

/**
 * 功能:只读收集组件下拉字段候选(PLAN v3 · P02 影子编译用)。
 * 安全说明:本函数不写任何 DOM 属性/属性标记;旧 detect 的 data-tui-widget 等标记动作
 * 由 markComponentDropdownCandidate 单独执行,归属执行阶段。
 */
export function collectComponentDropdownCandidates(doc: Document, rules: FieldRule[] = FIELD_RULES): ComponentDropdownCandidate[] {
  const out: ComponentDropdownCandidate[] = [];
  const seenContainers = new Set<Element>();
  for (const { trigger: widget } of findComponentDropdownCandidates(doc)) {
    const container = findWidgetFieldScope(widget);
    if (!container || seenContainers.has(container)) continue;
    // 容器里有可见原生 select → 常规检测已覆盖，组件识别不插手
    if (Array.from(container.querySelectorAll('select')).some((el) => isVisible(el))) continue;
    // 标签候选 1：容器文本剥离“选项列表 + 占位”后的残余；候选 2：前一格（标签格/控件格分离的表格布局）
    // 组件自带标签（广工大实测：jqx 根节点带 data-caption="性别"/"政治面貌"，最可信）
    const caption = (widget.closest('[data-caption]') as HTMLElement | null)?.getAttribute('data-caption') || '';
    const containerText = cleanWidgetScopeText(container);
    // WiseDU 的 bh-form 布局不是表格：标签 `<label>` 与值包装层 `.bh-form-readonly-input`
    // 是同级节点。前一兄弟标签因此对所有字段作用域都有效，不应仅限 td/th。
    const prevSiblingText = container.previousElementSibling?.textContent || '';
    const fieldLabelText = container.querySelector('label,.control-label,.form-label')?.textContent || '';
    const attrHay = normalizeText(collectWidgetAttributeText(widget, container));
    const scoreOf = (hay: string): { rule: FieldRule; score: number } | null => {
      let best: { rule: FieldRule; score: number } | null = null;
      const norm = normalizeText(hay) + ' ' + attrHay;
      for (const rule of rules) {
        if (rule.manual) continue;
        for (const kw of rule.keywords || []) {
          const k = normalizeText(kw);
          if (!k || !norm.includes(k)) continue;
          if (rule.negative && rule.negative.some((n) => norm.includes(normalizeText(n)))) continue;
          const score = 100 + k.length * 2;
          if (!best || score > best.score) best = { rule, score };
        }
      }
      return best;
    };
    const fromCaption = caption ? scoreOf(caption) : null;
    if (fromCaption) fromCaption.score += 60; // 组件自声明的标签优先于结构推断
    const fromContainer = scoreOf(containerText);
    const fromPrev = scoreOf(prevSiblingText);
    const fromLabel = scoreOf(fieldLabelText);
    const fromAttrs = scoreOf(attrHay);
    const best = [fromCaption, fromPrev, fromLabel, fromContainer, fromAttrs]
      .filter((item): item is { rule: FieldRule; score: number } => !!item)
      .sort((a, b) => b.score - a.score)[0] || null;
    if (!best) continue;
    // 容器里的可见输入框已被规则命中且带 name（会随表单提交的真字段）→ 常规检测直接填写，组件识别不插手；
    // 无 name 的命中框是 jqx 等组件的显示框——原生写文本不驱动组件模型，必须走组件点选
    const visibleInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input:not([type="hidden"]):not([type="password"]):not([type="file"])')).filter((el) => isVisible(el));
    // 值载体优先级：空隐藏域 → 未被规则命中的可见显示框（jqx 显示输入框）→ 任意隐藏域 → 组件本体
    const hiddenInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="hidden"]'));
    const carrier = hiddenInputs.find((h) => !(h.value || '').trim()) || visibleInputs[0] || hiddenInputs[0] || null;
    seenContainers.add(container);
    const key = `widget-${best.rule.field}-${out.length}`;
    // 标签格单独存在时，标签语义已由 prevSiblingText 命中；不要因无 name 的 jqx 显示框本身误命中而跳过组件。
    const rawLabelText = (caption || (normalizeText(containerText).length >= 2 ? containerText : prevSiblingText)).replace(/\s+/g, ' ').trim();
    out.push({
      widget,
      carrier,
      container,
      rule: best.rule,
      key,
      label: rawLabelText.slice(0, 30) || best.rule.field,
    });
  }
  return out;
}

/** 功能:给组件下拉候选打执行期标记(唯一写属性动作;归属执行阶段,与只读收集分离)。 */
export function markComponentDropdownCandidate(candidate: ComponentDropdownCandidate): void {
  const { widget, carrier, key } = candidate;
  widget.setAttribute('data-tui-widget', 'dropdown');
  widget.setAttribute('data-tui-widget-key', key);
  if (carrier) {
    carrier.setAttribute('data-tui-widget', 'dropdown-value');
    carrier.setAttribute('data-tui-widget-key', key);
    widget.setAttribute('data-tui-widget-target', carrier.id ? `#${carrier.id}` : carrier.getAttribute('name') ? `[name="${carrier.getAttribute('name')}"]` : '');
  }
}

export function detectComponentDropdownFields(doc: Document, rules: FieldRule[] = FIELD_RULES): DetectedField[] {
  const out: DetectedField[] = [];
  for (const candidate of collectComponentDropdownCandidates(doc, rules)) {
    markComponentDropdownCandidate(candidate);
    const el: HTMLElement = candidate.carrier || candidate.widget;
    out.push({
      el: el as ControlEl,
      rule: candidate.rule,
      label: candidate.label,
      labelSource: 'sibling',
      skip: null,
      readonly: false,
      pickerTrigger: candidate.widget,
    });
  }
  return out;
}
export function detectAllFields(doc: Document, rules: FieldRule[] = FIELD_RULES): DetectedField[] {
  const list: DetectedField[] = [];
  doc.querySelectorAll<HTMLElement>('input, select, textarea').forEach((el) => {
    const d = detectField(el, rules);
    if (d.skip === 'other' || d.skip === 'disabled') return;
    if (d.skip === 'hidden' && !(d.rule && d.pickerTrigger)) return;
    list.push(d);
  });
  return list;
}
