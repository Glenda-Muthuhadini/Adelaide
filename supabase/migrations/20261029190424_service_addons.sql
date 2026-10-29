create table public.spa_addons (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  description text not null default '' check (length(description) <= 1000),
  price_cents integer not null check (price_cents between 0 and 10000000),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
create unique index spa_addons_name_idx on public.spa_addons(lower(name));
create table public.spa_addon_services (
  addon_id uuid not null references public.spa_addons(id) on delete cascade,
  service_id uuid not null references public.spa_services(id) on delete cascade,
  primary key (addon_id,service_id)
);
create index spa_addon_services_service_idx on public.spa_addon_services(service_id);
alter table public.spa_addons enable row level security;
alter table public.spa_addon_services enable row level security;
revoke all on public.spa_addons,public.spa_addon_services from public,anon,authenticated;
grant select on public.spa_addons,public.spa_addon_services to authenticated;
create policy admin_read on public.spa_addons for select to authenticated using ((select spa_private.is_admin()));
create policy admin_read on public.spa_addon_services for select to authenticated using ((select spa_private.is_admin()));

create function spa_private.save_addon(p_data jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare addon_uuid uuid; service_uuids uuid[]; addon_name text; addon_price integer; begin
  if not spa_private.is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  perform 1 from public.spa_settings where id for update;
  addon_name:=trim(p_data->>'name');
  if addon_name is null or length(addon_name) not between 1 and 120 then raise exception 'Enter an add-on name of up to 120 characters.'; end if;
  addon_price:=(p_data->>'price_cents')::integer;
  if addon_price is null or addon_price not between 0 and 10000000 then raise exception 'Enter a valid price between R0 and R100,000.'; end if;
  if length(coalesce(p_data->>'description',''))>1000 then raise exception 'Keep the description within 1,000 characters.'; end if;
  if jsonb_typeof(p_data->'service_ids') is distinct from 'array' then raise exception 'Select at least one service for this add-on.'; end if;
  select array_agg(distinct value::uuid) into service_uuids from jsonb_array_elements_text(p_data->'service_ids');
  if coalesce(cardinality(service_uuids),0)=0 then raise exception 'Select at least one service for this add-on.'; end if;
  if exists(select 1 from unnest(service_uuids) as chosen(service_id) where not exists(select 1 from public.spa_services s where s.id=chosen.service_id)) then raise exception 'One of the selected services no longer exists. Refresh the list and try again.'; end if;
  addon_uuid:=nullif(p_data->>'id','')::uuid;
  if exists(select 1 from public.spa_addons a where lower(a.name)=lower(addon_name) and (addon_uuid is null or a.id<>addon_uuid)) then raise exception 'An add-on with that name already exists. Edit it to change its services.'; end if;
  if addon_uuid is null then
    insert into public.spa_addons(name,description,price_cents,active)
      values(addon_name,coalesce(p_data->>'description',''),addon_price,coalesce((p_data->>'active')::boolean,true)) returning id into addon_uuid;
  else
    update public.spa_addons set name=addon_name,description=coalesce(p_data->>'description',''),price_cents=addon_price,
      active=coalesce((p_data->>'active')::boolean,true),updated_at=clock_timestamp() where id=addon_uuid;
    if not found then raise exception 'This add-on no longer exists. Refresh the list and try again.'; end if;
  end if;
  delete from public.spa_addon_services where addon_id=addon_uuid;
  insert into public.spa_addon_services(addon_id,service_id) select addon_uuid,unnest(service_uuids);
  return jsonb_build_object('id',addon_uuid);
end; $$;
revoke all on function spa_private.save_addon(jsonb) from public,anon,authenticated;
grant execute on function spa_private.save_addon(jsonb) to authenticated;
create function public.spa_admin_save_addon(p_data jsonb) returns jsonb
language sql volatile security invoker set search_path = '' as $$ select spa_private.save_addon(p_data); $$;
revoke all on function public.spa_admin_save_addon(jsonb) from public,anon,authenticated;
grant execute on function public.spa_admin_save_addon(jsonb) to authenticated;

create or replace function spa_private.admin_data() returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  if not spa_private.is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  return jsonb_build_object(
    'addons',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('service_ids',
      (select coalesce(jsonb_agg(link.service_id order by link.service_id),'[]') from public.spa_addon_services link where link.addon_id=a.id)) order by a.name),'[]') from public.spa_addons a),
    'bookings',(select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('status',case when b.status='pending' and b.hold_until<=clock_timestamp() then 'expired' else b.status end,
      'sessions',(select coalesce(jsonb_agg(s order by s.starts_at),'[]') from public.spa_sessions s where s.booking_id=b.id),
      'notes',(select n.body from public.spa_notes n where n.booking_id=b.id)) order by b.created_at desc),'[]') from public.spa_bookings b),
    'services',(select coalesce(jsonb_agg(s order by name),'[]') from public.spa_services s),
    'options',(select coalesce(jsonb_agg(o),'[]') from public.spa_options o),
    'settings',(select to_jsonb(c) from public.spa_settings c where id),
    'hours',(select jsonb_agg(h order by weekday) from public.spa_hours h),
    'blocks',(select coalesce(jsonb_agg(b order by starts_at),'[]') from public.spa_blocks b));
end; $$;
notify pgrst,'reload schema';
