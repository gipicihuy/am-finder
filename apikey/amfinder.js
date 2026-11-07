#!/usr/bin/env node
/**
 * AM FINDER - API Key Generator & Manager
 * Bisa dijalankan di Termux (Android), VPS, atau PC tanpa perlu install npm module tambahan.
 *
 * Pemakaian interaktif:
 *   $ node apikey/amfinder.js
 *
 * Pemakaian CLI:
 *   $ node apikey/amfinder.js create "Nama" [--limit unlimited|50] [--days never|30]
 *   $ node apikey/amfinder.js list
 *   $ node apikey/amfinder.js revoke <id>
 *   $ node apikey/amfinder.js delete <id>
 */

const readline = require("node:readline");

const DEFAULT_BASE_URL = "https://amfinder.web.id";
const DEFAULT_ADMIN_TOKEN = "90e07b62b9dc2a68fd89daaab2398fd04d0a110432b623b0";

const BASE_URL = (process.env.AMF_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
const ADMIN_TOKEN = (process.env.AMF_ADMIN_TOKEN || DEFAULT_ADMIN_TOKEN).trim();

async function apiCall(method, endpoint, body) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(`Gagal terhubung ke server (${BASE_URL}): ${error.message}`);
  }

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const msg = data?.error || text || response.statusText;
    throw new Error(`Server Error (${response.status}): ${msg}`);
  }
  return data;
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function formatDate(epoch) {
  if (!epoch) return "Selamanya (Never)";
  try {
    return (
      new Date(epoch).toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      }) + " WIB"
    );
  } catch {
    return new Date(epoch).toISOString();
  }
}

async function handleInteractive() {
  while (true) {
    console.log("\n" + "═".repeat(45));
    console.log("   🚀 AM FINDER - API KEY GENERATOR");
    console.log(`   🌐 Server: ${BASE_URL}`);
    console.log("═".repeat(45));
    console.log("[1] Buat API Key Baru (Bebas / Unlimited)");
    console.log("[2] Buat API Key Custom (Bisa atur limit & durasi)");
    console.log("[3] Lihat Daftar API Key (List)");
    console.log("[4] Cabut / Revoke API Key");
    console.log("[5] Hapus Permanen API Key");
    console.log("[0] Keluar");
    console.log("═".repeat(45));

    const choice = await prompt("Pilih menu [1-5 / 0]: ");

    if (choice === "0") {
      console.log("👋 Sampai jumpa!");
      break;
    }

    if (choice === "1") {
      const name = await prompt("Masukkan nama / label pemegang key: ");
      if (!name) {
        console.log("❌ Nama tidak boleh kosong!");
        continue;
      }
      try {
        console.log("⏳ Sedang membuat key...");
        const res = await apiCall("POST", "/api/admin/keys", {
          name,
          dailyLimit: null,
          expiresAt: null,
        });
        console.log("\n" + "═".repeat(45));
        console.log("🎉 API KEY BEBAS BERHASIL DIBUAT!");
        console.log("═".repeat(45));
        console.log(`🔑 Key         : ${res.key}`);
        console.log(`👤 Nama        : ${res.data?.name}`);
        console.log(`📊 Limit       : Unlimited (Bebas / Tanpa batas)`);
        console.log(`⏳ Masa Aktif  : Selamanya`);
        console.log(`🆔 ID Key      : ${res.data?.id}`);
        console.log("═".repeat(45));
        console.log("⚠️  CATATAN: Simpan key di atas sekarang, karena hanya dimunculkan sekali!");
      } catch (err) {
        console.log(`❌ Gagal: ${err.message}`);
      }
    } else if (choice === "2") {
      const name = await prompt("Masukkan nama / label pemegang key: ");
      if (!name) {
        console.log("❌ Nama tidak boleh kosong!");
        continue;
      }
      const limitInput = await prompt("Limit harian (angka, misal: 100 atau tekan enter untuk unlimited): ");
      let dailyLimit = null;
      if (limitInput && limitInput.toLowerCase() !== "unlimited") {
        const num = Number(limitInput);
        if (Number.isInteger(num) && num >= 0) dailyLimit = num;
      }

      const daysInput = await prompt("Masa aktif hari (angka, misal: 30 atau tekan enter untuk selamanya): ");
      let expiresAt = null;
      if (daysInput && daysInput.toLowerCase() !== "never") {
        const days = Number(daysInput);
        if (Number.isFinite(days) && days > 0) {
          expiresAt = Date.now() + Math.floor(days * 86_400_000);
        }
      }

      try {
        console.log("⏳ Sedang membuat key...");
        const res = await apiCall("POST", "/api/admin/keys", {
          name,
          dailyLimit,
          expiresAt,
        });
        console.log("\n" + "═".repeat(45));
        console.log("🎉 API KEY CUSTOM BERHASIL DIBUAT!");
        console.log("═".repeat(45));
        console.log(`🔑 Key         : ${res.key}`);
        console.log(`👤 Nama        : ${res.data?.name}`);
        console.log(`📊 Limit       : ${dailyLimit === null ? "Unlimited" : dailyLimit + " /hari"}`);
        console.log(`⏳ Masa Aktif  : ${formatDate(expiresAt)}`);
        console.log(`🆔 ID Key      : ${res.data?.id}`);
        console.log("═".repeat(45));
        console.log("⚠️  CATATAN: Simpan key di atas sekarang!");
      } catch (err) {
        console.log(`❌ Gagal: ${err.message}`);
      }
    } else if (choice === "3") {
      try {
        console.log("⏳ Mengambil daftar key...");
        const res = await apiCall("GET", "/api/admin/keys");
        const list = res.keys || [];
        if (list.length === 0) {
          console.log("ℹ️ Belum ada API key yang dibuat.");
        } else {
          console.log(`\n📋 Total API Key: ${list.length}`);
          console.log("═".repeat(60));
          list.forEach((k, i) => {
            const status = k.revoked ? "🔴 Dicabut" : "🟢 Aktif";
            const lim = k.dailyLimit === null ? "Unlimited" : `${k.usedToday || 0}/${k.dailyLimit}`;
            console.log(`[${i + 1}] ${k.name} | Status: ${status}`);
            console.log(`    ID      : ${k.id}`);
            console.log(`    Prefix  : ${k.prefix}...`);
            console.log(`    Limit   : ${lim}`);
            console.log(`    Expired : ${formatDate(k.expiresAt)}`);
            console.log("-".repeat(60));
          });
        }
      } catch (err) {
        console.log(`❌ Gagal: ${err.message}`);
      }
    } else if (choice === "4") {
      const id = await prompt("Masukkan ID Key yang ingin dicabut (revoke): ");
      if (!id) continue;
      try {
        const res = await apiCall("PATCH", `/api/admin/keys/${encodeURIComponent(id)}`, { revoked: true });
        console.log(`✅ Sukses mencabut key ${id}!`);
      } catch (err) {
        console.log(`❌ Gagal: ${err.message}`);
      }
    } else if (choice === "5") {
      const id = await prompt("Masukkan ID Key yang ingin DIHAPUS PERMANEN: ");
      if (!id) continue;
      const confirm = await prompt(`Ketik 'Y' untuk mengonfirmasi hapus ID ${id}: `);
      if (confirm.toUpperCase() === "Y") {
        try {
          await apiCall("DELETE", `/api/admin/keys/${encodeURIComponent(id)}`);
          console.log(`✅ Sukses menghapus key ${id}!`);
        } catch (err) {
          console.log(`❌ Gagal: ${err.message}`);
        }
      } else {
        console.log("Dibatalkan.");
      }
    }
  }
}

async function handleCli(args) {
  const cmd = args[0];

  if (cmd === "list") {
    const res = await apiCall("GET", "/api/admin/keys");
    console.log(JSON.stringify(res.keys, null, 2));
    return;
  }

  if (cmd === "create") {
    let name = args[1];
    let limit = null;
    let days = null;

    for (let i = 1; i < args.length; i++) {
      if (args[i] === "--name" && args[i + 1]) name = args[++i];
      else if (args[i] === "--limit" && args[i + 1]) {
        const val = args[++i];
        limit = val === "unlimited" ? null : parseInt(val, 10);
      } else if (args[i] === "--days" && args[i + 1]) {
        const val = args[++i];
        days = val === "never" ? null : Date.now() + Math.floor(parseFloat(val) * 86_400_000);
      }
    }

    if (!name || name.startsWith("--")) {
      name = "Client-" + Math.random().toString(36).slice(2, 7);
    }

    const res = await apiCall("POST", "/api/admin/keys", {
      name,
      dailyLimit: limit,
      expiresAt: days,
    });
    console.log("✅ API Key berhasil dibuat:");
    console.log(JSON.stringify({ key: res.key, data: res.data }, null, 2));
    return;
  }

  if (cmd === "revoke") {
    const id = args[1];
    if (!id) throw new Error("ID key wajib diisi: node amfinder.js revoke <id>");
    const res = await apiCall("PATCH", `/api/admin/keys/${encodeURIComponent(id)}`, { revoked: true });
    console.log("✅ Key dicabut:", res.data);
    return;
  }

  if (cmd === "delete") {
    const id = args[1];
    if (!id) throw new Error("ID key wajib diisi: node amfinder.js delete <id>");
    await apiCall("DELETE", `/api/admin/keys/${encodeURIComponent(id)}`);
    console.log(`✅ Key ${id} berhasil dihapus.`);
    return;
  }

  console.log(`Perintah CLI:
  node amfinder.js create "Nama" [--limit unlimited|50] [--days never|30]
  node amfinder.js list
  node amfinder.js revoke <id>
  node amfinder.js delete <id>

Atau jalankan tanpa argumen untuk menu interaktif:
  node amfinder.js`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    await handleInteractive();
  } else {
    await handleCli(args);
  }
}

main().catch((err) => {
  console.error(`[Error] ${err.message}`);
  process.exit(1);
});
