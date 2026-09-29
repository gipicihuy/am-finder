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
- **UI/body:** Plus Jakarta Sans. Alasan: sudah dipakai Givime, jadi satu suara dengan situs induk.
- **Display (page title, judul block):** Bricolage Grotesque. Alasan: hierarki dibangun dari beda display vs sans, bukan dari ukuran acak.

## Layout
- **Header:** baris tipis, garis rambut 1px di bawah, latar sama dengan halaman. Isinya cuma dua hal: wordmark teks dengan titik aksen 7px di depannya, dan satu tautan nyata (`kode sumber`) di kanan. Tanpa chip kotak, tanpa menu empat item, tanpa pil blur.
- **Halaman:** judul + ornamen 3-garis -> kolom cari -> status (kosong / berjalan / galat) -> hasil -> riwayat lokal -> footer kolofon.
- **Status nihil:** hanya "Link preset tidak ditemukan." Tanpa merinci tempat yang sudah dicek.
- **Status berjalan:** spinner + satu baris teks. Tanpa daftar langkah pencarian.
- **Hasil:** blok meta video sebagai definisi grid tanpa kartu (Akun, Komentar, Views, Likes, tanpa baris Video), lalu daftar baris preset (thumb + judul + label fungsi + aksi). Daftar, bukan grid kartu seragam.
- **Footer:** satu garis rambut, latar sama dengan halaman (tanpa panel kedua, biar tidak terasa seperti blok template). Bentuknya kolofon, bukan peta situs: satu paragraf cara kerja + kredit yang ditulis seperti orang bicara, lalu deretan tautan sebaris dipisah titik, lalu wordmark `AM FINDER` besar dan samar sebagai jangkar visual, ditutup baris paling bawah `AM Finder © 2026 Givy`. Tidak ada kolom, tidak ada judul kolom, tidak ada baris disclaimer hukum.
- **Tombol aksi:** balok aksen dengan alas tekan inset 3px di bawah supaya terasa tombol fisik, naik 1px saat hover, turun 2px saat ditekan. Label pendek `Cari`, mengikuti kata kerja di judul halaman. Bukan pil, bukan gradien, bukan glow.
- **Uppercase + tracking lebar** tidak dipakai sama sekali di header/footer. Alasannya: pola judul kolom 11px ber-tracking lebar di atas dua tautan pendek adalah penanda paling cepat terbaca sebagai footer hasil generate; situs nyata memakai `<h2>` biasa, label berkurung, atau kalimat prosa (lihat referensi di bawah).
- **RHYTHM 2:** komposisi beda antar blok (grid definisi vs baris daftar vs teks status), tanpa hero dan tanpa section template.
- **MOTION 1:** transisi hover/fokus <=150ms plus spinner proses yang berhenti saat selesai. Tanpa animasi hias berulang.

## Footer & header: alasan dan referensi
Versi footer sebelumnya (logo + paragraf kiri, dua kolom tautan, baris bawah dua kolom) disebut terlihat seperti hasil generate. Pola itu persis pola default footer template. Riset ulang dibaca langsung dari HTML/CSS situs nyata, lalu dipilih pola berikut:

- **paco.me** (satu baris motto + tahun, `border-top` saja, nol kolom) dan **danluu.com** (tautan tersebar ke dua ujung, italic, tanpa copyright) -> dipinjam: footer boleh sangat sedikit isinya, dan tautan tidak wajib bergrid.
- **swyx.io** dan **seangoedecke.com** (satu paragraf, tautan inline dipisah `·`/`│`, tanpa judul kolom) -> dipinjam: seluruh tautan jadi satu baris sebaris.
- **simonwillison.net** (`#ft` berisi `Disclosures · Colophon · © · tahun`) -> dipinjam: baris meta kecil sebagai penutup, bukan dua kolom kaku.
- **raredays.com** dan **footer.design** (wordmark/brand besar + kredit satu baris) -> dipinjam: wordmark besar samar sebagai jangkar dasar footer, `AM Finder © 2026 Givy` tetap jadi baris paling bawah.
- **allenpike.com** dan **raredays.com** (kredit ditulis sebagai kalimat, tahun nempel di dalam kalimat) -> dipinjam: `footer.note` berbentuk prosa jujur, bukan blok disclaimer.

Tanda AI slop yang sengaja dihindari: judul kolom uppercase ber-tracking aksen, grid dua kolom yang tidak dituntut isi, panel latar berbeda hanya untuk empat tautan, baris `© kiri + disclaimer kanan`, menu header yang berisi anchor ke bagian yang sama.

Untuk header: **ray.so** (bar 50px, merek kiri, aksi kanan, tanpa menu) dan **emilkowal.ski** (header cuma dua baris) jadi dasar keputusan header satu baris isinya merek + satu tautan nyata.

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
