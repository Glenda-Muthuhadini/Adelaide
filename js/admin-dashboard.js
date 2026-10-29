'use strict';

const dashboardIcons = {"home":"<path d=\"m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z\"/>","calendar":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M7 3v4m10-4v4M3 10h18M7 14h2m3 0h2m3 0h1M7 18h2m3 0h2\"/>","user":"<circle cx=\"12\" cy=\"7\" r=\"4\"/><path d=\"M3 22v-2a9 9 0 0 1 18 0v2\"/>","userplus":"<circle cx=\"9\" cy=\"7\" r=\"4\"/><path d=\"M1 22v-2a8 8 0 0 1 16 0v2M19 8v8m-4-4h8\"/>","people":"<circle cx=\"9\" cy=\"7\" r=\"3\"/><path d=\"M2 21v-3a7 7 0 0 1 14 0v3H2Zm14-17a3 3 0 0 1 0 6m3 11h3v-3a6 6 0 0 0-5-6\"/>","lotus":"<path d=\"M12 21C6 15 7 8 12 2c5 6 6 13 0 19ZM12 21C5 21 2 16 1 10c7 0 11 5 11 11Zm0 0c7 0 10-5 11-11-7 0-11 5-11 11Z\"/>","plus":"<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M12 7v10M7 12h10\"/>","tag":"<path d=\"M21 3H11L2 12l10 10 9-9V3Z\"/><circle cx=\"16.5\" cy=\"7.5\" r=\"1\"/>","clock":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 5v7l5 3\"/>","chart":"<path d=\"M3 14h4v8H3Zm7-6h4v14h-4Zm7-6h4v20h-4Z\"/>","settings":"<path d=\"m9 3 1-2h4l1 2 3 2 2 1v4l-2 2v3l1 3-3 3-3-1h-3l-3 1-3-3 1-3v-3l-2-2V6l3-1Z\"/><circle cx=\"12\" cy=\"11\" r=\"4\"/>","logout":"<path d=\"M9 3H3v18h6M8 12h14m-5-5 5 5-5 5\"/>","bell":"<path d=\"M4 17h16l-2-4V9a6 6 0 0 0-12 0v4l-2 4ZM9 21h6\"/>","check":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"m6 12 4 4 8-8\"/>","cancel":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"m8 8 8 8m0-8-8 8\"/>","arrow":"<path d=\"M4 12h16m-6-6 6 6-6 6\"/>","left":"<path d=\"m15 5-7 7 7 7\"/>","right":"<path d=\"m9 5 7 7-7 7\"/>","menu":"<path d=\"M3 5h18M3 12h18M3 19h18\"/>"};
document.querySelectorAll('[data-icon]').forEach(el => {
  el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + dashboardIcons[el.dataset.icon] + '</svg>';
});
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateKey = date => [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
const localDate = key => new Date(key + 'T12:00:00');
const today = dateKey(new Date());
let selectedDate = today;
let activeSection = 'Dashboard';
let calendarView = 'day';
let bookingType = 'online';
let nextId = 9;
let adminName = 'Admin';
let toastTimer;
const services = [
  {name:'Swedish Massage',duration:60},
  {name:'Classic Facial',duration:60},
  {name:'Gel Manicure',duration:60},
  {name:'Deep Tissue Massage',duration:90},
  {name:'Body Scrub',duration:60},
  {name:'Gel Pedicure',duration:60}
];
const appointments = [
  {id:1,name:'Maria Santos',service:'Swedish Massage',start:540,duration:60,status:'confirmed',type:'online',people:1,date:today,phone:''},
  {id:2,name:'Emily Carter',service:'Classic Facial',start:600,duration:60,status:'arrived',type:'online',people:1,date:today,phone:''},
  {id:3,name:'Walk-in Client',service:'Gel Manicure',start:660,duration:60,status:'confirmed',type:'walkin',people:1,date:today,phone:''},
  {id:4,name:'James Lee',service:'Deep Tissue Massage',start:780,duration:90,status:'confirmed',type:'online',people:1,date:today,phone:''},
  {id:5,name:'Sophia Reyes',service:'Body Scrub',start:870,duration:60,status:'pending',type:'online',people:1,date:today,phone:''},
  {id:6,name:'Olivia Bennett',service:'Gel Pedicure',start:960,duration:60,status:'confirmed',type:'online',people:1,date:today,phone:''},
  {id:7,name:'Lebo Mokoena',service:'Swedish Massage',start:1080,duration:30,status:'completed',type:'walkin',people:1,date:today,phone:''},
  {id:8,name:'Ava Williams',service:'Classic Facial',start:1020,duration:60,status:'cancelled',type:'online',people:1,date:today,phone:''}
];
const statusNames = {pending:'Pending',confirmed:'Confirmed',arrived:'Arrived',completed:'Completed',cancelled:'Cancelled'};
const minutes = time => Number(time.split(':')[0])*60 + Number(time.split(':')[1]);
const clock = value => String(Math.floor(value / 60)).padStart(2,'0') + ':' + String(value % 60).padStart(2,'0');
const humanTime = value => (Math.floor(value / 60) % 12 || 12) + ':' + String(value % 60).padStart(2,'0') + (value < 720 ? ' AM' : ' PM');
const dayAppointments = date => appointments.filter(a=>a.date===date).sort((a,b)=>a.start-b.start);
const statusBadge = a => '<span class="status status-' + (a.type==='walkin' && a.status==='confirmed' ? 'walkin' : a.status) + '">' + (a.type==='walkin' && a.status==='confirmed' ? 'Walk-in' : statusNames[a.status]) + '</span>';
function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(()=>{$('#toast').hidden=true;},4500);
}
function appointmentRows(rows) {
  if (!rows.length) return '<p class="empty-state">No appointments for this date.<br>Use New Appointment to add one.</p>';
  return rows.map(a=>'<div class="appointment-row"><time class="appointment-time">' + humanTime(a.start) + '<span class="appointment-dot"></span></time><div class="appointment-info"><div><button class="appointment-name" data-detail="' + a.id + '">' + escapeHtml(a.name) + (a.people>1 ? ' · '+a.people+' people' : '') + '</button><small class="appointment-service">' + escapeHtml(a.service) + ' (' + a.duration + ' mins)</small></div><div class="appointment-meta">' + statusBadge(a) + '<button type="button" class="more-button" data-detail="' + a.id + '" aria-label="Manage appointment for ' + escapeHtml(a.name) + '">⋮</button></div></div></div>').join('');
}
function renderStats() {
  const rows=dayAppointments(selectedDate);
  $('#stat-total').textContent=rows.length;
  $('#stat-walkin').textContent=rows.filter(a=>a.type==='walkin').length;
  $('#stat-completed').textContent=rows.filter(a=>a.status==='completed').length;
  $('#stat-cancelled').textContent=rows.filter(a=>a.status==='cancelled').length;
}
function renderDay() {
  const rows = dayAppointments(selectedDate).filter(a=>a.status!=='cancelled');
  let content = '<div class="day-grid">';
  for(let hour=8;hour<=19;hour++) content+='<div class="hour-line" style="top:' + (hour-8)*42 + 'px"><span class="hour-label">' + humanTime(hour*60) + '</span></div>';
  rows.forEach((a,i)=>{
    // Place simultaneous appointments side by side, including overlapping durations.
    const overlaps=rows.filter(b=>b.start<a.start+a.duration && b.start+b.duration>a.start);
    const index=overlaps.findIndex(b=>b.id===a.id);
    const width=100/overlaps.length;
    const left=width*index;
    content+='<button type="button" class="schedule-event event-' + i%3 + '" data-detail="' + a.id + '" style="top:' + (a.start-480)*.7 + 'px;height:' + Math.max(26,a.duration*.7-4) + 'px;left:calc(82px + (100% - 94px) * ' + left/100 + ');width:calc((100% - 94px) * ' + width/100 + ')" aria-label="' + escapeHtml(a.name+' '+a.service+' '+humanTime(a.start)) + '"><span><strong>' + escapeHtml(a.name) + '</strong><small>' + escapeHtml(a.service) + ' (' + a.duration + ' mins)' + (a.people>1?' · '+a.people+' people':'') + '</small></span><span>' + clock(a.start) + '–' + clock(a.start+a.duration) + '</span></button>';
  });
  return content+'</div>';
}
function renderWeek() {
  const start=localDate(selectedDate);
  start.setDate(start.getDate()-((start.getDay()+6)%7));
  let content='<div class="week-grid">';
  for(let i=0;i<7;i++){
    const date=new Date(start);date.setDate(date.getDate()+i);
    const key=dateKey(date);
    content+='<div class="week-column"><h3>' + date.toLocaleDateString('en-ZA',{weekday:'short',day:'numeric'}) + '</h3>';
    const rows=dayAppointments(key).filter(a=>a.status!=='cancelled');
    content+=rows.length?rows.map(a=>'<button class="week-event" data-detail="'+a.id+'"><strong>'+clock(a.start)+'</strong><br>'+escapeHtml(a.name)+'<br>'+escapeHtml(a.service)+'</button>').join(''):'<p class="empty-state">No bookings</p>';
    content+='</div>';
  }
  return content+'</div>';
}
function renderMonth() {
  const date=localDate(selectedDate),year=date.getFullYear(),month=date.getMonth();
  let content='<div class="month-grid">';
  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(d=>{content+='<div class="month-weekday">'+d+'</div>';});
  const offset=(new Date(year,month,1).getDay()+6)%7;
  for(let i=0;i<offset;i++)content+='<span></span>';
  for(let day=1;day<=new Date(year,month+1,0).getDate();day++){
    const key=dateKey(new Date(year,month,day)),count=dayAppointments(key).filter(a=>a.status!=='cancelled').length;
    content+='<button class="month-day" data-date="'+key+'" '+(key===selectedDate?'aria-current="date"':'')+' aria-label="'+key+', '+count+' appointments"><span>'+day+'</span>'+(count?'<small>'+count+' booked</small>':'')+'</button>';
  }
  return content+'</div>';
}
function renderSchedule() {
  document.querySelector('[data-date-step="-1"]').setAttribute('aria-label','Previous '+calendarView);
  document.querySelector('[data-date-step="1"]').setAttribute('aria-label','Next '+calendarView);
  $('#schedule').innerHTML=calendarView==='day'?renderDay():calendarView==='week'?renderWeek():renderMonth();
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===calendarView)));
  const todaySelected=selectedDate===today;
  $('#schedule-title').textContent=calendarView==='day'?(todaySelected?'Today’s Schedule':'Daily Schedule'):calendarView==='week'?'Weekly Schedule':localDate(selectedDate).toLocaleDateString('en-ZA',{month:'long',year:'numeric'});
}
function updateDate(date) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(localDate(date).getTime()))return;
  selectedDate=date;
  $('#dashboard-date').value=date;
  render();
}
function render() {
  renderStats();
  $('#appointment-list').innerHTML=appointmentRows(dayAppointments(selectedDate).filter(a=>a.status!=='completed'&&a.status!=='cancelled'));
  $('#appointments-title').textContent=selectedDate===today?'Today’s Appointments':'Appointments';
  renderSchedule();
  if(activeSection!=='Dashboard'&&activeSection!=='Calendar')renderModule(activeSection);
}
function closeSidebar() {
  const wasOpen=$('#sidebar').classList.contains('is-open');
  $('#sidebar').classList.remove('is-open');
  $('#sidebar').inert=innerWidth<=900;
  $('.sidebar-backdrop').hidden=true;
  $('.sidebar-toggle').setAttribute('aria-expanded','false');
  $('.sidebar-toggle').setAttribute('aria-label','Open navigation');
  if(wasOpen)$('.sidebar-toggle').focus();
}
function table(headers,rows) {
  return '<div class="table-scroll"><table class="data-table"><thead><tr>'+headers.map(h=>'<th scope="col">'+escapeHtml(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
function cards(items) {
  return '<div class="module-cards">'+items.map(([title,text])=>'<article class="module-item"><h3>'+escapeHtml(title)+'</h3><p>'+escapeHtml(text)+'</p></article>').join('')+'</div>';
}
function renderModule(section) {
  const panel=$('#module-view');
  const rows=dayAppointments(selectedDate);
  let content='';
  if(section==='Appointments'){
    content='<div class="module-toolbar"><h2>Appointments</h2><input type="search" id="appointment-search" placeholder="Search client or service" aria-label="Search appointments"><button class="button button-dark" data-create="new">New appointment</button></div><div id="all-appointments">'+appointmentTable(rows)+'</div>';
  }else if(section==='Clients'){
    const unique=[...new Map(appointments.map(a=>[a.name,a])).values()].filter(a=>a.name!=='Walk-in Client');
    content='<div class="module-toolbar"><h2>Clients</h2><input type="search" id="client-search" placeholder="Search clients" aria-label="Search clients"></div><p class="module-copy">Sample clients from the appointment book.</p><div id="client-table">'+clientTable(unique)+'</div>';
  }else if(section==='Services'){
    content='<h2>Services</h2><p class="module-copy">Sample treatment catalogue used in this dashboard preview. Your live catalogue will be connected during backend setup.</p>'+cards(services.map(s=>[s.name,s.duration+' minutes · Maximum 4 people at a time']));
  }else if(section==='Add-ons'){
    content='<h2>Add-ons</h2><p class="module-copy">Add-on treatments from Adelaide’s service menu.</p>'+cards([['Neck & Shoulder Massage','Additional focused care for the neck and shoulders.'],['Scalp Massage','A relaxing addition to a spa treatment.'],['Hand Massage','Focused care for tired hands.']]);
  }else if(section==='Specials & Promotions'){
    content='<div class="module-toolbar"><h2>Specials & Promotions</h2><a class="button button-outline" href="packages.html">View offers</a></div>'+cards([['Me-Time Special','An individual spa experience.'],['Couples Massage Specials','Shared relaxation for two.'],['Birthday Package','A celebration with time to unwind.'],['Group Wellness Special','Group bookings are allocated across consecutive sessions.']]);
  }else if(section==='Staff'){
    content='<h2>Staff</h2><p class="module-copy">Staff access is reserved for owner-authorised accounts.</p>'+cards([[adminName,'Salon Manager · Preview profile'],['Staff invitations','Staff invitations and permissions will be available when authentication is connected.']]);
  }else if(section==='Availability'){
    content='<h2>Availability</h2><p class="module-copy">The preview uses Adelaide’s published operating hours.</p>'+table(['Day','Opening hours','Service capacity'],['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d=>[d,'09:00–19:00','4 people at the same time']))+'<p class="module-copy">30-minute intervals. Treatments reserve capacity for their full 30, 60, or 90 minutes. Groups over four are split into consecutive sessions. Shared room and therapist limits will be configured during backend setup.</p>';
  }else if(section==='Reports'){
    content='<h2>Daily overview</h2><p class="module-copy">Sample activity for '+escapeHtml(localDate(selectedDate).toLocaleDateString('en-ZA',{dateStyle:'full'}))+'.</p>'+cards([['Appointments',String(rows.length)+' bookings'],['People expected',String(rows.filter(a=>a.status!=='cancelled').reduce((sum,a)=>sum+a.people,0))+' people'],['Completed',String(rows.filter(a=>a.status==='completed').length)+' treatments'],['Pending',String(rows.filter(a=>a.status==='pending').length)+' awaiting confirmation'],['Walk-ins',String(rows.filter(a=>a.type==='walkin').length)+' bookings'],['Cancelled',String(rows.filter(a=>a.status==='cancelled').length)+' bookings']]);
  }else if(section==='Profile settings'){
    content='<h2>Profile settings</h2><p class="module-copy">Update the display name for this preview. Changes last until you refresh.</p><form id="profile-form" class="dialog-fields"><label>Display name<input name="admin-name" maxlength="60" value="'+escapeHtml(adminName)+'" required></label><div><button class="button button-dark" type="submit">Save display name</button></div></form><p class="module-copy">Adelaide Wellness & Spa · Africa/Johannesburg<br>Operating hours: 09:00–19:00, Monday–Sunday<br>Customers book without an account. Admin authentication is pending backend setup.</p>';
  }
  panel.innerHTML=content;
}
function appointmentTable(rows) {
  if(!rows.length)return '<p class="empty-state">No matching appointments.</p>';
  return table(['Time','Client','Service','People','Status',''],rows.map(a=>[humanTime(a.start),escapeHtml(a.name),escapeHtml(a.service)+' · '+a.duration+' mins',String(a.people),statusBadge(a),'<button data-detail="'+a.id+'">Manage</button>']));
}
function clientTable(rows) {
  return table(['Client','Phone','Bookings',''],rows.map(a=>[escapeHtml(a.name),escapeHtml(a.phone||'Not provided'),String(appointments.filter(b=>b.name===a.name).length),'<button data-detail="'+a.id+'">View appointment</button>']));
}
function navigate(section) {
  if(section==='Add Walk-In'){openCreate('walkin');closeSidebar();return;}
  activeSection=section;
  const dashboard=section==='Dashboard',calendar=section==='Calendar';
  $('#dashboard-view').hidden=!dashboard&&!calendar;
  $('.stats-grid').hidden=calendar;
  $('.appointments-panel').hidden=calendar;
  $('.dashboard-columns').style.gridTemplateColumns=calendar?'minmax(0,1fr)':'';
  $('.quick-actions').hidden=calendar;
  $('#module-view').hidden=dashboard||calendar;
  $('#page-title').textContent=dashboard?'Good morning, '+adminName:section;
  $('#page-subtitle').textContent=dashboard?'Here’s what’s happening at Adelaide today.':calendar?'A little order behind every moment of calm.':'Your Adelaide staff workspace.';
  document.querySelectorAll('.dashboard-navigation [data-section]').forEach(b=>{
    if(b.dataset.section===section)b.setAttribute('aria-current','page');
    else b.removeAttribute('aria-current');
  });
  closeSidebar();
  render();
}
function openCreate(type) {
  bookingType=type==='walkin'?'walkin':'online';
  $('#appointment-form').reset();
  $('#appointment-form').hidden=false;
  $('#appointment-detail').hidden=true;
  $('#booking-error').hidden=true;
  $('#dialog-title').textContent=bookingType==='walkin'?'Add walk-in':'New appointment';
  $('#appointment-form .dialog-intro').textContent=bookingType==='walkin'?'A warm welcome, with every detail taken care of.':'A little time set aside for wellbeing.';
  $('#appointment-form .form-save').firstChild.textContent=bookingType==='walkin'?'Add walk-in ':'Add appointment ';
  const form=$('#appointment-form');
  form.elements.date.value=selectedDate;
  form.elements.time.innerHTML=Array.from({length:20},(_,i)=>'<option value="'+clock(540+i*30)+'">'+humanTime(540+i*30)+'</option>').join('');
  form.elements.status.value=bookingType==='walkin'?'arrived':'pending';
  $('#appointment-dialog').showModal();
}
function openDetail(id) {
  const a=appointments.find(a=>a.id===Number(id));if(!a)return;
  $('#appointment-form').hidden=true;
  $('#appointment-detail').hidden=false;
  $('#dialog-title').textContent=a.name;
  const properties=[['Service',a.service],['Date',a.date],['Time',humanTime(a.start)+'–'+humanTime(a.start+a.duration)],['People',a.people],['Phone',a.phone||'Not provided'],['Status',statusNames[a.status]],['Booking',a.type==='walkin'?'Walk-in':'Online / admin']];
  $('#appointment-detail').innerHTML='<dl class="detail-list">'+properties.map(([k,v])=>'<dt>'+escapeHtml(k)+'</dt><dd>'+escapeHtml(v)+'</dd>').join('')+'</dl><p class="dialog-note">Sample appointment. Updates are kept in this preview until refresh.</p><div class="detail-actions">'+(a.status==='cancelled'?'<span>This appointment has been cancelled.</span>':['confirmed','arrived','completed','cancelled'].filter(status=>status!==a.status).map(status=>'<button data-status="'+status+'" data-id="'+a.id+'">'+({confirmed:'Confirm',arrived:'Mark arrived',completed:'Mark completed',cancelled:'Cancel appointment'}[status])+'</button>').join(''))+'</div>';
  $('#appointment-dialog').showModal();
}
function hasSpace(service,date,start,duration,people,extra=[]) {
  const rows=appointments.concat(extra).filter(a=>a.service===service&&a.date===date&&a.status!=='cancelled');
  for(let t=start;t<start+duration;t+=30){
    const occupied=rows.filter(a=>a.start<t+30&&a.start+a.duration>t).reduce((sum,a)=>sum+a.people,0);
    if(occupied+people>4)return false;
  }
  return true;
}
$('#appointment-form').addEventListener('submit',event=>{
  event.preventDefault();
  const form=event.currentTarget;
  if(!form.reportValidity())return;
  const data=new FormData(form),start=minutes(data.get('time')),duration=Number(data.get('duration')),count=Number(data.get('people'));
  const service=String(data.get('service')),date=String(data.get('date'));
  const planned=[];
  let remaining=count,cursor=start;
  const fail=message=>{$('#booking-error').textContent=message;$('#booking-error').hidden=false;$('#booking-error').focus();};
  if(![30,60,90].includes(duration)||!Number.isInteger(count)||count<1||count>40)return fail('Choose a valid duration and a group size between 1 and 40.');
  while(remaining>0){
    if(cursor+duration>1140)return fail('The full booking must fit before 7:00 PM. Choose an earlier start time or a different date.');
    let batch=Math.min(4,remaining);
    while(batch>0&&!hasSpace(service,date,cursor,duration,batch,planned))batch--;
    if(batch===0)return fail('There is not enough capacity in consecutive sessions for this booking. Choose another start time.');
    planned.push({id:nextId+planned.length,name:String(data.get('client')).trim(),phone:String(data.get('phone')).trim(),service,date,start:cursor,duration,people:batch,status:String(data.get('status')),type:bookingType});
    remaining-=batch;cursor+=duration;
  }
  nextId+=planned.length;appointments.push(...planned);
  $('#appointment-dialog').close();
  updateDate(date);
  toast(count+' '+(count===1?'person':'people')+' added to the preview'+(planned.length>1?' across '+planned.length+' consecutive sessions.':'.'));
});
document.addEventListener('click',event=>{
  const section=event.target.closest('[data-section]');if(section){navigate(section.dataset.section);return;}
  const create=event.target.closest('[data-create]');if(create){openCreate(create.dataset.create);return;}
  const detail=event.target.closest('[data-detail]');if(detail){openDetail(detail.dataset.detail);return;}
  const view=event.target.closest('[data-view]');if(view){calendarView=view.dataset.view;renderSchedule();return;}
  const date=event.target.closest('[data-date]');if(date){calendarView='day';updateDate(date.dataset.date);return;}
  const step=event.target.closest('[data-date-step]');
  if(step){const d=localDate(selectedDate);if(calendarView==='month')d.setMonth(d.getMonth()+Number(step.dataset.dateStep));else d.setDate(d.getDate()+Number(step.dataset.dateStep)*(calendarView==='week'?7:1));updateDate(dateKey(d));return;}
  const status=event.target.closest('[data-status]');
  if(status){const a=appointments.find(a=>a.id===Number(status.dataset.id));a.status=status.dataset.status;$('#appointment-dialog').close();render();toast('Preview appointment updated.');}
});
document.addEventListener('input',event=>{
  if(event.target.id==='appointment-search'){
    const query=event.target.value.toLowerCase();
    $('#all-appointments').innerHTML=appointmentTable(dayAppointments(selectedDate).filter(a=>(a.name+' '+a.service).toLowerCase().includes(query)));
  }
  if(event.target.id==='client-search'){
    const query=event.target.value.toLowerCase();
    const rows=[...new Map(appointments.map(a=>[a.name,a])).values()].filter(a=>a.name!=='Walk-in Client'&&a.name.toLowerCase().includes(query));
    $('#client-table').innerHTML=clientTable(rows);
  }
});
document.addEventListener('submit',event=>{
  if(event.target.id!=='profile-form')return;
  event.preventDefault();
  adminName=event.target.elements['admin-name'].value.trim()||'Admin';
  const initials=adminName.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();
  $('.account-button').textContent=initials;
  $('.account-button').setAttribute('aria-label','Open profile settings for '+adminName);
  toast('Preview display name updated.');
});
$('#appointment-form').elements.service.addEventListener('change',event=>{
  const service=services.find(s=>s.name===event.target.value);
  if(service)$('#appointment-form').elements.duration.value=service.duration;
});
$('#dashboard-date').addEventListener('change',event=>updateDate(event.target.value));
$('.today-button').addEventListener('click',()=>updateDate(today));
$('.sidebar-toggle').addEventListener('click',()=>{
  const open=$('.sidebar-toggle').getAttribute('aria-expanded')!=='true';
  $('#sidebar').classList.toggle('is-open',open);
  $('#sidebar').inert=!open;
  $('.sidebar-backdrop').hidden=!open;
  $('.sidebar-toggle').setAttribute('aria-expanded',String(open));
  $('.sidebar-toggle').setAttribute('aria-label',open?'Close navigation':'Open navigation');
  if(open)$('#sidebar a').focus();
});
const sidebarViewport=matchMedia('(max-width: 900px)');
sidebarViewport.addEventListener('change',closeSidebar);
$('#sidebar').inert=sidebarViewport.matches;
$('.sidebar-backdrop').addEventListener('click',closeSidebar);
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeSidebar();});
document.addEventListener('focusin',event=>{
  if(innerWidth<=900&&$('#sidebar').classList.contains('is-open')&&!$('#sidebar').contains(event.target)&&!$('.sidebar-toggle').contains(event.target))closeSidebar();
});
$('#sidebar').addEventListener('keydown',event=>{
  if(event.key!=='Tab'||!$('#sidebar').classList.contains('is-open'))return;
  const targets=[...$('#sidebar').querySelectorAll('a,button')],first=targets[0],last=targets[targets.length-1];
  if(event.shiftKey&&event.target===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&event.target===last){event.preventDefault();first.focus();}
});
document.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>$('#appointment-dialog').close()));
$('[data-close-info]').addEventListener('click',()=>$('#info-dialog').close());
$('.notification-button').addEventListener('click',()=>{
  $('#info-content').innerHTML='<p class="module-copy">You are viewing a design preview. No live notifications are connected.</p><h3>Pending appointments</h3>'+appointments.filter(a=>a.status==='pending').map(a=>'<p class="module-copy">'+escapeHtml(a.name)+' · '+escapeHtml(a.service)+' · '+a.date+'</p>').join('');
  $('.notification-dot').hidden=true;
  $('#info-dialog').showModal();
});
updateDate(today);

