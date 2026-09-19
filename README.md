# LeadLaju

LeadLaju ialah web app untuk pasukan ejen hartanah menerima lead daripada
import CSV/XLSX atau kemasukan manual, menghubungi lead dalam masa lima minit,
dan memindahkan lead secara automatik kepada ejen seterusnya apabila masa tamat.
Supabase ialah satu-satunya sumber data operasi.

## Jalankan aplikasi

Buka `index.html` terus dalam pelayar, atau jalankan pelayan tempatan:

```bash
python3 -m http.server 8000
```

Kemudian buka `http://localhost:8000`.

## Login

Dashboard hanya boleh dibuka selepas login. Sesi disimpan pada peranti selama
365 hari atau sehingga pengguna menekan **Log keluar**.

- Admin demo: `admin@leadlaju.my` / `Admin123!`
- Ejen demo: `aina@leadlaju.my` / `Agent123!`

Admin boleh mendaftarkan ejen dan menukar kata laluan mereka melalui menu
**Pengurusan Ejen**. Semua perubahan disimpan terus dalam Supabase.

## Aliran utama

1. Lead baru dimasukkan melalui tab **Import Lead** atau butang manual lead.
2. Jika banyak lead masuk serentak, dashboard mengagihkan satu active lead
   kepada setiap ejen aktif mengikut round-robin.
3. Lead selebihnya disimpan dalam queue sehingga ada slot ejen kosong.
4. Ejen mempunyai lima minit untuk menekan `CALL NOW`.
5. Jika tiada ejen claim, lead tersebut masuk semula ke belakang queue dan
   akan rotate ke ejen seterusnya sehingga ada yang claim.
6. Nombor telefon tidak dihantar atau dipaparkan sebelum lead berjaya di-claim.
7. Selepas `CALL NOW`, nombor telefon dibuka dan lead masuk ke **Log Lead**.
8. Jika masa tamat, lead dipindahkan kepada ejen aktif seterusnya dan mendapat
   tempoh lima minit yang baru.
9. Admin boleh daftar ejen, aktif atau nyahaktifkan ejen, serta import fail lead.

## Import Lead

Gunakan tab **Import Lead** untuk memuat naik fail CSV atau XLSX. Kolum yang
diperlukan ialah `name`, `phone`, `email`, `city`, dan `project`. Sistem mengisi
ID, sumber `Manual Lead`, status, revision, dan masa secara automatik.

Dashboard menggunakan Supabase Auth, Database, Realtime, Edge Functions dan
Web Push. Tiada Google Sheet atau Google Apps Script diperlukan.
