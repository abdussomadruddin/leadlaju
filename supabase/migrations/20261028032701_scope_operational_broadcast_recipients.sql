-- Master has no brand_id and already receives selected-brand operations.
-- Do not attempt to send brand-specific row events to that global profile.
do $$ declare d text;
begin
 d:=pg_get_functiondef('leadlaju_private.broadcast_operational_change()'::regprocedure);
 if position('where active and approval_status = ''approved''' in d)=0 then
   raise exception 'Unexpected operational broadcaster definition';
 end if;
 d:=replace(d,'where active and approval_status = ''approved''',
   'where active and approval_status = ''approved'' and brand_id = leadlaju_private.request_brand()');
 d:=replace(d,'where role = ''agent'' and active and approval_status = ''approved''',
   'where role = ''agent'' and active and approval_status = ''approved'' and brand_id = leadlaju_private.request_brand()');
 execute d;
end $$;
