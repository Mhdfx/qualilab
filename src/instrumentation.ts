/**
 * Server start (Next.js `register`, called once before the first request).
 *
 * Perf 3, P3-7: in production only, the PDF browser (`src/lib/pdf.ts`) is
 * started in the background, so the first PDF after a deploy is not slowed
 * by Chromium's launch. Never blocks the start and never fails it: nothing
 * is awaited but the module, and any error is only logged — the first PDF
 * then launches the browser itself, as before. Not during `next build`, nor
 * in development, nor on the Edge runtime.
 */
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    try {
      const { warmPdfBrowser } = await import("./lib/pdf");
      warmPdfBrowser();
    } catch (error) {
      console.error("[instrumentation] préchauffage PDF ignoré", { error });
    }
  }
}
