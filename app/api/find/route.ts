import { normalizeBattery, sendLog } from "../../../lib/track";
import { findPreset } from "../../../lib/amfinder.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 150_000;

function normalizeTarget(raw: string | null): string | null {
  if (!raw) return null;
  let value = raw.trim().slice(0, 2048);
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) {
    if (!/^[a-z0-9.-]+\.[a-z]{2,}([/?#]|$)/i.test(value)) return null;
    value = "https://" + value;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return value;
  } catch {
    return null;
  }
}

function encode(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function handle(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const target = normalizeTarget(params.get("url"));
  if (!target) {
    return Response.json({ ok: false, error: "link TikTok tidak valid" }, { status: 400 });
  }

  const battery = params.has("bat")
    ? normalizeBattery({
        level: Number(params.get("bat")),
        charging: params.get("chg") === "1",
      })
    : undefined;
  void sendLog("search", request.headers, { link: target, battery }).catch(() => {});

  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const releaseOnce = () => {
    if (closed) return false;
    closed = true;
    if (timer) clearTimeout(timer);
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

      // Scraper jalan di proses yang sama (tanpa spawn). Batas waktu menutup stream;
      // kalau klien putus, hasilnya dibuang.
      timer = setTimeout(() => {
        push("error", { message: "pencarian kehabisan waktu" });
        finish();
      }, TIMEOUT_MS);

      Promise.resolve()
        .then(() => findPreset(target, {
        all: true,
        onLog: (line: string) => {
          const text = line.replace(/^\[[\d.]+s\]\s*/, "").trim();
          if (text) push("log", text);
        },
      }))
        .then((result: unknown) => {
          if (!result || typeof result !== "object") {
            push("error", { message: "keluaran scraper tidak terbaca" });
          } else {
            push("result", result);
          }
        })
        .catch((error: unknown) => {
          push("error", { message: error instanceof Error ? error.message : String(error) });
        })
        .finally(finish);
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

// Tangkap semua exception supaya yang tampil pesan aslinya, bukan halaman Cloudflare 1101.
// (Sementara untuk diagnosis; stack dipotong pendek.)
export async function GET(request: Request): Promise<Response> {
  try {
    return await handle(request);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return Response.json(
      { ok: false, error: err.message, stack: (err.stack || "").split("\n").slice(0, 8) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
