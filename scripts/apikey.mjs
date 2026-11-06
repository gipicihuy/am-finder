#!/usr/bin/env node
/**
 * CLI admin API key AM Finder.
 *
 * Script ini TIDAK menulis data/apikeys.json. Semua perubahan lewat endpoint
 * admin, karena cuma proses `next start` yang boleh menulis file itu.
 *
 * Token admin dibaca dari AMF_ADMIN_TOKEN, atau dari data/.admin-token.
 * Alamat server dari AMF_BASE_URL (default http://127.0.0.1:3000).
 */

import { readFileSync } from "node:fs";
import path from "node:path";

const BASE_URL = (process.env.AMF_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");

function adminToken() {
  const fromEnv = process.env.AMF_ADMIN_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  const file = path.join(process.cwd(), "data", ".admin-token");
  try {
    const saved = readFileSync(file, "utf8").trim();
    if (saved) return saved;
  } catch {
    /* ditangani di bawah */
  }
  throw new Error(
    `Token admin tidak ditemukan. Isi AMF_ADMIN_TOKEN atau pastikan ${file} sudah dibuat server.`,
  );
}

function parseOptions(args) {
  const opts = {};
  const rest = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const [key, inline] = arg.slice(2).split("=", 2);
      if (inline !== undefined) {
        opts[key] = inline;
      } else if (args[i + 1] !== undefined && !args[i + 1].startsWith("--")) {
        opts[key] = args[i + 1];
        i += 1;
      } else {
        opts[key] = true;
      }
    } else {
      rest.push(arg);
    }
  }
  return { opts, rest };
}

function parseLimit(value) {
  if (value === undefined || value === null || value === "unlimited") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error("--limit harus angka >= 0 atau 'unlimited'");
  }
  return number;
}

function parseDays(value) {
  if (value === undefined || value === null || value === "never") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error("--days harus angka > 0 atau 'never'");
  }
  return Date.now() + Math.floor(number * 86_400_000);
}

async function call(method, endpoint, body) {
  const token = adminToken();
  let response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(`Gagal menghubungi ${BASE_URL}: ${error.message}`);
  }

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data && typeof data.error === "string" ? data.error : text || response.statusText;
    throw new Error(`HTTP ${response.status}: ${message}`);
  }
  return data;
}

function usage() {
  console.log(`Pemakaian:
  node scripts/apikey.mjs create --name "Nama" [--limit 50|unlimited] [--days 30|never] [--contact "..."]
  node scripts/apikey.mjs list
  node scripts/apikey.mjs revoke <id>
  node scripts/apikey.mjs update <id> [--limit 50|unlimited] [--days 30|never] [--revoke|--unrevoke]

Contoh:
  node scripts/apikey.mjs create --name "Bot Partner" --limit 50 --days 30
  node scripts/apikey.mjs list
  node scripts/apikey.mjs revoke ab12cd34ef567890

Token admin dibaca dari AMF_ADMIN_TOKEN atau data/.admin-token.
Alamat server: AMF_BASE_URL (default http://127.0.0.1:3000).`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args.shift();

  if (!command || command === "help" || command === "--help" || command === "-h") {
    usage();
    return;
  }

  if (command === "create") {
    const { opts } = parseOptions(args);
    const name = typeof opts.name === "string" ? opts.name.trim() : "";
    if (!name) throw new Error("--name wajib diisi");

    const body = {
      name,
      contact: typeof opts.contact === "string" ? opts.contact : null,
      dailyLimit: parseLimit(opts.limit),
      expiresAt: parseDays(opts.days),
    };
    const result = await call("POST", "/api/admin/keys", body);
    console.log("API key berhasil dibuat:");
    console.log(JSON.stringify(result.data, null, 2));
    console.log("\nKey asli (hanya ditampilkan sekali, simpan sekarang):");
    console.log(result.key);
    return;
  }

  if (command === "list") {
    const result = await call("GET", "/api/admin/keys");
    console.log(JSON.stringify(result.keys, null, 2));
    return;
  }

  if (command === "revoke") {
    const { rest } = parseOptions(args);
    const id = rest[0];
    if (!id) throw new Error("id key wajib diisi");
    const result = await call("PATCH", `/api/admin/keys/${encodeURIComponent(id)}`, {
      revoked: true,
    });
    console.log("Key dicabut:");
    console.log(JSON.stringify(result.data, null, 2));
    return;
  }

  if (command === "update") {
    const { opts, rest } = parseOptions(args);
    const id = rest[0];
    if (!id) throw new Error("id key wajib diisi");

    const patch = {};
    if (Object.prototype.hasOwnProperty.call(opts, "limit")) {
      patch.dailyLimit = parseLimit(opts.limit);
    }
    if (Object.prototype.hasOwnProperty.call(opts, "days")) {
      patch.expiresAt = parseDays(opts.days);
    }
    if (opts.revoke === true) patch.revoked = true;
    if (opts.unrevoke === true) patch.revoked = false;
    if (Object.keys(patch).length === 0) {
      throw new Error("tidak ada yang diubah (pakai --limit, --days, --revoke, atau --unrevoke)");
    }

    const result = await call("PATCH", `/api/admin/keys/${encodeURIComponent(id)}`, patch);
    console.log("Key diperbarui:");
    console.log(JSON.stringify(result.data, null, 2));
    return;
  }

  throw new Error(`Perintah tidak dikenal: ${command}`);
}

main().catch((error) => {
  console.error(`[apikey] ${error.message}`);
  process.exitCode = 1;
});
