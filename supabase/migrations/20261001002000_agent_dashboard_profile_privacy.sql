-- The legacy dashboard returned other active agents' availability and handling
-- counters. Agents now receive only their own profile; Admin/Master retain the
-- selected brand's operational directory through the tenant RLS boundary.
do $$ declare definition text; anchor text:='where v_is_admin or (p.role=''agent'' and p.active and p.approval_status=''approved'') or p.id=v_user'; begin
 definition:=pg_get_functiondef('public.get_dashboard_state()'::regprocedure);
 if strpos(definition,anchor)=0 then raise exception 'Dashboard profile authorization anchor missing'; end if;
 execute replace(definition,anchor,'where v_is_admin or p.id=v_user');
end $$;
