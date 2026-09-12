// bench --oracle:真实(已签 oracle)路径——加载 oracle-F01.signed.json,锚定 draft sha256
// (invalidatesOn 条款:不符即签名失效),逐校走 fill-pipeline 真实入口 + 四分类。
// 本模式不断言四元组全绿(红相位素材,供 F02/账本);--negative-overfill 时注入期望外写入,
// 检出 → 具名 exit 1(负向证明成立,预期结局);未检出 → exit 2(门禁失效)。
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeDomIsolated } from '../regression/observer';
import { emptyProfile } from '../../src/core/profile';
import type { Profile } from '../../src/core/profile';
import { runFillPipeline } from '../../src/core/fill-pipeline';
import { registerWriteOwnership } from '../../src/core/filler';
import { classifyControls, tallyControls } from './classify';
import type { ClassifyRow, Expectation, Refusal } from './classify';
import { shapeValue, digestValue } from './report';

/** oracle 抽象档案路径(P6 协议描述层) → Profile schema 路径的对齐表;未列出即抛错,防静默漏源。 */
const ORACLE_PATH_TO_PROFILE: Record<string, string> = {
  'emergency.name': 'basic.emergencyName',
  'emergency.phone': 'basic.emergencyPhone',
  'language.cet4': 'education.cet4',
  'language.cet6': 'education.cet6',
  'language.majorLang': 'education.foreignLang',
  'apply.targetCollege': 'applications[0].college',
};

interface SignedOracle {
  schema: string;
  verdict: string;
  batch: string;
  draft: { path: string; sha256: string; counts: { fixtures: number; items: number; refusals: number } };
  fixtureHashes: Record<string, string>;
  invalidatesOn: string;
}

interface DraftFixture {
  fixtureId: string;
  fixturePage: string;
  school: string;
  items: Array<{ locator: { kind: string; value: string }; profileSource: { path: string; value: string }; expectedLiteral: string }>;
  refusals: Array<{ locator: { kind: string; value: string }; reason: string; gapId: string; expect?: string; covers?: string[] }>;
}

function sha256Text(v: string): string {
  return createHash('sha256').update(v, 'utf8').digest('hex');
}

/** 功能:oracle locator → 控件键(name/id 直取;css 解析到元素后取 name||id;解析失败抛错——E1 保证 ≥1)。 */
function locatorToKey(doc: Document, locator: { kind: string; value: string }): string {
  if (locator.kind === 'name' || locator.kind === 'id') return locator.value;
  if (locator.kind === 'css') {
    const el = doc.querySelector(locator.value);
    if (!el) throw new Error(`css locator 未解析: ${locator.value}(E1 保证 ≥1,失败=夹具与 oracle 不符)`);
    return el.getAttribute('name') || el.id || '';
  }
  throw new Error(`未支持的 locator.kind: ${locator.kind}`);
}

/** 功能:按对齐表构造档案;同路径异值抛错(生成器保证一致,此处防静默覆盖)。 */
function buildProfile(fix: DraftFixture): Profile {
  const profile = emptyProfile();
  const seen = new Map<string, string>();
  for (const item of fix.items) {
    const src = item.profileSource;
    const target = ORACLE_PATH_TO_PROFILE[src.path] ?? src.path;
    const prev = seen.get(target);
    if (prev !== undefined && prev !== src.value) throw new Error(`同路径异值: ${target} = ${JSON.stringify(prev)} vs ${JSON.stringify(src.value)}`);
    seen.set(target, src.value);
    const m = target.match(/^applications\[(\d+)\]\.(\w+)$/);
    if (m) {
      const idx = Number(m[1]);
      while (profile.applications.length <= idx) profile.applications.push({ school: '', college: '', major: '', direction: '', degreeType: '', supervisor: '', note: '' });
      (profile.applications[idx] as unknown as Record<string, string>)[m[2]] = src.value;
      continue;
    }
    const seg = target.split('.');
    let node: Record<string, unknown> = profile as unknown as Record<string, unknown>;
    for (let i = 0; i < seg.length - 1; i++) {
      if (typeof node[seg[i]] !== 'object' || node[seg[i]] === null) throw new Error(`Profile 路径不存在: ${target}`);
      node = node[seg[i]] as Record<string, unknown>;
    }
    if (!(seg[seg.length - 1] in node)) throw new Error(`Profile 字段不存在: ${target}(对齐表缺项,禁静默漏源)`);
    node[seg[seg.length - 1]] = src.value;
  }
  return profile;
}

function loadSigned(signedPath: string): { signed: SignedOracle; draft: { fixtures: DraftFixture[] } } {
  const signed = JSON.parse(readFileSync(signedPath, 'utf8')) as SignedOracle;
  const draftAbs = join(process.cwd(), signed.draft.path);
  const draftText = readFileSync(draftAbs, 'utf8');
  const actual = sha256Text(draftText);
  if (actual !== signed.draft.sha256) {
    console.error(`具名断言[ORACLE-SIGNATURE-失效]: draft sha256 复算 ${actual.slice(0, 8)}… ≠ 签名锚定 ${signed.draft.sha256.slice(0, 8)}… —— ${signed.invalidatesOn}`);
    process.exit(3);
  }
  const draft = JSON.parse(draftText) as { fixtures: DraftFixture[] };
  const items = draft.fixtures.reduce((n, f) => n + f.items.length, 0);
  const refusals = draft.fixtures.reduce((n, f) => n + f.refusals.length, 0);
  if (draft.fixtures.length !== signed.draft.counts.fixtures || items !== signed.draft.counts.items || refusals !== signed.draft.counts.refusals) {
    console.error(`具名断言[ORACLE-COUNTS-不符]: 实测 fixtures=${draft.fixtures.length}/items=${items}/refusals=${refusals} ≠ 签名 counts=${JSON.stringify(signed.draft.counts)}`);
    process.exit(3);
  }
  return { signed, draft };
}

export function runOracle(signedPath: string, negative: boolean): number {
  const { signed, draft } = loadSigned(signedPath);
  console.log(`[oracle] 锚定通过: ${signed.schema} verdict=${signed.verdict} batch=${signed.batch} draft=${signed.draft.sha256.slice(0, 8)}…(复算一致)`);

  const failures: string[] = [];
  const summary: Array<{ fixtureId: string; tally: ReturnType<typeof tallyControls>; untrackedKeys: string[]; injected: boolean; detected: boolean; defectKeys: string[] }> = [];

  for (const fix of draft.fixtures) {
    const html = readFileSync(join(process.cwd(), fix.fixturePage), 'utf8');
    const url = `https://oracle.fixture/${fix.fixtureId}/`;
    const ctx = makeDomIsolated(html, url);
    runFillPipeline(buildProfile(fix), ctx.doc, url);

    const expectations = new Map<string, Expectation>();
    for (const item of fix.items) {
      const key = locatorToKey(ctx.doc, item.locator);
      expectations.set(key, { key, expectedLiteral: item.expectedLiteral, profileField: item.profileSource.path });
    }
    const refusals = new Map<string, Refusal>();
    for (const ref of fix.refusals) {
      const key = locatorToKey(ctx.doc, ref.locator);
      for (const k of ref.covers && ref.covers.length ? ref.covers : [key]) {
        refusals.set(k, { key: k, reason: ref.reason, gapId: ref.gapId });
      }
    }
    const mapsIn = { expectations, refusals, shape: shapeValue, digest: digestValue };
    let rows: ClassifyRow[] = classifyControls(ctx.doc, mapsIn);

    if (negative) {
      // [W-2 v10.5] 注入载体=拒填清单内控件:拒填却写=P4 唯一 overfill 语义;未建模(untracked)写入非越界,不作载体。
      const target = rows.find((r) => r.cls === 'refused');
      if (!target) {
        failures.push(`[${fix.fixtureId}] 无 untracked 与 refused 控件可作越界注入载体`);
        summary.push({ fixtureId: fix.fixtureId, tally: tallyControls(rows), untrackedKeys: [], injected: false, detected: false, defectKeys: [] });
      } else {
        const el = ctx.doc.querySelector(`[name="${target.key}"]`) || ctx.doc.getElementById(target.key);
        if (!el) {
          failures.push(`[${fix.fixtureId}] 注入载体控件无法定位: ${target.key}`);
          summary.push({ fixtureId: fix.fixtureId, tally: tallyControls(rows), untrackedKeys: [], injected: false, detected: false, defectKeys: [] });
        } else {
          const probe = 'NEGATIVE-OVERFILL-PROBE';
          (el as HTMLInputElement).value = probe;
          registerWriteOwnership(ctx.doc, el, probe, 'text');
          rows = classifyControls(ctx.doc, mapsIn);
          const detected = rows.find((r) => r.key === target.key)?.cls === 'overfill';
          if (!detected) failures.push(`[${fix.fixtureId}] 注入 ${target.key} 后未判 overfill(实为 ${rows.find((r) => r.key === target.key)?.cls})`);
          summary.push({
            fixtureId: fix.fixtureId,
            tally: tallyControls(rows),
            untrackedKeys: [],
            injected: true,
            detected,
            defectKeys: rows.filter((r) => r.cls === 'wrong' || r.cls === 'missing').map((r) => `${r.cls}:${r.key}`),
          });
        }
      }
    } else {
      summary.push({
        fixtureId: fix.fixtureId,
        tally: tallyControls(rows),
        untrackedKeys: rows.filter((r) => r.cls === 'untracked').map((r) => r.key),
        injected: false,
        detected: false,
        defectKeys: rows.filter((r) => r.cls === 'wrong' || r.cls === 'missing').map((r) => `${r.cls}:${r.key}`),
      });
    }
    ctx.restore();
  }

  for (const s of summary) {
    console.log(`[oracle] ${s.fixtureId}: 四元组(overfill=${s.tally.overfill}, wrong=${s.tally.wrong}, missing=${s.tally.missing}, refused=${s.tally.refused}) filled=${s.tally.filled} untracked=${s.tally.untracked}`);
    if (s.defectKeys.length) console.log(`[oracle]   缺陷键(P7 显形,值不落盘): ${s.defectKeys.join(', ')}`);
    if (negative) console.log(`[oracle]   注入=${s.injected ? s.injected : '未执行'} 检出=${s.detected}`);
  }

  if (negative) {
    const injectedAll = summary.every((s) => s.injected && s.detected);
    if (injectedAll && !failures.length) {
      console.error('具名断言[NEGATIVE-OVERFILL@oracle]: 真实(已签 oracle)路径下每校注入的拒填清单内控件被写入均被四分类判定 overfill —— 越界门禁有效，负向证明成立，按约定 exit 1');
      return 1;
    }
    console.error(`具名断言[NEGATIVE-OVERFILL@oracle-失效]: 每校注入+检出配对未全部成立(注入/检出: ${summary.map((s) => `${s.injected}/${s.detected}`).join(', ')}) —— P4 台账口径在真实 oracle 路径失效`);
    return 2;
  }
  if (failures.length) {
    console.error(`bench --oracle 失败 ${failures.length} 项:\n- ${failures.join('\n- ')}`);
    return 1;
  }
  console.log('[oracle] 真实路径四分类完成(四元组为红相位素材,不断言全绿;拒填 expect/deferredTo 显形见 classify 输出)');
  return 0;
}
