-- Use the existing per-member permission and tenant-scoped Admin RPC.
do $migration$
declare
  definition text;
  expected text;
begin
  definition := pg_get_functiondef('leadlaju_private.guard_get_lead_permission()'::regprocedure);
  expected := ' and distribution_mode=''agent''';
  if strpos(definition, expected) = 0 then
    raise exception 'GET LEAD permission guard changed';
  end if;
  execute replace(definition, expected, ' and distribution_mode in (''agent'', ''team_sales'')');

  definition := pg_get_functiondef('public.admin_set_agent_get_lead_permission(uuid,boolean)'::regprocedure);
  if strpos(definition, expected) = 0 then
    raise exception 'GET LEAD permission RPC changed';
  end if;
  execute replace(definition, expected, ' and distribution_mode in (''agent'', ''team_sales'')');

  -- The permission RPC and Team Sales dispatcher already lock the same brand.
  definition := pg_get_functiondef('leadlaju_private.dispatch_team_sales(timestamptz)'::regprocedure);
  expected := 'p.active and p.approval_status';
  if strpos(definition, expected) = 0 then
    raise exception 'Team Sales eligibility query changed';
  end if;
  execute replace(definition, expected, 'p.active and p.get_lead_allowed and p.approval_status');
end
$migration$;
