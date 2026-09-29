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
- Label meta: Akun, Komentar, Views, Likes
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

## Ubah teks tombol, header, dan footer

Semua label tombol, tulisan status, nama merek, dan isi footer ada di **`ui.json`** di root proyek:

```json
{
  "buttons": {
    "search": "Search",
    "searching": "Searching",
    "copy": "Copy link",
    "copied": "Copied",
    "openPreset": "Open preset",
    "openFile": "Get file"
  },
  "states": {
    "loading": "Searching",
    "notFound": "Preset link not found"
  },
  "header": {
    "brand": "AM Finder",
    "tagline": "Find Alight Motion presets from any TikTok link",
    "byline": "• By Givy •"
  },
  "footer": {
    "brand": "AM Finder",
    "note": "Paste a TikTok link and get the Alight Motion preset links hidden in its description, bio, comments and replies. No account, no ads, no tracking.",
    "columns": [
      {
        "title": "Explore",
        "items": [
          { "label": "Search box", "href": "#tt" },
          { "label": "Back to top", "href": "#top" }
        ]
      },
      {
        "title": "About",
        "items": [{ "label": "Free to use" }, { "label": "No sign-up" }]
      }
    ],
    "copyright": "© 2026 Givy. All rights reserved.",
    "disclaimer": "Not affiliated with TikTok or Alight Motion."
  }
}
```

Seluruh tampilan situs ditulis dalam bahasa Inggris, jadi isi `ui.json` juga berbahasa Inggris.

- `buttons.*` = button labels. `search` runs while idle, `searching` while a search runs, `openPreset` for 5MB links, `openFile` for XML files.
- `states.loading` = spinner caption, `states.notFound` = caption shown when no preset link exists.
- `header.brand` = brand name in the top block, `header.tagline` = one line under it, `header.byline` = the "By Givy" line in accent color.
- `footer.brand` = brand name next to the Alight Motion mark, `footer.note` = short honest description paragraph, `footer.columns` = link columns (uppercase accent titles; `items` with `href` become links, without `href` they render as plain lines).
- `footer.copyright` and `footer.disclaimer` = the two lines on the bottom bar.
- `href` starting with `#` scrolls to that part of the page, anything else opens in a new tab. Do not delete `id="tt"` and `id="top"` from the code.
- Columns and items can be added or removed freely.
- Every key in this JSON must stay complete. Deleting a key fails `npm run build` with a clear message, so no text disappears silently.
- After editing, restart `npm run dev` (or run `npm run build` then `npm start`). The JSON is read at compile time, so changes show up after a rebuild.


## Struktur

```
app/
  api/find/route.ts   # endpoint SSE, memanggil scraper
  page.tsx            # halaman utama
  layout.tsx          # kerangka halaman: header atas dan footer bawah
  globals.css         # token warna, tipografi, dan gaya
components/
  Finder.tsx          # form, riwayat, keadaan aplikasi
  ResultView.tsx      # kartu hasil dan baris preset
  SiteFooter.tsx      # footer panel merek + kolom tautan
  AmLogo.tsx          # logo Alight Motion (SVG inline)
  Ornament.tsx        # ornamen SVG dekoratif
lib/
  ui.ts               # pembaca ui.json bertipe
  types.ts            # tipe data hasil
  amfinder.js         # penelusur link preset (dijalankan via child process)
public/fonts/         # font AXGC (regular sampai extrabold, dari Red_Corner_fonts.zip)
ui.json               # label tombol, teks status, isi footer
DESIGN.md             # catatan arah desain
```

## Cara kerja singkat

`app/api/find/route.ts` menerima `?url=...`, memvalidasi, lalu menjalankan `node lib/amfinder.js <url> --raw --all`. Log penelusuran dibaca dari stderr dan dikirim ke peramban lewat Server-Sent Events; hasil JSON dibaca dari stdout dan dikirim sebagai event terakhir. Maksimal 3 pencarian berjalan bersamaan.

## Catatan

- Penelusuran bergantung pada halaman TikTok dan tautan pihak ketiga. Kalau struktur halamannya berubah, hasilnya bisa kosong.
- Tidak semua video punya link preset. Keadaan kosong bukan kegagalan, memang tidak ada link di video itu.
- Link preset berasal dari unggahan kreator lain, bukan dari aplikasi ini.
- Hasil penelusuran disimpan sementara di `lib/amfinder.cache.json` (sudah masuk `.gitignore`).
