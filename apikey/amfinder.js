#!/usr/bin/env node
// AM Finder - API key manager (Termux / CLI). Tanpa dependency, butuh Node 18+.
//
// Pakai:
//   node amfinder.js                          menu interaktif
//   node amfinder.js new                      key acak, unlimited, tanpa kedaluwarsa
//   node amfinder.js new mykey-12345678       key buatan sendiri (12-64 karakter: huruf/angka/_/-)
//   node amfinder.js new --free               key acak, 50/hari, berlaku 30 hari
//   node amfinder.js new KEY --limit 100 --days 7
//   node amfinder.js list                     daftar key (bernomor)
//   node amfinder.js revoke 2                 cabut key (nomor, id, atau prefix)
//   node amfinder.js delete 2                 hapus permanen
//   node amfinder.js token                    ganti token admin yang tersimpan
//
// Ditulis sebagai CommonJS supaya jalan di semua versi Node tanpa warning.
// Token admin TIDAK ditulis di file ini. Urutan: env AMF_ADMIN_TOKEN, lalu
// ~/.amfinder.json (dibuat otomatis saat pertama dijalankan, permission 600).

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");

const CONFIG_PATH = path.join(os.homedir(), ".amfinder.json");
const DEFAULT_BASE_URL = "https://amfinder.web.id";
const FREE_LIMIT = 50;
const FREE_DAYS = 30;
const DAY_MS = 86_400_000;

const rl = readline.createInterface({ input: stdin, output: stdout });
const ask = async (question) => (await rl.question(question)).trim();

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) || {};
  } catch {
    return {};
  }
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(CONFIG_PATH, 0o600);
  } catch {
    // sistem file tertentu (mis. FAT) tidak mendukung chmod, abaikan
  }
}

async function loadSettings({ resetToken = false } = {}) {
  const config = readConfig();
  const baseUrl = (process.env.AMF_BASE_URL || config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  let token = resetToken ? "" : (process.env.AMF_ADMIN_TOKEN || config.token || "").trim();

  if (!token) {
    console.log("Token admin belum ada. Isi sekali, nanti disimpan di " + CONFIG_PATH);
    token = await ask("Token admin: ");
    if (!token) throw new Error("Token admin wajib diisi.");
    writeConfig({ ...config, token });
    console.log("Token tersimpan.\n");
  }
  return { baseUrl, token };
}

let SETTINGS = null;

async function api(method, endpoint, body) {
  let response;
  try {
    response = await fetch(`${SETTINGS.baseUrl}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${SETTINGS.token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(`Tidak bisa terhubung ke ${SETTINGS.baseUrl}: ${error.message}`);
  }

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (response.status === 401) {
    throw new Error("Token admin ditolak server. Jalankan: node amfinder.js token");
  }
  if (!response.ok) {
    throw new Error(data?.error || text || `HTTP ${response.status}`);
  }
  return data;
}

function formatDate(epoch) {
  if (!epoch) return "selamanya";
  return (
    new Date(epoch).toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    }) + " WIB"
  );
}

const limitText = (limit) => (limit === null || limit === undefined ? "unlimited" : `${limit}/hari`);

function parseLimit(value) {
  if (value === undefined || value === "" || /^(unlimited|u|-)$/i.test(value)) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error("Limit harus angka bulat >= 0, atau 'unlimited'.");
  return n;
}

function parseDays(value) {
  if (value === undefined || value === "" || /^(never|n|-)$/i.test(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Hari harus lebih dari 0, atau 'never'.");
  return Date.now() + Math.floor(n * DAY_MS);
}

async function createKey({ key, dailyLimit, expiresAt }) {
  const res = await api("POST", "/api/admin/keys", {
    key: key || undefined,
    dailyLimit,
    expiresAt,
  });

  const testUrl = `${SETTINGS.baseUrl}/api/public/v1/find?url=LINK_VIDEO&apikey=${res.key}`;
  console.log("\nKEY BERHASIL DIBUAT");
  console.log("-".repeat(46));
  console.log(`Key    : ${res.key}`);
  console.log(`Limit  : ${limitText(dailyLimit)}`);
  console.log(`Berlaku: ${formatDate(expiresAt)}`);
  console.log(`ID     : ${res.data?.id}`);
  console.log("-".repeat(46));
  console.log("Contoh tes (ganti LINK_VIDEO):");
  console.log(testUrl);
  if (!key) console.log("\nKey acak hanya ditampilkan sekali, simpan sekarang.");
}

async function fetchKeys() {
  return (await api("GET", "/api/admin/keys")).keys || [];
}

async function listKeys() {
  const keys = await fetchKeys();
  if (!keys.length) {
    console.log("Belum ada key.");
    return;
  }
  console.log(`\n${keys.length} key\n`);
  keys.forEach((k, i) => {
    const status = k.revoked ? "DICABUT" : k.expiresAt && Date.now() >= k.expiresAt ? "KEDALUWARSA" : "aktif";
    const used = k.dailyLimit === null ? "unlimited" : `${k.usedToday ?? 0}/${k.dailyLimit} hari ini`;
    console.log(`[${i + 1}] ${k.prefix}...  ${status}`);
    console.log(`    ${used} | sampai ${formatDate(k.expiresAt)} | id ${k.id}`);
  });
}

// Terima nomor (dari `list`), id lengkap, atau prefix key.
async function resolveKey(ref) {
  if (!ref) throw new Error("Sebutkan nomor, id, atau prefix key (lihat: node amfinder.js list).");
  const keys = await fetchKeys();
  if (/^\d+$/.test(ref) && Number(ref) >= 1 && Number(ref) <= keys.length) return keys[Number(ref) - 1];
  const matches = keys.filter((k) => k.id === ref || k.prefix === ref || k.id.startsWith(ref));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error("Referensi ambigu, pakai nomor atau id lengkap.");
  throw new Error(`Key "${ref}" tidak ditemukan.`);
}

async function revokeKey(ref) {
  const k = await resolveKey(ref);
  await api("PATCH", `/api/admin/keys/${encodeURIComponent(k.id)}`, { revoked: true });
  console.log(`Key ${k.prefix}... (id ${k.id}) dicabut.`);
}

async function deleteKey(ref) {
  const k = await resolveKey(ref);
  await api("DELETE", `/api/admin/keys/${encodeURIComponent(k.id)}`);
  console.log(`Key ${k.prefix}... (id ${k.id}) dihapus permanen.`);
}

function parseNewArgs(params) {
  let key = null;
  let limit = null;
  let expiresAt = null;
  for (let i = 0; i < params.length; i++) {
    const arg = params[i];
    if (arg === "--free") {
      limit = FREE_LIMIT;
      expiresAt = Date.now() + FREE_DAYS * DAY_MS;
    } else if (arg === "--limit") {
      limit = parseLimit(params[++i]);
    } else if (arg === "--days") {
      expiresAt = parseDays(params[++i]);
    } else if (!arg.startsWith("--") && !key) {
      key = arg;
    } else {
      throw new Error(`Argumen tidak dikenal: ${arg}`);
    }
  }
  return { key, dailyLimit: limit, expiresAt };
}

async function interactive() {
  for (;;) {
    console.log("\n=== AM FINDER - API KEY ===");
    console.log(`Server: ${SETTINGS.baseUrl}`);
    console.log("1) Buat key");
    console.log("2) Daftar key");
    console.log("3) Cabut key");
    console.log("4) Hapus key");
    console.log("0) Keluar");
    const choice = await ask("> ");

    try {
      if (choice === "1") {
        const key = await ask("Key (Enter = acak): ");
        const limit = parseLimit(await ask("Limit per hari (Enter = unlimited): "));
        const expiresAt = parseDays(await ask("Berlaku berapa hari (Enter = selamanya): "));
        await createKey({ key, dailyLimit: limit, expiresAt });
      } else if (choice === "2") {
        await listKeys();
      } else if (choice === "3") {
        await listKeys();
        await revokeKey(await ask("Nomor/id key yang dicabut: "));
      } else if (choice === "4") {
        await listKeys();
        const ref = await ask("Nomor/id key yang dihapus: ");
        if (ref && (await ask("Yakin hapus permanen? (y/N): ")).toLowerCase() === "y") await deleteKey(ref);
      } else if (choice === "0" || choice.toLowerCase() === "q") {
        return;
      } else {
        console.log("Pilihan tidak valid.");
      }
    } catch (error) {
      console.log(`Gagal: ${error.message}`);
    }
  }
}

const HELP = `AM Finder - API key manager

  node amfinder.js                     menu interaktif
  node amfinder.js new [KEY] [--free] [--limit 50|unlimited] [--days 30|never]
  node amfinder.js list
  node amfinder.js revoke <nomor|id|prefix>
  node amfinder.js delete <nomor|id|prefix>
  node amfinder.js token               ganti token admin tersimpan

KEY kosong = acak. KEY buatan sendiri: 12-64 karakter (huruf, angka, _ atau -).
--free = 50/hari, berlaku 30 hari.`;

async function main() {
  const [command, ...params] = process.argv.slice(2);

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }

  SETTINGS = await loadSettings({ resetToken: command === "token" });
  if (command === "token") {
    console.log("Token admin diperbarui.");
    return;
  }

  switch (command) {
    case undefined:
      await interactive();
      break;
    case "new":
    case "create":
      await createKey(parseNewArgs(params));
      break;
    case "list":
      await listKeys();
      break;
    case "revoke":
      await revokeKey(params[0]);
      break;
    case "delete":
      await deleteKey(params[0]);
      break;
    default:
      console.log(HELP);
      process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(`[Error] ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
