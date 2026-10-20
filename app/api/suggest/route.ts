import { getSuggestions } from "@/lib/suggest";
import { limitByIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") || "").trim();
  if (query.length < 2) {
    return Response.json({ ok: true, items: [] });
  }

  // Kalau kena limit, balikin daftar kosong saja — jangan ganggu user yang
  // sedang mengetik dengan pesan error.
  const limit = limitByIp(request, "suggest");
  if (!limit.ok) {
    return Response.json({ ok: true, items: [] });
  }

  const items = await getSuggestions(query, 8);
  return Response.json(
    { ok: true, items },
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } },
  );
}
