-- Available customer bookings are confirmed in the same transaction as capacity reservation.
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
  insert into public.spa_bookings(request_id,option_id,service_name,duration,people,total_cents,customer_name,phone,email,hold_until,source,quote_hash,status)
    values(p_request,p_option,q->>'service',(q->>'duration')::int,p_people,(q->>'total_cents')::int,trim(p_name),trim(p_phone),lower(trim(p_email)),clock_timestamp()+make_interval(mins=>cfg.pending_minutes),p_source,p_quote,case when p_source='online' then 'confirmed' else 'pending' end) returning * into b;
  for row in select * from jsonb_array_elements(q->'sessions') loop
    insert into public.spa_sessions(booking_id,service_id,starts_at,ends_at,reserved_until,people)
    select b.id,o.service_id,(row->>'starts_at')::timestamptz,(row->>'ends_at')::timestamptz,(row->>'reserved_until')::timestamptz,(row->>'people')::int from public.spa_options o where o.id=p_option;
  end loop;
  return jsonb_build_object('reference',b.reference,'status',b.status,'schedule',q);
end; $$;

notify pgrst,'reload schema';
