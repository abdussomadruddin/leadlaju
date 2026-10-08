-- Refresh other administrators even when no profile's gate state changes.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.admin_set_follow_up_due_limit(integer)'::regprocedure);
 if position('return jsonb_build_object(''ok'',true,''follow_up_due_limit'',p_limit);' in definition)=0 then raise exception 'Limit RPC return shape changed'; end if;
 execute replace(definition,'return jsonb_build_object(''ok'',true,''follow_up_due_limit'',p_limit);',
   'perform realtime.send(jsonb_build_object(''brandId'',bid,''followUpDueLimit'',p_limit),''follow_up_limit_changed'',''brand:''||bid::text||'':operations'',true); return jsonb_build_object(''ok'',true,''follow_up_due_limit'',p_limit);');
end $$;
