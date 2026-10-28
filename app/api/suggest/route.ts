import { cleanSuggestion, getSuggestions } from "@/lib/suggest";
import { remoteSuggest } from "@/lib/google-suggest";
import { limitByIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildPresetVariations(baseQuery: string): string[] {
  const q = baseQuery.trim().toLowerCase();
  if (q.length < 2) return [];

  const variations: string[] = [];
  const hasPreset = /\bpreset\b/i.test(q);
  const hasXml = /\bxml\b/i.test(q);
  const has5mb = /\b5mb\b/i.test(q);
  const hasJj = /\bjj\b|\bjedag\b/i.test(q);
  const hasSound = /\bsound\b/i.test(q);

  if (!hasPreset) variations.push(`${q} preset`);
  if (!hasJj) variations.push(`${q} jj`);
  if (!hasSound) variations.push(`${q} sound`);
  if (!hasXml) variations.push(`${q} xml`);
  if (!has5mb) variations.push(`${q} 5mb`);

  return variations;
}

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
  const merged: string[] = [...local];

  // Index lokal tetap prioritas. Kalau stoknya masih sedikit, lengkapi dari
  // Google (yang sudah difilter ketat khusus preset).
  if (merged.length < LIMIT) {
    const remote = await remoteSuggest(query);
    for (const raw of remote) {
      const text = cleanSuggestion(raw);
      if (!text || merged.includes(text)) continue;
      merged.push(text);
      if (merged.length >= LIMIT) break;
    }
  }

  // Jika setelah remote suggest masih kurang dan query bukan kata preset generik,
  // tambahkan variasi pencarian bertema preset agar saran selalu berhubungan dengan preset.
  if (merged.length < LIMIT) {
    const variations = buildPresetVariations(query);
    for (const v of variations) {
      const text = cleanSuggestion(v);
      if (!text || merged.includes(text)) continue;
      merged.push(text);
      if (merged.length >= LIMIT) break;
    }
  }

  return Response.json(
    { ok: true, items: merged.slice(0, LIMIT) },
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } },
  );
}
