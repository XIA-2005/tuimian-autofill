// F04: v10 哈希基线分层重签治理工具（审计属性：不接入 npm 门禁）。
// 模式：
//   node tools/v10-hashes.cjs baseline          —— 对 v8 的 135 清单路径集+已签名新增文件，快照当前工作区 sha256 → v10-baseline.json
//   node tools/v10-hashes.cjs check             —— 工作区 vs baseline+最新签名；漂移/缺失输出具名文件，非零退出
//   node tools/v10-hashes.cjs update <卡号> <相对路径...> —— 仅允许该卡在 touch-lists.json 登记的范围内重签；越界拒绝
// 政策（任务书 F04 冻结）：卡交付→审查者独立复跑通过→执行者 update 重签→账本记前后哈希；未过审不得 update。
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const DIR = 'docs/analysis/v10-hashes';
const BASE = path.join(DIR, 'v10-baseline.json');
const SIGNED = path.join(DIR, 'card-signatures.json');
const TOUCH = path.join(DIR, 'touch-lists.json');
const V8_MANIFEST = 'docs/analysis/codex-v8-review-2026-09-10/source-change-manifest.json';

const norm = (p) => String(p).split(path.sep).join('/');
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();
const readJson = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback);

/** 功能：把 glob（* 段匹配）编译为对相对路径的判定函数。 */
function globToRe(g) {
  const esc = g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*');
  return new RegExp('^' + esc + '$');
}

function baselinePaths() {
  const set = new Set();
  for (const e of readJson(V8_MANIFEST, [])) set.add(norm(e.path));
  for (const entry of Object.values(readJson(SIGNED, {}))) for (const f of entry.files) set.add(norm(f.path));
  return [...set].filter((p) => fs.existsSync(path.join(ROOT, p))).sort();
}

const mode = process.argv[2];
if (mode === 'baseline') {
  fs.mkdirSync(DIR, { recursive: true });
  const snap = {};
  for (const p of baselinePaths()) snap[p] = sha(path.join(ROOT, p));
  fs.writeFileSync(BASE, JSON.stringify({ at: new Date().toISOString(), count: Object.keys(snap).length, files: snap }, null, 1));
  console.log(`[v10-hashes] baseline 已建立：${Object.keys(snap).length} 个文件 → ${BASE}`);
  process.exit(0);
}

if (mode === 'check') {
  const base = readJson(BASE, null);
  if (!base) { console.error('[v10-hashes] 无基线，先运行 baseline'); process.exit(2); }
  const signed = readJson(SIGNED, {});
  const expected = { ...base.files };
  for (const card of Object.keys(signed).sort()) for (const f of signed[card].files) expected[norm(f.path)] = f.sha256;
  let ok = 0; const drift = []; const missing = [];
  for (const p of Object.keys(expected)) {
    const abs = path.join(ROOT, p);
    if (expected[p] === 'DELETED') { if (!fs.existsSync(abs)) ok++; else drift.push(p + '(应已删除但存在)'); continue; }
    if (!fs.existsSync(abs)) { missing.push(p); continue; }
    if (sha(abs) === expected[p]) ok++; else drift.push(p);
  }
  console.log(`[v10-hashes] check：一致 ${ok} | 漂移 ${drift.length} | 缺失 ${missing.length}（基线+签名覆盖 ${Object.keys(expected).length}）`);
  for (const d of drift) console.log('DRIFT ' + d);
  for (const m of missing) console.log('MISSING ' + m);
  process.exit(drift.length || missing.length ? 1 : 0);
}

if (mode === 'update') {
  const card = process.argv[3];
  const files = process.argv.slice(4).map(norm);
  if (!card || !files.length) { console.error('用法: update <卡号> <相对路径...>'); process.exit(2); }
  const touch = readJson(TOUCH, {});
  const patterns = touch[card];
  if (!Array.isArray(patterns) || patterns.length === 0) {
    console.error(`[v10-hashes] REJECT：卡 ${card} 无 touch-list 登记（先在该卡开工时登记允许改动范围）`);
    process.exit(1);
  }
  const res = patterns.map(globToRe);
  const base = readJson(BASE, { files: {} });
  const signed = readJson(SIGNED, {});
  const lastExpected = { ...base.files };
  for (const c of Object.keys(signed).sort()) for (const f of signed[c].files) lastExpected[norm(f.path)] = f.sha256;
  const out = [];
  for (const p of files) {
    if (!res.some((r) => r.test(p))) { console.error(`[v10-hashes] REJECT：${p} 不在卡 ${card} 的 touch-list 内`); process.exit(1); }
    const abs = path.join(ROOT, p);
    if (!fs.existsSync(abs)) {
      // 删除墓碑：仅限基线/签名里存在过的文件（自证的删除如 F03 删临时 runner）。
      if (lastExpected[p] === undefined) { console.error(`[v10-hashes] REJECT：${p} 不存在且从未被跟踪，无从签`); process.exit(1); }
      if (lastExpected[p] === 'DELETED') { console.error(`[v10-hashes] REJECT：${p} 已是删除墓碑，无变化不签`); process.exit(1); }
      out.push({ path: p, sha256: 'DELETED', prev: lastExpected[p] });
      continue;
    }
    const now = sha(abs);
    if (lastExpected[p] === now) { console.error(`[v10-hashes] REJECT：${p} 与上次签名相同，无变化不签`); process.exit(1); }
    out.push({ path: p, sha256: now, prev: lastExpected[p] || null });
  }
  signed[card] = { at: new Date().toISOString(), files: out };
  fs.writeFileSync(SIGNED, JSON.stringify(signed, null, 1));
  console.log(`[v10-hashes] 已重签卡 ${card}：` + out.map((f) => `${f.path} ${String(f.prev).slice(0, 8)}→${f.sha256.slice(0, 8)}`).join(' | '));
  process.exit(0);
}

console.error('未知模式：baseline | check | update <卡号> <files...>');
process.exit(2);
