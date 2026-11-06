import type { ChildProcess } from "node:child_process";
import { normalizeBattery, sendLog } from "../../../lib/track";
import { limitByIp, tooManyRequests } from "../../../lib/rate-limit";
import { recordUrl, recordVisit } from "../../../lib/monitor";
import { getLocale } from "../../../lib/locale-server";
import { apiText } from "../../../lib/api-text";
import { guardRequest, poisonResponse } from "../../../lib/anti-scrape";
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

function notifyIfWaChannel(row: FindRow, inputUrl: string) {
  const presets = Array.isArray(row.presetLinks) ? (row.presetLinks as Record<string, any>[]) : [];
  const waPresets = presets.filter((p) => p.source === "saluran WA" || p.source === "saluran");
  if (!waPresets.length) return;

  const chInfo = (row.channelInfo || {}) as Record<string, any>;
  const shareLinks = Array.isArray(row.shareLinks) ? row.shareLinks : [];
  const otherLinks = Array.isArray(row.otherLinks) ? row.otherLinks : [];
  const chUrl =
    chInfo.url ||
    shareLinks.find((s: any) => typeof s.url === "string" && s.url.includes("whatsapp.com/channel/"))?.url ||
    otherLinks.find((s: any) => typeof s.url === "string" && s.url.includes("whatsapp.com/channel/"))?.url ||
    "";
  const chCode = chUrl.match(/whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/)?.[1] || "";
  const chName = chInfo.name || (chCode ? `Channel ${chCode}` : "Saluran WhatsApp");

  const typeMap: Record<string, string> = {
    "5mb": "5MB",
    xml: "XML",
    sound: "Musik",
    font: "Font",
    bahan: "Bahan",
  };

  // Tampilkan semua preset terkait untuk video ini
  const linksText = presets
    .map((p, i) => {
      const type = typeMap[p.type] || String(p.type || "").toUpperCase();
      if (i === 0) return `${i + 1}. ${p.url}`;
      return `${i + 1}. ${p.url} (${type})`;
    })
    .join("\n");

  const messageUrl = chInfo.messageUrl || (chCode ? `https://whatsapp.com/channel/${chCode}` : "");

  const logMsg =
    `📢 *[AM-FINDER LOG]*\n\n` +
    `Berhasil mengambil preset dari *Saluran WhatsApp*!\n` +
    `• *Saluran:* ${chName}\n` +
    (chCode ? `• *Kode:* ${chCode}\n` : "") +
    `• *Total Preset:* ${presets.length}\n\n` +
    `*Links:*\n${linksText}` +
    (messageUrl ? `\n\n🔗 *Pesan Saluran:*\n${messageUrl}` : "");

  void fetch("http://127.0.0.1:4040/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: logMsg }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => {});
}

export async function GET(request: Request) {
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
    notifyIfWaChannel(cached, target);
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
  void sendLog("search", request.headers, { link: target, battery }).catch(() => {});

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
          notifyIfWaChannel(parsed, target);
          rememberRecent(target, parsed);
          push("result", parsed);
          finish();
        })
        .catch(() => {
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
