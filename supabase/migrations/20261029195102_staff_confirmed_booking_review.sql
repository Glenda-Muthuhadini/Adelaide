-- Staff deliberately confirm the reviewed schedule. Guests keep using spa_submit.
create function spa_private.schedule_booking(p_option uuid,p_date date,p_time time,p_people integer,p_name text,p_phone text,p_email text,p_quote text,p_request uuid,p_source text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare receipt jsonb; booking_row public.spa_bookings; begin
  if not spa_private.is_admin() then raise exception 'Authorised staff access required.' using errcode='42501'; end if;
  if p_source is null or p_source not in ('telephone','whatsapp','walkin') then raise exception 'Choose a staff booking source.'; end if;
  -- submit locks the shared settings row before planning and inserting all sessions.
  receipt:=spa_private.submit(p_option,p_date,p_time,p_people,p_name,p_phone,p_email,p_quote,p_request,p_source);
  select * into booking_row from public.spa_bookings where request_id=p_request;
  if booking_row.status='pending' and booking_row.hold_until>clock_timestamp() then
    update public.spa_bookings set status='confirmed' where id=booking_row.id;
  elsif booking_row.status<>'confirmed' then
    raise exception 'This request can no longer be scheduled. Start a new appointment.';
  end if;
  return receipt||jsonb_build_object('status','confirmed');
end; $$;
create function public.spa_admin_schedule(p_option uuid,p_date date,p_time time,p_people integer,p_name text,p_phone text,p_email text,p_quote text,p_request uuid,p_source text)
returns jsonb language sql volatile security invoker set search_path='' as $$ select spa_private.schedule_booking(p_option,p_date,p_time,p_people,p_name,p_phone,p_email,p_quote,p_request,p_source); $$;
revoke all on function spa_private.schedule_booking(uuid,date,time,integer,text,text,text,text,uuid,text),public.spa_admin_schedule(uuid,date,time,integer,text,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function spa_private.schedule_booking(uuid,date,time,integer,text,text,text,text,uuid,text),public.spa_admin_schedule(uuid,date,time,integer,text,text,text,text,uuid,text) to authenticated;
notify pgrst,'reload schema';
