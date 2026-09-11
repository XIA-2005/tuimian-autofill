// F04: v10 哈希分层重签治理工具（审计属性：不接入 npm 门禁）。
// B-1（v10.2）：受管根新文件可见性——工作区 git 可见、不在基线∪签名∪树、又不命中任何卡
//   touch-list 的文件 = UNSIGNED-NEW（exit 1）；命中 = DECLARED-NEW（可见放行）。声明即允许、未声明即拒。
// B-3（v10.3）：tree-only 存量文件的改动可见性——与"git blob@9a0f40a"逐字节比对（EOL 归一后），
//   命中 touch-list = DECLARED-MOD，否则 TREE-DRIFT（exit 1）。补上 N-3 实证过的洞：
//   受管根内、不在 135 基线的存量文件（如 .github/*.yml）改了可以一声不吭。
// 设计要点（执行者偏差，供审查者否决）：
//   (i) 哈希源=git blob@grandfather(9a0f40a) 而非磁盘——blob 是 git 的 LF 规范形，autocrlf 渲染翻转
//       （B-3 第 2 步实测 .gitignore raw≠blob 同内容）不再假报；重跑 baseline/tree 无法把未审改动洗进基线。
//   (ii) 树建立时磁盘已≠blob 的文件（用户并行会话产物）标 externalDrift，check 中报 EXTERNAL-MOD
//       信息行、不计 exit——与审查者"tree 改动只报 1 项"预检口径一致（其预检用 committed diff）。
//   (iii) -c core.quotePath=false 全程使用（B-1 发现的中文名转义逃逸）。
// 模式：baseline | tree | check [--strict] | update <卡号> <files...>
//   --strict：额外要求所有已声明/已暴露文件均已签名冻结（未来接 CI 用）；externalMod（§5.1 豁免表三文件）不计入 strict 失败[v10.5 残留 2 修复]。
// 政策（任务书冻结）：卡交付→审查者独立复跑通过→执行者 update 重签→账本记前后哈希与 check 输出全文
//   （[N-流程] 签名动作必须把当时的 check 输出贴进账本——本工具未接 CI，守卫强度依赖复跑留痕）。
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, execSync } = require('child_process');

const ROOT = process.cwd();
const DIR = 'docs/analysis/v10-hashes';
const BASE = path.join(DIR, 'v10-baseline.json');
const TREE = path.join(DIR, 'v10-tree.json');
const SIGNED = path.join(DIR, 'card-signatures.json');
const TOUCH = path.join(DIR, 'touch-lists.json');
const V8_MANIFEST = 'docs/analysis/codex-v8-review-2026-09-10/source-change-manifest.json';
const GRANDFATHER_REF = '9a0f40a'; // v10 开工前最后已审提交（v9 收口 + CI 运行时修复）
const MANAGED_ROOTS = ['src/', 'test/', 'tools/', '.github/', 'docs/analysis/'];
const MANAGED_ROOT_FILES = ['.gitattributes', '.gitignore', 'package.json', 'package-lock.json', 'tsconfig.json', 'build.mjs', 'package.mjs', 'serve.mjs'];

const norm = (p) => String(p).split(path.sep).join('/');
const git = (args) => execSync(`git ${args}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split(/\r?\n/).filter(Boolean).map(norm);
const shaBuf = (buf) => crypto.createHash('sha256').update(Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1')).digest('hex').toUpperCase();
const diskSha = (p) => shaBuf(fs.readFileSync(path.join(ROOT, p)));
/** 功能：git blob@9a0f40a 的 EOL 归一哈希；该提交不存在此路径返回 undefined，git 不可达（未跟踪/忽略）也 undefined。 */
function blobSha(p) {
  try { return shaBuf(execFileSync('git', ['-c', 'core.quotePath=false', 'show', `${GRANDFATHER_REF}:${p}`], { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })); }
  catch { return undefined; }
}
/** 功能：建树时"未提交"的受管文件集合（并行会话产物）——externalDrift 的唯一合法来源。
 *  已提交的改动不算 external：那是 v10 卡的工作产物，必须走 TREE-DRIFT→声明→签名→归零。
 *  残留限制：策略性约束——tree 只应在冻结时建一次；重复重建会把"已提交但未审"洗白，账本必须留痕。 */
function dirtyAtBuild() {
  const set = new Set();
  for (const l of execSync('git -c core.quotePath=false status --porcelain --untracked-files=no', { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)) {
    set.add(norm(l.slice(3).split(' -> ').pop().replace(/^"|"$/g, '')));
  }
  return set;
}
const readJson = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback);
function inManaged(p) { return MANAGED_ROOTS.some((r) => p.startsWith(r)) || MANAGED_ROOT_FILES.includes(p); }
function globToRe(g) {
  const esc = norm(g).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*');
  return new RegExp('^' + esc + '$');
}
function allTouchRes() {
  const res = [];
  for (const patterns of Object.values(readJson(TOUCH, {}))) for (const g of patterns) res.push(globToRe(g));
  return res;
}
function expectedMap() {
  const out = { ...readJson(BASE, { files: {} }).files };
  const signed = readJson(SIGNED, {});
  for (const card of Object.keys(signed).sort()) for (const f of signed[card].files) out[norm(f.path)] = f.sha256;
  return out;
}

const mode = process.argv[2];

if (mode === 'baseline') {
  fs.mkdirSync(DIR, { recursive: true });
  const snap = {};
  let absent = 0;
  for (const e of readJson(V8_MANIFEST, [])) {
    const p = norm(e.path);
    const b = blobSha(p);
    if (b) snap[p] = b;
    else if (fs.existsSync(path.join(ROOT, p))) snap[p] = diskSha(p); // gitignored 清单文件（如临时 runner 在册期间）：按磁盘哈希托管
    else { snap[p] = 'ABSENT'; absent++; }
  }
  fs.writeFileSync(BASE, JSON.stringify({ at: new Date().toISOString(), anchor: GRANDFATHER_REF + '(git blob, EOL 归一)', count: Object.keys(snap).length, absentCount: absent, files: snap }, null, 1));
  console.log(`[v10-hashes] baseline：${Object.keys(snap).length} 个文件（锚=${GRANDFATHER_REF} blob；ABSENT ${absent}——多为 v8 清单里的 gitignored 临时文件，check 报 MISSING 直至删除墓碑签名）`);
  process.exit(0);
}

if (mode === 'tree') {
  if (!fs.existsSync(BASE)) { console.error('[v10-hashes] 先运行 baseline'); process.exit(2); }
  const expected = expectedMap();
  const old = git(`-c core.quotePath=false ls-tree -r --name-only ${GRANDFATHER_REF}`);
  const dirty = dirtyAtBuild();
  if (fs.existsSync(TREE)) console.log('[v10-hashes] 注意：覆盖重建 tree——已提交但未审的 tree 文件改动会被洗白入基线（政策：tree 只在冻结时建一次，重建须记账本）');
  const snap = {};
  let external = 0;
  for (const p of old) {
    if (!inManaged(p) || expected[p] !== undefined) continue;
    const b = blobSha(p); // 已确认 9a0f40a 存在（来自 ls-tree），必有值
    const rec = { sha256: b };
    if (dirty.has(p)) { rec.externalDrift = true; external++; }
    snap[p] = rec;
  }
  fs.writeFileSync(TREE, JSON.stringify({ at: new Date().toISOString(), grandfather: GRANDFATHER_REF, count: Object.keys(snap).length, externalDriftCount: external, files: snap }, null, 1));
  console.log(`[v10-hashes] tree 快照：${Object.keys(snap).length} 个受管存量文件（锚 blob；externalDrift ${external} = 建树时磁盘已≠锚点，如实暴露不计卡账）`);
  process.exit(0);
}

if (mode === 'check') {
  const base = readJson(BASE, null);
  if (!base) { console.error('[v10-hashes] 无基线，先运行 baseline'); process.exit(2); }
  const tree = readJson(TREE, null);
  if (!tree) { console.error('[v10-hashes] 无树快照，先运行 tree'); process.exit(2); }
  const strict = process.argv.includes('--strict');
  const expected = expectedMap();
  let ok = 0; const drift = []; const missing = [];
  for (const [p, exp] of Object.entries(expected)) {
    const abs = path.join(ROOT, p);
    if (exp === 'DELETED') { if (!fs.existsSync(abs)) ok++; else drift.push(p + '(应已删除但存在)'); continue; }
    if (exp === 'ABSENT') { if (!fs.existsSync(abs)) missing.push(p + '(锚点缺且磁盘无——待删除墓碑)'); else ok++; continue; }
    if (!fs.existsSync(abs)) { missing.push(p); continue; }
    if (diskSha(p) === exp) ok++; else drift.push(p);
  }
  const known = new Set([...Object.keys(expected), ...Object.keys(tree.files)]);
  const touchRes = allTouchRes();
  const declared = []; const unsigned = [];
  for (const p of git('-c core.quotePath=false ls-files -co --exclude-standard')) {
    if (!inManaged(p) || known.has(p)) continue;
    if (touchRes.some((r) => r.test(p))) declared.push(p); else unsigned.push(p);
  }
  const declaredMod = []; const treeDrift = []; const externalMod = [];
  for (const [p, rec] of Object.entries(tree.files)) {
    if (expected[p] !== undefined) continue; // 已进受控层，由漂移循环负责
    let cur; try { cur = diskSha(p); } catch { cur = 'DELETED'; }
    if (cur === rec.sha256) continue;
    if (rec.externalDrift) externalMod.push(p);
    else if (touchRes.some((r) => r.test(p))) declaredMod.push(p);
    else treeDrift.push(p);
  }
  console.log(`[v10-hashes] check：受控一致 ${ok} | 漂移 ${drift.length} | 缺失 ${missing.length} | 新文件已声明 ${declared.length} | 未声明 ${unsigned.length} | 存量已声明改动 ${declaredMod.length} | 存量漂移 ${treeDrift.length} | 外部改动 ${externalMod.length}（基线+签名 ${Object.keys(expected).length} ∪ 树 ${Object.keys(tree.files).length}）${strict ? ' [--strict]' : ''}`);
  for (const d of drift) console.log('DRIFT ' + d);
  for (const m of missing) console.log('MISSING ' + m);
  for (const d of declared) console.log('DECLARED-NEW ' + d);
  for (const u of unsigned) console.log('UNSIGNED-NEW ' + u);
  for (const d of declaredMod) console.log('DECLARED-MOD ' + d);
  for (const d of treeDrift) console.log('TREE-DRIFT ' + d);
  for (const d of externalMod) console.log('EXTERNAL-MOD ' + d);
  console.log('[说明] 漂移/缺失/未声明/存量漂移 非零在 RD-7 待审态下属预期（签名后归零），非 CI 事故；EXTERNAL-MOD 为并行会话产物信息行；--strict 额外要求已声明文件全部签名。');
  // [v10.5] §5.1 残留 2 修复：strict 排除 externalMod（三文件豁免表永久 external，未提交前 strict 恒红）；
  // declared/declaredMod 加严保留（已声明文件仍须签名冻结）。
  const fail = drift.length || missing.length || unsigned.length || treeDrift.length || (strict && (declared.length + declaredMod.length));
  process.exit(fail ? 1 : 0);
}

if (mode === 'update') {
  const card = process.argv[3];
  const files = process.argv.slice(4).map(norm);
  if (!card || !files.length) { console.error('用法: update <卡号> <相对路径...>'); process.exit(2); }
  const patterns = readJson(TOUCH, {})[card];
  if (!Array.isArray(patterns) || patterns.length === 0) {
    console.error(`[v10-hashes] REJECT：卡 ${card} 无 touch-list 登记（开工时登记允许范围，RD-7）`);
    process.exit(1);
  }
  const res = patterns.map(globToRe);
  const lastExpected = expectedMap();
  const treeFiles = readJson(TREE, { files: {} }).files;
  const out = [];
  const changed = [];
  for (const p of files) {
    if (!res.some((r) => r.test(p))) { console.error(`[v10-hashes] REJECT：${p} 不在卡 ${card} 的 touch-list 内`); process.exit(1); }
    const abs = path.join(ROOT, p);
    if (!fs.existsSync(abs)) {
      const tracked = lastExpected[p] !== undefined || treeFiles[p] !== undefined;
      if (!tracked) { console.error(`[v10-hashes] REJECT：${p} 不存在且从未被跟踪，无从签`); process.exit(1); }
      if (lastExpected[p] === 'DELETED') { console.error(`[v10-hashes] REJECT：${p} 已是删除墓碑`); process.exit(1); }
      out.push({ path: p, sha256: 'DELETED', prev: lastExpected[p] === undefined ? 'TREE' : lastExpected[p] });
      changed.push(p);
      continue;
    }
    const now = diskSha(p);
    // [v10.5] 签名语义修复：update 为替换式（signed[card]=本次清单），此前"任一文件无变化→整卡 REJECT"与
    // 替换式组合出死角——批内部分文件再改动时列全必 REJECT、列部分则洗白其余。现改为：真变化签入，
    // 无变化重申同哈希（prev==now，签名层不丢文件），仅整批全无变化才 REJECT（保留 L-F04 负向自检 NEG2）。
    if (lastExpected[p] === now) { out.push({ path: p, sha256: now, prev: now }); continue; }
    out.push({ path: p, sha256: now, prev: lastExpected[p] === undefined ? null : lastExpected[p] });
    changed.push(p);
  }
  if (!changed.length) { console.error(`[v10-hashes] REJECT：卡 ${card} 本批全部文件与上次签名相同，无变化不签`); process.exit(1); }
  const signed = readJson(SIGNED, {});
  signed[card] = { at: new Date().toISOString(), files: out };
  fs.writeFileSync(SIGNED, JSON.stringify(signed, null, 1));
  console.log(`[v10-hashes] 已重签卡 ${card}：` + out.map((f) => `${f.path} ${String(f.prev).slice(0, 8)}${f.prev === f.sha256 ? '==（重申）' : '→' + f.sha256.slice(0, 8)}`).join(' | '));
  process.exit(0);
}

console.error('未知模式：baseline | tree | check [--strict] | update <卡号> <files...>');
process.exit(2);
