-- Use the reservation lock so bookings and hour changes cannot race.
do $$ begin
  perform 1 from public.spa_settings where id for update;
  update public.spa_hours set opens=540,closes=case when weekday=0 then 840 else 1020 end,closed=false;
end; $$;
