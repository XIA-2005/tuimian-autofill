// check:adapters —— 合同与证据引用校验(PLAN v3 · P11)
// 不执行网络;校验:内置包结构不变量、页面/字段引用、试点证据文件格式与绑定样本哈希。
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { SCHOOL_ADAPTER_PACKAGES, validateAdapterPackage } from '../src/core/adapter-packages';
import { FIELD_RULES } from '../src/core/matcher';

const failures: string[] = [];
function check(name: string, cond: boolean): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
  if (!cond) failures.push(name);
}

/**
 * 功能:G08 严格证据校验(不执行网络)。
 * 规则:完整合同证据必须绑定真实内置包/页面/版本、非空样本(文件+哈希)、完整字段清单、
 * 生产配置哈希、测试入口与 offlinePassed=true;liveVerified 自动为 false,禁止伪造人工验收。
 * 任一必需项缺失或与当前源码不一致 → 立即失败(不做 optional 跳过)。
 */
function checkEvidence(file: string): void {
  check(`evidence 文件存在: ${file}`, existsSync(file));
  if (!existsSync(file)) return;
  let ev: unknown;
  try {
    ev = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    check(`evidence JSON 可解析: ${file}`, false);
    return;
  }
  const e = ev as Record<string, unknown>;
  const label = file;
  check(`schema 正确: ${label}`, e.schema === 'adapter_pilot_evidence_v1');
  // 通用行为夹具证据(显式 kind=generic)可单独校验;其余一律按完整合同证据要求。
  const kind = String(e.kind || 'contract');
  if (kind === 'generic') {
    check(`generic 证据必须离线通过: ${label}`, e.offlinePassed === true);
    return;
  }
  const pkgId = String(e.packageId || '');
  const pageId = String(e.pageId || '');
  const pkg = SCHOOL_ADAPTER_PACKAGES.find((p) => p.id === pkgId);
  check(`绑定真实内置包: ${label} -> ${pkgId}`, !!pkg);
  if (!pkg) return;
  check(`绑定真实页面: ${label} -> ${pageId}`, pkg.pages.some((pg) => pg.id === pageId));
  // 版本必须与当前内置包一致(旧版本证据不得放行)。
  check(`包版本与源码一致: ${label} (${pkg.version})`, String(e.packageVersion || '') === pkg.version);
  // 生产配置哈希:必须覆盖完整字段契约(含 dependsOn/dependencyWait/driver/选择器等),
  // 只哈希字段名会让新增依赖等待等配置变化无法使旧证据失效(H05)。
  const page = pkg.pages.find((pg) => pg.id === pageId);
  const contractPaths = (page?.fields || []).map((f) => f.profilePath).filter((x): x is string => !!x);
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(value as Record<string, unknown>).sort()) out[key] = stable((value as Record<string, unknown>)[key]);
      return out;
    }
    return value;
  };
  const configHash = createHash('sha256').update(JSON.stringify(stable({ packageId: pkg.id, version: pkg.version, pageId, fields: page?.fields || [] })), 'utf8').digest('hex');
  check(`生产配置哈希一致: ${label}`, String(e.configHash || '') === configHash);
  // 字段清单必须是完整集合(不能只写子集)。
  const declared = Array.isArray(e.fieldContracts) ? (e.fieldContracts as string[]) : [];
  const declaredSorted = [...declared].sort();
  const contractSorted = [...contractPaths].sort();
  check(`字段清单为完整集合: ${label}`, declared.length > 0 && JSON.stringify(declaredSorted) === JSON.stringify(contractSorted));
  // 样本:每项必须有 file 与 sha256,且哈希一致(缺一即失败)。
  const bound = e.boundSamples as Array<Record<string, unknown>> | undefined;
  check(`绑定样本非空: ${label}`, Array.isArray(bound) && bound.length > 0);
  if (Array.isArray(bound)) {
    for (const sample of bound) {
      const sampleFile = typeof sample.file === 'string' ? sample.file : '';
      const sampleHash = typeof sample.sha256 === 'string' ? sample.sha256 : '';
      check(`样本必须有 file 与 sha256: ${label} ${sampleFile || '(空)'}`, sampleFile.length > 0 && sampleHash.length > 0);
      if (!sampleFile || !sampleHash) continue;
      check(`样本文件存在: ${sampleFile}`, existsSync(sampleFile));
      if (existsSync(sampleFile)) {
        const actual = createHash('sha256').update(readFileSync(sampleFile, 'utf8'), 'utf8').digest('hex');
        check(`样本哈希一致: ${sampleFile}`, actual === sampleHash);
      }
    }
  }
  // 控件清单:必须有 shouldWrite 且各项在完整字段清单内;offlinePassed 必须为 true。
  const inv = e.controlInventory as Record<string, unknown> | undefined;
  const shouldWrite = inv && Array.isArray(inv.shouldWrite) ? (inv.shouldWrite as string[]) : [];
  check(`含非空 shouldWrite 清单: ${label}`, shouldWrite.length > 0);
  for (const path of shouldWrite) {
    check(`shouldWrite 项在字段清单内: ${path}`, declared.includes(path));
  }
  check(`offlinePassed 必须为 true: ${label}`, e.offlinePassed === true);
  // live 证据:必须有真实 reviewer;离线证据必须 liveVerified=false 且 reviewer 为空。
  if (e.liveVerified === true) {
    const reviewer = typeof e.reviewer === 'string' ? e.reviewer.trim() : '';
    check(`liveVerified=true 必须有 reviewer: ${label}`, reviewer.length > 0);
  } else {
    check(`离线证据 liveVerified=false: ${label}`, e.liveVerified === false);
  }
  const entries = Array.isArray(e.testEntries) ? (e.testEntries as unknown[]) : [];
  check(`含测试入口与结果: ${label}`, entries.length > 0);
}

/** 功能:校验全量内置包不变量(在 validateAdapterPackage 之上的引用级检查)。 */
function checkPackages(): void {
  const ids = new Set<string>();
  for (const pkg of SCHOOL_ADAPTER_PACKAGES) {
    try {
      validateAdapterPackage(pkg);
    } catch (err) {
      check(`包 ${pkg.id} 通过 validateAdapterPackage`, false);
      continue;
    }
    check(`包 ${pkg.id} schema 校验通过`, true);
    check(`包 id 唯一: ${pkg.id}`, !ids.has(pkg.id));
    ids.add(pkg.id);
    const pageIds = new Set<string>();
    for (const page of pkg.pages) {
      check(`页面 id 包内唯一: ${pkg.id}/${page.id}`, !pageIds.has(page.id));
      pageIds.add(page.id);
      for (const field of page.fields || []) {
        if (!field.profilePath) continue;
        const isRule = field.profilePath.startsWith('compose.') || field.profilePath.startsWith('#');
        const isArrayItem = /^(applications|familyMembers|selfStatements)\.\d+\.[a-zA-Z]+$/.test(field.profilePath);
        const knownRule = isRule || isArrayItem || field.profilePath.startsWith('basic.') || field.profilePath.startsWith('education.');
        check(`profilePath 形态合法: ${pkg.id}/${page.id}/${field.profilePath}`, knownRule);
        if (isRule && !field.profilePath.startsWith('#')) {
          const composeKey = field.profilePath.slice('compose.'.length);
          check(`compose 引用存在的规则族: ${field.profilePath}`, FIELD_RULES.some((r) => r.compose === composeKey));
        }
      }
    }
  }
  check('内置包数量>0', SCHOOL_ADAPTER_PACKAGES.length > 0);
}

checkPackages();
// F09:默认校验 evidence 目录下全部证据文件(新增证据自动纳入门禁);argv 可指定单个文件。
const argvFile = process.argv[2];
if (argvFile) {
  checkEvidence(argvFile);
} else {
  const evidenceDir = 'test/evidence';
  const files = existsSync(evidenceDir) ? readdirSync(evidenceDir).filter((f) => f.endsWith('.json') && !f.startsWith('.')).sort() : [];
  check('evidence 目录存在且非空', files.length > 0);
  for (const file of files) checkEvidence(`${evidenceDir}/${file}`);
}

if (failures.length) {
  console.error(`check:adapters 失败 ${failures.length} 项`);
  process.exit(1);
}
console.log('check:adapters 全部通过 ✅(无网络请求)');
