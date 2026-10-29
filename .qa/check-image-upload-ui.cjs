// UI tests use a snapshot of the imported catalogue and a mock API.
const {spawn}=require('node:child_process');
const {readFileSync,writeFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+resolve('.qa/image-upload-browser-profile')],{stdio:['ignore','ignore','ignore','pipe','pipe']});
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
    window.qaUploadCalls=[];window.qaSaveFail=false;window.qaUploadFail=false;window.qaCalls=[];window.qaData=${JSON.stringify(fixture)};
    Object.assign(window.qaData,{bookings:[],blocks:[],settings:{pending_minutes:60,preparation_minutes:0},hours:Array.from({length:7},(_,weekday)=>({weekday,opens:540,closes:1140,closed:false}))});
    let spa;
    Object.defineProperty(window,'Spa',{configurable:true,get(){return spa;},set(api){
      api.requireAdmin=async()=>({email:window.qaData.staff[0].email});
      api.uploadImage=async file=>{window.qaUploadCalls.push({name:file.name,size:file.size,type:file.type});if(window.qaUploadFail)throw Error('Upload unavailable');return 'https://spa.invalid/catalogue/upload-'+window.qaUploadCalls.length+'.jpg';};
      api.rpc=async(name,args={})=>{
        if(name==='spa_admin_data')return structuredClone(window.qaData);
        if(name==='spa_customer_catalogue'){const result=structuredClone(window.qaData);result.services.find(s=>s.name==='Swedish Massage').image_path='assets/images/gallery/web/relaxed-garden-spa-portrait.jpg';result.services.find(s=>s.name==='Hot Stone Massage').image_path='';result.promotions.find(p=>p.name==='Couples Massage Specials').image_path='assets/images/gallery/web/professional-spa-massage-therapy.jpg';return result;}
        if(window.qaSaveFail&&name.startsWith('spa_admin_save_')){window.qaSaveFail=false;throw Error('Please retry saving');}
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

  await run('document.querySelector("[data-section=Services]").click();document.querySelector("[data-catalogue-add=service]").click()');
  assert.equal(await run('document.querySelector("[name=image_file]").type'),'file');assert.equal(await run('document.querySelector("[name=image_path]").type'),'hidden');assert(await run('!document.querySelector("#catalogue-dialog").textContent.includes("Photo path or URL")'));
  async function choosePhoto(){const {root}=await call('DOM.getDocument',{});const {nodeId}=await call('DOM.querySelector',{nodeId:root.nodeId,selector:'#catalogue-dialog [name=image_file]'});await call('DOM.setFileInputFiles',{nodeId,files:[resolve('assets/images/gallery/web/professional-spa-massage-therapy.jpg')]});await wait('document.querySelector(".catalogue-photo-preview").src.startsWith("blob:")');}
  await choosePhoto();assert.equal(await run('qaUploadCalls.length'),0,'Choosing a file only previews; Save uploads');
  await run('(()=>{const f=document.querySelector("[data-catalogue-form=service]");f.elements.name.value="QA uploaded service";f.elements.base_price.value="450";window.qaSaveFail=true;f.requestSubmit();})()');
  await wait('document.querySelector(".catalogue-error").textContent.includes("retry saving")');assert.equal(await run('qaUploadCalls.length'),1);assert(await run('document.querySelector("[name=image_file]").files.length===1'));await run('document.querySelector("[data-catalogue-form=service]").requestSubmit()');await wait('!document.querySelector("#catalogue-dialog").open');assert.equal(await run('qaUploadCalls.length'),1,'Save retry reuses its successful upload');
  const uploadedId=await run('qaData.services.find(s=>s.name==="QA uploaded service").id');await run(`document.querySelector('[data-catalogue-edit=service][data-item-id="${uploadedId}"]').click()`);assert(await run('document.querySelector(".catalogue-photo-preview").src.endsWith("upload-1.jpg")'));
  await choosePhoto();await run('window.qaUploadFail=true;document.querySelector("[data-catalogue-form=service]").requestSubmit()');await wait('document.querySelector(".catalogue-error").textContent.includes("Upload unavailable")');assert(await run('document.querySelector("#catalogue-dialog").open'));await run('window.qaUploadFail=false;document.querySelector("[data-catalogue-form=service]").requestSubmit()');await wait('!document.querySelector("#catalogue-dialog").open');assert(await run('qaData.services.find(s=>s.name==="QA uploaded service").image_path.endsWith("upload-3.jpg")'));
  await run(`document.querySelector('[data-catalogue-edit=service][data-item-id="${uploadedId}"]').click();document.querySelector('[data-remove-photo]').click();document.querySelector('[data-catalogue-form=service]').requestSubmit()`);await wait('!document.querySelector("#catalogue-dialog").open');assert.equal(await run('qaData.services.find(s=>s.name==="QA uploaded service").image_path'),'');
  await run('[...document.querySelectorAll("[data-section]")].find(b=>b.dataset.section==="Specials & Promotions").click();document.querySelector("[data-catalogue-add=promotion]").click()');await choosePhoto();await run('(()=>{const f=document.querySelector("[data-catalogue-form=promotion]");f.elements.name.value="QA uploaded offer";f.querySelector("[data-rate=amount]").value="500";f.requestSubmit();})()');await wait('!document.querySelector("#catalogue-dialog").open');assert(await run('qaData.promotions.find(p=>p.name==="QA uploaded offer").image_path.includes("upload-4.jpg")'));
  await run('document.querySelector("[data-catalogue-add=promotion]").click()');
  await run('const transfer=new DataTransfer();transfer.items.add(new File(["bad"],"bad.svg",{type:"image/svg+xml"}));const input=document.querySelector("[name=image_file]");input.files=transfer.files;input.dispatchEvent(new Event("change",{bubbles:true}))');assert(await run('document.querySelector(".catalogue-error").textContent.includes("JPG, PNG or WebP")'));
  for(const width of [320,390,768,1440]){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});assert(await run('document.querySelector("#catalogue-dialog").scrollWidth<=document.querySelector("#catalogue-dialog").clientWidth+1'),'Photo form overflow '+width);}
  console.log('PASS image picker UI: service and offer files, preview, persisted image, replacement, removal, unsupported type, upload failure, retry without repeat upload, and responsive forms. Mock Storage API.');

  for(const page of ['index.html','services.html','packages.html']){await call('Page.navigate',{url:pathToFileURL(resolve(page)).href});await wait('document.readyState==="complete"&&!document.querySelector("#page-loader")');if(page==='packages.html'){await wait('document.querySelector("#couples img").src.includes("professional-spa-massage-therapy.jpg")');}else{await wait('[...document.querySelectorAll(".treatment-card,.catalogue-card")].some(c=>c.querySelector("h2,h3").textContent.replace(/\\s+/g,"").includes("Swedish")&&c.querySelector("img").src.includes("relaxed-garden-spa-portrait.jpg"))');assert(await run('[...document.querySelectorAll(".treatment-card,.catalogue-card")].some(c=>c.querySelector("h2,h3").textContent.includes("Hot")&&getComputedStyle(c.querySelector("img")).display==="none")'));}}
  console.log('PASS public images: homepage/service photos and offer photos refresh from the catalogue; removed photos stay hidden.');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS catalogue UI: 16 services, 7 add-ons, 4 promotions, 1 real owner; tables and add buttons; create/edit/delete flows; exact duration prices and discounts; association validation; 320/390/768/1440px; removed tabs; no JavaScript exceptions. Mock API with actual catalogue snapshot; SQL rules tested separately.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{try{await send('Browser.close');}catch{}browser.kill();});
