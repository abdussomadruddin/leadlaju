create or replace function public.admin_ingest_manual_lead(p_lead jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_source_id text; v_key text; v_hash text;
begin
  if not leadlaju_private.is_admin(auth.uid()) then raise exception 'Admin required'; end if;
  v_source_id:=coalesce(nullif(trim(p_lead->>'id'),''),gen_random_uuid()::text);
  v_key:='dashboard:'||v_source_id;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'id',v_source_id,'name',p_lead->>'name','phone',p_lead->>'phone','email',p_lead->>'email',
    'city',p_lead->>'city','project',p_lead->>'project','source',coalesce(p_lead->>'source','Manual Lead'),
    'created_at',p_lead->>'created_at'
  )::text,'utf8'),'sha256'),'hex');
  return public.ingest_lead(
    v_key,'dashboard',v_source_id,p_lead->>'name',p_lead->>'phone',coalesce(p_lead->>'email',''),
    coalesce(p_lead->>'city',''),p_lead->>'project',coalesce(p_lead->>'source','Manual Lead'),
    coalesce(p_lead->>'notes',''),coalesce((p_lead->>'created_at')::timestamptz,now()),v_hash
  );
end;
$$;

revoke all on function public.admin_ingest_manual_lead(jsonb) from public,anon;
grant execute on function public.admin_ingest_manual_lead(jsonb) to authenticated;
