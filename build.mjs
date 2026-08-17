import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

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

function copyStatic() {
  rmSync(outdir, { recursive: true, force: true });
  mkdirSync(outdir, { recursive: true });
  for (const [from, to] of staticFiles) cpSync(from, `${outdir}/${to}`, { recursive: true });
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
    },
    outdir,
    format: 'iife',
    platform: 'browser',
    target: ['chrome110', 'edge110'],
  },
  {
    ...shared,
    entryPoints: { run: 'test/run.ts' },
    outdir: 'test',
    format: 'cjs',
    platform: 'node',
    external: ['jsdom'],
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
  console.log('build done -> dist/ and test/run.js');
}
