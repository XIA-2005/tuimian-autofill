// 审查者独立探针：从真实源码计算适配包/域名/校名的两套口径（库存 vs 严格 form-fill）
// 不复用执行者或第三方测试；不读任何人的转述。
// 用法：node docs/analysis/v10-review-2026-09-11/probe-adapter-counts.cjs [--dump]
//
// 修订记录（2026-09-11）：原先把 bundle 写在审查目录，留下未跟踪产物（GPT 指出）。
// 现改为写 os.tmpdir()，并在退出时清理——审查者目录只留探针源码与结果，不留构建产物。
const { buildSync } = require('esbuild');
const { writeFileSync, rmSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..', '..');
const entry = `
import { SCHOOL_ADAPTER_PACKAGES } from './src/core/adapter-packages';
export default SCHOOL_ADAPTER_PACKAGES;
`;
const out = buildSync({
  stdin: { contents: entry, resolveDir: root, loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', write: false,
  external: ['esbuild', 'jsdom', 'playwright'],   // F03 教训：必须标 external，否则内联 esbuild 死锁
});
const tmp = path.join(os.tmpdir(), `tuimian-probe-adapter-counts-${process.pid}.cjs`);
writeFileSync(tmp, out.outputFiles[0].text);

(async () => {
  try {
    const mod = await import(pathToFileURL(tmp).href);
    // esbuild 以 cjs 打包 ESM 入口时，Node 侧会多包一层 default
    const pkgs = mod.default && mod.default.default ? mod.default.default : mod.default;
    if (!Array.isArray(pkgs)) {
      console.error('!! 取不到 SCHOOL_ADAPTER_PACKAGES，实际拿到：', typeof pkgs);
      process.exit(1);
    }

    const isWild = (p) => ((p.match && p.match.hosts) || []).includes('*');
    const hasForm = (p) => (p.pages || []).some((pg) => pg.role === 'form');
    const nameOk = (p) => p.schoolName && !/平台|系统|通用/.test(p.schoolName);
    const uniq = (arr) => [...new Set(arr)];

    const concrete = pkgs.filter((p) => !isWild(p));
    const withForm = pkgs.filter(hasForm);
    const withFormConcrete = withForm.filter((p) => !isWild(p));
    const crawlOnly = pkgs.filter((p) => !hasForm(p));

    const hostsAll = uniq(concrete.flatMap((p) => p.match.hosts).map((h) => h.toLowerCase()));
    const hostsForm = uniq(withFormConcrete.flatMap((p) => p.match.hosts).map((h) => h.toLowerCase()));
    const namesAll = uniq(pkgs.filter((p) => !isWild(p) && nameOk(p)).map((p) => p.schoolName));
    const namesForm = uniq(withFormConcrete.filter(nameOk).map((p) => p.schoolName));

    const FAMILY = {};
    const roles = new Set();
    for (const p of pkgs) {
      FAMILY[p.family] = (FAMILY[p.family] || 0) + 1;
      for (const pg of p.pages || []) roles.add(pg.role);
    }

    const inv = { 包: pkgs.length, 含form: withForm.length, 通配包: pkgs.length - concrete.length, 域名: hostsAll.length, 校名: namesAll.length };
    const fill = { 域名: hostsForm.length, 校名: namesForm.length };

    console.log('=== 口径一：库存（全部非通配包）===');
    console.log('  包总数                 :', inv.包);
    console.log('  含 role=form 的包      :', inv.含form);
    console.log('  平台通配包(hosts 含 *)  :', inv.通配包);
    console.log('  具体域名               :', inv.域名);
    console.log('  去重非平台校名         :', inv.校名);
    console.log('  包内 role 取值          :', [...roles].sort().join(', '));
    console.log('  family 分布            :', JSON.stringify(FAMILY));
    console.log();
    console.log('=== 口径二：严格 form-fill（仅含 form 页的包）===');
    console.log('  具体域名               :', fill.域名);
    console.log('  去重非平台校名         :', fill.校名);
    console.log();
    console.log('=== 两口径差项（无 form 页的包）===');
    crawlOnly.forEach((p) => console.log('  ' + p.id + ' | ' + p.schoolName + ' | hosts=' + p.match.hosts.join(',') +
      ' | roles=' + uniq((p.pages || []).map((pg) => pg.role)).join(',')));
    const hostDiff = hostsAll.filter((h) => !hostsForm.includes(h));
    const nameDiff = namesAll.filter((n) => !namesForm.includes(n));
    console.log('  域名差集 :', hostDiff.length ? hostDiff.join(', ') : '(空)');
    console.log('  校名差集 :', nameDiff.length ? nameDiff.join(', ') : '(空)');
    console.log();
    console.log('=== 定案（审查者探针，权威）===');
    console.log(`  库存口径     : ${inv.包} 包 / ${inv.含form} 含form / ${inv.域名} 域名 / ${inv.校名} 校名`);
    console.log(`  form-fill 口径: ${fill.域名} 域名 / ${fill.校名} 校名`);
    console.log(`  GPT 主张 73/72/70/65 + 69/64 ->`,
      (inv.包 === 73 && inv.含form === 72 && inv.域名 === 70 && inv.校名 === 65 && fill.域名 === 69 && fill.校名 === 64)
        ? '全部复现 ✓' : '存在不一致 ✗');
    console.log(`  另一窗口 "54 包" ->`,
      inv.包 === 54 ? '一致' : `与实测 ${inv.包} 差 ${inv.包 - 54}（漏计 9 复古 + 10 通用映射生成包）`);

    if (process.argv.includes('--dump')) {
      console.log('\n=== 库存口径·具体域名清单（' + hostsAll.length + '）===');
      hostsAll.sort().forEach((h, i) => console.log(String(i + 1).padStart(3) + '  ' + h));
      console.log('\n=== 库存口径·去重非平台校名（' + namesAll.length + '）===');
      console.log(namesAll.sort().join(' / '));
      console.log('\n=== 平台通配包（hosts:["*"]）===');
      pkgs.filter(isWild).forEach((p) => console.log('  ' + p.id + ' | ' + p.schoolName + ' | ' + (p.match.pathPatterns || []).join(', ')));
    }
  } finally {
    try { rmSync(tmp, { force: true }); } catch (_) { /* 清理失败不影响结论 */ }
  }
})();
