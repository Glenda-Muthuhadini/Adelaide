'use strict';
(() => {
  const dialog=document.createElement('dialog');
  dialog.className='customer-booking-dialog';dialog.setAttribute('aria-labelledby','customer-booking-title');
  dialog.innerHTML='<div class="customer-booking-heading"><div><p>Adelaide Wellness &amp; Spa</p><h2 id="customer-booking-title">Book your appointment</h2></div><button type="button" aria-label="Close booking">×</button></div><iframe title="Book an Adelaide spa appointment"></iframe>';
  document.body.append(dialog);
  const frame=dialog.querySelector('iframe'),close=dialog.querySelector('button');
  let locked=false,lastUrl='',trigger;
  function dismiss(){if(!locked)dialog.close();}
  close.addEventListener('click',dismiss);
  dialog.addEventListener('cancel',event=>{if(locked)event.preventDefault();});
  dialog.addEventListener('close',()=>{document.body.classList.remove('booking-modal-open');trigger?.focus();});
  window.addEventListener('message',event=>{
    if(event.source!==frame.contentWindow||event.origin!==location.origin||event.data?.type!=='spa:booking-state')return;
    locked=event.data.locked===true;close.disabled=locked;
    if(event.data.whatsapp&&!locked)SpaBookingFollowup.open(event.data.whatsapp);
    if(event.data.close&&!locked)dismiss();
  });
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href]');if(!link||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const url=new URL(link.href,location.href);
    if(url.origin!==location.origin||!url.pathname.endsWith('/booking.html'))return;
    if(typeof dialog.showModal!=='function')return;
    event.preventDefault();trigger=link;url.searchParams.set('embed','1');
    if(url.href!==lastUrl){frame.src=url.href;lastUrl=url.href;locked=false;close.disabled=false;}
    document.body.classList.add('booking-modal-open');dialog.showModal();
  });
})();
