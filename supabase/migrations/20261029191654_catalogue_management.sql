alter table public.spa_services add column category text not null default 'other' check (category in ('massages','facials','other','addons','packages'));
alter table public.spa_services add column description text not null default '' check (length(description)<=2000);
alter table public.spa_services add column inclusions text[] not null default '{}';
alter table public.spa_services add column image_path text not null default '' check (length(image_path)<=500);
alter table public.spa_services add column base_price_cents integer check (base_price_cents between 0 and 10000000);
alter table public.spa_services add column deleted_at timestamptz;

create table public.spa_promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(trim(name)) between 1 and 120),
  description text not null default '' check(length(description)<=2000),
  inclusions text[] not null default '{}',
  image_path text not null default '' check(length(image_path)<=500),
  pricing jsonb not null default '[]' check(jsonb_typeof(pricing)='array'),
  starts_on date,
  ends_on date,
  active boolean not null default true,
  check(ends_on is null or starts_on is null or ends_on>=starts_on)
);
create unique index spa_promotions_name_idx on public.spa_promotions(lower(name));
alter table public.spa_promotions enable row level security;
revoke all on public.spa_promotions from public,anon,authenticated;
grant select on public.spa_promotions to authenticated;
create policy admin_read on public.spa_promotions for select to authenticated using ((select spa_private.is_admin()));

alter table public.spa_addons add column standalone boolean not null default false;
alter table public.spa_addons add column pricing jsonb not null default '[]' check(jsonb_typeof(pricing)='array');
create table public.spa_addon_promotions (
  addon_id uuid not null references public.spa_addons(id) on delete cascade,
  promotion_id uuid not null references public.spa_promotions(id) on delete cascade,
  primary key(addon_id,promotion_id)
);
create index spa_addon_promotions_promotion_idx on public.spa_addon_promotions(promotion_id);
alter table public.spa_addon_promotions enable row level security;
revoke all on public.spa_addon_promotions from public,anon,authenticated;
grant select on public.spa_addon_promotions to authenticated;
create policy admin_read on public.spa_addon_promotions for select to authenticated using ((select spa_private.is_admin()));

-- Only catalogue APIs perform writes; the same lock also serialises reservations.
create function spa_private.validate_pricing(p_rows jsonb) returns void language plpgsql immutable security invoker set search_path='' as $$
declare rate jsonb; begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>30 then raise exception 'Enter up to 30 pricing options.'; end if;
  for rate in select * from jsonb_array_elements(p_rows) loop
    if length(trim(coalesce(rate->>'label',''))) not between 1 and 120 then raise exception 'Each price needs a label.'; end if;
    if rate->>'unit' is null or rate->>'unit' not in ('flat','per_person','per_couple','per_group') then raise exception 'Choose a price basis.'; end if;
    if rate->>'kind'='fixed' then
      if (rate->>'price_cents') is null or (rate->>'price_cents')::integer not between 0 and 10000000 then raise exception 'Enter a valid price.'; end if;
    elsif rate->>'kind'='discount' then
      if (rate->>'discount_percent') is null or (rate->>'discount_percent')::numeric not between 0 and 100 then raise exception 'Discounts must be between 0 and 100 percent.'; end if;
    else raise exception 'Choose a price or percentage discount.';
    end if;
  end loop;
end; $$;
revoke all on function spa_private.validate_pricing(jsonb) from public,anon,authenticated;

create function spa_private.save_service(p_data jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare sid uuid; opt jsonb; selected_durations integer[]:='{}'; begin
  if not spa_private.is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  perform 1 from public.spa_settings where id for update;
  if length(trim(coalesce(p_data->>'name',''))) not between 1 and 120 then raise exception 'Enter a service name.'; end if;
  if jsonb_typeof(p_data->'options') is distinct from 'array' or jsonb_array_length(p_data->'options')>3 then raise exception 'Choose the supported duration options.'; end if;
  sid:=nullif(p_data->>'id','')::uuid;
  if sid is not null and not exists(select 1 from public.spa_services where id=sid and deleted_at is null) then raise exception 'Service not found.'; end if;
  if exists(select 1 from public.spa_services s where lower(s.name)=lower(trim(p_data->>'name')) and (sid is null or s.id<>sid)) then raise exception 'A service with that name already exists.'; end if;
  if sid is null then
    insert into public.spa_services(name) values(trim(p_data->>'name')) returning id into sid;
  end if;
  update public.spa_services set name=trim(p_data->>'name'),category=p_data->>'category',description=coalesce(p_data->>'description',''),
    inclusions=array(select jsonb_array_elements_text(coalesce(p_data->'inclusions','[]'))),image_path=coalesce(p_data->>'image_path',''),
    base_price_cents=nullif(p_data->>'base_price_cents','')::integer,preparation_minutes=nullif(p_data->>'preparation_minutes','')::integer,
    active=coalesce((p_data->>'active')::boolean,true) where id=sid;
  for opt in select * from jsonb_array_elements(p_data->'options') loop
    if (opt->>'duration') is null or (opt->>'duration')::integer not in (30,60,90) or (opt->>'duration')::integer=any(selected_durations) then raise exception 'Select each supported duration only once.'; end if;
    selected_durations:=array_append(selected_durations,(opt->>'duration')::integer);
    insert into public.spa_options(service_id,duration,price_cents,price_people,active)
      values(sid,(opt->>'duration')::integer,(opt->>'price_cents')::integer,(opt->>'price_people')::integer,true)
      on conflict(service_id,duration) do update set price_cents=excluded.price_cents,price_people=excluded.price_people,active=true;
  end loop;
  update public.spa_options set active=false where service_id=sid and not(duration=any(selected_durations));
  return jsonb_build_object('id',sid);
end; $$;

create function spa_private.save_promotion(p_data jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare pid uuid; begin
  if not spa_private.is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  perform 1 from public.spa_settings where id for update;
  if length(trim(coalesce(p_data->>'name',''))) not between 1 and 120 then raise exception 'Enter a promotion name.'; end if;
  perform spa_private.validate_pricing(p_data->'pricing');
  if jsonb_array_length(p_data->'pricing')=0 then raise exception 'Add at least one price or discount.'; end if;
  pid:=nullif(p_data->>'id','')::uuid;
  if pid is not null and not exists(select 1 from public.spa_promotions where id=pid) then raise exception 'Promotion not found.'; end if;
  if exists(select 1 from public.spa_promotions p where lower(p.name)=lower(trim(p_data->>'name')) and (pid is null or p.id<>pid)) then raise exception 'A promotion with that name already exists.'; end if;
  if pid is null then insert into public.spa_promotions(name) values(trim(p_data->>'name')) returning id into pid; end if;
  update public.spa_promotions set name=trim(p_data->>'name'),description=coalesce(p_data->>'description',''),inclusions=array(select jsonb_array_elements_text(coalesce(p_data->'inclusions','[]'))),
    image_path=coalesce(p_data->>'image_path',''),pricing=p_data->'pricing',starts_on=nullif(p_data->>'starts_on','')::date,ends_on=nullif(p_data->>'ends_on','')::date,
    active=coalesce((p_data->>'active')::boolean,true) where id=pid;
  return jsonb_build_object('id',pid);
end; $$;

create or replace function spa_private.save_addon(p_data jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare aid uuid; service_ids uuid[]; promotion_ids uuid[]; is_standalone boolean; begin
  if not spa_private.is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  perform 1 from public.spa_settings where id for update;
  if length(trim(coalesce(p_data->>'name',''))) not between 1 and 120 then raise exception 'Enter an add-on name.'; end if;
  if jsonb_typeof(p_data->'service_ids') is distinct from 'array' then raise exception 'Choose applicable services.'; end if;
  if jsonb_typeof(coalesce(p_data->'promotion_ids','[]'))<>'array' then raise exception 'Choose applicable promotions.'; end if;
  select coalesce(array_agg(distinct value::uuid),'{}') into service_ids from jsonb_array_elements_text(p_data->'service_ids');
  select coalesce(array_agg(distinct value::uuid),'{}') into promotion_ids from jsonb_array_elements_text(coalesce(p_data->'promotion_ids','[]'));
  is_standalone:=coalesce((p_data->>'standalone')::boolean,false);
  if cardinality(service_ids)+cardinality(promotion_ids)=0 and not is_standalone then raise exception 'Select at least one service or promotion, or mark this as a standalone treatment.'; end if;
  if exists(select 1 from unnest(service_ids) x where not exists(select 1 from public.spa_services s where s.id=x and s.deleted_at is null)) then raise exception 'A selected service is unavailable.'; end if;
  if exists(select 1 from unnest(promotion_ids) x where not exists(select 1 from public.spa_promotions p where p.id=x)) then raise exception 'A selected promotion is unavailable.'; end if;
  perform spa_private.validate_pricing(coalesce(p_data->'pricing','[]'));
  aid:=nullif(p_data->>'id','')::uuid;
  if aid is not null and not exists(select 1 from public.spa_addons where id=aid) then raise exception 'Add-on not found.'; end if;
  if exists(select 1 from public.spa_addons a where lower(a.name)=lower(trim(p_data->>'name')) and (aid is null or a.id<>aid)) then raise exception 'An add-on with that name already exists.'; end if;
  if aid is null then
    insert into public.spa_addons(name,price_cents) values(trim(p_data->>'name'),(p_data->>'price_cents')::integer) returning id into aid;
  end if;
  update public.spa_addons set name=trim(p_data->>'name'),price_cents=(p_data->>'price_cents')::integer,description=coalesce(p_data->>'description',''),
    standalone=is_standalone,pricing=coalesce(p_data->'pricing','[]'),active=coalesce((p_data->>'active')::boolean,true),updated_at=clock_timestamp() where id=aid;
  delete from public.spa_addon_services where addon_id=aid;
  insert into public.spa_addon_services select aid,unnest(service_ids);
  delete from public.spa_addon_promotions where addon_id=aid;
  insert into public.spa_addon_promotions select aid,unnest(promotion_ids);
  return jsonb_build_object('id',aid);
end; $$;

create function spa_private.delete_catalogue(p_kind text,p_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  if not spa_private.is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  perform 1 from public.spa_settings where id for update;
  if p_kind='service' then
    if exists(select 1 from public.spa_sessions s join public.spa_bookings b on b.id=s.booking_id where s.service_id=p_id and s.reserved_until>clock_timestamp()
      and (b.status='confirmed' or (b.status='pending' and b.hold_until>clock_timestamp()))) then raise exception 'This service has active appointments. Cancel or move those appointments before deleting it.'; end if;
    update public.spa_services set deleted_at=clock_timestamp(),active=false where id=p_id and deleted_at is null;
    if not found then raise exception 'Service not found.'; end if;
    update public.spa_options set active=false where service_id=p_id;
    delete from public.spa_addon_services where service_id=p_id;
  elsif p_kind='addon' then delete from public.spa_addons where id=p_id;
  elsif p_kind='promotion' then delete from public.spa_promotions where id=p_id;
  else raise exception 'Unknown catalogue type.';
  end if;
  return jsonb_build_object('ok',true);
end; $$;

create or replace function spa_private.admin_data() returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  if not spa_private.is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  return jsonb_build_object(
    'staff',(select coalesce(jsonb_agg(jsonb_build_object('id',a.user_id,'name',case when a.role='owner' then 'Owner' else coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email) end,'email',u.email,'role',a.role,'active',a.active) order by a.role desc,u.email),'[]') from public.spa_admins a join auth.users u on u.id=a.user_id),
    'promotions',(select coalesce(jsonb_agg(p order by p.name),'[]') from public.spa_promotions p),
    'addons',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('service_ids',(select coalesce(jsonb_agg(l.service_id),'[]') from public.spa_addon_services l where l.addon_id=a.id),
      'promotion_ids',(select coalesce(jsonb_agg(l.promotion_id),'[]') from public.spa_addon_promotions l where l.addon_id=a.id)) order by a.name),'[]') from public.spa_addons a),
    'bookings',(select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('status',case when b.status='pending' and b.hold_until<=clock_timestamp() then 'expired' else b.status end,
      'sessions',(select coalesce(jsonb_agg(s order by s.starts_at),'[]') from public.spa_sessions s where s.booking_id=b.id),'notes',(select n.body from public.spa_notes n where n.booking_id=b.id)) order by b.created_at desc),'[]') from public.spa_bookings b),
    'services',(select coalesce(jsonb_agg(s order by name),'[]') from public.spa_services s where deleted_at is null),
    'options',(select coalesce(jsonb_agg(o),'[]') from public.spa_options o join public.spa_services s on s.id=o.service_id where s.deleted_at is null),
    'settings',(select to_jsonb(c) from public.spa_settings c where id),'hours',(select jsonb_agg(h order by weekday) from public.spa_hours h),
    'blocks',(select coalesce(jsonb_agg(b order by starts_at),'[]') from public.spa_blocks b));
end; $$;

create function public.spa_admin_save_service(p_data jsonb) returns jsonb language sql volatile security invoker set search_path='' as $$ select spa_private.save_service(p_data); $$;
create function public.spa_admin_save_promotion(p_data jsonb) returns jsonb language sql volatile security invoker set search_path='' as $$ select spa_private.save_promotion(p_data); $$;
create function public.spa_admin_delete_catalogue(p_kind text,p_id uuid) returns jsonb language sql volatile security invoker set search_path='' as $$ select spa_private.delete_catalogue(p_kind,p_id); $$;
revoke all on function spa_private.save_service(jsonb),spa_private.save_promotion(jsonb),spa_private.delete_catalogue(text,uuid),public.spa_admin_save_service(jsonb),public.spa_admin_save_promotion(jsonb),public.spa_admin_delete_catalogue(text,uuid) from public,anon,authenticated;
grant execute on function spa_private.save_service(jsonb),spa_private.save_promotion(jsonb),spa_private.delete_catalogue(text,uuid),public.spa_admin_save_service(jsonb),public.spa_admin_save_promotion(jsonb),public.spa_admin_delete_catalogue(text,uuid) to authenticated;

-- Retire the two unpublished placeholder service rows, preserving any history.
update public.spa_services set deleted_at=clock_timestamp() where name in ('Foot Massage','Body Scrub') and not active
  and not exists(select 1 from public.spa_options o where o.service_id=spa_services.id);

-- Snapshot extracted from the published HTML; missing durations stay unspecified.
do $seed$
declare source jsonb:=$catalogue${"services":[{"name":"Swedish Massage","category":"massages","description":"Relaxing full-body massage to ease tension and improve circulation.","inclusions":[],"image_path":"assets/images/gallery/web/professional-spa-massage-therapy.jpg","prices":[{"label":"60 Minutes","display":"R500"},{"label":"90 Minutes","display":"R750"}],"base_price_cents":null,"options":[{"duration":60,"price_cents":50000,"price_people":1},{"duration":90,"price_cents":75000,"price_people":1}]},{"name":"Deep Tissue Massage","category":"massages","description":"Focused pressure to relieve muscle tension and promote recovery.","inclusions":[],"image_path":"assets/images/gallery/web/serene-teal-walled-spa-massage.jpg","prices":[{"label":"60 Minutes","display":"R550"},{"label":"90 Minutes","display":"R800"}],"base_price_cents":null,"options":[{"duration":60,"price_cents":55000,"price_people":1},{"duration":90,"price_cents":80000,"price_people":1}]},{"name":"Hot Stone Massage","category":"massages","description":"Soothing warmth for deep relaxation and stress relief.","inclusions":[],"image_path":"assets/images/gallery/web/tranquil-hot-stone-spa-treatment.jpg","prices":[{"label":"60 Minutes","display":"R600"},{"label":"90 Minutes","display":"R850"}],"base_price_cents":null,"options":[{"duration":60,"price_cents":60000,"price_people":1},{"duration":90,"price_cents":85000,"price_people":1}]},{"name":"Sports Massage","category":"massages","description":"","inclusions":[],"image_path":"assets/images/gallery/web/tranquil-spa-massage-in-teal-room.jpg","prices":[{"label":"30 Minutes","display":"R280"},{"label":"60 Minutes","display":"R600"}],"base_price_cents":null,"options":[{"duration":30,"price_cents":28000,"price_people":1},{"duration":60,"price_cents":60000,"price_people":1}]},{"name":"Adelaide Signature Massage","category":"massages","description":"","inclusions":[],"image_path":"assets/images/hero/Serene%20Warm-Lit%20Spa%20Massage.png","prices":[{"label":"90 Minutes","display":"R900"}],"base_price_cents":null,"options":[{"duration":90,"price_cents":90000,"price_people":1}]},{"name":"Signature Facial","category":"facials","description":"Professional services to cleanse, refresh and nourish your skin.","inclusions":[],"image_path":"assets/images/gallery/web/warm-spa-facial-treatment.jpg","prices":[{"label":"30 Minutes","display":"R280"},{"label":"60 Minutes","display":"R400"}],"base_price_cents":null,"options":[{"duration":30,"price_cents":28000,"price_people":1},{"duration":60,"price_cents":40000,"price_people":1}]},{"name":"Neck & Shoulder Massage","category":"other","description":"","inclusions":[],"image_path":"assets/images/gallery/web/serene-neck-and-shoulder-massage.jpg","prices":[{"label":"Price","display":"R220"}],"base_price_cents":22000,"options":[]},{"name":"Scalp Massage","category":"other","description":"","inclusions":[],"image_path":"assets/images/gallery/web/serene-spa-scalp-massage.jpg","prices":[{"label":"Price","display":"R120"}],"base_price_cents":12000,"options":[]},{"name":"Hand Massage","category":"other","description":"","inclusions":[],"image_path":"assets/images/gallery/web/serene-teal-spa-hand-massage.jpg","prices":[{"label":"Price","display":"R100"}],"base_price_cents":10000,"options":[]},{"name":"Hand & Shoulder Massage","category":"other","description":"","inclusions":[],"image_path":"assets/images/gallery/web/tranquil-teal-room-massage-session.jpg","prices":[{"label":"Price","display":"R280"}],"base_price_cents":28000,"options":[]},{"name":"Body Back Massage","category":"other","description":"","inclusions":[],"image_path":"assets/images/gallery/web/professional-spa-massage-therapy.jpg","prices":[{"label":"Price","display":"R350"}],"base_price_cents":35000,"options":[]},{"name":"Manual Lymph Drainage","category":"addons","description":"","inclusions":[],"image_path":"assets/images/gallery/web/serene-teal-spa-abdominal-massage.jpg","prices":[{"label":"60 Minutes","display":"R680"},{"label":"90 Minutes","display":"R850"}],"base_price_cents":null,"options":[{"duration":60,"price_cents":68000,"price_people":1},{"duration":90,"price_cents":85000,"price_people":1}]},{"name":"Reflexology Massage","category":"addons","description":"Targeted pressure points to encourage relaxation and overall well-being.","inclusions":[],"image_path":"assets/images/gallery/web/tranquil-teal-walled-reflexology-spa.jpg","prices":[{"label":"60 Minutes","display":"R500"}],"base_price_cents":null,"options":[{"duration":60,"price_cents":50000,"price_people":1}]},{"name":"Pregnancy Massage","category":"addons","description":"","inclusions":[],"image_path":"assets/images/gallery/web/serene-prenatal-massage-in-a-modern-spa.jpg","prices":[{"label":"60 Minutes","display":"R450"}],"base_price_cents":null,"options":[{"duration":60,"price_cents":45000,"price_people":1}]},{"name":"Ultimate Relaxation","category":"packages","description":"Includes:","inclusions":["60-minute full body massage","Hot stones","Refreshing scalp massage"],"image_path":"assets/images/gallery/web/serene-spa-retreat-with-rose-petals.jpg","prices":[{"label":"For one person","display":"R450"}],"base_price_cents":45000,"options":[]},{"name":"Couples Retreat","category":"packages","description":"","inclusions":[],"image_path":"assets/images/gallery/web/tranquil-teal-twin-treatment-room.jpg","prices":[{"label":"60-Minute Couples Massage Side by Side","display":"R500"},{"label":"90-Minute Couples Massage with hot stones","display":"R1,100"}],"base_price_cents":null,"options":[{"duration":60,"price_cents":50000,"price_people":2},{"duration":90,"price_cents":110000,"price_people":2}]}],"promotions":[{"name":"Me-Time Special","inclusions":["60-minute Swedish Massage","Complimentary drink","Gown & slippers"],"prices":[{"label":"Per person","display":"R380 P/P"},{"label":"Hot stones","display":"R100"}],"image_path":"assets/images/gallery/web/relaxed-garden-spa-portrait.jpg","pricing":[{"label":"Per person","kind":"fixed","price_cents":38000,"unit":"per_person"}]},{"name":"Couples Massage Specials","inclusions":["60 minutes","Complimentary drink","Gown & slippers","Relaxation experience"],"prices":[{"label":"Swedish Couples Massage","display":"R500"},{"label":"Hot Stone Couples Massage","display":"R700"},{"label":"Hot Stones","display":"R100"},{"label":"Body Scrub","display":"R100"},{"label":"Foot Massage","display":"R150"},{"label":"Sip & Paint","display":"R100 p/p"}],"image_path":"assets/images/gallery/web/tranquil-teal-twin-treatment-room.jpg","pricing":[{"label":"Swedish Couples Massage","kind":"fixed","price_cents":50000,"unit":"per_couple"},{"label":"Hot Stone Couples Massage","kind":"fixed","price_cents":70000,"unit":"per_couple"}]},{"name":"Birthday Package","inclusions":["60-minute Swedish Massage","Foot massage / Hot stones","Complimentary drink","Snack platter","Small gift"],"prices":[{"label":"Price","display":"R600"}],"image_path":"assets/images/gallery/web/spa-welcome-with-a-birthday-message.jpg","pricing":[{"label":"Price","kind":"fixed","price_cents":60000,"unit":"flat"}]},{"name":"Group Wellness Special","inclusions":["60-minute massage","Hot stones","Lunch (wings & chips)","Complimentary drink (green tea / wine / juice)"],"prices":[{"label":"1 Person","display":"R550"},{"label":"2 People","display":"R900"},{"label":"3 People","display":"R1,200"},{"label":"4 People","display":"R1,600"},{"label":"Groups of 10 people","display":"20% discount"}],"image_path":"assets/images/gallery/web/joyful-outdoor-spa-celebration.jpg","pricing":[{"label":"1 Person","kind":"fixed","price_cents":55000,"unit":"per_group"},{"label":"2 People","kind":"fixed","price_cents":90000,"unit":"per_group"},{"label":"3 People","kind":"fixed","price_cents":120000,"unit":"per_group"},{"label":"4 People","kind":"fixed","price_cents":160000,"unit":"per_group"},{"label":"Groups of 10 people","kind":"discount","discount_percent":20,"unit":"per_group"}]}],"addons":[{"name":"Manual Lymph Drainage","description":"","standalone":true,"price_cents":68000,"pricing":[{"label":"60 Minutes","kind":"fixed","price_cents":68000,"unit":"per_person"},{"label":"90 Minutes","kind":"fixed","price_cents":85000,"unit":"per_person"}],"promotions":[]},{"name":"Reflexology Massage","description":"Targeted pressure points to encourage relaxation and overall well-being.","standalone":true,"price_cents":50000,"pricing":[{"label":"60 Minutes","kind":"fixed","price_cents":50000,"unit":"per_person"}],"promotions":[]},{"name":"Pregnancy Massage","description":"","standalone":true,"price_cents":45000,"pricing":[{"label":"60 Minutes","kind":"fixed","price_cents":45000,"unit":"per_person"}],"promotions":[]},{"name":"Hot Stones","description":"","standalone":false,"price_cents":10000,"pricing":[{"label":"Price","kind":"fixed","price_cents":10000,"unit":"flat"}],"promotions":["Me-Time Special","Couples Massage Specials"]},{"name":"Body Scrub","description":"","standalone":false,"price_cents":10000,"pricing":[{"label":"Price","kind":"fixed","price_cents":10000,"unit":"flat"}],"promotions":["Couples Massage Specials"]},{"name":"Foot Massage","description":"","standalone":false,"price_cents":15000,"pricing":[{"label":"Price","kind":"fixed","price_cents":15000,"unit":"flat"}],"promotions":["Couples Massage Specials"]},{"name":"Sip & Paint","description":"","standalone":false,"price_cents":10000,"pricing":[{"label":"Price","kind":"fixed","price_cents":10000,"unit":"per_person"}],"promotions":["Couples Massage Specials"]}]}$catalogue$::jsonb; row jsonb; option_row jsonb; sid uuid; aid uuid; begin
  for row in select * from jsonb_array_elements(source->'services') loop
    insert into public.spa_services(name,category,description,inclusions,image_path,base_price_cents)
      values(row->>'name',row->>'category',row->>'description',array(select jsonb_array_elements_text(row->'inclusions')),row->>'image_path',(row->>'base_price_cents')::integer)
      on conflict(name) do update set category=excluded.category,description=excluded.description,inclusions=excluded.inclusions,image_path=excluded.image_path,base_price_cents=excluded.base_price_cents returning id into sid;
    for option_row in select * from jsonb_array_elements(row->'options') loop
      insert into public.spa_options(service_id,duration,price_cents,price_people) values(sid,(option_row->>'duration')::integer,(option_row->>'price_cents')::integer,(option_row->>'price_people')::integer) on conflict(service_id,duration) do nothing;
    end loop;
  end loop;
  for row in select * from jsonb_array_elements(source->'promotions') loop
    insert into public.spa_promotions(name,inclusions,image_path,pricing) values(row->>'name',array(select jsonb_array_elements_text(row->'inclusions')),row->>'image_path',row->'pricing') on conflict(lower(name)) do nothing;
  end loop;
  for row in select * from jsonb_array_elements(source->'addons') loop
    insert into public.spa_addons(name,description,price_cents,standalone,pricing) values(row->>'name',row->>'description',(row->>'price_cents')::integer,(row->>'standalone')::boolean,row->'pricing') on conflict(lower(name)) do update set name=excluded.name returning id into aid;
    insert into public.spa_addon_promotions(addon_id,promotion_id) select aid,p.id from public.spa_promotions p where p.name in (select jsonb_array_elements_text(row->'promotions')) on conflict do nothing;
  end loop;
end; $seed$;
notify pgrst,'reload schema';
