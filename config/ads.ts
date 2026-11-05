/**
 * Konfigurasi Sistem Monetisasi Iklan AM Finder
 *
 * Catatan:
 * - Seluruh fitur default OFF (false) agar tidak mengganggu stabilitas sebelum diaktifkan secara sengaja.
 * - Banner (In-Page Push) dan Direct Link terpisah dan independen 100%.
 */

export interface AdsConfig {
  banner: {
    zoneId: string;
    scriptUrl: string;
    slots: {
      slotA_detailVideo: boolean;
      slotB_searchPreset: boolean;
      slotC_homePage: boolean;
    };
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
  // Banner / In-Page Push (Monetag)
  banner: {
    zoneId: "12197676",
    scriptUrl: "https://nap5k.com/tag.min.js",
    slots: {
      slotA_detailVideo: false, // Slot A: Halaman detail video, setelah Preset Links
      slotB_searchPreset: false, // Slot B: Tab Cari Preset, setelah daftar hasil & show more
      slotC_homePage: false,     // Slot C: Beranda, setelah Step by Step
    },
  },

  // Direct Link (Monetag)
  directLink: {
    url: "https://uplcm.com/4/12197668",
    web: {
      enabled: false,
      cooldownMinutes: 10,
    },
    android: {
      enabled: false,
      cooldownMinutes: 10,
    },
  },
};

export type AdSlotKey = keyof AdsConfig["banner"]["slots"];
