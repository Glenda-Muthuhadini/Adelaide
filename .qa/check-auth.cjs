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

  for (const page of ['admin-login.html', 'admin-signup.html', 'admin-forgot-password.html', 'admin-reset-password.html']) {
    await call('Page.navigate', {url: pathToFileURL(resolve(page)).href});
    await evaluate('new Promise(r => document.readyState === "complete" ? r() : window.addEventListener("load", r, {once:true}))');
    await evaluate('Promise.all([...document.images].map(i => i.decode()))');
    const links = await evaluate('[...document.querySelectorAll("[href], [src]")].map(e => e.getAttribute("href") || e.getAttribute("src"))');
    for (const link of links) if (!/^(#|https?:)/.test(link)) assert(existsSync(resolve(decodeURIComponent(link))), 'Missing file: ' + link);
    for (const [width, viewportHeight] of [[320,568], [390,844], [600,900], [768,1024], [1024,768], [1440,900], [1920,1080], [568,320], [844,390]]) {
      await call('Emulation.setDeviceMetricsOverride', {width, height: viewportHeight, deviceScaleFactor: 1, mobile: false});
      assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), page + ' overflow at ' + width);
      assert(await evaluate('document.documentElement.scrollHeight <= innerHeight'), page + ' vertical scrolling at ' + width);
      assert(await evaluate('document.querySelector(".auth-content").getBoundingClientRect().top >= 0 && document.querySelector(".auth-content").getBoundingClientRect().bottom <= innerHeight'), page + ' clipped form at ' + width + 'x' + viewportHeight);
      assert(await evaluate('document.querySelector(".auth-brand").getAttribute("href") === "index.html"'), 'Logo must link home');
      assert(await evaluate('[...document.querySelectorAll("input, .auth-submit, .password-toggle")].every(e => e.getBoundingClientRect().height >= 44)'), 'Touch target size');
      if (width === 390 || width === 1440) {
        const height = await evaluate('document.documentElement.scrollHeight');
        const {data} = await call('Page.captureScreenshot', {format:'png', captureBeyondViewport:true, clip:{x:0,y:0,width,height,scale:1}});
        writeFileSync(resolve('.qa', page.replace('.html','') + '-' + width + '.png'), Buffer.from(data,'base64'));
      }
    }
    assert(await evaluate('!document.querySelector(".auth-submit").disabled'), 'Form must be interactive');
    assert(await evaluate('!document.querySelector("form").checkValidity()'), 'Empty form must be invalid');
    const passwordCount = await evaluate('document.querySelectorAll(".password-toggle").length');
    if (passwordCount) {
      assert(await evaluate('document.querySelector(".password-toggle").click(); document.querySelector("#password").type === "text"'), 'Show password');
      assert(await evaluate('document.querySelector(".password-toggle").click(); document.querySelector("#password").type === "password"'), 'Hide password');
    }
    await evaluate('document.querySelectorAll("input").forEach(i => { i.value = i.type === "email" ? "admin@example.com" : i.id === "full-name" ? "Adelaide Admin" : "A long test phrase 123"; i.dispatchEvent(new Event("input", {bubbles:true})); })');
    if (page.includes('signup') || page.includes('reset-password')) {
      assert(await evaluate('var c = document.querySelector("#confirm-password"); c.value = "different password"; c.dispatchEvent(new Event("input", {bubbles:true})); !c.validity.valid'), 'Mismatch must be rejected');
      await evaluate('var c = document.querySelector("#confirm-password"); c.value = document.querySelector("#password").value; c.dispatchEvent(new Event("input", {bubbles:true}))');
    }
    assert(await evaluate('document.querySelector("form").checkValidity()'), 'Valid inputs accepted');
    await evaluate('document.querySelector("form").requestSubmit()');
    assert(await evaluate('!document.querySelector(".form-status").hidden && document.activeElement === document.querySelector(".form-status")'), 'Accessible honest submission notice');
    assert(await evaluate('location.pathname.endsWith("' + page + '")'), 'Must not fake a login or navigate');
    console.log('PASS ' + page + ': nine portrait/landscape viewports without scrolling or clipping; logo, assets, validation, password controls, submission notice.');
  }
  assert.equal(errors.length, 0, errors.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  try { await send('Browser.close'); } catch {}
  browser.kill();
});

