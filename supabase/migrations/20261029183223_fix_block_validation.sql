create or replace function spa_private.admin_change(p_action text,p_data jsonb) returns jsonb
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
    if exists(select 1 from public.spa_sessions s join public.spa_bookings bk on bk.id=s.booking_id where
      (bk.status='confirmed' or (bk.status='pending' and bk.hold_until>clock_timestamp()))
      and (nullif(p_data->>'service_id','') is null or s.service_id=(p_data->>'service_id')::uuid)
      and s.starts_at<(p_data->>'ends_at')::timestamptz and s.reserved_until>(p_data->>'starts_at')::timestamptz) then raise exception 'This block overlaps an active booking. Reschedule or cancel it first.'; end if;
    insert into public.spa_blocks(service_id,starts_at,ends_at,reason) values(nullif(p_data->>'service_id','')::uuid,(p_data->>'starts_at')::timestamptz,(p_data->>'ends_at')::timestamptz,coalesce(p_data->>'reason',''));
  elsif p_action='unblock' then delete from public.spa_blocks where id=(p_data->>'id')::uuid;
  else raise exception 'Unknown admin action.';
  end if;
  return jsonb_build_object('ok',true);
end; $$;
