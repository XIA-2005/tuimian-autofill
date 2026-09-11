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
probe('R01-first-option-is-not-empty',()=>{const d=docFor('<label>性别<select name="xb"><option value="男">男</option><option value="女">女</option></select></label>');const p=a.profile.emptyProfile();p.basic.gender='女';const s=d.querySelector('select');s.value='男';a.filler.fillAll(p,d);return {expected:'男',actual:s.value};});
probe('R02-label-fallback-duplicate-id',()=>{const d=docFor('<label for="xm">姓名</label><input id="xm"><input id="xm">');const p=a.profile.emptyProfile();p.basic.name='PROFILE';a.contract.fillAdapterContract(p,d,d.location.href,pkg([{labels:['姓名'],profilePath:'basic.name',driver:'text'}]));return {expected:['',''],actual:[...d.querySelectorAll('input')].map(e=>e.value)};});
probe('R03-blocked-child-generic-bypass',()=>{const d=docFor('<label>手机号<input name="sjh" id="sjh"></label>');const p=a.profile.emptyProfile();p.education.university='MISSING';p.basic.phone='13800000000';const pack=pkg([{nativeId:'missing',profilePath:'education.university',driver:'text'},{nativeId:'sjh',profilePath:'basic.phone',driver:'text',dependsOn:['education.university']}]);const r=a.wholePipeline.runFillPipeline(p,d,d.location.href,{adapterPackage:pack});return {expected:'',actual:d.querySelector('input').value,statuses:r.result.items.map(i=>i.status)};});
probe('R04-write-record-not-run-scoped',()=>{const d=docFor('<label>姓名<input name="xm"></label>');const p=a.profile.emptyProfile();p.basic.name='PROFILE';a.filler.fillAll(p,d);a.session.bumpProfileRevision(d);return {restoreResult:a.filler.conditionalRestore(d,d.querySelector('input')),value:d.querySelector('input').value,expected:'old revision record must not authorize restoration'};});
probe('R05-document-id-restarts',()=>{const d=docFor('<input>');const second=bundleModules();return {module1:a.session.documentIdentity(d),module2:second.session.documentIdentity(d),expected:'new content-script instance must have different wire document identity'};});
probe('R06-rejected-terminal-mutates-state',()=>{const g=new a.aggregation.RunAggregator('CURRENT');g.register(0,'doc');const r={runId:'OLD',frameId:0,docId:'doc',frameSeq:1,stats:{},items:[]};return {accepted:g.terminalize(r),allTerminal:g.allTerminal(),expected:false};});
probe('R07-production-early-terminal-registration',()=>{const source=esbuild.buildSync({entryPoints:['src/background/index.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;let handler;const timers=[],messages=[];vm.runInNewContext(source,{console,crypto:require('node:crypto').webcrypto,setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length},clearTimeout:()=>{},chrome:{runtime:{onInstalled:{addListener:()=>{}},onMessage:{addListener:fn=>handler=fn}},tabs:{sendMessage:async(...args)=>messages.push(args)}}});handler({type:'PANEL_FILL'},{tab:{id:9}},()=>{});const runId=messages[0][1].runId;const send=(type,frameId)=>handler({type,runId,docId:'doc'+frameId,frameSeq:1,stats:{total:1,filled:1,skipped:0,noMatch:0,profileEmpty:0,failed:0,picker:0,pickerResumeCount:0},items:[]},{tab:{id:9},frameId},()=>{});send('FILL_REGISTER',0);send('FILL_TERMINAL',0);send('FILL_REGISTER',1);return {deadlineMs:timers[0].ms,doneBeforeSecondRegistration:messages.some(m=>m[1].type==='FILL_DONE'),participantsInDone:messages.find(m=>m[1].type==='FILL_DONE')?.[1].participants};});
fs.writeFileSync('audit-v5-probes.json',JSON.stringify(findings,null,2));console.log(JSON.stringify(findings,null,2));