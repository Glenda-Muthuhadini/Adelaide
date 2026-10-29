begin;
create temporary table qa_image_users(kind text,id uuid,sid uuid);
insert into qa_image_users select kind,gen_random_uuid(),gen_random_uuid() from unnest(array['owner','staff','customer','revoked']) kind;
insert into auth.users(id,email) select id,'qa-image-'||kind||'@example.invalid' from qa_image_users;
insert into auth.sessions(id,user_id) select sid,id from qa_image_users where kind<>'revoked';
insert into public.spa_admins(user_id,role) select id,case when kind='owner' then 'owner' else 'admin' end from qa_image_users where kind<>'customer';
grant select on qa_image_users to authenticated,anon;
set local role authenticated;
do $$ declare u record; rejected boolean; begin
 for u in select * from qa_image_users loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u.id,'role','authenticated','session_id',u.sid)::text,true);
  rejected:=false;
  begin insert into storage.objects(bucket_id,name) values('spa-catalogue','catalogue/'||gen_random_uuid()||'.jpg'); exception when insufficient_privilege then rejected:=true;end;
  assert rejected=(u.kind in ('customer','revoked')),u.kind||' upload permission';
 end loop;
 select * into u from qa_image_users where kind='owner';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u.id,'role','authenticated','session_id',u.sid)::text,true);
 rejected:=false;
 begin insert into storage.objects(bucket_id,name) values('spa-catalogue','catalogue/'||gen_random_uuid()||'.svg');exception when insufficient_privilege then rejected:=true;end;assert rejected,'SVG path denied';
 rejected:=false;
 begin insert into storage.objects(bucket_id,name) values('spa-catalogue','outside-folder.jpg');exception when insufficient_privilege then rejected:=true;end;assert rejected,'Incorrect upload folder denied';
 assert (select count(*) from storage.objects where bucket_id='spa-catalogue')=2,'Authorised staff can view bucket metadata';
end; $$;
set local role anon;
select set_config('request.jwt.claims','{}',true);
do $$ declare rejected boolean:=false;begin
 begin insert into storage.objects(bucket_id,name) values('spa-catalogue','catalogue/'||gen_random_uuid()||'.png');exception when insufficient_privilege then rejected:=true;end;assert rejected,'Guest upload denied';
 assert (select count(*) from storage.objects where bucket_id='spa-catalogue')=0,'Guests cannot list bucket metadata';
end; $$;
reset role;
do $$ begin
 assert (select public and file_size_limit=5242880 and allowed_mime_types=array['image/jpeg','image/png','image/webp'] from storage.buckets where id='spa-catalogue');
end; $$;
rollback;
