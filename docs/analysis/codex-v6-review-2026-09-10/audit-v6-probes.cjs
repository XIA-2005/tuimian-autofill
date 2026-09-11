const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const vm = require('node:vm');
/** 功能：内存构建当前生产模块，不使用重新实现的业务替身。 */
function bundleModules() {
 const contents = [
 "export * as filler from './src/core/filler';",
 "export * as profile from './src/core/profile';",
 "export * as contract from './src/core/control-drivers';",
 "export * as packages from './src/core/adapter-packages';",
 "export * as merge from './src/core/fill-merge';",
 "export * as compiler from './src/core/task-compiler';",
 "export * as executor from './src/core/task-executor';",
 "export * as session from './src/core/fill-session';",
 "export * as task from './src/core/fill-task';",
 "export * as wholePipeline from './src/core/fill-pipeline';",
"export * as aggregation from './src/background/aggregation';",
"export * as save from './src/core/save-guard';",
"export * as telemetry from './src/core/fill-telemetry';",
"export * as observer from './test/regression/observer';"
 ].join('\n');
 const out=esbuild.buildSync({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false,external:['jsdom']}).outputFiles[0].text;
 const m={exports:{}}; new Function('module','exports','require',out)(m,m.exports,require); return m.exports;
}
const a=bundleModules(), findings=[];
/** 功能：为每个合成文档安装同 realm DOM 类型及可见性。 */
function docFor(html, url='https://audit.invalid/form') {
 const d=new JSDOM(html,{url,pretendToBeVisual:true}); const w=d.window;
 for(const k of ['window','document','Element','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','HTMLTableElement','HTMLTableRowElement','HTMLButtonElement','Event','MouseEvent','KeyboardEvent','Node','DOMParser','MutationObserver','sessionStorage','location']) globalThis[k]=w[k];
 globalThis.getComputedStyle=w.getComputedStyle.bind(w);
 w.Element.prototype.getBoundingClientRect=()=>({x:0,y:0,width:200,height:24,top:0,left:0,right:200,bottom:24,toJSON:()=>({})});
 return w.document;
}
/** 功能：生成仅用于审查的最小页面合同。 */
function pkg(fields) {return {...a.packages.SCHOOL_ADAPTER_PACKAGES[0],id:'audit',match:{hosts:['audit.invalid']},pages:[{id:'audit',name:'audit',pathPatterns:['*'],role:'form',fields}]};}
/** 功能：按当前 content/index.ts 生产顺序调用契约、通用及合并。 */
function pipeline(p,d,pack) {const c=a.contract.fillAdapterContract(p,d,d.location.href,pack);const claims=a.merge.buildClaimedTargets(c);return a.merge.mergeContractFillResult(a.filler.fillAll(p,d,undefined,{excludeEl:el=>claims.has(el)}),c);}
/** 功能：隔离个别探针异常并生成可审查的结构化证据。 */
function probe(id, fn) {try {findings.push({id,...fn()});}catch(e){findings.push({id,probeError:e.message});}}
const table=inner=>'<table id="A"><tr><th>时间</th><th>发表刊物或出版社</th><th>标题</th><th>作者排名</th></tr><tr><td><input></td><td><input></td><td>'+inner+'</td><td><input></td></tr></table>';
probe('C01-other-table-same-kind',()=>{const d=docFor(table('<input value="SYNTHETIC">'));const before=a.save.snapshotTableEvidence(d,'route');d.querySelector('table').id='B';d.querySelector('input[value]').value='';return {expected:null,actual:a.save.detectFakeSave(before,d,'route')};});
probe('C02-placeholder-empty-row',()=>{const d=docFor(table('<select><option value="">请选择</option></select>'));return {expectedFilled:0,actualFilled:a.save.snapshotTableEvidence(d)[0]?.filled};});
probe('C03-input-and-edit-button',()=>{const d=docFor(table('<input value="SYNTHETIC"><button>编辑</button>'));return {expectedFilled:1,actualFilled:a.save.snapshotTableEvidence(d)[0]?.filled};});
probe('C05-registration-after-completion',()=>{const source=esbuild.buildSync({entryPoints:['src/background/index.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;let handler;const timers=[],messages=[];vm.runInNewContext(source,{console,crypto:require('node:crypto').webcrypto,setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length},clearTimeout:()=>{},chrome:{runtime:{onInstalled:{addListener:()=>{}},onMessage:{addListener:fn=>handler=fn}},tabs:{sendMessage:async(...args)=>messages.push(args)}}});handler({type:'PANEL_FILL'},{tab:{id:7}},()=>{});const runId=messages[0][1].runId;const send=(type,frameId)=>handler({type,runId,docId:'doc'+frameId,frameSeq:1,terminalKind:'done',stats:{total:1,filled:1,skipped:0,noMatch:0,profileEmpty:0,failed:0,picker:0,pickerResumeCount:0},items:[]},{tab:{id:7},frameId},()=>{});send('FILL_REGISTER',0);send('FILL_TERMINAL',0);timers.find(t=>t.ms===700).fn();const before=messages.length;send('FILL_REGISTER',1);return {expected:'late frame becomes observable',newMessages:messages.length-before,lateCount:messages.find(m=>m[1].type==='FILL_DONE')[1].lateRegistrations};});
probe('C06-local-telemetry-content',()=>{const s=a.telemetry.reduceFillTelemetry(a.telemetry.createFillTelemetryState(),{stage:'failed',level:'error',action:'校验失败',field:'basic.name',reason:'姓名 SYNTHETIC_PRIVATE_TEXT 校验错误'});return {expectedMarkerAbsent:true,actualMarkerPresent:JSON.stringify(s).includes('SYNTHETIC_PRIVATE_TEXT')};});
(async()=>{const d=docFor('<input id="parent"><input id="child">');const p=a.profile.emptyProfile();p.basic.name='SYNTHETIC';p.basic.phone='13800000000';const adapter=pkg([{nativeId:'parent',profilePath:'basic.name',driver:'text',dependencyWait:{settleMs:60,timeoutMs:1000}},{nativeId:'child',profilePath:'basic.phone',driver:'text',dependsOn:['basic.name'],dependencyWait:{settleMs:60,timeoutMs:1000}}]);let activeA=true;const runA=a.session.captureRunSnapshot(d,d.location.href,'A');const runB=a.session.captureRunSnapshot(d,d.location.href,'B');const first=a.wholePipeline.runFillPipelineAsync(p,d,d.location.href,{adapterPackage:adapter,run:runA,stillActive:()=>activeA});await new Promise(r=>setTimeout(r,10));const second=a.wholePipeline.runFillPipelineAsync(p,d,d.location.href,{adapterPackage:adapter,run:runB,stillActive:()=>true});activeA=false;await Promise.all([first,second]);findings.push({id:'C04-overlapping-write-scope',expectedRun:'B',parentRun:a.filler.getWriteRecord(d,d.querySelector('#parent'))?.runId??null,childRun:a.filler.getWriteRecord(d,d.querySelector('#child'))?.runId??null});fs.writeFileSync('audit-v6-probes.json',JSON.stringify(findings,null,2));console.log(JSON.stringify(findings,null,2));})().catch(e=>{console.error(e);process.exitCode=1});