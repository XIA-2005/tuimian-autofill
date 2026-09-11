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
probe('Q01-contract-overwrites-conflict',()=>{
 const d=docFor('<label for="xm">姓名</label><input id="xm" name="xm" value="PAGE_VALUE">'); const p=a.profile.emptyProfile();p.basic.name='PROFILE_VALUE';
 const r=pipeline(p,d,pkg([{nativeId:'xm',profilePath:'basic.name',driver:'text'}]));
 return {expected:'PAGE_VALUE',actual:d.querySelector('#xm').value,targetResults:r.items.filter(i=>i.el===d.querySelector('#xm')).map(i=>i.status),stats:r.stats};
});
probe('Q02-contract-equal-rewrites',()=>{
 const d=docFor('<label for="xm">姓名</label><input id="xm" name="xm" value="SAME">');const p=a.profile.emptyProfile();p.basic.name='SAME';let n=0;d.addEventListener('input',()=>n++);
 pipeline(p,d,pkg([{nativeId:'xm',profilePath:'basic.name',driver:'text'}]));return {expectedInputEvents:0,actualInputEvents:n};
});
probe('Q03-resolver-not-used',()=>{
 const d=docFor('<input id="xm" value=""><input id="xm" value="">');const p=a.profile.emptyProfile();p.basic.name='PROFILE_VALUE';const field={nativeId:'xm',profilePath:'basic.name',driver:'text'};
 const c=a.compiler.collectContractFieldCandidates(field,d);a.contract.fillAdapterContract(p,d,d.location.href,pkg([field]));
 return {compilerAmbiguous:c.ambiguous,actualValues:[...d.querySelectorAll('input')].map(e=>e.value),expected:'both empty'};
});
probe('Q04-native-date-conflict',()=>{
 const d=docFor('<label for="csrq">出生日期</label><input type="date" id="csrq" name="csrq" value="2001-01-01">');const p=a.profile.emptyProfile();p.basic.birthday='2003-02-02'; const r=a.filler.fillAll(p,d);
 return {expected:'2001-01-01',actual:d.querySelector('#csrq').value,status:r.items.find(i=>i.el===d.querySelector('#csrq'))?.status};
});
probe('Q05-radio-conflict',()=>{
 const d=docFor('<div><span>性别</span><label><input type="radio" name="xb" value="男">男</label><label><input type="radio" name="xb" value="女" checked>女</label></div>'); const p=a.profile.emptyProfile();p.basic.gender='男';a.filler.fillAll(p,d);
 return {expected:'女',actual:d.querySelector('input:checked')?.value};
});
probe('Q06-refill-breaks-clear',()=>{
 const d=docFor('<label for="xm">姓名</label><input id="xm" name="xm">');const p=a.profile.emptyProfile();p.basic.name='VALUE';a.filler.fillAll(p,d);const owned=a.filler.isOwnedByFill(d,d.querySelector('#xm'));const second=a.filler.fillAll(p,d);const cleared=a.filler.clearPageFill(d);
 return {ownedAfterFirst:owned,secondStatus:second.items[0]?.status,cleared,actual:d.querySelector('#xm').value,expected:'empty'};
});
probe('Q07-detached-restore',()=>{
 const d=docFor('<input id="x">');const el=d.querySelector('#x');a.filler.captureBeforeValue(d,el);el.value='AFTER';a.filler.markEl(el,'filled');el.remove();const result=a.filler.conditionalRestore(d,el);
 return {isConnected:el.isConnected,result,actual:el.value,expected:'notAttempted and AFTER'};
});
probe('Q08-cross-document-scope',()=>{
 const d1=docFor('<input>');const s=a.session.captureRunSnapshot(d1,d1.location.href,'OLD');const d2=docFor('<input>');
 return {differentDocuments:d1!==d2,oldSnapshotValidInNewDocument:a.session.isRunSnapshotValid(s,d2,d2.location.href),expected:false};
});
probe('Q09-route-key',()=>({sameHashRoutes:a.task.routeKeyFor('https://audit.invalid/app#/basic')===a.task.routeKeyFor('https://audit.invalid/app#/upload'),retainsPathToken:a.task.routeKeyFor('https://audit.invalid/ssxly/FAKE_PRIVATE_TOKEN').includes('FAKE_PRIVATE_TOKEN'),expected:'different logical pages; no persisted token'}));
probe('Q10-unrelated-validation',()=>{
 const d=docFor('<input id="xm"><div id="errors"><span>OTHER_FIELD_REQUIRED</span></div>');
 return {actual:a.executor.attributableValidationError(d,d.querySelector('#xm'),'#errors',[]),expected:null};
});
probe('V01-empty-contract-duplicate-and-unowned',()=>{
 const d=docFor('<label for="xm">姓名</label><input id="xm" name="xm">');const p=a.profile.emptyProfile();p.basic.name='PROFILE';
 const r=pipeline(p,d,pkg([{nativeId:'xm',profilePath:'basic.name',driver:'text'}]));const el=d.querySelector('#xm');
 return {statuses:r.items.filter(i=>i.el===el).map(i=>i.status),total:r.stats.total,owned:a.filler.getOwnedValue(d,el)??null,cleared:a.filler.clearPageFill(d),valueAfterClear:el.value};
});
probe('V02-ambiguous-contract-generic-bypass',()=>{
 const d=docFor('<label>姓名<input id="xm" name="xm"></label><label>姓名<input id="xm" name="xm"></label>');const p=a.profile.emptyProfile();p.basic.name='PROFILE';
 const r=pipeline(p,d,pkg([{nativeId:'xm',profilePath:'basic.name',driver:'text'}]));return {values:[...d.querySelectorAll('input')].map(e=>e.value),statuses:r.items.map(i=>i.status)};
});
probe('V03-picker-select-conflict',()=>{
 const d=docFor('<select id="univ"><option value="OLD" selected>OLD UNIVERSITY</option><option value="NEW">NEW UNIVERSITY</option></select>');const p=a.profile.emptyProfile();p.education.university='NEW UNIVERSITY';const r=a.contract.fillAdapterContract(p,d,d.location.href,pkg([{nativeId:'univ',profilePath:'education.university',driver:'school-picker'}]));return {value:d.querySelector('select').value,statuses:r.map(i=>i.status)};
});
for(const empty of [true,false])probe('V04-dependency-'+(empty?'empty':'conflict'),()=>{
 const d=docFor('<input id="parent" value="OLD"><input id="child">');const p=a.profile.emptyProfile();p.basic.name=empty?'':'NEW';p.basic.phone='13800000000';const r=a.contract.fillAdapterContract(p,d,d.location.href,pkg([{nativeId:'parent',profilePath:'basic.name',driver:'text'},{nativeId:'child',profilePath:'basic.phone',driver:'text',dependsOn:['basic.name']}]));return {parent:d.querySelector('#parent').value,child:d.querySelector('#child').value,results:r.map(i=>({field:i.profilePath,status:i.status,reason:i.reason}))};
});
probe('V05-restore-without-ownership',()=>{
 const d=docFor('<input id="x">');const el=d.querySelector('input');a.filler.captureBeforeValue(d,el);el.value='USER_VALUE';return {result:a.filler.conditionalRestore(d,el),actual:el.value,expected:'USER_VALUE'};
});
probe('V06-old-callback-global-guard',()=>{
 const d=docFor('<input>');let active=a.session.captureRunSnapshot(d,d.location.href,'A');let activeId='A';let writes=0;
 const oldCallback=()=>{if(!!active&&a.session.isRunSnapshotValid(active,d,d.location.href)&&activeId===active.runId)writes++};
 active=a.session.captureRunSnapshot(d,d.location.href,'B');activeId='B';oldCallback();return {writes,expected:0,note:'reproduces exact global guard closure pattern; not full browser proof'};
});
probe('V07-background-partial-terminal',()=>{
 const source=esbuild.buildSync({entryPoints:['src/background/index.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
 let handler;const timers=[],messages=[];vm.runInNewContext(source,{console,crypto:require('node:crypto').webcrypto,setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length},clearTimeout:()=>{},chrome:{runtime:{onInstalled:{addListener:()=>{}},onMessage:{addListener:fn=>handler=fn}},tabs:{sendMessage:async(...args)=>messages.push(args)}}});
 handler({type:'PANEL_FILL'},{tab:{id:7}},()=>{});const runId=messages[0][1].runId;const stats={total:1,filled:1,skipped:0,noMatch:0,profileEmpty:0,failed:0,picker:0,pickerResumeCount:0};
 handler({type:'FILL_RESULT',runId,frameSeq:1,stats,items:[{label:'x',field:'basic.name',status:'filled',valuePreview:'SYNTHETIC_PRIVATE_VALUE'}]},{tab:{id:7},frameId:0},()=>{});timers[0].fn();
 handler({type:'FILL_RESULT',runId,frameSeq:2,stats:{...stats,filled:0,failed:1},items:[]},{tab:{id:7},frameId:0},()=>{});
 const done=messages.find(m=>m[1].type==='FILL_DONE')[1];return {timerMs:timers[0].ms,timedOut:done.timedOut,filled:done.stats.filled,failed:done.stats.failed,privateValueForwarded:!!done.items[0]?.valuePreview};
});
fs.writeFileSync('audit-probes-v4.json',JSON.stringify(findings,null,2));console.log(JSON.stringify(findings,null,2));