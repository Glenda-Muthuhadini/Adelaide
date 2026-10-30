begin;
do $$ declare sid uuid:=gen_random_uuid(); oid uuid; day_number integer; d date; treatment_minutes integer; closing integer; latest time; q jsonb; rejected boolean; slots jsonb;
begin
 assert (select count(*)=7 and bool_and(opens=540 and closes=case when weekday=0 then 840 else 1020 end and not closed) from public.spa_hours);
 insert into public.spa_services(id,name,preparation_minutes) values(sid,'QA revised hours',0);
 for day_number in 0..6 loop
  select day::date into d from generate_series((now() at time zone 'Africa/Johannesburg')::date+300,(now() at time zone 'Africa/Johannesburg')::date+306,interval '1 day') day where extract(dow from day)=day_number;
  closing:=case when day_number=0 then 840 else 1020 end;
  foreach treatment_minutes in array array[30,60,90] loop
   insert into public.spa_options(service_id,duration,price_cents) values(sid,treatment_minutes,10000) on conflict(service_id,duration) do update set price_cents=10000 returning id into oid;
   latest:=make_time((closing-treatment_minutes)/60,(closing-treatment_minutes)%60,0);
   q:=public.spa_customer_quote(jsonb_build_object('option_id',oid),d,latest,1);
   assert (q->'sessions'->0->>'ends_at')::timestamptz=(d::timestamp+make_interval(mins=>closing)) at time zone 'Africa/Johannesburg';
   slots:=public.spa_customer_availability(jsonb_build_object('option_id',oid),d,1);
   assert slots->-1->>'time'=to_char(latest,'HH24:MI');
   rejected:=false;begin perform public.spa_customer_quote(jsonb_build_object('option_id',oid),d,latest+interval '30 minutes',1);exception when raise_exception then rejected:=true;end;assert rejected,'Customer treatment cannot end after closing';
   rejected:=false;begin perform public.spa_quote(oid,d,latest+interval '30 minutes',1);exception when raise_exception then rejected:=true;end;assert rejected,'Staff quote cannot end after closing';
   rejected:=false;begin perform public.spa_customer_quote(jsonb_build_object('option_id',oid),d,'08:30',1);exception when raise_exception then rejected:=true;end;assert rejected,'No start before 09:00';
  end loop;
  select id into oid from public.spa_options where service_id=sid and duration=60;
  latest:=make_time((closing-180)/60,(closing-180)%60,0);
  q:=public.spa_customer_quote(jsonb_build_object('option_id',oid),d,latest,10);assert jsonb_array_length(q->'sessions')=3;
  rejected:=false;begin perform public.spa_customer_quote(jsonb_build_object('option_id',oid),d,latest+interval '30 minutes',10);exception when raise_exception then rejected:=true;end;assert rejected,'Full group must end before closing';
  update public.spa_services set preparation_minutes=30 where id=sid;
  rejected:=false;begin perform public.spa_customer_quote(jsonb_build_object('option_id',oid),d,make_time((closing-60)/60,(closing-60)%60,0),1);exception when raise_exception then rejected:=true;end;assert rejected,'Preparation must fit before closing';
  update public.spa_services set preparation_minutes=0 where id=sid;
 end loop;
end; $$;
rollback;
