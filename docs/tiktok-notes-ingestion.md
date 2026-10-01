# TikTok Pabbly: identiti daripada NOTA

Gunakan endpoint dan `X-LeadLaju-Key` TikTok brand sedia ada. Jangan masukkan API key ke nota.

```json
{
  "source_system": "tiktok_ads",
  "source_lead_id": "{{TikTok Lead ID}}",
  "details_from_notes": true,
  "project": "LG",
  "notes": "RM3500-RM5000\nNama Contoh\n+60 11-2345 6789\nYa\nKerja Swasta\ncontoh@example.com\nLG"
}
```

Map semua jawapan borang ke `notes`, satu jawapan setiap baris (atau pemisah backslash). Susunan baris bebas. `project` mesti nama projek/produk aktif brand, bukan ID. Ia boleh dikosongkan jika NOTA mengandungi tepat satu nama projek/produk aktif. Nama, phone dan email tidak perlu dimap berasingan. `created_at` boleh ditinggalkan supaya masa server digunakan.

- Abaikan Ya, Tidak, Kerja Kerajaan, Kerja Swasta, Berniaga/Freelance dan jawapan gaji bermula RM.
- Telefon mudah alih Malaysia 01/601/+601 dinormalkan kepada 601…; ruang dan sengkang dibuang.
- Nama/telefon/projek yang bercanggah atau tidak jelas ditolak dengan ralat; tiada tekaan. Emel boleh tiada, tetapi emel yang diberikan mesti sah dan tidak bercanggah.
- Duplicate: brand + projek/produk + telefon sama, dalam 10 minit daripada penerimaan **yang berjaya**. Retry duplicate tidak memanjangkan tempoh. Lead masuk serentak dilindungi locking transaksi. Selepas lebih 10 minit, enquiry sama dibenarkan sebagai lead baharu, termasuk jika source ID sama.
- Setiap occurrence mempunyai source ID dalaman tersendiri; source ID asal dikekalkan dalam receipt audit. ID dan sejarah lead lama tidak diubah.
- Aturan ini untuk mod NOTA TikTok sahaja. Integrasi Meta dan payload TikTok lama tanpa mod NOTA kekal dengan idempotency sedia ada.
- NOTA asal disimpan dan dipaparkan terus pada New Lead. Dalam Sistem Ejen, telefon/emel dalam nota disorok sebelum CALL NOW; Team Sales melihatnya seperti butiran lead lain.

Perubahan memerlukan migration `tiktok_notes_detection_window`, deployment fungsi `ingest-lead` bersama `_shared/lead-notes.ts`, dan frontend. Jangan tukar mapping Pabbly production sebelum release disahkan.
