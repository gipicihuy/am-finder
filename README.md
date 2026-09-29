# am finder by givy

untuk mendapatkan link preset alight motion dari link video tiktok

Tempel link video TikTok, aplikasi menelusuri deskripsi akun, halaman link-in-bio, dan kolom komentar video itu, lalu menampilkan link preset Alight Motion yang ditemukan. Setiap hasil punya tombol salin dan tombol buka langsung.

## Fitur

- Cari link preset dari link video TikTok
- Saat pencarian jalan hanya ada indikator loading, tanpa rincian langkah yang sedang dibuka
- Hasil berupa kartu preset: link 5mb, link xml Google Drive, judul, ukuran file, dan sumbernya
- Kalau link preset tidak ada, cukup ditulis tidak ditemukan
- Riwayat pencarian tersimpan di peramban, tanpa akun
- Pilihan link lain (tautan di bio, link-in-bio) ikut ditampilkan kalau ada
- Tombol silang di kolom pencarian untuk menghapus link sekaligus
- Label meta memakai `Views` dan `Likes`
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

## Ubah teks tombol dan footer

Semua label tombol dan tulisan footer ada di **`ui.json`** di root proyek:

```json
{
  "buttons": {
    "search": "Cari preset",
    "searching": "Sedang mencari",
    "copy": "Salin link",
    "copied": "Tersalin",
    "openPreset": "Buka preset",
    "openFile": "Ambil file"
  },
  "states": {
    "loading": "Sedang mencari",
    "notFound": "Link preset tidak ditemukan."
  },
  "footer": [
        "Tulisan footer baris pertama.",
    "Baris kedua bebas ditambah atau dihapus."
  ]
}
```

- `buttons.*` = nama tombol. `search` dipakai saat idle, `searching` saat proses jalan, `openPreset` untuk link 5MB, `openFile` untuk file XML.
- `states.loading` = tulisan di indikator loading, `states.notFound` = tulisan saat link preset tidak ada.
- `footer` = daftar baris. Mau satu baris atau lima, tinggal tambah string di dalam kotak siku.
- Kunci di JSON ini wajib lengkap. Kalau ada kunci yang dihapus, `npm run build` langsung gagal dengan pesan yang jelas, jadi tidak ada teks yang hilang diam-diam.
- Sudah selesai edit, jalankan ulang `npm run dev` (atau `npm run build` lalu `npm start`). Isai JSON dibaca saat kompilasi, jadi perubahan baru terlihat setelah build ulang.

## Struktur

```
app/
  api/find/route.ts   # endpoint SSE, memanggil scraper
  page.tsx            # halaman utama
  globals.css         # token warna, tipografi, dan gaya
components/
  Finder.tsx          # form, log, riwayat, keadaan aplikasi
  ResultView.tsx      # kartu hasil dan baris preset
lib/
  ui.ts               # pembaca ui.json bertipe
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
