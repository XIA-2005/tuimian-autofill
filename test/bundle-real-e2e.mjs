// 将 test/real-e2e.mts 打包为 test/real-e2e.cjs
// 依赖 esbuild，输出为 CommonJS（兼容 node test/*）
import * as esbuild from 'esbuild';
import { resolve } from 'path';

await esbuild.build({
  entryPoints: ['test/real-e2e.mts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'test/real-e2e.cjs',
  absWorkingDir: process.cwd(),
  nodePaths: [resolve(process.cwd(), 'node_modules')],
  logLevel: 'warning',
  external: ['jsdom'],
});
