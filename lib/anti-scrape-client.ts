"use client";

const DEVICE_KEY = "amfinder:device";

type Risk = { score: number; reasons: string[] };

let memoryDevice = "";
let risk: Risk = { score: 0, reasons: [] };

export function setClientRisk(score: number, reasons: string[]): void {
  risk = {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons: reasons.slice(0, 12),
  };
}

export function getDeviceId(): string {
  if (memoryDevice) return memoryDevice;

  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved && saved.length >= 8) {
      memoryDevice = saved;
      return saved;
    }
  } catch {
  }

  const id =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");

  memoryDevice = id;
  try {
    localStorage.setItem(DEVICE_KEY, id);
  } catch {
  }
  return id;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacChain(salt: string, message: string, rounds: number): Promise<string> {
  if (!crypto?.subtle) throw new Error("WebCrypto tidak tersedia");
  const key = await crypto.subtle.importKey(
    "raw",
    hexToBytes(salt) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  let value = new TextEncoder().encode(message);
  // Server yang menentukan biaya (rounds bisa diadaptasi terhadap IP yang
  // haus). Setelan client tinggal mengikuti, bukan membatasi di bawah server.
  const total = Math.max(1, Math.min(100_000, Math.floor(rounds)));
  for (let i = 0; i < total; i += 1) {
    value = new Uint8Array(await crypto.subtle.sign("HMAC", key, value as BufferSource));
  }
  return bytesToHex(value);
}

async function postJson<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/v/2b51359f", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    credentials: "same-origin",
  });
  const data = (await response.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!response.ok || data.ok === false) {
    const error = new Error(data.error || `handshake HTTP ${response.status}`) as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }
  return data;
}

function quickRisk(): Risk {
  const reasons: string[] = [];
  const ua = navigator.userAgent || "";
  const nav = navigator as Navigator & { webdriver?: boolean };
  const desktopChrome = /Chrome\//i.test(ua) && !/Mobile|Android|iPhone|iPad/i.test(ua);

  if (nav.webdriver === true) reasons.push("navigator.webdriver");
  if (/HeadlessChrome|Headless/i.test(ua)) reasons.push("headless user-agent");
  if (desktopChrome && !("chrome" in window)) reasons.push("chrome object missing");
  if (desktopChrome && navigator.plugins.length === 0) reasons.push("empty plugins");

  let score = 0;
  for (const reason of reasons) {
    if (reason === "navigator.webdriver" || reason === "headless user-agent") score += 10;
    else score += 2;
  }
  return { score: Math.min(score, 100), reasons };
}

async function handshakeOnce(): Promise<string> {
  const did = getDeviceId();
  const challenge = await postJson<{
    cid: string;
    salt: string;
    ts: number;
    rounds: number;
  }>({ did });

  const proof = await hmacChain(
    challenge.salt,
    `${challenge.cid}|${did}|${challenge.ts}`,
    challenge.rounds,
  );

  const ticket = await postJson<{ token: string; exp: number }>({
    cid: challenge.cid,
    did,
    ts: challenge.ts,
    proof,
    score: risk.score,
    reasons: risk.reasons,
  });

  return ticket.token;
}

export async function getSecurityToken(): Promise<string> {
  const quick = quickRisk();
  if (quick.score > risk.score) setClientRisk(quick.score, quick.reasons);

  try {
    return await handshakeOnce();
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (status !== 403 && status !== 429 && status !== undefined && status < 500) throw error;
    await new Promise((resolve) => setTimeout(resolve, 700));
    return handshakeOnce();
  }
}

export function withSecurityToken(url: string, token: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}t=${encodeURIComponent(token)}`;
}
