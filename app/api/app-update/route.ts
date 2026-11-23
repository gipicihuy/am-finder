import { getAppUpdateConfig } from "@/lib/app-update";
import { isApkRequest } from "@/lib/apk-version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const config = await getAppUpdateConfig();
  return Response.json(
    {
      ok: true,
      ...config,
      from_apk: isApkRequest(request.headers),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        Vary: "X-Requested-With, User-Agent",
      },
    },
  );
}
