# Neglected Lead: release dan pemulihan

Agent sahaja. 120 jam ialah masa berlalu sebenar, bukan lima pertukaran tarikh.
Nota yang berubah atau follow up tersimpan reset timer. WhatsApp selepas 6 tidak menulis data.
`neglected_held` ialah simpanan admin, bukan status jualan baharu; sejarah status Contacted kekal.
Bulk assign menghasilkan New aktif tanpa expiry dan tanpa sekatan satu-lead; assignment biasa tidak berubah.
Semua ejen yang pernah neglect disekat kekal untuk ID lead tersebut, termasuk laluan assignment lain melalui trigger.

## Sebelum deployment

1. Jalankan regresi dan `scripts/test-brand-database.mjs` dengan embedded-postgres; suite memasang migration ini selepas aturan reminder lama diuji.
2. Jalankan `node scripts/prepare-neglected-release.mjs --backup` menggunakan akses CLI production yang sah. Ia hanya membaca production dan menulis backup tempatan persendirian. Simpan lokasi serta kiraan kelayakan; tiada penarikan dibuat oleh skrip.
3. Jika akses production ditolak, jangan mendakwa backup/kiraan disahkan dan jangan apply migration.
4. Semak `follow_up_activity_at` lama: field ini diurus trigger perubahan nota/status dan RPC follow up, bukan sync teknikal. Semak rekod Contacted yang tiada field itu sebelum release; fallback hanya `contacted_at`/`status_updated_at`, bukan `updated_at`.

## Deployment apabila diarahkan

- Deploy migration `20261026142609_agent_neglected_leads.sql`, worker `process-notification-outbox` dan frontend termasuk `neglected.js` secara terselaras. Migration fail-fast jika bentuk dispatcher/contact/dashboard berubah.
- Pengaktifan bermula apabila migration dipasang; scheduler Agent due-gate setiap minit menarik maksimum 200 lead setiap brand setiap pusingan. Lead lama layak disertakan terus. Tiada cron/polling tambahan.
- Sebelum apply, backup mesti siap; jadualkan tetingkap release singkat kerana frontend lama tidak memahami bulk New tanpa expiry. Selesaikan pengaktifan sebelum admin menggunakan bulk action.
- Selepas migration, jalankan sweep yang sedia ada, sahkan kiraan per brand, akses ejen lama ditolak dan notifikasi assignment baharu melalui outbox. Sahkan Vercel READY, versi service worker dan fail live.
- Ujian browser menggunakan transport mock, bukan bukti push pada telefon fizikal. Ujian fizikal masih diperlukan untuk penerimaan notifikasi.

## Rollback

Jangan rollback frontend sahaja selepas bulk assign: ia boleh salah menganggap lead tanpa expiry sebagai tamat.
Hentikan bulk action terlebih dahulu. Kekalkan metadata/audit/pengecualian; jangan padam lead atau pulangkan kepada ejen lama secara automatik.
Pulihkan fungsi scheduler/dispatcher daripada backup jika perlu, sambil memastikan lead `neglected_held` tidak memasuki queue biasa. Sebarang pemulihan pemilikan perlu semakan admin berasingan.
