// bench 引导:esbuild 内存自打包 main.ts → tmpdir 产物 → import 执行。
// 不动 build.mjs/package.json(二者非本卡可净增文件),node test/bench/run.mjs 即可运行。
// external esbuild/jsdom/playwright:L-000 教训(esbuild 内联 buildSync 死锁)+ jsdom/playwright 保持外部 require。
import { buildSync } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const benchDir = fileURLToPath(new URL('./', import.meta.url));

// P5/B1 源完整性守卫:bench 判等/读取必须独立——只拦真实 import/调用形态,
// 不拦注释提及;registerWriteOwnership 仅禁赋值重写(monkey-patch 生产登记),不禁授权内的注入调用。
const FORBIDDEN = /import\s*\{[^}]*\b(?:isSemanticEqual|readNativeControlValue)\b[^}]*\}\s*from|(?<![\w.$])(?:isSemanticEqual|readNativeControlValue)\s*\(|registerWriteOwnership\s*=(?!=)/;
for (const file of ['classify.ts', 'report.ts', 'self-test.ts', 'main.ts']) {
  const source = readFileSync(join(benchDir, file), 'utf8');
  if (FORBIDDEN.test(source)) {
    console.error(`具名断言[BENCH-P5-GUARD]: ${file} 引入了生产判等/读取实现标识,P5 独立性破坏`);
    process.exit(3);
  }
}

const built = buildSync({
  entryPoints: [join(benchDir, 'main.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  external: ['esbuild', 'jsdom', 'playwright'],
  logLevel: 'silent',
});
const code = built.outputFiles[0].text;
// 产物按内容哈希落 node_modules/.cache:整体被 gitignore(仓库零漂移),且 CJS require 从此处
// 向上解析自然命中仓库 node_modules(external jsdom),tmpdir 会 MODULE_NOT_FOUND。
const repoRoot = join(benchDir, '..', '..');
const cacheDir = join(repoRoot, 'node_modules', '.cache', 'tuimian-bench');
const artifact = join(cacheDir, `main-${createHash('sha256').update(code).digest('hex').slice(0, 16)}.cjs`);
mkdirSync(cacheDir, { recursive: true });
writeFileSync(artifact, code);
await import(pathToFileURL(artifact).href);
