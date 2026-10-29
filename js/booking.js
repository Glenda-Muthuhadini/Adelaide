'use strict';
(async () => {
  const form=document.querySelector('#customer-booking'),e=form.elements;
  const message=document.querySelector('#booking-message'),review=document.querySelector('#booking-review');
  const availability=document.querySelector('#availability-message'),reviewMessage=document.querySelector('#booking-review-message');
  const reviewButton=document.querySelector('#review-booking'),submitButton=document.querySelector('#submit-booking'),checkButton=document.querySelector('#check-times');
  const details=document.querySelector('#booking-details'),step=document.querySelector('#booking-step');
  const embedded=new URLSearchParams(location.search).get('embed')==='1'&&window.parent!==window;
  const parentState=(locked=false)=>{if(embedded)parent.postMessage({type:'spa:booking-state',locked},location.origin);};
  let catalogue,quote,reviewedPayload,requestId=crypto.randomUUID(),version=0,availabilityVersion=0,busy=false,timer,submissionControls=null;
  const say=text=>{message.textContent=text;};
  const availableSay=text=>{availability.textContent=text;};
  const offer=()=>catalogue?.promotions?.find(p=>'offer:'+p.id===e.service.value);
  const selection=()=>({...(offer()?{promotion_id:offer().id,rate:Number(e.option.value)}:{option_id:e.option.value}),addons:[...document.querySelectorAll('[data-addon]:checked')].map(input=>({id:input.dataset.addon,rate:Number(document.querySelector('[data-addon-rate="'+input.dataset.addon+'"]').value)}))});
  const args=()=>({p_selection:selection(),p_date:e.date.value,p_time:e.time.value,p_people:Number(e.people.value)});
  function invalidate(){version++;quote=null;reviewedPayload=null;review.hidden=true;details.hidden=false;step.textContent='Step 1 of 2 · Your visit';reviewMessage.textContent='';reviewButton.disabled=!e.time.value;}
  function clearTimes(){availabilityVersion++;invalidate();e.time.innerHTML='<option value="">Choose a treatment and date</option>';e.time.disabled=true;reviewButton.disabled=true;}
  function validVisit(){return Boolean(e.option.value&&e.date.value&&e.date.checkValidity()&&e.people.value&&e.people.checkValidity());}
  function queueTimes(){clearTimeout(timer);clearTimes();if(validVisit())timer=setTimeout(()=>times(),200);else availableSay('Choose a treatment, number of people and date to see available starting times.');}
  function options(){
    const promotion=offer();
    document.querySelector('#customer-booking-title').textContent=promotion?.name||catalogue.services.find(s=>s.id===e.service.value)?.name||'Book your moment of calm';
    const selected=catalogue.options.filter(o=>o.service_id===e.service.value);
    const firstGroup=promotion?.pricing.findIndex(r=>r.option_id&&r.kind==='fixed'&&r.group_bundle);
    const rates=promotion?.pricing.map((r,index)=>({...r,index})).filter(r=>r.option_id&&r.kind==='fixed'&&(!r.group_bundle||r.index===firstGroup))||[];
    e.option.innerHTML=promotion?rates.map(r=>'<option value="'+r.index+'">'+Spa.escape(r.group_bundle?(catalogue.options.find(o=>o.id===r.option_id)?.duration||'')+'-minute group experience · price based on your group size':r.label+' · '+Spa.money(r.price_cents)+({per_couple:' per couple',per_person:' per person'}[r.unit]||''))+'</option>').join(''):selected.map(o=>'<option value="'+o.id+'">'+o.duration+' minutes · '+Spa.money(o.price_cents)+(o.price_people===2?' per couple':' per person')+'</option>').join('');
    const available=promotion?rates.length:selected.length;
    e.option.selectedIndex=available?0:-1;
    document.querySelector('#booking-option-label').hidden=available<=1;
    document.querySelector('#booking-fixed-treatment').hidden=available!==1;
    const fixed=available===1?e.option.options[0]:null;
    const fixedOption=promotion?catalogue.options.find(o=>o.id===rates[0]?.option_id):selected[0];
    document.querySelector('#booking-single-option').textContent=fixed?((promotion&&!rates[0].group_bundle?fixedOption?.duration+' minutes · ':'')+fixed.textContent):'';
    document.querySelector('#duration-enquiry').hidden=!e.service.value||available>0;
    document.querySelector('#treatment-inclusions').textContent=(promotion?.inclusions||catalogue.services.find(s=>s.id===e.service.value)?.inclusions||[]).join(' · ');
    checkButton.disabled=!available;
    const addons=catalogue.addons.filter(a=>promotion?a.promotion_ids.includes(promotion.id):a.service_ids.includes(e.service.value));
    const target=document.querySelector('#customer-addons');target.hidden=!addons.length;
    const basis={per_person:' per person',per_couple:' per couple',per_group:' per group',flat:' for this booking'};
    target.innerHTML='<h3>Make it your own</h3><p>Optional add-ons within your treatment time.</p><div class="customer-addon-list">'+addons.map(a=>{
      const prices=a.pricing.length?a.pricing:[{label:'Price',price_cents:a.price_cents,unit:'flat'}];
      return '<div class="customer-addon"><label><input type="checkbox" data-addon="'+a.id+'">'+Spa.escape(a.name)+'</label><select aria-label="'+Spa.escape(a.name)+' option and price" data-addon-rate="'+a.id+'">'+prices.map((p,index)=>'<option value="'+index+'">'+Spa.escape(p.label)+' · '+Spa.money(p.price_cents)+Spa.escape(basis[p.unit]||'')+'</option>').join('')+'</select></div>';
    }).join('')+'</div>';
    adjustPeople();
    queueTimes();
  }
  function adjustPeople(){
    const promotion=offer(),rate=promotion?.pricing[Number(e.option.value)],option=catalogue.options.find(o=>o.id===(promotion?rate?.option_id:e.option.value));
    const pair=option?.price_people===2||rate?.unit==='per_couple';
    e.people.min=pair?'2':'1';e.people.step=pair?'2':'1';e.people.max=rate?.unit==='flat'&&!rate.group_bundle?String(rate.group_people||1):'192';
    if(Number(e.people.value)<Number(e.people.min)||Number(e.people.value)>Number(e.people.max)||pair&&Number(e.people.value)%2)e.people.value=e.people.min;
  }
  async function times({notice='',preferred=''}={}){
    clearTimeout(timer);
    if(!validVisit()){clearTimes();availableSay('Choose a valid treatment, group size and date.');return;}
    const selected=catalogue.options.find(o=>o.id===e.option.value);
    if(selected&&Number(e.people.value)%selected.price_people!==0){clearTimes();availableSay('This couples option requires an even number of people. Change the group size or choose another service.');return;}
    const oldTime=preferred||e.time.value;clearTimes();const current=availabilityVersion;
    checkButton.disabled=true;availableSay((notice?notice+' ':'')+'Checking the full treatment and group schedule…');
    try{
      const slots=await Spa.rpc('spa_customer_availability',{p_selection:selection(),p_date:e.date.value,p_people:Number(e.people.value)});
      if(current!==availabilityVersion)return;
      e.time.innerHTML='<option value="">Choose a starting time</option>'+slots.map(s=>'<option>'+s.time+'</option>').join('');
      e.time.disabled=!slots.length;
      if(oldTime&&slots.some(s=>s.time===oldTime))e.time.value=oldTime;
      reviewButton.disabled=!e.time.value;
      const result=!slots.length?'No appointments fit this date, duration and group size. Choose another date, service or duration, or change the number of people.':oldTime&&!e.time.value?'Your previous starting time is no longer available. Choose another time or date.':'';
      availableSay((notice?notice+' ':'')+result);
    }catch(error){if(current===availabilityVersion)availableSay((notice?notice+' ':'')+error.message+' Try refreshing the available times.');}
    finally{if(current===availabilityVersion)checkButton.disabled=!e.option.value;}
  }
  async function recoverAvailability(error){
    invalidate();requestId=crypto.randomUUID();
    say(error.message+' Choose another available time or date.');
    await times({notice:error.message});
    if(e.time.disabled)e.date.focus();else e.time.focus();
  }
  form.addEventListener('input',event=>{
    if(submissionControls)return;
    if(['date','people'].includes(event.target.name)||event.target.matches('[data-addon],[data-addon-rate]'))queueTimes();else invalidate();
  });
  e.service.addEventListener('change',options);e.option.addEventListener('change',()=>{adjustPeople();queueTimes();});
  checkButton.addEventListener('click',()=>times());
  document.querySelector('#edit-booking').addEventListener('click',()=>{invalidate();e.service.focus();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!form.reportValidity()||!e.time.value)return;
    busy=true;const current=version,selectedArgs=args();
    const contact={p_name:e.customer.value.trim(),p_phone:e.phone.value.trim(),p_email:e.email.value.trim()};
    reviewButton.disabled=true;say('Checking your chosen schedule before review…');
    try{
      const next=await Spa.rpc('spa_customer_quote',selectedArgs);
      if(current!==version)return;
      quote=next;reviewedPayload={...selectedArgs,...contact,p_quote:next.quote};
      document.querySelector('#review-schedule').innerHTML=Spa.schedule(quote);
      document.querySelector('#review-contact').textContent=contact.p_name+' · '+contact.p_phone+' · '+contact.p_email;
      reviewMessage.textContent='';submitButton.textContent='Confirm booking';
      details.hidden=true;review.hidden=false;step.textContent='Step 2 of 2 · Review & confirm';document.querySelector('#review-title').focus();window.scrollTo(0,0);say('');
    }catch(error){
      if(current!==version)return;
      busy=false;
      if(error.status>=400&&error.status<500)await recoverAvailability(error);
      else say(error.message+' Your booking has not been submitted. Please try checking again.');
    }finally{busy=false;reviewButton.disabled=!e.time.value;}
  });
  submitButton.addEventListener('click',async()=>{
    if(!quote||!reviewedPayload||busy)return;
    clearTimeout(timer);busy=true;
    const acceptedQuote=quote,payload={...reviewedPayload,p_request:requestId};
    if(!submissionControls)submissionControls=[...form.querySelectorAll('input,select,button')].map(el=>({el,disabled:el.disabled}));
    const controls=submissionControls;
    controls.forEach(({el})=>el.disabled=true);parentState(true);submitButton.textContent='Confirming…';reviewMessage.textContent='Checking availability and confirming your appointment…';say('Confirming your booking…');
    try{
      const receipt=await Spa.rpc('spa_customer_submit',payload);
      submissionControls=null;
      form.hidden=true;
      const success=document.querySelector('#booking-success');success.hidden=false;
      const confirmed=receipt.status==='confirmed';
      success.innerHTML='<h2>'+(confirmed?'Booking confirmed':'Booking update')+'</h2><p>Your reference: <strong>'+Spa.escape(receipt.reference)+'</strong></p><p><strong>'+(confirmed?'Your appointment is confirmed.':Spa.escape(receipt.status))+'</strong> '+(confirmed?'Your spaces are reserved for the complete schedule below.':'Contact the spa with your reference before making another booking.')+'</p>'+Spa.schedule(acceptedQuote)+'<p>For changes, contact <a href="tel:+27673030683">067 303 0683</a> with your reference.</p>';
      step.textContent='Your appointment is booked';
      parentState(false);
      success.focus();say(confirmed?'Your booking is confirmed. Keep your reference for any changes.':'Keep your reference and contact the spa for help.');
      if(confirmed){const whatsapp=new URL('https://wa.me/27673030683');whatsapp.searchParams.set('text','Hello Adelaide Wellness & Spa! My booking reference is '+receipt.reference+'. I?d like to keep in touch about your specials.');if(embedded)parent.postMessage({type:'spa:booking-state',locked:false,whatsapp:whatsapp.href},location.origin);else SpaBookingFollowup.open(whatsapp.href);}
    }catch(error){
      if(error.status>=400&&error.status<500){
        controls.forEach(({el,disabled})=>el.disabled=disabled);parentState(false);submissionControls=null;busy=false;submitButton.textContent='Confirm booking';
        if(error.code==='P0001')await recoverAvailability(error);
        else {invalidate();say(error.message+' Check your details before reviewing again.');}
      }else{
        // The server may already have committed. Retry the same immutable payload and ID.
        submitButton.disabled=false;submitButton.textContent='Retry confirmation';
        reviewMessage.textContent='The connection was interrupted. Retry confirmation to check this same booking safely before changing any details.';
        say(reviewMessage.textContent);
      }
    }finally{busy=false;}
  });
  try{
    catalogue=await Spa.rpc('spa_customer_catalogue');
    e.service.innerHTML='<option value="">Choose your treatment</option><optgroup label="Treatments">'+catalogue.services.map(s=>'<option value="'+s.id+'">'+Spa.escape(s.name)+'</option>').join('')+'</optgroup><optgroup label="Specials & offers">'+catalogue.promotions.map(p=>'<option value="offer:'+p.id+'">'+Spa.escape(p.name)+'</option>').join('')+'</optgroup>';
    const requested=new URLSearchParams(location.search).get('service');
    const aliases={facials:'Signature Facial',reflexology:'Reflexology Massage'};
    const match=catalogue.services.find(s=>s.name.toLowerCase()===(aliases[requested?.toLowerCase()]||requested)?.toLowerCase());if(match)e.service.value=match.id;
    const requestedOffer=new URLSearchParams(location.search).get('offer'),promo=catalogue.promotions.find(p=>p.name.toLowerCase()===requestedOffer?.toLowerCase());if(promo)e.service.value='offer:'+promo.id;
    if(match||promo)document.querySelector('#customer-booking-title').textContent=match?.name||promo.name;
    e.date.min=Spa.date(Date.now());e.date.max=Spa.date(Date.now()+365*86400000);
    options();form.hidden=false;say('');
  }catch(error){say('Booking is temporarily unavailable. '+error.message+' Call 067 303 0683 for assistance.');}
})();
