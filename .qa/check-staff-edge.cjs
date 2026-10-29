const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
  const source=fs.readFileSync('supabase/functions/manage-staff/index.ts','utf8');
  const {createStaffHandler}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const details={name:'QA Staff',email:'qa-staff@example.invalid',password:'QA initial password 123!'};
  const request=(body=details,token='test-user-token')=>new Request('https://example.invalid/functions/v1/manage-staff',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
  const getEnv=name=>({SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-server-secret',SUPABASE_ANON_KEY:'test-public-key'}[name]);
  function setup({owner=true,valid=true,existing=null,grant=true,fail=false}={}){
    const calls=[];
    const fetchImpl=async(url,options)=>{
      calls.push({path:new URL(url).pathname,method:options.method,headers:options.headers,body:options.body?JSON.parse(options.body):null});
      if(fail)throw new Error('Private failure mentioning test-server-secret');
      const path=new URL(url).pathname;
      let data,status=200;
      if(path==='/auth/v1/user'){data=valid?{id:'owner-id'}:{message:'Invalid session'};status=valid?200:401;}
      else if(path.endsWith('/spa_is_owner'))data=owner;
      else if(path.endsWith('/spa_owner_staff_lookup'))data=existing;
      else if(path==='/auth/v1/admin/users'){data={id:'new-staff-id',email:details.email};}
      else if(path.startsWith('/auth/v1/admin/users/'))data={id:'existing-id'};
      else if(path.endsWith('/spa_owner_add_staff')){data=grant?{id:'new-staff-id',role:'admin'}:{message:'Only the owner can add staff.'};status=grant?200:403;}
      else throw new Error('Unexpected request '+path);
      return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
    };
    return {calls,handler:createStaffHandler({getEnv,fetchImpl})};
  }
  let s=setup();assert.equal((await s.handler(request(details,null))).status,401);assert.equal(s.calls.length,0);
  s=setup({valid:false});assert.equal((await s.handler(request())).status,401);assert.equal(s.calls.length,1);
  s=setup({owner:false});assert.equal((await s.handler(request({...details,role:'owner'}))).status,403);assert(!s.calls.some(c=>c.path.includes('/admin/users')));
  s=setup();let response=await s.handler(request({...details,role:'owner'}));assert.equal(response.status,200);let body=await response.json();assert.equal(body.role,'admin');assert(!JSON.stringify(body).includes(details.password));
  const create=s.calls.find(c=>c.path==='/auth/v1/admin/users');assert.equal(create.body.email_confirm,true);assert.equal(create.body.password,details.password);assert.equal(create.headers.Authorization,'Bearer test-server-secret');
  const grant=s.calls.find(c=>c.path.endsWith('/spa_owner_add_staff'));assert.equal(grant.headers.Authorization,'Bearer test-user-token');assert.deepEqual(Object.keys(grant.body).sort(),['p_name','p_user_id']);
  s=setup();assert.equal((await s.handler(request({...details,password:'short'}))).status,400);assert(!s.calls.some(c=>c.path.includes('/admin/users')));
  s=setup({existing:{id:'owner-id',role:'owner'}});assert.equal((await s.handler(request())).status,409);assert(!s.calls.some(c=>c.path.includes('/admin/users')));
  s=setup({existing:{id:'existing-id',role:null}});response=await s.handler(request());assert.equal(response.status,200);body=await response.json();assert.equal(body.existing_account,true);assert(!s.calls.some(c=>c.path==='/auth/v1/admin/users'));assert.deepEqual(s.calls.find(c=>c.path==='/auth/v1/admin/users/existing-id').body,{email_confirm:true});
  s=setup({grant:false});assert.equal((await s.handler(request())).status,403);assert(!s.calls.some(c=>c.method==='DELETE'),'Ambiguous failures never delete Auth accounts');
  s=setup({fail:true});response=await s.handler(request());assert.equal(response.status,503);assert(!(await response.text()).includes('test-server-secret'));
  s=setup();response=await s.handler(new Request('https://example.invalid',{method:'OPTIONS'}));assert.equal(response.status,204);assert.equal(s.calls.length,0);
  console.log('PASS staff Edge handler: owner enforcement, fixed staff role, no confirmation emails, initial password handling, existing-account retry, no password reset on existing accounts, revoked owner denial, no credential disclosure, CORS. Mock external Auth API; SQL permissions tested separately.');
})().catch(error=>{console.error(error);process.exitCode=1;});
