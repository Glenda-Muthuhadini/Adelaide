-- The owner confirmed this package's complete treatment time is 60 minutes.
insert into public.spa_options(service_id,duration,price_cents,price_people,active)
select id,60,base_price_cents,1,true from public.spa_services
where name='Ultimate Relaxation' and deleted_at is null and base_price_cents is not null
on conflict(service_id,duration) do update set active=true;
notify pgrst,'reload schema';
