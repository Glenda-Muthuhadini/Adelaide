const {randomUUID,randomBytes}=require('node:crypto');
const {writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const url='https://zhezlhajzdzdyronuxao.supabase.co',key='sb_publishable_R9dt4vkqLUqUcNusURBq2Q_n9_cpSiJ';
let ownerToken,staffToken;
async function input(){if(process.stdin.isTTY)process.stdin.setRawMode(true);process.stdin.resume();console.log('Ready for owner QA credentials on stdin (input is hidden).');return new Promise(resolve=>{let text='';process.stdin.on('data',chunk=>{text+=chunk.toString();try{const value=JSON.parse(text.trim());process.stdin.pause();resolve(value);}catch{}});});}
async function request(path,body,token,method='POST'){
  const response=await fetch(url+path,{method,headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  let data=null;try{data=await response.json();}catch{}return {response,data};
}
(async()=>{
  let credentials=await input();
  const login=await request('/auth/v1/token?grant_type=password',credentials);credentials=null;
  assert.equal(login.response.status,200,'Owner test login');ownerToken=login.data.access_token;
  const owner=await request('/rest/v1/rpc/spa_is_owner',{},ownerToken);assert.equal(owner.data,true);
  const suffix=randomUUID(),email='qa-staff-'+suffix+'@example.invalid',forbiddenEmail='qa-forbidden-'+suffix+'@example.invalid',password=randomBytes(24).toString('base64')+'!Aa9';
  const created=await request('/functions/v1/manage-staff',{name:'QA temporary staff',email,password},ownerToken);
  assert.equal(created.response.status,200,'Owner creates staff: '+(created.data?.message||''));
  writeFileSync('.qa/staff-api-results.json',JSON.stringify({passed:false,fixtureId:created.data.id,fixtureEmail:email,forbiddenEmail},null,2));
  const signedIn=await request('/auth/v1/token?grant_type=password',{email,password});
  assert.equal(signedIn.response.status,200,'Staff signs in without email confirmation');staffToken=signedIn.data.access_token;
  assert(signedIn.data.user.email_confirmed_at,'Email already confirmed');
  const identity=await request('/rest/v1/rpc/spa_staff_identity',{},staffToken);assert.equal(identity.data.role,'admin');assert.equal(identity.data.name,'QA temporary staff');
  const table=await request('/rest/v1/rpc/spa_admin_data',{},staffToken);assert.equal(table.data.viewer_role,'admin');assert(table.data.staff.some(s=>s.email===email));
  const denied=await request('/functions/v1/manage-staff',{name:'Forbidden staff',email:forbiddenEmail,password,role:'owner'},staffToken);assert.equal(denied.response.status,403,'Staff cannot create staff');
  const guest=await request('/functions/v1/manage-staff',{name:'Guest',email:forbiddenEmail,password});assert.equal(guest.response.status,401,'Guests denied');
  const guestIdentity=await request('/rest/v1/rpc/spa_staff_identity',{});assert.equal(guestIdentity.data,null,'Guests have no staff identity');
  const retried=await request('/functions/v1/manage-staff',{name:'QA temporary staff',email,password:'A different unused initial password!'},ownerToken);assert.equal(retried.response.status,200);assert.equal(retried.data.existing_account,true);assert.equal(retried.data.id,created.data.id,'Retry reuses account');
  const verifyPassword=await request('/auth/v1/token?grant_type=password',{email,password});assert.equal(verifyPassword.response.status,200,'Existing staff password unchanged');
  await request('/auth/v1/logout?scope=local',{},verifyPassword.data.access_token);
  await request('/auth/v1/logout?scope=local',{},staffToken);
  const revokedIdentity=await request('/rest/v1/rpc/spa_staff_identity',{},staffToken);assert.equal(revokedIdentity.data,null,'Logged-out token has no staff identity');staffToken=null;
  writeFileSync('.qa/staff-api-results.json',JSON.stringify({passed:true,fixtureId:created.data.id,fixtureEmail:email,forbiddenEmail,ownerOnlyCreation:true,noEmailConfirmation:true,staffIdentity:true,staffCreationDenied:true,guestDenied:true,existingPasswordPreserved:true,logoutRevocation:true},null,2));
  console.log('PASS live staff API: owner creates account; staff signs in immediately; owner-only creation enforced; customer identity absent; retries preserve existing passwords; logout revokes public staff identity. Temporary fixture recorded for cleanup.');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{for(const token of [staffToken,ownerToken])if(token)try{await request('/auth/v1/logout?scope=local',{},token);}catch{}process.stdin.pause();});
