// 审查者探针：B-3 上线前的可行性预检——tree-only 文件里有多少"已改且未声明"会被报出。
// 用法：node docs/analysis/v10-review-2026-09-11/probe-b3-precheck.cjs
// 结论用途：若报项过多则 B-3 规格不可行（噪音淹没），须改为"仅报声明范围外的治理类文件"。
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
process.chdir(ROOT);

const norm = (p) => String(p).split(path.sep).join('/');
const git = (c) => execSync(`git -c core.quotePath=false ${c}`, { encoding: 'utf8' })
  .split(/\r?\n/).filter(Boolean).map(norm);

const tree = Object.keys(require(path.join(ROOT, 'docs/analysis/v10-hashes/v10-tree.json')).files).map(norm);
const base = Object.keys(require(path.join(ROOT, 'docs/analysis/v10-hashes/v10-baseline.json')).files).map(norm);
const sigPath = path.join(ROOT, 'docs/analysis/v10-hashes/card-signatures.json');
const signed = fs.existsSync(sigPath) ? require(sigPath) : {};
const expected = new Set([...base, ...Object.values(signed).flatMap((e) => e.files.map((f) => norm(f.path)))]);
const changed = new Set(git('diff --name-only 9a0f40a HEAD'));

const touch = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/analysis/v10-hashes/touch-lists.json'), 'utf8'));
const globToRe = (g) => {
  const esc = norm(g).replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const withDbl = esc.split('**').join('\u0000');
  const withSingle = withDbl.split('*').join('[^/]*');
  return new RegExp('^' + withSingle.split('\u0000').join('.*') + '$');
};
const touchRes = Object.values(touch).flat().map(globToRe);

const hits = tree.filter((p) => !expected.has(p) && changed.has(p));
console.log('tree 文件数                    :', tree.length);
console.log('自 grandfather(9a0f40a) 改动数 :', changed.size);
console.log('基线+签名(受控层)              :', expected.size);
console.log('=> B-3 会报出的 tree 改动      :', hits.length);
console.log('');
let declaredMod = 0, treeDrift = 0;
for (const p of hits) {
  const ok = touchRes.some((r) => r.test(p));
  if (ok) declaredMod++; else treeDrift++;
  console.log(`   ${ok ? 'DECLARED-MOD' : 'TREE-DRIFT  '}  ${p}`);
}
console.log('');
console.log(`小结：DECLARED-MOD ${declaredMod} 项（信息性）| TREE-DRIFT ${treeDrift} 项（计入 exit 1）`);
console.log(treeDrift <= 5
  ? '判定：报项数量可控 → B-3 规格可行（不会噪音淹没）'
  : '判定：报项偏多 → 建议收窄为"仅报治理/代码类（.github/、src/、test/、tools/）且未声明者"，文档类只记不报');
