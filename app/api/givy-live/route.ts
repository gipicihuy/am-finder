import { snapshot } from "../../../lib/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tanpa sandi: halaman /monitor-givy memang sengaja disembunyikan lewat
// namanya saja, jadi endpoint ini juga ikut pakai nama yang tidak ketebak.
export async function GET() {
  return Response.json(
    { ok: true, ...snapshot() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
