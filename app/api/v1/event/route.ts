import { normalizeBattery, sendLog } from "../../../../lib/track";
import { recordVisit } from "../../../../lib/monitor";
import { limitByIp, tooManyRequests } from "../../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limit = limitByIp(request, "track");
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const data = (body || {}) as { path?: unknown; battery?: unknown };
  const path = typeof data.path === "string" ? data.path.slice(0, 200) : "/";
  const battery = normalizeBattery(data.battery);

  void sendLog("visit", request.headers, { path, battery }).catch(() => {});

  recordVisit(request.headers);

  return Response.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
