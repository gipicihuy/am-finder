import { limitHeaders, tooManyRequests } from "../../../../../lib/rate-limit";
import {
  deleteApiKey,
  updateApiKey,
  verifyAdminToken,
  type ApiKeyPatch,
} from "../../../../../lib/api-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

function unauthorized(): Response {
  return Response.json(
    { ok: false, error: "unauthorized" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

function notFound(): Response {
  return Response.json(
    { ok: false, error: "key tidak ditemukan" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

function badRequest(message: string): Response {
  return Response.json(
    { ok: false, error: message },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request, context: Context) {
  const limit = limitHeaders(request.headers, "admin");
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);
  if (!verifyAdminToken(request.headers)) return unauthorized();

  const { id } = await context.params;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return badRequest("body JSON tidak valid");
  }
  const data = body as Record<string, unknown>;
  const patch: ApiKeyPatch = {};

  if (Object.prototype.hasOwnProperty.call(data, "dailyLimit") || Object.prototype.hasOwnProperty.call(data, "limit")) {
    const value = Object.prototype.hasOwnProperty.call(data, "dailyLimit")
      ? data.dailyLimit
      : data.limit;
    if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
      return badRequest("dailyLimit harus angka >= 0 atau null");
    }
    patch.dailyLimit = value === null ? null : Math.floor(value as number);
  }

  if (Object.prototype.hasOwnProperty.call(data, "expiresAt")) {
    const value = data.expiresAt;
    if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value <= 0)) {
      return badRequest("expiresAt harus epoch milidetik atau null");
    }
    patch.expiresAt = value === null ? null : Math.floor(value as number);
  }

  if (Object.prototype.hasOwnProperty.call(data, "revoked")) {
    if (typeof data.revoked !== "boolean") return badRequest("revoked harus boolean");
    patch.revoked = data.revoked;
  }

  if (Object.keys(patch).length === 0) {
    return badRequest("tidak ada field yang bisa diubah");
  }

  const updated = updateApiKey(id, patch);
  if (!updated) return notFound();

  return Response.json(
    { ok: true, data: updated },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: Request, context: Context) {
  const limit = limitHeaders(request.headers, "admin");
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);
  if (!verifyAdminToken(request.headers)) return unauthorized();

  const { id } = await context.params;
  if (!deleteApiKey(id)) return notFound();

  return Response.json(
    { ok: true, deleted: id },
    { headers: { "Cache-Control": "no-store" } },
  );
}
