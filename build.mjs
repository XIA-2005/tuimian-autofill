import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const watch = process.argv.includes('--watch');
const outdir = 'dist';

const staticFiles = [
  ['src/manifest.json', 'manifest.json'],
  ['src/content.css', 'content.css'],
  ['src/popup/popup.html', 'popup.html'],
  ['src/popup/popup.css', 'popup.css'],
  ['src/options/options.html', 'options.html'],
  ['src/options/options.css', 'options.css'],
  ['src/icons', 'icons'],
];

/** 功能：从 node_modules/tesseract.js 拷贝 tesseract.min.js 到 dist/vendor/（content script 懒加载） */
function copyTesseractVendor() {
  const src = join('node_modules', 'tesseract.js', 'dist', 'tesseract.min.js');
  const dst = join(outdir, 'vendor', 'tesseract.min.js');
  if (!existsSync(src)) {
    console.warn(`[build] tesseract.min.js not found at ${src}；跳过 vendor 拷贝。Route A 需要手动把 tesseract.min.js 放到 dist/vendor/`);
    return;
  }
  cpSync(src, dst);
  console.log(`[build] copied ${src} -> ${dst}`);
}

function copyStatic() {
  rmSync(outdir, { recursive: true, force: true });
  mkdirSync(outdir, { recursive: true });
  for (const [from, to] of staticFiles) cpSync(from, `${outdir}/${to}`, { recursive: true });
  copyTesseractVendor();
}

const shared = {
  bundle: true,
  sourcemap: watch ? 'inline' : false,
  charset: 'utf8',
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions[]} */
const builds = [
  {
    ...shared,
    entryPoints: {
      content: 'src/content/index.ts',
      background: 'src/background/index.ts',
      'popup/popup': 'src/popup/popup.ts',
      'options/options': 'src/options/options.ts',
      // 主世界桥独立构建为 IIFE 注入文件；esbuild 会移除仅有的自执行侧效，保留显式 IIFE 包装
      'world/main-world': 'src/world/main-world.ts',
      // tesseract.js CDN 懒加载器：独立 content script，注入到页面上下文而非 content script 隔离世界
      'tesseract-loader': 'src/content/tesseract-loader.ts',
    },
    outdir,
    format: 'iife',
    platform: 'browser',
    target: ['chrome110', 'edge110'],
  },
  {
    ...shared,
    entryPoints: {
      run: 'test/run.ts',
      'regression/run': 'test/regression/run.ts',
      'regression/run-e2e': 'test/regression/run-e2e.ts',
      'check-adapters': 'test/check-adapters.ts',
    },
    outdir: 'test',
    format: 'cjs',
    platform: 'node',
    external: ['jsdom', 'playwright', 'esbuild'],
    target: ['node20'],
  },
];

copyStatic();

if (watch) {
  const ctxs = await Promise.all(builds.map((b) => esbuild.context(b)));
  await Promise.all(ctxs.map((c) => c.watch()));
  console.log('watching... (dist + test)');
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
  console.log('build done -> dist/ 与 test/ 下各 node 入口(run.js / regression/*.js)');
}
