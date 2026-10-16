import { readFileSync } from "node:fs";
import { join } from "node:path";

// Menyajikan thumbnail TikTok yang sudah diunduh sekali oleh lib/og-meta.ts.
// Bukan proxy: filenya baca dari disk, bukan ditarik ulang dari CDN tiap kali
// bot pratinjau minta. URL thumbnail asli bertanda tangan dan mati sekitar
// satu hari, jadi disimpan biar preview tetap utuh walau bot ambil ulang.
//
// Sengaja TIDAK di-Disallow di robots.txt — bot pratinjau harus tetap bisa
// mengambil gambar ini.

const ID_PATTERN = /^\d{15,20}$/;

function fail(status: number, why: string): Response {
  return new Response(why, { status, headers: { "x-og": why } });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  // URL-nya boleh dengan atau tanpa .jpg — yang dibuang dulu ekstensinya, lalu
  // id-nya divalidasi dengan pattern ketat yang sama seperti halaman preset
  // supaya jalur berkas tidak bisa lolos.
  const bare = id.endsWith(".jpg") ? id.slice(0, -4) : id;
  if (!ID_PATTERN.test(bare)) return fail(404, "bad-id");

  const file = join(process.cwd(), "data", "og-img", `${bare}.jpg`);
  let buf: Buffer;
  try {
    buf = readFileSync(file);
  } catch (e) {
    return fail((e as NodeJS.ErrnoException)?.code === "ENOENT" ? 404 : 500, "read-failed");
  }

  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "image/jpeg",
      "content-length": String(buf.length),
      // Gambar per video tidak berubah, aman dipanjangkan.
      "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
