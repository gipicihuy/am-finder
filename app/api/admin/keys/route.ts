import { limitHeaders, tooManyRequests } from "../../../../lib/rate-limit";
import { createApiKey, listApiKeys, verifyAdminToken } from "../../../../lib/api-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized(): Response {
  return Response.json(
    { ok: false, error: "unauthorized" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

function readLimit(value: unknown): { ok: true; value: number | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return { ok: false };
  return { ok: true, value: Math.floor(value) };
}

function readExpires(value: unknown): { ok: true; value: number | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return { ok: false };
  return { ok: true, value: Math.floor(value) };
}

export async function GET(request: Request) {
  const limit = limitHeaders(request.headers, "admin");
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);
  if (!verifyAdminToken(request.headers)) return unauthorized();

  return Response.json(
    { ok: true, keys: listApiKeys() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const limit = limitHeaders(request.headers, "admin");
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);
  if (!verifyAdminToken(request.headers)) return unauthorized();

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      { ok: false, error: "body JSON tidak valid" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const data = body as Record<string, unknown>;

  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!name) {
    return Response.json(
      { ok: false, error: "name wajib diisi" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const limitValue = readLimit(
    Object.prototype.hasOwnProperty.call(data, "dailyLimit") ? data.dailyLimit : data.limit,
  );
  if (!limitValue.ok) {
    return Response.json(
      { ok: false, error: "dailyLimit harus angka >= 0 atau null" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const expiresValue = readExpires(data.expiresAt);
  if (!expiresValue.ok) {
    return Response.json(
      { ok: false, error: "expiresAt harus epoch milidetik atau null" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const contact =
    typeof data.contact === "string" && data.contact.trim() ? data.contact.trim() : null;

  const created = createApiKey({
    name,
    contact,
    dailyLimit: limitValue.value,
    expiresAt: expiresValue.value,
  });

  // Key asli hanya dikembalikan sekali di respons ini, tidak pernah di log.
  return Response.json(
    { ok: true, key: created.key, data: created.record },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
