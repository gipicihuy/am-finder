import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { searchTiktok, setLog } from "../../../lib/ttsearch";
import { normalizeBattery, sendLog } from "../../../lib/track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEARCH_BUDGET_MS = 40_000;
const TOTAL_TIMEOUT_MS = 150_000;
const CHILD_TIMEOUT_MS = 120_000;
const MAX_ACTIVE = 3;
const MAX_QUEUE = 8;
const TOP_DEFAULT = 3;
const TOP_MAX = 5;

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

// logSink di ttsearch.js global — fase pencarian dijalankan antri biar
// log SSE dari dua request gak saling nyampur.
let searchChain: Promise<unknown> = Promise.resolve();
function withSearchLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = searchChain.then(fn, fn);
  searchChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function encode(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function normalizeQuery(raw: string | null): string | null {
  if (!raw) return null;
  const q = raw.trim().replace(/\s+/g, " ").slice(0, 100);
  if (q.length < 3) return null;
  return q;
}

type Push = (event: string, data: unknown) => void;

type Candidate = {
  url: string;
  handle?: string;
  kind?: string;
  snippet?: string;
  thumb?: string;
};

type SearchResult = {
  items: Candidate[];
  engine?: string;
  fromCache?: boolean;
};

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
    };
    push("log", `[video ${index + 1}] ${cand.url}`);
    push("videoStart", meta);

    const child = spawn(
      process.execPath,
      [path.join(process.cwd(), "lib", "amfinder.js"), cand.url, "--raw", "--all"],
      { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
    );
    children.add(child);

    let stdout = "";
    let stderrBuffer = "";
    const done = (row: Record<string, unknown>) => {
      children.delete(child);
      resolve(row);
    };
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* proses sudah mati */
      }
    }, CHILD_TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
      let index2 = stderrBuffer.indexOf("\n");
      while (index2 >= 0) {
        const line = stderrBuffer.slice(0, index2);
        stderrBuffer = stderrBuffer.slice(index2 + 1);
        const text = line.replace(/^\[[\d.]+s\]\s*/, "").trim();
        if (text) push("log", `[video ${index + 1}] ${text}`);
        index2 = stderrBuffer.indexOf("\n");
      }
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      done({ ...meta, found: false, error: error.message });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const jsonStart = stdout.indexOf("{");
      if (code !== 0 || jsonStart < 0) {
        const tail = stderrBuffer.trim().split("\n").pop();
        done({ ...meta, found: false, error: (tail || `scraper berhenti dengan kode ${code}`).slice(0, 200) });
        return;
      }
      try {
        const r = JSON.parse(stdout.slice(jsonStart)) as Record<string, unknown>;
        done({
          ...meta,
          found: !!r.found,
          context: r.context ?? null,
          presetLinks: Array.isArray(r.presetLinks) ? r.presetLinks : [],
          message: r.message ?? null,
          checked: r.checked ?? null,
          shareLinks: r.shareLinks ?? null,
        });
      } catch {
        done({ ...meta, found: false, error: "JSON pipeline tidak valid" });
      }
    });
  });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = normalizeQuery(params.get("q"));
  if (!query) {
    return Response.json({ ok: false, error: "query minimal 3 karakter" }, { status: 400 });
  }
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
  void sendLog("search", request.headers, { link: `query: ${query}`, battery }).catch(() => {});

  try {
    await acquire();
  } catch (error) {
    return Response.json(
      { ok: false, error: (error as Error).message },
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
                searchTiktok(query, { limit: 20, timeout: 20_000, engine: "auto", refresh: false }),
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
          push("error", { message: (error as Error).message });
          finish();
          return;
        }
        if (closed) return;

        const items = (searchRes.items || []).slice(0, top);
        push("candidates", {
          query,
          engine: searchRes.engine ?? "auto",
          fromCache: !!searchRes.fromCache,
          items,
        });

        if (!items.length) {
          push("result", {
            ok: true,
            query,
            engine: searchRes.engine ?? "auto",
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
          engine: searchRes.engine ?? "auto",
          fromCache: !!searchRes.fromCache,
          candidates: items.length,
          videos,
          foundCount,
          elapsedMs: Date.now() - t0,
        });
        finish();
      })().catch(() => {
        push("error", { message: "proses pencarian terputus tak terduga" });
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
