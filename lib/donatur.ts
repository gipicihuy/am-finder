import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Donatur = {
  id: string;
  name: string;
  amount: number;
  message: string;
  date: string;
  source: "manual" | "sociabuzz";
};

export type DonaturSummary = {
  donators: Donatur[];
  top: Donatur[];
  monthly: Donatur[];
  monthLabel: string;
  totalAmount: number;
  totalPeople: number;
};

const DATA_DIR = join(process.cwd(), "data");
const DONATUR_FILE = join(DATA_DIR, "donatur.json");
const RAW_LOG_FILE = join(DATA_DIR, "webhook-raw.jsonl");

const MAX_MESSAGE = 140;
const MAX_NAME = 40;
const MAX_AMOUNT = 1_000_000_000;

function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

/**
 * Pesan donatur berasal dari input bebas, jadi dibersihkan dulu sebelum
 * ditampilkan: buang tag HTML, tautan, dan karakter kontrol supaya aman
 * dirender dan gak nyisipin link spam atau markup nyasar.
 */
export function sanitizeDonaturText(input: unknown, max = MAX_MESSAGE): string {
  if (typeof input !== "string") return "";
  const cleaned = collapseWhitespace(
    input
      .normalize("NFKC")
      .replace(/<[^>]*>/g, " ")
      .replace(/&[a-z#0-9]+;/gi, " ")
      .replace(/\b(?:https?|ftp|file|javascript|data|vbscript):\/\/?\S*/gi, " ")
      .replace(/\bwww\.\S+/gi, " ")
      .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202f]/g, " ")
  );
  if (!cleaned) return "";
  return cleaned.length > max ? `${cleaned.slice(0, max).trimEnd()}…` : cleaned;
}

/** Nama donatur dibersihkan sama seperti pesan, tapi lebih pendek. */
export function sanitizeDonaturName(input: unknown): string {
  const cleaned = sanitizeDonaturText(input, MAX_NAME);
  return cleaned || "Tanpa Nama";
}

/** Sociabuzz bisa ngirim nominal "Rp10.000", "10.000", atau angka polos. */
export function parseAmount(input: unknown): number {
  if (typeof input === "number" && Number.isFinite(input)) return clampAmount(input);
  if (typeof input !== "string") return 0;
  const digits = input.replace(/[^\d]/g, "");
  if (!digits) return 0;
  return clampAmount(Number(digits));
}

function clampAmount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), MAX_AMOUNT);
}

export function formatRupiah(amount: number): string {
  if (!amount) return "Rp0";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

const AVATAR_COLORS = [
  "#05FAA8",
  "#5AC8FA",
  "#FFBADE",
  "#FFD166",
  "#A78BFA",
  "#FF8A65",
  "#4ADE80",
  "#F472B6",
];

/** Inisial dari nama depan + huruf awal nama belakang. */
export function donorInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

/**
 * Warna avatar diturunkan dari nama supaya nama yang sama selalu dapat warna
 * yang sama, tanpa perlu menyimpan field avatar terpisah.
 */
export function donorColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Membaca data donatur dari file. Sengaja dibaca saat runtime (bukan saat
 * build) supaya build di worktree yang belum punya file ini tetap jalan.
 */
export function loadDonatur(): Donatur[] {
  try {
    if (!existsSync(DONATUR_FILE)) return [];
    const parsed = JSON.parse(readFileSync(DONATUR_FILE, "utf8"));
    const list = Array.isArray(parsed?.donators) ? parsed.donators : Array.isArray(parsed) ? parsed : [];
    return list
      .map((raw: Record<string, unknown>, index: number): Donatur => ({
        id: typeof raw?.id === "string" && raw.id ? raw.id : `manual-${index}`,
        name: sanitizeDonaturName(raw?.name),
        amount: parseAmount(raw?.amount),
        message: sanitizeDonaturText(raw?.message),
        date: typeof raw?.date === "string" && raw.date ? raw.date : new Date(0).toISOString(),
        source: raw?.source === "sociabuzz" ? "sociabuzz" : "manual",
      }))
      .filter((item: Donatur) => item.amount > 0 || item.message)
      .sort((a: Donatur, b: Donatur) => b.amount - a.amount || (a.date < b.date ? 1 : -1));
  } catch {
    return [];
  }
}

export function summarizeDonatur(donators: Donatur[]): DonaturSummary {
  const now = new Date();
  const byDateDesc = (a: Donatur, b: Donatur) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  const withAmount = donators.filter((item) => item.amount > 0);

  return {
    donators: donators.slice().sort(byDateDesc),
    top: withAmount.slice(0, 8),
    monthly: donators
      .filter((item) => isSameMonth(item.date, now))
      .sort((a, b) => b.amount - a.amount || byDateDesc(a, b)),
    monthLabel: monthLabel(now),
    totalAmount: withAmount.reduce((sum, item) => sum + item.amount, 0),
    totalPeople: donators.length,
  };
}

/** Nama bulan dalam Bahasa Indonesia, mis. "Oktober". */
export function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", { month: "long" }).format(date);
}

function isSameMonth(iso: string, ref: Date): boolean {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === ref.getFullYear() && date.getMonth() === ref.getMonth();
}

/**
 * Menyimpan payload webhook apa adanya — belum dipetakan ke field donatur
 * karena format Sociabuzz belum diketahui. Satu baris JSONL per request.
 */
export function appendRawWebhook(entry: Record<string, unknown>) {
  try {
    ensureDataDir();
    appendFileSync(RAW_LOG_FILE, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`, "utf8");
  } catch {
    // Log mentah bersifat sekunder; kegagalan menulis tidak boleh merusak request.
  }
}
