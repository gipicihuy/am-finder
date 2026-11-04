/**
 * Modul QRIS EMVCo & generator QRIS dinamis untuk AM Finder.
 * Payload statis asli: Dana / QRIS atas nama Azein (Kab. Bekasi).
 */

export const STATIC_QRIS_PAYLOAD =
  "00020101021126570011ID.DANA.WWW011893600915300740362602090074036260303UMI51440014ID.CO.QRIS.WWW0215ID10265000410780303UMI5204654053033605802ID5905Azein6011Kab. Bekasi6105176136304D378";

export const MERCHANT_NAME = "Azein";
export const MERCHANT_CITY = "Kab. Bekasi";
export const MIN_DONATION = 1_000;
export const MAX_DONATION = 10_000_000;

export const NOMINAL_PRESETS = [1_000, 2_000, 5_000, 10_000] as const;

/**
 * Menghitung CRC16-CCITT-FALSE (poly 0x1021, init 0xFFFF, no reflect, no xorout).
 * Sesuai spesifikasi EMVCo QR Code / QRIS.
 */
export function crc16CcittFalse(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    crc ^= code << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Memvalidasi apakah checksum 4 karakter terakhir sebuah payload QRIS valid.
 */
export function isValidQrisCrc(payload: string): boolean {
  if (!payload || payload.length < 8) return false;
  const data = payload.slice(0, -4);
  const expectedCrc = payload.slice(-4).toUpperCase();
  return crc16CcittFalse(data) === expectedCrc;
}

/**
 * Menghasilkan payload QRIS dinamis dengan nominal spesifik.
 * Aturan:
 * a. Ganti tag "010211" menjadi "010212" (point of initiation: statis -> dinamis).
 * b. Sisipkan tag amount 54 + panjang 2 digit + nominal tanpa titik/koma tepat sebelum "5802ID".
 * c. Buang CRC lama, hitung ulang CRC16-CCITT-FALSE atas seluruh string termasuk "6304", lalu tempel hasilnya.
 */
export function generateDynamicQris(amount: number, basePayload: string = STATIC_QRIS_PAYLOAD): string {
  const rounded = Math.round(amount);
  if (rounded < MIN_DONATION || rounded > MAX_DONATION) {
    throw new Error(`Nominal harus antara Rp${MIN_DONATION.toLocaleString("id-ID")} dan Rp${MAX_DONATION.toLocaleString("id-ID")}`);
  }

  const amtStr = rounded.toString();
  const amtLen = amtStr.length.toString().padStart(2, "0");
  const amtTag = `54${amtLen}${amtStr}`;

  // a. Ganti 010211 menjadi 010212
  let s = basePayload.replace("010211", "010212");

  // b. Sisipkan tag 54 tepat sebelum 5802ID
  const marker = "5802ID";
  const pos = s.indexOf(marker);
  if (pos === -1) {
    throw new Error("Tag 5802ID tidak ditemukan dalam payload QRIS");
  }
  s = s.slice(0, pos) + amtTag + s.slice(pos);

  // c. Buang CRC lama (4 karakter terakhir)
  s = s.slice(0, -4);

  // Hitung ulang CRC atas seluruh string termasuk "6304"
  const newCrc = crc16CcittFalse(s);
  return s + newCrc;
}

/**
 * Format angka ke format mata uang Rupiah standar (contoh: 5.000, 10.000).
 */
export function formatRupiah(value: number): string {
  return value.toLocaleString("id-ID");
}

/**
 * Membersihkan string input angka dari karakter selain digit.
 */
export function parseCleanNumber(input: string): number {
  const digits = input.replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : 0;
}
