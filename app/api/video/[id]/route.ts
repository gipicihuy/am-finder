import { createReadStream, existsSync, statSync } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

// Lock per video ID agar tidak download duplikat jika dipanggil bersamaan
const downloadPromises = new Map<string, Promise<string>>();

async function ensureYoutubeVideo(id: string): Promise<string> {
  const filePath = path.join(os.tmpdir(), `amf-yt-${id}.mp4`);
  if (existsSync(filePath)) {
    try {
      const st = statSync(filePath);
      if (st.size > 1000) return filePath;
    } catch {}
  }

  const existing = downloadPromises.get(id);
  if (existing) return existing;

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

    // Otomatis hapus file temp setelah 2 jam
    const timer = setTimeout(() => {
      unlink(filePath).catch(() => {});
    }, 2 * 60 * 60 * 1000);
    if (typeof timer.unref === "function") timer.unref();

    return filePath;
  })().finally(() => {
    downloadPromises.delete(id);
  });

  downloadPromises.set(id, promise);
  return promise;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!/^[\w-]{11}$/.test(id)) {
    return new Response("Invalid video ID", { status: 400 });
  }

  let filePath = "";
  try {
    filePath = await ensureYoutubeVideo(id);
  } catch {
    return new Response("Failed to download video", { status: 502 });
  }

  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    return new Response("Video file not found", { status: 404 });
  }

  const fileSize = stat.size;
  const range = request.headers.get("range");

  if (range) {
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
        "Cache-Control": "public, max-age=7200",
      },
    });
  }

  const stream = createReadStream(filePath);
  const webStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>;

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Length": String(fileSize),
      "Accept-Ranges": "bytes",
      "Content-Type": "video/mp4",
      "Cache-Control": "public, max-age=7200",
    },
  });
}

export async function HEAD(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!/^[\w-]{11}$/.test(id)) {
    return new Response(null, { status: 400 });
  }

  try {
    const filePath = await ensureYoutubeVideo(id);
    const stat = statSync(filePath);
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
