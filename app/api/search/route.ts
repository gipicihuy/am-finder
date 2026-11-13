import type { ChildProcess } from "node:child_process";
import { searchTiktok, setLog } from "../../../lib/ttsearch";
import {
  CANDIDATE_LIMIT,
  QUERY_PREFIX,
  SEARCH_BUDGET_MS,
  filterPresetCandidates,
  normalizeQuery,
  normalizeText,
  rankCandidates,
  scoreCandidate,
  withSearchLock,
  type Candidate,
  type SearchResult,
} from "../../../lib/search-core";
import { runFindProcess } from "../../../lib/find-core";
import { logSearchToDiscord, normalizeBattery, notifyPresetSources } from "../../../lib/track";
import { limitByIp, tooManyRequests } from "../../../lib/rate-limit";
import { recordCari, recordVisit } from "../../../lib/monitor";
import { rememberQuery } from "../../../lib/suggest";
import { getLocale } from "../../../lib/locale-server";
import { apiText } from "../../../lib/api-text";
import { guardRequest, poisonResponse } from "../../../lib/anti-scrape";
import { clientIp } from "../../../lib/ip";
import { isBlocked, recordBlockedHit } from "../../../lib/blocklist";
import { reportServerError } from "../../../lib/discord";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOTAL_TIMEOUT_MS = 150_000;
const CHILD_TIMEOUT_MS = 120_000;
const MAX_ACTIVE = 3;
const MAX_QUEUE = 8;
const TOP_DEFAULT = 3;
const TOP_MAX = 5;
// Pesan yang dilihat user kalau semua engine gagal. Detail teknisnya tetap
// dikirim lewat event "log" biar gampang didebug, tapi jangan nyasar ke user.

// Gate lokal sendiri (terpisah dari /api/find) biar halaman test
// gak menyentuh route lama sama sekali.
let active = 0;
const waiting: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_ACTIVE) {
    active += 1;
    return Promise.resolve();
  }
  if (waiting.length >= MAX_QUEUE) {
    return Promise.reject(new Error("server lagi penuh, coba lagi beberapa saat lagi"));
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function release() {
  const next = waiting.shift();
  if (next) next();
  else active -= 1;
}

function encode(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

type Push = (event: string, data: unknown) => void;

function runVideo(
  cand: Candidate,
  index: number,
  push: Push,
  children: Set<ChildProcess>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const meta = {
      index,
      url: cand.url,
      handle: cand.handle ?? "",
      kind: cand.kind ?? "video",
      snippet: cand.snippet ?? "",
      thumb: cand.thumb ?? "",
      thumbFallback: cand.thumbFallback ?? "",
    };
    push("log", `[video ${index + 1}] ${cand.url}`);
    push("videoStart", meta);

    let child: ChildProcess | null = null;

    void runFindProcess(cand.url, {
      timeoutMs: CHILD_TIMEOUT_MS,
      onLog: (line) => push("log", `[video ${index + 1}] ${line}`),
      onSpawn: (proc) => {
        child = proc;
        children.add(proc);
      },
    }).then((result) => {
      if (child) children.delete(child);
      if (!result.ok) {
        resolve({ ...meta, found: false, error: result.error.slice(0, 200) });
        return;
      }
      const r = result.row;
      if (r.found) {
        notifyPresetSources(r, cand.url);
      }
      resolve({
        ...meta,
        found: !!r.found,
        context: r.context ?? null,
        presetLinks: Array.isArray(r.presetLinks) ? r.presetLinks : [],
        message: r.message ?? null,
        checked: r.checked ?? null,
        shareLinks: r.shareLinks ?? null,
      });
    });
  });
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

  const locale = await getLocale();
  const guard = guardRequest(request);
  if (!guard.ok) {
    return Response.json(
      { ok: false, error: guard.error },
      { status: guard.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (guard.poison) return poisonResponse("search");

  const params = new URL(request.url).searchParams;
  const query = normalizeQuery(params.get("q"));
  if (!query) {
    return Response.json({ ok: false, error: apiText(locale, "queryShort") }, { status: 400 });
  }

  // Simpan kata kunci buat autocomplete (murah, tidak menunggu hasil).
  rememberQuery(query);

  if (!guard.isInternal) {
    const limit = limitByIp(request, "search");
    if (!limit.ok) return tooManyRequests(limit.retryAfterSec, apiText(locale, "tooMany"));
  }

  recordVisit(request.headers);

  const topRaw = Number(params.get("top"));
  const top = Number.isFinite(topRaw) && topRaw >= 1
    ? Math.min(Math.floor(topRaw), TOP_MAX)
    : TOP_DEFAULT;

  const battery = params.has("bat")
    ? normalizeBattery({
        level: Number(params.get("bat")),
        charging: params.get("chg") === "1",
      })
    : undefined;
  const searchQuery = `${QUERY_PREFIX} ${query}`;
  void logSearchToDiscord("search", request.headers, { query: searchQuery, battery }).catch(() => {});

  try {
    await acquire();
  } catch {
    return Response.json(
      { ok: false, error: apiText(locale, "busy") },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const children = new Set<ChildProcess>();
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const killChildren = () => {
    for (const child of children) {
      try {
        child.kill("SIGKILL");
      } catch {
        /* proses sudah mati */
      }
    }
  };

  const releaseOnce = () => {
    if (closed) return false;
    closed = true;
    if (timer) clearTimeout(timer);
    killChildren();
    release();
    return true;
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const push: Push = (event, data) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encode(event, data)));
        } catch {
          releaseOnce();
        }
      };
      const finish = () => {
        if (!releaseOnce()) return;
        try {
          controller.close();
        } catch {
          /* stream sudah ditutup klien */
        }
      };

      timer = setTimeout(killChildren, TOTAL_TIMEOUT_MS);
      const t0 = Date.now();

      void (async () => {
        let searchRes: SearchResult;
        try {
          searchRes = await withSearchLock(async (): Promise<SearchResult> => {
            setLog((line: string) => push("log", line));
            try {
              const res = await Promise.race([
                searchTiktok(searchQuery, { limit: CANDIDATE_LIMIT, timeout: 20_000, engine: "auto", refresh: false }),
                new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error("pencarian kehabisan waktu")), SEARCH_BUDGET_MS),
                ),
              ]);
              return res as SearchResult;
            } finally {
              setLog(() => {});
            }
          });
        } catch (error) {
          push("log", `[gagal] ${(error as Error).message}`);
          push("error", { message: apiText(locale, "searchFailed") });
          finish();
          return;
        }
        if (closed) return;

        // mode=pick kirim lebih banyak kandidat (CANDIDATE_LIMIT, batas atas tikwm)
        // biar frontend bisa paginasi "Tampilkan lebih banyak" per batch. Mode lain
        // tetap `top`. Hasil di-ranking dulu sama judul/keyword user sebelum di-slice.
        const pickMode = params.get("mode") === "pick";
        const queryNorm = normalizeText(query);
        let ranked = rankCandidates(searchRes.items || [], queryNorm);

        // Fallback: kalau gak semua kata kunci user kejadian di hasil atas
        // (prefix "preset am" bisa bikin engine nyimpang dari judul lagu),
        // cari ulang tanpa prefix — pakai hasilnya kalo lebih cocok.
        const bestScore = ranked.length > 0 ? scoreCandidate(ranked[0].snippet, queryNorm) : 0;
        if (ranked.length > 0 && bestScore < 60) {
          push("log", "hasil kurang cocok, cari ulang tanpa prefix...");
          try {
            const retry = await withSearchLock(async (): Promise<SearchResult> => {
              setLog((line: string) => push("log", line));
              try {
                return (await searchTiktok(query, {
                  limit: CANDIDATE_LIMIT,
                  timeout: 15_000,
                  engine: "auto",
                  refresh: false,
                })) as SearchResult;
              } finally {
                setLog(() => {});
              }
            });
            const retryRanked = rankCandidates(retry.items || [], queryNorm);
            const retryScore =
              retryRanked.length > 0 ? scoreCandidate(retryRanked[0].snippet, queryNorm) : 0;
            if (retryScore > bestScore) {
              searchRes = retry;
              ranked = retryRanked;
            }
          } catch {
            /* fallback gagal: tetap pakai hasil pertama */
          }
          if (closed) return;
        }

        const items = filterPresetCandidates(ranked).slice(0, pickMode ? CANDIDATE_LIMIT : top);
        recordCari(request.headers, { query, foundCount: items.length, ms: Date.now() - t0 });
        push("candidates", {
          query,
          fromCache: !!searchRes.fromCache,
          items,
        });

        // mode=pick: cuma cari kandidat, pengecekan preset dilakukan klien per video
        // yang dipilih (lewat /api/find).
        if (pickMode) {
          push("result", {
            ok: true,
            query,
            fromCache: !!searchRes.fromCache,
            candidates: items.length,
            videos: [],
            foundCount: 0,
            elapsedMs: Date.now() - t0,
          });
          finish();
          return;
        }

        if (!items.length) {
          push("result", {
            ok: true,
            query,
            fromCache: !!searchRes.fromCache,
            candidates: 0,
            videos: [],
            foundCount: 0,
            elapsedMs: Date.now() - t0,
          });
          finish();
          return;
        }

        const videos: Array<Record<string, unknown> | undefined> = new Array(items.length);
        let next = 0;
        const worker = async () => {
          while (true) {
            const i = next++;
            if (i >= items.length) return;
            if (closed) return;
            videos[i] = await runVideo(items[i], i, push, children);
            if (!closed) push("videoResult", videos[i]);
          }
        };
        await Promise.all([worker(), worker()]);
        if (closed) return;

        const foundCount = videos.filter((v) => v && v.found).length;
        push("result", {
          ok: true,
          query,
          fromCache: !!searchRes.fromCache,
          candidates: items.length,
          videos,
          foundCount,
          elapsedMs: Date.now() - t0,
        });
        finish();
      })().catch((err) => {
        reportServerError("/api/search", err, request);
        push("error", { message: apiText(locale, "searchInterrupted") });
        finish();
      });
    },
    cancel() {
      releaseOnce();
    },
  });

  request.signal.addEventListener("abort", () => {
    releaseOnce();
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
