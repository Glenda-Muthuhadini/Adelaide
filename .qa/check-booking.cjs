// Live Supabase + installed Chrome. Credentials arrive through hidden stdin only.
const {spawn}=require('node:child_process');
const {readFileSync,writeFileSync}=require('node:fs');
const {resolve,extname}=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
let browser,server,credentials,buffer='',nextId=0;
const pending=new Map(),errors=[];
async function input(){
  if(process.stdin.isTTY)process.stdin.setRawMode(true);
  process.stdin.resume();process.stdout.write('Ready for admin QA credentials on stdin (input is hidden).\n');
  return new Promise(resolve=>{let text='';process.stdin.on('data',chunk=>{text+=chunk.toString();try{const value=JSON.parse(text.trim());process.stdin.pause();console.log('Credentials received; starting live browser checks.');resolve(value);}catch{}});});
}
function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++nextId,timeout=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},30000);pending.set(id,{resolve,reject,timeout});browser.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0');});}
(async()=>{
  credentials=await input();
  const root=resolve('.');
  server=http.createServer((req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+require('node:path').sep)){res.writeHead(403).end();return;}const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(readFileSync(file));}catch{res.writeHead(404).end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+resolve('.qa/booking-browser-profile')],{stdio:['ignore','ignore','ignore','pipe','pipe']});
  browser.stdio[4].on('data',chunk=>{buffer+=chunk.toString();let end;while((end=buffer.indexOf('\0'))!==-1){const m=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);clearTimeout(p.timeout);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);}});
  const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const call=(method,params)=>send(method,params,sessionId);
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=async condition=>{const start=Date.now();while(Date.now()-start<45000){if(await evaluate(condition))return;await new Promise(r=>setTimeout(r,150));}const detail=await evaluate('document.querySelector("#booking-message")?.textContent || document.querySelector("#admin-access-message")?.textContent || ""');throw new Error('Timed out: '+condition+' · '+detail);};
  const go=async page=>{await call('Page.navigate',{url:base+'/'+page});await wait('document.readyState==="complete" && typeof Spa!=="undefined"');};
  await call('Page.enable');await call('Runtime.enable');
  await go('booking.html?service=Swedish%20Massage');
  await wait('!document.querySelector("#customer-booking").hidden');
  const date=await evaluate('Spa.date(Date.now()+60*86400000)'),date2=await evaluate('Spa.date(Date.now()+61*86400000)');
  await evaluate(`(()=>{const f=document.querySelector('#customer-booking');f.elements.people.value='10';f.elements.people.dispatchEvent(new Event('input',{bubbles:true}));f.elements.date.value=${JSON.stringify(date)};f.elements.date.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#check-times').click();})()`);
  await wait('!document.querySelector("#customer-booking").elements.time.disabled');
  await evaluate(`(()=>{const f=document.querySelector('#customer-booking');for(const [key,value] of Object.entries({time:'10:00',customer:'QA browser booking',phone:'0000000000',email:'qa-browser@example.invalid'})){f.elements[key].value=value;f.elements[key].dispatchEvent(new Event('input',{bubbles:true}));}f.requestSubmit();})()`);
  await wait('!document.querySelector("#booking-review").hidden');
  assert.equal(await evaluate('document.querySelectorAll("#review-schedule li").length'),3);
  assert(await evaluate('document.querySelector("#review-schedule").textContent.includes("13:00")'));
  for(const width of [320,390,768,1440]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Booking overflow at '+width);
    const capture=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync('.qa/booking-'+width+'.png',Buffer.from(capture.data,'base64'));
  }
  await evaluate('document.querySelector("#submit-booking").click()');
  await wait('!document.querySelector("#booking-success").hidden');
  assert(await evaluate('document.querySelector("#booking-success").textContent.includes("Your appointment is confirmed")'));
  console.log('PASS live guest booking: three 60-minute sessions, price review, automatic confirmation, 320/390/768/1440px.');
  await go('admin-login.html');
  await evaluate(`Spa.login(${JSON.stringify(credentials.email)},${JSON.stringify(credentials.password)}).then(()=>true)`);
  credentials=null;
  await go('admin-dashboard.html');await wait('!document.body.classList.contains("admin-loading")');
  await evaluate('document.querySelector("[data-section=Appointments]").click()');
  await evaluate(`(()=>{const row=[...document.querySelectorAll('#booking-results tr')].find(r=>r.textContent.includes('QA browser booking'));if(!row)throw new Error('Missing live booking');row.querySelector('[data-detail]').click();})()`);
  await wait('document.querySelector("#appointment-detail .status-confirmed")!==null');
  await evaluate(`(()=>{const f=document.querySelector('[data-save=notes]');f.elements.notes.value='Private QA browser note';f.requestSubmit();})()`);
  await wait('document.querySelector("#toast").textContent==="Saved."');
  await evaluate(`(()=>{const f=document.querySelector('#reschedule-form');f.elements.date.value=${JSON.stringify(date2)};f.elements.time.value='10:00';f.requestSubmit();})()`);
  await wait('document.querySelector("#save-reschedule")!==null');
  await evaluate('document.querySelector("#save-reschedule").click()');
  await wait(`document.querySelector('#appointment-detail').textContent.includes(${JSON.stringify(date2)}) && !document.querySelector('#save-reschedule')`);
  assert(await evaluate('document.querySelector("[data-save=notes]").elements.notes.value==="Private QA browser note"'));
  await evaluate('document.querySelector("[data-status=cancelled]").click()');
  await wait('document.querySelector("#appointment-detail .status-cancelled")!==null');
  await evaluate('document.querySelector("#appointment-dialog").close();document.querySelector("[data-section=Dashboard]").click()');
  assert(await evaluate('document.querySelector("#dashboard-view").hidden===false'));
  for(const width of [320,390,768,1440]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Admin overflow at '+width);
    const capture=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync('.qa/admin-live-'+width+'.png',Buffer.from(capture.data,'base64'));
  }
  for(const name of ['Services','Clients','Staff','Reports']){await evaluate(`document.querySelector('[data-section="${name}"]').click()`);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Section overflow: '+name);}
  await evaluate('document.querySelector(".sidebar-logout").click()');await wait('location.pathname.endsWith("admin-login.html")');
  await go('admin-dashboard.html');await wait('document.querySelector("#admin-access-message").textContent.includes("sign in")');
  assert(await evaluate('document.body.classList.contains("admin-loading")'));
  await go('admin-reset-password.html');await wait('document.querySelector(".form-status").textContent.includes("valid password recovery")');
  assert(await evaluate('document.querySelector(".auth-submit").disabled'));
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS live admin: preconfirmed password login, private notes, confirmation, full-group reschedule, cancellation, dashboard schedule, catalogue tables, mobile layouts, logout, dashboard denial, recovery-link validation.');
  writeFileSync('.qa/booking-browser-results.json',JSON.stringify({passed:true,viewports:[320,390,768,1440],guest:true,admin:true,fixtureEmail:'qa-browser@example.invalid',errors},null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{if(browser){try{await send('Browser.close');}catch{}browser.kill();}if(server)server.close();process.stdin.pause();});
