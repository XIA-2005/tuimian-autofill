// bench CLI:--self-test(默认,机制证明) | --negative-overfill(负向,预期 exit 1)
// 走 src/core/fill-pipeline.ts 真实入口;无 signed oracle 前禁跑真实夹具绿(交接 T2)。
import { runSelfTest, runNegativeOverfill } from './self-test';

const mode = process.argv[2] ?? '--self-test';
if (mode === '--self-test') process.exit(runSelfTest());
if (mode === '--negative-overfill') process.exit(runNegativeOverfill());
console.error('用法: node test/bench/run.mjs [--self-test|--negative-overfill]');
process.exit(64);
