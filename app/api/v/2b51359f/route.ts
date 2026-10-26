import { issueChallenge, verifyHandshake } from "../../../../lib/anti-scrape";
import { limitByIp, tooManyRequests } from "../../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Host yang boleh mengirim handshake. Browser selalu menyertakan Origin pada
// POST fetch; skrip server biasanya tidak. Origin nyasar langsung 403, Origin
// tidak ada tetap dilayani tapi tiketnya diracuni (lihat verifyHandshake).
const ALLOWED_ORIGINS = [
  "https://amfinder.web.id",
  "https://www.amfinder.web.id",
  "https://amfinder.cc.cd",
  "http://127.0.0.1:3000",
  "http://localhost:3000",
];

function noStore(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function sameSiteOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    if (ALLOWED_ORIGINS.includes(origin)) return true;
    try {
      return new URL(origin).host === new URL(request.url).host;
    } catch {
      return false;
    }
  }
  // Browser fetch POST tanpa Origin itu tidak wajar; pelampungnya adalah
  // sec-fetch-site dari proxy/extension.
  return request.headers.get("sec-fetch-site") === "same-origin";
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const proofMode = Boolean(body.proof);

  // Dua ambang berbeda: minta challenge murah, tukar bukti lebih dikunci
  // karena tiap tiket valid dipakai tepat satu pencarian (nonce sekali pakai).
  const limit = limitByIp(request, proofMode ? "token" : "handshake");
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

  const originOk = sameSiteOrigin(request);

  if (request.headers.get("origin") && !originOk) {
    return noStore({ ok: false, error: "origin tidak dikenal" }, 403);
  }

  if (!proofMode) {
    return noStore({ ok: true, ...issueChallenge(request.headers, originOk) });
  }

  const verified = verifyHandshake(body, request.headers, originOk);
  if (!verified.ok) {
    return noStore({ ok: false, error: "handshake gagal" }, 403);
  }

  return noStore({ ok: true, token: verified.token, exp: verified.exp });
}
