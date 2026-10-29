const { spawn } = require('node:child_process');
const { writeFileSync, readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const page = process.argv[2] || 'index.html';
assert(['index.html', 'about.html', 'services.html', 'packages.html', 'gallery.html', 'contact.html'].includes(page), 'Unsupported page');
const isAbout = page === 'about.html';
const isServices = page === 'services.html';
const isSpecials = page === 'packages.html';
const isGallery = page === 'gallery.html';
const isContact = page === 'contact.html';
const compareFooter = process.argv.includes('--footer');
const footerSnapshots = {};
const referenceFooters = compareFooter && page !== 'index.html' ? JSON.parse(readFileSync('.qa/footer-reference.json', 'utf8')) : null;

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
  if (isServices || isSpecials) {
    const expected = JSON.parse(readFileSync('.qa/pricing-expected.json', 'utf8'))[isServices ? 'services' : 'offers'];
    const actual = await evaluate(`Object.fromEntries([...document.querySelectorAll('${isServices ? '.catalogue-card' : '.special-card'}')].filter(card => card.querySelector('.card-prices')).map(card => [card.querySelector('${isServices ? 'h2' : 'h3'}').textContent, [...card.querySelectorAll('.card-price-row')].map(row => { const duration = row.querySelector('small'); const data = [row.querySelector('dt').firstChild.textContent, row.querySelector('dd').textContent]; if(duration) data.push(duration.textContent); return data; })]))`);
    assert.deepEqual(actual, expected, 'Prices, durations, group tiers and discounts must match the supplied rates exactly.');
    if (isServices) {
      assert(await evaluate('[...document.querySelectorAll(".card-prices")].every(list => list.nextElementSibling.matches("a.button"))'), 'Standard prices must appear above booking buttons.');
      assert.equal(await evaluate('document.querySelectorAll(".catalogue-card").length'), Object.keys(expected).length, 'The standard menu must contain exactly the supplied services and packages.');
      assert.deepEqual(await evaluate('[...document.querySelectorAll(".service-inclusions li")].map(item => item.textContent)'), ['60-minute full body massage', 'Hot stones', 'Refreshing scalp massage']);
      assert(await evaluate('!(/Me-Time|Couples Massage Specials|Birthday Package|Group Wellness Special|complimentary|gown|discount|Sip & Paint/i.test(document.querySelector(".service-catalogue").innerText))'), 'Promotions must stay out of the standard treatment catalogue.');
    } else {
      assert(await evaluate('!(/Ultimate Relaxation|Couples Retreat/i.test(document.querySelector("main").innerText))'), "Standard service packages must not become promotional specials.");
      const expectedInclusions = JSON.parse(readFileSync('.qa/pricing-expected.json', 'utf8')).inclusions;
      const actualInclusions = await evaluate('Object.fromEntries([...document.querySelectorAll(".special-card")].map(card => [card.querySelector("h3").textContent, [...card.querySelectorAll(".promotion-inclusions li")].map(item => item.textContent)]))');
      assert.deepEqual(actualInclusions, expectedInclusions, 'Only the supplied inclusions may appear.');
      assert(await evaluate('[...document.querySelectorAll(".special-card")].every(card => card.querySelector("a.button").textContent.trim().startsWith("Book now"))'), 'All visible offers must book directly on WhatsApp.');
      assert(await evaluate('!(/Corporate Wellness|Custom Specials|Seasonal Spa Special|Relax & Restore|Individual Spa Special|Birthday Specials/i.test(document.querySelector("main").innerText))'), 'Remove generic promotional offers.');
    }
  }
  for (const width of [320, 390, 600, 768, 1000, 1001, 1024, 1100, 1200, 1280, 1440]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    const metrics = await evaluate(`(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
      sections: document.querySelectorAll('main > section').length,
      treatments: document.querySelectorAll('.treatment-card, .catalogue-card').length,
      packages: document.querySelectorAll('.package-card, .special-card').length,
      placeholders: document.querySelectorAll('.image-placeholder, .about-placeholder, .service-placeholder, .specials-placeholder, .gallery-placeholder, .contact-hero-image').length,
      logoLoaded: [...document.images].every(image => image.complete && image.naturalWidth > 0),
      icons: [...document.querySelectorAll('[data-icon]')].every(icon => icon.querySelector('svg')),
      booking: [...document.querySelectorAll('a[target="_blank"]:not(.contact-directions):not(.gallery-photo-link):not(.developer-link)')].every(a => a.href.startsWith('https://wa.me/27673030683'))
    }))()`);
    if (metrics.scroll > width) console.log(await evaluate('[...document.querySelectorAll("body *")].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => ({tag:e.tagName, class:e.className, right:e.getBoundingClientRect().right})).slice(0,20)'));
    assert(metrics.scroll <= width, `Horizontal overflow at ${width}: ${metrics.scroll}`);
    assert.equal(metrics.sections, isContact ? 3 : isSpecials ? 5 : isServices || isGallery ? 4 : 7);
    assert.equal(metrics.treatments, isServices ? 16 : isAbout || isSpecials || isGallery || isContact ? 0 : 4);
    assert.equal(metrics.packages, isSpecials ? 4 : isAbout || isServices || isGallery || isContact ? 0 : 4);
    assert.equal(metrics.placeholders, isContact ? 1 : isGallery ? 25 : isSpecials ? 6 : isServices ? 17 : isAbout ? 5 : 14);
    assert(metrics.logoLoaded && metrics.icons && metrics.booking);
    if (isServices || isGallery || isContact) {
      const banner = await evaluate('(() => { const element = document.querySelector(".service-cta, .gallery-cta, .contact-cta"); const rect = element.getBoundingClientRect(); return {left:rect.left,right:rect.right,width:document.documentElement.clientWidth,radius:getComputedStyle(element).borderRadius,hasContent:!!element.querySelector(".container.cta-content")}; })()');
      assert(Math.abs(banner.left) < 1 && Math.abs(banner.right - banner.width) < 1, 'Green booking banner must span the full page width.');
      assert.equal(banner.radius, '0px');
      assert(banner.hasContent, 'Banner content must retain its contained alignment.');
    }
    if (compareFooter) {
      const footer = await evaluate(`['.site-footer', '.footer-main', '.footer-brand img', '.footer-contact', '.footer-hours', '.social-links', '.social-icon', '.footer-bottom', '.footer-bottom p', '.footer-bottom small'].map(selector => {
        const element = document.querySelector(selector); const style = getComputedStyle(element);
        return { selector, styles: Object.fromEntries(['display','width','height','padding','margin','gap','gridTemplateColumns','fontFamily','fontSize','fontWeight','fontStyle','lineHeight','color','backgroundColor','border','textAlign'].map(property => [property, style[property]])) };
      })`);
      if (page === 'index.html') footerSnapshots[width] = footer;
      else assert.deepEqual(footer, referenceFooters[width], 'Footer styling must match the homepage at ' + width + 'px.');
    }
    assert.deepEqual(await evaluate('[...document.querySelectorAll("nav > a:not(.button)")].map(a => a.textContent)'), ['Home', 'About', 'Services', 'Specials & Offers', 'Gallery', 'Contact']);
    assert(await evaluate('document.querySelector("nav a[href=\\"packages.html\\"]").textContent === "Specials & Offers"'));
    if (isSpecials) {
      assert(await evaluate('document.querySelector("[aria-current=page]").getAttribute("href") === "packages.html"'));
      assert(await evaluate('!document.querySelector("dialog, .offer-explore") && [...document.querySelectorAll(".special-card")].every(card => new URL(card.querySelector("a.button").href).searchParams.get("text").includes(card.querySelector("h3").textContent))'));
    }
    if (isAbout) {
      assert(await evaluate('document.querySelector("[aria-current=page]").getAttribute("href") === "about.html"'));
      assert(await evaluate('document.querySelectorAll(".values-grid .about-feature").length === 4 && document.querySelectorAll(".experience-grid .about-feature").length === 4'));
    }
    if (isContact) {
      assert(await evaluate('document.querySelector("[aria-current=page]").getAttribute("href") === "contact.html"'));
      assert.equal(await evaluate('document.querySelectorAll(".contact-card").length'), 4);
      assert(await evaluate('[...document.querySelectorAll("a[href^=tel]")].every(link => link.getAttribute("href") === "tel:+27673030683")'));
      const destination = await evaluate('new URL(document.querySelector(".contact-directions").href).searchParams.get("destination")');
      assert.equal(destination, 'Adelaide Wellness & Spa, Unit E, Samvuni Street, Hamagidi, Thohoyandou, South Africa');
      assert(await evaluate('document.querySelector(".contact-hours-card").textContent.includes("09:00") && document.querySelector(".contact-hours-card").textContent.includes("19:00")'));
      assert(existsSync('assets/icons/contact-botanical.svg'));
      assert(await evaluate('!!document.querySelector("#contact-image-clip")'));
      assert.equal(await evaluate('getComputedStyle(document.querySelector(".contact-methods")).gridTemplateColumns.split(" ").length'), width <= 520 ? 1 : width <= 1000 ? 2 : 4);
    }
    if (isGallery) {
      assert(await evaluate('document.querySelector("[aria-current=page]").getAttribute("href") === "gallery.html"'));
      assert.equal(await evaluate('document.querySelectorAll(".gallery-tile").length'), 24);
      for (const [category, count] of [['spa', 3], ['services', 1], ['relaxation', 7], ['experiences', 13], ['all', 24]]) {
        await evaluate(`document.querySelector('[data-gallery-filter="${category}"]').click()`);
        assert.equal(await evaluate('document.querySelectorAll(".gallery-tile:not([hidden])").length'), count);
        assert.equal(await evaluate('document.querySelectorAll(".gallery-filter[aria-pressed=true]").length'), 1);
        assert(await evaluate(`document.querySelector('.gallery-status').textContent.startsWith('${count} image')`));
        assert(await evaluate('[...document.querySelectorAll(".gallery-tile[hidden]")].every(item => getComputedStyle(item).display === "none")'));
        assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
      }
      const columns = await evaluate('getComputedStyle(document.querySelector(".gallery-grid")).gridTemplateColumns.split(" ").length');
      assert.equal(columns, width <= 350 ? 1 : width <= 760 ? 2 : 3);
    }
    if (isServices) {
      assert(await evaluate('document.querySelector("[aria-current=page]").getAttribute("href") === "services.html"'));
      for (const [category, count] of [['massages', 5], ['facials', 1], ['other', 5], ['addons', 3], ['packages', 2], ['all', 16]]) {
        await evaluate(`document.querySelector('[data-filter="${category}"]').click()`);
        assert.equal(await evaluate('document.querySelectorAll(".catalogue-card:not([hidden])").length'), count);
        assert.equal(await evaluate('document.querySelectorAll(".filter-button[aria-pressed=true]").length'), 1);
        assert(await evaluate(`document.querySelector('.filter-status').textContent.startsWith('${count} service')`));
        assert(await evaluate('[...document.querySelectorAll(".catalogue-card[hidden]")].every(card => getComputedStyle(card).display === "none")'));
        assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
      }
      assert(await evaluate('[...document.querySelectorAll(".catalogue-card")].every(card => new URL(card.querySelector("a").href).searchParams.get("text").includes(card.querySelector("h2").textContent))'));
    }
    if (isServices || isSpecials) {
      assert(await evaluate('[...document.querySelectorAll(".card-prices")].every(list => [...list.querySelectorAll("dt, dd")].every(part => part.getBoundingClientRect().right <= list.closest("article").getBoundingClientRect().right && part.getBoundingClientRect().left >= list.closest("article").getBoundingClientRect().left))'), 'Prices must fit inside their cards.');
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
      writeFileSync(resolve('.qa', (isContact ? 'contact-' : isGallery ? 'gallery-' : isSpecials ? 'specials-' : isServices ? 'services-' : isAbout ? 'about-' : '') + (width === 390 ? 'mobile.png' : 'desktop.png')), Buffer.from(data, 'base64'));
    }
    console.log(`PASS ${width}px: no horizontal overflow; sections, assets and booking links valid.`);
  }
  const links = await evaluate('[...document.querySelectorAll("[href], [src]")].map(e => e.getAttribute("href") || e.getAttribute("src"))');
  if (compareFooter && page === 'index.html') writeFileSync('.qa/footer-reference.json', JSON.stringify(footerSnapshots, null, 2));
  if (compareFooter) console.log('PASS shared footer styles, dimensions, typography, colours and spacing at all tested widths.');
  for (const link of links) {
    if (/^(https?:|tel:|#)/.test(link)) continue;
    assert(existsSync(resolve(decodeURIComponent(link.split(/[?#]/)[0]))), 'Missing local file: ' + link);
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  assert(!/<style\b|style=|<script(?![^>]*src=)/i.test(readFileSync(page, 'utf8')));
  console.log('PASS mobile menu, Escape focus, outside-click dismissal, local links, separate styles/scripts, no JS exceptions.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  try { await send('Browser.close'); } catch {}
  browser.kill();
});
