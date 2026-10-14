import { AUTH_COOKIE, snapshot, verifyAuth } from "../../../../lib/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE}=([^;]+)`));
  if (!verifyAuth(match?.[1] || null)) {
    return Response.json(
      { ok: false, error: "tidak berwenang" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    { ok: true, ...snapshot() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
