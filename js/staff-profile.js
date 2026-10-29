'use strict';
(() => {
  const header=document.querySelector('.site-header,.booking-header');
  if(!header||!window.Spa)return;
  let version=0;
  function hide() {version++;header.querySelector('.staff-profile-link')?.remove();}
  async function update() {
    hide();const current=version;
    const identity=await Spa.staffIdentity();
    if(current!==version||!identity||!['owner','admin'].includes(identity.role))return;
    const link=document.createElement('a');
    link.className='staff-profile-link';link.href='admin-dashboard.html';
    link.setAttribute('aria-label','Return to staff dashboard');
    link.title='Dashboard · '+(identity.name||'Staff');
    link.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/><circle cx="12" cy="12" r="10"/></svg>';
    const menu=header.querySelector('.menu-toggle');
    if(menu)header.insertBefore(link,menu);else header.append(link);
  }
  update();
  window.addEventListener('pageshow',update);
  window.addEventListener('pagehide',hide);
  window.addEventListener('focus',update);
  window.addEventListener('spa:session-changed',update);
  document.addEventListener('visibilitychange',()=>document.hidden?hide():update());
  setInterval(()=>{if(!document.hidden)update();},60000);
})();
