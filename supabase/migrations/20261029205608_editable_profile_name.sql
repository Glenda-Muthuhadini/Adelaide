-- Only the caller's display name is editable. Email, role and account status stay unchanged.
create function spa_private.update_profile(p_name text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare profile jsonb; begin
  if not spa_private.is_admin() then raise exception 'Authorised staff access required.' using errcode='42501'; end if;
  if p_name is null or length(trim(p_name)) not between 1 and 100 then raise exception 'Enter a display name between 1 and 100 characters.'; end if;
  update public.spa_admins set display_name=trim(p_name) where user_id=auth.uid() and active
    returning jsonb_build_object('id',user_id,'name',display_name,'role',role) into profile;
  if not found then raise exception 'Authorised staff access required.' using errcode='42501'; end if;
  return profile;
end; $$;
create function public.spa_update_profile(p_name text) returns jsonb
language sql volatile security invoker set search_path='' as $$ select spa_private.update_profile(p_name); $$;
revoke all on function spa_private.update_profile(text),public.spa_update_profile(text) from public,anon,authenticated;
grant execute on function spa_private.update_profile(text),public.spa_update_profile(text) to authenticated;

create or replace function spa_private.staff_identity() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not spa_private.is_admin() then return null; end if;
  return (select jsonb_build_object('id',a.user_id,'role',a.role,'name',coalesce(nullif(a.display_name,''),case when a.role='owner' then 'Owner' else 'Staff' end))
    from public.spa_admins a where a.user_id=auth.uid() and a.active);
end; $$;
create or replace function spa_private.admin_data() returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  if not spa_private.is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  return jsonb_build_object(
    'viewer_name',spa_private.staff_identity()->>'name','viewer_display_name',(select display_name from public.spa_admins where user_id=auth.uid()),
    'viewer_id',auth.uid(),'viewer_role',(select role from public.spa_admins where user_id=auth.uid() and active),
    'staff',(select coalesce(jsonb_agg(jsonb_build_object('id',a.user_id,'name',coalesce(nullif(a.display_name,''),case when a.role='owner' then 'Owner' else coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email) end),'email',u.email,'role',a.role,'active',a.active) order by a.role desc,u.email),'[]') from public.spa_admins a join auth.users u on u.id=a.user_id),
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
