import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Status kuota harian tikwm (10.000 request/hari) dalam satu file bersama.
 *
 * Berkas ini dibaca oleh scraper (lib/amfinder.js, proses terpisah per
 * request), pencarian (lib/ttsearch.js), dan preview OG — supaya begitu
 * satu pihak melihat kuota habis, pihak lain ikut berhenti mencoba.
 *
 * Tanpa ini, selama kuota habis tiap pencarian/tiap paste link tetap
 * membakar request yang sudah pasti ditolak — justru yang bikin kuota
 * tak pernah sempat pulih.
 */

const FILE = path.join(process.cwd(), 'data', 'tikwm-quota.json')
const MIN_MS = 15 * 60 * 1000
const MAX_MS = 60 * 60 * 1000

/** Pesan kuota harian tikwm, bukan batas per-detik. */
export function isDailyQuotaMsg (msg) {
  return /request\s*\/\s*\d+\s*day/i.test(String(msg || ''))
}

function readState () {
  try {
    const s = JSON.parse(readFileSync(FILE, 'utf8'))
    return s && typeof s === 'object' ? s : {}
  } catch {
    return {}
  }
}

/** Sisa waktu jeda, dalam milidetik. 0 artinya boleh coba. */
export function quotaBlockedMs () {
  const s = readState()
  return typeof s.until === 'number' ? Math.max(0, s.until - Date.now()) : 0
}

export function quotaBlockedMinutes () {
  return Math.ceil(quotaBlockedMs() / 60000)
}

/**
 * Tandai kuota harian habis. Mengembalikan true kalau pesannya memang kuota
 * harian (kalau bukan — misal batas 1 request/detik — jangan dijeda, biar
 * pencarian tetap bisa lanjut dengan jeda normal).
 *
 * Jeda digandakan tiap kali masih terdeteksi habis, supaya makin jarang
 * menyia-nyiakan request, tapi tetap pulih secepat mungkin setelah kuota
 * tikwm reset.
 */
export function noteDailyQuota (msg) {
  if (!isDailyQuotaMsg(msg)) return false
  const s = readState()
  const prev = typeof s.dur === 'number' && s.dur > 0 ? s.dur : 0
  const dur = Math.min(prev ? prev * 2 : MIN_MS, MAX_MS)
  try {
    mkdirSync(path.dirname(FILE), { recursive: true })
    writeFileSync(FILE, JSON.stringify({ until: Date.now() + dur, dur }))
  } catch {}
  return true
}
