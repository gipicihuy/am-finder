/**
 * Konfigurasi Sistem Monetisasi Iklan AM Finder
 *
 * Catatan:
 * - Iklan hanya diaktifkan untuk halaman Cari Preset (Search).
 * - Tanpa kotak/frame visual atau teks "IKLAN".
 * - Direct link dipicu pada klik kartu hasil pencarian.
 */

export interface AdsConfig {
  banner: {
    zoneId: string;
    scriptUrl: string;
    enabled: boolean;
  };
  directLink: {
    url: string;
    web: {
      enabled: boolean;
      cooldownMinutes: number;
    };
    android: {
      enabled: boolean;
      cooldownMinutes: number;
    };
  };
}

export const ADS_CONFIG: AdsConfig = {
  // Banner / In-Page Push (Monetag) - aktif khusus di halaman Search
  banner: {
    zoneId: "12197676",
    scriptUrl: "https://nap5k.com/tag.min.js",
    enabled: true,
  },

  // Direct Link (Monetag) - tiap klik hasil search langsung memicu direct link
  directLink: {
    url: "https://uplcm.com/4/12197668",
    web: {
      enabled: true,
      cooldownMinutes: 0,
    },
    android: {
      enabled: true,
      cooldownMinutes: 0,
    },
  },
};
