-- Recovery is separate from timed Ejen expiry, whose behavior stays unchanged.
create function leadlaju_private.recover_team_sales_dispatch() returns integer
 language plpgsql security definer set search_path='' as $$
declare bid uuid; previous_brand text:=current_setting('leadlaju.worker_brand',true); total integer:=0;
begin
 if auth.uid() is not null then raise exception 'Trusted scheduler required' using errcode='42501'; end if;
 for bid in select id from public.brands where active and distribution_mode='team_sales' order by id loop
   perform set_config('leadlaju.worker_brand',bid::text,true);
   total:=total+leadlaju_private.dispatch_team_sales(now());
 end loop;
 perform set_config('leadlaju.worker_brand',coalesce(previous_brand,''),true);
 return total;
end $$;
revoke all on function leadlaju_private.recover_team_sales_dispatch() from public,anon,authenticated,service_role;
select cron.schedule('leadlaju-team-sales-dispatch','* * * * *',
 'select leadlaju_private.recover_team_sales_dispatch()');
