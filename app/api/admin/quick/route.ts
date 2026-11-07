import { blockIp, unblockIp } from "../../../../lib/blocklist";
import { verifyQuickSig, quickActionUrl } from "../../../../lib/security";
import { verifyAdminToken } from "../../../../lib/api-keys";
import { sendDiscordEmbed } from "../../../../lib/discord";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function htmlResponse(title: string, bodyContent: string, isSuccess = true): Response {
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — AM Finder</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #090d16;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #e2e8f0;
    }
    .card {
      background: #131c2e;
      border: 1px solid ${isSuccess ? "#1e293b" : "#7f1d1d"};
      border-radius: 16px;
      padding: 36px 28px;
      max-width: 460px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 40px -15px rgba(0,0,0,0.7);
    }
    .icon { font-size: 48px; margin-bottom: 12px; }
    h1 { font-size: 22px; font-weight: 700; margin: 0 0 12px; color: ${isSuccess ? "#f8fafc" : "#f87171"}; }
    p { font-size: 15px; line-height: 1.6; color: #94a3b8; margin: 0 0 20px; }
    .ip-box {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 17px;
      font-weight: 600;
      color: #38bdf8;
      background: #090d16;
      border: 1px solid #1e293b;
      padding: 10px 16px;
      border-radius: 8px;
      display: inline-block;
      margin-bottom: 24px;
    }
    .btn-group { display: flex; flex-direction: column; gap: 10px; }
    .btn {
      display: block;
      padding: 12px 20px;
      border-radius: 10px;
      text-decoration: none;
      font-weight: 600;
      font-size: 15px;
      transition: opacity 0.2s;
    }
    .btn-primary { background: #2563eb; color: #ffffff; }
    .btn-danger { background: #dc2626; color: #ffffff; }
    .btn-success { background: #059669; color: #ffffff; }
    .btn-secondary { background: #1e293b; color: #cbd5e1; }
    .btn:hover { opacity: 0.9; }
    .footer { margin-top: 24px; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    ${bodyContent}
    <div class="footer">AM Finder Security Quick-Action • Givy</div>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: isSuccess ? 200 : 401,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const act = url.searchParams.get("act") as "block" | "unblock" | null;
  const ip = url.searchParams.get("ip")?.trim() || "";
  const sig = url.searchParams.get("sig")?.trim() || "";
  const ttlRaw = Number(url.searchParams.get("ttl"));
  const ttl = Number.isFinite(ttlRaw) && ttlRaw > 0 ? Math.floor(ttlRaw) : 0;
  const token = url.searchParams.get("token")?.trim() || "";

  const wantsJson = (request.headers.get("accept") || "").includes("application/json");

  // Validasi keamanan: signature HMAC ATAU token admin
  const isSigValid = act ? verifyQuickSig(act, ip, ttl, sig) : false;
  const isTokenValid = Boolean(token && token === process.env.AMF_ADMIN_TOKEN?.trim());
  const isAdminHeaderValid = verifyAdminToken(request.headers);

  if (!isSigValid && !isTokenValid && !isAdminHeaderValid) {
    if (wantsJson) {
      return Response.json({ ok: false, error: "Tanda tangan keamanan tidak valid / tidak berizin" }, { status: 401 });
    }
    return htmlResponse(
      "Akses Ditolak",
      `
      <div class="icon">🔒</div>
      <h1>Akses Ditolak</h1>
      <p>Tautan tidak sah atau tanda tangan keamanan telah kedaluwarsa.</p>
      `,
      false,
    );
  }

  if (!ip) {
    if (wantsJson) return Response.json({ ok: false, error: "IP diperlukan" }, { status: 400 });
    return htmlResponse("Parameter Kurang", `<div class="icon">⚠️</div><h1>Parameter Kurang</h1><p>Alamat IP tidak disertakan.</p>`, false);
  }

  if (act === "block") {
    const res = blockIp(ip, "Quick Block via Discord Alert", ttl || null);
    if (!res.ok) {
      if (wantsJson) return Response.json({ ok: false, error: res.error }, { status: 400 });
      return htmlResponse(
        "Gagal Memblokir",
        `
        <div class="icon">❌</div>
        <h1>Gagal Memblokir IP</h1>
        <div class="ip-box">${ip}</div>
        <p>${res.error || "Alamat IP tidak valid atau dilindungi."}</p>
        `,
        false,
      );
    }

    // Beritahu channel security
    sendDiscordEmbed("security", {
      title: "🛡️ IP Berhasil Diblokir (Quick Action)",
      description: `Admin telah memblokir alamat IP \`${ip}\` lewat aksi 1-klik Discord.`,
      color: 0x27ae60, // Green
      fields: [
        { name: "🌐 IP", value: `\`${ip}\``, inline: true },
        { name: "⏱️ Durasi", value: ttl ? `${ttl} menit` : "Permanen", inline: true },
      ],
      timestamp: new Date().toISOString(),
    });

    if (wantsJson) {
      return Response.json({ ok: true, action: "block", ip, ttlMinutes: ttl || null, entry: res.entry });
    }

    const unblockUrl = quickActionUrl("unblock", ip, 0);
    return htmlResponse(
      "IP Berhasil Diblokir",
      `
      <div class="icon">🛡️</div>
      <h1>IP Berhasil Diblokir!</h1>
      <div class="ip-box">${ip}</div>
      <p>Alamat IP di atas telah diblokir <b>${ttl ? `${ttl} menit` : "secara permanen"}</b>. Seluruh request dari IP ini akan langsung ditahan dengan HTTP 403 Forbidden tanpa menyentuh proses berat.</p>
      <div class="btn-group">
        <a href="${unblockUrl}" class="btn btn-success">✅ Buka Blokir (Unblock)</a>
      </div>
      `,
      true,
    );
  }

  if (act === "unblock") {
    const res = unblockIp(ip);
    if (!res.ok) {
      if (wantsJson) return Response.json({ ok: false, error: res.error }, { status: 400 });
      return htmlResponse(
        "Gagal Buka Blokir",
        `
        <div class="icon">ℹ️</div>
        <h1>IP Tidak Dalam Blokir</h1>
        <div class="ip-box">${ip}</div>
        <p>${res.error || "IP ini tidak ditemukan dalam daftar blokir aktif."}</p>
        `,
        false,
      );
    }

    // Beritahu channel security
    sendDiscordEmbed("security", {
      title: "✅ IP Dilepas dari Blokir (Quick Action)",
      description: `Admin telah melepas blokir alamat IP \`${ip}\` lewat aksi 1-klik Discord.`,
      color: 0x3498db, // Blue
      fields: [{ name: "🌐 IP", value: `\`${ip}\``, inline: true }],
      timestamp: new Date().toISOString(),
    });

    if (wantsJson) {
      return Response.json({ ok: true, action: "unblock", ip });
    }

    const block1hUrl = quickActionUrl("block", ip, 60);
    return htmlResponse(
      "Blokir Berhasil Dibuka",
      `
      <div class="icon">✅</div>
      <h1>Blokir Berhasil Dibuka!</h1>
      <div class="ip-box">${ip}</div>
      <p>Alamat IP di atas kini dapat kembali mengakses layanan secara normal.</p>
      <div class="btn-group">
        <a href="${block1hUrl}" class="btn btn-danger">🚫 Blokir Kembali (1 Jam)</a>
      </div>
      `,
      true,
    );
  }

  return Response.json({ ok: false, error: "Aksi tidak dikenal ('act' harus 'block' atau 'unblock')" }, { status: 400 });
}
