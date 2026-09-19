create index if not exists ingestion_api_keys_created_by_idx
  on public.ingestion_api_keys (created_by)
  where created_by is not null;

create index if not exists ingestion_api_keys_revoked_by_idx
  on public.ingestion_api_keys (revoked_by)
  where revoked_by is not null;
