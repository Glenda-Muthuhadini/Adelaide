// Browser behaviour uses a mock API; automatic reservations are tested in automatic-booking.sql.
const {spawn}=require('node:child_process');
const {readFileSync,writeFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+resolve('.qa/automatic-booking-browser-profile')],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let buffer='',nextId=0;const pending=new Map(),errors=[];
browser.stdio[4].on('data',chunk=>{buffer+=chunk.toString();let end;while((end=buffer.indexOf('\0'))!==-1){const m=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);clearTimeout(p.timeout);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);}});
function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++nextId,timeout=setTimeout(()=>reject(new Error('CDP timeout: '+method)),15000);pending.set(id,{resolve,reject,timeout});browser.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0');});}
(async()=>{
  const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const call=(m,p)=>send(m,p,sessionId);
  const run=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=async condition=>{for(let i=0;i<150;i++){if(await run(condition))return;await new Promise(r=>setTimeout(r,40));}throw new Error('Timed out: '+condition);};
  const fixture=JSON.parse(readFileSync('.qa/catalogue-browser-fixture.json','utf8'));
  const publicCatalogue=JSON.parse(readFileSync('.qa/customer-catalogue-fixture.json','utf8'));
  await call('Page.enable');await call('Runtime.enable');
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.qaData=${JSON.stringify(fixture)};window.qaSlots=['10:00','11:00','12:00'];window.qaSubmitCalls=[];window.qaAvailabilityCalls=0;window.qaMode='';window.qaSaved={};
    Object.assign(window.qaData,{viewer_role:'admin',bookings:[],blocks:[],settings:{pending_minutes:60,preparation_minutes:0},hours:Array.from({length:7},(_,weekday)=>({weekday,opens:540,closes:1140,closed:false}))});
    let spa;Object.defineProperty(window,'Spa',{configurable:true,get(){return spa;},set(api){
      api.requireAdmin=async()=>({email:'qa@example.invalid'});
      api.catalogue=async()=>({services:window.qaData.services,options:window.qaData.options});
      api.staffIdentity=async()=>null;
      api.rpc=async(name,args={})=>{
        if(name==='spa_admin_data')return structuredClone(window.qaData);
        if(name==='spa_customer_catalogue')return structuredClone(${JSON.stringify(publicCatalogue)});
        if(name==='spa_customer_availability'){window.qaAvailabilityCalls++;await new Promise(r=>setTimeout(r,80));return window.qaSlots.map(time=>({time}));}
        if(name==='spa_customer_quote'){
          const option=window.qaData.options.find(o=>o.id===args.p_selection.option_id),service=window.qaData.services.find(s=>s.id===option.service_id),sessions=[];
          let remaining=args.p_people,cursor=new Date(args.p_date+'T'+args.p_time+':00+02:00').getTime();while(remaining>0){const people=Math.min(remaining,4),end=cursor+option.duration*60000;sessions.push({starts_at:new Date(cursor).toISOString(),ends_at:new Date(end).toISOString(),reserved_until:new Date(end).toISOString(),people});remaining-=people;cursor=end;}
          window.qaQuote={service:service.name,duration:option.duration,option_id:option.id,people:args.p_people,total_cents:option.price_cents*(args.p_people/option.price_people),sessions,preparation_minutes:0,quote:'qa-automatic-quote'};return structuredClone(window.qaQuote);
        }
        if(name==='spa_customer_submit'){
          window.qaSubmitCalls.push(structuredClone(args));
          if(window.qaSaved[args.p_request])return window.qaSaved[args.p_request];
          if(window.qaMode==='full_once'||window.qaMode==='full_after_network'){window.qaMode='';window.qaSlots=['11:00','12:00'];const error=new Error('This starting time is no longer available.');error.status=400;error.code='P0001';throw error;}
          if(window.qaMode==='network_then_full'){window.qaMode='full_after_network';throw new TypeError('Failed to fetch');}
          const receipt={reference:'AD-QA-AUTOMATIC',status:'confirmed'};window.qaSaved[args.p_request]=receipt;
          if(window.qaMode==='commit_then_fail'){window.qaMode='';throw new TypeError('Failed to fetch');}return receipt;
        }
        throw new Error('Unexpected RPC '+name);
      };spa=api;
    }});
  `});
  async function go(page='booking.html?service=Swedish%20Massage'){const [file,query]=page.split('?');await call('Page.navigate',{url:pathToFileURL(resolve(file)).href+(query?'?'+query:'')});await wait('document.readyState==="complete"&&!document.querySelector("#page-loader")');}
  async function fillVisit(){await wait('!document.querySelector("#customer-booking").hidden');await run(`(()=>{const f=document.querySelector('#customer-booking');for(const [name,value] of Object.entries({people:'10',date:Spa.date(Date.now()+5*86400000),customer:'QA instant customer',phone:'0000000000',email:'qa-instant@example.invalid'})){f.elements[name].value=value;f.elements[name].dispatchEvent(new Event('input',{bubbles:true}));}})()`);}
  async function chooseAndReview(time='10:00'){await run(`(()=>{const f=document.querySelector('#customer-booking');f.elements.time.value='${time}';f.elements.time.dispatchEvent(new Event('input',{bubbles:true}));f.requestSubmit();})()`);await wait('!document.querySelector("#booking-review").hidden');}
  await go();await run('window.qaSlots=[]');await fillVisit();
  await wait('document.querySelector("#availability-message").textContent.includes("No appointments fit")');
  assert(await run('document.querySelector("#customer-booking").elements.time.disabled'),'No unavailable time offered');
  assert.equal(await run('window.qaSubmitCalls.length'),0);
  await run(`(()=>{window.qaSlots=['10:00','11:00','12:00'];const f=document.querySelector('#customer-booking');f.elements.date.value=Spa.date(Date.now()+6*86400000);f.elements.date.dispatchEvent(new Event('input',{bubbles:true}));f.elements.customer.value='QA contact typed while availability loads';f.elements.customer.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait('!document.querySelector("#customer-booking").elements.time.disabled');
  assert(await run('window.qaAvailabilityCalls>=2'),'Dates automatically check availability; contact typing cannot cancel the check');
  await chooseAndReview();assert.equal(await run('document.querySelectorAll("#review-schedule li").length'),3);
  assert(await run('!document.querySelector("#booking-review").textContent.match(/pending|admin approval|must confirm/i)'));
  await run('window.qaMode="full_once";document.querySelector("#submit-booking").click()');
  await wait('document.querySelector("#booking-review").hidden&&!document.querySelector("#customer-booking").elements.time.disabled');
  assert(await run('document.querySelector("#availability-message").textContent.includes("no longer available")'));
  assert(await run('![...document.querySelector("#customer-booking").elements.time.options].some(o=>o.value==="10:00")'),'Filled starting time removed');
  assert.equal(await run('document.querySelector("#customer-booking").elements.customer.value'),'QA contact typed while availability loads');
  await chooseAndReview('11:00');await run('document.querySelector("#submit-booking").click()');await wait('!document.querySelector("#booking-success").hidden');
  assert(await run('document.querySelector("#booking-success").textContent.includes("Your appointment is confirmed")'));
  assert(await run('!document.querySelector("#booking-success").textContent.match(/pending|held until|expires|approval/i)'));
  await go();await fillVisit();await wait('!document.querySelector("#customer-booking").elements.time.disabled');await chooseAndReview();
  await run('window.qaMode="commit_then_fail";document.querySelector("#submit-booking").click()');await wait('document.querySelector("#submit-booking").textContent==="Retry confirmation"');
  assert(await run('document.querySelector("#customer-booking").elements.customer.disabled'),'Unknown outcome locks changes until safe retry');
  await run('document.querySelector("#submit-booking").click()');await wait('!document.querySelector("#booking-success").hidden');
  assert.equal(await run('Object.keys(window.qaSaved).length'),1,'Network retry cannot create duplicate booking');
  assert(await run('window.qaSubmitCalls[0].p_request===window.qaSubmitCalls[1].p_request'));
  await go();await fillVisit();await wait('!document.querySelector("#customer-booking").elements.time.disabled');await chooseAndReview();
  await run('window.qaMode="network_then_full";document.querySelector("#submit-booking").click()');await wait('document.querySelector("#submit-booking").textContent==="Retry confirmation"');
  await run('document.querySelector("#submit-booking").click()');await wait('document.querySelector("#booking-review").hidden&&!document.querySelector("#customer-booking").elements.time.disabled');
  assert(await run('!document.querySelector("#customer-booking").elements.customer.disabled&&!document.querySelector("#customer-booking").elements.date.disabled'),'Known rejection after network retry restores editable fields');
  await go('admin-dashboard.html');await wait('!document.body.classList.contains("admin-loading")');
  await run(`(()=>{window.qaData.bookings=['Lebo Mokoena','Naledi Molefe'].map((customer_name,i)=>({id:'qa-'+i,reference:'AD-SEARCH-'+i,customer_name,email:'qa-'+i+'@example.invalid',phone:'000000000'+i,service_name:'Swedish Massage',duration:60,people:1,total_cents:50000,status:'confirmed',source:'online',sessions:[]}));window.dispatchEvent(new Event('focus'));})()`);
  await run('document.querySelector("[data-section=Appointments]").click()');await wait('document.querySelectorAll("#booking-results tbody tr").length===2');
  for(const width of [320,390,768,1440]){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await new Promise(r=>setTimeout(r,250));assert(await run('document.documentElement.scrollWidth<=innerWidth+1'),'Search overflow '+width);assert(await run('document.querySelector("#live-search").getBoundingClientRect().height>=48'),'Themed input touch size');if([390,1440].includes(width)){const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync('.qa/appointments-search-'+width+'.png',Buffer.from(shot.data,'base64'));}}
  await run('document.querySelector("#live-search").value="Lebo";document.querySelector("#live-search").dispatchEvent(new Event("input",{bubbles:true}))');
  assert.equal(await run('document.querySelectorAll("#booking-results tbody tr").length'),1);assert(await run('document.querySelector("#appointment-search-status").textContent.includes("1 of 2")'));
  await run('document.querySelector("#live-search").value="No match";document.querySelector("#live-search").dispatchEvent(new Event("input",{bubbles:true}))');assert(await run('document.querySelector("#booking-results").textContent.includes("No matching appointments")'));
  await run('document.querySelector("[data-clear-appointment-search]").click()');assert.equal(await run('document.querySelectorAll("#booking-results tbody tr").length'),2);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS automatic booking UI: automatic date/group availability, immediate full-slot feedback and alternatives, confirmed receipt without approval, preserved contacts, lost-response retry without duplicates, editable recovery after rejection; Appointments-only themed search/filter/clear/empty state at 320/390/768/1440px. Mock API; SQL rules tested separately.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{try{await send('Browser.close');}catch{}browser.kill();});
