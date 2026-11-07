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
import { SearchBusyError, normalizeQuery, searchCandidates } from "../../../../../lib/search-core";
import { clientIp } from "../../../../../lib/ip";
import { isBlocked, recordBlockedHit } from "../../../../../lib/blocklist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_TIMEOUT_MS = 150_000;
const SEARCH_LIMIT_DEFAULT = 10;
const SEARCH_LIMIT_MAX = 30;

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

// Mode pencarian: ?apikey=KEY&q=KATA_KUNCI. Mengembalikan daftar video kandidat
// (sama seperti tab "Cari Preset"). Ambil preset-nya dengan memanggil endpoint
// ini lagi memakai url= dari salah satu hasil. Memakai key, burst limit, dan
// kuota harian yang sama dengan mode url=.
async function handleSearch(
  key: Parameters<typeof quotaHeaders>[0] & Parameters<typeof reserveQuota>[0],
  rawQuery: string,
  rawLimit: string | null,
): Promise<Response> {
  const query = normalizeQuery(rawQuery);
  if (!query) {
    return withQuota(key, 400, {
      ok: false,
      code: "invalid_query",
      error: "parameter q minimal 3 karakter",
    });
  }

  const limitNum = Number(rawLimit);
  const limit =
    rawLimit && Number.isFinite(limitNum) && limitNum >= 1
      ? Math.min(Math.floor(limitNum), SEARCH_LIMIT_MAX)
      : SEARCH_LIMIT_DEFAULT;

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

  const t0 = Date.now();
  reserveQuota(key);
  try {
    const { items, fromCache } = await searchCandidates(query);
    const videos = items.slice(0, limit).map((item) => ({
      url: item.url,
      handle: item.handle ?? "",
      kind: item.kind ?? "video",
      snippet: item.snippet ?? "",
      thumb: item.thumb ?? "",
    }));
    return withQuota(key, 200, {
      ok: true,
      query,
      fromCache,
      candidates: videos.length,
      videos,
      elapsedMs: Date.now() - t0,
    });
  } catch (error) {
    refundQuota(key);
    if (error instanceof SearchBusyError) {
      return withQuota(
        key,
        503,
        {
          ok: false,
          code: "server_busy",
          error: "server sedang penuh, coba lagi beberapa saat lagi",
        },
        { "Retry-After": "5" },
      );
    }
    return withQuota(key, 502, {
      ok: false,
      code: "upstream_error",
      error: "gagal mencari video, coba lagi nanti",
    });
  }
}

export async function GET(request: Request) {
  const ip = clientIp(request.headers);
  if (isBlocked(ip)) {
    recordBlockedHit(ip);
    return Response.json(
      { ok: false, error: "forbidden" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

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

  // q= (pencarian) dipakai kalau url= tidak dikirim. Kalau dua-duanya ada, url= menang.
  const rawQuery = requestUrl.searchParams.get("q");
  if (rawQuery !== null && !requestUrl.searchParams.has("url")) {
    return handleSearch(key, rawQuery, requestUrl.searchParams.get("limit"));
  }

  const target = normalizeTarget(requestUrl.searchParams.get("url"));
  if (!target) {
    return withQuota(key, 400, {
      ok: false,
      code: "invalid_url",
      error: requestUrl.searchParams.has("url")
        ? "parameter url harus berupa link video TikTok/YouTube yang valid"
        : "kirim parameter url (link video TikTok/YouTube) atau q (kata kunci pencarian)",
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
