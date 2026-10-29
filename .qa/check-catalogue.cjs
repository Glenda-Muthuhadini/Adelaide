// UI tests use a snapshot of the imported catalogue and a mock API.
const {spawn}=require('node:child_process');
const {readFileSync,writeFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+resolve('.qa/catalogue-browser-profile')],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let buffer='',nextId=0;const pending=new Map(),errors=[];
browser.stdio[4].on('data',chunk=>{buffer+=chunk.toString();let end;while((end=buffer.indexOf('\0'))!==-1){const m=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);clearTimeout(p.timeout);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);}});
function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++nextId,timeout=setTimeout(()=>reject(new Error('CDP timeout: '+method)),15000);pending.set(id,{resolve,reject,timeout});browser.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0');});}
(async()=>{
  const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const call=(m,p)=>send(m,p,sessionId);
  const run=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=async condition=>{for(let i=0;i<100;i++){if(await run(condition))return;await new Promise(r=>setTimeout(r,50));}throw new Error('Timed out: '+condition+'; '+await run('document.querySelector(".catalogue-error")?.textContent||""'));};
  const fixture=JSON.parse(readFileSync('.qa/catalogue-browser-fixture.json','utf8'));
  await call('Page.enable');await call('Runtime.enable');
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.qaCalls=[];window.qaData=${JSON.stringify(fixture)};
    Object.assign(window.qaData,{bookings:[],blocks:[],settings:{pending_minutes:60,preparation_minutes:0},hours:Array.from({length:7},(_,weekday)=>({weekday,opens:540,closes:1140,closed:false}))});
    let spa;
    Object.defineProperty(window,'Spa',{configurable:true,get(){return spa;},set(api){
      api.requireAdmin=async()=>({email:window.qaData.staff[0].email});
      api.rpc=async(name,args={})=>{
        if(name==='spa_admin_data')return structuredClone(window.qaData);
        window.qaCalls.push({name,...structuredClone(args)});
        if(name==='spa_admin_delete_catalogue'){const key={service:'services',addon:'addons',promotion:'promotions'}[args.p_kind];window.qaData[key]=window.qaData[key].filter(row=>row.id!==args.p_id);return {ok:true};}
        const kind=name.replace('spa_admin_save_',''),key={service:'services',addon:'addons',promotion:'promotions'}[kind];
        if(!key)throw new Error('Unexpected RPC '+name);
        const row={...args.p_data,id:args.p_data.id||crypto.randomUUID()};
        const i=window.qaData[key].findIndex(a=>a.id===row.id);if(i<0)window.qaData[key].push(row);else window.qaData[key][i]=row;
        if(kind==='service'){window.qaData.options=window.qaData.options.filter(o=>o.service_id!==row.id);window.qaData.options.push(...row.options.map(o=>({...o,id:crypto.randomUUID(),service_id:row.id,active:true})));}
        return {id:row.id};
      };spa=api;
    }});
  `});
  await call('Page.navigate',{url:pathToFileURL(resolve('admin-dashboard.html')).href});
  await wait('document.readyState==="complete"&&!document.body.classList.contains("admin-loading")&&!document.querySelector("#page-loader")');
  assert(await run('!document.querySelector("[data-section=Calendar]")&&!document.querySelector("[data-section=Availability]")'),'Removed navigation items');
  const sections=[['Services',16,'service'],['Add-ons',7,'addon'],['Specials & Promotions',4,'promotion'],['Staff',1,null]];
  for(const [section,count,kind] of sections){
    await run(`document.querySelector('[data-section="${section}"]').click()`);
    assert.equal(await run('document.querySelectorAll("#module-view tbody tr").length'),count,section+' rows');
    assert.equal(await run('document.querySelectorAll("#module-view form").length'),0,'Table first, no inline forms');
    if(kind)assert(await run(`!!document.querySelector('[data-catalogue-add="${kind}"]')`));
    for(const width of [320,390,768,1440]){
      await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
      await new Promise(r=>setTimeout(r,250));
      assert(await run('document.documentElement.scrollWidth<=innerWidth+1'),section+' overflow '+width);
      if(width<=900)assert(await run('document.querySelector("#sidebar").getBoundingClientRect().right<=1'),'Mobile navigation closed');
      if(width===390||width===1440){const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync('.qa/catalogue-'+(kind||'staff')+'-'+width+'.png',Buffer.from(shot.data,'base64'));}
    }
  }
  assert(await run('document.querySelector("#module-view").textContent.includes("adivhahomudau3@gmail.com")'),'Actual owner listed');
  await run('document.querySelector("[data-section=Services]").click();document.querySelector("[data-catalogue-add=service]").click()');
  await run(`(()=>{const f=document.querySelector('[data-catalogue-form=service]');f.elements.name.value='QA editable service';const c=f.querySelector('[data-duration-toggle="30"]');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));f.elements.price_30.value='125.50';f.requestSubmit();})()`);
  await wait('!document.querySelector("#catalogue-dialog").open');
  assert.equal(await run('window.qaCalls.at(-1).p_data.options[0].price_cents'),12550);
  const serviceId=await run('window.qaData.services.find(s=>s.name==="QA editable service").id');
  await run(`document.querySelector('[data-catalogue-edit=service][data-item-id="${serviceId}"]').click()`);
  assert.equal(await run('document.querySelector("[data-catalogue-form=service]").elements.price_30.value'),'125.50');
  await run(`(()=>{const f=document.querySelector('[data-catalogue-form=service]');f.elements.description.value='Updated description';f.requestSubmit();})()`);
  await wait('!document.querySelector("#catalogue-dialog").open');
  assert.equal(await run('window.qaCalls.at(-1).p_data.description'),'Updated description');
  await run(`document.querySelector('[data-catalogue-delete=service][data-item-id="${serviceId}"]').click();document.querySelector('[data-confirm-catalogue-delete]').click()`);
  await wait('!document.querySelector("#catalogue-dialog").open');
  assert.equal(await run('document.querySelectorAll("#module-view tbody tr").length'),16);
  await run('document.querySelector("[data-section=Add-ons]").click();document.querySelector("[data-catalogue-add=addon]").click()');
  await run(`(()=>{const f=document.querySelector('[data-catalogue-form=addon]');f.elements.name.value='QA extra';f.querySelector('[data-rate=amount]').value='50';f.requestSubmit();})()`);
  await wait('document.querySelector(".catalogue-error").textContent.includes("Select at least one")');
  await run(`(()=>{const f=document.querySelector('[data-catalogue-form=addon]');f.querySelector('[name=service_ids]').checked=true;f.querySelector('[name=promotion_ids]').checked=true;f.requestSubmit();})()`);
  await wait('!document.querySelector("#catalogue-dialog").open');
  assert.equal(await run('window.qaCalls.at(-1).p_data.promotion_ids.length'),1);
  const addonId=await run('window.qaData.addons.find(a=>a.name==="QA extra").id');
  await run(`document.querySelector('[data-catalogue-edit=addon][data-item-id="${addonId}"]').click()`);
  assert.equal(await run('document.querySelector("[data-catalogue-form=addon] [data-rate=amount]").value'),'50.00');
  await run('document.querySelector("[data-close-catalogue]").click()');
  await run(`document.querySelector('[data-catalogue-delete=addon][data-item-id="${addonId}"]').click();document.querySelector('[data-confirm-catalogue-delete]').click()`);
  await wait('!document.querySelector("#catalogue-dialog").open');
  await run('document.querySelector("[data-section=\\"Specials & Promotions\\"]").click();document.querySelector("[data-catalogue-add=promotion]").click()');
  await run(`(()=>{const f=document.querySelector('[data-catalogue-form=promotion]');f.elements.name.value='QA group special';f.querySelector('[data-rate=amount]').value='600';document.querySelector('[data-add-rate]').click();const rows=f.querySelectorAll('.catalogue-rate'),r=rows[1];r.querySelector('[data-rate=label]').value='Groups of ten';r.querySelector('[data-rate=kind]').value='discount';r.querySelector('[data-rate=kind]').dispatchEvent(new Event('change',{bubbles:true}));r.querySelector('[data-rate=amount]').value='20';f.requestSubmit();})()`);
  await wait('!document.querySelector("#catalogue-dialog").open');
  assert.equal(await run('window.qaCalls.at(-1).p_data.pricing[1].discount_percent'),20);
  const promoId=await run('window.qaData.promotions.find(p=>p.name==="QA group special").id');
  await run(`document.querySelector('[data-catalogue-edit=promotion][data-item-id="${promoId}"]').click()`);
  assert.equal(await run('document.querySelectorAll(".catalogue-rate").length'),2);
  for(const width of [320,390,768,1440]){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});assert(await run('document.querySelector("#catalogue-dialog").scrollWidth<=document.querySelector("#catalogue-dialog").clientWidth+1'),'Form overflow '+width);}
  await run('document.querySelector("[data-close-catalogue]").click()');
  await run(`document.querySelector('[data-catalogue-delete=promotion][data-item-id="${promoId}"]').click();document.querySelector('[data-confirm-catalogue-delete]').click()`);
  await wait('!document.querySelector("#catalogue-dialog").open');
  assert.equal(await run('document.querySelectorAll("#module-view tbody tr").length'),4);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS catalogue UI: 16 services, 7 add-ons, 4 promotions, 1 real owner; tables and add buttons; create/edit/delete flows; exact duration prices and discounts; association validation; 320/390/768/1440px; removed tabs; no JavaScript exceptions. Mock API with actual catalogue snapshot; SQL rules tested separately.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{try{await send('Browser.close');}catch{}browser.kill();});
