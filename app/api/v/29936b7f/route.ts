import { markSuspicious, scoreHeaders } from "../../../../lib/anti-scrape";
import { limitByIp, tooManyRequests } from "../../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limit = limitByIp(request, "security");
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

  const length = Number(request.headers.get("content-length") || "0");
  if (length > 16_384) {
    return Response.json({ ok: false }, { status: 413 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const headerScore = scoreHeaders(request.headers);
  const bodyScore = typeof body.score === "number" ? body.score : 0;
  const reasons = Array.isArray(body.reasons) ? body.reasons : [];
  if (headerScore > 0) reasons.push("header fingerprint");

  const score = markSuspicious(request.headers, {
    ...body,
    score: Math.max(headerScore, bodyScore),
    reasons,
  });

  return Response.json(
    { ok: true, score },
    { headers: { "Cache-Control": "no-store" } },
  );
}
