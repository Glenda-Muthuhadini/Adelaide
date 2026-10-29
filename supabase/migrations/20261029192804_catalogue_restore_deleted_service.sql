create or replace function spa_private.save_service(p_data jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare sid uuid; opt jsonb; selected_durations integer[]:='{}'; begin
  if not spa_private.is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  perform 1 from public.spa_settings where id for update;
  if length(trim(coalesce(p_data->>'name',''))) not between 1 and 120 then raise exception 'Enter a service name.'; end if;
  if jsonb_typeof(p_data->'options') is distinct from 'array' or jsonb_array_length(p_data->'options')>3 then raise exception 'Choose the supported duration options.'; end if;
  sid:=nullif(p_data->>'id','')::uuid;
  if sid is not null and not exists(select 1 from public.spa_services where id=sid and deleted_at is null) then raise exception 'Service not found.'; end if;
  -- Reuse a retired catalogue identity so historical booking references stay valid.
  if sid is null then select id into sid from public.spa_services where deleted_at is not null and lower(name)=lower(trim(p_data->>'name')); end if;
  if exists(select 1 from public.spa_services s where lower(s.name)=lower(trim(p_data->>'name')) and (sid is null or s.id<>sid)) then raise exception 'A service with that name already exists.'; end if;
  if sid is null then
    insert into public.spa_services(name) values(trim(p_data->>'name')) returning id into sid;
  end if;
  update public.spa_services set deleted_at=null,name=trim(p_data->>'name'),category=p_data->>'category',description=coalesce(p_data->>'description',''),
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
