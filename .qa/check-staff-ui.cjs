// UI uses mocked session identities; real owner permissions are tested separately.
const {spawn}=require('node:child_process');
const {readFileSync,writeFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+resolve('.qa/staff-browser-profile')],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let buffer='',nextId=0;const pending=new Map(),errors=[];
browser.stdio[4].on('data',chunk=>{buffer+=chunk.toString();let end;while((end=buffer.indexOf('\0'))!==-1){const m=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);clearTimeout(p.timeout);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);}});
function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++nextId,timeout=setTimeout(()=>reject(new Error('CDP timeout: '+method)),15000);pending.set(id,{resolve,reject,timeout});browser.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0');});}
(async()=>{
  const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const call=(m,p)=>send(m,p,sessionId);
  const run=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=async condition=>{for(let i=0;i<120;i++){if(await run(condition))return;await new Promise(r=>setTimeout(r,50));}throw new Error('Timed out: '+condition);};
  const fixture=JSON.parse(readFileSync('.qa/catalogue-browser-fixture.json','utf8'));
  await call('Page.enable');await call('Runtime.enable');
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.qaRole='owner';window.qaStaffCalls=[];window.qaData=${JSON.stringify(fixture)};
    Object.assign(window.qaData,{viewer_role:'owner',viewer_id:window.qaData.staff[0].id,bookings:[],blocks:[],settings:{pending_minutes:60,preparation_minutes:0},hours:Array.from({length:7},(_,weekday)=>({weekday,opens:540,closes:1140,closed:false}))});
    let spa;Object.defineProperty(window,'Spa',{configurable:true,get(){return spa;},set(api){
      api.requireAdmin=async()=>({email:window.qaData.staff[0].email});
      api.rpc=async name=>{if(name==='spa_admin_data')return structuredClone(window.qaData);throw new Error('Unexpected RPC '+name);};
      api.catalogue=async()=>({services:window.qaData.services,options:window.qaData.options});
      api.staffIdentity=async()=>{const role=window.qaRole;await new Promise(r=>setTimeout(r,30));return role?{id:'qa-id',role,name:role==='owner'?'Owner':'Staff'}:null;};
      api.addStaff=async details=>{window.qaStaffCalls.push({...details});window.qaData.staff.push({id:crypto.randomUUID(),name:details.name,email:details.email,role:'admin',active:true});return {existing_account:false};};
      spa=api;
    }});
  `});
  async function go(page){await call('Page.navigate',{url:pathToFileURL(resolve(page)).href});await wait('document.readyState==="complete"&&!document.querySelector("#page-loader")');}
  await go('admin-dashboard.html');await wait('!document.body.classList.contains("admin-loading")');
  await run('document.querySelector("[data-section=Staff]").click()');
  assert(await run('!!document.querySelector("[data-catalogue-add=staff]")'),'Owner has Add staff');
  await run('document.querySelector("[data-catalogue-add=staff]").click()');
  await run(`(()=>{const f=document.querySelector('[data-catalogue-form=staff]');f.elements.name.value='QA Staff';f.elements.email.value='qa@example.invalid';f.elements.password.value='QA initial password 123!';f.elements.confirmation.value='QA mismatch password 456!';f.requestSubmit();})()`);
  await wait('document.querySelector(".catalogue-error").textContent.includes("do not match")');assert.equal(await run('window.qaStaffCalls.length'),0);
  await run(`(()=>{const f=document.querySelector('[data-catalogue-form=staff]');f.elements.confirmation.value=f.elements.password.value;f.requestSubmit();})()`);
  await wait('!document.querySelector("#catalogue-dialog").open');
  assert.equal(await run('document.querySelectorAll("#module-view tbody tr").length'),2);
  assert.equal(await run('window.qaStaffCalls[0].email'),'qa@example.invalid');
  assert(await run('document.querySelector("[data-catalogue-form=staff]").elements.password.value===""'),'Passwords cleared after save');
  await run('window.qaData.viewer_role="admin";window.dispatchEvent(new Event("focus"))');
  await wait('!document.querySelector("[data-catalogue-add=staff]")');
  assert(await run('!document.querySelector("[data-catalogue-add=staff]")'),'Staff sees no Add staff button');
  assert.equal(await run('document.querySelectorAll("#module-view tbody tr").length'),2,'Staff still sees table');
  assert.equal(await run('document.querySelectorAll("#module-view button").length'),0,'Staff table has no account-management actions');
  const pages=['index.html','about.html','services.html','packages.html','gallery.html','contact.html','booking.html'];
  const widths=[320,390,600,768,1000,1001,1100,1200,1440];
  for(const page of pages){
    await go(page);await wait('!!document.querySelector(".staff-profile-link")');
    assert.equal(await run('document.querySelector(".staff-profile-link").getAttribute("href")'),'admin-dashboard.html');
    for(const width of widths){
      await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
      assert(await run('document.documentElement.scrollWidth<=innerWidth+1'),page+' overflow at '+width);
      assert(await run('(()=>{const r=document.querySelector(".staff-profile-link").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.width>=44&&r.height>=44})()'),page+' profile bounds '+width);
      assert(await run('(()=>{const p=document.querySelector(".staff-profile-link").getBoundingClientRect(),m=document.querySelector(".menu-toggle");if(!m||getComputedStyle(m).display==="none")return true;return p.right<=m.getBoundingClientRect().left+1})()'),page+' menu overlap '+width);
      if(page==='index.html'&&[390,1440].includes(width)){const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync('.qa/public-staff-profile-'+width+'.png',Buffer.from(shot.data,'base64'));}
    }
    await run('window.qaRole="admin";window.dispatchEvent(new Event("spa:session-changed"))');await wait('!!document.querySelector(".staff-profile-link")');
    await run('window.qaRole="customer";window.dispatchEvent(new Event("spa:session-changed"))');await wait('!document.querySelector(".staff-profile-link")');await new Promise(r=>setTimeout(r,80));assert(await run('!document.querySelector(".staff-profile-link")'),'Customer never gets icon');
    await run('window.qaRole=null;window.dispatchEvent(new Event("spa:session-changed"))');await new Promise(r=>setTimeout(r,80));assert(await run('!document.querySelector(".staff-profile-link")'),'Guest never gets icon');
    await run('window.qaRole="owner";window.dispatchEvent(new Event("spa:session-changed"));window.qaRole=null;window.dispatchEvent(new Event("spa:session-changed"))');await new Promise(r=>setTimeout(r,80));assert(await run('!document.querySelector(".staff-profile-link")'),'Stale owner response cannot restore icon');
  }
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS staff UI: owner-only Add staff, password confirmation, table refresh, cleared passwords; ordinary staff table only; profile return links for owner/staff across all seven public pages; no customer/guest/stale-session icon; nine viewport sizes with no overflow or menu overlap. Mock session API; live account creation and SQL permissions tested separately.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{try{await send('Browser.close');}catch{}browser.kill();});
