const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const source=fs.readFileSync('js/spa-api.js','utf8');
const photo=new Blob([fs.readFileSync('assets/images/gallery/web/professional-spa-massage-therapy.jpg')],{type:'image/jpeg'});
function create({session=true,ok=true}={}){
 const calls=[],window={dispatchEvent(){}},stored=session?JSON.stringify({access_token:'qa-upload-token',expires_at:Date.now()/1000+3600}):null;
 vm.runInNewContext(source,{window,sessionStorage:{getItem:()=>stored},fetch:async(path,args)=>{calls.push({path,args});return {ok,json:async()=>({message:'Storage denied this upload.'})};},AbortSignal,Event,Intl,URL,URLSearchParams,Date,Uint8Array,crypto:webcrypto});
 return {api:window.Spa,calls};
}
(async()=>{
 const c=create(),url=await c.api.uploadImage(photo);assert.equal(c.calls.length,1);const request=c.calls[0];
 assert(request.path.includes('/storage/v1/object/spa-catalogue/catalogue/'));assert(url.includes('/storage/v1/object/public/spa-catalogue/catalogue/'));assert(url.endsWith('.jpg'));
 assert.equal(request.args.body,photo);assert.equal(request.args.headers.Authorization,'Bearer qa-upload-token');assert.equal(request.args.headers['Content-Type'],'image/jpeg');assert.equal(request.args.headers['x-upsert'],'false');
 const second=await c.api.uploadImage(photo);assert.notEqual(url,second,'Replacement gets a unique URL without stale cached image');
 await assert.rejects(c.api.uploadImage(new Blob(['<svg/>'],{type:'image/svg+xml'})),/JPG, PNG or WebP/);
 await assert.rejects(c.api.uploadImage({type:'image/png',size:6*1024*1024}),/5 MB/);
 await assert.rejects(c.api.uploadImage(new Blob(['not a photo'],{type:'image/png'})),/not a valid/);
 assert.equal(c.calls.length,2,'Invalid files never leave the browser');
 const guest=create({session:false});await assert.rejects(guest.api.uploadImage(photo),/sign in/);assert.equal(guest.calls.length,0);
 const denied=create({ok:false});await assert.rejects(denied.api.uploadImage(photo),/Storage denied/);
 console.log('PASS upload API: real JPEG bytes, authenticated binary upload, public photo URL, unique replacements, MIME/size/signature checks, guest denial and upload error feedback. Mock HTTP; live RLS verified in SQL.');
})().catch(error=>{console.error(error);process.exitCode=1;});
