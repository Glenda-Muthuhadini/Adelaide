// Auth Admin credentials remain in Edge Function environment variables.
// No passwords, access tokens or server keys are logged or returned.
export function createStaffHandler({getEnv,fetchImpl=fetch}) {
  const cors={
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Content-Type':'application/json',
    'Cache-Control':'no-store'
  };
  const reply=(status,body)=>new Response(body===null?null:JSON.stringify(body),{status,headers:cors});
  return async function handle(req) {
    if(req.method==='OPTIONS')return reply(204,null);
    if(req.method!=='POST')return reply(405,{message:'Use POST to add staff.'});
    const authorization=req.headers.get('authorization')||'';
    if(!/^Bearer\s+\S+$/i.test(authorization))return reply(401,{message:'Sign in as the owner to add staff.'});
    const url=getEnv('SUPABASE_URL'),serviceKey=getEnv('SUPABASE_SERVICE_ROLE_KEY');
    const apiKey=getEnv('SUPABASE_ANON_KEY')||serviceKey;
    if(!url||!serviceKey||!apiKey)return reply(503,{message:'Staff account setup is temporarily unavailable.'});
    async function api(path,body,privileged=false,method='POST') {
      const response=await fetchImpl(url+path,{
        method,headers:{apikey:privileged?serviceKey:apiKey,Authorization:privileged?'Bearer '+serviceKey:authorization,'Content-Type':'application/json'},
        body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)
      });
      let data=null;try{data=await response.json();}catch{}
      return {response,data};
    }
    try {
      const identity=await api('/auth/v1/user',undefined,false,'GET');
      if(!identity.response.ok)return reply(401,{message:'Your session is no longer valid. Sign in again.'});
      const owner=await api('/rest/v1/rpc/spa_is_owner',{});
      if(!owner.response.ok||owner.data!==true)return reply(403,{message:'Only the owner can add staff.'});
      let body;try{body=await req.json();}catch{return reply(400,{message:'Enter the staff details.'});}
      const name=typeof body?.name==='string'?body.name.trim():'';
      const email=typeof body?.email==='string'?body.email.trim().toLowerCase():'';
      const password=typeof body?.password==='string'?body.password:'';
      if(name.length<1||name.length>100||email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12||password.length>128)
        return reply(400,{message:'Enter a name, valid email and an initial password of 12 to 128 characters.'});
      let lookup=await api('/rest/v1/rpc/spa_owner_staff_lookup',{p_email:email});
      if(!lookup.response.ok)return reply(403,{message:'Only the owner can add staff.'});
      let account=lookup.data,existing=Boolean(account);
      if(account?.role==='owner')return reply(409,{message:'This email belongs to the owner account.'});
      if(!account) {
        const created=await api('/auth/v1/admin/users',{email,password,email_confirm:true,user_metadata:{full_name:name}},true);
        if(!created.response.ok) {
          // Another request may have created the same email. Re-read instead of duplicating it.
          if(created.response.status===422||created.response.status===409) {
            lookup=await api('/rest/v1/rpc/spa_owner_staff_lookup',{p_email:email});
            if(lookup.response.ok&&lookup.data){account=lookup.data;existing=true;}
          }
          if(!account)return reply(400,{message:created.data?.msg||created.data?.message||'The staff account could not be created. Check the details and try again.'});
        }else account=created.data?.user||created.data;
      }
      if(!account?.id)return reply(502,{message:'The account could not be verified. Please try again.'});
      if(account.role==='owner')return reply(409,{message:'This email belongs to the owner account.'});
      if(existing) {
        // Confirm an existing account without resetting its current password or sending mail.
        const confirmed=await api('/auth/v1/admin/users/'+account.id,{email_confirm:true},true,'PUT');
        if(!confirmed.response.ok)return reply(400,{message:'The existing account could not be prepared for staff access.'});
      }
      const grant=await api('/rest/v1/rpc/spa_owner_add_staff',{p_user_id:account.id,p_name:name});
      if(!grant.response.ok)return reply(grant.response.status===403?403:400,{message:grant.data?.message||'Staff access could not be completed. Refresh the Staff table and try again.'});
      return reply(200,{id:account.id,email,name,role:'admin',existing_account:existing});
    }catch {
      // A retry reuses an existing Auth account; never delete an account on an ambiguous timeout.
      return reply(503,{message:'Staff setup could not finish. Refresh the Staff table before trying again.'});
    }
  };
}
if(typeof Deno!=='undefined')Deno.serve(createStaffHandler({getEnv:name=>Deno.env.get(name)}));
