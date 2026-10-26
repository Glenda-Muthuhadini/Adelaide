const { spawn } = require('node:child_process');
const { writeFileSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
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
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await call('Page.enable');
  await call('Runtime.enable');
  const portrait = [320, 360, 375, 390, 414, 520, 600, 760, 761, 900, 1000, 1001, 1200, 1201, 1440, 1920, 2560].map(width => ({ width, height: width <= 520 ? 740 : 900 }));
  const landscape = [[568, 320], [667, 375], [844, 390], [1024, 600]].map(([width, height]) => ({ width, height }));
  const scenarios = [...portrait, ...landscape];
  const pages = ['index.html', 'about.html', 'services.html', 'packages.html', 'gallery.html', 'contact.html'];
  const report = [];
  for (const page of pages) {
    await call('Page.navigate', { url: pathToFileURL(resolve(page)).href });
    await evaluate('new Promise(resolve => { if(document.readyState === "complete") resolve(); else addEventListener("load",resolve,{once:true}); })');
    await evaluate('Promise.all([...document.images].map(image => {image.loading="eager";return image.decode();}))');
    for (const scenario of scenarios) {
      const { width, height } = scenario;
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: width <= 520 ? 2 : 1, mobile: width <= 1000 });
      await call('Emulation.setTouchEmulationEnabled', { enabled: width <= 1024 });
      await evaluate('scrollTo({top:0,behavior:"instant"})');
      const findings = await evaluate(`(() => {
        const visible = el => {const r=el.getBoundingClientRect();return r.width>0 && r.height>0 && getComputedStyle(el).visibility!=='hidden' && !el.closest('[hidden]');};
        const describe = el => ({tag:el.tagName, class:typeof el.className==='string'?el.className:'', text:el.textContent.trim().slice(0,65)});
        const clipped = [...document.querySelectorAll('h1,h2,h3,p,li,dt,dd,button,a.button')].filter(el => visible(el) && el.scrollWidth>el.clientWidth+2).map(describe);
        const outside = [...document.querySelectorAll('main h1,main h2,main h3,main p,a.button,button')].filter(el => visible(el) && (el.getBoundingClientRect().right>innerWidth+2 || el.getBoundingClientRect().left < -2) && !el.matches('.skip-link')).map(describe);
        const smallTargets = matchMedia('(pointer:coarse)').matches ? [...document.querySelectorAll('a,button')].filter(el => visible(el) && el.getBoundingClientRect().height<44 && !el.matches('.skip-link')).map(describe) : [];
        const heroHeading=document.querySelector('main h1').getBoundingClientRect();
        const header=document.querySelector('.site-header').getBoundingClientRect();
        return { overflow:document.documentElement.scrollWidth>innerWidth, clipped, outside, smallTargets, headerOverlaps:heroHeading.top<header.bottom-1 };
      })()`);
      if (width <= 1000) {
        await evaluate('document.querySelector(".menu-toggle").click()');
        findings.menuTooTall = await evaluate('document.querySelector(".main-navigation").getBoundingClientRect().bottom > innerHeight+1');
        findings.menuClipped = await evaluate('document.querySelector(".main-navigation").scrollWidth > document.querySelector(".main-navigation").clientWidth+1');
        if (process.argv.includes('--screenshots') && page === 'services.html' && width === 568 && height === 320) {
          const { data } = await call('Page.captureScreenshot', { format: 'png' });
          writeFileSync('.qa/responsive-landscape-menu.png', Buffer.from(data, 'base64'));
        }
        await evaluate('document.querySelector(".main-navigation").lastElementChild.focus()');
        findings.menuUnreachable = await evaluate('(() => { const r=document.activeElement.getBoundingClientRect(); return r.bottom>innerHeight+1 || r.top<0; })()');
        await call('Input.dispatchKeyEvent', { type:'keyDown', key:'Escape', code:'Escape', windowsVirtualKeyCode:27 });
        findings.menuFocusLost = await evaluate('document.activeElement!==document.querySelector(".menu-toggle") || document.querySelector(".menu-toggle").getAttribute("aria-expanded")!=="false"');
      }
      if (process.argv.includes('--screenshots') && page === 'index.html' && width === 360) {
        await evaluate('document.querySelector(".benefits").scrollIntoView({behavior:"instant"})');
        const { data } = await call('Page.captureScreenshot', { format: 'png' });
        writeFileSync('.qa/responsive-narrow-benefits.png', Buffer.from(data, 'base64'));
      }
      if (findings.overflow || findings.clipped.length || findings.outside.length || findings.smallTargets.length || findings.headerOverlaps || findings.menuTooTall || findings.menuClipped || findings.menuUnreachable || findings.menuFocusLost) report.push({ page, ...scenario, ...findings });
    }
    console.log('Audited ' + page + ' across ' + scenarios.length + ' portrait, landscape and wide-screen sizes.');
  }
  writeFileSync('.qa/responsive-audit.json', JSON.stringify({ scenarios: scenarios.length, pages: pages.length, errors, findings: report }, null, 2));
  const grouped = {};
  for (const item of report) {
    for (const key of ['overflow','headerOverlaps','menuTooTall','menuClipped','menuUnreachable','menuFocusLost']) if(item[key]) grouped[item.page+' '+key]=(grouped[item.page+' '+key]||0)+1;
    for (const key of ['clipped','outside','smallTargets']) for(const el of item[key]) { const id=item.page+' '+key+' '+el.class+' '+el.text; grouped[id]=(grouped[id]||0)+1; }
  }
  console.log(JSON.stringify(grouped,null,2));
  if (process.argv.includes('--strict') && (report.length || errors.length)) throw new Error('Responsive audit has unresolved findings.');
})().catch(error => { console.error(error); process.exitCode=1; }).finally(async () => {
  try { await send('Browser.close'); } catch {}
  browser.kill();
});
