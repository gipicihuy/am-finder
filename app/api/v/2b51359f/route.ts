import { issueChallenge, verifyHandshake } from "../../../../lib/anti-scrape";
import { limitByIp, tooManyRequests } from "../../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const limit = limitByIp(request, "handshake");
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (!body.proof) {
    return noStore({ ok: true, ...issueChallenge(request.headers) });
  }

  const verified = verifyHandshake(body, request.headers);
  if (!verified.ok) {
    return noStore({ ok: false, error: "handshake gagal" }, 403);
  }

  return noStore({ ok: true, token: verified.token, exp: verified.exp });
}
