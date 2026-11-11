import type { NextConfig } from "next";

const buildId = process.env.BUILD_ID || Date.now().toString(36);

const nextConfig: NextConfig = {
  generateBuildId: async () => buildId,
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  async headers() {
    return [
      {
        source: "/suggest.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, stale-while-revalidate=3600",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
