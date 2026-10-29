/* Public project configuration only. No service-role key belongs in this site. */
'use strict';
window.Spa = (() => {
  const url = 'https://zhezlhajzdzdyronuxao.supabase.co';
  const key = 'sb_publishable_R9dt4vkqLUqUcNusURBq2Q_n9_cpSiJ';
  const sessionKey = 'adelaide.admin.session';
  let refreshing;
  function stored() { try { return JSON.parse(sessionStorage.getItem(sessionKey) || 'null'); } catch { return null; } }
  function save(value) { sessionStorage.setItem(sessionKey, JSON.stringify(value)); window.dispatchEvent(new Event('spa:session-changed')); }
  async function request(path, body, token, method = 'POST') {
    const headers = {apikey:key, 'Content-Type':'application/json'};
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(url + path, {method, headers, body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(20000)});
    const text = await response.text();
    let data; try { data = text ? JSON.parse(text) : null; } catch { throw new Error('The spa server returned an unexpected response. Please try again.'); }
    if (!response.ok) { const error=new Error(data?.message || data?.msg || data?.error_description || 'The request could not be completed. Please try again.');error.status=response.status;error.code=data?.code;throw error; }
    return data;
  }
  async function token() {
    const s = stored();
    if (!s) return null;
    if (s.expires_at > Date.now()/1000 + 60) return s.access_token;
    if (!refreshing) refreshing = request('/auth/v1/token?grant_type=refresh_token', {refresh_token:s.refresh_token})
      .then(data => { save({...data, expires_at:Date.now()/1000+data.expires_in, recovery:s.recovery}); return data.access_token; })
      .catch(error => { sessionStorage.removeItem(sessionKey); throw error; }).finally(() => { refreshing = null; });
    return refreshing;
  }
  async function rpc(name, args = {}, admin = false) {
    const access = admin ? await token() : null;
    if (admin && !access) throw new Error('Please sign in with an authorised admin account.');
    return request('/rest/v1/rpc/' + name, args, access);
  }
  async function requireAdmin() {
    const access = await token();
    if (!access) throw new Error('Please sign in.');
    const user = await request('/auth/v1/user', undefined, access, 'GET');
    if (!await rpc('spa_is_admin', {}, true)) throw new Error('This account is not authorised for staff access. Contact the spa owner.');
    return user;
  }
  async function login(email,password) {
    const data = await request('/auth/v1/token?grant_type=password',{email,password});
    save({...data,expires_at:Date.now()/1000+data.expires_in});
    try { return await requireAdmin(); } catch (e) { await logout(); throw e; }
  }
  async function logout() {
    const access = await token();
    if (access) await request('/auth/v1/logout?scope=global',{},access);
    sessionStorage.removeItem(sessionKey);
    window.dispatchEvent(new Event('spa:session-changed'));
  }
  async function recover(email) {
    const redirect = new URL('admin-reset-password.html',location.href).href;
    return request('/auth/v1/recover?redirect_to='+encodeURIComponent(redirect),{email});
  }
  async function acceptRecovery() {
    const hash = new URLSearchParams(location.hash.slice(1));
    if (hash.has('access_token')) {
      history.replaceState(null,'',location.pathname+location.search);
      if (hash.get('type')!=='recovery' || !hash.get('refresh_token')) throw new Error('Open the password recovery link from your email.');
      save({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_at:Date.now()/1000+Number(hash.get('expires_in')||3600),recovery:true});
    }
    if (!stored()?.recovery) throw new Error('Open this page using a valid password recovery email link.');
    await requireAdmin();
  }
  async function reset(password) {
    await acceptRecovery();
    await request('/auth/v1/user',{password},await token(),'PUT');
    await logout();
  }
  async function changePassword(password) {
    await requireAdmin();
    await request('/auth/v1/user',{password},await token(),'PUT');
    await logout();
  }
  async function addStaff(details) {
    const access=await token();
    if(!access)throw new Error('Sign in as the owner to add staff.');
    return request('/functions/v1/manage-staff',details,access);
  }
  async function staffIdentity() {
    if(!stored()?.access_token)return null;
    try {return await rpc('spa_staff_identity',{},true);} catch {return null;}
  }
  async function catalogue() {
    const [services,options] = await Promise.all([
      request('/rest/v1/spa_services?select=*&order=name',undefined,null,'GET'),
      request('/rest/v1/spa_options?select=*&active=eq.true',undefined,null,'GET')
    ]);
    return {services:services.filter(s=>s.active),options};
  }
  const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = cents => new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(cents/100);
  const date = value => { const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));return parts.year+'-'+parts.month+'-'+parts.day; };
  const time = value => new Intl.DateTimeFormat('en-ZA',{timeZone:'Africa/Johannesburg',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));
  function schedule(q) {
    return '<p><strong>'+escape(q.service)+'</strong> · '+q.duration+' minutes per person · '+q.people+' people</p>'+(q.lines?.length?'<dl class="booking-price-lines">'+q.lines.map(line=>'<div><dt>'+escape(line.name)+'</dt><dd>'+money(line.total_cents)+'</dd></div>').join('')+'</dl>':'')+'<p>Total: <strong>'+money(q.total_cents)+'</strong></p><ol class="session-list">'+q.sessions.map(s=>'<li>'+date(s.starts_at)+' · '+time(s.starts_at)+'–'+time(s.ends_at)+' · <strong>'+s.people+' '+(s.people===1?'person':'people')+'</strong></li>').join('')+'</ol>'+(q.preparation_minutes?'<p>'+q.preparation_minutes+' minutes of preparation reserved after each session.</p>':'');
  }
  return {rpc,login,logout,recover,reset,changePassword,addStaff,staffIdentity,acceptRecovery,requireAdmin,catalogue,escape,money,date,time,schedule};
})();
