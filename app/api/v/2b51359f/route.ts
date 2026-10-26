import { randomBytes } from "node:crypto";
import { issuePoisonTicket } from "../../../../lib/anti-scrape";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// HONEYPOT TRAP ROUTE:
// Rute lama /api/v/2b51359f yang sengaja dibiarkan hidup sebagai perangkap
// bagi skrip scraper (Axios/Node/Python). Pengguna browser asli sudah beralih
// ke handshake route yang baru. Setiap request yang memanggil rute ini akan
// otomatis ditandai (flagged), diracuni (score: 99), dan disuguhkan Rickroll
// pada /api/find tanpa memakan CPU server sama sekali.

function noStore(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const proofMode = Boolean(body.proof);

  // Tahap 1: Scraper meminta challenge
  if (!proofMode) {
    const dummyCid = "2b51" + randomBytes(10).toString("hex");
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
  const poisonTicket = issuePoisonTicket(request.headers, did);

  return noStore({
    ok: true,
    token: poisonTicket.token,
    exp: poisonTicket.exp,
  });
}
