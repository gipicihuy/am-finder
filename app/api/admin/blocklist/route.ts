import { limitHeaders, tooManyRequests } from "../../../../lib/rate-limit";
import { verifyAdminToken } from "../../../../lib/api-keys";
import { listBlocked } from "../../../../lib/blocklist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized(): Response {
  return Response.json(
    { ok: false, error: "unauthorized" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  const limit = limitHeaders(request.headers, "admin");
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);
  if (!verifyAdminToken(request.headers)) return unauthorized();

  const entries = listBlocked();
  return Response.json(
    { ok: true, count: entries.length, blocklist: entries },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
