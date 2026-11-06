/**
 * Dibuat otomatis saat server pertama kali jalan: pastikan token admin API
 * sudah ada di data/.admin-token (atau pakai AMF_ADMIN_TOKEN dari env).
 * Token tidak pernah dicetak ke log.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureAdminToken } = await import("./lib/api-keys");
    ensureAdminToken();
  }
}
