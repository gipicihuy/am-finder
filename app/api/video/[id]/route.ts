import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile, unlink, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { contentDisposition, cleanSoundTitle } from "@/lib/audio";
import { isTikTokUrlExpired } from "@/lib/video-util";
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

async function fetchTikTokFromTikwm(id: string): Promise<{ url: string; title: string } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
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
      const play = json.data.play || json.data.wmplay;
      const full = play.startsWith("//") ? `https:${play}` : play.startsWith("/") ? `https://www.tikwm.com${play}` : play;
      return {
        url: full,
        title: cleanSoundTitle(json.data.title || `tiktok-${id}`, 80),
      };
    }
  } catch {}
  return null;
}

async function updateCachedTikTokPlayUrl(id: string, freshPlayUrl: string) {
  try {
    const raw = await readFile(CACHE_FILE, "utf8");
    const data = JSON.parse(raw);
    let changed = false;
    for (const [key, entry] of Object.entries(data)) {
      if (key.endsWith(`:${id}:all`) || key.endsWith(`:${id}`)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const v = (entry as any)?.v;
        if (v?.video) {
          v.video.playUrl = freshPlayUrl;
          v.video.playUrlNoWm = freshPlayUrl;
          changed = true;
        }
      }
    }
    if (changed) {
      const tmp = `${CACHE_FILE}.tmp.${Date.now()}`;
      await writeFile(tmp, JSON.stringify(data));
      await rename(tmp, CACHE_FILE);
    }
  } catch {}
}

async function getTikTokVideo(id: string): Promise<{ url: string; title: string } | null> {
  const data = await loadCache();
  if (data) {
    const entry =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.entries(data).find(([key]) => key.endsWith(`:${id}:all`) || key.endsWith(`:${id}`))?.[1] as any;
    const video = entry?.v?.video;
    const playUrl = video?.playUrlNoWm || video?.playUrl;
    if (typeof playUrl === "string" && playUrl.startsWith("http") && !isTikTokUrlExpired(playUrl)) {
      return { url: playUrl, title: cleanSoundTitle(video?.description || `tiktok-${id}`, 80) };
    }
  }

  const fresh = await fetchTikTokFromTikwm(id);
  if (fresh) {
    void updateCachedTikTokPlayUrl(id, fresh.url);
    return fresh;
  }
  return null;
}

async function optimizeTikTokVideoAsync(rawPath: string, targetPath: string) {
  try {
    if (!existsSync(rawPath)) return;
    const stat = statSync(rawPath);
    if (stat.size < 1000) return;

    let duration = 0;
    let bitRate = 0;
    try {
      const { stdout } = await execFileAsync("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name,width,height,r_frame_rate,avg_frame_rate,bit_rate",
        "-show_entries",
        "format=duration,size,bit_rate",
        "-of",
        "json",
        rawPath,
      ]);
      const info = JSON.parse(stdout);
      const vStream = info.streams?.[0];
      duration = parseFloat(info.format?.duration || "0");
      bitRate = parseInt(info.format?.bit_rate || vStream?.bit_rate || "0", 10);
    } catch {}

    const isOptimal = stat.size <= 4_000_000 && duration < 20 && bitRate <= 1_200_000;
    const optTmpPath = `${targetPath}.tmp.${Date.now()}.mp4`;

    if (isOptimal) {
      // Sudah optimal: repack dengan moov atom di awal file (+faststart) tanpa kompresi ulang
      await execFileAsync("ffmpeg", [
        "-i",
        rawPath,
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        "-y",
        optTmpPath,
      ]);
    } else {
      // Optimasi kompresi ringan: H.264 profile High yuv420p, CRF 25, passthrough fps, GOP 2 detik (-g 60 -keyint_min 30), faststart
      await execFileAsync("ffmpeg", [
        "-i",
        rawPath,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "25",
        "-fps_mode",
        "passthrough",
        "-pix_fmt",
        "yuv420p",
        "-g",
        "60",
        "-keyint_min",
        "30",
        "-movflags",
        "+faststart",
        "-c:a",
        "copy",
        "-y",
        optTmpPath,
      ]);
    }

    if (existsSync(optTmpPath)) {
      const optStat = statSync(optTmpPath);
      if (optStat.size > 1000) {
        await rename(optTmpPath, targetPath);
        await unlink(rawPath).catch(() => {});
      } else {
        await unlink(optTmpPath).catch(() => {});
      }
    }
  } catch {
    try {
      if (existsSync(rawPath) && !existsSync(targetPath)) {
        await rename(rawPath, targetPath);
      }
    } catch {}
  }
}

async function ensureTikTokVideo(id: string): Promise<{ filePath: string; title: string }> {
  const filePath = path.join(os.tmpdir(), `amf-tt-${id}.mp4`);
  const rawPath = path.join(os.tmpdir(), `amf-tt-${id}.raw.mp4`);

  let title = `tiktok-${id}`;
  const data = await loadCache();
  if (data) {
    const entry =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.entries(data).find(([key]) => key.endsWith(`:${id}:all`) || key.endsWith(`:${id}`))?.[1] as any;
    const video = entry?.v?.video;
    if (video?.description) title = cleanSoundTitle(video.description, 80);
  }

  // 1. Sudah ada file cache optimal
  if (existsSync(filePath)) {
    try {
      const st = statSync(filePath);
      if (st.size > 1000) return { filePath, title };
    } catch {}
  }

  // 2. File raw sudah tersedia (transcode berjalan asinkron di latar)
  if (existsSync(rawPath)) {
    try {
      const st = statSync(rawPath);
      if (st.size > 1000) return { filePath: rawPath, title };
    } catch {}
  }

  // 3. Deduplikasi in-flight download
  const existing = downloadPromises.get(`tt:${id}`);
  if (existing) {
    const p = await existing;
    return { filePath: p, title };
  }

  const promise = (async () => {
    let tt = await getTikTokVideo(id);
    if (!tt) {
      throw new Error("Video TikTok tidak ditemukan");
    }
    if (tt.title) title = tt.title;

    const fetchUpstream = async (targetUrl: string) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      try {
        const res = await fetch(targetUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            Referer: "https://www.tiktok.com/",
          },
        });
        clearTimeout(timer);
        return res;
      } catch (e) {
        clearTimeout(timer);
        throw e;
      }
    };

    let upstream = await fetchUpstream(tt.url).catch(() => null);
    if (!upstream || !upstream.ok || !upstream.body) {
      const fresh = await fetchTikTokFromTikwm(id);
      if (fresh) {
        tt = fresh;
        void updateCachedTikTokPlayUrl(id, fresh.url);
        upstream = await fetchUpstream(fresh.url).catch(() => null);
      }
    }

    if (!upstream || !upstream.ok) {
      throw new Error("Gagal mengunduh stream video TikTok");
    }

    const arrayBuffer = await upstream.arrayBuffer();
    await writeFile(rawPath, Buffer.from(arrayBuffer));

    const timer = setTimeout(() => {
      unlink(filePath).catch(() => {});
      unlink(rawPath).catch(() => {});
    }, 2 * 60 * 60 * 1000);
    if (typeof timer.unref === "function") timer.unref();

    // Jalankan optimasi di background tanpa menunda respon streaming awal
    void optimizeTikTokVideoAsync(rawPath, filePath);

    return rawPath;
  })().finally(() => {
    downloadPromises.delete(`tt:${id}`);
  });

  downloadPromises.set(`tt:${id}`, promise);
  const p = await promise;
  return { filePath: p, title };
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
      { timeout: 90_000 },
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

function serveVideoFile(
  filePath: string,
  request: Request,
  title: string,
  id: string,
  isDownload: boolean,
) {
  let stat;
  try {
    stat = statSync(filePath);
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
    const stream = createReadStream(filePath, { start, end });
    const webStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>;

    return new Response(webStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunksize),
        "Content-Type": "video/mp4",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  }

  const stream = createReadStream(filePath);
  const webStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>;

  const headers = new Headers({
    "Content-Length": String(fileSize),
    "Accept-Ranges": "bytes",
    "Content-Type": "video/mp4",
    "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
  });

  if (isDownload) {
    headers.set(
      "Content-Disposition",
      contentDisposition(`${title}.mp4`, `video-${id}.mp4`),
    );
  }

  return new Response(webStream, {
    status: 200,
    headers,
  });
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
    try {
      const ttResult = await ensureTikTokVideo(id);
      return serveVideoFile(ttResult.filePath, request, ttResult.title, id, isDownload);
    } catch (err) {
      reportServerError("/api/video", err, request);
      return new Response("Gagal memuat video TikTok", { status: 502 });
    }
  }

  // JALUR 2: YouTube Video
  try {
    const ytResult = await ensureYoutubeVideo(id);
    return serveVideoFile(ytResult.filePath, request, ytResult.title, id, isDownload);
  } catch (err) {
    reportServerError("/api/video", err, request);
    return new Response("Failed to download video", { status: 502 });
  }
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

  try {
    const res = isTiktokId ? await ensureTikTokVideo(id) : await ensureYoutubeVideo(id);
    const stat = statSync(res.filePath);
    return new Response(null, {
      status: 200,
      headers: {
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
        "Content-Type": "video/mp4",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
