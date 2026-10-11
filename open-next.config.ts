import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Tanpa incremental cache: semua route dinamis, halaman lain statis dari assets.
export default defineCloudflareConfig();
