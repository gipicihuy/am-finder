# am finder by givy

untuk mendapatkan link preset alight motion dari link video tiktok

Tempel link video TikTok, aplikasi menelusuri deskripsi akun, halaman link-in-bio, dan kolom komentar video itu, lalu menampilkan link preset Alight Motion yang ditemukan. Setiap hasil punya tombol salin dan tombol buka langsung.

## Fitur

- Cari link preset dari link video TikTok
- Proses berjalan tampil sebagai log yang mengalir, jadi terlihat sedang mengecek apa
- Hasil berupa kartu preset: link 5mb, link xml Google Drive, judul, ukuran file, dan sumbernya
- Status kosong yang jujur kalau link preset memang tidak ada di video itu
- Riwayat pencarian tersimpan di peramban, tanpa akun
- Pilihan link lain (tautan di bio, link-in-bio) ikut ditampilkan kalau ada
- Tampilan rapat di layar ponsel, tanpa geser samping

## Cara pakai

1. Buka aplikasinya
2. Tempel link video TikTok, misalnya `https://www.tiktok.com/@akun/video/1234567890`
3. Tekan `Cari preset`
4. Tunggu log berjalan, hasilnya muncul sendiri

## Stack

- Next.js 15 (App Router) dan React 19
- TypeScript
- Tailwind CSS 4 dengan variabel desain di `app/globals.css`
- `lib/amfinder.js`, skrip penelusuran yang sama seperti versi sebelumnya, dijalankan sebagai proses anak dari rute API

## Pengembangan

```bash
npm install
npm run dev        # server pengembangan
npm run typecheck  # cek tipe
npm run build      # build produksi
npm start          # jalankan build produksi
```

## Struktur

```
app/
  api/find/route.ts   # endpoint SSE, memanggil scraper
  page.tsx            # halaman utama
  globals.css         # token warna, tipografi, dan gaya
components/
  Finder.tsx          # form, log, riwayat, keadaan aplikasi
  ResultView.tsx      # kartu hasil dan baris preset
  Ornament.tsx        # ornamen SVG dekoratif
lib/
  amfinder.js         # penelusur link preset (dijalankan via child process)
DESIGN.md             # catatan arah desain
```

## Cara kerja singkat

`app/api/find/route.ts` menerima `?url=...`, memvalidasi, lalu menjalankan `node lib/amfinder.js <url> --raw --all`. Log penelusuran dibaca dari stderr dan dikirim ke peramban lewat Server-Sent Events; hasil JSON dibaca dari stdout dan dikirim sebagai event terakhir. Maksimal 3 pencarian berjalan bersamaan.

## Catatan

- Penelusuran bergantung pada halaman TikTok dan tautan pihak ketiga. Kalau struktur halamannya berubah, hasilnya bisa kosong.
- Tidak semua video punya link preset. Keadaan kosong bukan kegagalan, memang tidak ada link di video itu.
- Link preset berasal dari unggahan kreator lain, bukan dari aplikasi ini.
- Hasil penelusuran disimpan sementara di `lib/amfinder.cache.json` (sudah masuk `.gitignore`).
