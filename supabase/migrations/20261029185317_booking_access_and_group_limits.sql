-- 192 is the absolute physical maximum: 4 people * 48 half-hour intervals.
alter table public.spa_bookings drop constraint spa_bookings_people_check;
alter table public.spa_bookings add constraint spa_bookings_people_check check (people between 1 and 192);
drop policy admin_read on public.spa_services;
drop policy catalogue_read on public.spa_services;
create policy catalogue_read on public.spa_services for select to anon,authenticated using (active or (select spa_private.is_admin()));
drop policy admin_read on public.spa_options;
drop policy catalogue_read on public.spa_options;
create policy catalogue_read on public.spa_options for select to anon,authenticated using (active or (select spa_private.is_admin()));
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


create or replace function spa_private.availability(p_option uuid,p_date date,p_people integer)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare hrs public.spa_hours; n integer; q jsonb; slots jsonb := '[]'; begin
  if p_date is null or p_people is null or p_people not between 1 and 192 then raise exception 'Choose a valid date and group size.'; end if;
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

notify pgrst,'reload schema';
