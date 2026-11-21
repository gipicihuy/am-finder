import { randomBytes } from "node:crypto";
import { issuePoisonTicket } from "../../../../lib/anti-scrape";
import { clientIp } from "../../../../lib/ip";
import { isBlocked, recordBlockedHit } from "../../../../lib/blocklist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// HONEYPOT TRAP ROUTE:
// Rute lama /api/v/7f91a2e4 yang dibocorkan dan dipakai oleh scraper pihak ketiga.
// Setiap pemanggilan ke rute ini akan disajikan mock challenge dan tiket racun (score 99),
// mem-flag IP & DID pelaku, dan menyuguhkan video Rickroll di /api/find & /api/search.

function noStore(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  if (isBlocked(ip)) {
    recordBlockedHit(ip);
    return Response.json(
      { ok: false, error: "forbidden" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const proofMode = Boolean(body.proof);

  // Tahap 1: Scraper meminta challenge
  if (!proofMode) {
    const dummyCid = "7f91" + randomBytes(10).toString("hex");
    const dummySalt = randomBytes(16).toString("hex");
    return noStore({
      ok: true,
      cid: dummyCid,
      salt: dummySalt,
      ts: Date.now(),
      rounds: 4096,
    });
  }

  // Tahap 2: Scraper menukar PoW proof
  // Langsung terbitkan tiket racun (score 99) dan pasang flag IP/DID selama 24 jam.
  const did = typeof body.did === "string" ? body.did : "";
  const poisonTicket = issuePoisonTicket(request.headers, did, "/api/v/7f91a2e4");

  return noStore({
    ok: true,
    token: poisonTicket.token,
    exp: poisonTicket.exp,
  });
}
