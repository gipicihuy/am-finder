import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { appendRawWebhook } from "@/lib/donatur";

export const dynamic = "force-dynamic";

// Batas keras: payload webhook Sociabuzz seharusnya kecil.
const MAX_BODY_BYTES = 64 * 1024;
const WINDOW_MS = 60_000;
const MAX_HITS_PER_WINDOW = 20;

const hits = new Map<string, { count: number; reset: number }>();

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function isAllowed(token: string) {
  const expected = process.env.DONATUR_WEBHOOK_TOKEN;
  if (!expected) return false;
  if (!token) return false;
  return safeEqual(token, expected);
}

function isRateLimited(key: string) {
  const now = Date.now();
  const bucket = hits.get(key);
  if (!bucket || now > bucket.reset) {
    hits.set(key, { count: 1, reset: now + WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > MAX_HITS_PER_WINDOW;
}

function clientKey(req: NextRequest) {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Endpoint penerima webhook Sociabuzz.
 *
 * Fase sekarang: payload MENTAH dicatat apa adanya ke data/webhook-raw.jsonl.
 * Pemetaan field ke nama/nominal/pesan BelUM dilakukan karena format asli
 * Sociabuzz belum pernah dilihat. Setelah ada payload nyata, mapping-nya
 * dipasang di sini.
 */
export async function POST(req: NextRequest) {
  const ip = clientKey(req);

  if (isRateLimited(ip)) {
    return NextResponse.json({ ok: false, error: "too_many_requests" }, { status: 429 });
  }

  const token =
    req.nextUrl.searchParams.get("t") || req.headers.get("x-donatur-token") || "";
  if (!isAllowed(token)) {
    // Sengaja pesan generik supaya tidak membocorkan detail validasi.
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }

  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }

  let parsed: unknown = null;
  let parseError: string | null = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch (error) {
    parseError = error instanceof Error ? error.message : "invalid_json";
  }

  appendRawWebhook({
    ip,
    method: "POST",
    contentType: req.headers.get("content-type"),
    userAgent: req.headers.get("user-agent"),
    query: Object.fromEntries(req.nextUrl.searchParams.entries()),
    bodyLength: Buffer.byteLength(raw, "utf8"),
    raw,
    parsed,
    parseError,
  });

  return NextResponse.json(
    { ok: true, received: true, mapped: false, note: "payload logged, belum dipetakan" },
    { status: 200 }
  );
}

export function GET() {
  return NextResponse.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
}
