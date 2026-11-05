/**
 * Konfigurasi Sistem Iklan AM Finder
 *
 * Menggunakan Google AdSense resmi:
 * ca-pub-7137191663908391
 */

export interface AdsConfig {
  googleAdsense: {
    client: string;
    enabled: boolean;
  };
  monetag: {
    enabled: boolean;
  };
}

export const ADS_CONFIG: AdsConfig = {
  googleAdsense: {
    client: "ca-pub-7137191663908391",
    enabled: true,
  },
  monetag: {
    enabled: false,
  },
};
