import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
const version = manifest.version;
const outDir = 'release';
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const zip = `${outDir}/tuimian-autofill-v${version}.zip`;

// 用 PowerShell Compress-Archive 打包整个 dist 文件夹（zip 内保留 dist\ 目录层级，解压后直接得到 dist 文件夹）
execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path 'dist' -DestinationPath '${zip}' -Force`], {
  stdio: 'inherit',
});
console.log(`打包完成: ${zip}`);
