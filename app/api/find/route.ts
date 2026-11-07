import type { ChildProcess } from "node:child_process";
import { logSearchToDiscord, normalizeBattery, notifyPresetSources } from "../../../lib/track";
import { limitByIp, tooManyRequests } from "../../../lib/rate-limit";
import { recordUrl, recordVisit } from "../../../lib/monitor";
import { getLocale } from "../../../lib/locale-server";
import { apiText } from "../../../lib/api-text";
import { guardRequest, poisonResponse } from "../../../lib/anti-scrape";
import { clientIp } from "../../../lib/ip";
import { isBlocked, recordBlockedHit } from "../../../lib/blocklist";
import { isDeduplicated, reportServerError, sendDiscordEmbed } from "../../../lib/discord";
import {
  acquireFindSlot,
  normalizeTarget,
  peekRecent,
  releaseFindSlot,
  rememberRecent,
  runFindProcess,
  type FindRow,
} from "../../../lib/find-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

function sseOf(events: Array<[string, unknown]>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const [event, data] of events) controller.enqueue(encoder.encode(encode(event, data)));
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

function encode(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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
  if (guard.poison) return poisonResponse("find");

  const params = new URL(request.url).searchParams;
  const target = normalizeTarget(params.get("url"));
  if (!target) {
    return Response.json({ ok: false, error: apiText(locale, "badLink") }, { status: 400 });
  }

  if (!guard.isInternal) {
    const limit = limitByIp(request, "find");
    if (!limit.ok) return tooManyRequests(limit.retryAfterSec, apiText(locale, "tooMany"));
  }

  const t0 = Date.now();
  recordVisit(request.headers);

  // Link yang barusan dicek: balas langsung. Tidak dihitung sebagai pemeriksaan
  // baru di monitor karena memang tidak ada yang diperiksa ulang.
  const cached = peekRecent(target);
  if (cached) {
    notifyPresetSources(cached, target);
    return sseOf([
      ["log", "hasil barusan sudah dicek, langsung ditampilkan"],
      ["result", cached],
    ]);
  }

  const battery = params.has("bat")
    ? normalizeBattery({
        level: Number(params.get("bat")),
        charging: params.get("chg") === "1",
      })
    : undefined;
  void logSearchToDiscord("tiktok", request.headers, { link: target, battery }).catch(() => {});

  try {
    await acquireFindSlot();
  } catch {
    return Response.json(
      { ok: false, error: apiText(locale, "busy") },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  let child: ChildProcess | null = null;
  let closed = false;

  const releaseOnce = () => {
    if (closed) return false;
    closed = true;
    releaseFindSlot();
    return true;
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const push = (event: string, data: unknown) => {
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

      void runFindProcess(target, {
        onLog: (line) => push("log", line),
        onSpawn: (proc) => {
          child = proc;
        },
        signal: request.signal,
      })
        .then((result) => {
          if (closed) return;
          if (!result.ok) {
            reportServerError("/api/find:scraper", new Error(`Scraper gagal: ${result.error || result.kind}`), request);
            push("error", {
              message:
                result.kind === "unreadable"
                  ? apiText(locale, "scraperUnreadable")
                  : apiText(locale, "scraperExit"),
            });
            finish();
            return;
          }
          const parsed = result.row;
          recordUrl(request.headers, {
            url: target,
            found: !!parsed.found,
            presets: Array.isArray(parsed.presetLinks) ? parsed.presetLinks.length : 0,
            ms: Date.now() - t0,
          });
          notifyPresetSources(parsed, target);
          rememberRecent(target, parsed);
          push("result", parsed);
          finish();
        })
        .catch((err) => {
          reportServerError("/api/find", err, request);
          push("error", { message: apiText(locale, "scraperExit") });
          finish();
        });
    },
    cancel() {
      releaseOnce();
      try {
        child?.kill("SIGKILL");
      } catch {
        /* proses sudah mati */
      }
    },
  });

  request.signal.addEventListener("abort", () => {
    releaseOnce();
    try {
      child?.kill("SIGKILL");
    } catch {
      /* proses sudah mati */
    }
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
