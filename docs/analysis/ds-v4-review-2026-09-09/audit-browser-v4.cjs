const { chromium }=require('playwright');
const {createServer}=require('node:http');
const {existsSync,mkdtempSync,writeFileSync}=require('node:fs');
const {join,resolve}=require('node:path');
const {tmpdir}=require('node:os');
/** 功能：仅以本地行为夹具审查真实打包扩展，不访问高校网络。 */
async function main(){
 const generic='<html><body><label>姓名<input name="xm" id="xm"></label><label>手机<input name="sjh"></label><label>邮箱<input name="email"></label><script>document.querySelector("#xm").addEventListener("input",function(){setTimeout(()=>{this.value=""},200)});</script></body></html>';
 const contract='<html><body><label>姓名<input id="xm" name="xm" value=""></label><label>手机<input id="sjh" name="sjh"></label><label>邮箱<input id="email" name="email"></label></body></html>';
 const contractReset=contract.replace('</body>', '<script>document.querySelector('+JSON.stringify('#xm')+').addEventListener('+JSON.stringify('input')+',function(){setTimeout(()=>{this.value='+JSON.stringify('')+'},200)});</script></body>');
 const srv=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(generic)});
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+srv.address().port;
 const candidates=['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
 const ex=candidates.find(existsSync), dir=mkdtempSync(join(tmpdir(),'tuimian-audit-browser-'));let context;const evidence={};let external=0;
 try{
  context=await chromium.launchPersistentContext(dir,{headless:true,...(ex?{executablePath:ex}:{}),args:['--disable-extensions-except='+resolve('dist'),'--load-extension='+resolve('dist')]});
  await context.route('**/*',r=>{const u=r.request().url();if(u==='https://yjszs.lzu.edu.cn/lzuyjsytms/info')return r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:contractReset});if(u.startsWith(base+'/')||u.startsWith('chrome-extension://'))return r.continue();external++;return r.abort()});
  let worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const ext=new URL(worker.url()).host;
  const opt=await context.newPage();await opt.goto('chrome-extension://'+ext+'/options.html');
  await opt.evaluate(()=>chrome.storage.local.set({profile:{version:2,basic:{name:'PROFILE_VALUE',phone:'13800000000',email:'audit@example.invalid'},education:{}}}));await opt.close();
  const page=await context.newPage();await page.goto('https://yjszs.lzu.edu.cn/lzuyjsytms/info');await page.waitForSelector('#tui-panel');await page.click('#tui-panel [data-act="fill"]');
  await page.waitForTimeout(1800);
  const capture=()=>page.evaluate(()=>({value:document.querySelector('#xm').value,telemetry:JSON.parse(sessionStorage.getItem('tui-fill-telemetry-v1')||'null'),marked:document.querySelector('#xm').getAttribute('data-tui')}));
  evidence.contractAt1800ms=await capture();await page.waitForTimeout(15000);evidence.contractAt16800ms=await capture();
  await page.close();
  const gp=await context.newPage();await gp.goto(base+'/basic');await gp.waitForSelector('#tui-panel');await gp.click('#tui-panel [data-act="fill"]');
  await gp.waitForTimeout(1800);
  evidence.after1800ms=await gp.evaluate(()=>({value:document.querySelector('#xm').value,telemetry:JSON.parse(sessionStorage.getItem('tui-fill-telemetry-v1')||'null')?.counts}));
  await gp.waitForTimeout(15000);
  evidence.after16800ms=await gp.evaluate(()=>({value:document.querySelector('#xm').value,telemetry:JSON.parse(sessionStorage.getItem('tui-fill-telemetry-v1')||'null')?.counts,marked:document.querySelector('#xm').getAttribute('data-tui')}));
 }finally{await context?.close();await new Promise(r=>srv.close(r));}
 evidence.externalBlocked=external;writeFileSync('audit-browser-v4.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
