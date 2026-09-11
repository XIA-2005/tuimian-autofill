// bench CLI:--self-test(默认,机制证明) | --negative-overfill(负向,预期 exit 1)
//          | --oracle <signed.json> [--negative-overfill](真实已签 oracle 路径)
// 走 src/core/fill-pipeline.ts 真实入口。
import { runSelfTest, runNegativeOverfill } from './self-test';
import { runOracle } from './oracle-run';

const args = process.argv.slice(2);
const mode = args[0] ?? '--self-test';
if (mode === '--self-test') process.exit(runSelfTest());
if (mode === '--negative-overfill') process.exit(runNegativeOverfill());
if (mode === '--oracle') {
  const signedPath = args[1];
  if (!signedPath) {
    console.error('用法: node test/bench/run.mjs --oracle <oracle-F01.signed.json> [--negative-overfill]');
    process.exit(64);
  }
  process.exit(runOracle(signedPath, args.includes('--negative-overfill')));
}
console.error('用法: node test/bench/run.mjs [--self-test|--negative-overfill|--oracle <signed.json> [--negative-overfill]]');
process.exit(64);
