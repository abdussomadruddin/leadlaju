# LeadLaju

LeadLaju ialah web app untuk pasukan ejen hartanah menerima lead daripada
Google Sheets, menghubungi lead dalam masa lima minit, dan memindahkan lead
secara automatik kepada ejen seterusnya apabila masa tamat. App menyokong
Supabase Auth, Database dan Realtime, serta mod tempatan untuk ujian.

## Jalankan aplikasi

Buka `index.html` terus dalam pelayar, atau jalankan pelayan tempatan:

```bash
python3 -m http.server 8000
```

Kemudian buka `http://localhost:8000`.

## Login

Dashboard hanya boleh dibuka selepas login. Sesi disimpan pada peranti selama
365 hari atau sehingga pengguna menekan **Log keluar**.

- Admin demo: `azlan@leadlaju.my` / `Admin123!`
- Ejen demo: `aina@leadlaju.my` / `Agent123!`

Admin boleh mendaftarkan ejen dan menukar kata laluan mereka melalui menu
**Pengurusan Ejen**. Dalam mod Supabase, tindakan ini dilakukan oleh Edge
Function supaya `service_role` key tidak pernah dimasukkan ke browser.

## Aliran utama

1. Lead baru dikesan daripada Google Sheet atau butang simulasi.
2. Lead diberikan kepada ejen aktif secara round-robin.
3. Ejen mempunyai lima minit untuk menekan `CALL NOW`.
4. Nombor telefon tidak dihantar atau dipaparkan sebelum lead berjaya di-claim.
5. Selepas `CALL NOW`, nombor telefon dibuka dan lead masuk ke **Pelanggan Saya**.
6. Jika masa tamat, lead dipindahkan kepada ejen aktif seterusnya dan mendapat
   tempoh lima minit yang baru.
7. Admin boleh daftar ejen, aktif atau nyahaktifkan ejen, dan sambungkan Google
   Apps Script Web App URL.

## Setup Supabase

1. Cipta projek Supabase.
2. Buka **SQL Editor** dan jalankan `supabase/schema.sql`.
3. Buka **Authentication > Users** dan cipta pengguna admin pertama.
4. Jalankan arahan berikut di SQL Editor menggunakan emel admin tersebut:

```sql
update public.profiles
set role = 'admin'
where email = 'admin@agency.com';
```

5. Deploy Edge Function:

```bash
supabase functions deploy admin-manage-agent
```

6. Login menggunakan akaun admin, buka **Google Sheets**, kemudian masukkan
   Supabase Project URL dan publishable/anon key pada bahagian **Database
   Supabase**.

Jangan masukkan `service_role` key ke dalam app. Edge Function menggunakan
secret tersebut di server sahaja.

## Sambungan Google Sheets

1. Pastikan Google Sheet mempunyai tajuk `name`, `phone`, `email`, `project`,
   `source`, dan `created_at` pada baris pertama.
2. Buka **Extensions > Apps Script** dalam Google Sheet.
3. Salin kandungan `google-apps-script/Code.gs`.
4. Pilih **Deploy > New deployment > Web app**.
5. Tetapkan akses kepada **Anyone**, deploy, kemudian salin Web App URL.
6. Log masuk sebagai pengguna Admin dalam LeadLaju, buka **Google Sheets**,
   tampal URL tersebut dan tekan **Simpan & sambung**.

Meta Lead Ads atau TikTok Lead Generation boleh memasukkan baris ke Sheet
melalui alat automasi pilihan anda. LeadLaju akan mengesan baris baru mengikut
selang masa yang dipilih.

Tanpa konfigurasi Supabase, app kekal dalam mod demo dan menyimpan data dalam
`localStorage`. Mod ini sesuai untuk ujian satu browser sahaja.
