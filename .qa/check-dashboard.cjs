const { spawn } = require('node:child_process');
const { writeFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
// Use the installed browser through its local debugging pipe; no dependencies.
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless', '--no-sandbox', '--disable-gpu', '--disable-software-rasterizer',
  '--no-first-run', '--no-default-browser-check', '--remote-debugging-pipe',
  '--user-data-dir=' + resolve('.qa/browser-profile')
], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
let nextId = 0;
let buffer = '';
const pending = new Map();
const errors = [];
browser.stdio[4].on('data', (chunk) => {
  buffer += chunk.toString();
  let end;
  while ((end = buffer.indexOf('\0')) !== -1) {
    const message = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timeout } = pending.get(message.id);
      clearTimeout(timeout);
      pending.delete(message.id);
      message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  }
});
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => reject(new Error('CDP timeout: ' + method)), 15000);
    pending.set(id, { resolve, reject, timeout });
    browser.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  });
}
(async () => {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await call('Page.enable');
  await call('Runtime.enable');


  const page='admin-dashboard.html';
  await call('Page.navigate',{url:pathToFileURL(resolve(page)).href});
  await evaluate('new Promise(r=>document.readyState === "complete"?r():window.addEventListener("load",r,{once:true}))');
  await evaluate('Promise.all([...document.images].map(i=>i.decode()))');
  for(const [width,height] of [[320,568],[390,844],[600,900],[768,1024],[900,700],[1024,768],[1280,900],[1440,900],[1536,1024],[1920,1080],[844,390]]){
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    const dimensions=await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})');
    assert(dimensions.scroll<=width,'Overflow '+width+': '+JSON.stringify(dimensions));
    if([390,1536].includes(width)){
      const {data}=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
      writeFileSync(resolve('.qa','admin-dashboard-'+width+'.png'),Buffer.from(data,'base64'));
    }
  }
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  await evaluate('document.querySelector(".sidebar-toggle").click()');
  assert(await evaluate('document.querySelector("#sidebar").classList.contains("is-open")'),'Mobile navigation opens');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert(await evaluate('!document.querySelector("#sidebar").classList.contains("is-open")'),'Mobile navigation closes');
  await call('Emulation.setDeviceMetricsOverride',{width:1536,height:1024,deviceScaleFactor:1,mobile:false});
  for(const section of ['Appointments','Calendar','Clients','Services','Add-ons','Specials & Promotions','Staff','Availability','Reports','Profile settings','Dashboard']){
    await evaluate('navigate('+JSON.stringify(section)+')');
    assert(await evaluate('activeSection === '+JSON.stringify(section)),'Navigation '+section);
  }
  for(const view of ['week','month','day']){
    await evaluate('document.querySelector("[data-view='+view+']").click()');
    assert(await evaluate('calendarView === '+JSON.stringify(view)),'Schedule view '+view);
  }
  const initialDate=await evaluate('selectedDate');
  await evaluate('document.querySelectorAll("[data-date-step]")[1].click()');
  assert.notEqual(await evaluate('selectedDate'),initialDate,'Date navigation');
  await evaluate('document.querySelector(".today-button").click()');
  await evaluate('openDetail(1)');
  assert(await evaluate('document.querySelector("#appointment-dialog").open'),'Appointment details');
  await evaluate('document.querySelector("#appointment-dialog").close()');
  await evaluate('openCreate("online"); document.querySelector("#appointment-form").elements.client.value="Test Group"; document.querySelector("#appointment-form").elements.time.value="10:00"; document.querySelector("#appointment-form").elements.people.value="10"; document.querySelector("#appointment-form").requestSubmit()');
  assert.deepEqual(await evaluate('appointments.filter(a=>a.name==="Test Group").map(a=>[a.start,a.duration,a.people])'),[[600,60,4],[660,60,4],[720,60,2]],'Group allocation');
  assert(await evaluate('!hasSpace("Swedish Massage",today,630,60,1)'),'Full duration capacity check');
  await evaluate('openCreate("online"); document.querySelector("#appointment-form").elements.client.value="Over capacity"; document.querySelector("#appointment-form").elements.time.value="10:30"; document.querySelector("#appointment-form").requestSubmit()');
  assert(await evaluate('!document.querySelector("#booking-error").hidden && !appointments.some(a=>a.name==="Over capacity")'),'Overbooking blocked');
  await evaluate('document.querySelector("#appointment-dialog").close(); openCreate("online"); document.querySelector("#appointment-form").elements.client.value="Late booking"; document.querySelector("#appointment-form").elements.time.value="18:30"; document.querySelector("#appointment-form").elements.duration.value="90"; document.querySelector("#appointment-form").requestSubmit()');
  assert(await evaluate('!document.querySelector("#booking-error").hidden && !appointments.some(a=>a.name==="Late booking")'),'Closing time enforced');
  await evaluate('document.querySelector("#appointment-dialog").close(); openCreate("walkin"); document.querySelector("#appointment-form").elements.client.value="90 minute group"; document.querySelector("#appointment-form").elements.service.value="Deep Tissue Massage"; document.querySelector("#appointment-form").elements.duration.value="90"; document.querySelector("#appointment-form").elements.time.value="09:00"; document.querySelector("#appointment-form").elements.people.value="8"; document.querySelector("#appointment-form").requestSubmit()');
  assert.deepEqual(await evaluate('appointments.filter(a=>a.name==="90 minute group").map(a=>[a.start,a.duration,a.people])'),[[540,90,4],[630,90,4]],'90 minute allocation');
  const links=await evaluate('[...document.querySelectorAll("[href], [src]")].map(e=>e.getAttribute("href")||e.getAttribute("src"))');
  for(const link of links)if(!/^(#|https?:)/.test(link))assert(existsSync(resolve(decodeURIComponent(link))),'Missing file: '+link);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS dashboard: 11 responsive viewports, navigation, calendar views, date controls, dialogs, 60/90-minute groups, overbooking and closing-time checks, assets, no JavaScript exceptions.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{try{await send('Browser.close');}catch{}browser.kill();});
