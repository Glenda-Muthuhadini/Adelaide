const { spawn } = require('node:child_process');
const { writeFileSync, readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const page = process.argv[2] || 'index.html';
assert(['index.html', 'about.html'].includes(page), 'Unsupported page');
const isAbout = page === 'about.html';

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
  await call('Page.navigate', { url: pathToFileURL(resolve(page)).href });
  await evaluate('new Promise(resolve => { if (document.readyState === "complete") resolve(); else window.addEventListener("load", resolve, {once:true}); })');
  await evaluate('Promise.all([...document.images].map(image => { image.loading = "eager"; return image.decode(); }))');
  for (const width of [320, 390, 600, 768, 1024, 1280, 1440]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    const metrics = await evaluate(`(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
      sections: document.querySelectorAll('main > section').length,
      treatments: document.querySelectorAll('.treatment-card').length,
      packages: document.querySelectorAll('.package-card').length,
      placeholders: document.querySelectorAll('.image-placeholder, .about-placeholder').length,
      logoLoaded: [...document.images].every(image => image.complete && image.naturalWidth > 0),
      icons: [...document.querySelectorAll('[data-icon]')].every(icon => icon.querySelector('svg')),
      booking: [...document.querySelectorAll('a[target="_blank"]')].every(a => a.href.startsWith('https://wa.me/27673030683'))
    }))()`);
    if (metrics.scroll > width) console.log(await evaluate('[...document.querySelectorAll("body *")].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => ({tag:e.tagName, class:e.className, right:e.getBoundingClientRect().right})).slice(0,20)'));
    assert(metrics.scroll <= width, `Horizontal overflow at ${width}: ${metrics.scroll}`);
    assert.equal(metrics.sections, 7);
    assert.equal(metrics.treatments, isAbout ? 0 : 4);
    assert.equal(metrics.packages, isAbout ? 0 : 4);
    assert.equal(metrics.placeholders, isAbout ? 5 : 14);
    assert(metrics.logoLoaded && metrics.icons && metrics.booking);
    if (isAbout) {
      assert(await evaluate('document.querySelector("[aria-current=page]").getAttribute("href") === "about.html"'));
      assert(await evaluate('document.querySelectorAll(".values-grid .about-feature").length === 4 && document.querySelectorAll(".experience-grid .about-feature").length === 4'));
    }
    if (width === 390) {
      await evaluate('document.querySelector(".menu-toggle").click()');
      assert(await evaluate('document.querySelector(".menu-toggle").getAttribute("aria-expanded") === "true" && getComputedStyle(document.querySelector(".main-navigation")).display === "flex"'));
      await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      assert(await evaluate('document.querySelector(".menu-toggle").getAttribute("aria-expanded") === "false" && document.activeElement === document.querySelector(".menu-toggle")'));
      await evaluate('document.querySelector(".menu-toggle").click(); document.querySelector("h1").click()');
      assert(await evaluate('document.querySelector(".menu-toggle").getAttribute("aria-expanded") === "false"'));
    }
    if ([390, 1440].includes(width)) {
      const height = await evaluate('document.documentElement.scrollHeight');
      const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
      writeFileSync(resolve('.qa', (isAbout ? 'about-' : '') + (width === 390 ? 'mobile.png' : 'desktop.png')), Buffer.from(data, 'base64'));
    }
    console.log(`PASS ${width}px: no horizontal overflow; sections, assets and booking links valid.`);
  }
  const links = await evaluate('[...document.querySelectorAll("[href], [src]")].map(e => e.getAttribute("href") || e.getAttribute("src"))');
  for (const link of links) {
    if (/^(https?:|tel:|#)/.test(link)) continue;
    assert(existsSync(resolve(decodeURIComponent(link))), 'Missing local file: ' + link);
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  assert(!/<style\b|style=|<script(?![^>]*src=)/i.test(readFileSync(page, 'utf8')));
  console.log('PASS mobile menu, Escape focus, outside-click dismissal, local links, separate styles/scripts, no JS exceptions.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  try { await send('Browser.close'); } catch {}
  browser.kill();
});
