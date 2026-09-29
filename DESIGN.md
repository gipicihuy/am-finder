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

Cap: 1 aksen + netral. Aksen hanya di satu momen kunci per layar: tombol aksi utama, fokus keyboard, ornamen section, status berjalan.

## Type
- **UI/body:** Plus Jakarta Sans. Alasan: sudah dipakai Givime, jadi satu suara dengan situs induk.
- **Display (page title, judul block):** Bricolage Grotesque. Alasan: hierarki dibangun dari beda display vs sans, bukan dari ukuran acak.

## Layout
- **Header:** wordmark teks saja (tidak ada aset logo buatan).
- **Halaman:** judul + ornamen 3-garis -> kolom cari -> status (kosong / berjalan / galat) -> hasil -> riwayat lokal -> footer satu baris.
- **Status nihil:** hanya "Link preset tidak ditemukan." Tanpa merinci tempat yang sudah dicek.
- **Status berjalan:** spinner + satu baris teks. Tanpa daftar langkah pencarian.
- **Hasil:** blok meta video sebagai definisi grid tanpa kartu, lalu daftar baris preset (thumb + judul + label fungsi + aksi). Daftar, bukan grid kartu seragam.
- **RHYTHM 2:** komposisi beda antar blok (grid definisi vs baris daftar vs teks status), tanpa hero dan tanpa section template.
- **MOTION 1:** transisi hover/fokus <=150ms plus spinner proses yang berhenti saat selesai. Tanpa animasi hias berulang.

## Purpose notes (alasan teknik)
- **Ikon:** hanya satu, kaca pembesar di kolom pencarian. Alasan: menandai fungsi kolom, isinya sama dengan label tombol sebelahnya. Tidak ada ikon bintang/petir/orb.
- **Ornamen 3-garis** di kepala section: motif identitas yang dipinjam dari Givime, dipakai berulang di tiap section sebagai penanda hierarki, bukan hiasan kosong.
- **Badge** di baris preset hanya berisi label fungsi: tipe link, sumber penemuan, ukuran file, status pin. Tidak ada badge "AI Powered", "Beta", atau sejenisnya.
- **Spinner** hanya muncul saat pencarian berjalan dan berhenti begitu selesai (MOTION 1).
- **Tanpa gradien, tanpa glow kartu, tanpa glass** kecuali transparansi latar sticky header.

## Teks yang bisa diubah
- Label tombol dan tulisan footer dikumpulkan di `ui.json` supaya bisa diedah tanpa menyentuh kode. Kuncinya bertipe di `lib/ui.ts`.

## Forbidden
- Emoji sebagai dekorasi di UI
- Gradien biru-ungu, glow kartu, glass di banyak elemen
- Angka klaim yang bukan data asli (views/likes hanya kalau datang dari scraper)
- Nav atau link menuju halaman yang tidak ada
- FAQ, testimoni, section "cara kerja 3 langkah"
