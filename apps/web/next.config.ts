import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// One .env for the whole monorepo: load the root file (API_URL, NEXT_PUBLIC_ROOT_DOMAIN, …).
// Values already set in the environment (e.g. on the hosting platform) take precedence.
const rootEnv = resolve(__dirname, "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@tashkeel/ui", "@tashkeel/i18n", "@tashkeel/contracts", "@tashkeel/core"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
