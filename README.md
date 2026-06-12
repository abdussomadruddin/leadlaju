# LeadLaju

LeadLaju ialah prototaip web untuk pasukan ejen hartanah menerima lead daripada
Google Sheets, menghubungi lead dalam masa lima minit, dan memindahkan lead
secara automatik kepada ejen seterusnya apabila masa tamat.

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

Admin menetapkan kata laluan minimum lapan aksara apabila mendaftarkan ejen
baru.

## Aliran utama

1. Lead baru dikesan daripada Google Sheet atau butang simulasi.
2. Lead diberikan kepada ejen aktif secara round-robin.
3. Ejen mempunyai lima minit untuk menekan `CALL NOW`.
4. Jika masa tamat, lead dipindahkan kepada ejen aktif seterusnya dan mendapat
   tempoh lima minit yang baru.
5. Admin boleh daftar ejen, aktif atau nyahaktifkan ejen, dan sambungkan Google
   Apps Script Web App URL.

Data prototaip disimpan dalam `localStorage` pelayar.

## Sambungan Google Sheets

1. Pastikan Google Sheet mempunyai tajuk `name`, `phone`, `source`, dan
   `created_at` pada baris pertama.
2. Buka **Extensions > Apps Script** dalam Google Sheet.
3. Salin kandungan `google-apps-script/Code.gs`.
4. Pilih **Deploy > New deployment > Web app**.
5. Tetapkan akses kepada **Anyone**, deploy, kemudian salin Web App URL.
6. Log masuk sebagai pengguna Admin dalam LeadLaju, buka **Google Sheets**,
   tampal URL tersebut dan tekan **Simpan & sambung**.

Meta Lead Ads atau TikTok Lead Generation boleh memasukkan baris ke Sheet
melalui alat automasi pilihan anda. LeadLaju akan mengesan baris baru mengikut
selang masa yang dipilih.

## Nota produksi

Ini ialah MVP frontend. Login dan data disimpan pada pelayar. Untuk penggunaan
sebenar berbilang pengguna, pindahkan kata laluan, authentication, data,
round-robin locking, dan penghantaran notifikasi ke backend supaya kata laluan
tidak berada dalam kod pelayar dan dua ejen tidak boleh menuntut lead yang sama
serentak.
