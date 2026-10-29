-- Four people TOTAL across all services. Only these RPCs may change reservations.
create schema if not exists spa_private;
revoke all on schema spa_private from public;
grant usage on schema spa_private to anon, authenticated;

create table public.spa_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('owner','admin')),
  active boolean not null default true
);
create table public.spa_settings (
  id boolean primary key default true check (id),
  total_capacity integer not null default 4 check (total_capacity = 4),
  pending_minutes integer not null default 60 check (pending_minutes between 5 and 1440),
  preparation_minutes integer not null default 0 check (preparation_minutes between 0 and 120 and preparation_minutes % 30 = 0)
);
insert into public.spa_settings default values;
create table public.spa_hours (
  weekday integer primary key check (weekday between 0 and 6),
  opens integer not null check (opens between 0 and 1410 and opens % 30 = 0),
  closes integer not null check (closes between 30 and 1440 and closes % 30 = 0 and closes > opens),
  closed boolean not null default false
);
insert into public.spa_hours select d,540,1140,false from generate_series(0,6) d;
create table public.spa_services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 120),
  active boolean not null default true,
  preparation_minutes integer check (preparation_minutes between 0 and 120 and preparation_minutes % 30 = 0)
);
create table public.spa_options (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.spa_services(id),
  duration integer not null check (duration in (30,60,90)),
  price_cents integer not null check (price_cents between 0 and 10000000),
  price_people integer not null default 1 check (price_people in (1,2)),
  active boolean not null default true,
  unique(service_id,duration)
);
create index spa_options_service_idx on public.spa_options(service_id);
create table public.spa_bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('AD-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  request_id uuid not null unique,
  option_id uuid not null references public.spa_options(id),
  service_name text not null,
  duration integer not null,
  people integer not null check (people between 1 and 40),
  total_cents integer not null check (total_cents >= 0),
  customer_name text not null check (length(customer_name) between 1 and 100),
  phone text not null check (length(phone) between 6 and 30),
  email text not null check (length(email) between 3 and 254),
  status text not null default 'pending' check (status in ('pending','confirmed','completed','rejected','cancelled','expired')),
  source text not null default 'online' check (source in ('online','telephone','whatsapp','walkin')),
  hold_until timestamptz not null,
  created_at timestamptz not null default now()
);
create index spa_bookings_option_idx on public.spa_bookings(option_id);
create table public.spa_sessions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.spa_bookings(id) on delete cascade,
  service_id uuid not null references public.spa_services(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reserved_until timestamptz not null,
  people integer not null check (people between 1 and 4),
  check (ends_at > starts_at and reserved_until >= ends_at)
);
create index spa_sessions_booking_idx on public.spa_sessions(booking_id);
create index spa_sessions_time_idx on public.spa_sessions(starts_at,reserved_until);
create index spa_sessions_service_idx on public.spa_sessions(service_id);
create table public.spa_notes (
  booking_id uuid primary key references public.spa_bookings(id) on delete cascade,
  body text not null default '' check (length(body) <= 5000),
  updated_at timestamptz not null default now()
);
create table public.spa_blocks (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references public.spa_services(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  reason text not null default '' check (length(reason) <= 300)
);
create index spa_blocks_service_idx on public.spa_blocks(service_id);

-- Membership is owner-managed, never based on user-editable JWT metadata.
-- A revoked Auth session loses dashboard access even before its JWT expires.
create function spa_private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.spa_admins a where a.user_id = auth.uid() and a.active
  ) and exists (
    select 1 from auth.sessions s where s.user_id = auth.uid()
    and s.id::text = auth.jwt()->>'session_id'
  );
$$;
revoke all on function spa_private.is_admin() from public;
grant execute on function spa_private.is_admin() to anon,authenticated;
create function public.spa_is_admin() returns boolean language sql stable security invoker set search_path = '' as $$ select spa_private.is_admin(); $$;
revoke all on function public.spa_is_admin() from public;
grant execute on function public.spa_is_admin() to anon,authenticated;

do $$ declare t text; begin
  foreach t in array array['spa_admins','spa_settings','spa_hours','spa_services','spa_options','spa_bookings','spa_sessions','spa_notes','spa_blocks'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy admin_read on public.%I for select to authenticated using ((select spa_private.is_admin()))',t);
  end loop;
  foreach t in array array['spa_services','spa_options'] loop
    execute format('grant select on public.%I to anon',t);
    execute format('create policy catalogue_read on public.%I for select to anon,authenticated using (active)',t);
  end loop;
end $$;

-- Internal planner: never granted to a browser. Reads occupancy only, no PII returned.
create function spa_private.plan(p_option uuid,p_date date,p_time time,p_people integer,p_exclude uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  opt public.spa_options; svc public.spa_services; cfg public.spa_settings; hrs public.spa_hours;
  cursor_min integer; buffer_min integer; remaining integer; batch integer; free integer;
  occupied integer; same_service integer; tick timestamptz; start_at timestamptz; end_at timestamptz;
  release_at timestamptz; plan_rows jsonb := '[]'; result jsonb;
begin
  if p_option is null or p_date is null or p_time is null or p_people is null or p_people not between 1 and 40 then
    raise exception 'Choose a service, date, start time and 1 to 40 people.';
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
    'total_cents',opt.price_cents*(p_people/opt.price_people),'preparation_minutes',buffer_min,'sessions',plan_rows);
  return result || jsonb_build_object('quote',md5(result::text));
end;
$$;
revoke all on function spa_private.plan(uuid,date,time,integer,uuid) from public,anon,authenticated;

create function spa_private.quote(p_option uuid,p_date date,p_time time,p_people integer)
returns jsonb language sql volatile security definer set search_path = '' as $$ select spa_private.plan(p_option,p_date,p_time,p_people); $$;
create function public.spa_quote(p_option uuid,p_date date,p_time time,p_people integer)
returns jsonb language sql volatile security invoker set search_path = '' as $$ select spa_private.quote(p_option,p_date,p_time,p_people); $$;

create function spa_private.availability(p_option uuid,p_date date,p_people integer)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare hrs public.spa_hours; n integer; q jsonb; slots jsonb := '[]'; begin
  if p_date is null or p_people is null or p_people not between 1 and 40 then raise exception 'Choose a valid date and group size.'; end if;
  select * into hrs from public.spa_hours where weekday=extract(dow from p_date)::integer and not closed;
  if not found then return slots; end if;
  for n in select generate_series(hrs.opens,hrs.closes-30,30) loop
    begin
      q := spa_private.plan(p_option,p_date,make_time(n/60,n%60,0),p_people);
      slots := slots || jsonb_build_array(jsonb_build_object('time',to_char(make_time(n/60,n%60,0),'HH24:MI')));
    exception when raise_exception then null;
    end;
  end loop;
  return slots;
end; $$;
create function public.spa_availability(p_option uuid,p_date date,p_people integer)
returns jsonb language sql volatile security invoker set search_path = '' as $$ select spa_private.availability(p_option,p_date,p_people); $$;

create function spa_private.submit(p_option uuid,p_date date,p_time time,p_people integer,p_name text,p_phone text,p_email text,p_quote text,p_request uuid,p_source text default 'online')
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare cfg public.spa_settings; q jsonb; b public.spa_bookings; row jsonb; begin
  -- Every mutation locks this same singleton BEFORE reading current occupancy.
  select * into cfg from public.spa_settings where id for update;
  if p_source is null or p_source not in ('online','telephone','whatsapp','walkin') then raise exception 'Invalid booking source.'; end if;
  if p_source<>'online' and not spa_private.is_admin() then raise exception 'Admin access required.'; end if;
  if p_name is null or length(trim(p_name)) not between 1 and 100 or p_phone is null or length(trim(p_phone)) not between 6 and 30
     or p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_request is null then raise exception 'Enter a valid name, phone number and email.'; end if;
  select * into b from public.spa_bookings where request_id=p_request;
  if found then
    if b.option_id<>p_option or b.people<>p_people or b.customer_name<>trim(p_name) or b.phone<>trim(p_phone) or b.email<>lower(trim(p_email)) then raise exception 'Request identifier already used. Refresh before submitting.'; end if;
    return jsonb_build_object('reference',b.reference,'status',case when b.status='pending' and b.hold_until<=clock_timestamp() then 'expired' else b.status end,'hold_until',b.hold_until);
  end if;
  q := spa_private.plan(p_option,p_date,p_time,p_people);
  if p_quote is null or q->>'quote'<>p_quote then raise exception 'Availability, schedule or price changed. Review your booking again.'; end if;
  insert into public.spa_bookings(request_id,option_id,service_name,duration,people,total_cents,customer_name,phone,email,hold_until,source)
    values(p_request,p_option,q->>'service',(q->>'duration')::int,p_people,(q->>'total_cents')::int,trim(p_name),trim(p_phone),lower(trim(p_email)),clock_timestamp()+make_interval(mins=>cfg.pending_minutes),p_source) returning * into b;
  for row in select * from jsonb_array_elements(q->'sessions') loop
    insert into public.spa_sessions(booking_id,service_id,starts_at,ends_at,reserved_until,people)
    select b.id,o.service_id,(row->>'starts_at')::timestamptz,(row->>'ends_at')::timestamptz,(row->>'reserved_until')::timestamptz,(row->>'people')::int from public.spa_options o where o.id=p_option;
  end loop;
  return jsonb_build_object('reference',b.reference,'status','pending','hold_until',b.hold_until,'schedule',q);
end; $$;
create function public.spa_submit(p_option uuid,p_date date,p_time time,p_people integer,p_name text,p_phone text,p_email text,p_quote text,p_request uuid,p_source text default 'online')
returns jsonb language sql volatile security invoker set search_path = '' as $$ select spa_private.submit(p_option,p_date,p_time,p_people,p_name,p_phone,p_email,p_quote,p_request,p_source); $$;

create function spa_private.admin_data() returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  if not spa_private.is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  return jsonb_build_object(
    'bookings',(select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('status',case when b.status='pending' and b.hold_until<=clock_timestamp() then 'expired' else b.status end,
      'sessions',(select coalesce(jsonb_agg(s order by s.starts_at),'[]') from public.spa_sessions s where s.booking_id=b.id),
      'notes',(select n.body from public.spa_notes n where n.booking_id=b.id)) order by b.created_at desc),'[]') from public.spa_bookings b),
    'services',(select coalesce(jsonb_agg(s order by name),'[]') from public.spa_services s),
    'options',(select coalesce(jsonb_agg(o),'[]') from public.spa_options o),
    'settings',(select to_jsonb(c) from public.spa_settings c where id),
    'hours',(select jsonb_agg(h order by weekday) from public.spa_hours h),
    'blocks',(select coalesce(jsonb_agg(b order by starts_at),'[]') from public.spa_blocks b));
end; $$;
create function public.spa_admin_data() returns jsonb language sql volatile security invoker set search_path = '' as $$ select spa_private.admin_data(); $$;

-- All privileged commands validate live membership; direct table writes are revoked.
create function spa_private.admin_change(p_action text,p_data jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare b public.spa_bookings; q jsonb; row jsonb; sid uuid; state text; begin
  if not spa_private.is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  perform 1 from public.spa_settings where id for update;
  if p_action in ('status','notes','reschedule','reschedule_quote') then
    select * into b from public.spa_bookings where id=(p_data->>'id')::uuid;
    if not found then raise exception 'Booking not found.'; end if;
    if b.status='pending' and b.hold_until<=clock_timestamp() then b.status:='expired'; end if;
  end if;
  if p_action='status' then
    state := p_data->>'status';
    if state is null or not ((b.status='pending' and state in ('confirmed','rejected','cancelled')) or (b.status='confirmed' and state in ('cancelled','completed'))) then raise exception 'This status change is not allowed. Expired requests must be booked again.'; end if;
    if state='completed' and exists(select 1 from public.spa_sessions s where s.booking_id=b.id and s.ends_at>clock_timestamp()) then raise exception 'Treatments must finish before completion.'; end if;
    update public.spa_bookings set status=state where id=b.id;
  elsif p_action='notes' then
    insert into public.spa_notes(booking_id,body) values(b.id,coalesce(p_data->>'notes','')) on conflict(booking_id) do update set body=excluded.body,updated_at=clock_timestamp();
  elsif p_action in ('reschedule','reschedule_quote') then
    if b.status not in ('pending','confirmed') then raise exception 'Only active requests can be rescheduled.'; end if;
    q := spa_private.plan(b.option_id,(p_data->>'date')::date,(p_data->>'time')::time,b.people,b.id);
    -- Preserve the agreed price when rescheduling an existing booking.
    q := q || jsonb_build_object('total_cents',b.total_cents);
    if p_action='reschedule_quote' then return q; end if;
    if p_data->>'quote' is null or p_data->>'quote'<>q->>'quote' then raise exception 'The schedule changed. Review it again.'; end if;
    delete from public.spa_sessions where booking_id=b.id;
    for row in select * from jsonb_array_elements(q->'sessions') loop
      insert into public.spa_sessions(booking_id,service_id,starts_at,ends_at,reserved_until,people)
      select b.id,o.service_id,(row->>'starts_at')::timestamptz,(row->>'ends_at')::timestamptz,(row->>'reserved_until')::timestamptz,(row->>'people')::int from public.spa_options o where o.id=b.option_id;
    end loop;
  elsif p_action='settings' then
    update public.spa_settings set pending_minutes=(p_data->>'pending_minutes')::int,preparation_minutes=(p_data->>'preparation_minutes')::int where id;
  elsif p_action='hours' then
    update public.spa_hours set opens=(p_data->>'opens')::int,closes=(p_data->>'closes')::int,closed=(p_data->>'closed')::boolean where weekday=(p_data->>'weekday')::int;
  elsif p_action='service' then
    sid := coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid());
    insert into public.spa_services(id,name,active,preparation_minutes) values(sid,trim(p_data->>'name'),(p_data->>'active')::boolean,nullif(p_data->>'preparation_minutes','')::int)
    on conflict(id) do update set name=excluded.name,active=excluded.active,preparation_minutes=excluded.preparation_minutes;
    return jsonb_build_object('id',sid);
  elsif p_action='option' then
    insert into public.spa_options(service_id,duration,price_cents,price_people,active)
    values((p_data->>'service_id')::uuid,(p_data->>'duration')::int,(p_data->>'price_cents')::int,(p_data->>'price_people')::int,(p_data->>'active')::boolean)
    on conflict(service_id,duration) do update set price_cents=excluded.price_cents,price_people=excluded.price_people,active=excluded.active;
  elsif p_action='block' then
    if exists(select 1 from public.spa_sessions s join public.spa_bookings b on b.id=s.booking_id where
      (b.status='confirmed' or (b.status='pending' and b.hold_until>clock_timestamp()))
      and (nullif(p_data->>'service_id','') is null or s.service_id=(p_data->>'service_id')::uuid)
      and s.starts_at<(p_data->>'ends_at')::timestamptz and s.reserved_until>(p_data->>'starts_at')::timestamptz) then raise exception 'This block overlaps an active booking. Reschedule or cancel it first.'; end if;
    insert into public.spa_blocks(service_id,starts_at,ends_at,reason) values(nullif(p_data->>'service_id','')::uuid,(p_data->>'starts_at')::timestamptz,(p_data->>'ends_at')::timestamptz,coalesce(p_data->>'reason',''));
  elsif p_action='unblock' then delete from public.spa_blocks where id=(p_data->>'id')::uuid;
  else raise exception 'Unknown admin action.';
  end if;
  return jsonb_build_object('ok',true);
end; $$;
create function public.spa_admin_change(p_action text,p_data jsonb) returns jsonb language sql volatile security invoker set search_path = '' as $$ select spa_private.admin_change(p_action,p_data); $$;

-- Explicit RPC allowlist. All SECURITY DEFINER code stays in a non-exposed schema.
revoke all on all functions in schema spa_private from public,anon,authenticated;
grant execute on function spa_private.is_admin() to anon,authenticated;
grant execute on function spa_private.quote(uuid,date,time,integer),spa_private.availability(uuid,date,integer),spa_private.submit(uuid,date,time,integer,text,text,text,text,uuid,text) to anon,authenticated;
grant execute on function spa_private.admin_data(),spa_private.admin_change(text,jsonb) to authenticated;
revoke all on function public.spa_quote(uuid,date,time,integer),public.spa_availability(uuid,date,integer),public.spa_submit(uuid,date,time,integer,text,text,text,text,uuid,text),public.spa_admin_data(),public.spa_admin_change(text,jsonb) from public,anon,authenticated;
grant execute on function public.spa_quote(uuid,date,time,integer),public.spa_availability(uuid,date,integer),public.spa_submit(uuid,date,time,integer,text,text,text,text,uuid,text) to anon,authenticated;
grant execute on function public.spa_admin_data(),public.spa_admin_change(text,jsonb) to authenticated;

-- Seed only published duration/price pairs. Missing durations remain enquiries.
insert into public.spa_services(name) values ('Swedish Massage'),('Deep Tissue Massage'),('Hot Stone Massage'),('Sports Massage'),('Adelaide Signature Massage'),('Signature Facial'),('Manual Lymph Drainage'),('Reflexology Massage'),('Pregnancy Massage'),('Couples Retreat'),('Neck & Shoulder Massage'),('Scalp Massage'),('Hand Massage'),('Foot Massage'),('Body Scrub'),('Ultimate Relaxation');
insert into public.spa_options(service_id,duration,price_cents,price_people)
select s.id,v.duration,v.price*100,v.price_people from (values
  ('Swedish Massage',60,500,1),('Swedish Massage',90,750,1),('Deep Tissue Massage',60,550,1),('Deep Tissue Massage',90,800,1),
  ('Hot Stone Massage',60,600,1),('Hot Stone Massage',90,850,1),('Sports Massage',30,280,1),('Sports Massage',60,600,1),
  ('Adelaide Signature Massage',90,900,1),('Signature Facial',30,280,1),('Signature Facial',60,400,1),
  ('Manual Lymph Drainage',60,680,1),('Manual Lymph Drainage',90,850,1),('Reflexology Massage',60,500,1),('Pregnancy Massage',60,450,1),
  ('Couples Retreat',60,500,2),('Couples Retreat',90,1100,2)
) as v(name,duration,price,price_people) join public.spa_services s on s.name=v.name;
notify pgrst,'reload schema';
