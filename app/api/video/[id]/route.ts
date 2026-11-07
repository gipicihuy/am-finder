import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { contentDisposition, cleanSoundTitle } from "@/lib/audio";
import { clientIp } from "@/lib/ip";
import { isBlocked, recordBlockedHit } from "@/lib/blocklist";
import { reportServerError } from "@/lib/discord";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const CACHE_FILE = path.join(process.cwd(), "lib", "amfinder.cache.json");

const downloadPromises = new Map<string, Promise<string>>();

async function loadCache(): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(CACHE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function getTikTokVideo(id: string): Promise<{ url: string; title: string } | null> {
  const data = await loadCache();
  if (data) {
    const entry =
      data[`video:v10:${id}:all`] ??
      data[`video:v10:${id}`] ??
      Object.entries(data).find(([key]) => key.endsWith(`:${id}:all`) || key.endsWith(`:${id}`))?.[1];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const video = (entry as any)?.v?.video;
    const playUrl = video?.playUrlNoWm || video?.playUrl;
    if (typeof playUrl === "string" && playUrl.startsWith("http")) {
      return { url: playUrl, title: cleanSoundTitle(video?.description || `tiktok-${id}`, 80) };
    }
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`https://tikwm.com/api/?url=https://www.tiktok.com/@/video/${id}`, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        Referer: "https://tikwm.com/",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json()) as any;
    if (json.code === 0 && (json.data?.play || json.data?.wmplay)) {
      return {
        url: json.data.play || json.data.wmplay,
        title: cleanSoundTitle(json.data.title || `tiktok-${id}`, 80),
      };
    }
  } catch {}

  return null;
}

async function ensureYoutubeVideo(id: string): Promise<{ filePath: string; title: string }> {
  const filePath = path.join(os.tmpdir(), `amf-yt-${id}.mp4`);
  
  let title = `youtube-${id}`;
  const data = await loadCache();
  if (data) {
    const entry =
      data[`video:v10:yt:${id}:all`] ??
      data[`video:v10:yt:${id}`] ??
      Object.entries(data).find(([key]) => key.endsWith(`:${id}:all`))?.[1];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = (entry as any)?.v?.video;
    if (v?.title) title = cleanSoundTitle(v.title, 80);
  }

  if (existsSync(filePath)) {
    try {
      const st = statSync(filePath);
      if (st.size > 1000) return { filePath, title };
    } catch {}
  }

  const existing = downloadPromises.get(id);
  if (existing) {
    const p = await existing;
    return { filePath: p, title };
  }

  const promise = (async () => {
    const ytdlpBin = process.env.YTDLP_BIN || "/usr/local/bin/yt-dlp";
    await execFileAsync(
      ytdlpBin,
      [
        "-f",
        "best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best",
        "--merge-output-format",
        "mp4",
        "-o",
        filePath,
        "--no-playlist",
        `https://www.youtube.com/watch?v=${id}`,
      ],
      { timeout: 90_000 }
    );

    const timer = setTimeout(() => {
      unlink(filePath).catch(() => {});
    }, 2 * 60 * 60 * 1000);
    if (typeof timer.unref === "function") timer.unref();

    return filePath;
  })().finally(() => {
    downloadPromises.delete(id);
  });

  downloadPromises.set(id, promise);
  const p = await promise;
  return { filePath: p, title };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const ip = clientIp(request.headers);
  if (isBlocked(ip)) {
    recordBlockedHit(ip);
    return Response.json(
      { ok: false, error: "forbidden" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { id } = await context.params;
  const isTiktokId = /^\d{15,20}$/.test(id);
  const isYtId = /^[\w-]{11}$/.test(id);
  if (!isTiktokId && !isYtId) {
    return new Response("Invalid video ID", { status: 400 });
  }

  const urlObj = new URL(request.url);
  const isDownload = urlObj.searchParams.get("dl") === "1";

  // JALUR 1: TikTok Video
  if (isTiktokId) {
    const tt = await getTikTokVideo(id);
    if (!tt) {
      return new Response("Video TikTok tidak ditemukan", { status: 404 });
    }

    const upstream = await fetch(tt.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: "https://www.tiktok.com/",
      },
    });

    if (!upstream.ok || !upstream.body) {
      return new Response("Gagal mengambil stream video TikTok", { status: 502 });
    }

    const headers = new Headers();
    headers.set("Content-Type", "video/mp4");
    headers.set("Cache-Control", "public, max-age=7200");
    const len = upstream.headers.get("content-length");
    if (len) headers.set("Content-Length", len);

    if (isDownload) {
      headers.set(
        "Content-Disposition",
        contentDisposition(`${tt.title}.mp4`, `video-${id}.mp4`)
      );
    }

    return new Response(upstream.body, { status: 200, headers });
  }

  // JALUR 2: YouTube Video
  let ytResult: { filePath: string; title: string };
  try {
    ytResult = await ensureYoutubeVideo(id);
  } catch (err) {
    reportServerError("/api/video", err, request);
    return new Response("Failed to download video", { status: 502 });
  }

  let stat;
  try {
    stat = statSync(ytResult.filePath);
  } catch {
    return new Response("Video file not found", { status: 404 });
  }

  const fileSize = stat.size;
  const range = request.headers.get("range");

  if (range && !isDownload) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize) {
      return new Response("Range Not Satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${fileSize}` },
      });
    }

    const chunksize = end - start + 1;
    const stream = createReadStream(ytResult.filePath, { start, end });
    const webStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>;

    return new Response(webStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunksize),
        "Content-Type": "video/mp4",
        "Cache-Control": "public, max-age=7200",
      },
    });
  }

  const stream = createReadStream(ytResult.filePath);
  const webStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>;

  const headers = new Headers({
    "Content-Length": String(fileSize),
    "Accept-Ranges": "bytes",
    "Content-Type": "video/mp4",
    "Cache-Control": "public, max-age=7200",
  });

  if (isDownload) {
    headers.set(
      "Content-Disposition",
      contentDisposition(`${ytResult.title}.mp4`, `video-${id}.mp4`)
    );
  }

  return new Response(webStream, {
    status: 200,
    headers,
  });
}

export async function HEAD(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const isTiktokId = /^\d{15,20}$/.test(id);
  const isYtId = /^[\w-]{11}$/.test(id);
  if (!isTiktokId && !isYtId) {
    return new Response(null, { status: 400 });
  }

  if (isTiktokId) {
    return new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Cache-Control": "public, max-age=7200",
      },
    });
  }

  try {
    const ytResult = await ensureYoutubeVideo(id);
    const stat = statSync(ytResult.filePath);
    return new Response(null, {
      status: 200,
      headers: {
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
        "Content-Type": "video/mp4",
        "Cache-Control": "public, max-age=7200",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
