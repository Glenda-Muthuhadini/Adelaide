const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('js/spa-api.js','utf8');
const session={access_token:'qa-token',refresh_token:'qa-refresh',expires_at:Date.now()/1000+3600,user:{email:'qa@example.invalid'}};
const response=(data,status=200)=>({ok:status<400,status,text:async()=>JSON.stringify(data)});
function client(fetch,existing){
 const items=new Map(existing?[['adelaide.admin.session',JSON.stringify(existing)]]:[]),window={dispatchEvent(){}};
 const context={window,fetch,sessionStorage:{getItem:k=>items.get(k)||null,setItem:(k,v)=>items.set(k,v),removeItem:k=>items.delete(k)},AbortSignal,Event,Intl,Date,URL,URLSearchParams,location:{href:'https://example.invalid/admin-login.html'}};
 vm.runInNewContext(source,context);return {api:window.Spa,items};
}
(async()=>{
 let calls=[];
 const success=client(async path=>{calls.push(path);if(path.includes('grant_type=password'))return response({...session,expires_in:3600});if(path.endsWith('/spa_is_admin'))return response(true);throw Error('Unexpected '+path);});
 assert.equal((await success.api.login('qa@example.invalid','test-only-password')).email,session.user.email);
 assert.equal(calls.length,2,'Sign-in needs only credential validation and live membership check');
 assert(success.items.has('adelaide.admin.session'));
 calls=[];
 const denied=client(async path=>{calls.push(path);if(path.includes('grant_type=password'))return response({...session,expires_in:3600});if(path.endsWith('/spa_is_admin'))return response(false);if(path.includes('/auth/v1/logout'))return response(null);throw Error(path);});
 await assert.rejects(denied.api.login('customer@example.invalid','test-only-password'),/not authorised/);
 assert(!denied.items.has('adelaide.admin.session'),'Unauthorised customer cannot retain staff session');
 const bad=client(async()=>response({message:'Invalid login credentials'},400));await assert.rejects(bad.api.login('qa@example.invalid','incorrect'),/Invalid login/);assert.equal(bad.items.size,0);
 let userResolve,adminResolve;calls=[];
 const parallel=client(path=>{calls.push(path);return new Promise(resolve=>{if(path.endsWith('/auth/v1/user'))userResolve=()=>resolve(response(session.user));else if(path.endsWith('/spa_is_admin'))adminResolve=()=>resolve(response(true));else throw Error(path);});},session);
 const checking=parallel.api.requireAdmin();await new Promise(r=>setImmediate(r));
 assert.equal(calls.length,2,'Both checks start before either response arrives');
 userResolve();adminResolve();assert.equal((await checking).email,session.user.email);
 const revoked=client(async path=>path.endsWith('/spa_is_admin')?response(false):response(session.user),session);await assert.rejects(revoked.api.requireAdmin(),/not authorised/);
 const expired=client(async()=>response({message:'Invalid JWT'},401),session);await assert.rejects(expired.api.requireAdmin(),/Invalid JWT/);
 const guest=client(()=>{throw Error('Guest must not fetch');});await assert.rejects(guest.api.requireAdmin(),/Please sign in/);
 // Exercise form feedback and retry with the actual auth controller.
 let submit,rejectLogin;const attrs=new Map(),button={disabled:false,innerHTML:'Sign in<span>→</span>',textContent:'Sign in',setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k)};
 const status={hidden:true,textContent:'',focus(){}},password={value:'test-only-password'};
 const form={dataset:{authMode:'login'},elements:{email:{value:'qa@example.invalid'}},querySelector:s=>s==='.form-status'?status:s==='[type=submit]'?button:s==='#password'?password:null,querySelectorAll:()=>[],addEventListener:(type,fn)=>{if(type==='submit')submit=fn;},reportValidity:()=>true};
 vm.runInNewContext(fs.readFileSync('js/admin-auth.js','utf8'),{document:{querySelector:()=>form,querySelectorAll:()=>[]},Spa:{login:()=>new Promise((resolve,reject)=>{rejectLogin=reject;})}});
 const attempt=submit({preventDefault(){}});assert(button.disabled);assert.equal(button.textContent,'Signing in…');assert.equal(attrs.get('aria-busy'),'true');
 rejectLogin(Error('Try again'));await attempt;assert(!button.disabled);assert.equal(button.innerHTML,'Sign in<span>→</span>');assert(!attrs.has('aria-busy'));assert.equal(status.textContent,'Try again');
 // Admin loaders dismiss immediately instead of waiting for the fixed animation delays.
 const timers=[],classes=new Set(['loader-active']);let removed=false;
 vm.runInNewContext(fs.readFileSync('js/loader.js','utf8'),{document:{readyState:'complete',documentElement:{classList:{add:k=>classes.add(k),remove:k=>classes.delete(k)}},body:{matches:()=>true},getElementById:()=>({classList:{add(){}},remove(){removed=true;}})},window:{matchMedia:()=>({matches:false}),addEventListener(){}},setTimeout:(fn,ms)=>{timers.push(ms);return 1;},clearTimeout(){}});
 assert(removed);assert(!classes.has('loader-active'));assert.deepEqual(timers,[10000],'Only the fail-safe timer is registered on admin screens');
 console.log('PASS login: two-request sign-in, parallel live identity/membership verification, customer/revoked/expired/guest denial, immediate busy feedback, restored retry button and immediate admin loader dismissal. Mock network; no real credentials used.');
})().catch(error=>{console.error(error);process.exitCode=1;});
