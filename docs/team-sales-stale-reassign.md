# Team Sales: pindah New Lead yang tidak di-contact

Team Sales sahaja. Brand mode Agent, expiry 5 minit, Neglected Lead dan GET LEAD tidak berubah.

- Lead `new` / `sales_assigned` yang `received_at` melebihi tempoh brand dipindah kepada
  team sales lain yang aktif, diluluskan dan layak untuk projek yang sama.
- Tempoh: `brands.sales_reassign_days`, 1–5 hari, lalai 2. Admin/Master ubah di Log Lead
  (`admin_set_sales_reassign_days`). Tetapan baharu terpakai pada semua lead New semasa
  pada pusingan scheduler seterusnya.
- Pemilik semasa tidak pernah menerima semula lead itu pada pusingan yang sama. Ahli yang
  belum pernah memegang lead itu diutamakan, kemudian ikut giliran round-robin projek.
  Jika projek hanya ada seorang ahli, lead kekal.
- Setiap pindahan: assignment lama `missed`, assignment baharu `pending`, `received_at`
  baharu (jam bermula semula untuk pemilik baharu), push `sales_new_lead` kepada pemilik
  baharu, reminder pemilik lama dibatalkan, `assignment_revoked` kepada pemilik lama,
  `lead_events.assigned` dengan `payload.reason='sales_stale_reassign'`.
- Scheduler: cron `leadlaju-team-sales-stale-reassign` setiap 5 minit, maksimum 200 lead
  setiap brand setiap pusingan, kunci sama seperti dispatcher Team Sales.

## Release

1. Backup database. Jalankan `scripts/test-brand-database.mjs` (embedded-postgres).
2. Apply `20261114060000_team_sales_stale_new_reassign.sql`. Selepas apply, lead New yang
   sudah melebihi 2 hari akan dipindah pada pusingan cron pertama (≤5 minit).
3. Kemudian baru deploy frontend (PWA v191). Frontend membaca kolum
   `sales_reassign_days`; jangan deploy sebelum migration.
