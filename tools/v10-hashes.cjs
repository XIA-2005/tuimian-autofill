// F04: v10 哈希分层重签治理工具（审计属性：不接入 npm 门禁）。
// B-1 增强（v10.2）：受管根"全树新文件可见性"——工作区中受管且 git 可见的文件，
// 若既不在 135 基线/签名层，也不在 v10 树快照，必须命中某卡 touch-list（报 DECLARED-NEW），
// 否则报 UNSIGNED-NEW 并 exit 1（声明即允许、未声明即拒——与 update 白名单同精神）。
// 模式：
//   node tools/v10-hashes.cjs baseline   —— v8 的 135 清单路径集快照当前 sha256 → v10-baseline.json
//   node tools/v10-hashes.cjs tree       —— 受管根内、9a0f40a（v10 冻结前）已存在的文件全量快照 → v10-tree.json
//                                            （树建立前工作区已有改动的文件记 externalDrift:true，如实暴露）
//   node tools/v10-hashes.cjs check      —— 漂移/缺失/UNSIGNED-NEW 任一非零即 exit 1
//   node tools/v10-hashes.cjs update <卡号> <相对路径...> —— 仅限该卡 touch-list 范围；支持删除墓碑
// 政策（任务书冻结）：卡交付→审查者独立复跑通过→执行者 update 重签→账本记前后哈希；未过审不得 update。
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const DIR = 'docs/analysis/v10-hashes';
const BASE = path.join(DIR, 'v10-baseline.json');
const TREE = path.join(DIR, 'v10-tree.json');
const SIGNED = path.join(DIR, 'card-signatures.json');
const TOUCH = path.join(DIR, 'touch-lists.json');
const V8_MANIFEST = 'docs/analysis/codex-v8-review-2026-09-10/source-change-manifest.json';
const GRANDFATHER_REF = '9a0f40a'; // v10 开工前最后一个已审提交
const MANAGED_ROOTS = ['src/', 'test/', 'tools/', '.github/', 'docs/analysis/'];
const MANAGED_ROOT_FILES = ['.gitattributes', '.gitignore', 'package.json', 'package-lock.json', 'tsconfig.json', 'build.mjs', 'package.mjs', 'serve.mjs'];

const norm = (p) => String(p).split(path.sep).join('/');
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();
const readJson = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback);
const gitLines = (cmd) => execSync(cmd, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).split(/\r?\n/).filter(Boolean).map(norm);

function inManaged(p) {
  return MANAGED_ROOTS.some((r) => p.startsWith(r)) || MANAGED_ROOT_FILES.includes(p);
}
/** 功能：把 glob（* 段匹配、** 跨段）编译为对相对路径的判定函数。 */
function globToRe(g) {
  const esc = norm(g).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*');
  return new RegExp('^' + esc + '$');
}
function allTouchRes() {
  const touch = readJson(TOUCH, {});
  const res = [];
  for (const patterns of Object.values(touch)) for (const g of patterns) res.push(globToRe(g));
  return res;
}
function expectedMap() {
  const base = readJson(BASE, { files: {} });
  const out = { ...base.files };
  const signed = readJson(SIGNED, {});
  for (const card of Object.keys(signed).sort()) for (const f of signed[card].files) out[norm(f.path)] = f.sha256;
  return out;
}

const mode = process.argv[2];

if (mode === 'baseline') {
  fs.mkdirSync(DIR, { recursive: true });
  const snap = {};
  for (const e of readJson(V8_MANIFEST, [])) {
    const p = norm(e.path);
    if (fs.existsSync(path.join(ROOT, p))) snap[p] = sha(path.join(ROOT, p));
  }
  for (const entry of Object.values(readJson(SIGNED, {}))) for (const f of entry.files) {
    if (f.sha256 !== 'DELETED' && fs.existsSync(path.join(ROOT, f.path))) snap[norm(f.path)] = sha(path.join(ROOT, f.path));
  }
  fs.writeFileSync(BASE, JSON.stringify({ at: new Date().toISOString(), count: Object.keys(snap).length, files: snap }, null, 1));
  console.log(`[v10-hashes] baseline 已建立：${Object.keys(snap).length} 个文件 → ${BASE}`);
  process.exit(0);
}

if (mode === 'tree') {
  if (!fs.existsSync(BASE)) { console.error('[v10-hashes] 先运行 baseline'); process.exit(2); }
  const expected = expectedMap();
  const old = execSync(`git -c core.quotePath=false ls-tree -r --name-only ${GRANDFATHER_REF}`, { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean).map(norm);
  const dirty = new Set(execSync(`git -c core.quotePath=false diff --name-only ${GRANDFATHER_REF} HEAD`, { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean).map(norm));
  for (const l of execSync('git -c core.quotePath=false status --porcelain', { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)) {
    const m = l.slice(3).split(' -> ').pop(); dirty.add(norm(m.replace(/^"|"$/g, '')));
  }
  const snap = {};
  let external = 0;
  for (const p of old) {
    if (!inManaged(p) || expected[p] !== undefined) continue;
    const abs = path.join(ROOT, p);
    if (!fs.existsSync(abs)) continue;
    const rec = { sha256: sha(abs) };
    if (dirty.has(p)) { rec.externalDrift = true; external++; }
    snap[p] = rec;
  }
  fs.writeFileSync(TREE, JSON.stringify({ at: new Date().toISOString(), grandfather: GRANDFATHER_REF, count: Object.keys(snap).length, externalDriftCount: external, files: snap }, null, 1));
  console.log(`[v10-hashes] tree 快照：${Object.keys(snap).length} 个受管存量文件（其中 externalDrift ${external}，建立前工作区已有改动，如实记录）`);
  process.exit(0);
}

if (mode === 'check') {
  const base = readJson(BASE, null);
  if (!base) { console.error('[v10-hashes] 无基线，先运行 baseline'); process.exit(2); }
  const tree = readJson(TREE, null);
  if (!tree) { console.error('[v10-hashes] 无树快照，先运行 tree（否则存量文件全部按新文件判定）'); process.exit(2); }
  const expected = expectedMap();
  let ok = 0; const drift = []; const missing = [];
  for (const [p, exp] of Object.entries(expected)) {
    const abs = path.join(ROOT, p);
    if (exp === 'DELETED') { if (!fs.existsSync(abs)) ok++; else drift.push(p + '(应已删除但存在)'); continue; }
    if (!fs.existsSync(abs)) { missing.push(p); continue; }
    if (sha(abs) === exp) ok++; else drift.push(p);
  }
  const known = new Set([...Object.keys(expected), ...Object.keys(tree.files)]);
  const touchRes = allTouchRes();
  const declared = []; const unsigned = [];
  for (const p of gitLines('git -c core.quotePath=false ls-files -co --exclude-standard')) {
    if (!inManaged(p) || known.has(p)) continue;
    if (touchRes.some((r) => r.test(p))) declared.push(p); else unsigned.push(p);
  }
  console.log(`[v10-hashes] check：受控一致 ${ok} | 漂移 ${drift.length} | 缺失 ${missing.length} | 新文件已声明 ${declared.length} | 未声明 ${unsigned.length}（基线+签名 ${Object.keys(expected).length} ∪ 树 ${Object.keys(tree.files).length}）`);
  for (const d of drift) console.log('DRIFT ' + d);
  for (const m of missing) console.log('MISSING ' + m);
  for (const d of declared) console.log('DECLARED-NEW ' + d);
  for (const u of unsigned) console.log('UNSIGNED-NEW ' + u);
  process.exit(drift.length || missing.length || unsigned.length ? 1 : 0);
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
  const lastExpected = expectedMap();
  const out = [];
  for (const p of files) {
    if (!res.some((r) => r.test(p))) { console.error(`[v10-hashes] REJECT：${p} 不在卡 ${card} 的 touch-list 内`); process.exit(1); }
    const abs = path.join(ROOT, p);
    if (!fs.existsSync(abs)) {
      // 删除墓碑：仅限此前已被跟踪（基线/签名/树）的文件（自证删除，如 F03 删临时 runner）。
      const inTree = readJson(TREE, { files: {} }).files[p] !== undefined;
      if (lastExpected[p] === undefined && !inTree) { console.error(`[v10-hashes] REJECT：${p} 不存在且从未被跟踪，无从签`); process.exit(1); }
      const prev = lastExpected[p];
      if (prev === 'DELETED') { console.error(`[v10-hashes] REJECT：${p} 已是删除墓碑，无变化不签`); process.exit(1); }
      out.push({ path: p, sha256: 'DELETED', prev: prev === undefined ? 'TREE' : prev });
      continue;
    }
    const now = sha(abs);
    if (lastExpected[p] === now) { console.error(`[v10-hashes] REJECT：${p} 与上次签名相同，无变化不签`); process.exit(1); }
    out.push({ path: p, sha256: now, prev: lastExpected[p] || null });
  }
  const signed = readJson(SIGNED, {});
  signed[card] = { at: new Date().toISOString(), files: out };
  fs.writeFileSync(SIGNED, JSON.stringify(signed, null, 1));
  console.log(`[v10-hashes] 已重签卡 ${card}：` + out.map((f) => `${f.path} ${String(f.prev).slice(0, 8)}→${f.sha256.slice(0, 8)}`).join(' | '));
  process.exit(0);
}

console.error('未知模式：baseline | tree | check | update <卡号> <files...>');
process.exit(2);
