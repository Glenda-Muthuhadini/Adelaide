// Real PDF downloads from mock report data; no customer records or external services.
const {spawn}=require('node:child_process');
const {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync}=require('node:fs');
const {resolve,join}=require('node:path');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
const downloadPath=resolve('.qa/report-downloads-'+Date.now());mkdirSync(downloadPath,{recursive:true});
const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+resolve('.qa/reports-browser-profile')],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let buffer='',nextId=0;const pending=new Map(),errors=[],downloads=[];
browser.stdio[4].on('data',chunk=>{buffer+=chunk.toString();let end;while((end=buffer.indexOf('\0'))!==-1){const m=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);clearTimeout(p.timeout);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);if(m.method==='Browser.downloadWillBegin')downloads.push({...m.params,state:'inProgress'});if(m.method==='Browser.downloadProgress'){const row=downloads.find(d=>d.guid===m.params.guid);if(row)Object.assign(row,m.params);}}});
function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++nextId,timeout=setTimeout(()=>reject(new Error('CDP timeout: '+method)),20000);pending.set(id,{resolve,reject,timeout});browser.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0');});}
function validatePdf(file){
  const bytes=readFileSync(file),text=bytes.toString('latin1');assert(text.startsWith('%PDF-1.7'));assert(text.trimEnd().endsWith('%%EOF'));
  const xref=Number(text.match(/startxref\n(\d+)/)[1]);assert.equal(bytes.subarray(xref,xref+4).toString(),'xref');
  const xrefLines=text.slice(xref).split('\n'),objectCount=Number(xrefLines[1].split(' ')[1]);
  for(let id=1;id<objectCount;id++){const offset=Number(xrefLines[id+2].slice(0,10));assert(bytes.subarray(offset,offset+String(id).length+6).toString().startsWith(id+' 0 obj'),'Object offset '+id);}
  const pages=(text.match(/\/Type \/Page\b/g)||[]).length;assert(pages>0);assert.equal((text.match(/\/Subtype \/Image/g)||[]).length,pages);
  const actualText=[...text.matchAll(/\/ActualText <([0-9a-f]+)>/gi)].map(m=>Buffer.from(m[1].slice(4),'hex').swap16().toString('utf16le')).join('\n');assert(actualText.includes('ADELAIDE WELLNESS & SPA'));return {pages,actualText,bytes:bytes.length};
}
(async()=>{
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath,eventsEnabled:true});
  const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const call=(m,p)=>send(m,p,sessionId);
  const run=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=async condition=>{for(let i=0;i<250;i++){if(await run(condition))return;await new Promise(r=>setTimeout(r,40));}throw new Error('Timed out: '+condition);};
  const waitDownload=async count=>{for(let i=0;i<250;i++){if(downloads.length>=count&&downloads[count-1].state==='completed')return downloads[count-1];await new Promise(r=>setTimeout(r,40));}throw new Error('Download did not finish: '+count);};
  const fixture=JSON.parse(readFileSync('.qa/catalogue-browser-fixture.json','utf8'));
  await call('Page.enable');await call('Runtime.enable');
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.qaData=${JSON.stringify(fixture)};window.qaRefreshCount=0;window.qaDeny=false;
    const firstStart=new Date(Date.now()+3*86400000);firstStart.setUTCHours(7,0,0,0);
    const sessions=Array.from({length:20},(_,i)=>({starts_at:new Date(firstStart.getTime()+i*1800000).toISOString(),ends_at:new Date(firstStart.getTime()+(i+1)*1800000).toISOString(),reserved_until:new Date(firstStart.getTime()+(i+1)*1800000).toISOString(),people:4}));
    const base={phone:'+27123456789',email:'long-client-address-for-report-testing@long-example-domain.invalid',customer_name:'Ṱshilidziḓa Mokoena',source:'online',status:'confirmed'};
    const bookings=[{...base,id:'qa-group',reference:'AD-QA-LONG-GROUP',service_name:'Sports Massage',duration:30,people:80,total_cents:2240000,sessions},{...base,id:'qa-repeat',reference:'AD-QA-RETURN',service_name:'Signature Facial',duration:60,people:1,total_cents:40000,status:'cancelled',sessions:[sessions[0]]},{...base,id:'qa-couple',reference:'AD-QA-COUPLE',customer_name:'Naledi & Partner',email:'qa-couple@example.invalid',service_name:'Couples Retreat',duration:60,people:2,total_cents:50000,sessions:[{...sessions[0],people:2}]}];
    Object.assign(window.qaData,{viewer_role:'admin',bookings,blocks:[],settings:{pending_minutes:60,preparation_minutes:0},hours:Array.from({length:7},(_,weekday)=>({weekday,opens:540,closes:1140,closed:false}))});
    let spa;Object.defineProperty(window,'Spa',{configurable:true,get(){return spa;},set(api){api.requireAdmin=async()=>({email:'qa-staff@example.invalid'});api.rpc=async name=>{if(name!=='spa_admin_data')throw new Error('Unexpected RPC '+name);window.qaRefreshCount++;if(window.qaDeny)throw new Error('Staff access required.');return structuredClone(window.qaData);};spa=api;}});
  `});
  await call('Page.navigate',{url:pathToFileURL(resolve('admin-dashboard.html')).href});
  await wait('document.readyState==="complete"&&!document.body.classList.contains("admin-loading")&&!document.querySelector("#page-loader")');
  await run('document.querySelector("[data-section=Reports]").click()');
  const expected={appointments:3,clients:2,services:16,addons:7,promotions:4,staff:1};
  assert.equal(await run('document.querySelectorAll(".report-card").length'),6);
  for(const [key,count] of Object.entries(expected)){await run(`document.querySelector('[data-report-view="${key}"]').click()`);assert.equal(await run('document.querySelectorAll(".report-preview tbody tr").length'),count,key+' preview rows');}
  await run('document.querySelector("[data-report-view=appointments]").click()');
  for(const width of [320,390,768,1440]){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await new Promise(r=>setTimeout(r,250));assert(await run('document.documentElement.scrollWidth<=innerWidth+1'),'Report overflow '+width);if([390,1440].includes(width)){const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync('.qa/reports-'+width+'.png',Buffer.from(shot.data,'base64'));}}
  const results={};let count=0;
  for(const key of Object.keys(expected)){
    await run(`document.querySelector('[data-download-report="${key}"]').click()`);
    const download=await waitDownload(++count);await wait('!document.querySelector("[data-download-all-reports]").disabled');
    const file=join(downloadPath,download.suggestedFilename);assert(existsSync(file));const parsed=validatePdf(file);results[key]={pages:parsed.pages,bytes:parsed.bytes};
    if(key==='appointments'){assert(parsed.actualText.replace(/\s+/g,' ').includes('Ṱshilidziḓa Mokoena'),'Unicode searchable text preserved');assert(parsed.actualText.replace(/\s/g,'').includes('AD-QA-LONG-GROUP'));assert(parsed.actualText.includes('18:30–19:00'),'Every group session exported');}
    if(key==='promotions')assert(parsed.actualText.includes('20% discount'),'Group discount exported');
    if(key==='staff')assert(parsed.actualText.includes('adivhahomudau3@gmail.com'),'Actual staff row exported');
  }
  await run('document.querySelector("[data-download-all-reports]").click()');const combined=await waitDownload(++count);await wait('!document.querySelector("[data-download-all-reports]").disabled');
  const allFile=join(downloadPath,combined.suggestedFilename),all=validatePdf(allFile);assert(all.pages>=6);for(const title of ['Appointments','Clients','Services','Add-ons','Specials & Promotions','Staff'])assert(all.actualText.includes(title),title+' included');
  copyFileSync(allFile,'.qa/reports-all.pdf');
  const stress=await run(`(async()=>{const result=await SpaReportPdf.build({title:'Pagination test',sections:[{title:'Long row pagination',columns:[{label:'Reference',width:.2},{label:'Details',width:.8}],rows:[['QA-LONG-ROW',Array.from({length:90},(_,i)=>'Detail line '+(i+1)+' · Ṱshilidziḓa Mokoena').join('\\n')]]}]});return new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve({pages:result.pageCount,data:reader.result.split(',')[1]});reader.readAsDataURL(result.blob);});})()`);
  assert(stress.pages>=3,'Oversized row continues across pages');writeFileSync('.qa/report-pagination.pdf',Buffer.from(stress.data,'base64'));assert(validatePdf('.qa/report-pagination.pdf').actualText.includes('Detail line 90'),'Last continuation line retained');
  assert(await run('window.qaRefreshCount>=8'),'Every export revalidates live staff access');
  await run('window.qaDeny=true;document.querySelector("[data-download-all-reports]").click()');await wait('document.body.classList.contains("admin-loading")');assert.equal(downloads.length,7,'Revoked session cannot export');
  assert.equal(errors.length,0,errors.join('\n'));
  writeFileSync('.qa/reports-results.json',JSON.stringify({passed:true,individual:results,combinedPages:all.pages,downloads:7,viewports:[320,390,768,1440],unicodeText:true,accessRevalidated:true},null,2));
  console.log('PASS Reports: six categories, derived clients, all table previews; six real PDF downloads plus combined PDF; valid cross references/page streams, long-row pagination, Unicode searchable text, exact promotion discount and owner; 320/390/768/1440px; revoked sessions cannot export. Mock records only.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{try{await send('Browser.close');}catch{}browser.kill();});
