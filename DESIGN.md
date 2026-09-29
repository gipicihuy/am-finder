# DESIGN.md - AM Finder

## Direction
**Alat kerja untuk editor AM.** Bukan landing page: buka -> tempel link TikTok -> lihat indikator loading -> dapat daftar link preset. Satu halaman, tanpa navigasi tujuan lain, tanpa section promosi. Identitas visual diambil dari Givime (situs milik sendiri): header sticky gelap, ornamen 3-garis di kepala section, definisi grid tanpa kartu, aksen tunggal.

`Dial: ENERGY 2 / RHYTHM 2 / MOTION 1`

## Palette
| Role | Value |
|------|--------|
| Canvas | `#0f0f10` |
| Surface | `#17171a` |
| Surface 2 | `#1e1e22` |
| Surface 3 | `#26262b` |
| Ink | `#f2f2f3` |
| Muted | `#9b9ba3` |
| Border | `#2c2c33` |
| Accent | `#00ffa0` |
| Accent-ink | `#04140b` |
| Accent-soft | `rgba(0, 255, 160, 0.12)` |

Cap: 1 aksen + netral. Aksen hanya di satu momen kunci per layar: tombol aksi utama, fokus keyboard, ornamen section, status berjalan, titik merek di header, tautan footer saat hover.

## Type
Font sendiri dari paket `Red_Corner_fonts.zip` (keluarga AXGC), dipasang lokal lewat `@font-face` di `public/fonts/`, tanpa font eksternal.

- **UI/body:** AXGC 400 (regular) untuk paragraf, 500 (medium) untuk label, 600 (semibold) untuk nilai meta.
- **Display (judul halaman, nama merek, judul section):** AXGC 700 (bold). Alasan: hierarki dibangun dari beda berat huruf dalam satu keluarga, bukan campur dua font.
- **Tombol aksi dan judul kolom footer:** AXGC 800 (extrabold) supaya terbaca sebagai elemen berat.
- Bobot thin/light/black dan `condensed.ttf` sengaja tidak dipasang, belum ada tempat yang butuh.

## Layout
- **Header:** bentuknya diambil dari situs Givime lain (stalker-ff-givy): blok rata tengah max 720px, aksen sudut HUD 2px di kiri-atas dan kanan-bawah, logo Alight Motion + nama merek, satu baris tagline, lalu `• By Givy •` berwarna aksen. Tanpa menu, tanpa sticky, tanpa tautan keluar.
- **Halaman:** judul + ornamen 3-garis -> kolom cari -> status (kosong / berjalan / galat) -> hasil -> riwayat lokal -> footer kolofon.
- **Status nihil:** hanya "Link preset tidak ditemukan." Tanpa merinci tempat yang sudah dicek.
- **Status berjalan:** spinner + satu baris teks. Tanpa daftar langkah pencarian.
- **Hasil:** blok meta video sebagai definisi grid tanpa kartu (Akun, Komentar, Views, Likes, tanpa baris Video), lalu daftar baris preset (thumb + judul + label fungsi + aksi). Daftar, bukan grid kartu seragam.
- **Footer:** bentuk yang sama dengan footer stalker-ff-givy (situs milik sendiri): panel latar `surface` dengan batas atas, isi dua kolom. Kiri: logo Alight Motion (SVG dari svgrepo, dipakai ulang lewat `AmLogo.tsx`, stroke mengikuti warna aksen) + nama merek + satu paragraf jujur. Kanan: kolom tautan berjudul uppercase ber-aksen (`Explore`, `About`) seperti footer stalker. Baris paling bawah: `© 2026 Givy. All rights reserved.` di kiri, `Not affiliated with TikTok or Alight Motion.` di kanan. Tidak ada tautan `kode sumber` sama sekali.
- **Tombol aksi:** balok aksen dengan alas tekan inset 3px di bawah supaya terasa tombol fisik, naik 1px saat hover, turun 2px saat ditekan. Label pendek `Cari`, mengikuti kata kerja di judul halaman. Bukan pil, bukan gradien, bukan glow.
- **Uppercase + tracking lebar** dipakai khusus untuk judul kolom footer (11px, 0.08em, warna aksen), mengikuti bentuk footer stalker-ff-givy. Di luar footer tidak ada teks uppercase ber-tracking.
- **RHYTHM 2:** komposisi beda antar blok (grid definisi vs baris daftar vs teks status), tanpa hero dan tanpa section template.
- **MOTION 1:** transisi hover/fokus <=150ms plus spinner proses yang berhenti saat selesai. Tanpa animasi hias berulang.

## Footer & header: alasan dan referensi
Arahnya diputuskan ulang setelah footer versi sebelumnya (kolofon prosa + wordmark raksasa) diminta diganti dengan bentuk milik sendiri. Sumber bentuk: **stalker-ff-givy**, repo situs Givime lain, bagian `SiteFooter.tsx` dan `SiteHeader.tsx`.

- **Header** menyalin susunan stalker: blok rata tengah, aksen sudut HUD, logo + nama merek + tagline + baris `By Givy`. Logo dipakai untuk Alight Motion.
- **Footer** menyalin susunan stalker: kiri merek + paragraf, kanan kolom uppercase ber-aksen, bawah dua baris `© ... All rights reserved.` + disclaimer. Judul kolom uppercase ber-aksen disengaja karena itu gaya keluarga situs Givime.
- **Tanpa `kode sumber`**: tidak ada tautan ke repo di header maupun footer, sesuai permintaan.
- **Bahasa Inggris** untuk seluruh isi situs (judul, status, tombol, footer), jadi `ui.json` juga berbahasa Inggris.
- Referensi riset sebelumnya tetap dicatat sebagai pembanding: paco.me dan danluu.com (footer sangat sedikit isi), swyx.io dan seangoedecke.com (tautan inline tanpa judul kolom), simonwillison.net (baris meta kecil), raredays.com (wordmark besar + kredit satu baris). Pola itu tidak dipakai karena permintaannya kembali ke bentuk stalker.

## Purpose notes (alasan teknik)
- **Ikon:** hanya satu, kaca pembesar di kolom pencarian. Alasan: menandai fungsi kolom, isinya sama dengan label tombol sebelahnya. Tidak ada ikon bintang/petir/orb.
- **Ornamen 3-garis** di kepala section: motif identitas yang dipinjam dari Givime, dipakai berulang di tiap section sebagai penanda hierarki, bukan hiasan kosong.
- **Badge** di baris preset hanya berisi label fungsi: tipe link, sumber penemuan, ukuran file, status pin. Tidak ada badge "AI Powered", "Beta", atau sejenisnya.
- **Spinner** hanya muncul saat pencarian berjalan dan berhenti begitu selesai (MOTION 1).
- **Tanpa gradien, tanpa glow kartu, tanpa glass** kecuali transparansi latar sticky header.

## Teks yang bisa diubah
- Label tombol, tulisan status, nama merek header, dan isi footer dikumpulkan di `ui.json` supaya bisa diedah tanpa menyentuh kode. Kuncinya bertipe di `lib/ui.ts`.

## Forbidden
- Emoji sebagai dekorasi di UI
- Gradien biru-ungu, glow kartu, glass di banyak elemen
- Angka klaim yang bukan data asli (views/likes hanya kalau datang dari scraper)
- Nav atau link menuju halaman yang tidak ada
- FAQ, testimoni, section "cara kerja 3 langkah"
