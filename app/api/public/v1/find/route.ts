import { limitByKey } from "../../../../../lib/rate-limit";
import {
  authenticateApiKey,
  checkDailyQuota,
  quotaHeaders,
  quotaSnapshot,
  refundQuota,
  reserveQuota,
} from "../../../../../lib/api-keys";
import {
  acquireFindSlot,
  normalizeTarget,
  peekRecent,
  releaseFindSlot,
  rememberRecent,
  runFindProcess,
} from "../../../../../lib/find-core";
import { quotaBlockedMs } from "../../../../../lib/tikwm-quota.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_TIMEOUT_MS = 150_000;

function withQuota(
  record: Parameters<typeof quotaHeaders>[0],
  status: number,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Response {
  return Response.json(body, {
    status,
    headers: { ...quotaHeaders(record), ...extraHeaders },
  });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const auth = authenticateApiKey(request.headers, requestUrl.searchParams.get("apikey"));
  if (!auth.ok) {
    return Response.json(
      { ok: false, code: auth.code, error: auth.error },
      { status: auth.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  const key = auth.record;

  // Burst 5 request / 10 detik per key. Dihitung untuk semua request kecuali
  // yang gagal autentikasi.
  const burst = limitByKey(`api:${key.id}`, "api");
  if (!burst.ok) {
    return withQuota(
      key,
      429,
      { ok: false, code: "burst_limit", error: "terlalu banyak permintaan, coba lagi sebentar" },
      { "Retry-After": String(burst.retryAfterSec) },
    );
  }

  const target = normalizeTarget(requestUrl.searchParams.get("url"));
  if (!target) {
    return withQuota(key, 400, {
      ok: false,
      code: "invalid_url",
      error: "parameter url harus berupa link video TikTok/YouTube yang valid",
    });
  }

  const quota = checkDailyQuota(key);
  if (!quota.ok) {
    const snapshot = quotaSnapshot(key);
    const retryAfter = Math.max(1, snapshot.reset - Math.floor(Date.now() / 1000));
    return withQuota(
      key,
      quota.status,
      { ok: false, code: quota.code, error: quota.error },
      quota.status === 429 ? { "Retry-After": String(retryAfter) } : {},
    );
  }

  // Kuota tikwm dipakai bareng web. Kalau sedang dijeda, jangan buang request.
  const blockedMs = quotaBlockedMs();
  if (blockedMs > 0) {
    return withQuota(
      key,
      503,
      {
        ok: false,
        code: "tikwm_quota",
        error: "kuota sumber preset harian sedang hampir habis, coba lagi nanti",
      },
      { "Retry-After": String(Math.ceil(blockedMs / 1000)) },
    );
  }

  try {
    await acquireFindSlot();
  } catch {
    return withQuota(key, 503, {
      ok: false,
      code: "server_busy",
      error: "server sedang penuh, coba lagi beberapa saat lagi",
    });
  }

  try {
    // Reservasi dulu, refund kalau upstream gagal. Dengan begitu request paralel
    // tidak bisa menembus kuota harian.
    reserveQuota(key);

    const cached = peekRecent(target);
    if (cached) {
      return withQuota(key, 200, { ok: true, url: target, ...cached });
    }

    const result = await runFindProcess(target, { timeoutMs: PUBLIC_TIMEOUT_MS });
    if (!result.ok) {
      refundQuota(key);
      return withQuota(key, 502, {
        ok: false,
        code: "upstream_error",
        error: "gagal mengambil data dari sumber video",
      });
    }

    rememberRecent(target, result.row);
    return withQuota(key, 200, { ok: true, url: target, ...result.row });
  } catch {
    refundQuota(key);
    return withQuota(key, 502, {
      ok: false,
      code: "upstream_error",
      error: "gagal mengambil data dari sumber video",
    });
  } finally {
    releaseFindSlot();
  }
}
