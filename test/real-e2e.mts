// 真实适配包黑盒 E2E：直接 import 真实源码函数，用 43 个真实学校 URL 验证 matchAdapterPackage 的命中正确性。
// 不依赖 mock/fixture：所有 URL 都是真实学校系统入口。
// 运行前需要 build：`node build.mjs`

import { SCHOOL_ADAPTER_PACKAGES, validateAdapterPackage, matchAdapterPackage } from '../src/core/adapter-packages';
import { SCHOOLS } from '../src/core/schools';
import { findRetroHonorSlots } from '../src/core/retro-honor-fill';
import { JSDOM } from 'jsdom';

let allPass = true;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) console.log('  ✅', label);
  else { console.error('  ❌', label, detail || ''); allPass = false; }
}

const total = SCHOOL_ADAPTER_PACKAGES.length;
console.log(`\n【1】共 ${total} 个适配包，全部 validateAdapterPackage`);
let vfail = 0;
for (const p of SCHOOL_ADAPTER_PACKAGES) {
  try { validateAdapterPackage(p); }
  catch (e: any) { vfail++; console.error('  ❌', p.id, e.message); }
}
check(`全部 ${total} 个适配包校验通过`, vfail === 0, `失败${vfail}个`);

console.log('\n【2】matchAdapterPackage 真实 URL 命中（43 个真实学校入口）');
const urlTests: Array<{url: string, expectId: string}> = [
  // 蓝色专属
  {url:'https://gsas.fudan.edu.cn/logon', expectId:'blue-fudan'},
  {url:'https://yzbm.tongji.edu.cn/logon', expectId:'blue-tongji'},
  {url:'https://yz.bit.edu.cn/yzbm/logon', expectId:'blue-bit'},
  {url:'https://gsas.seu.edu.cn/logon', expectId:'blue-seu'},
  {url:'https://yzbm.uestc.edu.cn/logon', expectId:'blue-uestc'},
  {url:'https://yzbm.cupl.edu.cn/logon', expectId:'blue-cupl'},
  {url:'https://xspt.ustc.edu.cn/logon', expectId:'blue-ustc'},
  {url:'https://gmss.cup.edu.cn/logon', expectId:'blue-cup'},
  {url:'https://yzk.cau.edu.cn/logon', expectId:'blue-cau'},
  {url:'https://yzbm.buct.edu.cn/logon', expectId:'blue-buct'},
  {url:'https://yzbm.hfut.edu.cn/logon', expectId:'blue-hfut'},
  {url:'https://yzbm.sustech.edu.cn/logon', expectId:'blue-sustech'},
  // 蓝色兜底
  {url:'https://yzbm.tsinghua.edu.cn/logon', expectId:'platform-blue'},
  {url:'https://yjszs-ks.ecnu.edu.cn/logon', expectId:'platform-blue'},
  {url:'https://yjszs.dlut.edu.cn/zsbm/logon', expectId:'platform-blue'},
  // retro
  {url:'https://yjszsgl.csu.edu.cn/zsgl2026/tmsgl/login.aspx', expectId:'retro-tmsgl-csu'},
  {url:'https://yjszsxt.hnu.edu.cn/zsxt2026/tmsgl/login.aspx', expectId:'retro-tmsgl-hnu'},
  {url:'https://yzgmis.jiangnan.edu.cn/zsgl/tmsgl/register.aspx', expectId:'retro-tmsgl-jiangnan'},
  {url:'https://yzglxt.njau.edu.cn/gts/Tmsgl/login.aspx', expectId:'retro-tmsgl-njau'},
  {url:'https://yjszs.ncepu.edu.cn/zsgl/tmsgl/login.aspx', expectId:'retro-tmsgl-ncepu'},
  {url:'https://yjszsgl.ujs.edu.cn/zsgl/tmsgl/login.aspx', expectId:'retro-tmsgl-ujs'},
  {url:'https://yjsxt.hnucm.edu.cn/zsgl/tmsgl/login.aspx', expectId:'retro-tmsgl-hnucm'},
  {url:'https://ga.sjtu.edu.cn/zsgl/ytmgl/login.aspx', expectId:'retro-tmsgl-sjtu'},
  {url:'https://webrecdoc.bjut.edu.cn/zsgl/tmsgl/login.aspx', expectId:'retro-tmsgl-bjut'},
  // cover / jingzhi 专项
  {url:'https://enroll.sysu.edu.cn/yjszs/plugins/zs/zsxsd/entrance', expectId:'sysu-enroll'},
  {url:'https://yjszs.nwafu.edu.cn/yjszs/plugins/zs/zsxsd/entrance', expectId:'nwafu-yjszs'},
  {url:'https://yjszs.nwsuaf.edu.cn/yjszs/plugins/zs/zsxsd/entrance', expectId:'nwafu-yjszs'},
  {url:'https://yjsxt.gdut.edu.cn/gsapp/sys/yjsbmxsd/entrance.do', expectId:'gdut-gsapp'},
  {url:'https://ehall.hainanu.edu.cn/gsapp/sys/yjsbmxsd/entrance.do', expectId:'hainanu-gsapp'},
  {url:'https://yjsxt.jnu.edu.cn/gsapp/sys/yjsbmxsd/entrance.do', expectId:'jnu-gsapp'},
  {url:'https://yjsyxt.gzhu.edu.cn/gsapp/sys/yjsbmxsd/entrance.do', expectId:'gzhu-gsapp'},
  {url:'https://yz.whu.edu.cn/', expectId:'whu-gsapp'},
  {url:'https://zhaosheng.ucas.ac.cn/sign_up/TMS/views/index.aspx', expectId:'ucas-tms'},
  {url:'https://yjsyzsxt.hunnu.edu.cn/zsxt2025/tmsgl/login.aspx', expectId:'hunnu-tmsgl'},
  {url:'https://dxsxly.xmu.edu.cn/accounts', expectId:'xmu-dxsxly'},
  {url:'https://epo.cug.edu.cn/Open/ZsTkssTms/Signin.aspx', expectId:'cug-tms'},
  {url:'https://epo.cug.edu.cn/Open/ZsTkssXly/Signin.aspx', expectId:'cug-xly'},
  {url:'https://yzbm.bjfu.edu.cn/', expectId:'bjfu-tm'},
  {url:'https://yzbtm.pumc.edu.cn/user/login/login', expectId:'pumc-tm'},
  {url:'https://yz.nenu.edu.cn/ybm', expectId:'nenu-ybm'},
  {url:'https://yjs.syphu.edu.cn/pas/ybm', expectId:'syphu-ybm'},
  {url:'https://yzgl.cufe.edu.cn/cufeXs/index', expectId:'cufe-yzgl'},
  {url:'https://yzs.cumt.edu.cn/yzbm/logon', expectId:'blue-cumt'},
];

let pp = 0, pf = 0;
for (const t of urlTests) {
  const matched = matchAdapterPackage(t.url, SCHOOL_ADAPTER_PACKAGES);
  const ok = matched && matched.id === t.expectId;
  if (ok) pp++;
  else { pf++; console.error(`    ❌ [${t.expectId}] ${t.url} → ${matched?.id || '(未命中)'}`); }
}
check(`URL 命中: ${pp}通过 / ${pf}失败（共${urlTests.length}个）`, pf === 0);

console.log('\n【3】schools.ts → adapter 链路（关键 18 条）');
const criticalEntries = [
  {host:'enroll.sysu.edu.cn', adapter:'sysu-enroll'},
  {host:'yjszs.nwafu.edu.cn', adapter:'nwafu-yjszs'},
  {host:'epo.cug.edu.cn', adapter:'cug-tms'},
  {host:'epo.cug.edu.cn', adapter:'cug-xly'},
  {host:'yjsxt.gdut.edu.cn', adapter:'gdut-gsapp'},
  {host:'ehall.hainanu.edu.cn', adapter:'hainanu-gsapp'},
  {host:'yjsxt.jnu.edu.cn', adapter:'jnu-gsapp'},
  {host:'yjsyxt.gzhu.edu.cn', adapter:'gzhu-gsapp'},
  {host:'yz.whu.edu.cn', adapter:'whu-gsapp'},
  {host:'zhaosheng.ucas.ac.cn', adapter:'ucas-tms'},
  {host:'yjsyzsxt.hunnu.edu.cn', adapter:'hunnu-tmsgl'},
  {host:'dxsxly.xmu.edu.cn', adapter:'xmu-dxsxly'},
  {host:'yzbm.bjfu.edu.cn', adapter:'bjfu-tm'},
  {host:'yzbtm.pumc.edu.cn', adapter:'pumc-tm'},
  {host:'yz.nenu.edu.cn', adapter:'nenu-ybm'},
  {host:'yjs.syphu.edu.cn', adapter:'syphu-ybm'},
  {host:'yzgl.cufe.edu.cn', adapter:'cufe-yzgl'},
  {host:'yzs.cumt.edu.cn', adapter:'blue-cumt'},
];
let sp = 0, sf = 0;
for (const e of criticalEntries) {
  const found = SCHOOLS.find(s => s.host === e.host && s.adapter === e.adapter);
  if (found) sp++;
  else { sf++; console.error(`    ❌ schools缺: ${e.host} → ${e.adapter}`); }
}
check(`schools.ts 链路: ${sp}通过 / ${sf}失败`, sf === 0);

console.log('\n【4】findRetroHonorSlots 在真实 jsdom DOM 上识别槽位');
const retroHtml = `<!doctype html><html><body>
<table><tr>
  <td><input id="txthjmc0" value=""/></td>
  <td><input id="txthjsj0" value=""/></td>
  <td><input id="txtpm0" value=""/></td>
</tr><tr>
  <td><input id="txthjmc1" value=""/></td>
  <td><input id="txthjsj1" value=""/></td>
  <td><input id="txtpm1" value=""/></td>
</tr><tr>
  <td><input id="txthjmc2" value=""/></td>
  <td><input id="txthjsj2" value=""/></td>
  <td><input id="txtpm2" value=""/></td>
</tr></table>
</body></html>`;
const dom = new JSDOM(retroHtml);
const doc: any = dom.window.document;
const slots = findRetroHonorSlots(doc);
check(`识别到 3 个奖励槽 (id=txthjmc0/1/2)`, slots.length === 3, `找到${slots.length}个`);

const emptyDom = new JSDOM(`<!doctype html><body><p>no slots</p></body></html>`);
const emptySlots = findRetroHonorSlots(emptyDom.window.document);
check('空页面识别为 0 个槽', emptySlots.length === 0);

console.log('\n【5】新增 18 个专项适配包结构完整性');
const newIds = [
  'sysu-enroll','nwafu-yjszs','hunnu-tmsgl',
  'gdut-gsapp','hainanu-gsapp','jnu-gsapp','gzhu-gsapp','whu-gsapp',
  'blue-cumt','cug-tms','cug-xly',
  'bjfu-tm','syphu-ybm','pumc-tm','cufe-yzgl','nenu-ybm',
  'xmu-dxsxly','ucas-tms',
];
let np = 0, nf = 0;
for (const id of newIds) {
  const found = SCHOOL_ADAPTER_PACKAGES.find(p => p.id === id);
  if (!found) { nf++; console.error(`    ❌ 缺失: ${id}`); continue; }
  const hasMatch = !!(found.match?.hosts?.length);
  const hasFields = !!(found.pages?.some((p: any) => p.fields?.length));
  if (hasMatch && hasFields) np++;
  else { nf++; console.error(`    ❌ [${id}] match=${hasMatch} fields=${hasFields}`); }
}
check(`新增 ${newIds.length} 适配包: ${np}通过 / ${nf}失败`, nf === 0);

console.log('\n【6】蓝色 15 所学校适配包存在');
const blueIds = ['blue-seu','blue-fudan','blue-cags','blue-ustc','blue-bit','blue-tongji','blue-xjtu','blue-uestc','blue-cupl','blue-cpu','blue-cup','blue-cau','blue-buct','blue-hfut','blue-sustech'];
let bp = 0, bf = 0;
for (const id of blueIds) {
  if (SCHOOL_ADAPTER_PACKAGES.find(p => p.id === id)) bp++;
  else { bf++; console.error(`    ❌ 缺失: ${id}`); }
}
check(`蓝色 ${blueIds.length}: ${bp}通过 / ${bf}失败`, bf === 0);

console.log('\n【7】Retro 9 所学校适配包存在 + family=jingzhi');
const retroIds = ['retro-tmsgl-csu','retro-tmsgl-hnu','retro-tmsgl-jiangnan','retro-tmsgl-njau','retro-tmsgl-ncepu','retro-tmsgl-ujs','retro-tmsgl-hnucm','retro-tmsgl-sjtu','retro-tmsgl-bjut'];
let rp = 0, rf = 0;
for (const id of retroIds) {
  const p = SCHOOL_ADAPTER_PACKAGES.find(p => p.id === id);
  if (p) {
    rp++;
    if (p.family !== 'jingzhi') { console.error(`    ❌ [${id}] family=${p.family}`); rf++; }
  } else { rf++; console.error(`    ❌ 缺失: ${id}`); }
}
check(`Retro ${retroIds.length}: ${rp}通过 / ${rf}失败`, rf === 0);

console.log('\n' + '='.repeat(60));
if (allPass) { console.log('✅✅✅ 真实 E2E 全部通过！'); process.exit(0); }
else { console.error('❌❌❌ 有失败项'); process.exit(1); }
