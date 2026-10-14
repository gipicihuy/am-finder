import { NextResponse } from "next/server";
import { AUTH_COOKIE, checkPassword, hasPassword, issueAuth } from "../../../../lib/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sekali jalan dari link privat, sisanya cookie yang pegang. Password mentah
// nggak pernah disimpan di mana pun — cookie cuma berisi tanda tangan HMAC.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const pw = params.get("pw");

  if (!hasPassword() || !checkPassword(pw)) {
    return new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const res = NextResponse.redirect(new URL("/monitor", request.url), { status: 302 });
  res.cookies.set(AUTH_COOKIE, issueAuth(), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
