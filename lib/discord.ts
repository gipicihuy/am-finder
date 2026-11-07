import { clientIp, isPrivateIp } from "./ip";

// Helper pengiriman embed / pesan ke Discord Webhook
// Non-blocking, aman dari loop error, dilengkapi antrean ringan per webhook dan retry HTTP 429.

export type DiscordChannel =
  | "tiktok"
  | "search"
  | "whatsapp"
  | "telegram"
  | "error"
  | "activity"
  | "security";

export type DiscordField = {
  name: string;
  value: string;
  inline?: boolean;
};

export type DiscordEmbed = {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: DiscordField[];
  footer?: { text: string; icon_url?: string };
  timestamp?: string; // ISO 8601
  author?: { name: string; url?: string; icon_url?: string };
};

export type DiscordPayload = {
  content?: string;
  username?: string;
  avatar_url?: string;
  embeds?: DiscordEmbed[];
  components?: unknown[];
};

// Batasan payload Discord API
const MAX_TITLE = 256;
const MAX_DESC = 4096;
const MAX_FIELD_NAME = 256;
const MAX_FIELD_VALUE = 1024;
const MAX_FIELDS = 25;
const MAX_FOOTER = 2048;
const MAX_AUTHOR = 256;
const MAX_CONTENT = 2000;
const MAX_TOTAL_EMBED = 6000;

// Rate limit aman per webhook: maksimal ~30 pesan per 60 detik
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 30;

type QueueItem = {
  url: string;
  channel: DiscordChannel;
  payload: DiscordPayload;
  attempt: number;
};

type WebhookState = {
  windowStart: number;
  count: number;
  queue: QueueItem[];
  draining: boolean;
};

type DiscordStore = {
  states: Map<string, WebhookState>;
  dedup: Map<string, number>;
};

function getStore(): DiscordStore {
  const g = globalThis as typeof globalThis & { __amDiscordStore?: DiscordStore };
  if (!g.__amDiscordStore) {
    g.__amDiscordStore = {
      states: new Map(),
      dedup: new Map(),
    };
  }
  return g.__amDiscordStore;
}

function truncate(str: string | undefined, max: number): string {
  if (!str) return "";
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function cleanEmbed(embed: DiscordEmbed): DiscordEmbed {
  const title = truncate(embed.title, MAX_TITLE);
  const description = truncate(embed.description, MAX_DESC);

  let fields: DiscordField[] | undefined;
  if (Array.isArray(embed.fields)) {
    fields = embed.fields.slice(0, MAX_FIELDS).map((f) => ({
      name: truncate(f.name || "-", MAX_FIELD_NAME),
      value: truncate(f.value || "-", MAX_FIELD_VALUE),
      inline: f.inline,
    }));
  }

  const footer = embed.footer
    ? {
        text: truncate(embed.footer.text, MAX_FOOTER),
        icon_url: embed.footer.icon_url,
      }
    : undefined;

  const author = embed.author
    ? {
        name: truncate(embed.author.name, MAX_AUTHOR),
        url: embed.author.url,
        icon_url: embed.author.icon_url,
      }
    : undefined;

  // Pastikan total karakter embed tidak melebihi 6000
  let totalChars = title.length + description.length;
  if (footer?.text) totalChars += footer.text.length;
  if (author?.name) totalChars += author.name.length;
  if (fields) {
    for (const f of fields) totalChars += f.name.length + f.value.length;
  }

  if (totalChars > MAX_TOTAL_EMBED && description) {
    const overflow = totalChars - MAX_TOTAL_EMBED;
    const newDescLen = Math.max(0, description.length - overflow - 5);
    return {
      ...embed,
      title,
      description: truncate(description.slice(0, newDescLen), MAX_DESC),
      fields,
      footer,
      author,
    };
  }

  return {
    ...embed,
    title: title || undefined,
    description: description || undefined,
    fields,
    footer,
    author,
  };
}

function getWebhookUrl(channel: DiscordChannel): string | null {
  if (channel === "tiktok") {
    const url =
      process.env.DISCORD_WEBHOOK_TIKTOK_YOUTUBE?.trim() ||
      process.env.DISCORD_WEBHOOK_VIDEO?.trim() ||
      process.env.DISCORD_WEBHOOK_TIKTOK?.trim();
    if (url && url.startsWith("https://discord.com/api/webhooks/")) return url;
  }
  const envKey = `DISCORD_WEBHOOK_${channel.toUpperCase()}`;
  const url = process.env[envKey]?.trim();
  if (!url || !url.startsWith("https://discord.com/api/webhooks/")) return null;
  return url;
}

async function executePost(
  url: string,
  channel: DiscordChannel,
  payload: DiscordPayload,
): Promise<{ ok: boolean; status: number; retryAfterMs?: number }> {
  try {
    const body: Record<string, unknown> = {
      ...payload,
      content: truncate(payload.content, MAX_CONTENT) || undefined,
      embeds: payload.embeds?.map(cleanEmbed),
      allowed_mentions: { parse: [] },
    };
    if (Array.isArray(payload.components) && payload.components.length > 0) {
      body.components = payload.components;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
    });

    if (res.status === 429) {
      let retryAfterMs = 1500;
      try {
        const json = (await res.json()) as { retry_after?: unknown };
        if (typeof json?.retry_after === "number") {
          retryAfterMs = Math.ceil(json.retry_after * 1000);
        }
      } catch {
        const h = res.headers.get("retry-after");
        if (h) retryAfterMs = Math.ceil(Number(h) * 1000) || 1500;
      }
      return { ok: false, status: 429, retryAfterMs };
    }

    if (!res.ok) {
      console.warn(`[discord] webhook ${channel} returned HTTP ${res.status}`);
      return { ok: false, status: res.status };
    }

    return { ok: true, status: res.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[discord] webhook ${channel} network error: ${msg}`);
    return { ok: false, status: 0 };
  }
}

async function drainQueue(url: string, state: WebhookState): Promise<void> {
  if (state.draining) return;
  state.draining = true;

  try {
    while (state.queue.length > 0) {
      const now = Date.now();
      if (now - state.windowStart > RATE_WINDOW_MS) {
        state.windowStart = now;
        state.count = 0;
      }

      if (state.count >= RATE_MAX_PER_WINDOW) {
        const waitMs = Math.max(500, RATE_WINDOW_MS - (now - state.windowStart));
        await new Promise((r) => setTimeout(r, Math.min(waitMs, 5000)));
        continue;
      }

      const item = state.queue.shift();
      if (!item) break;

      state.count += 1;
      const res = await executePost(item.url, item.channel, item.payload);

      if (res.status === 429 && item.attempt === 0) {
        // Retry max 1x setelah delay retryAfter
        item.attempt += 1;
        state.queue.unshift(item);
        const wait = Math.min(res.retryAfterMs || 1500, 5000);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  } finally {
    state.draining = false;
  }
}

/**
 * Kirim payload / embed ke webhook Discord tujuan.
 * Non-blocking (fire and forget), aman dari loop, menghormati rate-limit.
 */
export function sendDiscord(channel: DiscordChannel, payload: DiscordPayload): void {
  const url = getWebhookUrl(channel);
  if (!url) return; // Env kosong / tidak valid: lewati diam-diam tanpa error

  const store = getStore();
  let state = store.states.get(url);
  if (!state) {
    state = {
      windowStart: Date.now(),
      count: 0,
      queue: [],
      draining: false,
    };
    store.states.set(url, state);
  }

  // Jaga ukuran antrean agar tidak membengkak bila webhook down
  if (state.queue.length > 100) {
    state.queue.splice(0, 20); // buang 20 pesan terlama
  }

  state.queue.push({
    url,
    channel,
    payload,
    attempt: 0,
  });

  void drainQueue(url, state);
}

/** Shortcut untuk kirim 1 embed */
export function sendDiscordEmbed(
  channel: DiscordChannel,
  embed: DiscordEmbed,
  content?: string,
  components?: unknown[],
): void {
  sendDiscord(channel, {
    content,
    embeds: [embed],
    components,
  });
}

/**
 * Helper deduplikasi in-memory dengan TTL.
 * Mengembalikan `true` bila item SUDAH ada (duplikat), atau `false` bila baru dicatat.
 */
export function isDeduplicated(key: string, ttlMs: number): boolean {
  const store = getStore();
  const now = Date.now();

  // Prune berkala
  if (store.dedup.size > 2000) {
    for (const [k, exp] of store.dedup) {
      if (now > exp) store.dedup.delete(k);
    }
  }

  const exp = store.dedup.get(key);
  if (exp && now < exp) {
    return true; // Duplikat
  }

  store.dedup.set(key, now + ttlMs);
  return false;
}

function formatWib(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} WIB`;
}

/**
 * Laporkan error server yang tertangkap di catch block route / scraper / ffmpeg.
 * Throttle: maksimal 1 pesan identik per 60 detik.
 */
export function reportServerError(route: string, error: unknown, request?: Request): void {
  const msg = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error && error.stack ? error.stack : "";
  const dedupKey = `err:${route}:${msg}`;
  if (isDeduplicated(dedupKey, 60_000)) return;

  const fields: DiscordField[] = [
    { name: "📍 Route", value: `\`${route}\``, inline: true },
    { name: "🕐 Waktu", value: formatWib(), inline: true },
  ];

  if (request) {
    const ip = clientIp(request.headers);
    const ua = (request.headers.get("user-agent") || "-").slice(0, 150);
    fields.push({ name: "🌐 IP Klien", value: `\`${ip}\``, inline: true });
    fields.push({ name: "🖥️ User-Agent", value: `\`${ua}\``, inline: false });
  }

  if (stack) {
    const cleanStack = stack
      .split("\n")
      .slice(0, 8)
      .join("\n")
      .slice(0, 800);
    fields.push({
      name: "📋 Stack Trace",
      value: `\`\`\`bash\n${cleanStack}\n\`\`\``,
      inline: false,
    });
  }

  sendDiscordEmbed("error", {
    title: `⚠️ Server Error: ${route}`,
    description: `**Pesan Error:**\n\`${msg.slice(0, 450)}\``,
    color: 0xe67e22, // Orange
    fields,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Laporkan aktivitas bot ringan (honeypot kena, handshake gagal, crawler good bot, scraper UA).
 * Throttle per IP.
 */
export function reportBotActivity(
  ip: string,
  event: string,
  details: { path?: string; ua?: string; score?: number; reason?: string } = {},
): void {
  if (!ip || isPrivateIp(ip)) return;
  const dedupKey = `act:${ip}:${event}`;
  if (isDeduplicated(dedupKey, 60_000)) return;

  const fields: DiscordField[] = [
    { name: "🌐 IP", value: `\`${ip}\``, inline: true },
    { name: "⚡ Kejadian", value: event, inline: true },
    { name: "🕐 Waktu", value: formatWib(), inline: true },
  ];

  if (details.path) {
    fields.push({ name: "📄 Path", value: `\`${details.path}\``, inline: true });
  }
  if (typeof details.score === "number") {
    fields.push({ name: "🧠 Skor", value: `${details.score}`, inline: true });
  }
  if (details.reason) {
    fields.push({ name: "🧩 Keterangan", value: details.reason, inline: false });
  }
  if (details.ua) {
    fields.push({
      name: "🖥️ User Agent",
      value: `\`${details.ua.slice(0, 200)}\``,
      inline: false,
    });
  }

  sendDiscordEmbed("activity", {
    title: `🤖 Aktivitas Bot / Crawler: ${event}`,
    color: 0xf1c40f, // Amber
    fields,
    timestamp: new Date().toISOString(),
  });
}
