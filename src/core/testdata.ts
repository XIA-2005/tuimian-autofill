// 测试数据生成器：生成格式合法（身份证校验位正确）的随机假资料，
// 便于在真实报名页面上先验证填充效果，确认无误后再换成真实信息。
// 注意：以下全部为占位假数据，禁止用于真实报名。

import { emptyProfile, Profile } from './profile';

const SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '郭', '何', '高', '林'];
const GIVEN = ['伟', '芳', '娜', '秀', '英', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '霞', '平', '刚', '桂', '兰', '雪', '文', '博', '宇', '浩', '然', '子', '涵', '欣', '怡', '梓', '萱', '思', '源'];
const PINYIN: Record<string, string> = {
  王: 'Wang', 李: 'Li', 张: 'Zhang', 刘: 'Liu', 陈: 'Chen', 杨: 'Yang', 赵: 'Zhao', 黄: 'Huang', 周: 'Zhou', 吴: 'Wu', 徐: 'Xu', 孙: 'Sun', 马: 'Ma', 朱: 'Zhu', 胡: 'Hu', 郭: 'Guo', 何: 'He', 高: 'Gao', 林: 'Lin',
  伟: 'Wei', 芳: 'Fang', 娜: 'Na', 秀: 'Xiu', 英: 'Ying', 敏: 'Min', 静: 'Jing', 丽: 'Li', 强: 'Qiang', 磊: 'Lei', 军: 'Jun', 洋: 'Yang', 勇: 'Yong', 艳: 'Yan', 杰: 'Jie', 娟: 'Juan', 涛: 'Tao', 明: 'Ming', 超: 'Chao', 霞: 'Xia', 平: 'Ping', 刚: 'Gang', 桂: 'Gui', 兰: 'Lan', 雪: 'Xue', 文: 'Wen', 博: 'Bo', 宇: 'Yu', 浩: 'Hao', 然: 'Ran', 子: 'Zi', 涵: 'Han', 欣: 'Xin', 怡: 'Yi', 梓: 'Zi', 萱: 'Xuan', 思: 'Si', 源: 'Yuan',
};
const NATIONS = ['汉族', '满族', '回族', '壮族', '蒙古族'];
const POLITICS = ['共青团员', '中共党员', '中共预备党员', '群众'];
const PROVINCES = ['北京市', '上海市', '江苏省南京市', '浙江省杭州市', '广东省广州市', '山东省济南市', '湖北省武汉市', '四川省成都市', '陕西省西安市', '河南省郑州市'];
const AREA_CODES = ['110101', '310101', '320102', '330102', '440103', '370102', '420103', '510104', '610102', '410102'];
const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const ID_CHECK = '10X98765432';
const SCHOOLS = ['清华大学', '北京大学', '浙江大学', '复旦大学', '上海交通大学', '南京大学'];
const COLLEGES = ['计算机科学与技术学院', '信息与通信工程学院', '自动化学院', '电子工程学院', '经济管理学院', '外国语学院'];
const MAJORS = ['计算机科学与技术', '软件工程', '电子信息工程', '自动化', '信息管理与信息系统', '英语'];
const PHONE_PREFIX = ['138', '139', '150', '151', '159', '176', '182', '188', '199', '133'];

function randInt(a: number, b: number): number {
  return a + Math.floor(Math.random() * (b - a + 1));
}
function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 生成校验位正确的合法格式身份证号（假数据） */
function genIdCard(birthYmd: string): string {
  const seq = String(randInt(1, 999)).padStart(3, '0');
  const body = pick(AREA_CODES) + birthYmd + seq;
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += parseInt(body[i], 10) * ID_WEIGHTS[i];
  return body + ID_CHECK[sum % 11];
}

function genPhone(): string {
  return pick(PHONE_PREFIX) + String(randInt(0, 99999999)).padStart(8, '0');
}

export function generateTestProfile(): Profile {
  const surname = pick(SURNAMES);
  const given = pick(GIVEN) + (Math.random() < 0.5 ? pick(GIVEN) : '');
  const name = surname + given;
  const gender = Math.random() < 0.5 ? '男' : '女';
  const y = randInt(2001, 2004);
  const mo = randInt(1, 12);
  const maxDay = mo === 2 ? 28 : [4, 6, 9, 11].includes(mo) ? 30 : 31;
  const d = randInt(1, maxDay);
  const birthday = `${y}-${pad2(mo)}-${pad2(d)}`;
  const total = randInt(60, 200);
  const rank = randInt(1, Math.max(3, Math.floor(total * 0.1)));
  const school = pick(SCHOOLS);
  const major = pick(MAJORS);

  const p = emptyProfile();
  p.basic = {
    ...p.basic,
    name,
    namePinyin: (surname + given).split('').map((c) => PINYIN[c] || c).join(' '),
    gender,
    idType: '居民身份证',
    idCard: genIdCard(birthday.replace(/-/g, '')),
    birthday,
    nation: pick(NATIONS),
    politicalStatus: pick(POLITICS),
    hometown: pick(PROVINCES),
    birthPlace: pick(PROVINCES),
    hukou: pick(PROVINCES),
    country: '中国',
    address: `${pick(PROVINCES)}某街道${randInt(1, 200)}号（测试数据）`,
    postalCode: String(randInt(100000, 710000)),
    phone: genPhone(),
    landline: `0${randInt(10, 29)}-${randInt(10000000, 89999999)}`,
    email: `student${randInt(1000, 9999)}@qq.com`,
    qq: String(randInt(100000000, 2999999999)),
    wechat: `wxid_${randInt(100000, 999999)}`,
    maritalStatus: '未婚',
    health: '良好',
    emergencyName: `${pick(SURNAMES)}${pick(GIVEN)}`,
    emergencyPhone: genPhone(),
    tuimianQual: '是',
  };
  p.education = {
    ...p.education,
    university: school,
    college: pick(COLLEGES),
    major,
    className: `${major}${y - 3}${randInt(1, 4)}班`,
    studentId: `${randInt(2020, 2022)}${String(randInt(10000000, 99999999))}`,
    startDate: `${y - 3}-09`,
    endDate: `${y + 1}-06`,
    gpa: (randInt(300, 395) / 100).toFixed(2),
    score: (randInt(8000, 9300) / 100).toFixed(2),
    rank: String(rank),
    comprehensiveRank: String(randInt(Math.max(1, rank - 1), rank + 5)),
    gradeRank: String(randInt(rank, rank + 20)),
    rankBase: String(total),
    rankUnit: '专业',
    foreignLang: '英语',
    cet4: String(randInt(480, 620)),
    cet4Date: `${y}-06`,
    cet6: String(randInt(450, 600)),
    cet6Date: '',
    otherExams: '',
    obeyAdjust: '是',
  };
  p.awards.push({ date: `${y}-09`, place: '西安理工大学（测试数据）', content: '校级一等奖学金（测试数据）' });
  p.awards.push({ date: `${y - 1}-09`, place: '西安理工大学（测试数据）', content: '国家励志奖学金（测试数据）' });
  p.research.push({ title: '校级大学生创新创业训练计划项目（测试数据）', type: '项目', date: `${y - 2}-${y - 1}`, role: '主要成员', description: '负责文献综述与数据整理工作。' });
  p.research.push({ title: '学科竞赛省级二等奖（测试数据）', type: '竞赛', date: `${y - 1}-06`, role: '队长', description: '负责方案设计与答辩。' });
  p.socialPractice.push({ date: `${y - 3}-${y - 2}`, name: '院学生会（测试数据）', role: '宣传部干事', detail: '负责活动宣传与推文撰写。' });
  p.socialPractice.push({ date: `${y - 2}-07`, name: '乡村支教社会实践（测试数据）', role: '志愿者', detail: '暑期支教并获评优秀实践个人。' });
  p.experiences.push({ start: `${y - 3}-09`, end: `${y + 1}-06`, org: school, role: '学生' });
  p.familyMembers.push({ name: `${pick(SURNAMES)}${pick(GIVEN)}`, relation: '父女', org: '某单位职员', phone: genPhone(), politicalStatus: '群众' });
  p.familyMembers.push({ name: `${pick(SURNAMES)}${pick(GIVEN)}`, relation: '母女', org: '某单位职员', phone: genPhone(), politicalStatus: '群众' });
  p.selfStatements.push({
    title: '通用版 500 字（测试数据）',
    content:
      `本人${name}，就读于${school}${major}专业，成绩位列专业前列（${rank}/${total}），具备扎实的专业基础与浓厚的研究兴趣。` +
      '在校期间积极参与科研与学科竞赛，培养了文献调研、实验设计与团队协作能力。希望进入贵校继续深造，在导师指导下开展深入研究。' +
      '（此为随机生成的测试文本，请替换为真实个人陈述。）',
  });
  p.applications.push({ school: '测试大学', college: '测试学院', major: major, direction: '测试方向', degreeType: '学术型硕士', supervisor: '', note: '测试数据，请修改' });
  return p;
}
