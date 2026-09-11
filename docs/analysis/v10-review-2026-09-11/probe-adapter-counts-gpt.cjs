// GPT 第三方只读探针：同时给出“全部非通配包”和“含 form 的可填写包”两套口径。
// 用法：node docs/analysis/v10-review-2026-09-11/probe-adapter-counts-gpt.cjs
const { buildSync } = require('esbuild');

const entrySource = `
export { SCHOOL_ADAPTER_PACKAGES as adapterPackages } from './src/core/adapter-packages.ts';
`;

// 只在内存中打包并执行，不生成临时 bundle，避免把探针运行本身变成未跟踪文件。
const bundledSource = buildSync({
  stdin: {
    contents: entrySource,
    resolveDir: process.cwd(),
    sourcefile: 'probe-adapter-counts-gpt.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  external: ['esbuild', 'jsdom', 'playwright'],
}).outputFiles[0].text;

const moduleShim = { exports: {} };
new Function('module', 'exports', 'require', '__dirname', '__filename', bundledSource)(
  moduleShim,
  moduleShim.exports,
  require,
  process.cwd(),
  'probe-adapter-counts-gpt.bundle.cjs',
);

const adapterPackages = moduleShim.exports.adapterPackages;
if (!Array.isArray(adapterPackages)) {
  throw new Error('无法从真实源码取得 SCHOOL_ADAPTER_PACKAGES');
}

const isWildcardPackage = (adapterPackage) => adapterPackage.match.hosts.includes('*');
const hasFormPage = (adapterPackage) => adapterPackage.pages.some((page) => page.role === 'form');
const isConcreteSchoolPackage = (adapterPackage) =>
  !isWildcardPackage(adapterPackage) && !/平台|系统|通用/.test(adapterPackage.schoolName || '');

const allConcretePackages = adapterPackages.filter((adapterPackage) => !isWildcardPackage(adapterPackage));
const fillablePackages = adapterPackages.filter(hasFormPage);
const fillableConcretePackages = fillablePackages.filter((adapterPackage) => !isWildcardPackage(adapterPackage));
const crawlOnlyPackages = adapterPackages.filter((adapterPackage) => !hasFormPage(adapterPackage));

const uniqueValues = (values) => [...new Set(values)];
const concreteHosts = uniqueValues(allConcretePackages.flatMap((adapterPackage) => adapterPackage.match.hosts));
const fillableConcreteHosts = uniqueValues(fillableConcretePackages.flatMap((adapterPackage) => adapterPackage.match.hosts));
const concreteSchoolNames = uniqueValues(adapterPackages.filter(isConcreteSchoolPackage).map((adapterPackage) => adapterPackage.schoolName));
const fillableSchoolNames = uniqueValues(fillablePackages.filter(isConcreteSchoolPackage).map((adapterPackage) => adapterPackage.schoolName));

const result = {
  inventoryScope: {
    allPackages: adapterPackages.length,
    packagesWithForm: fillablePackages.length,
    wildcardPackages: adapterPackages.filter(isWildcardPackage).length,
    concreteHostsIncludingCrawlOnly: concreteHosts.length,
    nonPlatformSchoolNamesIncludingCrawlOnly: concreteSchoolNames.length,
  },
  formFillScope: {
    concreteHosts: fillableConcreteHosts.length,
    nonPlatformSchoolNames: fillableSchoolNames.length,
  },
  excludedFromFormFillScope: crawlOnlyPackages.map((adapterPackage) => ({
    id: adapterPackage.id,
    schoolName: adapterPackage.schoolName,
    hosts: adapterPackage.match.hosts,
    roles: uniqueValues(adapterPackage.pages.map((page) => page.role)),
  })),
};

console.log(JSON.stringify(result, null, 2));

if (
  result.inventoryScope.allPackages !== 73 ||
  result.inventoryScope.packagesWithForm !== 72 ||
  result.inventoryScope.concreteHostsIncludingCrawlOnly !== 70 ||
  result.inventoryScope.nonPlatformSchoolNamesIncludingCrawlOnly !== 65 ||
  result.formFillScope.concreteHosts !== 69 ||
  result.formFillScope.nonPlatformSchoolNames !== 64
) {
  throw new Error('适配包计数已漂移，请重新审定冻结口径');
}
