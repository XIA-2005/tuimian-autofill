// 静态快照脱敏脚本(PLAN v3 · P01)
// 用法:node test/regression/scripts/sanitize-static.mjs <源HTML> <输出目录>
// 只做:复制→(1)文件头插入哨兵注释;(2)替换身份证/手机号/邮箱为合成哨兵;(3)剥离 http(s)// 远程引用属性。
// 绝不修改源文件;输出附带 page.meta.json(来源、时间、替换计数),供回归扫描与证据追溯。
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const [srcArg, outDirArg] = process.argv.slice(2);
if (!srcArg || !outDirArg) {
  console.error('用法: node sanitize-static.mjs <源HTML> <输出目录>');
  process.exit(2);
}
const srcPath = resolve(srcArg);
const outDir = resolve(outDirArg);
const outHtml = join(outDir, 'page.html');
const outMeta = join(outDir, 'page.meta.json');
mkdirSync(outDir, { recursive: true });

const raw = readFileSync(srcPath, 'utf8');
const sourceSha256 = createHash('sha256').update(raw, 'utf8').digest('hex');

let replaced = { idcards: 0, phones: 0, emails: 0 };
let text = raw;
// 18 位身份证(GB11643 形状):替换为哨兵。
text = text.replace(/\b\d{17}[\dXx]\b/g, () => {
  replaced.idcards += 1;
  return 'SENTINEL_IDCARD';
});
// 11 位大陆手机号。
text = text.replace(/\b1[3-9]\d{9}\b/g, () => {
  replaced.phones += 1;
  return 'SENTINEL_PHONE';
});
// 邮箱。
text = text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, () => {
  replaced.emails += 1;
  return 'SENTINEL_EMAIL';
});
// 剥离指向远程的 src/href/action(含协议相对 //),只清属性,保留 DOM 结构。
let remoteStripped = 0;
text = text.replace(/\s(?:src|href|action)=["'](?:https?:)?\/\/[^"']*["']/gi, () => {
  remoteStripped += 1;
  return '';
});
// 文件头哨兵:来源、脱敏说明、禁止当 live-evidence。
const sentinel =
  `<!-- SANITIZED-BY tuimian-regression: source=${basename(srcPath)} sha256=${sourceSha256.slice(0, 16)}; ` +
  `replaced=${JSON.stringify(replaced)} remoteStripped=${remoteStripped}; NOT live evidence. -->\n`;
text = sentinel + text;

writeFileSync(outHtml, text, 'utf8');
const meta = {
  sourceFile: basename(srcPath),
  sourceRelativePath: srcArg,
  sourceSha256,
  sanitizedAt: new Date().toISOString(),
  replaced,
  remoteStripped,
  note: '静态结构快照:禁止用于真实验收证据;原文件未修改。',
};
writeFileSync(outMeta, JSON.stringify(meta, null, 2), 'utf8');
console.log(`[sanitize] ${basename(srcPath)} -> ${outHtml} (${dirname(outMeta)})`);
console.log('[sanitize]', JSON.stringify(meta));
