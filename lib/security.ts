import { clientIp, isPrivateIp } from "./ip";
import { formatTime } from "./track";
import { isDeduplicated, sendDiscordEmbed, reportServerError, reportBotActivity } from "./discord";
import { checkAutoBlock } from "./blocklist";

export { reportServerError, reportBotActivity };

export const GOOD_BOT =
  /googlebot|bingbot|duckduckbot|slurp|yandexbot|baiduspider|facebookexternalhit|twitterbot|linkedinbot|applebot|petalbot|semrushbot|ahrefsbot/i;

export const BAD_BOT_UA =
  /headless|puppeteer|playwright|phantom|selenium|webdriver|python-requests|python-urllib|aiohttp|httpx|curl\/|wget\/|go-http-client|node-fetch|undici|axios\/|scrapy|libwww-perl|java\/|okhttp|postmanruntime/i;

type PenaltyRecord = {
  count: number;
  lastAt: number;
};

type SecondBucket = {
  sec: number;
  total: number;
  ipCounts: Map<string, number>;
};

type BotnetGroup = {
  startedAt: number;
  ips: Set<string>;
};

type SecurityStore = {
  penaltyStrikes: Map<string, PenaltyRecord>;
  botnetMap: Map<string, BotnetGroup>;
  buckets: SecondBucket[];
  lastSpikeAlertAt: number;
};

function getSecurityStore(): SecurityStore {
  const g = globalThis as typeof globalThis & { __amSecurityState?: SecurityStore };
  if (!g.__amSecurityState) {
    g.__amSecurityState = {
      penaltyStrikes: new Map(),
      botnetMap: new Map(),
      buckets: [],
      lastSpikeAlertAt: 0,
    };
  }
  return g.__amSecurityState;
}

/**
 * Deteksi dan laporkan penyerang yang memicu penalty rate-limit di lib/rate-limit.ts.
 */
export function onRateLimitPenalty(
  ip: string,
  scope: string,
  sustained: number,
  penaltyAt: number,
  ua = "-",
): void {
  if (!ip || isPrivateIp(ip)) return;

  const store = getSecurityStore();
  const now = Date.now();
  let record = store.penaltyStrikes.get(ip);
  if (!record || now - record.lastAt > 10 * 60_000) {
    record = { count: 0, lastAt: now };
  }
  record.count += 1;
  record.lastAt = now;
  store.penaltyStrikes.set(ip, record);

  // Auto-block jika IP kena penalty berulang (3x dalam 10 menit)
  if (record.count >= 3) {
    checkAutoBlock(
      ip,
      `Kena penalty rate-limit ${record.count}x dalam 10 menit (kategori: ${scope})`,
      { strikes: record.count, ua },
    );
  }

  const dedupKey = `sec:penalty:${ip}`;
  if (isDeduplicated(dedupKey, 60_000)) return;

  sendDiscordEmbed("security", {
    title: "🔥 Indikasi Flood / DDoS Aplikasi",
    description: `Satu alamat IP telah memicu **penalty rate-limiter** karena volume request yang melewati batas kewajaran.`,
    color: 0xc0392b, // Dark red
    fields: [
      { name: "🌐 IP Penyerang", value: `\`${ip}\``, inline: true },
      { name: "🎯 Kategori Limiter", value: `\`${scope}\``, inline: true },
      { name: "📊 Volume Request", value: `${sustained} req (ambang penalty: ${penaltyAt})`, inline: true },
      { name: "⚡ Penalty Strike", value: `${record.count}x / 10 menit`, inline: true },
      { name: "🖥️ User Agent", value: `\`${ua.slice(0, 200)}\``, inline: false },
      {
        name: "⚡ Aksi Cepat (Blokir IP)",
        value: `\`\`\`bash\ncurl -X POST https://<domain>/api/admin/block -H "Authorization: Bearer $AMF_ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"ip":"${ip}","reason":"DDoS/Flood kategori ${scope}","ttlMinutes":60}'\n\`\`\``,
        inline: false,
      },
      {
        name: "🛡️ Catatan Keamanan",
        value: "Serangan volumetrik besar harus ditahan di tingkat jaringan (Cloudflare / ufw), bukan hanya di aplikasi.",
        inline: false,
      },
    ],
    timestamp: new Date().toISOString(),
  });
}

/**
 * Catat setiap request masuk untuk mendeteksi lonjakan trafik global (RPS spike).
 */
export function recordGlobalHit(ip: string): void {
  if (!ip || isPrivateIp(ip)) return;

  const now = Date.now();
  const currentSec = Math.floor(now / 1000);
  const store = getSecurityStore();

  // Bersihkan bucket yang lebih lama dari 5 detik
  store.buckets = store.buckets.filter((b) => b.sec >= currentSec - 4);

  let currentBucket = store.buckets.find((b) => b.sec === currentSec);
  if (!currentBucket) {
    currentBucket = { sec: currentSec, total: 0, ipCounts: new Map() };
    store.buckets.push(currentBucket);
  }

  currentBucket.total += 1;
  currentBucket.ipCounts.set(ip, (currentBucket.ipCounts.get(ip) || 0) + 1);

  const threshold = Number(process.env.SECURITY_GLOBAL_RPS) || 60;
  const rps = currentBucket.total;

  if (rps >= threshold) {
    const INTERVAL_MS = 2 * 60_000; // Paling sering sekali per 2 menit
    if (now - store.lastSpikeAlertAt >= INTERVAL_MS) {
      store.lastSpikeAlertAt = now;

      // Ambil 5 IP teratas penyumbang trafik detik ini
      const sortedIps = Array.from(currentBucket.ipCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      const ipListText = sortedIps
        .map(([topIp, count], idx) => `${idx + 1}. \`${topIp}\` › **${count} req/s**`)
        .join("\n");

      sendDiscordEmbed("security", {
        title: "📈 Lonjakan Trafik Global Terdeteksi",
        description: `Trafik request seluruh server melonjak mencapai **${rps} req/detik** (ambang batas: ${threshold} req/detik).`,
        color: 0xe67e22,
        fields: [
          { name: "📊 Total RPS Detik Ini", value: `${rps} req/s`, inline: true },
          { name: "🕐 Waktu Kejadian", value: formatTime(), inline: true },
          {
            name: "🔝 5 IP Teratas Penyumbang Trafik",
            value: ipListText || "Tidak ada data IP",
            inline: false,
          },
          {
            name: "🛡️ Catatan Keamanan",
            value: "Serangan volumetrik besar harus ditahan di tingkat jaringan (Cloudflare / ufw), bukan hanya di aplikasi.",
            inline: false,
          },
        ],
        timestamp: new Date().toISOString(),
      });
    }
  }
}

/**
 * Alert security untuk skor anti-scrape tinggi (menggantikan sendSecurityAlert Telegram).
 * Throttle 30 detik per IP.
 */
export function reportSecurityAlert(
  headers: Headers,
  input: { score: number; reasons: string[]; did?: string; path?: string },
): void {
  const ip = clientIp(headers);
  if (!ip || isPrivateIp(ip)) return;

  const dedupKey = `sec:alert:${ip}`;
  if (isDeduplicated(dedupKey, 30_000)) return;

  const ua = (headers.get("user-agent") || "-").slice(0, 200);

  // Auto-block jika AUTO_BLOCK=1 dan skor kritis (>= 90)
  if (input.score >= 90) {
    checkAutoBlock(
      ip,
      `Skor scraping kritis (${input.score}): ${input.reasons.join(", ") || "-"}`,
      { score: input.score, ua },
    );
  }

  sendDiscordEmbed("security", {
    title: "🚨 AM Finder Security: Skor Scraping Tinggi",
    color: 0xe74c3c, // Red
    fields: [
      { name: "🧠 Skor Risiko", value: `**${input.score}** / 100`, inline: true },
      { name: "🌐 IP", value: `\`${ip}\``, inline: true },
      { name: "🕵️ Device ID", value: `\`${input.did || "-"}\``, inline: true },
      { name: "📄 Path", value: `\`${input.path || "-"}\``, inline: true },
      { name: "🧩 Alasan Terdeteksi", value: input.reasons.join(", ") || "-", inline: false },
      { name: "🖥️ User Agent", value: `\`${ua}\``, inline: false },
      {
        name: "⚡ Aksi Cepat (Blokir IP)",
        value: `\`\`\`bash\ncurl -X POST https://<domain>/api/admin/block -H "Authorization: Bearer $AMF_ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"ip":"${ip}","reason":"Scraping tripwire (skor ${input.score})","ttlMinutes":60}'\n\`\`\``,
        inline: false,
      },
      {
        name: "🛡️ Catatan Keamanan",
        value: "Serangan volumetrik besar harus ditahan di tingkat jaringan (Cloudflare / ufw), bukan hanya di aplikasi.",
        inline: false,
      },
    ],
    timestamp: new Date().toISOString(),
  });
}

/**
 * Lacak dan deteksi botnet kecil: banyak IP berbeda memakai fingerprint / UA scraper yang sama.
 */
export function trackBotnetPattern(ip: string, ua: string): void {
  if (!ip || isPrivateIp(ip) || !ua || ua === "-") return;
  if (GOOD_BOT.test(ua)) return;
  if (!BAD_BOT_UA.test(ua) && !/python|curl|wget|axios|undici|node-fetch|go-http/i.test(ua)) return;

  const store = getSecurityStore();
  const now = Date.now();
  const cleanUa = ua.slice(0, 180);

  let group = store.botnetMap.get(cleanUa);
  if (!group || now - group.startedAt > 10 * 60_000) {
    group = { startedAt: now, ips: new Set<string>() };
    store.botnetMap.set(cleanUa, group);
  }
  group.ips.add(ip);

  // Jika >= 6 IP unik memakai UA bot yang sama dalam 10 menit
  if (group.ips.size >= 6) {
    const dedupKey = `botnet:${cleanUa.slice(0, 60)}`;
    if (isDeduplicated(dedupKey, 10 * 60_000)) return;

    const sampleIps = Array.from(group.ips).slice(0, 6);
    sendDiscordEmbed("security", {
      title: "🕸️ Terdeteksi Pola Botnet Multi-IP",
      description: `Terdeteksi **${group.ips.size} alamat IP unik** memakai pola signature bot yang sama dalam 10 menit.`,
      color: 0x9b59b6,
      fields: [
        { name: "🖥️ Bot Signature / UA", value: `\`${cleanUa}\``, inline: false },
        { name: "📊 Total IP Unik", value: `${group.ips.size} IP`, inline: true },
        {
          name: "📋 Contoh IP Penyerang",
          value: sampleIps.map((i) => `\`${i}\``).join(", "),
          inline: false,
        },
        {
          name: "🛡️ Rekomendasi Mitigasi",
          value: "Buat aturan WAF / firewall Cloudflare untuk memblokir User-Agent ini di level edge.",
          inline: false,
        },
      ],
      timestamp: new Date().toISOString(),
    });
  }
}
