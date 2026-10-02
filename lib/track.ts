export type Battery = { level?: number; charging?: boolean };

type Geo = { city: string; region: string; country: string; isp: string };

const GEO_MISS: Geo = { city: "-", region: "-", country: "-", isp: "-" };
const geoCache = new Map<string, Geo>();
const TIMEZONE = "Asia/Jakarta";

function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return (
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    headers.get("true-client-ip") ||
    "-"
  );
}

function isPrivateIp(ip: string): boolean {
  return (
    ip === "::1" ||
    ip === "-" ||
    ip === "unknown" ||
    /^(::ffff:)?(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)
  );
}

async function geo(ip: string): Promise<Geo> {
  if (isPrivateIp(ip)) return GEO_MISS;
  const hit = geoCache.get(ip);
  if (hit) return hit;
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,regionName,country,isp`,
      { signal: AbortSignal.timeout(3000) }
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

function getBrowser(ua: string): string {
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

function getDevice(ua: string): string {
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
  return value.replace(/[_*\[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

function escMdCode(value: string): string {
  return value.replace(/[`\\]/g, "\\$&");
}

function formatTime(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIMEZONE,
  }).formatToParts(date);
  const get = (t: string) => parts.find(p => p.type === t)?.value || "";
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} WIB`;
}

function batteryText(battery?: Battery): string {
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

function visitorBlock(ip: string, g: Geo, ua: string, battery?: Battery): string {
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

export async function sendLog(
  kind: "visit" | "search",
  headers: Headers,
  extra: { path?: string; link?: string; battery?: Battery } = {}
): Promise<void> {
  const ip = clientIp(headers);
  const ua = (headers.get("user-agent") || "-").slice(0, 200);
  const g = await geo(ip);

  console.log(
    `[track] ${kind} ip=${ip} city=${g.city} path=${extra.path || "-"} ` +
      `link=${extra.link || "-"} battery=${batteryText(extra.battery)}`
  );

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const head =
    kind === "visit"
      ? `🟢 *Visitor Baru*\n\n🖥 *Halaman* › \`${escMdCode(extra.path || "/")}\``
      : `🔎 *Pencarian Baru*\n\n🔗 *Link*    › \`${escMdCode(extra.link || "-")}\``;
  const text = `${head}\n\n${visitorBlock(ip, g, ua, extra.battery)}`;

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
