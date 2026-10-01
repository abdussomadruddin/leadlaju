-- Commit this enum addition before the distribution migration uses it.
alter type public.leadlaju_queue_state add value if not exists 'sales_assigned';
