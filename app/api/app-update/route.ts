import { getAppUpdateConfig } from "@/lib/app-update";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const config = await getAppUpdateConfig();
  return Response.json(
    {
      ok: true,
      ...config,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    },
  );
}
