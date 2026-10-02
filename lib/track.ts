type TrackKind = "visit" | "search";

function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return (
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    headers.get("true-client-ip") ||
    "-"
  );
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function stamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export async function sendLog(
  kind: TrackKind,
  headers: Headers,
  extra: { path?: string; link?: string } = {}
): Promise<void> {
  const ip = clientIp(headers);
  const ua = (headers.get("user-agent") || "-").slice(0, 140);

  console.log(
    `[track] ${kind} ip=${ip} path=${extra.path || "-"} link=${extra.link || "-"}`
  );

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const head =
    kind === "visit"
      ? `🟢 <b>Visit</b>\npath: <code>${esc(extra.path || "/")}</code>`
      : `🔎 <b>Search</b>\nlink: <code>${esc(extra.link || "-")}</code>`;
  const text = `${head}\nip: <code>${esc(ip)}</code>\nua: ${esc(ua)}\n${stamp()}`;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    /* telegram lagi down: jangan ganggu request pengunjung */
  }
}
