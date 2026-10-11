// CF-Connecting-IP ditulis Cloudflare di edge dan di-strip kalau dikirim klien
// (tes langsung: spoof CF-Connecting-IP kena 403 error 1000), jadi dia yang paling
// bisa dipercaya. Nilai pertama x-forwarded-for bisa dipalsukan klien — jangan
// dipakai buat identitas.
export function clientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return (headers.get("x-real-ip") || headers.get("true-client-ip") || "").trim() || "-";
}

export function isPrivateIp(ip: string): boolean {
  return (
    ip === "::1" ||
    ip === "-" ||
    ip === "unknown" ||
    /^(::ffff:)?(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)
  );
}
