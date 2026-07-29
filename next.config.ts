import type { NextConfig } from "next";

import { PROTECTED_PREFIXES } from "./lib/auth-routes";

/**
 * Signed-in pages must never sit in a cache. The proxy sets this too, but the
 * dev server overwrites the proxy's Cache-Control with its own `no-cache`,
 * which still lets a back/forward navigation reuse the stored page — that is
 * how a logged-out owner could see their dashboard again by pressing Back.
 * Declared here it survives in both dev and production.
 */
const NO_STORE = "no-store, no-cache, must-revalidate, max-age=0";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@napi-rs/canvas'],
  async headers() {
    return PROTECTED_PREFIXES.map((prefix) => ({
      source: `${prefix}/:path*`,
      headers: [
        { key: "Cache-Control", value: NO_STORE },
        { key: "Pragma", value: "no-cache" },
        { key: "Expires", value: "0" },
      ],
    }));
  },
};

export default nextConfig;
