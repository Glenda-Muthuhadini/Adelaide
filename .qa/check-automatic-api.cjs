const {randomUUID}=require('node:crypto');
const {writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const url='https://zhezlhajzdzdyronuxao.supabase.co',key='sb_publishable_R9dt4vkqLUqUcNusURBq2Q_n9_cpSiJ';
async function request(path,body,method='POST'){
  const response=await fetch(url+'/rest/v1/'+path,{method,headers:{apikey:key,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  let data=null;try{data=await response.json();}catch{}return {status:response.status,data};
}
(async()=>{
  const services=await request('spa_services?select=id,name&active=eq.true',undefined,'GET'),options=await request('spa_options?select=*&active=eq.true',undefined,'GET');
  assert.equal(services.status,200);assert.equal(options.status,200);
  const swedish=services.data.find(s=>s.name==='Swedish Massage'),facial=services.data.find(s=>s.name==='Signature Facial');
  const option=options.data.find(o=>o.service_id===swedish.id&&o.duration===60),other=options.data.find(o=>o.service_id===facial.id&&o.duration===60);
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(Date.now()+120*86400000)).map(p=>[p.type,p.value])),day=parts.year+'-'+parts.month+'-'+parts.day;
  const q=await request('rpc/spa_quote',{p_option:option.id,p_date:day,p_time:'10:00',p_people:4});assert.equal(q.status,200);
  const email='qa-auto-race-'+randomUUID()+'@example.invalid',requestIds=[randomUUID(),randomUUID()];
  const payload={p_option:option.id,p_date:day,p_time:'10:00',p_people:4,p_name:'QA automatic concurrency',p_phone:'0000000000',p_email:email,p_quote:q.data.quote};
  writeFileSync('.qa/automatic-api-results.json',JSON.stringify({passed:false,email,requestIds},null,2));
  const results=await Promise.all(requestIds.map(p_request=>request('rpc/spa_submit',{...payload,p_request})));
  const accepted=results.filter(r=>r.status===200),rejected=results.filter(r=>r.status===400);
  assert.equal(accepted.length,1,'Exactly one simultaneous request accepted');assert.equal(rejected.length,1);assert.equal(rejected[0].data.code,'P0001');
  assert.equal(accepted[0].data.status,'confirmed','Immediate confirmation, no admin approval');
  const acceptedIndex=results.findIndex(r=>r.status===200);
  const retry=await request('rpc/spa_submit',{...payload,p_request:requestIds[acceptedIndex]});assert.equal(retry.status,200);assert.equal(retry.data.reference,accepted[0].data.reference);assert.equal(retry.data.status,'confirmed');
  const slots=await request('rpc/spa_availability',{p_option:other.id,p_date:day,p_people:1});assert.equal(slots.status,200);assert(!slots.data.some(s=>s.time==='10:00'));assert(slots.data.some(s=>s.time==='11:00'));
  const privateRecords=await request('spa_bookings?select=customer_name',undefined,'GET');assert([401,403].includes(privateRecords.status),'Public bookings never expose customer records');
  writeFileSync('.qa/automatic-api-results.json',JSON.stringify({passed:true,email,requestIds,acceptedReference:accepted[0].data.reference,automaticConfirmation:true,concurrentAccepted:1,concurrentRejected:1,idempotentRetry:true,alternativeTimes:true,recordsPrivate:true},null,2));
  console.log('PASS live customer API: simultaneous submissions accept exactly one confirmed appointment; loser gets immediate availability error; safe confirmation retry returns same reference; full time removed across services and alternatives offered; customer records remain private. Fixture recorded for cleanup.');
})().catch(error=>{console.error(error);process.exitCode=1;});
