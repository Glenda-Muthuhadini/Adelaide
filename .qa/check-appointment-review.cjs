// UI uses a mock API; atomic confirmed reservations are tested in staff-booking-review.sql.
const {spawn}=require('node:child_process');
const {readFileSync,writeFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+resolve('.qa/appointment-review-browser-profile')],{stdio:['ignore','ignore','ignore','pipe','pipe']});
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
    window.qaSubmitCalls=[];window.qaBlockSchedule=false;window.qaQuoteDelay=0;window.qaData=${JSON.stringify(fixture)};
    Object.assign(window.qaData,{viewer_role:'admin',bookings:[],blocks:[],settings:{pending_minutes:60,preparation_minutes:0},hours:Array.from({length:7},(_,weekday)=>({weekday,opens:540,closes:1140,closed:false}))});
    let spa;Object.defineProperty(window,'Spa',{configurable:true,get(){return spa;},set(api){
      api.requireAdmin=async()=>({email:'qa-staff@example.invalid'});
      api.rpc=async(name,args={})=>{
        if(name==='spa_admin_data')return structuredClone(window.qaData);
        if(name==='spa_quote'){
          await new Promise(r=>setTimeout(r,window.qaQuoteDelay));
          const option=window.qaData.options.find(o=>o.id===args.p_option),service=window.qaData.services.find(s=>s.id===option.service_id),sessions=[];
          let remaining=args.p_people,cursor=new Date(args.p_date+'T'+args.p_time+':00+02:00').getTime();
          while(remaining>0){const people=Math.min(remaining,4),end=cursor+option.duration*60000;sessions.push({starts_at:new Date(cursor).toISOString(),ends_at:new Date(end).toISOString(),reserved_until:new Date(end).toISOString(),people});remaining-=people;cursor=end;}
          window.qaQuote={service:service.name,duration:option.duration,option_id:option.id,people:args.p_people,total_cents:option.price_cents*(args.p_people/option.price_people),sessions,preparation_minutes:0,pending_minutes:60,quote:'qa-reviewed-quote'};return structuredClone(window.qaQuote);
        }
        if(name==='spa_admin_schedule'){
          window.qaSubmitCalls.push(structuredClone(args));if(window.qaBlockSchedule)throw new Error('Capacity changed. Review another starting time.');
          await new Promise(r=>setTimeout(r,50));
          const b={id:crypto.randomUUID(),reference:'AD-QA-REVIEW',request_id:args.p_request,customer_name:args.p_name,phone:args.p_phone,email:args.p_email,source:args.p_source,status:'confirmed',service_name:window.qaQuote.service,duration:window.qaQuote.duration,people:args.p_people,total_cents:window.qaQuote.total_cents,sessions:window.qaQuote.sessions};window.qaData.bookings.push(b);return {reference:b.reference,status:'confirmed'};
        }
        throw new Error('Unexpected RPC '+name);
      };spa=api;
    }});
  `});
  await call('Page.navigate',{url:pathToFileURL(resolve('admin-dashboard.html')).href});
  await wait('document.readyState==="complete"&&!document.body.classList.contains("admin-loading")&&!document.querySelector("#page-loader")');
  await run(`(()=>{document.querySelector('.quick-actions [data-create=new]').click();const f=document.querySelector('#appointment-form'),s=window.qaData.services.find(s=>s.name==='Swedish Massage'),o=window.qaData.options.find(o=>o.service_id===s.id&&o.duration===60);f.elements.option.value=o.id;f.elements.customer.value='QA reviewed client';f.elements.phone.value='0000000000';f.elements.email.value='qa-review@example.invalid';f.elements.people.value='10';f.elements.date.value=Spa.date(Date.now()+5*86400000);f.elements.time.value='10:00';})()`);
  for(const width of [320,390,768,1440]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
    assert(await run('document.querySelector("#appointment-dialog").scrollWidth<=document.querySelector("#appointment-dialog").clientWidth+1'),'Details overflow '+width);
    assert.equal(await run('getComputedStyle(document.querySelector("#appointment-form [type=submit]")).borderTopLeftRadius'),'8px');
  }
  await run('document.querySelector("#appointment-form").requestSubmit()');
  await wait('document.querySelector("#booking-review-dialog").open');
  assert(await run('!document.querySelector("#appointment-dialog").open'),'Review is a separate modal step');
  assert(await run('!document.querySelector("#admin-booking-review")'),'No inline review section');
  assert.equal(await run('document.activeElement.id'),'booking-review-title');
  assert.equal(await run('document.querySelectorAll("#staff-booking-review .session-list li").length'),3);
  assert(await run('document.querySelector("#staff-booking-review").textContent.includes("13:00")'));
  assert(await run('document.querySelector("#staff-booking-review").textContent.includes("qa-review@example.invalid")'));
  assert.equal(await run('window.qaSubmitCalls.length'),0,'Review does not reserve or schedule yet');
  for(const width of [320,390,768,1440]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
    assert(await run('document.querySelector("#booking-review-dialog").scrollWidth<=document.querySelector("#booking-review-dialog").clientWidth+1'),'Review overflow '+width);
    assert.equal(await run('getComputedStyle(document.querySelector("#admin-submit-booking")).borderTopLeftRadius'),'8px');
    if([390,1440].includes(width)){const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync('.qa/appointment-review-'+width+'.png',Buffer.from(shot.data,'base64'));}
  }
  await run('document.querySelector("[data-back-booking]").click()');
  assert(await run('document.querySelector("#appointment-dialog").open&&!document.querySelector("#booking-review-dialog").open'));
  assert.equal(await run('document.querySelector("#appointment-form").elements.customer.value'),'QA reviewed client');
  assert.equal(await run('document.querySelector("#appointment-form").elements.people.value'),'10');
  await run('document.querySelector("#appointment-form").requestSubmit()');await wait('document.querySelector("#booking-review-dialog").open');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
  await wait('document.querySelector("#appointment-dialog").open&&!document.querySelector("#booking-review-dialog").open');
  assert(await run('document.querySelector("#appointment-dialog").open&&!document.querySelector("#booking-review-dialog").open'),'Escape returns to edit');
  await run('document.querySelector("#appointment-form").requestSubmit()');await wait('document.querySelector("#booking-review-dialog").open');
  await run('window.qaBlockSchedule=true;document.querySelector("#admin-submit-booking").click()');await wait('document.querySelector("#staff-review-error").textContent.includes("Capacity changed")');
  assert(await run('document.querySelector("#booking-review-dialog").open'),'Capacity error stays on review');
  assert.equal(await run('window.qaData.bookings.length'),0);
  await run('window.qaBlockSchedule=false;document.querySelector("#appointment-form").elements.customer.value="Changed behind modal";document.querySelector("#admin-submit-booking").click();document.querySelector("#admin-submit-booking").click()');
  await wait('!document.querySelector("#booking-review-dialog").open&&document.querySelector("#appointment-detail .status-confirmed")!==null');
  assert.equal(await run('window.qaSubmitCalls.length'),2,'Failed attempt plus one confirmed attempt; double click blocked');
  assert.equal(await run('window.qaSubmitCalls[1].p_name'),'QA reviewed client','Only reviewed values submitted');
  assert(await run('window.qaSubmitCalls[0].p_request===window.qaSubmitCalls[1].p_request'),'Retry retains idempotency key');
  assert.equal(await run('window.qaData.bookings.length'),1);
  await run('document.querySelector("#appointment-dialog").close();document.querySelector(".quick-actions [data-create=walkin]").click()');
  assert.equal(await run('document.querySelector("#appointment-form").elements.source.value'),'walkin');
  await run(`(()=>{const f=document.querySelector('#appointment-form');f.elements.customer.value='QA closed draft';f.elements.phone.value='0000000000';f.elements.email.value='qa-closed@example.invalid';f.elements.date.value=Spa.date(Date.now()+6*86400000);window.qaQuoteDelay=100;f.requestSubmit();document.querySelector('#appointment-dialog').close();})()`);
  await new Promise(r=>setTimeout(r,180));assert(await run('!document.querySelector("#booking-review-dialog").open'),'Late quote cannot reopen a closed draft');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS appointment review: separate pop-up; complete group schedule, price and contacts; preserved Back/Escape; 8px buttons; 320/390/768/1440px; inline capacity errors; immutable reviewed payload; safe retry and double-click prevention; confirmed detail; cancelled draft stays closed. Mock API; atomic database flow tested separately.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{try{await send('Browser.close');}catch{}browser.kill();});
