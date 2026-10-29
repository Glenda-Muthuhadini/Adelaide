alter table public.spa_bookings add column quote_hash text;
create or replace function spa_private.plan(p_option uuid,p_date date,p_time time,p_people integer,p_exclude uuid default null)
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
    'total_cents',opt.price_cents*(p_people/opt.price_people),'preparation_minutes',buffer_min,'pending_minutes',cfg.pending_minutes,'sessions',plan_rows);
  return result || jsonb_build_object('quote',md5(result::text));
end;
$$;

create or replace function spa_private.submit(p_option uuid,p_date date,p_time time,p_people integer,p_name text,p_phone text,p_email text,p_quote text,p_request uuid,p_source text default 'online')
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
    if b.option_id<>p_option or b.people<>p_people or b.customer_name<>trim(p_name) or b.phone<>trim(p_phone) or b.email<>lower(trim(p_email)) or b.quote_hash is distinct from p_quote or b.source<>p_source then raise exception 'Request identifier already used. Refresh before submitting.'; end if;
    return jsonb_build_object('reference',b.reference,'status',case when b.status='pending' and b.hold_until<=clock_timestamp() then 'expired' else b.status end,'hold_until',b.hold_until);
  end if;
  q := spa_private.plan(p_option,p_date,p_time,p_people);
  if p_quote is null or q->>'quote'<>p_quote then raise exception 'Availability, schedule or price changed. Review your booking again.'; end if;
  insert into public.spa_bookings(request_id,option_id,service_name,duration,people,total_cents,customer_name,phone,email,hold_until,source,quote_hash)
    values(p_request,p_option,q->>'service',(q->>'duration')::int,p_people,(q->>'total_cents')::int,trim(p_name),trim(p_phone),lower(trim(p_email)),clock_timestamp()+make_interval(mins=>cfg.pending_minutes),p_source,p_quote) returning * into b;
  for row in select * from jsonb_array_elements(q->'sessions') loop
    insert into public.spa_sessions(booking_id,service_id,starts_at,ends_at,reserved_until,people)
    select b.id,o.service_id,(row->>'starts_at')::timestamptz,(row->>'ends_at')::timestamptz,(row->>'reserved_until')::timestamptz,(row->>'people')::int from public.spa_options o where o.id=p_option;
  end loop;
  return jsonb_build_object('reference',b.reference,'status','pending','hold_until',b.hold_until,'schedule',q);
end; $$;

update public.spa_services set active=false where name in ('Foot Massage','Body Scrub');
insert into public.spa_services(name) values ('Hand & Shoulder Massage'),('Body Back Massage') on conflict(name) do nothing;
notify pgrst,'reload schema';
