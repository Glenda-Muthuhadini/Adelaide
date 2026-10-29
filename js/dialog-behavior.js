'use strict';
(() => {
  let outsideTarget;
  const outside=(dialog,event)=>{const r=dialog.getBoundingClientRect();return event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom;};
  document.addEventListener('pointerdown',event=>{outsideTarget=event.target instanceof HTMLDialogElement&&outside(event.target,event)?event.target:null;});
  document.addEventListener('click',event=>{
    const dialog=outsideTarget;outsideTarget=null;
    if(!dialog?.open||event.target!==dialog||!outside(dialog,event))return;
    if(dialog.dispatchEvent(new Event('cancel',{cancelable:true})))dialog.close();
  });
  window.SpaBookingFollowup={open(href){
    const url=new URL(href);if(url.origin!=='https://wa.me'||url.pathname!=='/27673030683')return;
    let dialog=document.querySelector('#booking-followup');
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='booking-followup';dialog.className='booking-followup';dialog.setAttribute('aria-labelledby','booking-followup-title');
      dialog.innerHTML='<button class="followup-close" type="button" aria-label="Close keep in touch">×</button><div class="followup-check" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="m10 24 9 9 20-21"/></svg></div><p class="followup-eyebrow">Your booking is <strong>confirmed</strong></p><h2 id="booking-followup-title">Keep in touch</h2><p class="followup-copy">Save <strong>067 303 0683</strong> as Adelaide Wellness &amp; Spa, then say hello on WhatsApp to keep up with our specials and updates.</p><a class="button button-dark" target="_blank" rel="noopener noreferrer"><svg class="followup-whatsapp" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.6a8.6 8.6 0 0 1-12.7 7.6L3 21l1.7-4.7A8.6 8.6 0 1 1 20.5 11.6Z"/><path d="m8.1 7.3 1.6 2.5-1 1.2c.9 1.8 2.3 3.1 4.2 3.9l1.1-1.1 2.5 1.4c-.3 2-1.6 2.3-3.1 1.8-3.9-1.2-6.2-3.7-7-6.8-.4-1.4.2-2.6 1.7-2.9Z"/></svg><span>Open WhatsApp</span><svg class="followup-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg></a><button type="button" class="whatsapp-skip">Maybe later</button><div class="followup-bottom" aria-hidden="true"></div>';
      document.body.append(dialog);dialog.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>dialog.close()));
    }
    dialog.querySelector('a').href=url.href;
    if(!dialog.open)dialog.showModal();
  }};
})();
