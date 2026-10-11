# Deploy ke Cloudflare Workers

Branch ini menjalankan scraper di dalam proses yang sama (tanpa `spawn`/`curl`/file), jadi bisa
jalan di Cloudflare Workers lewat adapter OpenNext. `main` tetap versi Vercel.

## Sekali setup
1. `npm install`
2. `npx wrangler login`
3. Secret (opsional, untuk notifikasi Telegram di `lib/track.ts`):
   ```
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_CHAT_ID
   ```

## Jalankan / deploy
- Coba lokal di runtime Workers: `npm run cf:preview`
- Deploy: `npm run cf:deploy`
- Domain: Cloudflare dashboard, Workers & Pages, am-finder, Settings, Domains & Routes, tambah `amfinder.web.id`.

## Yang perlu dipantau setelah deploy
- Paket gratis membatasi CPU sekitar 10 ms per request. Kalau muncul error 1102 ("exceeded CPU"),
  lihat Workers Observability untuk route mana yang kena. Jalur paling berat: `/api/find` dan `/api/search`.
- Cache sekarang di memori isolate, bukan file, jadi hasil bisa hilang saat isolate didaur ulang.
- Pencarian di tab Cari Preset memanggil tikwm/brave/searx lewat `fetch`. Dulu pakai `curl`;
  cek apakah engine-engine itu masih mau menjawab dari IP Cloudflare.
