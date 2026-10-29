alter table public.spa_admins add column display_name text not null default '' check(length(display_name)<=100);

create function spa_private.is_owner() returns boolean language sql stable security definer set search_path='' as $$
  select spa_private.is_admin() and exists(select 1 from public.spa_admins where user_id=auth.uid() and active and role='owner');
$$;
create function public.spa_is_owner() returns boolean language sql stable security invoker set search_path='' as $$ select spa_private.is_owner(); $$;
revoke all on function spa_private.is_owner(),public.spa_is_owner() from public,anon,authenticated;
grant execute on function spa_private.is_owner(),public.spa_is_owner() to authenticated;

create function spa_private.staff_identity() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not spa_private.is_admin() then return null; end if;
  return (select jsonb_build_object('id',a.user_id,'role',a.role,'name',case when a.role='owner' then 'Owner' else coalesce(nullif(a.display_name,''),'Staff') end)
    from public.spa_admins a where a.user_id=auth.uid() and a.active);
end; $$;
create function public.spa_staff_identity() returns jsonb language sql stable security invoker set search_path='' as $$ select spa_private.staff_identity(); $$;
revoke all on function spa_private.staff_identity(),public.spa_staff_identity() from public,anon,authenticated;
grant execute on function spa_private.staff_identity(),public.spa_staff_identity() to anon,authenticated;

-- Lookup is limited to an exact email and is available only to a live owner session.
create function spa_private.owner_staff_lookup(p_email text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not spa_private.is_owner() then raise exception 'Only the owner can add staff.' using errcode='42501'; end if;
  return (select jsonb_build_object('id',u.id,'email',u.email,'role',a.role,'active',coalesce(a.active,false))
    from auth.users u left join public.spa_admins a on a.user_id=u.id where lower(u.email)=lower(trim(p_email)) and u.deleted_at is null limit 1);
end; $$;
create function public.spa_owner_staff_lookup(p_email text) returns jsonb language sql stable security invoker set search_path='' as $$ select spa_private.owner_staff_lookup(p_email); $$;

create function spa_private.owner_add_staff(p_user_id uuid,p_name text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  if not spa_private.is_owner() then raise exception 'Only the owner can add staff.' using errcode='42501'; end if;
  perform 1 from public.spa_settings where id for update;
  -- Recheck after the lock, including the live Auth session and database membership.
  if not spa_private.is_owner() then raise exception 'Only the owner can add staff.' using errcode='42501'; end if;
  if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id and deleted_at is null) then raise exception 'Staff account not found.'; end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 100 then raise exception 'Enter the staff member’s name.'; end if;
  if exists(select 1 from public.spa_admins where user_id=p_user_id and role='owner') then raise exception 'This account is already the owner.'; end if;
  insert into public.spa_admins(user_id,role,active,display_name) values(p_user_id,'admin',true,trim(p_name))
    on conflict(user_id) do update set role='admin',active=true,display_name=excluded.display_name;
  return jsonb_build_object('id',p_user_id,'role','admin','name',trim(p_name));
end; $$;
create function public.spa_owner_add_staff(p_user_id uuid,p_name text) returns jsonb language sql volatile security invoker set search_path='' as $$ select spa_private.owner_add_staff(p_user_id,p_name); $$;
revoke all on function spa_private.owner_staff_lookup(text),public.spa_owner_staff_lookup(text),spa_private.owner_add_staff(uuid,text),public.spa_owner_add_staff(uuid,text) from public,anon,authenticated;
grant execute on function spa_private.owner_staff_lookup(text),public.spa_owner_staff_lookup(text),spa_private.owner_add_staff(uuid,text),public.spa_owner_add_staff(uuid,text) to authenticated;
create or replace function spa_private.admin_data() returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  if not spa_private.is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  return jsonb_build_object(
    'viewer_id',auth.uid(),'viewer_role',(select role from public.spa_admins where user_id=auth.uid() and active),
    'staff',(select coalesce(jsonb_agg(jsonb_build_object('id',a.user_id,'name',case when a.role='owner' then 'Owner' else coalesce(nullif(a.display_name,''),nullif(u.raw_user_meta_data->>'full_name',''),u.email) end,'email',u.email,'role',a.role,'active',a.active) order by a.role desc,u.email),'[]') from public.spa_admins a join auth.users u on u.id=a.user_id),
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
notify pgrst,'reload schema';
