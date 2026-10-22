import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { clientIp } from "./ip";

const CHALLENGE_TTL_MS = 90_000;
const TICKET_TTL_MS = 120_000;
const NONCE_TTL_MS = 5 * 60_000;
const FLAG_TTL_MS = 10 * 60_000;
const MAX_CLOCK_SKEW_MS = 45_000;
const HMAC_ROUNDS = 4096;
const MAX_STORE = 20_000;
const MAX_ALERTS = 4_000;
const FLAG_MIN_SCORE = 8;

const GOOD_BOT =
  /googlebot|bingbot|duckduckbot|slurp|yandexbot|baiduspider|facebookexternalhit|twitterbot|linkedinbot|applebot|petalbot|semrushbot|ahrefsbot/i;
const BAD_UA =
  /headless|puppeteer|playwright|phantom|selenium|webdriver|python-requests|python-urllib|aiohttp|httpx|curl\/|wget\/|go-http-client|node-fetch|undici|axios\/|scrapy|libwww-perl|java\/|okhttp|postmanruntime/i;
const BAD_HEADER = /cdp|chromedriver|devtools|automation/i;

type Challenge = {
  salt: string;
  ts: number;
  rounds: number;
  iph: string;
  uah: string;
  used: boolean;
};

export type Ticket = {
  sid: string;
  did: string;
  iat: number;
  exp: number;
  n: string;
  iph: string;
  uah: string;
  sc: number;
};

type Flag = { at: number; score: number; reasons: string[] };
type Store = {
  challenges: Map<string, Challenge>;
  nonces: Map<string, number>;
  flags: Map<string, Flag>;
  alerts: Map<string, number>;
  lastPrune: number;
};

export type GuardResult =
  | { ok: true; ticket: Ticket; score: number; poison: boolean }
  | { ok: false; status: number; error: string };

function loadSecret(): Buffer {
  const fromEnv = process.env.AM_SECURITY_SECRET?.trim();
  if (fromEnv) {
    return fromEnv.length === 64
      ? Buffer.from(fromEnv, "hex")
      : createHash("sha256").update(fromEnv).digest();
  }

  const file = path.join(process.cwd(), "data", "anti-scrape.secret");
  try {
    const saved = fs.readFileSync(file, "utf8").trim();
    if (/^[a-f0-9]{64}$/i.test(saved)) return Buffer.from(saved, "hex");
  } catch {
  }

  const secret = randomBytes(32);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, secret.toString("hex"), { mode: 0o600 });
  } catch {
  }
  return secret;
}

const SECRET = loadSecret();
const AES_KEY = createHash("sha256").update(SECRET).update(":aes").digest();
const MAC_KEY = createHash("sha256").update(SECRET).update(":mac").digest();

function store(): Store {
  const g = globalThis as typeof globalThis & { __amSecurityStore?: Store };
  if (!g.__amSecurityStore) {
    g.__amSecurityStore = {
      challenges: new Map(),
      nonces: new Map(),
      flags: new Map(),
      alerts: new Map(),
      lastPrune: 0,
    };
  }
  return g.__amSecurityStore;
}

function prune(now: number, s = store()): void {
  s.lastPrune = now;
  for (const [key, value] of s.challenges) {
    if (value.used || now - value.ts > CHALLENGE_TTL_MS) s.challenges.delete(key);
  }
  for (const [key, until] of s.nonces) {
    if (until <= now) s.nonces.delete(key);
  }
  for (const [key, value] of s.flags) {
    if (now - value.at > FLAG_TTL_MS) s.flags.delete(key);
  }
  for (const [key, until] of s.alerts) {
    if (until <= now) s.alerts.delete(key);
  }

  if (s.challenges.size > MAX_STORE) s.challenges.clear();
  if (s.nonces.size > MAX_STORE) s.nonces.clear();
  if (s.flags.size > MAX_STORE) s.flags.clear();
  if (s.alerts.size > MAX_ALERTS) s.alerts.clear();
}

function hash(value: string): string {
  return createHmac("sha256", SECRET).update(value).digest("base64url").slice(0, 22);
}

function ipHash(headers: Headers): string {
  return hash(`ip:${clientIp(headers)}`);
}

function uaHash(headers: Headers): string {
  return hash(`ua:${(headers.get("user-agent") || "-").slice(0, 300)}`);
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

function hmacChain(salt: string, message: string, rounds: number): string {
  let value: Buffer = Buffer.from(message, "utf8");
  for (let i = 0; i < rounds; i += 1) {
    value = createHmac("sha256", Buffer.from(salt, "hex")).update(value).digest();
  }
  return value.toString("hex");
}

function b64(value: Buffer): string {
  return value.toString("base64url");
}

function fromB64(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export function issueChallenge(headers: Headers): {
  cid: string;
  salt: string;
  ts: number;
  rounds: number;
} {
  const s = store();
  const now = Date.now();
  if (s.challenges.size > MAX_STORE || now - s.lastPrune > 60_000) prune(now, s);

  const cid = randomBytes(12).toString("hex");
  const salt = randomBytes(16).toString("hex");
  const challenge: Challenge = {
    salt,
    ts: now,
    rounds: HMAC_ROUNDS,
    iph: ipHash(headers),
    uah: uaHash(headers),
    used: false,
  };
  s.challenges.set(cid, challenge);
  return { cid, salt, ts: now, rounds: HMAC_ROUNDS };
}

export function verifyHandshake(
  input: { cid?: unknown; did?: unknown; ts?: unknown; proof?: unknown; score?: unknown },
  headers: Headers,
): { ok: true; token: string; exp: number } | { ok: false } {
  const cid = typeof input.cid === "string" ? input.cid : "";
  const did = typeof input.did === "string" ? input.did.trim() : "";
  const ts = typeof input.ts === "number" ? input.ts : 0;
  const proof = typeof input.proof === "string" ? input.proof.toLowerCase() : "";
  const clientScore = typeof input.score === "number" ? input.score : 0;

  if (!/^[a-f0-9]{24}$/i.test(cid) || did.length < 8 || did.length > 160) return { ok: false };
  if (!/^[a-f0-9]{64}$/i.test(proof)) return { ok: false };

  const s = store();
  const challenge = s.challenges.get(cid);
  if (!challenge || challenge.used) return { ok: false };
  if (Math.abs(ts - challenge.ts) > 5_000) return { ok: false };
  if (challenge.iph !== ipHash(headers) || challenge.uah !== uaHash(headers)) return { ok: false };

  const expected = hmacChain(challenge.salt, `${cid}|${did}|${ts}`, challenge.rounds);
  if (!safeEqual(Buffer.from(proof, "hex"), Buffer.from(expected, "hex"))) return { ok: false };

  challenge.used = true;
  s.challenges.delete(cid);

  const ticket = issueTicket({
    did,
    iph: challenge.iph,
    uah: challenge.uah,
    sc: Math.max(0, Math.min(100, Math.round(clientScore))),
  });
  return ticket;
}

function issueTicket(input: { did: string; iph: string; uah: string; sc: number }): {
  ok: true;
  token: string;
  exp: number;
} {
  const now = Date.now();
  const payload: Ticket = {
    sid: randomBytes(9).toString("hex"),
    did: input.did,
    iat: now,
    exp: now + TICKET_TTL_MS,
    n: randomBytes(12).toString("hex"),
    iph: input.iph,
    uah: input.uah,
    sc: input.sc,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", AES_KEY, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const body = b64(Buffer.concat([iv, tag, ciphertext]));
  const signature = b64(createHmac("sha256", MAC_KEY).update(body).digest());
  return { ok: true, token: `v1.${body}.${signature}`, exp: payload.exp };
}

function verifyTicket(token: string, headers: Headers): { ok: true; ticket: Ticket } | { ok: false } {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return { ok: false };

  const body = parts[1];
  const signature = parts[2];
  const expected = b64(createHmac("sha256", MAC_KEY).update(body).digest());
  if (!safeEqual(fromB64(signature), fromB64(expected))) return { ok: false };

  const raw = fromB64(body);
  if (raw.length < 29) return { ok: false };

  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);

  let payload: Ticket;
  try {
    const decipher = createDecipheriv("aes-256-gcm", AES_KEY, iv);
    decipher.setAuthTag(tag);
    payload = JSON.parse(
      Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"),
    ) as Ticket;
  } catch {
    return { ok: false };
  }

  const now = Date.now();
  if (
    !payload ||
    typeof payload.exp !== "number" ||
    typeof payload.iat !== "number" ||
    typeof payload.n !== "string" ||
    typeof payload.did !== "string" ||
    payload.exp <= now ||
    payload.iat > now + MAX_CLOCK_SKEW_MS
  ) {
    return { ok: false };
  }
  if (payload.iph !== ipHash(headers) || payload.uah !== uaHash(headers)) return { ok: false };

  const s = store();
  if (s.nonces.has(payload.n)) return { ok: false };
  s.nonces.set(payload.n, payload.exp + NONCE_TTL_MS);
  return { ok: true, ticket: payload };
}

export function scoreHeaders(headers: Headers): number {
  const ua = headers.get("user-agent") || "";
  if (GOOD_BOT.test(ua)) return 0;

  let score = 0;
  if (!ua) score += 3;
  if (BAD_UA.test(ua)) score += 10;
  if (BAD_HEADER.test(headers.get("x-requested-with") || "")) score += 5;

  const accept = headers.get("accept") || "";
  if (accept && !/text\/event-stream|text\/html|application\/json|\*\/\*/i.test(accept)) score += 2;
  if (!headers.get("accept-language")) score += 1;
  if (!headers.get("sec-fetch-site")) score += 1;
  if (/Chrome\//i.test(ua) && !headers.get("sec-ch-ua")) score += 2;

  return Math.min(score, 100);
}

function flagged(headers: Headers, did: string): boolean {
  const s = store();
  const now = Date.now();
  const keys = [`ip:${clientIp(headers)}`, `did:${did}`];
  return keys.some((key) => {
    const hit = s.flags.get(key);
    if (!hit) return false;
    if (now - hit.at > FLAG_TTL_MS) {
      s.flags.delete(key);
      return false;
    }
    return hit.score >= FLAG_MIN_SCORE;
  });
}

export function markSuspicious(
  headers: Headers,
  input: { did?: unknown; score?: unknown; reasons?: unknown; path?: unknown },
): number {
  const did = typeof input.did === "string" ? input.did.slice(0, 160) : "";
  const score = Math.max(
    0,
    Math.min(100, typeof input.score === "number" ? Math.round(input.score) : 0),
  );
  const reasons = Array.isArray(input.reasons)
    ? input.reasons
        .filter((reason): reason is string => typeof reason === "string")
        .slice(0, 12)
        .map((reason) => reason.slice(0, 120))
    : [];
  const path = typeof input.path === "string" ? input.path.slice(0, 200) : "-";

  const s = store();
  const now = Date.now();
  if (score >= FLAG_MIN_SCORE) {
    const flag = { at: now, score, reasons };
    s.flags.set(`ip:${clientIp(headers)}`, flag);
    if (did) s.flags.set(`did:${did}`, flag);
    if (s.flags.size > MAX_STORE) prune(now, s);
    void sendSecurityAlert(headers, { score, reasons, did, path });
  }
  return score;
}

function escapeMarkdown(value: string): string {
  return value.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

export async function sendSecurityAlert(
  headers: Headers,
  input: { score: number; reasons: string[]; did?: string; path?: string },
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const key = `alert:${clientIp(headers)}`;
  const s = store();
  const now = Date.now();
  if ((s.alerts.get(key) || 0) > now) return;
  s.alerts.set(key, now + 30_000);

  const ua = (headers.get("user-agent") || "-").slice(0, 180);
  const text = [
    "🚨 *AM Finder Security*",
    "",
    `🧠 *Score* › ${input.score}`,
    `🌐 *IP* › \`${escapeMarkdown(clientIp(headers))}\``,
    `🕵️ *Device* › \`${escapeMarkdown(input.did || "-")}\``,
    `📄 *Path* › \`${escapeMarkdown(input.path || "-")}\``,
    `🧩 *Reason* › ${escapeMarkdown(input.reasons.join(", ") || "-")}`,
    `🖥 *UA* › ${escapeMarkdown(ua)}`,
  ].join("\n");

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(4_000),
    });
  } catch {
  }
}

export function guardRequest(request: Request): GuardResult {
  const url = new URL(request.url);
  const token =
    url.searchParams.get("t") ||
    request.headers.get("x-am-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";

  if (!token) return { ok: false, status: 403, error: "security token required" };

  const checked = verifyTicket(token, request.headers);
  if (!checked.ok) return { ok: false, status: 403, error: "security token invalid or expired" };

  const serverScore = scoreHeaders(request.headers);
  const score = Math.max(serverScore, checked.ticket.sc || 0);
  const isFlagged = flagged(request.headers, checked.ticket.did);
  const poison = isFlagged || score >= FLAG_MIN_SCORE;
  if (poison) {
    console.warn("[security] poison", {
      score,
      flagged: isFlagged,
      path: url.pathname,
      headerScore: serverScore,
      clientScore: checked.ticket.sc || 0,
    });
    void sendSecurityAlert(request.headers, {
      score,
      reasons: [isFlagged ? "flagged device/ip" : "risk threshold"],
      did: checked.ticket.did,
      path: url.pathname,
    });
  }

  return { ok: true, ticket: checked.ticket, score, poison };
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function poisonResponse(kind: "find" | "search"): Response {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sse(event, data)));
        } catch {
          closed = true;
        }
      };

      void (async () => {
        const logs =
          kind === "find"
            ? [
                "membuka halaman video...",
                "membaca deskripsi dan tautan...",
                "memeriksa tautan bio...",
                "memindai komentar...",
                "menyusun hasil...",
              ]
            : [
                "menyiapkan pencarian...",
                "mengambil kandidat video...",
                "memfilter hasil...",
                "menyusun rekomendasi...",
              ];

        for (const line of logs) {
          if (closed) return;
          push("log", line);
          await sleep(650 + Math.floor(Math.random() * 300));
        }
        if (closed) return;

        const rickroll = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
        if (kind === "find") {
          push("result", {
            ok: true,
            found: true,
            videoUrl: rickroll,
            videoId: "dQw4w9WgXcQ",
            author: "security",
            checked: { description: true, bio: true, comments: 0 },
            presetLinks: [
              {
                type: "5mb",
                url: rickroll,
                title: "AM PRESET VIP - FULL VERSION",
                size: "4.8 MB",
                source: "server",
              },
            ],
          });
        } else {
          const item = {
            url: rickroll,
            handle: "@security",
            kind: "video",
            snippet: "AM PRESET VIP - FULL VERSION",
            thumb: "",
          };
          push("candidates", { query: "", fromCache: false, items: [item] });
          push("result", {
            ok: true,
            query: "",
            fromCache: false,
            candidates: 1,
            videos: [{ ...item, found: true, presetLinks: [] }],
            foundCount: 1,
            elapsedMs: 1,
          });
        }

        try {
          controller.close();
        } catch {
        }
      })();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
