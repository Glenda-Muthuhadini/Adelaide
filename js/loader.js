'use strict';
(() => {
  const root = document.documentElement;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let dismissed = false;
  root.classList.add('loader-active');

  function dismiss(immediate = false) {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(fallback);
    const loader = document.getElementById('page-loader');
    if (!loader) { root.classList.remove('loader-active'); return; }
    loader.classList.add('loader-hidden');
    const remove = () => { loader.remove(); root.classList.remove('loader-active'); };
    if (immediate || reducedMotion()) remove();
    else setTimeout(remove, 500);
  }

  // A slow or failed resource must never leave the website behind an overlay.
  const fallback = setTimeout(() => dismiss(true), 10000);
  const loaded = () => {
    if(document.body?.matches('.auth-page,.dashboard-page')){dismiss(true);return;}
    setTimeout(() => dismiss(), reducedMotion() ? 0 : 300);
  };
  if (document.readyState === 'complete') loaded();
  else window.addEventListener('load', loaded, { once: true });
  window.addEventListener('pageshow', event => { if (event.persisted) dismiss(true); });
})();
