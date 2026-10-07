do $$
declare definition text; old_hours text := 'not in (10,11,12,13,14,15,16)';
begin
 definition := pg_get_functiondef('leadlaju_private.enqueue_sales_contact_reminders(timestamptz)'::regprocedure);
 if position(old_hours in definition)=0 then raise exception 'Unexpected New Lead schedule'; end if;
 execute replace(definition,old_hours,'not in (10,11,12,13,14,15,16,17)');
end $$;
