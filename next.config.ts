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

/**
 * Headers every response carries.
 *
 * The CSP deliberately stops short of `script-src`/`style-src`: the app inlines
 * a pre-hydration theme script, styles almost everything with the `style` prop,
 * and builds WebGL scenes at runtime — locking those down needs a nonce
 * pipeline, and a CSP that breaks the page is worse than none. What is here
 * closes the holes that need no allowlist: no plugins, no injected <base> to
 * re-root every relative URL, and no posting our forms to someone else's host.
 */
const BASE_SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    // Nothing here uses a camera, a mic, or the browser's payment sheet —
    // Stripe Checkout is a redirect to Stripe's own domain.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    // Two years, subdomains included. Production is HTTPS-only, so there is no
    // plaintext origin to lock ourselves out of. Left off the browser preload
    // list on purpose: getting removed from it takes months.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

/**
 * Clickjacking cover. Not applied to `/widget`, which exists to be iframed by
 * any restaurant's site, nor to the marketing pages, where a frame is harmless.
 */
const FRAME_DENY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

const FRAMEABLE_NEVER = ["/dashboard", "/onboarding", "/auth", "/pay"];

const nextConfig: NextConfig = {
  // Native canvas + pdf.js must stay external so Node can load the .node binary
  // and so our DOMMatrix polyfill runs before pdf.js evaluates `new DOMMatrix()`.
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist'],
  // A framework version in a header is free reconnaissance for anyone scanning
  // for known CVEs, and it buys us nothing.
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Everything, including the embedded widget.
        source: "/:path*",
        headers: BASE_SECURITY_HEADERS,
      },
      ...FRAMEABLE_NEVER.flatMap((prefix) => [
        { source: prefix, headers: FRAME_DENY_HEADERS },
        { source: `${prefix}/:path*`, headers: FRAME_DENY_HEADERS },
      ]),
      ...PROTECTED_PREFIXES.map((prefix) => ({
        source: `${prefix}/:path*`,
        headers: [
          { key: "Cache-Control", value: NO_STORE },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      })),
      {
        // The embed script is pasted onto third-party domains, so it has to be
        // fetchable cross-origin — and a stale copy is a stale launcher, so it
        // revalidates rather than sitting in a browser cache for a day.
        source: "/widget.js",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=600, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
