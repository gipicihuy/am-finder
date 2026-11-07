import { limitHeaders, tooManyRequests } from "../../../../lib/rate-limit";
import { verifyAdminToken } from "../../../../lib/api-keys";
import { unblockIp } from "../../../../lib/blocklist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized(): Response {
  return Response.json(
    { ok: false, error: "unauthorized" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const limit = limitHeaders(request.headers, "admin");
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);
  if (!verifyAdminToken(request.headers)) return unauthorized();

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      { ok: false, error: "body JSON tidak valid" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const data = body as Record<string, unknown>;
  const ip = typeof data.ip === "string" ? data.ip.trim() : "";

  if (!ip) {
    return Response.json(
      { ok: false, error: "parameter 'ip' wajib diisi" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const res = unblockIp(ip);
  if (!res.ok) {
    return Response.json(
      { ok: false, error: res.error },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    { ok: true, message: `IP ${ip} berhasil dilepas dari blokir` },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
