-- Supabase's managed auth schema is owned by supabase_admin. postgres has
-- USAGE but no grant option, so inherit the platform's authenticated privileges
-- instead of attempting an ineffective direct schema grant. RLS still applies.
grant authenticated to leadlaju_tenant_executor with inherit true;
