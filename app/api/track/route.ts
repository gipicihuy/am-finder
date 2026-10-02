import { normalizeBattery, sendLog } from "../../../lib/track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

  return Response.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
