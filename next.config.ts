import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * The system holds health results and client data, so the browser is told
 * explicitly not to frame it, not to sniff types, and not to leak the URL of a
 * sample or a report to third parties through the referer.
 *
 * HSTS is only meaningful over HTTPS and is emitted in production, where the
 * app sits behind the domain's certificate.
 */
const securityHeaders = [
  // The lab tool must never be embedded in another site (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // Do not let the browser second-guess a declared content type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // A report URL contains a sample id — keep it off third-party servers.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here needs the camera, microphone or location.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const productionHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

/**
 * The logos in /public (the tab's icon, the sidebar's, the documents'):
 * kept a day, then revalidated in the background, instead of a conditional
 * request on every page (.ui-tests/perf/plan.md P2-8). A new logo shows
 * within a day.
 */
const LOGO_CACHE = [
  { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: {
    position: "bottom-right",
  },
  // A self-contained build for the VPS: smaller image, faster start.
  output: "standalone",
  // `src/app/favicon.ico` (Next's default icon) is gone (P2-8): the layout
  // declares the PNG logo. A client that still asks for /favicon.ico gets
  // that logo instead of a render of the « page introuvable » (review of the
  // lot performance). Temporary (307), so a real icon can come back.
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/qualilab-logo-nobg.png", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers:
          process.env.NODE_ENV === "production"
            ? [...securityHeaders, ...productionHeaders]
            : securityHeaders,
      },
      { source: "/qualilab-logo.png", headers: LOGO_CACHE },
      { source: "/qualilab-logo-nobg.png", headers: LOGO_CACHE },
    ];
  },
};

export default nextConfig;
