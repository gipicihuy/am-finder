import { clientIp, isPrivateIp } from "./ip";
import { isDeduplicated, sendDiscordEmbed } from "./discord";

export type Battery = { level?: number; charging?: boolean };

type Geo = { city: string; region: string; country: string; isp: string };

const GEO_MISS: Geo = { city: "-", region: "-", country: "-", isp: "-" };
const geoCache = new Map<string, Geo>();
const TIMEZONE = "Asia/Jakarta";

export async function geo(ip: string): Promise<Geo> {
  if (isPrivateIp(ip)) return GEO_MISS;
  const hit = geoCache.get(ip);
  if (hit) return hit;
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,regionName,country,isp`,
      { signal: AbortSignal.timeout(3000) },
    );
    const data = (await res.json()) as {
      status?: string;
      city?: string;
      regionName?: string;
      country?: string;
      isp?: string;
    };
    if (data?.status !== "success") return GEO_MISS;
    const found: Geo = {
      city: data.city || "-",
      region: data.regionName || "-",
      country: data.country || "-",
      isp: data.isp || "-",
    };
    if (geoCache.size > 500) geoCache.delete(geoCache.keys().next().value as string);
    geoCache.set(ip, found);
    return found;
  } catch {
    return GEO_MISS;
  }
}

export function getBrowser(ua: string): string {
  if (/Edg\//i.test(ua)) return "Microsoft Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/SamsungBrowser/i.test(ua)) return "Samsung Browser";
  if (/UCBrowser/i.test(ua)) return "UC Browser";
  if (/YaBrowser/i.test(ua)) return "Yandex Browser";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua)) return "Safari";
  if (/MSIE|Trident/i.test(ua)) return "Internet Explorer";
  return "Unknown Browser";
}

export function getDevice(ua: string): string {
  if (/iPad/i.test(ua)) return "iPad (iOS)";
  if (/iPhone/i.test(ua)) return "iPhone (iOS)";
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return "Android Phone";
  if (/Android/i.test(ua)) return "Android Tablet";
  if (/Windows NT/i.test(ua)) return "Windows PC";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Linux/i.test(ua)) return "Linux";
  return "Unknown Device";
}

function escMdPlain(value: string): string {
  return value.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

function escMdCode(value: string): string {
  return value.replace(/[`\\]/g, "\\$&");
}

export function formatTime(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIMEZONE,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} WIB`;
}

export function batteryText(battery?: Battery): string {
  if (!battery || typeof battery.level !== "number" || Number.isNaN(battery.level)) return "-";
  const level = Math.max(0, Math.min(100, Math.round(battery.level)));
  return `${level}%${battery.charging ? " (charging)" : ""}`;
}

export function normalizeBattery(raw: unknown): Battery | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as { level?: unknown; charging?: unknown };
  let level = typeof value.level === "number" ? value.level : undefined;
  if (typeof level === "number" && level >= 0 && level <= 1) level *= 100;
  if (typeof level !== "number" || Number.isNaN(level)) return undefined;
  return { level, charging: value.charging === true };
}

export type VisitorInfo = {
  ip: string;
  city: string;
  region: string;
  country: string;
  isp: string;
  device: string;
  browser: string;
  battery: string;
  time: string;
  ua: string;
};

export async function getVisitorInfo(headers: Headers, battery?: Battery): Promise<VisitorInfo> {
  const ip = clientIp(headers);
  const ua = (headers.get("user-agent") || "-").slice(0, 200);
  const g = await geo(ip);

  return {
    ip,
    city: g.city,
    region: g.region,
    country: g.country,
    isp: g.isp,
    device: getDevice(ua),
    browser: getBrowser(ua),
    battery: batteryText(battery),
    time: formatTime(),
    ua,
  };
}

export function formatVisitorDiscord(info: VisitorInfo): string {
  return [
    "**🌐 Visitor Info**",
    `🔌 **IP**      › \`${info.ip}\``,
    `📍 **Kota**    › ${info.city}, ${info.region}`,
    `🌍 **Negara**  › ${info.country}`,
    `📡 **ISP**     › ${info.isp}`,
    `🖥️ **Device**  › ${info.device}`,
    `🌏 **Browser** › ${info.browser}`,
    `🔋 **Baterai** › ${info.battery}`,
    `🕐 **Waktu**   › ${info.time}`,
  ].join("\n");
}

function visitorBlockTelegram(ip: string, g: Geo, ua: string, battery?: Battery): string {
  return [
    "*🌐 Visitor Info*",
    `🔌 *IP*      › \`${escMdCode(ip)}\``,
    `📍 *Kota*    › ${escMdPlain(g.city)}, ${escMdPlain(g.region)}`,
    `🌍 *Negara*  › ${escMdPlain(g.country)}`,
    `📡 *ISP*     › ${escMdPlain(g.isp)}`,
    `🖥 *Device*  › ${escMdPlain(getDevice(ua))}`,
    `🌏 *Browser* › ${escMdPlain(getBrowser(ua))}`,
    `🔋 *Baterai* › ${escMdPlain(batteryText(battery))}`,
    `🕐 *Waktu*   › ${escMdPlain(formatTime())}`,
  ].join("\n");
}

/**
 * Log kunjungan biasa (kind === "visit") tetap dikirim ke Telegram sesuai instruksi.
 * Log pencarian dipindahkan ke Discord via logSearchToDiscord().
 */
export async function sendLog(
  kind: "visit" | "search",
  headers: Headers,
  extra: { path?: string; link?: string; battery?: Battery } = {},
): Promise<void> {
  if (kind === "search") {
    // Dipindahkan ke Discord webhook (lihat logSearchToDiscord)
    return;
  }

  const ip = clientIp(headers);
  const ua = (headers.get("user-agent") || "-").slice(0, 200);
  const g = await geo(ip);

  console.log(
    `[track] visit ip=${ip} city=${g.city} path=${extra.path || "-"} battery=${batteryText(extra.battery)}`,
  );

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const head = `🟢 *Visitor Baru*\n\n🖥 *Halaman* › \`${escMdCode(extra.path || "/")}\``;
  const text = `${head}\n\n${visitorBlockTelegram(ip, g, ua, extra.battery)}`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) console.log(`[track] telegram http ${res.status}`);
  } catch {
    /* telegram lagi down: jangan ganggu request pengunjung */
  }
}

export function detectPlatform(url: string): { name: string; tag: string; color: number } {
  if (/(?:youtube\.com|youtu\.be|youtube-nocookie\.com)/i.test(url)) {
    return { name: "YouTube", tag: "▶️ YouTube", color: 0xff0000 };
  }
  if (/(?:tiktok\.com|tt\.site)/i.test(url)) {
    return { name: "TikTok", tag: "🎵 TikTok", color: 0x25f4ee };
  }
  return { name: "TikTok / YouTube", tag: "🎬 Video", color: 0x00d2d3 };
}

/**
 * Kirim log pencarian ke Discord webhook ("tiktok" untuk URL pencarian TikTok/YouTube, "search" untuk keyword).
 */
export async function logSearchToDiscord(
  channel: "tiktok" | "search",
  headers: Headers,
  extra: { link?: string; query?: string; battery?: Battery },
): Promise<void> {
  const info = await getVisitorInfo(headers, extra.battery);
  const visitorDesc = formatVisitorDiscord(info);

  if (channel === "tiktok") {
    const link = extra.link || "-";
    const platform = detectPlatform(link);
    console.log(`[track] search (${platform.name.toLowerCase()}) ip=${info.ip} city=${info.city} link=${link}`);
    sendDiscordEmbed("tiktok", {
      title: `🔎 Pencarian Baru (URL ${platform.name})`,
      description: `🔗 **Link Target (${platform.name})**\n\`${link}\`\n\n${visitorDesc}`,
      color: platform.color,
      timestamp: new Date().toISOString(),
    });
  } else {
    const query = extra.query || extra.link || "-";
    console.log(`[track] search (keyword) ip=${info.ip} city=${info.city} query=${query}`);
    sendDiscordEmbed("search", {
      title: "🔎 Pencarian Baru (Keyword)",
      description: `🔍 **Keyword Query**\n\`${query}\`\n\n${visitorDesc}`,
      color: 0x9b59b6, // Purple
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Ekstraksi judul video dari data hasil scraping.
 * Memeriksa `video.title` (YouTube), `video.description` (TikTok/YouTube),
 * atau cadangan judul dari nama preset pertama yang ditemukan.
 */
export function extractVideoTitle(row: Record<string, unknown>): string {
  const video = (row.video || {}) as Record<string, any>;
  if (typeof video.title === "string" && video.title.trim()) {
    return video.title.trim();
  }
  const desc = typeof video.description === "string" ? video.description.trim() : "";
  if (desc) {
    const firstLine = desc.split(/[\r\n]+/)[0].trim();
    if (firstLine) {
      return firstLine.length > 180 ? `${firstLine.slice(0, 180)}…` : firstLine;
    }
    return desc.length > 180 ? `${desc.slice(0, 180)}…` : desc;
  }
  if (typeof row.title === "string" && row.title.trim()) {
    return row.title.trim();
  }
  const presets = Array.isArray(row.presetLinks) ? (row.presetLinks as Record<string, any>[]) : [];
  const firstPresetTitle = presets.find((p) => typeof p.title === "string" && p.title.trim())?.title?.trim();
  if (firstPresetTitle) {
    return firstPresetTitle;
  }
  if (typeof row.author === "string" && row.author.trim()) {
    return `Video Preset by ${row.author.trim()}`;
  }
  return "-";
}

/**
 * Format daftar preset untuk Discord Embed dengan link markdown yang rapi
 * dan URL kode satu-klik salin/tap.
 */
export function formatPresetList(presets: Record<string, any>[]): string {
  const typeMap: Record<string, string> = {
    "5mb": "5MB",
    xml: "XML",
    sound: "Musik",
    font: "Font",
    bahan: "Bahan",
  };

  const lines: string[] = [];
  let currentLen = 0;

  for (let i = 0; i < presets.length; i++) {
    const p = presets[i];
    const type = typeMap[p.type] || String(p.type || "PRESET").toUpperCase();
    const label = p.title ? `${type} • ${p.title}` : type;
    const size = p.size ? ` \`(${p.size})\`` : "";
    const src = p.source ? ` • _[${p.source}]_` : "";
    const line = `${i + 1}. [**${label}**](${p.url})${size}${src}\n   🔗 \`${p.url}\``;

    if (currentLen + line.length + 50 > 1020) {
      lines.push(`_...dan ${presets.length - i} preset lainnya_`);
      break;
    }
    lines.push(line);
    currentLen += line.length + 1;
  }

  return lines.join("\n\n");
}

/**
 * Notifikasi ke Discord saat preset berhasil ditemukan.
 * Menampilkan Judul Video dan Daftar Link Preset ke:
 * - "whatsapp" (bila ada preset dari Saluran WhatsApp)
 * - "telegram" (bila ada preset dari Channel Telegram)
 * - "tiktok" (preset-from-tiktok-youtube untuk preset TikTok / YouTube)
 */
export function notifyPresetSources(row: Record<string, unknown>, inputUrl: string): void {
  const presets = Array.isArray(row.presetLinks) ? (row.presetLinks as Record<string, any>[]) : [];
  if (!presets.length) return;

  const videoTitle = extractVideoTitle(row);
  const author = typeof row.author === "string" && row.author ? row.author : "-";
  const chInfo = (row.channelInfo || {}) as Record<string, any>;
  const shareLinks = Array.isArray(row.shareLinks) ? (row.shareLinks as Record<string, any>[]) : [];
  const otherLinks = Array.isArray(row.otherLinks) ? (row.otherLinks as Record<string, any>[]) : [];

  // 1. Saluran WhatsApp (jika ada preset dari saluran WA)
  const waPresets = presets.filter((p) => p.source === "saluran WA" || p.source === "saluran");
  if (waPresets.length) {
    const chUrl =
      chInfo.url ||
      shareLinks.find((s: any) => typeof s.url === "string" && s.url.includes("whatsapp.com/channel/"))?.url ||
      otherLinks.find((s: any) => typeof s.url === "string" && s.url.includes("whatsapp.com/channel/"))?.url ||
      "";
    const chCode = chUrl.match(/whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/)?.[1] || "";
    const chName = chInfo.name || (chCode ? `Channel ${chCode}` : "Saluran WhatsApp");
    const messageUrl = chInfo.messageUrl || (chCode ? `https://whatsapp.com/channel/${chCode}` : "");

    const dedupKey = `wa:${chCode || chUrl || inputUrl}`;
    if (!isDeduplicated(dedupKey, 10 * 60_000)) {
      sendDiscordEmbed("whatsapp", {
        title: "📢 Berhasil Mengambil Preset dari Saluran WhatsApp!",
        color: 0x25d366, // WhatsApp green
        fields: [
          { name: "🎬 Judul Video", value: videoTitle, inline: false },
          { name: "📢 Saluran", value: chName, inline: true },
          { name: "🔑 Kode", value: chCode ? `\`${chCode}\`` : "-", inline: true },
          { name: "📦 Total Preset", value: `${waPresets.length}`, inline: true },
          ...(author !== "-" ? [{ name: "👤 Creator", value: author, inline: true }] : []),
          { name: "🎁 Daftar Link Preset", value: formatPresetList(waPresets), inline: false },
          ...(messageUrl ? [{ name: "💬 Pesan Saluran", value: messageUrl, inline: false }] : []),
          { name: "🎯 Video Target", value: inputUrl, inline: false },
        ],
        timestamp: new Date().toISOString(),
      });
    }
  }

  // 2. Channel Telegram (jika ada preset dari saluran Telegram)
  const tgPresets = presets.filter(
    (p) => p.source === "telegram" || String(p.source || "").toLowerCase().includes("telegram"),
  );
  if (tgPresets.length) {
    const chUrl =
      chInfo.url ||
      shareLinks.find(
        (s: any) =>
          typeof s.url === "string" &&
          (s.url.includes("t.me/") || s.url.includes("telegram.me/")),
      )?.url ||
      otherLinks.find(
        (s: any) =>
          typeof s.url === "string" &&
          (s.url.includes("t.me/") || s.url.includes("telegram.me/")),
      )?.url ||
      "";
    const chName = chInfo.name || "Channel Telegram";
    const messageUrl = chInfo.messageUrl || chUrl || "";

    const dedupKey = `tg:${chName || chUrl || inputUrl}`;
    if (!isDeduplicated(dedupKey, 10 * 60_000)) {
      sendDiscordEmbed("telegram", {
        title: "📢 Berhasil Mengambil Preset dari Saluran Telegram!",
        color: 0x0088cc, // Telegram blue
        fields: [
          { name: "🎬 Judul Video", value: videoTitle, inline: false },
          { name: "📢 Channel", value: chName, inline: true },
          { name: "📦 Total Preset", value: `${tgPresets.length}`, inline: true },
          ...(author !== "-" ? [{ name: "👤 Creator", value: author, inline: true }] : []),
          { name: "🎁 Daftar Link Preset", value: formatPresetList(tgPresets), inline: false },
          ...(messageUrl ? [{ name: "💬 Pesan Channel", value: messageUrl, inline: false }] : []),
          { name: "🎯 Video Target", value: inputUrl, inline: false },
        ],
        timestamp: new Date().toISOString(),
      });
    }
  }

  // 3. Preset TikTok / YouTube ke channel Discord preset-from-tiktok-youtube (webhook "tiktok")
  const dedupKey = `found:${inputUrl}`;
  if (!isDeduplicated(dedupKey, 10 * 60_000)) {
    const platform = detectPlatform(inputUrl);
    sendDiscordEmbed("tiktok", {
      title: `🎉 Preset Ditemukan! (${platform.name})`,
      color: platform.color,
      fields: [
        { name: "🎬 Judul Video", value: videoTitle, inline: false },
        { name: "👤 Creator", value: author, inline: true },
        { name: "📦 Total Preset", value: `${presets.length}`, inline: true },
        { name: "🏷️ Platform", value: platform.tag, inline: true },
        { name: "🎁 Daftar Link Preset", value: formatPresetList(presets), inline: false },
        { name: "🎯 Video Target", value: inputUrl, inline: false },
      ],
      timestamp: new Date().toISOString(),
    });
  }
}
