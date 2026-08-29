import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
const version = manifest.version;
const outDir = 'release';
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const zip = `${outDir}/tuimian-autofill-v${version}.zip`;

/**
 * 功能：打包整个 dist 文件夹，zip 内保留 dist\ 目录层级。
 *
 * 原理：优先沿用 PowerShell Compress-Archive；部分 Windows 环境的
 * Microsoft.PowerShell.Archive 模块会损坏或无法自动加载，此时回退到系统自带的
 * bsdtar。`-a` 会根据 .zip 扩展名选择 ZIP 格式，两条路径生成的目录结构一致。
 */
function createReleaseZip() {
  try {
    execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path 'dist' -DestinationPath '${zip}' -Force`], {
      stdio: 'inherit',
    });
  } catch {
    console.warn('Compress-Archive 不可用，改用 Windows tar.exe 生成 ZIP。');
    execFileSync('tar.exe', ['-a', '-c', '-f', zip, 'dist'], { stdio: 'inherit' });
  }
}

createReleaseZip();
console.log(`打包完成: ${zip}`);
