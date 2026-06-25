# LeadLaju

LeadLaju ialah web app untuk pasukan ejen hartanah menerima lead daripada
Google Sheets, menghubungi lead dalam masa lima minit, dan memindahkan lead
secara automatik kepada ejen seterusnya apabila masa tamat. Google Sheet ialah
database utama untuk lead dan ejen.

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
**Pengurusan Ejen**. Perubahan ejen akan diselaraskan ke tab Agents dalam
Google Sheet.

## Aliran utama

1. Lead baru dikesan daripada Google Sheet atau butang manual lead.
2. Lead diberikan kepada ejen aktif secara round-robin.
3. Ejen mempunyai lima minit untuk menekan `CALL NOW`.
4. Nombor telefon tidak dihantar atau dipaparkan sebelum lead berjaya di-claim.
5. Selepas `CALL NOW`, nombor telefon dibuka dan lead masuk ke **Log Lead**.
6. Jika masa tamat, lead dipindahkan kepada ejen aktif seterusnya dan mendapat
   tempoh lima minit yang baru.
7. Admin boleh daftar ejen, aktif atau nyahaktifkan ejen, dan sambungkan Google
   Apps Script Web App URL.

## Sambungan Google Sheets

1. Pastikan Google Sheet mempunyai tab lead dan tab `Agents`.
2. Untuk lead, gunakan tajuk `name`, `phone`, `email`, `project`, `source`,
   `status`, `created_at`, dan `id` pada baris pertama.
3. Untuk ejen, Apps Script akan sediakan tajuk `ID`, `Nama`, `No Phone`,
   `Emel`, `Role`, `Status`, `Leads Handled`, `Tarikh Daftar`, dan `Password`.
4. Buka **Extensions > Apps Script** dalam Google Sheet.
5. Salin kandungan `google-apps-script/Code.gs`.
6. Pilih **Deploy > New deployment > Web app**.
7. Tetapkan akses kepada **Anyone**, deploy, kemudian salin Web App URL.
8. Log masuk sebagai pengguna Admin dalam LeadLaju, buka **Google Sheets**,
   tampal URL tersebut dan tekan **Simpan & sambung**.

Meta Lead Ads atau TikTok Lead Generation boleh memasukkan baris ke Sheet
melalui alat automasi pilihan anda. LeadLaju akan mengesan baris baru mengikut
selang masa yang dipilih.

Dashboard menyimpan salinan sementara dalam `localStorage` untuk prestasi dan
sesi login, tetapi Google Sheet ialah sumber data utama.
