import { getExplorePresets } from "@/lib/explore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit") || 36);
    const limit = Math.min(Math.max(limitParam, 1), 60);
    const items = await getExplorePresets(limit);

    return Response.json(
      { ok: true, items, total: items.length },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, items: [], error: message }, { status: 500 });
  }
}
