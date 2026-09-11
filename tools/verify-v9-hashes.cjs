// K04: 按 codex-v8-review 的 source-change-manifest 核对当前工作区是否为"修复后"状态。
// 用途:确认本轮修复之后没有被后续改动(不依赖旧 HEAD)。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.argv[2] || process.cwd();
const manifestPath = path.join(root, 'docs/analysis/codex-v8-review-2026-09-10/source-change-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const followupPath = path.join(root, 'docs/analysis/codex-v9-followup-2026-09-11/source-change-manifest.json');
const followup = fs.existsSync(followupPath) ? JSON.parse(fs.readFileSync(followupPath, 'utf8')) : [];
const currentOverrides = new Map(followup.map((entry) => [entry.path.split('\\').join('/'), entry.currentSha256]));
const manifestPaths = new Set(manifest.map((entry) => entry.path.split('\\').join('/')));
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();

let match = 0, drift = 0, missing = 0;
let followupMatch = 0;
const drifted = [];
for (const entry of manifest) {
  const rel = entry.path.split('\\').join('/');
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) { missing += 1; drifted.push(['缺失', rel]); continue; }
  const cur = sha(abs);
  const expected = currentOverrides.get(rel) || entry.afterSha256;
  if (cur === expected) {
    match += 1;
    if (currentOverrides.has(rel)) followupMatch += 1;
    continue;
  }
  drift += 1;
  drifted.push([cur === entry.beforeSha256 ? '仍是修复前(v8原样)' : '第三次改动', rel]);
}
for (const rel of currentOverrides.keys()) {
  if (manifestPaths.has(rel)) continue;
  drift += 1;
  drifted.push(['后续覆盖不在基础清单', rel]);
}

console.log(`清单条目 ${manifest.length} | 当前分层清单一致 ${match} | 后续覆盖命中 ${followupMatch}/${currentOverrides.size} | 漂移 ${drift} | 缺失 ${missing}`);
console.log('--- 本轮被改过的文件(修复前后哈希不同) ---');
for (const entry of manifest.filter((e) => e.changed)) console.log('  ' + entry.path.split('\\').join('/'));
if (drifted.length) {
  console.log('--- 漂移明细 ---');
  for (const [kind, rel] of drifted) console.log(`  ${kind}  ${rel}`);
  process.exitCode = 1;
}
