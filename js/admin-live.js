'use strict';
(async () => {
  const $=s=>document.querySelector(s), esc=Spa.escape;
  const today=()=>Spa.date(Date.now());
  let data, selected=today(),section='Dashboard',user,editing,preview,requestId,formVersion=0;
  const stateNames={pending:'Pending confirmation',confirmed:'Confirmed',completed:'Completed',cancelled:'Cancelled',rejected:'Rejected',expired:'Expired'};
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dialog=$('#appointment-dialog'),detail=$('#appointment-detail'),form=$('#appointment-form');
  const reviewDialog=$('#booking-review-dialog');
  let reviewedBooking=null,reviewBusy=false;
  let appointmentQuery='';
  let profileNameDraft=null;
  function showActionError(text){
    const container=reviewDialog.open?document.querySelector('#staff-review-error'):dialog.open?(form.hidden?detail:form):document.querySelector(section==='Dashboard'?'#dashboard-view':'#module-view');
    if(container.id==='staff-review-error'){container.textContent=text;container.focus();return;}
    let message=container.querySelector('[data-action-error]');
    if(!message){message=document.createElement('p');message.dataset.actionError='';message.className='live-error';message.setAttribute('role','alert');container.prepend(message);}
    message.textContent=text;
  }
  function deny(error){data=null;reviewedBooking=null;document.body.classList.add('admin-loading');const overlay=$('#admin-access-message');overlay.hidden=false;overlay.replaceChildren();const p=document.createElement('p');p.textContent=error.message;const a=document.createElement('a');a.href='admin-login.html';a.textContent='Go to admin sign in';overlay.append(p,a);dialog.close();reviewDialog.close();}
  async function load(){
    try{data=await Spa.rpc('spa_admin_data',{},true);render();}
    catch(error){deny(error);throw error;}
  }
  const active=b=>['pending','confirmed','completed'].includes(b.status);
  function rows(date=selected){return data.bookings.flatMap(b=>b.sessions.filter(s=>Spa.date(s.starts_at)===date).map(s=>({...s,booking:b}))).sort((a,b)=>a.starts_at.localeCompare(b.starts_at));}
  function badge(b){return '<span class="status status-'+esc(b.status)+'">'+esc(stateNames[b.status])+'</span>';}
  function list(listRows){return listRows.length?listRows.map(s=>'<div class="appointment-row"><time class="appointment-time">'+Spa.time(s.starts_at)+'</time><div class="appointment-info"><div><button class="appointment-name" data-detail="'+s.booking.id+'">'+esc(s.booking.customer_name)+'</button><small class="appointment-service">'+esc(s.booking.service_name)+' · '+s.people+' people · '+Spa.time(s.starts_at)+'–'+Spa.time(s.ends_at)+'</small></div>'+badge(s.booking)+'</div></div>').join(''):'<p class="empty-state">No appointments for this date.</p>';}
  function table(headers,body){return '<div class="table-scroll"><table class="data-table"><thead><tr>'+headers.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+body.map(r=>'<tr>'+r.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
  function occupancy(){
    const hrs=data.hours.find(h=>h.weekday===new Date(selected+'T12:00:00').getDay());
    if(!hrs||hrs.closed)return '<p>The spa is closed on this date.</p>';
    const sessions=rows().filter(s=>active(s.booking));let html='<div class="occupancy-list">';
    for(let n=hrs.opens;n<hrs.closes;n+=30){
      const time=String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
      const start=new Date(selected+'T'+time+':00+02:00').getTime(),end=start+1800000;
      const used=sessions.filter(s=>new Date(s.starts_at).getTime()<end&&new Date(s.reserved_until).getTime()>start);
      html+='<article><strong>'+time+' · '+used.reduce((sum,s)=>sum+s.people,0)+' of 4 spa spaces booked</strong>'+[...new Set(used.map(s=>s.booking.service_name))].map(name=>'<p>'+esc(name)+': '+used.filter(s=>s.booking.service_name===name).reduce((sum,s)=>sum+s.people,0)+' of 4</p>').join('')+'</article>';
    }return html+'</div>';
  }
  function render(){
    if(!data)return;
    $('#dashboard-date').value=selected;
    const r=rows(),bookings=[...new Map(r.map(s=>[s.booking.id,s.booking])).values()];
    $('#stat-total').textContent=bookings.length;$('#stat-walkin').textContent=bookings.filter(b=>b.source==='walkin').length;
    $('#stat-completed').textContent=bookings.filter(b=>b.status==='completed').length;$('#stat-cancelled').textContent=bookings.filter(b=>['cancelled','rejected','expired'].includes(b.status)).length;
    $('#appointment-list').innerHTML=list(r.filter(s=>['pending','confirmed'].includes(s.booking.status)));
    const dashboard=section==='Dashboard';
    $('#dashboard-view').hidden=!dashboard;$('#module-view').hidden=dashboard;
    const name=viewerName(),avatar=$('.account-button');
    avatar.textContent=profileInitials(name);avatar.title=name+' · Profile settings';avatar.setAttribute('aria-label','Profile settings for '+name);
    $('#page-title').textContent=section==='Dashboard'?(data.viewer_display_name?'Welcome, '+name:'Welcome to Adelaide'):section;
    if(!dashboard)renderModule();
  }
  function serviceOptions(all=false){return data.services.filter(s=>all||s.active).map(s=>'<option value="'+s.id+'">'+esc(s.name)+'</option>').join('');}
  const catalogue=SpaCatalogue.create({getData:()=>data,refresh:load,table});
  const reports=SpaReports.create({getData:()=>data,refresh:load,table});
  function renderModule(){
    const catalogueHtml=catalogue.render(section);
    if(catalogueHtml!==null){$('#module-view').innerHTML=catalogueHtml;return;}
    let html='';
    if(section==='Appointments')html='<section class="appointments-module"><div class="module-toolbar"><h2>Appointments</h2><button class="button button-dark" data-create="new">Add appointment</button></div><div class="appointment-search"><label for="live-search">Search appointments</label><div class="appointment-search-field"><svg class="appointment-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input type="search" id="live-search" placeholder="Name, reference, email or phone" aria-describedby="appointment-search-status" autocomplete="off" value="'+esc(appointmentQuery)+'"><button class="appointment-search-clear" type="button" data-clear-appointment-search aria-label="Clear appointment search" '+(appointmentQuery?'':'hidden')+'>×</button></div><p id="appointment-search-status" role="status">'+appointmentSearchStatus()+'</p></div><div id="booking-results">'+appointmentSearchResults()+'</div></section>';
    else if(section==='Clients')html='<h2>Customer records</h2>'+table(['Name','Phone','Email','Reference'],data.bookings.map(b=>[esc(b.customer_name),esc(b.phone),esc(b.email),'<button data-detail="'+b.id+'">'+esc(b.reference)+'</button>']));
    else if(section==='Availability')html='<h2>Occupancy and availability</h2><p>Four people maximum across all services. Preparation time also reserves spaces. Select a date above to inspect occupancy.</p>'+occupancy()+'<h3>Reservation settings</h3><form class="live-form" data-save="settings"><label>Pending hold (minutes)<input name="pending_minutes" type="number" min="5" max="1440" required value="'+data.settings.pending_minutes+'"></label><label>Default preparation time<select name="preparation_minutes">'+[0,30,60,90,120].map(n=>'<option '+(n===data.settings.preparation_minutes?'selected':'')+' value="'+n+'">'+n+' minutes</option>').join('')+'</select></label><button>Save settings</button></form><p>Preparation is provisionally set to zero. Changes affect new reservations; existing schedules retain their reserved preparation time.</p><h3>Operating hours</h3>'+data.hours.map(h=>'<form class="live-form" data-save="hours"><input type="hidden" name="weekday" value="'+h.weekday+'"><label>'+days[h.weekday]+' opens<input type="time" name="opens" step="1800" required value="'+minuteTime(h.opens)+'"></label><label>Closes<input type="time" name="closes" step="1800" required value="'+minuteTime(h.closes)+'"></label><label>Closed<select name="closed"><option value="false" '+(!h.closed?'selected':'')+'>No</option><option value="true" '+(h.closed?'selected':'')+'>Yes</option></select></label><button>Save '+days[h.weekday]+'</button></form>').join('')+'<h3>Blocked times</h3><form class="live-form" data-save="block"><label>Service<select name="service_id"><option value="">All services</option>'+serviceOptions(true)+'</select></label><label>Reason<input name="reason" maxlength="300"></label><label>From (South African time)<input type="datetime-local" name="starts_at" step="1800" required></label><label>Until<input type="datetime-local" name="ends_at" step="1800" required></label><button>Add blocked time</button></form>'+data.blocks.map(b=>'<p>'+Spa.date(b.starts_at)+' '+Spa.time(b.starts_at)+'–'+Spa.date(b.ends_at)+' '+Spa.time(b.ends_at)+' · '+esc(b.reason)+' <button data-unblock="'+b.id+'">Remove block</button></p>').join('');
    else if(section==='Reports')html=reports.render();
    else html=profileSettings();
    $('#module-view').innerHTML=html;
  }
  function minuteTime(n){return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
  function viewerName(){return data.viewer_name||(data.staff||[]).find(s=>s.id===data.viewer_id||s.email===user.email)?.name||(data.viewer_role==='owner'?'Owner':'Staff');}
  function profileInitials(name){const words=String(name).trim().split(/\s+/).filter(Boolean),parts=words.length>1?[words[0],words.at(-1)]:words;return parts.map(word=>Array.from(word)[0]).join('').toLocaleUpperCase('en-ZA')||'AD';}
  function profileSettings(){
    const name=viewerName(),role=data.viewer_role==='owner'?'Owner':'Staff',value=profileNameDraft??data.viewer_display_name??'';
    return '<section class="profile-settings"><div class="module-toolbar"><h2>Profile settings</h2><span class="status status-confirmed">'+role+'</span></div><div class="profile-summary"><span class="profile-avatar" aria-hidden="true">'+esc(profileInitials(name))+'</span><div><h3>'+esc(name)+'</h3><p>'+esc(user.email)+'</p></div></div><article class="profile-panel"><h3>Display name</h3><p class="profile-hint">Choose the name shown on your profile, in the Staff table and in reports.</p><form class="live-form" id="profile-name-form"><label class="wide" for="profile-display-name">Your name<input id="profile-display-name" name="display_name" required maxlength="100" autocomplete="name" placeholder="Enter your full name" value="'+esc(value)+'"></label><p id="profile-name-error" class="live-error wide" role="alert"></p><div class="live-actions wide"><button class="button button-dark" type="submit">Save name</button><p id="profile-save-status" role="status" aria-live="polite"></p></div></form></article><article class="profile-panel"><h3>Sign-in details</h3><p class="profile-hint">'+esc(user.email)+' · '+role+' account</p><form class="live-form" id="change-password-form"><label>New password<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><label>Confirm new password<input name="confirmation" type="password" autocomplete="new-password" required></label><button class="button button-dark" type="submit">Change password and sign out</button></form><a class="profile-recovery-link" href="admin-forgot-password.html">Request a password reset email</a></article></section>';
  }
  function appointmentMatches(){const query=appointmentQuery.trim().toLowerCase();return data.bookings.filter(b=>[b.customer_name,b.phone,b.email,b.reference,b.service_name].some(value=>String(value||'').toLowerCase().includes(query)));}
  function appointmentSearchStatus(){const count=appointmentMatches().length,total=data.bookings.length;return appointmentQuery.trim()?count+' of '+total+' appointments match your search':total+' '+(total===1?'appointment':'appointments');}
  function appointmentSearchResults(){const matches=appointmentMatches();return matches.length?bookingTable(matches):'<p class="empty-state">'+(appointmentQuery.trim()?'No matching appointments. Try another name, reference, email or phone number.':'No appointments yet. Add an appointment to get started.')+'</p>';}
  function updateAppointmentSearch(){const field=$('#live-search');if(!field)return;appointmentQuery=field.value;$('#booking-results').innerHTML=appointmentSearchResults();$('#appointment-search-status').textContent=appointmentSearchStatus();$('[data-clear-appointment-search]').hidden=!appointmentQuery;}
  function bookingTable(bookings){return table(['Reference','Customer','Service','People','Total','Status',''],bookings.map(b=>[esc(b.reference),esc(b.customer_name),esc(b.service_name)+' · '+b.duration+' min',b.people,Spa.money(b.total_cents),badge(b),'<button data-detail="'+b.id+'">Manage</button>']));}
  function openDetail(id){
    const b=data.bookings.find(b=>b.id===id);if(!b)return;editing=b;preview=null;
    form.hidden=true;detail.hidden=false;$('#dialog-title').textContent=b.customer_name;
    detail.innerHTML='<p><strong>'+esc(b.reference)+'</strong> · '+badge(b)+'</p><p>'+esc(b.phone)+' · '+esc(b.email)+' · '+esc(b.source)+'</p>'+Spa.schedule({...b.booking_details,service:b.service_name,duration:b.duration,people:b.people,total_cents:b.total_cents,sessions:b.sessions,preparation_minutes:b.booking_details?.preparation_minutes||0})+(b.status==='pending'?'<p>Pending spaces held until '+Spa.date(b.hold_until)+' '+Spa.time(b.hold_until)+'.</p>':'')+'<div class="live-actions">'+(b.status==='pending'?['confirmed','rejected','cancelled']:b.status==='confirmed'?['cancelled','completed']:[]).map(status=>'<button data-status="'+status+'">'+({confirmed:'Confirm request',rejected:'Reject request',cancelled:'Cancel appointment',completed:'Mark completed'}[status])+'</button>').join('')+'</div><form class="live-form" data-save="notes"><input type="hidden" name="id" value="'+b.id+'"><label class="wide">Private notes<textarea name="notes" maxlength="5000">'+esc(b.notes||'')+'</textarea></label><button>Save private notes</button></form>'+(['pending','confirmed'].includes(b.status)?'<h3>Reschedule the whole booking</h3><form class="live-form" id="reschedule-form"><label>New date<input name="date" type="date" min="'+today()+'" required></label><label>New start time<input name="time" type="time" step="1800" required></label><button>Review new schedule</button></form><div id="reschedule-review" hidden></div>':'');
    if(!dialog.open)dialog.showModal();
  }
  function openCreate(type){
    editing=null;preview=null;reviewedBooking=null;reviewDialog.close();requestId=crypto.randomUUID();formVersion++;
    form.hidden=false;detail.hidden=true;$('#dialog-title').textContent='Add an appointment';
    form.innerHTML='<p class="dialog-eyebrow">Step 1 of 2</p><p class="dialog-intro">Check the complete schedule before reserving spaces.</p><div class="live-form"><label>Client name<input name="customer" required maxlength="100" autocomplete="name"></label><label>Phone<input name="phone" type="tel" required minlength="6" maxlength="30" autocomplete="tel"></label><label>Email<input name="email" type="email" required maxlength="254" autocomplete="email"></label><label>Source<select name="source"><option value="telephone">Telephone</option><option value="whatsapp">WhatsApp</option><option value="walkin" '+(type==='walkin'?'selected':'')+'>Walk-in</option></select></label><label class="wide">Service and duration<select name="option">'+data.options.filter(o=>o.active&&data.services.find(s=>s.id===o.service_id)?.active).map(o=>'<option value="'+o.id+'">'+esc(data.services.find(s=>s.id===o.service_id).name)+' · '+o.duration+' min · '+Spa.money(o.price_cents)+(o.price_people===2?' per couple':' per person')+'</option>').join('')+'</select></label><label>People<input name="people" type="number" min="1" max="192" value="1" required></label><label>Date<input name="date" type="date" min="'+today()+'" value="'+selected+'" required></label><label>Start time<input name="time" type="time" step="1800" value="10:00" required></label></div><p id="admin-booking-error" class="live-error" role="alert"></p><button class="button button-dark" type="submit">Review schedule and price</button>';
    dialog.showModal();
  }
  const bookingArgs=()=>({p_option:form.elements.option.value,p_date:form.elements.date.value,p_time:form.elements.time.value,p_people:Number(form.elements.people.value)});
  function showBookingReview(q,payload){
    reviewedBooking={...payload,p_quote:q.quote};
    $('#staff-review-error').textContent='';
    $('#staff-booking-review').innerHTML='<p class="dialog-note">Check the client details and every treatment session before confirming.</p><dl class="staff-review-contact"><dt>Client</dt><dd>'+esc(payload.p_name)+'</dd><dt>Phone</dt><dd>'+esc(payload.p_phone)+'</dd><dt>Email</dt><dd>'+esc(payload.p_email)+'</dd><dt>Booking source</dt><dd>'+esc({telephone:'Telephone',whatsapp:'WhatsApp',walkin:'Walk-in'}[payload.p_source])+'</dd></dl>'+Spa.schedule(q)+'<p class="dialog-note">All times are South African time. Confirming schedules this appointment immediately.</p>';
    dialog.close();reviewDialog.showModal();reviewDialog.scrollTop=0;
    $('#booking-review-title').focus({preventScroll:true});
  }
  function backToBooking(){
    if(reviewBusy)return;
    reviewedBooking=null;preview=null;formVersion++;
    reviewDialog.close();dialog.showModal();form.elements.customer.focus();
  }
  reviewDialog.addEventListener('cancel',event=>{event.preventDefault();backToBooking();});
  async function change(action,payload){await Spa.rpc('spa_admin_change',{p_action:action,p_data:payload},true);await load();}
  function closeSidebar(){const open=$('#sidebar').classList.contains('is-open');$('#sidebar').classList.remove('is-open');$('#sidebar').inert=innerWidth<=900;$('.sidebar-backdrop').hidden=true;$('.sidebar-toggle').setAttribute('aria-expanded','false');if(open)$('.sidebar-toggle').focus();}
  document.addEventListener('click',async event=>{
    const button=event.target.closest('button,a');if(!button)return;
    try{
      if(button.matches('.sidebar-logout')){event.preventDefault();await Spa.logout();data=null;location.replace('admin-login.html');return;}
      if(!data)return;
      if(button.dataset.section){section=button.dataset.section;document.querySelectorAll('.dashboard-navigation button').forEach(b=>b.removeAttribute('aria-current'));button.setAttribute('aria-current','page');closeSidebar();render();}
      else if(button.hasAttribute('data-create'))openCreate(button.dataset.create);
      else if(button.dataset.detail)openDetail(button.dataset.detail);
      else if(button.hasAttribute('data-clear-appointment-search')){$('#live-search').value='';updateAppointmentSearch();$('#live-search').focus();}
      else if(button.hasAttribute('data-back-booking'))backToBooking();
      else if(button.dataset.status){button.disabled=true;await change('status',{id:editing.id,status:button.dataset.status});openDetail(editing.id);}
      else if(button.dataset.unblock){button.disabled=true;await change('unblock',{id:button.dataset.unblock});}
      else if(button.id==='admin-submit-booking'){
        if(!reviewedBooking||reviewBusy)return;
        $('#staff-review-error').textContent='';
        reviewBusy=true;reviewDialog.querySelectorAll('button').forEach(b=>b.disabled=true);
        button.textContent='Scheduling…';
        try{
          const receipt=await Spa.rpc('spa_admin_schedule',{...reviewedBooking},true);
          reviewDialog.close();reviewedBooking=null;await load();
          const b=data.bookings.find(b=>b.reference===receipt.reference);if(b)openDetail(b.id);
        }finally{reviewBusy=false;button.textContent='Confirm and schedule';reviewDialog.querySelectorAll('button').forEach(b=>b.disabled=false);}
      }else if(button.id==='save-reschedule'){
        button.disabled=true;await change('reschedule',{id:editing.id,date:$('#reschedule-form').elements.date.value,time:$('#reschedule-form').elements.time.value,quote:preview.quote});openDetail(editing.id);
      }else if(button.hasAttribute('data-close-dialog'))dialog.close();

    }catch(error){showActionError(error.message);const p=reviewDialog.open?$('#staff-review-error'):$('#admin-booking-error');if(p){p.textContent=error.message;if(reviewDialog.open)p.focus();}}
    finally{if(button.isConnected)button.disabled=false;}
  });
  document.addEventListener('input',event=>{
    if(event.target.id==='profile-display-name'){profileNameDraft=event.target.value;$('#profile-name-error').textContent='';$('#profile-save-status').textContent='';}
    if(event.target.closest('#appointment-form')){preview=null;formVersion++;}
    if(event.target.closest('#reschedule-form')){preview=null;$('#reschedule-review').hidden=true;}
    if(event.target.id==='live-search')updateAppointmentSearch();
  });
  document.addEventListener('submit',async event=>{
    event.preventDefault();const target=event.target;if(!data||!target.reportValidity())return;
    const submit=event.submitter;if(submit?.disabled)return;if(submit)submit.disabled=true;
    try{
      if(target===form){
        const version=formVersion,args=bookingArgs();
        const payload={...args,p_name:form.elements.customer.value.trim(),p_phone:form.elements.phone.value.trim(),p_email:form.elements.email.value.trim(),p_request:requestId,p_source:form.elements.source.value};
        const q=await Spa.rpc('spa_quote',args,true);
        if(version!==formVersion||!dialog.open)return;preview=q;
        showBookingReview(q,payload);
      }else if(target.id==='reschedule-form'){
        const q=await Spa.rpc('spa_admin_change',{p_action:'reschedule_quote',p_data:{id:editing.id,date:target.elements.date.value,time:target.elements.time.value}},true);preview=q;
        $('#reschedule-review').innerHTML=Spa.schedule({...q,service:editing.service_name,lines:editing.booking_details?.lines})+'<p>The original spaces remain reserved until this change succeeds.</p><button id="save-reschedule" type="button" class="button button-dark">Save new schedule</button>';$('#reschedule-review').hidden=false;
      }else if(target.id==='profile-name-form'){
        const name=target.elements.display_name.value.trim();
        if(!name)throw new Error('Enter your display name.');
        await Spa.rpc('spa_update_profile',{p_name:name},true);
        profileNameDraft=null;await load();
        const status=$('#profile-save-status');if(status)status.textContent='Your name has been saved.';
        window.dispatchEvent(new Event('spa:session-changed'));
      }else if(target.id==='change-password-form'){
        if(target.elements.password.value!==target.elements.confirmation.value)throw new Error('Passwords do not match.');
        await Spa.changePassword(target.elements.password.value);data=null;location.replace('admin-login.html');
      }else if(target.dataset.save){
        const payload=Object.fromEntries(new FormData(target));
        if(target.dataset.save==='option'){payload.price_cents=Math.round(Number(payload.price)*100);delete payload.price;}
        if(target.dataset.save==='hours'){for(const key of ['opens','closes']){const [h,m]=payload[key].split(':').map(Number);payload[key]=h*60+m;}}
        if(target.dataset.save==='block'){payload.starts_at+=':00+02:00';payload.ends_at+=':00+02:00';}
        await change(target.dataset.save,payload);if(target.dataset.save==='notes')openDetail(editing.id);
      }
    }catch(error){showActionError(error.message);const p=target.id==='profile-name-form'?$('#profile-name-error'):$('#admin-booking-error');if(p)p.textContent=error.message;}
    finally{if(submit?.isConnected)submit.disabled=false;}
  });
  $('#dashboard-date').addEventListener('change',event=>{selected=event.target.value||today();render();});
  $('.sidebar-toggle').addEventListener('click',()=>{const open=!$('#sidebar').classList.contains('is-open');$('#sidebar').classList.toggle('is-open',open);$('#sidebar').inert=!open;$('.sidebar-backdrop').hidden=!open;$('.sidebar-toggle').setAttribute('aria-expanded',String(open));if(open)$('#sidebar a').focus();});
  $('.sidebar-backdrop').addEventListener('click',closeSidebar);document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSidebar();});
  $('#sidebar').addEventListener('keydown',event=>{if(event.key!=='Tab'||!$('#sidebar').classList.contains('is-open'))return;const nodes=[...$('#sidebar').querySelectorAll('a,button')],first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&event.target===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&event.target===last){event.preventDefault();first.focus();}});
  matchMedia('(max-width:900px)').addEventListener('change',closeSidebar);closeSidebar();
  try{
    const [identity,initialData]=await Promise.all([Spa.requireAdmin(),Spa.rpc('spa_admin_data',{},true)]);
    user=identity;data=initialData;render();document.body.classList.remove('admin-loading');$('#admin-access-message').hidden=true;
    setInterval(()=>{if(!document.hidden&&data)load().catch(()=>{});},60000);
    window.addEventListener('focus',()=>{if(data)load().catch(()=>{});});
  }catch(error){deny(error);}
})();
