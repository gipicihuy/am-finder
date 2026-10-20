import { cleanSuggestion, getSuggestions } from "@/lib/suggest";
import { remoteSuggest } from "@/lib/google-suggest";
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

  const LIMIT = 8;
  const local = await getSuggestions(query, LIMIT);
  let items = local;

  // Index lokal tetap prioritas. Kalau stoknya masih sedikit, lengkapi dari
  // Google supaya saran tidak terasa kering. Query pendek tidak dikirim keluar.
  if (local.length < LIMIT - 1) {
    const remote = await remoteSuggest(query);
    const merged = [...local];
    for (const raw of remote) {
      const text = cleanSuggestion(raw);
      if (!text || merged.includes(text)) continue;
      merged.push(text);
      if (merged.length >= LIMIT) break;
    }
    items = merged;
  }

  return Response.json(
    { ok: true, items },
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } },
  );
}
