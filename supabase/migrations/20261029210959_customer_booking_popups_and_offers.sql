-- Offer and add-on snapshots stay with the booking after catalogue changes.
alter table public.spa_bookings add column booking_details jsonb not null default '{}';
alter table public.spa_bookings add column customer_fingerprint text;
alter table public.spa_addons add column extra_minutes integer not null default 0 check(extra_minutes between 0 and 240 and extra_minutes%30=0);

create or replace function spa_private.customer_plan_base(p_option uuid,p_date date,p_time time,p_people integer,p_exclude uuid default null,p_extra integer default 0)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  opt public.spa_options; svc public.spa_services; cfg public.spa_settings; hrs public.spa_hours;
  cursor_min integer; buffer_min integer; remaining integer; batch integer; free integer;
  occupied integer; same_service integer; tick timestamptz; start_at timestamptz; end_at timestamptz;
  release_at timestamptz; plan_rows jsonb := '[]'; result jsonb;
begin
  if p_option is null or p_date is null or p_time is null or p_people is null or p_people not between 1 and 192 then
    raise exception 'Choose a service, date, start time and 1 to 192 people.';
  end if;
  if p_exclude is not null and not spa_private.is_admin() then raise exception 'Admin access required.'; end if;
  select * into opt from public.spa_options where id=p_option and active;
  if not found then raise exception 'This treatment option is unavailable.'; end if;
  select * into svc from public.spa_services where id=opt.service_id and active;
  if not found then raise exception 'This service is unavailable.'; end if;
  if p_people % opt.price_people <> 0 then raise exception 'This couples option requires an even number of people.'; end if;
  select * into cfg from public.spa_settings where id;
  select * into hrs from public.spa_hours where weekday=extract(dow from p_date)::integer;
  if not found or hrs.closed then raise exception 'The spa is closed on this day.'; end if;
  cursor_min := extract(hour from p_time)::integer*60 + extract(minute from p_time)::integer;
  if extract(second from p_time) <> 0 or cursor_min%30 <> 0 or cursor_min<hrs.opens then raise exception 'Choose an available half-hour start time.'; end if;
  if p_date < (clock_timestamp() at time zone 'Africa/Johannesburg')::date or p_date > (clock_timestamp() at time zone 'Africa/Johannesburg')::date+365 then raise exception 'Choose a date within the next year.'; end if;
  if p_extra is null or p_extra not between 0 and 240 or p_extra%30<>0 then raise exception 'Invalid extra treatment time.'; end if;
  opt.duration := opt.duration+p_extra;
  buffer_min := coalesce(svc.preparation_minutes,cfg.preparation_minutes);
  remaining := p_people;
  while remaining>0 loop
    if cursor_min+opt.duration+buffer_min>hrs.closes then raise exception 'All sessions and preparation must fit within operating hours.'; end if;
    start_at := (p_date::timestamp + make_interval(mins=>cursor_min)) at time zone 'Africa/Johannesburg';
    end_at := start_at + make_interval(mins=>opt.duration);
    release_at := end_at + make_interval(mins=>buffer_min);
    if start_at<clock_timestamp() then raise exception 'Choose a future starting time.'; end if;
    if exists(select 1 from public.spa_blocks b where (b.service_id is null or b.service_id=svc.id) and b.starts_at<release_at and b.ends_at>start_at) then raise exception 'This time is blocked. Please choose another start.'; end if;
    free := 4;
    for tick in select generate_series(start_at,release_at-interval '30 minutes',interval '30 minutes') loop
      select coalesce(sum(s.people),0),coalesce(sum(s.people) filter(where s.service_id=svc.id),0)
      into occupied,same_service from public.spa_sessions s join public.spa_bookings b on b.id=s.booking_id
      where (p_exclude is null or b.id<>p_exclude)
      and (b.status in ('confirmed','completed') or (b.status='pending' and b.hold_until>clock_timestamp()))
      and s.starts_at<tick+interval '30 minutes' and s.reserved_until>tick;
      free := least(free,4-occupied,4-same_service);
    end loop;
    batch := least(remaining,free);
    batch := batch-batch%opt.price_people;
    if batch<1 or (p_people<=4 and batch<remaining) then raise exception 'There is not enough capacity throughout this treatment. Choose another time.'; end if;
    plan_rows := plan_rows || jsonb_build_array(jsonb_build_object('starts_at',start_at,'ends_at',end_at,'reserved_until',release_at,'people',batch));
    remaining := remaining-batch;
    cursor_min := cursor_min+opt.duration+buffer_min;
  end loop;
  result := jsonb_build_object('service',svc.name,'option_id',opt.id,'duration',opt.duration,'people',p_people,
    'total_cents',opt.price_cents*(p_people/opt.price_people),'preparation_minutes',buffer_min,'pending_minutes',cfg.pending_minutes,'sessions',plan_rows);
  return result || jsonb_build_object('quote',md5(result::text));
end;
$$;
revoke all on function spa_private.customer_plan_base(uuid,date,time,integer,uuid,integer) from public,anon,authenticated;
create or replace function spa_private.plan(p_option uuid,p_date date,p_time time,p_people integer,p_exclude uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  opt public.spa_options; svc public.spa_services; cfg public.spa_settings; hrs public.spa_hours;
  cursor_min integer; buffer_min integer; remaining integer; batch integer; free integer;
  occupied integer; same_service integer; tick timestamptz; start_at timestamptz; end_at timestamptz;
  release_at timestamptz; plan_rows jsonb := '[]'; result jsonb;
begin
  if p_option is null or p_date is null or p_time is null or p_people is null or p_people not between 1 and 192 then
    raise exception 'Choose a service, date, start time and 1 to 192 people.';
  end if;
  if p_exclude is not null and not spa_private.is_admin() then raise exception 'Admin access required.'; end if;
  select * into opt from public.spa_options where id=p_option and active;
  if not found then raise exception 'This treatment option is unavailable.'; end if;
  select * into svc from public.spa_services where id=opt.service_id and active;
  if not found then raise exception 'This service is unavailable.'; end if;
  if p_people % opt.price_people <> 0 then raise exception 'This couples option requires an even number of people.'; end if;
  select * into cfg from public.spa_settings where id;
  select * into hrs from public.spa_hours where weekday=extract(dow from p_date)::integer;
  if not found or hrs.closed then raise exception 'The spa is closed on this day.'; end if;
  cursor_min := extract(hour from p_time)::integer*60 + extract(minute from p_time)::integer;
  if extract(second from p_time) <> 0 or cursor_min%30 <> 0 or cursor_min<hrs.opens then raise exception 'Choose an available half-hour start time.'; end if;
  if p_date < (clock_timestamp() at time zone 'Africa/Johannesburg')::date or p_date > (clock_timestamp() at time zone 'Africa/Johannesburg')::date+365 then raise exception 'Choose a date within the next year.'; end if;
  if p_exclude is not null then
    opt.duration := opt.duration+coalesce((select (booking_details->>'extra_minutes')::integer from public.spa_bookings where id=p_exclude),0);
  end if;
  buffer_min := coalesce(svc.preparation_minutes,cfg.preparation_minutes);
  remaining := p_people;
  while remaining>0 loop
    if cursor_min+opt.duration+buffer_min>hrs.closes then raise exception 'All sessions and preparation must fit within operating hours.'; end if;
    start_at := (p_date::timestamp + make_interval(mins=>cursor_min)) at time zone 'Africa/Johannesburg';
    end_at := start_at + make_interval(mins=>opt.duration);
    release_at := end_at + make_interval(mins=>buffer_min);
    if start_at<clock_timestamp() then raise exception 'Choose a future starting time.'; end if;
    if exists(select 1 from public.spa_blocks b where (b.service_id is null or b.service_id=svc.id) and b.starts_at<release_at and b.ends_at>start_at) then raise exception 'This time is blocked. Please choose another start.'; end if;
    free := 4;
    for tick in select generate_series(start_at,release_at-interval '30 minutes',interval '30 minutes') loop
      select coalesce(sum(s.people),0),coalesce(sum(s.people) filter(where s.service_id=svc.id),0)
      into occupied,same_service from public.spa_sessions s join public.spa_bookings b on b.id=s.booking_id
      where (p_exclude is null or b.id<>p_exclude)
      and (b.status in ('confirmed','completed') or (b.status='pending' and b.hold_until>clock_timestamp()))
      and s.starts_at<tick+interval '30 minutes' and s.reserved_until>tick;
      free := least(free,4-occupied,4-same_service);
    end loop;
    batch := least(remaining,free);
    batch := batch-batch%opt.price_people;
    if batch<1 or (p_people<=4 and batch<remaining) then raise exception 'There is not enough capacity throughout this treatment. Choose another time.'; end if;
    plan_rows := plan_rows || jsonb_build_array(jsonb_build_object('starts_at',start_at,'ends_at',end_at,'reserved_until',release_at,'people',batch));
    remaining := remaining-batch;
    cursor_min := cursor_min+opt.duration+buffer_min;
  end loop;
  result := jsonb_build_object('service',svc.name,'option_id',opt.id,'duration',opt.duration,'people',p_people,
    'total_cents',opt.price_cents*(p_people/opt.price_people),'preparation_minutes',buffer_min,'pending_minutes',cfg.pending_minutes,'sessions',plan_rows);
  return result || jsonb_build_object('quote',md5(result::text));
end;
$$;

-- Public catalogue exposes only active products and their booking configuration, never staff or customer records.
create function spa_private.customer_catalogue() returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
 'services',(select coalesce(jsonb_agg(to_jsonb(s) order by s.name),'[]') from public.spa_services s where s.active and s.deleted_at is null),
 'options',(select coalesce(jsonb_agg(to_jsonb(o) order by o.duration),'[]') from public.spa_options o join public.spa_services s on s.id=o.service_id where o.active and s.active and s.deleted_at is null),
 'promotions',(select coalesce(jsonb_agg(to_jsonb(p) order by p.name),'[]') from public.spa_promotions p where p.active and (p.ends_on is null or p.ends_on >= (now() at time zone 'Africa/Johannesburg')::date)),
 'addons',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('service_ids',(select coalesce(jsonb_agg(l.service_id),'[]') from public.spa_addon_services l where l.addon_id=a.id),'promotion_ids',(select coalesce(jsonb_agg(l.promotion_id),'[]') from public.spa_addon_promotions l where l.addon_id=a.id)) order by a.name),'[]') from public.spa_addons a where a.active and not a.standalone));
$$;
create function public.spa_customer_catalogue() returns jsonb language sql stable security invoker set search_path='' as $$ select spa_private.customer_catalogue(); $$;

-- Pricing options hold the underlying service/duration plus price basis. The browser never supplies a price.
create function spa_private.customer_quote(p_selection jsonb,p_date date,p_time time,p_people integer) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare opt public.spa_options; promo public.spa_promotions; addon public.spa_addons; rate jsonb; chosen jsonb; line jsonb;
 q jsonb; lines jsonb:='[]'; total integer; extra integer:=0; price integer; base integer; remaining integer; tier jsonb;
 pid uuid; oid uuid; seen uuid[]:='{}'; begin
 if p_people is null or p_people not between 1 and 192 or jsonb_typeof(p_selection) is distinct from 'object' then raise exception 'Choose a valid treatment and group size.'; end if;
 pid:=nullif(p_selection->>'promotion_id','')::uuid;
 if pid is not null then
   select * into promo from public.spa_promotions where id=pid and active and (starts_on is null or p_date>=starts_on) and (ends_on is null or p_date<=ends_on);
   if not found then raise exception 'This offer is unavailable on the selected date.'; end if;
   if coalesce((p_selection->>'rate')::integer,-1)<0 then raise exception 'Choose an offer option.'; end if;
   rate:=promo.pricing->(p_selection->>'rate')::integer;
   oid:=nullif(rate->>'option_id','')::uuid;
   if oid is null then raise exception 'The treatment duration for this offer needs to be configured. Please contact the spa.'; end if;
 else oid:=nullif(p_selection->>'option_id','')::uuid;
 end if;
 select * into opt from public.spa_options where id=oid and active;
 if not found then raise exception 'Choose an available treatment option.'; end if;
 if pid is null then total:=opt.price_cents*(p_people/opt.price_people);
 elsif coalesce((rate->>'group_bundle')::boolean,false) then
   remaining:=p_people;base:=0;
   while remaining>0 loop
     select r into tier from jsonb_array_elements(promo.pricing) r where r->>'kind'='fixed' and coalesce((r->>'group_bundle')::boolean,false) and (r->>'group_people')::integer<=remaining order by (r->>'group_people')::integer desc limit 1;
     if tier is null then raise exception 'No group price is configured for this number of people.'; end if;
     remaining:=remaining-(tier->>'group_people')::integer;base:=base+(tier->>'price_cents')::integer;
   end loop;
   total:=base;
   select r into tier from jsonb_array_elements(promo.pricing) r where r->>'kind'='discount' and (r->>'group_people')::integer=p_people and coalesce((r->>'group_bundle')::boolean,false) limit 1;
   if tier is not null then total:=round(base*(1-(tier->>'discount_percent')::numeric/100)); end if;
 else
   if rate->>'kind'<>'fixed' then raise exception 'This discount needs a configured base price.'; end if;
   if rate->>'unit'='per_couple' and p_people%2<>0 then raise exception 'This couples offer requires an even number of people.'; end if;
   if rate->>'unit'='per_group' and (rate->>'group_people')::integer is distinct from p_people then raise exception 'Choose the matching group size for this offer.'; end if;
   if rate->>'unit'='flat' and p_people<>coalesce((rate->>'group_people')::integer,1) then raise exception 'Choose the advertised number of people for this package.'; end if;
   total:=(rate->>'price_cents')::integer*case rate->>'unit' when 'per_person' then p_people when 'per_couple' then p_people/2 else 1 end;
 end if;
 lines:=jsonb_build_array(jsonb_build_object('name',case when pid is null then (select name from public.spa_services where id=opt.service_id) else promo.name||' — '||case when coalesce((rate->>'group_bundle')::boolean,false) then 'Group experience' else rate->>'label' end end,'total_cents',total));
 chosen:=coalesce(p_selection->'addons','[]');
 if jsonb_typeof(chosen) is distinct from 'array' or jsonb_array_length(chosen)>20 then raise exception 'Choose up to 20 add-ons.'; end if;
 for line in select * from jsonb_array_elements(chosen) loop
   select * into addon from public.spa_addons where id=(line->>'id')::uuid and active and not standalone;
   if not found or addon.id=any(seen) then raise exception 'An add-on is unavailable or selected twice.'; end if;
   if not ((pid is not null and exists(select 1 from public.spa_addon_promotions where promotion_id=pid and addon_id=addon.id)) or (pid is null and exists(select 1 from public.spa_addon_services where service_id=opt.service_id and addon_id=addon.id))) then raise exception 'This add-on is not available for the selected treatment.'; end if;
   seen:=array_append(seen,addon.id);
   if coalesce((line->>'rate')::integer,-1)<0 then raise exception 'Choose an add-on price option.'; end if;
   rate:=addon.pricing->(line->>'rate')::integer;
   if rate is null and jsonb_array_length(addon.pricing)=0 and (line->>'rate')::integer=0 then rate:=jsonb_build_object('kind','fixed','price_cents',addon.price_cents,'unit','flat','label','Price'); end if;
   if rate is null or rate->>'kind'<>'fixed' then raise exception 'This add-on price is unavailable.'; end if;
   if rate->>'unit'='per_couple' and p_people%2<>0 then raise exception 'This add-on requires an even number of people.'; end if;
   if rate->>'unit'='per_group' and (rate->>'group_people')::integer is distinct from p_people then raise exception 'Choose the matching group size for this add-on.'; end if;
   price:=(rate->>'price_cents')::integer*case rate->>'unit' when 'per_person' then p_people when 'per_couple' then p_people/2 else 1 end;
   total:=total+price;extra:=extra+addon.extra_minutes;
   lines:=lines||jsonb_build_array(jsonb_build_object('name',addon.name||' — '||coalesce(rate->>'label','Price'),'total_cents',price));
 end loop;
 q:=spa_private.customer_plan_base(opt.id,p_date,p_time,p_people,null,extra);
 q:=(q-'quote')||jsonb_build_object('service',lines->0->>'name','total_cents',total,'lines',lines,'extra_minutes',extra,'selection',p_selection);
 return q||jsonb_build_object('quote',md5(q::text));
end; $$;
create function public.spa_customer_quote(p_selection jsonb,p_date date,p_time time,p_people integer) returns jsonb
language sql volatile security invoker set search_path='' as $$ select spa_private.customer_quote(p_selection,p_date,p_time,p_people); $$;

create function spa_private.customer_availability(p_selection jsonb,p_date date,p_people integer) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare hrs public.spa_hours; n integer; slots jsonb:='[]'; begin
 if p_date is null or p_people is null or p_people not between 1 and 192 then raise exception 'Choose a valid date and group size.'; end if;
 select * into hrs from public.spa_hours where weekday=extract(dow from p_date)::integer and not closed;
 if not found then return slots; end if;
 for n in select generate_series(hrs.opens,hrs.closes-30,30) loop
   begin
     perform spa_private.customer_quote(p_selection,p_date,make_time(n/60,n%60,0),p_people);
     slots:=slots||jsonb_build_array(jsonb_build_object('time',to_char(make_time(n/60,n%60,0),'HH24:MI')));
   exception when raise_exception then null; end;
 end loop;return slots;
end; $$;
create function public.spa_customer_availability(p_selection jsonb,p_date date,p_people integer) returns jsonb
language sql volatile security invoker set search_path='' as $$ select spa_private.customer_availability(p_selection,p_date,p_people); $$;

create function spa_private.customer_submit(p_selection jsonb,p_date date,p_time time,p_people integer,p_name text,p_phone text,p_email text,p_quote text,p_request uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare q jsonb; b public.spa_bookings; row jsonb; fingerprint text; begin
 perform 1 from public.spa_settings where id for update;
 if p_name is null or length(trim(p_name)) not between 1 and 100 or p_phone is null or length(trim(p_phone)) not between 6 and 30 or p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_request is null or p_quote is null then raise exception 'Enter a valid name, phone number and email.'; end if;
 fingerprint:=md5(jsonb_build_array(p_selection,p_date,p_time,p_people,trim(p_name),trim(p_phone),lower(trim(p_email)),p_quote)::text);
 select * into b from public.spa_bookings where request_id=p_request;
 if found then
   if b.customer_fingerprint is distinct from fingerprint then raise exception 'This request identifier has already been used. Review your booking again.'; end if;
   return jsonb_build_object('reference',b.reference,'status',b.status);
 end if;
 q:=spa_private.customer_quote(p_selection,p_date,p_time,p_people);
 if q->>'quote'<>p_quote then raise exception 'Availability, schedule or price changed. Review your booking again.'; end if;
 insert into public.spa_bookings(request_id,option_id,service_name,duration,people,total_cents,customer_name,phone,email,hold_until,source,quote_hash,status,booking_details,customer_fingerprint)
 values(p_request,(q->>'option_id')::uuid,q->>'service',(q->>'duration')::integer,p_people,(q->>'total_cents')::integer,trim(p_name),trim(p_phone),lower(trim(p_email)),clock_timestamp(),'online',p_quote,'confirmed',q,fingerprint) returning * into b;
 for row in select * from jsonb_array_elements(q->'sessions') loop
   insert into public.spa_sessions(booking_id,service_id,starts_at,ends_at,reserved_until,people)
   select b.id,o.service_id,(row->>'starts_at')::timestamptz,(row->>'ends_at')::timestamptz,(row->>'reserved_until')::timestamptz,(row->>'people')::integer from public.spa_options o where o.id=b.option_id;
 end loop;
 return jsonb_build_object('reference',b.reference,'status',b.status,'schedule',q);
end; $$;
create function public.spa_customer_submit(p_selection jsonb,p_date date,p_time time,p_people integer,p_name text,p_phone text,p_email text,p_quote text,p_request uuid) returns jsonb
language sql volatile security invoker set search_path='' as $$ select spa_private.customer_submit(p_selection,p_date,p_time,p_people,p_name,p_phone,p_email,p_quote,p_request); $$;

revoke all on function spa_private.customer_catalogue(),spa_private.customer_quote(jsonb,date,time,integer),spa_private.customer_availability(jsonb,date,integer),spa_private.customer_submit(jsonb,date,time,integer,text,text,text,text,uuid) from public;
revoke all on function public.spa_customer_catalogue(),public.spa_customer_quote(jsonb,date,time,integer),public.spa_customer_availability(jsonb,date,integer),public.spa_customer_submit(jsonb,date,time,integer,text,text,text,text,uuid) from public;
grant execute on function spa_private.customer_catalogue(),spa_private.customer_quote(jsonb,date,time,integer),spa_private.customer_availability(jsonb,date,integer),spa_private.customer_submit(jsonb,date,time,integer,text,text,text,text,uuid) to anon,authenticated;
grant execute on function public.spa_customer_catalogue(),public.spa_customer_quote(jsonb,date,time,integer),public.spa_customer_availability(jsonb,date,integer),public.spa_customer_submit(jsonb,date,time,integer,text,text,text,text,uuid) to anon,authenticated;

-- Existing advertised offers all specify 60-minute treatments. Preserve their published price rows.
update public.spa_promotions p set pricing=(select jsonb_agg(r||jsonb_build_object('option_id',o.id)||case when p.name='Group Wellness Special' then jsonb_build_object('group_bundle',true,'group_people',case when r->>'kind'='discount' then 10 else substring(r->>'label' from '^[0-9]+')::integer end) else '{}'::jsonb end order by n)
 from jsonb_array_elements(p.pricing) with ordinality rates(r,n)
 join public.spa_services s on s.name=case when p.name='Couples Massage Specials' then 'Couples Retreat' else 'Swedish Massage' end
 join public.spa_options o on o.service_id=s.id and o.duration=60 and o.active)
 where p.name in ('Me-Time Special','Couples Massage Specials','Birthday Package','Group Wellness Special');

notify pgrst,'reload schema';
